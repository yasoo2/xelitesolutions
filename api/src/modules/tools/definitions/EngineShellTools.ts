/**
 * THE AGENT ENGINE'S SHELL: A COMMAND THAT ENDS, OR A PROCESS THAT STAYS.
 *
 * The engine (core/engine) gives its model two ways to run something, and
 * the difference is the whole contract:
 *
 *   - engine_shell_run waits for ONE command to END and says how it ended:
 *     the exit code, the time, the first and last lines it printed, and where
 *     the full log was saved. Installs, builds, tests, scripts.
 *   - engine_shell_start starts a process that STAYS (a dev server, an API, a
 *     watcher), waits until an address it serves ANSWERS, and keeps it in the
 *     run's registry. engine_shell_logs reads what it printed,
 *     engine_shell_stop ends it with every process it started, and the end of
 *     the run ends whatever is left.
 *
 * Every process starts through ExecutionGateway.startManaged, so the
 * orchestration firewall and the kernel's supervision apply. Version probes
 * and the tree kills go through ExecutionGateway.execute.
 *
 * The rules, each with the failure it prevents:
 *
 *   - The project folder comes from the ToolService context and is checked
 *     against the active workspace; the model only names folders inside it.
 *   - A child gets Joe's environment WITHOUT anything that looks like a
 *     secret, and without the settings of Joe's own process (its port, its
 *     mode, its own folders). Generated code, its dependencies and its dev
 *     servers run with whatever the shell hands them; Joe's own API keys
 *     are not theirs, and Joe's port is not theirs to bind.
 *   - The exit code is the command's own. Windows PowerShell 5.1 with
 *     -Command reports 1 for every failure (measured: `node -e
 *     "process.exit(3)"` exited 1), so one line after the command turns the
 *     last status into the real code.
 *   - Output is bounded and says what it left out; the full text is on disk.
 *   - A test command that ran no test is not a pass, whatever its exit code.
 *   - An address is reported only after it answered. A port that was busy
 *     before the process started belongs to someone else.
 *   - A stopped command is stopped whole: everything it started dies with it
 *     (see "killing what a command started").
 *
 * Run-scoped state only: the registry is keyed by the run and removed when
 * the run ends. Nothing here walks the filesystem synchronously.
 */
import { promises as fsp, constants as fsConstants } from 'fs';
import type { FileHandle } from 'fs/promises';
import http from 'http';
import https from 'https';
import path from 'path';
import type { ToolDefinition, ToolExecutionResult, ToolPermission } from '../types';
import { ExecutionGateway } from '../../../kernel/ExecutionGateway';
import { executionFirewall } from '../../../orchestration/AgentExecutionFirewall';
import { workspaceService } from '../../services/WorkspaceService';
import { requestResourceManager } from '../../../core/resources/RequestResourceManager';
import { broadcastTerminalLine } from '../../../api/ws';
import { isSecretName, projectRootProblem, resolveInProject } from '../../../core/engine/workspace';
import { isWithinRoot } from '../path-containment';
import { NETWORK_INSTALL_TIMEOUTS, installProgressProbe } from '../../../shared/network-install-timeouts';
import { isRunnerSummaryLine, isTestRunCommand, judgeTestRun } from '../../../core/quality/test-run-evidence';
import { redactSecretsFromString } from '../../../shared/utils/redaction';
import { HTTP_ANSWER_TIMEOUT_MS, isLoopbackPortOpen } from './ProjectRunTool';
import type { CommandFact, ProcessInfo } from '../../../core/engine/types';
import type { MachineFacts } from '../../../core/engine/prompt';

/* ───────────────────────── limits ───────────────────────── */

/** One command's ceiling when the model names none. Installs get the network-install budget. */
export const DEFAULT_COMMAND_TIMEOUT_MS = 300_000;
/** How long engine_shell_start waits for an address to answer. */
export const DEFAULT_READY_TIMEOUT_MS = 90_000;
/** What the model reads of a long command output: its first and last lines. */
const HEAD_LINES = 20;
const TAIL_LINES = 60;
const SHOWN_LINE_CHARS = 300;
/** What a background process keeps in memory; the full output is on disk. */
const KEPT_LINES = 400;
const KEPT_LINE_CHARS = 1_000;
const TERMINAL_LINE_CHARS = 1_000;
const LOG_LINES_DEFAULT = 60;
/** A stopped process gets this long to close before it is killed harder. */
const STOP_GRACE_MS = 3_000;
/** How long a stop waits to see the process gone. */
const STOP_WAIT_MS = 5_000;
/**
 * The kernel's own ceiling stands this far behind the limit kept here. The
 * limit is enforced here, where the whole tree can be killed (see Root); the
 * kernel's ceiling only catches a stop that itself never finished.
 */
export const KERNEL_BACKSTOP_MS = 30_000;
const READY_POLL_MS = 500;
const PROBE_TIMEOUT_MS = 30_000;
/** taskkill and the process query, given what a loaded machine needs (measured: 4.7 s and 12–30 s). */
const TREE_KILL_TIMEOUT_MS = 30_000;
const PROCESS_QUERY_TIMEOUT_MS = 60_000;

const PROCESS_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/u;
const WINDOWS = process.platform === 'win32';

/* ───────────────────────── the shell ───────────────────────── */

const POWERSHELL_FLAGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];

/** Every shell this file starts carries it, so a pid can be checked to be still one of ours. */
const SHELL_MARK = '# joe-engine-shell';

/**
 * The line before the command. Without it PowerShell's own output is written
 * in the console's code page and Arabic text arrives as mojibake (measured:
 * `Write-Output 'مرحبا'` came back as «ꩥ��»); a native program's bytes pass
 * through either way. The progress preference keeps cmdlets from writing
 * progress records into the output. The mark ends the line as a comment.
 */
const POWERSHELL_BEFORE = `try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}; $OutputEncoding = [System.Text.Encoding]::UTF8; $ProgressPreference = 'SilentlyContinue' ${SHELL_MARK}`;
/**
 * The line after it: the last command's status becomes the exit code, as a
 * POSIX shell reports it. A native command that failed keeps its own code; a
 * failed cmdlet is 1; an `exit N` in the command never reaches this line.
 * Because the command starts on the second line, an error position the shell
 * prints ("At line:2") is one line lower than in the command itself.
 */
const POWERSHELL_AFTER = 'if ($?) { exit 0 } elseif ($LASTEXITCODE) { exit $LASTEXITCODE } else { exit 1 }';

export function powershellScript(command: string): string {
    return `${POWERSHELL_BEFORE}\n${command}\n${POWERSHELL_AFTER}`;
}

interface PosixShell { shell: string; setsid: string | null }
let posixShellMemo: Promise<PosixShell> | null = null;

async function isExecutable(file: string): Promise<boolean> {
    try { await fsp.access(file, fsConstants.X_OK); return true; } catch { return false; }
}

/**
 * bash, or sh where bash is missing. On Linux the command also starts in its
 * own process group through setsid(1), because the kernel's kill reaches
 * only the direct child on POSIX: `npm run dev` is npm → sh → vite, and
 * killing npm alone leaves vite holding the port. A group is killed whole.
 */
function posixShell(): Promise<PosixShell> {
    if (!posixShellMemo) {
        posixShellMemo = (async () => {
            const shell = (await isExecutable('/bin/bash')) ? '/bin/bash' : '/bin/sh';
            let setsid: string | null = null;
            if (process.platform === 'linux') {
                for (const candidate of ['/usr/bin/setsid', '/bin/setsid']) {
                    if (await isExecutable(candidate)) { setsid = candidate; break; }
                }
            }
            return { shell, setsid };
        })();
    }
    return posixShellMemo;
}

interface Launch { file: string; args: string[]; group: boolean }

async function launchFor(command: string): Promise<Launch> {
    if (WINDOWS) return { file: 'powershell.exe', args: [...POWERSHELL_FLAGS, powershellScript(command)], group: false };
    const { shell, setsid } = await posixShell();
    //  setsid(1) runs the shell in place (no fork: a child Node starts is never
    //  a group leader), so the pid the kernel reports is the group's id.
    return setsid
        ? { file: setsid, args: [shell, '-c', command], group: true }
        : { file: shell, args: ['-c', command], group: false };
}

/* ───────────────────────── killing what a command started ───────────────────────── */

/** Signal a whole process group (POSIX). True when the group exists. */
function signalGroup(pid: number | undefined, signal: NodeJS.Signals | 0): boolean {
    if (!pid || WINDOWS) return false;
    try { process.kill(-pid, signal); return true; } catch (e: any) { return e?.code === 'EPERM'; }
}

function processAlive(pid: number | undefined): boolean {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; }
}

/**
 * Cleanup of a run's processes belongs to that run, wherever it is called
 * from: the end of a request scope runs outside the orchestration context
 * (AgentLoopService enters it deeper down). A root records the context it was
 * started in, and its own cleanup re-enters it; a process can only have been
 * started inside an authorised context, so there is always one to re-enter.
 */
interface RunOwner { traceId?: string; userId?: string; sessionId?: string; runId?: string }

function currentOwner(): RunOwner | undefined {
    const store = executionFirewall.context.getStore();
    return store?.isOrchestrator ? { traceId: store.traceId, userId: store.userId, sessionId: store.sessionId, runId: store.runId } : undefined;
}

function asRun<T>(owner: RunOwner | undefined, fn: () => Promise<T>): Promise<T> {
    if (executionFirewall.context.getStore()?.isOrchestrator || !owner) return fn();
    return executionFirewall.runInContext(owner.traceId, fn, owner);
}

/**
 * THE ROOT OF WHAT A COMMAND STARTED, AND HOW TO KILL EVERYTHING UNDER IT.
 *
 * The kernel's handle can kill() a tree, but on Windows it gives `taskkill
 * /T /F` two seconds and then kills taskkill itself. Measured on a loaded
 * laptop: one taskkill of a PowerShell → node tree took 4.7 s, so every kill
 * ended PowerShell and left the node server serving with its parent gone
 * (eight such servers after one test run). So the tree is killed here, with
 * the time taskkill needs, by identity and never by a pid alone:
 *
 *   - A root is watched while it runs. Until it has been seen gone, its pid
 *     is its own (the kernel's handle holds the process, so Windows cannot
 *     give the pid away), and its whole tree is killed by that pid.
 *   - Once it has been seen gone, its pid is never killed again: Windows
 *     hands pids to the next process. What it started may still hold its
 *     output pipe. Those children are found by their parent's pid; the ones
 *     created after the root, and before any process that has since taken
 *     that pid, are its own, and each is killed with its tree.
 *   - POSIX: a command in its own group is killed by the group's id, which no
 *     new process can take while any member of the group lives.
 */
interface Root {
    pid?: number;
    group: boolean;
    /** When the root was asked for. */
    spawnedAt: number;
    owner?: RunOwner;
    /** The kernel's kill: it acts on its own child object, so it never reaches a reused pid. */
    kill: () => void;
    /** When the root was first seen gone. */
    goneAt?: number;
    watch?: ReturnType<typeof setInterval>;
}

function newRoot(group: boolean): Root {
    return { group, spawnedAt: Date.now(), owner: currentOwner(), kill: () => { /* replaced once the process exists */ } };
}

function watchRoot(root: Root): void {
    if (!root.pid || root.watch) return;
    root.watch = setInterval(() => {
        if (root.goneAt === undefined && !processAlive(root.pid)) root.goneAt = Date.now();
    }, 1000);
    root.watch.unref?.();
}

function unwatchRoot(root: Root): void {
    if (root.watch) clearInterval(root.watch);
    root.watch = undefined;
    if (root.goneAt === undefined) root.goneAt = Date.now();
}

/**
 * `taskkill /T /F` of a pid and its tree. With `image`, only while that pid
 * is still a process of that program: a root is watched once a second, so
 * between its exit and the watch seeing it gone, Windows may already have
 * given its pid to another program (measured: a pid that is not the named
 * image is left alone, «No tasks running with the specified criteria»).
 */
async function taskkillTree(pid: number, image?: string): Promise<void> {
    const args = ['/PID', String(Math.floor(pid)), ...(image ? ['/FI', `IMAGENAME eq ${image}`] : []), '/T', '/F'];
    try {
        await ExecutionGateway.execute('taskkill', args, { timeout: TREE_KILL_TIMEOUT_MS, windowsHide: true, shell: false });
    } catch { /* refused by the firewall: the kernel's kill is what is left */ }
}

/** Every root this file starts on Windows is this program (launchFor). */
const WINDOWS_SHELL_IMAGE = 'powershell.exe';

/** Windows, a root that is gone: kill the children it left, each with its tree (see Root). */
async function killWindowsOrphans(root: Root): Promise<void> {
    if (!WINDOWS || !root.pid) return;
    const pid = Math.floor(root.pid);
    //  The mark is spelled in two halves, so this query never carries it.
    const script = [
        `$root = ${pid}`,
        "$mark = '# joe-engine' + '-shell'",
        '$owner = Get-CimInstance Win32_Process -Filter "ProcessId=$root" -ErrorAction SilentlyContinue',
        "if ($owner) { 'owner ' + ([DateTimeOffset]$owner.CreationDate).ToUnixTimeMilliseconds() + ' ' + [int]([string]$owner.CommandLine).Contains($mark) }",
        "Get-CimInstance Win32_Process -Filter \"ParentProcessId=$root\" -ErrorAction SilentlyContinue | ForEach-Object { 'child ' + $_.ProcessId + ' ' + ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }",
    ].join('; ');
    let text = '';
    try {
        const r: any = await ExecutionGateway.execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
            { timeout: PROCESS_QUERY_TIMEOUT_MS, windowsHide: true, shell: false });
        text = String(r?.data?.output || '');
    } catch { return; }
    let owner: { ms: number; ours: boolean } | null = null;
    const children: Array<{ pid: number; ms: number }> = [];
    for (const raw of text.split(/\r?\n/u)) {
        const line = raw.trim();
        const o = line.match(/^owner (\d+) ([01])$/u);
        if (o) owner = { ms: Number(o[1]), ours: o[2] === '1' };
        const c = line.match(/^child (\d+) (\d+)$/u);
        if (c) children.push({ pid: Number(c[1]), ms: Number(c[2]) });
    }
    const since = root.spawnedAt - 1_500;
    //  A root that is, after all, still this process: its tree.
    if (owner && owner.ours && owner.ms >= since && owner.ms <= root.spawnedAt + 5_000) {
        await taskkillTree(pid, WINDOWS_SHELL_IMAGE);
        return;
    }
    const orphans = children.filter(c => c.ms >= since && c.ms < (owner ? owner.ms : Infinity)).map(c => c.pid);
    await Promise.all(orphans.map(child => taskkillTree(child)));
}

/** Kill a root and everything under it. Returns whether the root was still running. */
async function killRootTree(root: Root): Promise<boolean> {
    const alive = root.goneAt === undefined && processAlive(root.pid);
    if (WINDOWS) {
        await asRun(root.owner, () => (alive ? taskkillTree(root.pid!, WINDOWS_SHELL_IMAGE) : killWindowsOrphans(root)));
        return alive;
    }
    if (root.group) signalGroup(root.pid, 'SIGKILL');
    else root.kill();
    return alive;
}

/* ───────────────────────── the child's environment ───────────────────────── */

const SECRET_ENV_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASS|PRIVATE|CREDENTIAL|COOKIE|SESSION|AUTH|MONGO|DATABASE/iu;
/** An address that carries a password: `postgres://user:pw@host`, a proxy with credentials. */
const CREDENTIAL_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]+@/iu;
/**
 * A value shaped like a credential, whatever the variable is called: the
 * published prefixes of API keys and tokens (the `sk-` model API keys,
 * GitHub `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`/`github_pat_`, Groq `gsk_`,
 * Hugging Face `hf_`, Slack `xox?-`, AWS `AKIA`/`ASIA`, Google `AIza`), a
 * signed JWT, and a PEM private key.
 */
const CREDENTIAL_VALUE = /^(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gsk_[A-Za-z0-9]{20,}|hf_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|A(?:KIA|SIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+)$|-----BEGIN [A-Z ]*PRIVATE KEY-----/u;

/** A variable a child must not see: its name says it is a secret, or its value is one (an address with a password, a token). */
export function isSecretEnv(name: string, value: string | undefined): boolean {
    if (SECRET_ENV_NAME.test(name)) return true;
    if (typeof value !== 'string') return false;
    const v = value.trim();
    return CREDENTIAL_URL.test(v) || CREDENTIAL_VALUE.test(v);
}

/**
 * JOE'S OWN PROCESS SETTINGS ARE NOT THE PROJECT'S.
 *
 * Joe is started with its own port and mode (start-joe.ps1 sets PORT=5002
 * and NODE_ENV=development; a server sets NODE_ENV=production), and npm, when
 * it starts Joe (`npm start`), describes that invocation in npm_* variables:
 * Joe's package, its script, and the install settings it was given. A child
 * that inherits them is configured as Joe: a generated server's
 * `process.env.PORT || 3000` binds Joe's own port and dies with EADDRINUSE,
 * and `npm install` under NODE_ENV=production (or npm_config_omit=dev) leaves
 * out devDependencies, so the project's build tools are never installed.
 * Joe's JOE_* settings name Joe's own folders (its data and chat store) and
 * policies; a project has no use for them. A child gets PORT only when the
 * model names a port, and the project decides its own mode.
 *
 * npm's configuration of the MACHINE stays: its registry, a proxy, a CA
 * (NPM_CONFIG_REGISTRY on a server behind a mirror). An install needs it, and
 * it is the machine's, not Joe's. Only the npm settings that decide what an
 * install writes and where are removed.
 */
const JOE_PROCESS_ENV = /^(?:PORT|NODE_ENV|INIT_CWD|JOE_.*|npm_(?:lifecycle_.*|package_.*|command|execpath|node_execpath)|npm_config_(?:prefix|local_prefix|cache|global|production|omit|include|only|argv|workspaces?))$/iu;

/** A variable that describes Joe's own process rather than the machine. */
export function isJoeProcessEnv(name: string): boolean {
    return JOE_PROCESS_ENV.test(name);
}

/**
 * Non-interactive, colourless, UTF-8, and on loopback: what an agent's
 * commands need, whatever runs them. HOST keeps a server a command starts off
 * the network (a host Joe was started with, 0.0.0.0 on a server, would expose
 * every generated app).
 */
const CHILD_SETTINGS: Readonly<Record<string, string>> = Object.freeze({
    CI: '1',
    BROWSER: 'none',
    FORCE_COLOR: '0',
    HOST: '127.0.0.1',
    npm_config_yes: 'true',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    npm_config_update_notifier: 'false',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
});

/**
 * The overrides the kernel merges over process.env. A secret, and a setting
 * of Joe's own process, is set to undefined, which removes it from the
 * child's environment entirely (a child of a clean machine sees no such name,
 * so a project's own `process.env.SESSION_SECRET ?? 'dev'` and
 * `process.env.PORT || 3000` fallbacks still work).
 */
export function childEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const names = Object.keys(process.env);
    for (const name of names) {
        if (isSecretEnv(name, process.env[name]) || isJoeProcessEnv(name)) env[name] = undefined;
    }
    for (const [name, value] of Object.entries({ ...CHILD_SETTINGS, ...extra })) {
        env[name] = value;
        //  Windows names are case-insensitive: a differently cased copy of the
        //  same variable must not keep its old value beside the new one.
        if (WINDOWS) {
            for (const other of names) if (other !== name && other.toLowerCase() === name.toLowerCase()) env[other] = value;
        }
    }
    return env;
}

/* ───────────────────────── what a command may name ───────────────────────── */

/**
 * The file tools never read or write a secret-bearing file (.env, keys,
 * credential stores; workspace.ts). A command that names one would print it
 * into the model's context, so it is refused by the same rule.
 */
export function secretFileNamedIn(command: string): string | null {
    for (const token of String(command).split(/[\s"'`;|&<>(){}[\],=+]+/u)) {
        const name = (token.split(/[\\/]/u).pop() || '').replace(/^[@:]+/u, '');
        if (name && isSecretName(name)) return name;
    }
    return null;
}

const INSTALL_COMMAND = /(?:^|[\s;&|(])(?:(?:npm|pnpm|bun)\s+(?:install|i|ci|add)\b|yarn(?:\s+(?:install|add)\b|\s*(?=$|[;&|)]))|(?:pip3?|python[\d.]*\s+-m\s+pip|py(?:\s+-[\d.]+)?\s+-m\s+pip)\s+install\b)/iu;

/** npm/pnpm/yarn/bun install|ci|add, pip install: work whose progress is files, not lines. */
export function isInstallCommand(command: string): boolean {
    return INSTALL_COMMAND.test(String(command || ''));
}

/** A folder change (`cd client`, `Set-Location -Path client`) or a package manager's folder flag (`--prefix`, `--dir`, `--cwd`, `-C`). */
const INSTALL_FOLDER = /(?:^|[\s;&|(])(?:(cd|CD|chdir|pushd|sl|[Ss]et-[Ll]ocation)\s+(?:-(?:[Ll]iteral)?[Pp]ath\s+)?|(?:--prefix|--dir|--cwd|-C)(?:=|\s+))("[^"]+"|'[^']+'|[^\s;&|()]+)/gu;

/**
 * The folders an install command writes into besides its cwd: the model
 * often writes `cd client; npm install` or `npm install --prefix client`
 * instead of passing cwd, and npm on a pipe is silent, so a probe that
 * watched only the cwd would see no progress and the install would be
 * stopped as idle while it was still writing. Only folders inside the
 * project are watched.
 */
export function installFoldersOf(root: string, cwdAbs: string, command: string): string[] {
    const folders = [cwdAbs];
    let current = cwdAbs;
    for (const m of String(command).matchAll(INSTALL_FOLDER)) {
        const raw = m[2].replace(/^(["'])(.*)\1$/u, '$2');
        if (!raw || raw === '-' || /^[$~%]/u.test(raw)) continue;
        const abs = path.resolve(current, raw);
        if (!isWithinRoot(abs, root)) continue;
        if (m[1]) current = abs;
        folders.push(abs);
    }
    return [...new Set(folders)];
}

/** The folders an install writes: node_modules, any --cache it was given, a project venv, yarn's cache, in each folder it installs into. */
function installProbeFor(root: string, cwdAbs: string, command: string): () => Promise<string> {
    const args = String(command).split(/\s+/u).filter(Boolean);
    const watched: string[] = [];
    for (const folder of installFoldersOf(root, cwdAbs, command)) {
        for (const sub of ['node_modules', '.venv', 'venv', '.yarn']) watched.push('--cache', path.join(folder, sub));
    }
    return installProgressProbe(cwdAbs, [...args, ...watched]);
}

/* ───────────────────────── bounded output ───────────────────────── */

const ANSI = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-Z\\-_])/gu;

function plain(line: string): string {
    return String(line).replace(ANSI, '');
}

function clip(line: string, max: number): string {
    return line.length <= max ? line : `${line.slice(0, max)} … [${line.length - max} more characters]`;
}

/** The last `max` lines, each clipped to `lineMax` characters, and the count of all of them. */
class Ring {
    private lines: string[] = [];
    private start = 0;
    total = 0;
    constructor(private readonly max: number, private readonly lineMax: number) {}
    push(line: string): void {
        this.total++;
        const kept = clip(line, this.lineMax);
        if (this.lines.length < this.max) { this.lines.push(kept); return; }
        this.lines[this.start] = kept;
        this.start = (this.start + 1) % this.max;
    }
    get size(): number { return this.lines.length; }
    last(n: number): string[] {
        const ordered = [...this.lines.slice(this.start), ...this.lines.slice(0, this.start)];
        return ordered.slice(Math.max(0, ordered.length - n));
    }
}

/** The first and the last lines of an output, and how many were left between them. */
class HeadTail {
    readonly head: string[] = [];
    private readonly tail: Ring;
    total = 0;
    constructor(private readonly headMax: number, tailMax: number, private readonly lineMax: number) {
        this.tail = new Ring(tailMax, lineMax);
    }
    push(line: string): void {
        this.total++;
        if (this.head.length < this.headMax) this.head.push(clip(line, this.lineMax));
        else this.tail.push(line);
    }
    tailLines(): string[] { return this.tail.last(this.tail.size); }
    get omitted(): number { return this.total - this.head.length - this.tail.size; }
    allShown(): string[] { return [...this.head, ...this.tailLines()]; }
}

/* ───────────────────────── the full log on disk ───────────────────────── */

function slugOf(text: string): string {
    const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+/u, '').slice(0, 40).replace(/-+$/u, '');
    return slug || 'command';
}

async function nextLogNumber(dir: string): Promise<number> {
    let max = 0;
    try {
        for (const name of await fsp.readdir(dir)) {
            const m = name.match(/^(\d+)-/u);
            if (m) max = Math.max(max, Number(m[1]));
        }
    } catch { /* an unreadable folder starts the numbering again; `wx` still refuses to overwrite */ }
    return max + 1;
}

/**
 * `<project>/.joe/logs/<n>-<slug>.log`, written as the lines arrive, in
 * batches. The number continues what the folder already holds, so a resumed
 * project keeps its earlier logs, and `wx` never overwrites one.
 */
class LogFile {
    private chain: Promise<void> = Promise.resolve();
    private pending = '';
    private scheduled = false;
    private constructor(private handle: FileHandle | null, readonly rel: string | null, public error: string | null) {}

    static async open(root: string, label: string): Promise<LogFile> {
        //  The engine's own folder, checked like any other path: a `.joe`
        //  that is a link would carry the log out of the project.
        const where = await resolveInProject(root, '.joe/logs', 'list');
        if (!where.ok) return new LogFile(null, null, where.error);
        if (where.exists && !where.isDir) return new LogFile(null, null, '.joe/logs is a file, not a folder');
        try {
            await fsp.mkdir(where.abs, { recursive: true });
            let n = await nextLogNumber(where.abs);
            for (let attempt = 0; attempt < 50; attempt++, n++) {
                const name = `${String(n).padStart(4, '0')}-${slugOf(label)}.log`;
                try {
                    const handle = await fsp.open(path.join(where.abs, name), 'wx');
                    return new LogFile(handle, `.joe/logs/${name}`, null);
                } catch (e: any) {
                    if (e?.code !== 'EEXIST') throw e;
                }
            }
            return new LogFile(null, null, 'no free log file name');
        } catch (e: any) {
            return new LogFile(null, null, String(e?.code || e?.message || e));
        }
    }

    write(line: string): void {
        if (!this.handle) return;
        this.pending += `${line}\n`;
        if (this.scheduled) return;
        this.scheduled = true;
        this.chain = this.chain.then(() => this.flush());
    }

    private async flush(): Promise<void> {
        this.scheduled = false;
        const text = this.pending;
        this.pending = '';
        if (!text || !this.handle) return;
        try { await this.handle.write(text); } catch (e: any) { this.error = String(e?.code || e?.message || e); }
    }

    async close(): Promise<void> {
        await this.chain;
        if (this.pending) await this.flush();
        const handle = this.handle;
        this.handle = null;
        if (handle) { try { await handle.close(); } catch { /* the bytes were written */ } }
    }
}

/* ───────────────────────── the owner's terminal panel ───────────────────────── */

/** Lines for the visible terminal, sent in small batches rather than one message per line. */
class TerminalSink {
    private lines: string[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    constructor(private readonly sessionId: string | undefined) {}
    say(line: string): void {
        if (!this.sessionId) return;
        this.lines.push(clip(line, TERMINAL_LINE_CHARS));
        if (this.lines.length >= 64) { this.flush(); return; }
        if (!this.timer) {
            this.timer = setTimeout(() => this.flush(), 100);
            this.timer.unref?.();
        }
    }
    flush(): void {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (!this.lines.length || !this.sessionId) return;
        const text = `${this.lines.join('\r\n')}\r\n`;
        this.lines = [];
        try { broadcastTerminalLine(this.sessionId, text); } catch { /* the panel is a view, never a dependency */ }
    }
}

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

/* ───────────────────────── where a call runs ───────────────────────── */

interface Scope { root: string; cwdAbs: string; cwdRel: string }

/** The project folder from the ToolService context, inside the workspace, and the model's folder inside it. */
async function resolveScope(context: any, cwdArg: unknown): Promise<Scope | { error: string }> {
    const projectRoot = context?.projectRoot;
    let activeRoot: string;
    try { activeRoot = workspaceService.getActiveRoot(context?.workspaceId); } catch (e: any) {
        return { error: `The workspace could not be resolved (${String(e?.message || e)}).` };
    }
    const problem = projectRootProblem(projectRoot, activeRoot);
    if (problem) return { error: problem };
    const where = await resolveInProject(projectRoot, cwdArg, 'list');
    if (!where.ok) return { error: where.error };
    if (!where.exists) return { error: `The folder "${where.rel}" does not exist in the project folder.` };
    if (!where.isDir) return { error: `"${where.rel}" is a file, not a folder.` };
    let root: string;
    try { root = await fsp.realpath(projectRoot); } catch { return { error: 'The project folder does not exist.' }; }
    return { root, cwdAbs: where.abs, cwdRel: where.rel };
}

function promptLabel(scope: Scope): string {
    const base = path.basename(scope.root) || scope.root;
    return scope.cwdRel === '.' ? base : `${base}/${scope.cwdRel}`;
}

function cancellationOf(context: any): Promise<void> | undefined {
    const c = context?.cancellation;
    return c && typeof c.then === 'function' ? c : undefined;
}

function isCancelled(context: any): boolean {
    try { return context?.isCancelled?.() === true; } catch { return false; }
}

function sessionIdOf(context: any): string | undefined {
    const s = String(context?.sessionId || '').trim();
    return s || undefined;
}

function runIdOf(context: any): string {
    return String(context?.runId || '').trim();
}

function deadlineOf(input: any, context: any): number | undefined {
    const raw = Number(input?.deadline_at ?? context?.deadlineAt);
    return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

function seconds(ms: number): string {
    return (ms / 1000).toFixed(1);
}

function wholeSeconds(ms: number): string {
    return String(Math.round(ms / 1000));
}

type Result = ToolExecutionResult & { logsStreamedLive?: boolean };

function refuse(text: string): Result {
    return { ok: false, error: text, output: { text }, logs: [text] };
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => { const t = setTimeout(resolve, ms); t.unref?.(); });
}

/** Resolves true when `p` settles within `ms`. */
async function settlesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), ms); });
    try { return await Promise.race([p.then(() => true, () => true), late]); } finally { if (timer) clearTimeout(timer); }
}

/* ───────────────────────── engine_shell_run ───────────────────────── */

type Ending =
    | { kind: 'exit'; exitCode: number }
    | { kind: 'timeout'; exitCode: 124 }
    | { kind: 'idle'; exitCode: 124 }
    | { kind: 'cancelled'; exitCode: 130 }
    | { kind: 'signal'; exitCode: null }
    | { kind: 'not-started'; exitCode: null; error: string };

function endingOf(r: { exitCode: number | null; error?: string }, stoppedBy: 'timeout' | 'cancelled' | null): Ending {
    //  The limit and the cancel are kept here; what the kernel then reports is how the kill looked to it.
    if (stoppedBy === 'timeout') return { kind: 'timeout', exitCode: 124 };
    if (stoppedBy === 'cancelled') return { kind: 'cancelled', exitCode: 130 };
    if (r.exitCode === 124 && r.error === 'timeout') return { kind: 'timeout', exitCode: 124 };
    if (r.exitCode === 124 && r.error === 'idle_timeout') return { kind: 'idle', exitCode: 124 };
    if (r.exitCode === 130 && r.error === 'cancelled') return { kind: 'cancelled', exitCode: 130 };
    if (r.exitCode === null && r.error) return { kind: 'not-started', exitCode: null, error: r.error };
    if (r.exitCode === null) return { kind: 'signal', exitCode: null };
    return { kind: 'exit', exitCode: r.exitCode };
}

function positiveSeconds(v: unknown): number | undefined | 'invalid' {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : 'invalid';
}

const NO_AND_AND = /is not a valid statement separator in this version/u;

export async function runShellCommand(input: any, context: any): Promise<Result> {
    const command = typeof input?.command === 'string' ? input.command.trim() : '';
    if (!command) return refuse('engine_shell_run needs a "command" to run.');
    const scope = await resolveScope(context, input?.cwd);
    if ('error' in scope) return refuse(scope.error);
    const secret = secretFileNamedIn(command);
    if (secret) return refuse(`The command names "${secret}", a file that holds secrets; the engine never reads or writes one. Use a .env.example with placeholder values instead.`);
    if (isCancelled(context)) return refuse('The run was stopped; the command was not started.');

    const requested = positiveSeconds(input?.timeout_seconds);
    if (requested === 'invalid') return refuse('"timeout_seconds" must be a positive number of seconds.');
    const install = isInstallCommand(command);
    const ceiling = requested ?? (install ? NETWORK_INSTALL_TIMEOUTS.absoluteMs : DEFAULT_COMMAND_TIMEOUT_MS);
    const deadlineAt = deadlineOf(input, context);
    const left = deadlineAt === undefined ? Infinity : deadlineAt - Date.now();
    if (left <= 0) return refuse('The run\'s deadline has passed; the command was not started.');
    const timeoutMs = Math.max(1, Math.floor(Math.min(ceiling, left)));
    const byDeadline = left < ceiling;

    const shown = redactSecretsFromString(command);
    const startedAt = Date.now();
    const log = await LogFile.open(scope.root, command);
    const launch = await launchFor(command);
    //  The run may have been stopped while the log was being opened.
    if (isCancelled(context)) {
        log.write(`# not started: the run was stopped · ${shown}`);
        await log.close();
        return refuse('The run was stopped; the command was not started.');
    }
    const terminal = new TerminalSink(sessionIdOf(context));
    terminal.say(`${CYAN}${promptLabel(scope)} $ ${shown}${RESET}`);
    log.write(`$ ${shown}`);
    log.write(`# in ${scope.cwdRel} · started ${new Date(startedAt).toISOString()}`);

    const output = new HeadTail(HEAD_LINES, TAIL_LINES, SHOWN_LINE_CHARS);
    const testRun = isTestRunCommand(command);
    const summaries: string[] = [];
    let sawNoAndAnd = false;
    const onLine = (raw: string) => {
        const line = redactSecretsFromString(plain(raw));
        output.push(line);
        log.write(line);
        terminal.say(`  ${redactSecretsFromString(String(raw))}`);
        if (testRun && isRunnerSummaryLine(line)) summaries.push(line);
        if (NO_AND_AND.test(line)) sawNoAndAnd = true;
    };

    let r: { ok: boolean; exitCode: number | null; error?: string };
    let leftovers = false;
    let stoppedBy: 'timeout' | 'cancelled' | null = null;
    const root = newRoot(launch.group);
    //  The kernel is handed a cancel this call controls: the limit and the
    //  run's Stop are kept here, where the whole tree can be killed, and the
    //  kernel is released once it has been.
    let releaseKernel: () => void = () => { /* replaced below */ };
    const kernelCancel = new Promise<void>(resolve => { releaseKernel = resolve; });
    let finished = false;
    const stopNow = async (why: 'timeout' | 'cancelled') => {
        if (finished || stoppedBy) return;
        stoppedBy = why;
        try { await killRootTree(root); } finally { releaseKernel(); }
    };
    let limit: ReturnType<typeof setTimeout> | undefined;
    let stragglers: ReturnType<typeof setInterval> | undefined;
    try {
        root.spawnedAt = Date.now();
        const handle = ExecutionGateway.startManaged(launch.file, launch.args, {
            cwd: scope.cwdAbs,
            env: childEnvironment(),
            timeout: timeoutMs + KERNEL_BACKSTOP_MS,
            ...(install ? { idleTimeout: NETWORK_INSTALL_TIMEOUTS.idleMs, idleProgress: installProbeFor(scope.root, scope.cwdAbs, command) } : {}),
            cancel: kernelCancel,
            windowsHide: true,
            onLine,
        });
        root.pid = handle.pid;
        root.kill = () => handle.kill();
        watchRoot(root);
        limit = setTimeout(() => { void stopNow('timeout'); }, timeoutMs);
        void cancellationOf(context)?.then(() => stopNow('cancelled'));
        //  A shell that has exited while something it started in the
        //  background still holds the output pipe never reaches 'close': the
        //  command would wait for its ceiling. In its own group, those
        //  stragglers are found and stopped.
        if (launch.group && root.pid) {
            stragglers = setInterval(() => {
                if (!stoppedBy && root.goneAt !== undefined && Date.now() - root.goneAt >= 1000 && signalGroup(root.pid, 'SIGKILL')) leftovers = true;
            }, 500);
            stragglers.unref?.();
        }
        try {
            r = await handle.done;
        } finally {
            finished = true;
            if (limit) clearTimeout(limit);
            if (stragglers) clearInterval(stragglers);
            unwatchRoot(root);
            releaseKernel();
            //  The run's cancellation outlives this call; it must not hold the finished process.
            root.kill = () => { /* the process has ended */ };
        }
        //  Asked twice: a child that has just exited is a member of the group
        //  only until it is reaped, which takes milliseconds.
        if (launch.group && signalGroup(root.pid, 0)) {
            await sleep(100);
            if (signalGroup(root.pid, 0)) {
                signalGroup(root.pid, 'SIGKILL');
                leftovers = true;
            }
        }
    } catch (e: any) {
        r = { ok: false, exitCode: null, error: String(e?.message || e) };
    }
    const durationMs = Date.now() - startedAt;
    const ending = endingOf(r, stoppedBy);
    //  The kernel's own idle bound killed it with its two-second tree kill:
    //  look for what that may have left.
    if (ending.kind === 'idle') await asRun(root.owner, () => killWindowsOrphans(root));
    const judgement = testRun && ending.kind === 'exit' && ending.exitCode === 0 ? judgeTestRun(true, summaries.join('\n')) : null;
    const ok = ending.kind === 'exit' && ending.exitCode === 0 && (!judgement || judgement.passed);

    const limitText = `${wholeSeconds(timeoutMs)} s${byDeadline ? ', the time left before the run\'s deadline' : ''}`;
    let headline: string;
    let footer: string;
    let error: string;
    switch (ending.kind) {
        case 'exit':
            headline = `Exit code ${ending.exitCode} after ${seconds(durationMs)} s.`;
            footer = `→ exit ${ending.exitCode} · ${seconds(durationMs)}s`;
            error = `the command exited with code ${ending.exitCode}`;
            break;
        case 'timeout':
            headline = `Timed out after ${seconds(durationMs)} s and was stopped (the limit was ${limitText}). Exit code 124.`;
            footer = `→ timed out after ${seconds(durationMs)}s`;
            error = `the command timed out after ${seconds(durationMs)} s`;
            break;
        case 'idle':
            headline = `Stopped after ${seconds(durationMs)} s: it printed nothing and wrote no install files for ${wholeSeconds(NETWORK_INSTALL_TIMEOUTS.idleMs)} s. Exit code 124.`;
            footer = `→ stopped after no progress for ${seconds(durationMs)}s`;
            error = `the install made no progress and was stopped after ${seconds(durationMs)} s`;
            break;
        case 'cancelled':
            headline = `Cancelled after ${seconds(durationMs)} s: the run was stopped, and so was the command. Exit code 130.`;
            footer = `→ cancelled after ${seconds(durationMs)}s`;
            error = 'the command was cancelled';
            break;
        case 'signal':
            headline = `The command ended after ${seconds(durationMs)} s without an exit code: a signal killed it.`;
            footer = `→ killed by a signal after ${seconds(durationMs)}s`;
            error = 'the command was killed by a signal';
            break;
        default:
            headline = `The command did not start: ${ending.error}.`;
            footer = `→ did not start: ${ending.error}`;
            error = `the command did not start: ${ending.error}`;
    }
    if (judgement && !judgement.passed) error = judgement.reason;

    terminal.say(`${ok ? GREEN : RED}${footer}${RESET}`);
    terminal.flush();
    log.write(footer);
    await log.close();

    const lines: string[] = [`$ ${shown}${scope.cwdRel === '.' ? '' : `   (in ${scope.cwdRel})`}`, headline];
    const where = log.rel ? `Full log: ${log.rel} (file_read opens it).` : `The full log could not be saved (${log.error}).`;
    if (!output.total) lines.push(`It printed nothing. ${where}`);
    else if (!output.omitted) lines.push(`Output (${output.total} line${output.total === 1 ? '' : 's'}). ${where}`, '---', ...output.allShown(), '---');
    else {
        lines.push(`Output: ${output.total} lines; the first ${output.head.length} and the last ${output.tailLines().length} are shown, ${output.omitted} in between are left out. ${where}`);
        lines.push('---', ...output.head, `[… ${output.omitted} lines left out …]`, ...output.tailLines(), '---');
    }
    //  Only a command that ended by itself can have LEFT something behind; after
    //  a timeout or a cancel its children were part of what was stopped.
    if (leftovers && ending.kind === 'exit') lines.push('It left processes running in the background; they were stopped. shell_run is for commands that finish: start servers and watchers with shell_start.');
    if (judgement) lines.push(judgement.passed ? 'Test run: passed.' : `Test run: NOT a pass. It exited 0, but ${judgement.reason}.`);
    if (sawNoAndAnd && WINDOWS) {
        lines.push('Hint: Windows PowerShell 5.1 has no `&&` or `||`, so nothing in this command ran. Chain commands with `;`, or run the next one only after success with `first; if ($?) { second }`.');
    }

    const fact: CommandFact = { command, cwd: scope.cwdRel, exitCode: ending.exitCode, durationMs, ...(ending.exitCode === 124 ? { timedOut: true } : {}) };
    return {
        ok,
        ...(ok ? {} : { error }),
        output: { text: lines.join('\n'), command: fact, ...(log.rel ? { log: log.rel } : {}) },
        logs: [`engine_shell_run: ${footer.replace(/^→ /u, '')} — ${shown.slice(0, 200)}`],
        logsStreamedLive: true,
    };
}

/* ───────────────────────── background processes ───────────────────────── */

interface Candidate { url: string; port: number }

/** `http://127.0.0.1:5173` of `http://127.0.0.1:5173/app/`: one candidate per address. */
function originOf(url: string): string {
    return url.replace(/^([a-z]+:\/\/[^/]+).*$/iu, '$1').toLowerCase();
}

/**
 * Keep the first URL seen for each address: the "port" argument's, then the
 * first one the process printed. A process can print many paths on one
 * address before it serves (request logs, route tables); each would
 * otherwise be one more candidate, kept for the whole run and tried on every
 * poll.
 */
function addCandidate(candidates: Map<string, Candidate>, c: Candidate): void {
    const key = originOf(c.url);
    if (!candidates.has(key)) candidates.set(key, c);
}

interface EngineProcess {
    name: string;
    command: string;
    cwdRel: string;
    root: Root;
    startedAt: number;
    exit?: { ok: boolean; exitCode: number | null; error?: string };
    exitedAt?: number;
    stopping: boolean;
    /** The stop in progress, so two stops of one process at once are one. */
    stop?: Promise<boolean>;
    url?: string;
    port?: number;
    /** The addresses to try, keyed by origin (addCandidate). */
    candidates: Map<string, Candidate>;
    busy: Set<number>;
    output: Ring;
    log: LogFile;
    /** Settles when the process is gone and its log is closed. */
    ended: Promise<void>;
}

interface RunProcesses {
    procs: Map<string, EngineProcess>;
    unregister?: () => void;
    /** Set when the run's processes are stopped: a start still on its way starts nothing. */
    closed?: boolean;
}

/** The processes of each live run. A run's entry is removed when the run ends. */
const RUNS = new Map<string, RunProcesses>();

function runRegistry(runId: string, create: boolean): RunProcesses | undefined {
    let entry = RUNS.get(runId);
    if (!entry && create) {
        entry = { procs: new Map() };
        RUNS.set(runId, entry);
        //  Inside a request scope the run's end stops everything this run
        //  started, whether or not the engine reaches its own stopAll.
        try {
            entry.unregister = requestResourceManager.registerCleanup(() => stopAllForRun(runId));
        } catch { /* outside a scope: the engine's stopAll and stopAllForRun end them */ }
    }
    return entry;
}

function infoOf(p: EngineProcess): ProcessInfo {
    return {
        name: p.name,
        command: p.command,
        cwd: p.cwdRel,
        ...(p.root.pid ? { pid: p.root.pid } : {}),
        running: !p.exit,
        ...(p.exit ? { exitCode: p.exit.exitCode } : {}),
        ...(p.url ? { url: p.url } : {}),
        ...(p.port ? { port: p.port } : {}),
        startedAt: p.startedAt,
    };
}

/** Ports a dev server commonly takes: checked before a start, so an answer there is not mistaken for the new process. */
const COMMON_DEV_PORTS = [3000, 3001, 4173, 4200, 5000, 5173, 5174, 8000, 8080, 8081];

async function busyPorts(port: number | undefined): Promise<Set<number>> {
    const ports = [...new Set([...(port ? [port] : []), ...COMMON_DEV_PORTS])];
    const open = await Promise.all(ports.map(async p => ((await isLoopbackPortOpen(p, 300)) ? p : 0)));
    return new Set(open.filter(Boolean));
}

const PRINTED_URL = /\b(https?):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::(\d{1,5}))?(\/[^\s'"<>`)\]]*)?/giu;
const PRINTED_HOST_PORT = /(?:^|[^\w.:/[\]-])(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})\b/giu;
const PRINTED_PORT_PHRASE = /\b(?:listen(?:ing|s)?|running|started|serving|server|ready|available|live|up)\b[^\n]{0,40}?\bport\s*[:=#]?\s*(\d{2,5})\b/iu;

function validPort(n: number): boolean {
    return Number.isInteger(n) && n > 0 && n < 65536;
}

/** The URLs to try for one address: a wildcard host is tried on loopback. */
function urlsFor(scheme: string, host: string, port: number, pathPart: string): string[] {
    const tail = pathPart.replace(/[.,;:!?]+$/u, '') || '/';
    const h = host.toLowerCase();
    if (h === '0.0.0.0') return [`${scheme}://127.0.0.1:${port}${tail}`];
    if (h === '[::]') return [`${scheme}://127.0.0.1:${port}${tail}`, `${scheme}://[::1]:${port}${tail}`];
    return [`${scheme}://${h}:${port}${tail}`];
}

/** Loopback addresses a line of output announces, in the order it names them. */
export function addressesIn(line: string): Candidate[] {
    const text = plain(line);
    const found: Candidate[] = [];
    const add = (urls: string[], port: number) => { if (validPort(port)) for (const url of urls) found.push({ url, port }); };
    for (const m of text.matchAll(PRINTED_URL)) {
        const scheme = m[1].toLowerCase();
        const port = m[3] ? Number(m[3]) : scheme === 'https' ? 443 : 80;
        add(urlsFor(scheme, m[2], port, m[4] || ''), port);
    }
    if (!found.length) {
        for (const m of text.matchAll(PRINTED_HOST_PORT)) add(urlsFor('http', m[1], Number(m[2]), ''), Number(m[2]));
    }
    if (!found.length) {
        const m = text.match(PRINTED_PORT_PHRASE);
        if (m) add(urlsFor('http', '[::]', Number(m[1]), ''), Number(m[1]));
    }
    return found;
}

/** The HTTP status an address answered with, when it answered below 500. */
function answers(url: string): Promise<number | null> {
    return new Promise(resolve => {
        let settled = false;
        const finish = (v: number | null) => { if (!settled) { settled = true; resolve(v); } };
        try {
            const get = url.startsWith('https:') ? https.get : http.get;
            //  A local dev server's certificate is its own; only loopback is ever asked.
            const req = get(url, { rejectUnauthorized: false, headers: { 'user-agent': 'joe-engine-readiness' } } as any, res => {
                res.resume();
                const status = Number(res.statusCode || 0);
                finish(status > 0 && status < 500 ? status : null);
            });
            req.setTimeout(HTTP_ANSWER_TIMEOUT_MS, () => { req.destroy(); finish(null); });
            req.on('error', () => finish(null));
        } catch { finish(null); }
    });
}

/** One pass over what the process announced: the first address that answers, or null. */
async function answeringCandidate(p: EngineProcess): Promise<(Candidate & { status: number }) | null> {
    for (const c of [...p.candidates.values()]) {
        if (p.exit) return null;
        if (p.busy.has(c.port)) continue;
        if (!(await isLoopbackPortOpen(c.port, 750))) continue;
        const status = await answers(c.url);
        if (status !== null && !p.exit) return { ...c, status };
    }
    return null;
}

type Readiness =
    | { state: 'ready'; url: string; port: number; status: number; afterMs: number }
    | { state: 'exited' }
    | { state: 'cancelled' }
    | { state: 'timeout' };

async function waitUntilReady(p: EngineProcess, timeoutMs: number, cancel: Promise<void> | undefined): Promise<Readiness> {
    const deadline = Date.now() + timeoutMs;
    let cancelled = false;
    void cancel?.then(() => { cancelled = true; });
    const woken = Promise.race([p.ended, ...(cancel ? [cancel] : [])]);
    for (;;) {
        if (p.exit) return { state: 'exited' };
        if (cancelled) return { state: 'cancelled' };
        const hit = await answeringCandidate(p);
        if (hit) return { state: 'ready', url: hit.url, port: hit.port, status: hit.status, afterMs: Date.now() - p.startedAt };
        if (p.exit) return { state: 'exited' };
        if (Date.now() >= deadline) return { state: 'timeout' };
        await Promise.race([sleep(Math.min(READY_POLL_MS, Math.max(0, deadline - Date.now()))), woken]);
    }
}

/**
 * Stop one process and everything it started, and wait to see it gone.
 * POSIX in a group: the group gets SIGTERM and a few seconds to close first.
 * Then the root's tree is killed (killRootTree). A process that still has not
 * ended is held open by a child its shell left (Windows: found by its
 * parent's pid), and the kernel's own kill() follows.
 */
function stopProcess(p: EngineProcess): Promise<boolean> {
    if (p.exit) { if (p.root.group) signalGroup(p.root.pid, 'SIGKILL'); return Promise.resolve(true); }
    //  Two stops at once are one; a stop asked after one that failed tries again.
    if (!p.stop) {
        const attempt = stopTree(p);
        p.stop = attempt;
        const done = () => { if (p.stop === attempt) p.stop = undefined; };
        attempt.then(done, done);
    }
    return p.stop;
}

async function stopTree(p: EngineProcess): Promise<boolean> {
    p.stopping = true;
    if (p.root.group && p.root.pid && signalGroup(p.root.pid, 'SIGTERM') && await settlesWithin(p.ended, STOP_GRACE_MS)) {
        signalGroup(p.root.pid, 'SIGKILL');
        return true;
    }
    const wasAlive = await killRootTree(p.root);
    if (await settlesWithin(p.ended, STOP_GRACE_MS)) {
        if (p.root.group) signalGroup(p.root.pid, 'SIGKILL');
        return true;
    }
    //  Still open: the shell is gone and something it started holds its pipe.
    if (wasAlive && WINDOWS) {
        p.root.goneAt ??= Date.now();
        await asRun(p.root.owner, () => killWindowsOrphans(p.root));
    }
    p.root.kill();
    const gone = await settlesWithin(p.ended, STOP_WAIT_MS);
    if (p.root.group) signalGroup(p.root.pid, 'SIGKILL');
    return gone;
}

/** Stop every process a run started and forget the run. Safe to call twice. */
export async function stopAllForRun(runId: string): Promise<void> {
    const key = String(runId || '').trim();
    const entry = RUNS.get(key);
    if (!entry) return;
    entry.closed = true;
    RUNS.delete(key);
    try { entry.unregister?.(); } catch { /* the scope is already closing */ }
    await Promise.allSettled([...entry.procs.values()].map(async p => {
        await stopProcess(p);
        await settlesWithin(p.ended, STOP_WAIT_MS);
    }));
}

/** The processes a run started, as the engine's registry lists them. */
export function listRunProcesses(runId: string): ProcessInfo[] {
    const entry = RUNS.get(String(runId || '').trim());
    return entry ? [...entry.procs.values()].map(infoOf) : [];
}

function logsText(p: EngineProcess, lines: number): string {
    const shown = p.output.last(lines);
    const earlier = p.output.total - shown.length;
    const where = p.log.rel ? `the full log is ${p.log.rel}` : `the full log could not be saved (${p.log.error})`;
    const head = earlier > 0
        ? `Its last ${shown.length} of ${p.output.total} lines (${earlier} earlier ones are not shown; ${where}):`
        : `Its output (${p.output.total} line${p.output.total === 1 ? '' : 's'}; ${where}):`;
    return p.output.total ? [head, '---', ...shown, '---'].join('\n') : `It has printed nothing yet (${where}).`;
}

function labelOf(p: EngineProcess): string {
    return `"${p.name}"${p.root.pid ? ` (pid ${p.root.pid})` : ''}`;
}

function statusLine(p: EngineProcess): string {
    if (!p.exit) {
        const address = p.url ? `serving ${p.url}` : 'no address has answered yet';
        return `${labelOf(p)} is running, ${seconds(Date.now() - p.startedAt)} s after it started; ${address}.`;
    }
    const after = seconds((p.exitedAt ?? Date.now()) - p.startedAt);
    const how = p.stopping ? 'was stopped' : p.exit.exitCode === null ? (p.exit.error ? `did not start (${p.exit.error})` : 'was killed by a signal') : `exited with code ${p.exit.exitCode}`;
    return `${labelOf(p)} ${how} ${after} s after it started.`;
}

/** What the engine's registry returns for logs: synchronous, from memory. */
export function readRunProcessLogs(runId: string, name: string, lines = LOG_LINES_DEFAULT): (ProcessInfo & { output: string }) | undefined {
    const p = RUNS.get(String(runId || '').trim())?.procs.get(String(name || ''));
    if (!p) return undefined;
    const n = Math.max(1, Math.min(KEPT_LINES, Math.floor(Number(lines) || LOG_LINES_DEFAULT)));
    return { ...infoOf(p), output: `${statusLine(p)}\n${logsText(p, n)}` };
}

function nameError(tool: string): string {
    return `${tool} needs a "name" of 1 to 40 letters, digits, "-", "_" or "." that starts with a letter or digit (for example "web" or "api").`;
}

function knownNames(runId: string): string {
    const names = [...(RUNS.get(runId)?.procs.keys() ?? [])];
    return names.length ? ` Processes in this run: ${names.join(', ')}.` : ' This run has started no process with shell_start.';
}

export async function startShellProcess(input: any, context: any): Promise<Result> {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!PROCESS_NAME.test(name)) return refuse(nameError('engine_shell_start'));
    const command = typeof input?.command === 'string' ? input.command.trim() : '';
    if (!command) return refuse('engine_shell_start needs a "command" to start.');
    const runId = runIdOf(context);
    if (!runId) return refuse('No run is bound to this call, so a background process could be neither tracked nor stopped. Nothing was started.');
    const scope = await resolveScope(context, input?.cwd);
    if ('error' in scope) return refuse(scope.error);
    const secret = secretFileNamedIn(command);
    if (secret) return refuse(`The command names "${secret}", a file that holds secrets; the engine never reads or writes one. Use a .env.example with placeholder values instead.`);
    let port: number | undefined;
    if (input?.port !== undefined && input?.port !== null && input?.port !== '') {
        port = Number(input.port);
        if (!validPort(port)) return refuse('"port" must be a whole number between 1 and 65535.');
    }
    if (isCancelled(context)) return refuse('The run was stopped; nothing was started.');
    const deadlineAt = deadlineOf(input, context);
    const left = deadlineAt === undefined ? Infinity : deadlineAt - Date.now();
    if (left <= 0) return refuse('The run\'s deadline has passed; nothing was started.');
    const wanted = Number(input?.ready_timeout_ms);
    const readyTimeoutMs = Math.max(1, Math.floor(Math.min(Number.isFinite(wanted) && wanted > 0 ? wanted : DEFAULT_READY_TIMEOUT_MS, left)));

    const registry = runRegistry(runId, true)!;
    const notes: string[] = [];
    const previous = registry.procs.get(name);
    if (previous) {
        if (!previous.exit) {
            const gone = await stopProcess(previous);
            //  One that did not exit stays under its name, so shell_stop and
            //  the end of the run still reach it; a second process beside it
            //  would leave the first one tracked by nothing.
            if (!gone) {
                const text = `The "${name}" that was already running (pid ${previous.root.pid ?? '?'}) was told to stop but had not exited after ${wholeSeconds(STOP_GRACE_MS + STOP_WAIT_MS)} s, so nothing new was started. shell_logs shows its state; shell_stop asks it again, or start the new process under another name.`;
                return { ok: false, error: `${name} did not exit, so it was not replaced`, output: { text, served: infoOf(previous) }, logs: [text] };
            }
            notes.push(`The "${name}" that was already running (pid ${previous.root.pid ?? '?'}) was stopped first.`);
        }
        registry.procs.delete(name);
    }

    const busy = await busyPorts(port);
    const log = await LogFile.open(scope.root, name);
    const launch = await launchFor(command);
    //  The run may have been stopped while this call was getting ready.
    if (registry.closed || isCancelled(context)) {
        log.write(`# ${name} was not started: the run was stopped`);
        await log.close();
        return refuse('The run was stopped; nothing was started.');
    }
    const terminal = new TerminalSink(sessionIdOf(context));
    const shown = redactSecretsFromString(command);
    terminal.say(`${CYAN}${promptLabel(scope)} $ ${shown}   [${name}]${RESET}`);
    log.write(`$ ${shown}`);
    log.write(`# ${name} · in ${scope.cwdRel} · started ${new Date().toISOString()}`);

    let settleEnded: () => void = () => { /* replaced below */ };
    const proc: EngineProcess = {
        name, command, cwdRel: scope.cwdRel, root: newRoot(launch.group), startedAt: Date.now(),
        stopping: false, candidates: new Map(), busy, output: new Ring(KEPT_LINES, KEPT_LINE_CHARS), log,
        ended: new Promise<void>(resolve => { settleEnded = resolve; }),
    };
    if (port) for (const url of urlsFor('http', '[::]', port, '')) addCandidate(proc.candidates, { url, port });
    const onLine = (raw: string) => {
        const line = redactSecretsFromString(plain(raw));
        proc.output.push(line);
        log.write(line);
        terminal.say(`  ${redactSecretsFromString(String(raw))}`);
        if (!proc.url) for (const c of addressesIn(line)) addCandidate(proc.candidates, c);
    };
    registry.procs.set(name, proc);

    const finish = async (r: { ok: boolean; exitCode: number | null; error?: string }) => {
        proc.exit = r;
        proc.exitedAt = Date.now();
        unwatchRoot(proc.root);
        //  A process that ended by itself leaves nothing of its group behind.
        if (proc.root.group) signalGroup(proc.root.pid, 'SIGKILL');
        const after = seconds(proc.exitedAt - proc.startedAt);
        const footer = proc.stopping ? `→ ${name} stopped after ${after}s`
            : r.exitCode === null ? `→ ${name} ${r.error ? `did not start: ${r.error}` : `was killed by a signal after ${after}s`}`
                : `→ ${name} exited with code ${r.exitCode} after ${after}s`;
        terminal.say(`${proc.stopping ? GREEN : RED}${footer}${RESET}`);
        terminal.flush();
        log.write(footer);
        await log.close();
        settleEnded();
    };
    try {
        proc.root.spawnedAt = Date.now();
        //  No kernel cancel: a stopped run reaches this process through
        //  stopProcess below, which kills its whole tree.
        const handle = ExecutionGateway.startManaged(launch.file, launch.args, {
            cwd: scope.cwdAbs,
            env: childEnvironment(port ? { PORT: String(port) } : {}),
            windowsHide: true,
            onLine,
        });
        proc.root.pid = handle.pid;
        proc.root.kill = () => handle.kill();
        watchRoot(proc.root);
        void handle.done.then(finish, (e: any) => finish({ ok: false, exitCode: null, error: String(e?.message || e) }));
    } catch (e: any) {
        await finish({ ok: false, exitCode: null, error: String(e?.message || e) });
    }
    const cancel = cancellationOf(context);
    //  The run's Stop, during the wait or after it: this tool call's
    //  cancellation is joined to the run's for as long as the run lasts.
    void cancel?.then(() => { if (!proc.exit) void stopProcess(proc); });

    const readiness = await waitUntilReady(proc, readyTimeoutMs, cancel);
    if (readiness.state === 'cancelled') await stopProcess(proc);
    const busyNamed = [...proc.candidates.values()].filter(c => busy.has(c.port)).map(c => c.port);
    if (busyNamed.length) {
        const ports = [...new Set(busyNamed)];
        notes.push(`Port ${ports.join(', ')} was already in use before "${name}" started, so an answer there would come from another process; it was not taken as this one's address.`);
    }
    const label = labelOf(proc);
    const where = `$ ${shown}${scope.cwdRel === '.' ? '' : `   (in ${scope.cwdRel})`}`;
    const recent = () => logsText(proc, 30);
    let ok = false;
    let text: string;
    if (readiness.state === 'ready') {
        proc.url = readiness.url;
        proc.port = readiness.port;
        ok = true;
        text = [where, `Started ${label}. It answered at ${readiness.url} (HTTP ${readiness.status}) ${seconds(readiness.afterMs)} s after it started.`,
            ...notes, 'It keeps running until shell_stop or the end of the run; shell_logs shows what it prints.', recent()].join('\n');
    } else if (readiness.state === 'exited') {
        const r = proc.exit!;
        const how = r.exitCode === null
            ? (r.error ? `did not start: ${r.error}` : 'was killed by a signal')
            : `exited with code ${r.exitCode}`;
        text = [where, `${label} ${how} ${seconds((proc.exitedAt ?? Date.now()) - proc.startedAt)} s after it started, before any address answered.`, ...notes, recent()].join('\n');
    } else if (readiness.state === 'cancelled') {
        text = [where, `The run was stopped while ${label} was starting; it was stopped too.`, ...notes, recent()].join('\n');
    } else {
        const tried = [...proc.candidates.values()].filter(c => !busy.has(c.port)).map(c => c.url);
        const what = tried.length
            ? `No address answered within ${wholeSeconds(readyTimeoutMs)} s (tried: ${tried.join(', ')}).`
            : `It printed no address within ${wholeSeconds(readyTimeoutMs)} s and no "port" was given, so there was nothing to try. If it is a server, pass the port it listens on.`;
        text = [where, `${label} is still running, but it is not serving yet. ${what}`, ...notes,
            'It keeps running: shell_logs shows what it prints, shell_stop ends it.', recent()].join('\n');
    }
    return {
        ok,
        ...(ok ? {} : { error: readiness.state === 'timeout' ? `${name} is running but no address answered` : `${name} is not running` }),
        output: { text, served: infoOf(proc), ...(log.rel ? { log: log.rel } : {}) },
        logs: [`engine_shell_start: ${name} ${readiness.state}${proc.url ? ` ${proc.url}` : ''}`],
        logsStreamedLive: true,
    };
}

export async function shellProcessLogs(input: any, context: any): Promise<Result> {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!PROCESS_NAME.test(name)) return refuse(nameError('engine_shell_logs'));
    const runId = runIdOf(context);
    if (!runId) return refuse('No run is bound to this call, so there are no processes to read.');
    const p = RUNS.get(runId)?.procs.get(name);
    if (!p) return refuse(`There is no process named "${name}" in this run.${knownNames(runId)}`);
    let lines = LOG_LINES_DEFAULT;
    if (input?.lines !== undefined && input?.lines !== null && input?.lines !== '') {
        const n = Number(input.lines);
        if (!Number.isFinite(n) || n < 1) return refuse('"lines" must be a positive number.');
        lines = Math.floor(n);
    }
    const note = lines > KEPT_LINES ? ` (only the last ${KEPT_LINES} lines are kept in memory; the log file has them all)` : '';
    //  A server that came up after shell_start stopped waiting is seen here.
    if (!p.exit && !p.url) {
        const hit = await answeringCandidate(p);
        if (hit) { p.url = hit.url; p.port = hit.port; }
    }
    const text = `${statusLine(p)}${note}\n${logsText(p, Math.min(lines, KEPT_LINES))}`;
    return { ok: true, output: { text, served: infoOf(p) }, logs: [`engine_shell_logs: ${name}`] };
}

export async function stopShellProcess(input: any, context: any): Promise<Result> {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!PROCESS_NAME.test(name)) return refuse(nameError('engine_shell_stop'));
    const runId = runIdOf(context);
    if (!runId) return refuse('No run is bound to this call, so there are no processes to stop.');
    const p = RUNS.get(runId)?.procs.get(name);
    if (!p) return refuse(`There is no process named "${name}" in this run.${knownNames(runId)}`);
    const already = !!p.exit;
    const gone = already ? true : await stopProcess(p);
    const lines = [already ? `${statusLine(p)} Nothing was left to stop.`
        : gone ? `Stopped ${labelOf(p)} after it ran ${seconds(Date.now() - p.startedAt)} s.`
            : `"${name}" was told to stop, but it had not exited after ${wholeSeconds(STOP_GRACE_MS + STOP_WAIT_MS)} s.`];
    if (p.port) {
        const stillOpen = await isLoopbackPortOpen(p.port, 500);
        lines.push(stillOpen
            ? `Port ${p.port} still accepts connections, so another process holds it now.`
            : `Port ${p.port} is closed.`);
    }
    return {
        ok: gone,
        ...(gone ? {} : { error: `${name} did not exit` }),
        output: { text: lines.join(' '), served: infoOf(p) },
        logs: [`engine_shell_stop: ${name} ${gone ? 'stopped' : 'did not exit'}`],
    };
}

/* ───────────────────────── the machine, as the prompt states it ───────────────────────── */

let factsMemo: Promise<MachineFacts> | null = null;

/**
 * The platform, the shell commands run in, and the node, npm and Python
 * versions, asked once per process with short probes. A tool that is missing
 * is simply absent. A probe the firewall refused (no orchestrator context)
 * leaves the answer incomplete, and an incomplete answer is not kept: the
 * next call asks again.
 */
export function machineFacts(): Promise<MachineFacts> {
    if (!factsMemo) {
        const pending = detectMachineFacts();
        factsMemo = pending.then(r => r.facts);
        void pending.then(r => { if (!r.complete) factsMemo = null; }, () => { factsMemo = null; });
    }
    return factsMemo;
}

async function detectMachineFacts(): Promise<{ facts: MachineFacts; complete: boolean }> {
    let complete = true;
    const ask = async (file: string, args: string[], viaShell = false): Promise<string | null> => {
        try {
            const r: any = viaShell
                ? await ExecutionGateway.execute([file, ...args].join(' '), [], { timeout: PROBE_TIMEOUT_MS, windowsHide: true })
                : await ExecutionGateway.execute(file, args, { timeout: PROBE_TIMEOUT_MS, windowsHide: true, shell: false });
            const d = r?.data || {};
            //  Slow is not missing (measured: `npm -v` took 10.6 s on a loaded
            //  laptop): an answer that ran out of time is not kept.
            if (d.exitCode === 124) complete = false;
            if (!r?.success || d.exitCode !== 0) return null;
            return `${d.output || ''}\n${d.error || ''}`;
        } catch {
            complete = false;
            return null;
        }
    };
    const version = (text: string | null, re: RegExp): string | undefined => (text ? text.match(re)?.[1] : undefined);
    const SEMVER = /v?(\d+\.\d+\.\d+)/u;
    const PYTHON = /Python\s+(3\.\d+(?:\.\d+)?)/u;

    const python = async (): Promise<string | undefined> => {
        //  The name the model types first is `python`; say so when only another one works.
        const plainPython = version(await ask('python', ['--version']), PYTHON);
        if (plainPython) return plainPython;
        if (WINDOWS) {
            const viaLauncher = version(await ask('py', ['-3', '--version']), PYTHON);
            return viaLauncher ? `${viaLauncher} (run it as py)` : undefined;
        }
        const three = version(await ask('python3', ['--version']), PYTHON);
        return three ? `${three} (run it as python3)` : undefined;
    };
    const shell = async (): Promise<string> => {
        if (!WINDOWS) return path.basename((await posixShell()).shell);
        const v = version(await ask('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()']), /(\d+\.\d+)/u);
        return v ? `Windows PowerShell ${v}` : 'Windows PowerShell';
    };
    const [node, npm, py, sh] = await Promise.all([
        ask('node', ['-v']).then(t => version(t, SEMVER)),
        //  npm is a .cmd shim on Windows, which only a shell can start.
        ask('npm', ['-v'], WINDOWS).then(t => version(t, SEMVER)),
        python(),
        shell(),
    ]);
    const facts: MachineFacts = {
        platform: process.platform,
        shell: sh,
        ...(node ? { node } : {}),
        ...(npm ? { npm } : {}),
        ...(py ? { python: py } : {}),
    };
    return { facts, complete };
}

/* ───────────────────────── the registered tools ───────────────────────── */

abstract class EngineShellTool implements ToolDefinition {
    abstract readonly name: string;
    abstract readonly description: string;
    abstract readonly inputSchema: Record<string, any>;
    readonly version = '1.0.0';
    readonly tags = ['engine'];
    readonly outputSchema = { type: 'object', properties: { text: { type: 'string' } } };
    //  The risk class of shell_execute: these run commands in the user's project.
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 60;
    auditFields = ['command', 'cwd', 'name'];
    mockSupported = false;
    abstract execute(input: any, context?: any): Promise<ToolExecutionResult>;
}

const DEADLINE_FIELD = { type: 'number', description: 'Epoch milliseconds the run must end by; set by the engine, never by the model.' };

export class EngineShellRunTool extends EngineShellTool {
    readonly name = 'engine_shell_run';
    readonly description = 'Agent engine only: run one command in the run\'s project folder, wait for it to end, and report its exit code and bounded output with the full log saved under .joe/logs. Plans use shell_execute.';
    readonly inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', description: 'The command line.' },
            cwd: { type: 'string', description: 'A folder relative to the project folder.' },
            timeout_seconds: { type: 'number', description: 'Ceiling in seconds; default 300, installs 900.' },
            deadline_at: DEADLINE_FIELD,
        },
        required: ['command'],
    };
    execute(input: any, context?: any) { return runShellCommand(input, context); }
}

export class EngineShellStartTool extends EngineShellTool {
    readonly name = 'engine_shell_start';
    readonly description = 'Agent engine only: start a background process (a dev server, an API, a watcher) in the run\'s project folder and wait until an address it serves answers. Plans use project_run.';
    readonly inputSchema = {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'A short name for the process, such as web or api.' },
            command: { type: 'string', description: 'The command line that starts it.' },
            cwd: { type: 'string', description: 'A folder relative to the project folder.' },
            port: { type: 'number', description: 'The port it listens on, when known.' },
            ready_timeout_ms: { type: 'number', description: 'How long to wait for an address to answer; default 90000.' },
            deadline_at: DEADLINE_FIELD,
        },
        required: ['name', 'command'],
    };
    execute(input: any, context?: any) { return startShellProcess(input, context); }
}

export class EngineShellLogsTool extends EngineShellTool {
    readonly name = 'engine_shell_logs';
    readonly description = 'Agent engine only: show the recent output and the state of a process engine_shell_start started in this run.';
    readonly inputSchema = {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'The name given to engine_shell_start.' },
            lines: { type: 'number', description: 'How many of the last lines to show; default 60.' },
        },
        required: ['name'],
    };
    sideEffects: ToolPermission[] = [];
    execute(input: any, context?: any) { return shellProcessLogs(input, context); }
}

export class EngineShellStopTool extends EngineShellTool {
    readonly name = 'engine_shell_stop';
    readonly description = 'Agent engine only: stop a process engine_shell_start started in this run, with every process it started. Plans use project_stop.';
    readonly inputSchema = {
        type: 'object',
        properties: { name: { type: 'string', description: 'The name given to engine_shell_start.' } },
        required: ['name'],
    };
    execute(input: any, context?: any) { return stopShellProcess(input, context); }
}

/** The four definitions registry.ts registers in its engine: shell block. */
export const ENGINE_SHELL_TOOLS: ToolDefinition[] = [
    new EngineShellRunTool(),
    new EngineShellStartTool(),
    new EngineShellLogsTool(),
    new EngineShellStopTool(),
];
