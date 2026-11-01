/**
 * THE SHELL, AS THE ENGINE'S MODEL SEES IT.
 *
 * Four tools with short names: shell_run, shell_start, shell_logs and
 * shell_stop. Each one checks the model's arguments, hands them to its
 * registered engine_shell_* definition through ToolService.executeTool (the
 * policy and execution gateway: the firewall, the session owner, the risk
 * check, the rate limit and the Stop button all live there), and maps the
 * answer to a ToolOutcome whose facts the run state keeps:
 *
 *   - shell_run → facts.command, how the command ended;
 *   - shell_start, shell_logs, shell_stop → facts.served, the process and
 *     the address it was SEEN serving.
 *
 * Two things every description makes plain, because a model gets them wrong
 * otherwise: shell_run waits for the command to END, so a server started with
 * it blocks the run (servers go to shell_start); and on Windows the shell is
 * Windows PowerShell 5.1, which has no `&&`.
 *
 * The project folder and the run never come from the model. They come from
 * Joe's tool context (ctx.joe.toolContext), with the engine's own projectDir
 * and runId where that context leaves them out, and the engine's
 * cancellation is joined to it so a stopped run stops its commands.
 */
import type { CommandFact, EngineTool, ParseResult, ProcessInfo, ProcessRegistry, ToolContext, ToolFacts, ToolOutcome } from '../types';
import { listRunProcesses, readRunProcessLogs, stopAllForRun } from '../../../modules/tools/definitions/EngineShellTools';

export { machineFacts, stopAllForRun } from '../../../modules/tools/definitions/EngineShellTools';

type Gateway = (name: string, input: any, context?: any) => Promise<any>;

/**
 * ToolService.executeTool, read when a tool runs. ToolService loads the whole
 * registry, and a definition the registry loads may load the engine; reading
 * it at call time keeps that circle from closing while modules load.
 */
function gateway(): Gateway {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../modules/services/ToolService').executeTool;
}

/** Joe's tool context for one call, with the engine's run, folder and cancellation joined in. */
export function toolContextFor(ctx: ToolContext): any {
    const base = ctx.joe && typeof ctx.joe === 'object' && ctx.joe.toolContext && typeof ctx.joe.toolContext === 'object'
        ? ctx.joe.toolContext : {};
    const parent = base.cancellation;
    const cancellation = parent && typeof parent.then === 'function' ? Promise.race([parent, ctx.cancelled]) : ctx.cancelled;
    return {
        ...base,
        runId: base.runId || ctx.runId,
        projectRoot: base.projectRoot || ctx.projectDir,
        cancellation,
        isCancelled: () => ctx.signal.aborted || (typeof base.isCancelled === 'function' && base.isCancelled() === true),
    };
}

/** What ToolService answers when the run was stopped while a tool ran (attended-run.ts CANCELLED). */
const RUN_CANCELLED = 'run_cancelled_by_owner';

/** The registered tool's answer as the loop reads it. A refusal by the gateway itself is said as one. */
function outcomeOf(result: any, tool: string): ToolOutcome {
    const out = result?.output;
    const text = out && typeof out === 'object' && typeof out.text === 'string' ? out.text : '';
    if (!text) {
        //  The gateway stops waiting the moment the run is stopped; the tool
        //  itself goes on to end what it started.
        if (result?.error === RUN_CANCELLED) return { ok: false, output: `${tool} was stopped: the run was cancelled.` };
        const why = String(result?.error || 'no reason was given').slice(0, 500);
        return { ok: false, output: `${tool} was refused by Joe's tool gateway: ${why}` };
    }
    const facts: ToolFacts = {};
    if (out.command) facts.command = out.command as CommandFact;
    if (out.served) facts.served = out.served as ProcessInfo;
    return { ok: result?.ok === true, output: text, ...(facts.command || facts.served ? { facts } : {}) };
}

function withDeadline<A extends object>(args: A, ctx: ToolContext): A & { deadline_at?: number } {
    return Number.isFinite(ctx.deadlineAt) && ctx.deadlineAt > 0 ? { ...args, deadline_at: ctx.deadlineAt } : { ...args };
}

/* ───────────────────────── arguments ───────────────────────── */

export interface ShellRunArgs { command: string; cwd?: string; timeout_seconds?: number }
export interface ShellStartArgs { name: string; command: string; cwd?: string; port?: number }
export interface ShellLogsArgs { name: string; lines?: number }
export interface ShellStopArgs { name: string }

const PROCESS_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/u;

function given(v: unknown): boolean {
    return v !== undefined && v !== null && v !== '';
}

function anObject(raw: unknown): Record<string, unknown> | null {
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

function commandOf(a: Record<string, unknown>): string {
    return typeof a.command === 'string' ? a.command.trim() : '';
}

function cwdOf(a: Record<string, unknown>): string | undefined | { error: string } {
    if (!given(a.cwd)) return undefined;
    return typeof a.cwd === 'string' ? a.cwd : { error: '"cwd" must be a folder path relative to the project folder, as a string.' };
}

function nameOf(a: Record<string, unknown>, tool: string): string | { error: string } {
    const name = typeof a.name === 'string' ? a.name.trim() : '';
    return PROCESS_NAME.test(name) ? name
        : { error: `${tool} needs a "name" of 1 to 40 letters, digits, "-", "_" or "." that starts with a letter or digit, for example {"name": "web"}.` };
}

export function parseShellRunArgs(raw: unknown): ParseResult<ShellRunArgs> {
    const a = anObject(raw);
    if (!a) return { ok: false, error: 'shell_run takes {"command": "npm test", "cwd": "client", "timeout_seconds": 300}; only "command" is required.' };
    const command = commandOf(a);
    if (!command) return { ok: false, error: 'shell_run needs a "command": the command line to run, for example {"command": "npm test"}.' };
    const value: ShellRunArgs = { command };
    const cwd = cwdOf(a);
    if (cwd && typeof cwd === 'object') return { ok: false, error: cwd.error };
    if (cwd !== undefined) value.cwd = cwd;
    if (given(a.timeout_seconds)) {
        const n = Number(a.timeout_seconds);
        if (!Number.isFinite(n) || n <= 0) return { ok: false, error: '"timeout_seconds" must be a positive number of seconds.' };
        value.timeout_seconds = n;
    }
    return { ok: true, value };
}

export function parseShellStartArgs(raw: unknown): ParseResult<ShellStartArgs> {
    const a = anObject(raw);
    if (!a) return { ok: false, error: 'shell_start takes {"name": "web", "command": "npm run dev", "cwd": "client", "port": 5173}; "name" and "command" are required.' };
    const name = nameOf(a, 'shell_start');
    if (typeof name === 'object') return { ok: false, error: name.error };
    const command = commandOf(a);
    if (!command) return { ok: false, error: 'shell_start needs a "command": the command line that starts the process, for example {"name": "web", "command": "npm run dev"}.' };
    const value: ShellStartArgs = { name, command };
    const cwd = cwdOf(a);
    if (cwd && typeof cwd === 'object') return { ok: false, error: cwd.error };
    if (cwd !== undefined) value.cwd = cwd;
    if (given(a.port)) {
        const port = Number(a.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: '"port" must be a whole number between 1 and 65535.' };
        value.port = port;
    }
    return { ok: true, value };
}

export function parseShellLogsArgs(raw: unknown): ParseResult<ShellLogsArgs> {
    const a = anObject(raw);
    if (!a) return { ok: false, error: 'shell_logs takes {"name": "web", "lines": 60}; "name" is required.' };
    const name = nameOf(a, 'shell_logs');
    if (typeof name === 'object') return { ok: false, error: name.error };
    const value: ShellLogsArgs = { name };
    if (given(a.lines)) {
        const n = Number(a.lines);
        if (!Number.isFinite(n) || n < 1) return { ok: false, error: '"lines" must be a positive whole number.' };
        value.lines = Math.floor(n);
    }
    return { ok: true, value };
}

export function parseShellStopArgs(raw: unknown): ParseResult<ShellStopArgs> {
    const a = anObject(raw);
    if (!a) return { ok: false, error: 'shell_stop takes {"name": "web"}.' };
    const name = nameOf(a, 'shell_stop');
    if (typeof name === 'object') return { ok: false, error: name.error };
    return { ok: true, value: { name } };
}

/* ───────────────────────── descriptions ───────────────────────── */

const WINDOWS = process.platform === 'win32';
const SHELL_NOTE = WINDOWS
    ? 'The shell is Windows PowerShell 5.1: chain commands with `;` (it has no `&&` or `||`), set a variable with `$env:NAME = "value"`, and use PowerShell or Windows commands (`Get-ChildItem`, `Get-Content`, `Remove-Item -Recurse -Force`), not bash ones.'
    : 'The shell is bash (sh where bash is missing).';

const CWD = { type: 'string', description: 'The folder to run in, relative to the project folder. Default: the project folder.' };
const NAME = { type: 'string', description: 'The name given to shell_start, for example "web".' };

export const shellRunTool: EngineTool<ShellRunArgs> = {
    name: 'shell_run',
    description: `Run one command in the project folder and wait until it ENDS. Returns its exit code, how long it took and its output (the first and last lines of a long one; the full log is saved under .joe/logs/ and file_read opens it). Use it to install, build, test and run scripts. It waits for the command to finish, so never use it to start a server, a watcher or anything else that keeps running: use shell_start for those. ${SHELL_NOTE} Nothing can be typed into a running command, so use non-interactive flags such as --yes. "timeout_seconds" defaults to 300; installs may run up to 15 minutes while they keep making progress.`,
    parameters: {
        type: 'object',
        properties: {
            command: { type: 'string', description: 'The command line to run.' },
            cwd: CWD,
            timeout_seconds: { type: 'number', description: 'Stop the command after this many seconds. Default 300.' },
        },
        required: ['command'],
    },
    parse: parseShellRunArgs,
    async run(args, ctx) {
        return outcomeOf(await gateway()('engine_shell_run', withDeadline(args, ctx), toolContextFor(ctx)), 'shell_run');
    },
};

export const shellStartTool: EngineTool<ShellStartArgs> = {
    name: 'shell_start',
    description: `Start a process that keeps running (a dev server, an API, a watcher) in the project folder, and wait until it serves. Joe reads the address it prints (http://localhost:5173/, 127.0.0.1:3000, "listening on port 8080") and the "port" you give, and returns the address that actually ANSWERED an HTTP request, never a guess. Use it, not shell_run, for anything that does not end on its own. The process runs with HOST=127.0.0.1, and with PORT only when you give "port". Starting a "name" that is already running stops the old process first. The process keeps running until shell_stop or the end of the run; shell_logs shows what it prints. ${WINDOWS ? 'The command runs in Windows PowerShell 5.1 (no `&&`; chain with `;`).' : 'The command runs in bash.'}`,
    parameters: {
        type: 'object',
        properties: {
            name: { type: 'string', description: 'A short name for the process, for example "web" or "api"; shell_logs and shell_stop use it.' },
            command: { type: 'string', description: 'The command line that starts the process, for example "npm run dev".' },
            cwd: CWD,
            port: { type: 'integer', description: 'The port it listens on, when you know it.' },
        },
        required: ['name', 'command'],
    },
    parse: parseShellStartArgs,
    async run(args, ctx) {
        return outcomeOf(await gateway()('engine_shell_start', withDeadline(args, ctx), toolContextFor(ctx)), 'shell_start');
    },
};

export const shellLogsTool: EngineTool<ShellLogsArgs> = {
    name: 'shell_logs',
    description: 'Show what a process started with shell_start has printed: its last lines (default 60), whether it is still running or how it ended, and the address it serves. The full log is saved under .joe/logs/.',
    parameters: {
        type: 'object',
        properties: {
            name: NAME,
            lines: { type: 'integer', description: 'How many of its last lines to show. Default 60.' },
        },
        required: ['name'],
    },
    parse: parseShellLogsArgs,
    async run(args, ctx) {
        return outcomeOf(await gateway()('engine_shell_logs', { ...args }, toolContextFor(ctx)), 'shell_logs');
    },
};

export const shellStopTool: EngineTool<ShellStopArgs> = {
    name: 'shell_stop',
    description: 'Stop a process started with shell_start, together with every process it started, and confirm it is gone; the port it served is checked afterwards.',
    parameters: {
        type: 'object',
        properties: { name: NAME },
        required: ['name'],
    },
    parse: parseShellStopArgs,
    async run(args, ctx) {
        return outcomeOf(await gateway()('engine_shell_stop', { ...args }, toolContextFor(ctx)), 'shell_stop');
    },
};

/** The engine's shell tools, in the order the tool list shows them. */
export const shellTools: EngineTool[] = [shellRunTool, shellStartTool, shellLogsTool, shellStopTool];

/* ───────────────────────── the run's process registry ───────────────────────── */

/**
 * The ProcessRegistry the loop holds (types.ts). start and stop go through
 * the gateway like the tools; logs and list are read from the run's registry
 * in memory, because the loop reads them synchronously; stopAll ends every
 * process directly, because cleanup at the end of a run must not depend on a
 * policy admitting it.
 *
 * The run is the registry's key, so a context without one is refused here:
 * a registry keyed by nothing would list nothing and stop nothing at the end
 * of the run, while the processes the tools started kept running. The tools
 * read the same toolContext (ctx.joe.toolContext), so both see one run.
 */
export function createProcessRegistry(toolContext: any): ProcessRegistry {
    const runId = String(toolContext?.runId || '').trim();
    if (!runId) throw new TypeError('createProcessRegistry needs the run\'s tool context with its runId: the processes a run starts are kept, listed and stopped by that id.');
    return {
        async start(spec) {
            const input = {
                name: spec.name,
                command: spec.command,
                ...(spec.cwd ? { cwd: spec.cwd } : {}),
                ...(spec.port ? { port: spec.port } : {}),
                ...(spec.readyTimeoutMs ? { ready_timeout_ms: spec.readyTimeoutMs } : {}),
            };
            const result = await gateway()('engine_shell_start', input, toolContext);
            const out = result?.output && typeof result.output === 'object' ? result.output : {};
            const served: ProcessInfo = out.served || { name: spec.name, command: spec.command, cwd: spec.cwd || '.', running: false, startedAt: Date.now() };
            const text = typeof out.text === 'string' ? out.text : `shell_start was refused by Joe's tool gateway: ${String(result?.error || 'no reason was given')}`;
            return { ...served, output: text };
        },
        logs(name, lines) {
            return readRunProcessLogs(runId, name, lines);
        },
        async stop(name) {
            const result = await gateway()('engine_shell_stop', { name }, toolContext);
            return result?.ok === true;
        },
        list() {
            return listRunProcesses(runId);
        },
        stopAll() {
            return stopAllForRun(runId);
        },
    };
}
