import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../shared/utils/logger';
import { traceManager } from '../modules/services/TraceManager';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/** Stop a timed-out shell and its descendants before the next repair starts. */
function terminateProcessTree(child: any): Promise<void> {
    if (process.platform !== 'win32' || !child?.pid) {
        try { child?.kill('SIGKILL'); } catch { /* already gone */ }
        return Promise.resolve();
    }
    return new Promise(resolve => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        try {
            const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
                stdio: 'ignore', windowsHide: true,
            } as any);
            killer.once('close', finish);
            killer.once('error', () => { try { child.kill('SIGKILL'); } catch { /* already gone */ } finish(); });
            setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } finish(); }, 2000);
        } catch {
            try { child.kill('SIGKILL'); } catch { /* already gone */ }
            finish();
        }
    });
}

export interface ExecutionRequest {
    id: string;
    traceId?: string;
    type: 'shell' | 'pty' | 'internal';
    payload: {
        command?: string;
        args?: string[];
        options?: ExecutionOptions;
        input?: string;
    };
    priority: 'low' | 'normal' | 'high';
}

export interface ExecutionResult {
    success: boolean;
    data?: any;
    error?: string;
    duration: number;
}

export interface ExecutionOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    shell?: string | boolean;
    cols?: number;
    rows?: number;
    timeout?: number;
    detached?: boolean;
    /**
     *  DO NOT WAIT FOR IT — WHICH IS NOT THE SAME AS DETACH IT.
     *
     *  One flag was answering two questions. A long-running server needs
     *  «return to me now, it will not exit»; the updater needs «survive me».
     *  Because only `detached` existed, anything that must not be waited
     *  for had to be cut loose as well — and on Windows a detached shell
     *  command opens its own console window and, measured four ways on his
     *  machine, does not survive at all:
     *
     *      detached + shell + ignore                 alive: false
     *      detached + shell + ignore + windowsHide   alive: false
     *      detached + shell + pipe    + windowsHide   alive: false
     *      background + shell + pipe  + windowsHide   alive: TRUE
     *
     *  So `background` resolves as soon as the child exists, keeps the
     *  handle, and leaves the window unmade. The parent still owns it, so
     *  a restart cannot leave an orphan holding a port.
     */
    background?: boolean;
    stdio?: 'ignore' | 'pipe' | 'inherit';
    sessionId?: string;
    /**
     * Windows only, and deliberately OFF for detached children: asking for
     * DETACHED_PROCESS and CREATE_NO_WINDOW together is asking the OS to
     * reconcile two contradictory instructions, and the observed result was a
     * process that started, wrote nothing and died.
     */
    windowsHide?: boolean;
    /** Resolve when the owning Joe run is cancelled; terminate the child tree. */
    cancel?: Promise<void>;
}

export interface ExecutionSession {
    pid: number;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: () => void;
    onData: (callback: (data: string) => void) => void;
    onExit: (callback: (code: number) => void) => void;
    fallback?: boolean;
}

/**
 * ExecutionEngine
 * CENTRAL PERFORMANCE ENGINE for all system execution.
 * Phase 2.1: High Performance Secure Execution.
 */
/** The Windows executables that ship as .cmd shims rather than real .exe. */
const WIN_CMD_SHIMS = new Set(['npm', 'npx', 'yarn', 'pnpm']);

/** Resolve npm's JavaScript entrypoint so a cancellable run owns the real node process. */
function resolveNpmCli(): string | null {
    if (process.platform !== 'win32') return null;
    const candidates = [
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ];
    return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

/**
 * A Joe session must not inherit an npm installation target from the API host.
 * In particular, `npm_config_prefix` redirected every generated project's npm
 * installs into the API directory; `npm_config_cache` then made the failure
 * depend on an unrelated session's cache. Remove both after caller overrides
 * have been merged so every spawn route receives the same clean environment.
 */
function isolatedExecutionEnv(overrides?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
    for (const key of Object.keys(env)) {
        if (/^npm_config_(prefix|cache)$/i.test(key)) delete env[key];
    }
    return env;
}

/** Keep PowerShell's interactive history away from the user's protected profile. */
function terminalSessionEnv(overrides?: NodeJS.ProcessEnv, sessionId?: string): NodeJS.ProcessEnv {
    const env = isolatedExecutionEnv(overrides);
    if (process.platform !== 'win32') return env;
    const safeId = String(sessionId || process.pid).replace(/[^a-z0-9_.-]/gi, '_');
    const appData = path.join(os.tmpdir(), 'joe-terminal', safeId);
    try {
        fs.mkdirSync(path.join(appData, 'Microsoft', 'Windows', 'PowerShell', 'PSReadLine'), { recursive: true });
        env.APPDATA = appData;
        env.LOCALAPPDATA = appData;
    } catch {
        // A terminal must still start if the temporary profile cannot be made.
    }
    return env;
}

export class ExecutionEngine {
    private pty: any = null;
    private cache = new Map<string, { result: ExecutionResult, expires: number }>();
    private queue: { request: ExecutionRequest, context: any, resolve: (res: ExecutionResult) => void, reject: (err: any) => void }[] = [];
    private activeCount = 0;
    private readonly MAX_CONCURRENT = 15;
    private readonly MAX_QUEUE_SIZE = 100;
    // The UI polls read-only commands (git status for the file-tree decorations)
    // every 10s. A 5s TTL ALWAYS expired before the next poll, so the cache never
    // hit once and every poll re-ran a real `git status` (~240ms of shell work,
    // forever, for an answer that hadn't changed). The TTL must outlive the poll
    // interval to be worth anything; 15s keeps the data at most 5s staler than
    // the polling already made it.
    private readonly CACHE_TTL_MS = Math.max(1000, Number(process.env.EXEC_CACHE_TTL_MS) || 15000);

    constructor() {
        try {
            this.pty = require('node-pty');
        } catch (e) {
            logger.warn('[ExecutionEngine] node-pty not available, will use fallback');
        }
        
        // Periodic cache cleanup (Optimized to be non-blocking)
        const cacheCleanupTimer = setInterval(() => {
            if (this.cache.size === 0) return;
            const now = Date.now();
            const keysToDelete: string[] = [];
            for (const [key, val] of this.cache) {
                if (now > val.expires) keysToDelete.push(key);
            }
            keysToDelete.forEach(k => this.cache.delete(k));
        }, 60000); // 1 minute cleanup is enough
        cacheCleanupTimer.unref?.();
    }

    private generateCacheKey(request: ExecutionRequest): string {
        const payload = request.payload;
        const env = payload.options?.env || {};
        const envKeys = Object.keys(env).sort();
        const envString = envKeys.map(k => `${k}=${env[k]}`).join(',');

        const parts = [
            request.type,
            payload.command || '',
            (payload.args || []).join(','),
            payload.options?.cwd || '',
            envString
        ];
        const rawKey = parts.join('|');
        
        // Use a simple hash to keep the map key length manageable
        const crypto = require('crypto');
        return crypto.createHash('md5').update(rawKey).digest('hex');
    }

    private isCacheable(request: ExecutionRequest): boolean {
        if (request.type !== 'shell') return false;
        const cmd = (request.payload.command || '').toLowerCase();
        // Safe read-only commands
        const safeCommands = ['ls', 'git log', 'git status', 'pwd', 'df', 'whoami', 'cat', 'grep', 'find', 'du', 'where', 'which'];
        return safeCommands.some(c => cmd.startsWith(c));
    }

    /**
     * Unified Execution Entry Point (Phase 2.2 Optimized)
     */
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
        // 1. Cache Check (Deterministic & Short-Circuiting)
        if (this.isCacheable(request)) {
            const key = this.generateCacheKey(request);
            const cached = this.cache.get(key);
            if (cached && Date.now() < cached.expires) {
                // debug, not info: this fires on every background poll and was
                // drowning the real orchestration lines in the console.
                logger.debug(`[CACHE HIT] execution skipped id=${request.id || 'anon'} key=${key} cmd=${request.payload.command}`);
                return { ...cached.result, duration: 0 };
            }
            logger.debug(`[CACHE MISS] executing engine id=${request.id || 'anon'} key=${key} cmd=${request.payload.command}`);
        }

        // 2. Concurrency Control (Queue)
        if (this.activeCount >= this.MAX_CONCURRENT) {
            if (this.queue.length >= this.MAX_QUEUE_SIZE) {
                logger.warn(`[ENGINE] [QUEUE FULL] rejecting id=${request.id || 'anon'}`);
                return {
                    success: false,
                    error: 'Execution queue is full. Please try again later.',
                    data: { code: 'QUEUE_FULL' },
                    duration: 0
                };
            }
            return new Promise((resolve, reject) => {
                const context = executionFirewall.context?.getStore();
                this.queue.push({ request, context, resolve, reject });
            });
        }

        return this.processExecution(request);
    }

    private async processExecution(request: ExecutionRequest): Promise<ExecutionResult> {
        this.activeCount++;
        const start = Date.now();
        const sessionId = request.id || 'anonymous';
        
        if (request.traceId) {
            traceManager.logEvent(request.traceId, 'execution', {
                mode: request.type,
                command: request.payload.command,
                args: request.payload.args,
                cwd: request.payload.options?.cwd,
                timestamp: start
            });
        }
        
        try {
            let data: any;

            switch (request.type) {
                case 'shell':
                    // When a real argv array is supplied, spawn it verbatim — no
                    // whitespace re-splitting. This is how git (and any tool with
                    // arguments that contain spaces, like a commit message) runs
                    // correctly WITHOUT any caller importing child_process. The
                    // engine stays the single execution authority.
                    if (Array.isArray(request.payload.args) && request.payload.command) {
                        data = await this.runArgvInternal(request.payload.command, request.payload.args, request.payload.options);
                    } else {
                        data = await this.runCommandInternal(request.payload.command!, request.payload.options);
                    }
                    break;
                case 'pty':
                    data = await this.createSession(request.payload.options || {});
                    break;
                default:
                    throw new Error(`Unsupported execution type: ${request.type}`);
            }

            const duration = Date.now() - start;
            if (duration > 500) {
                logger.warn(`[ENGINE] SLOW EXECUTION id=${sessionId} duration=${duration}ms cmd=${request.payload.command?.substring(0, 50)}`);
            } else {
                // Reduced log for fast execution
                logger.debug(`[ENGINE] OK id=${sessionId} duration=${duration}ms`);
            }
            
            const result: ExecutionResult = {
                success: true,
                data,
                duration
            };

            if (request.traceId) {
                traceManager.logEvent(request.traceId, 'execution', {
                    status: 'success',
                    duration,
                    output: typeof data === 'string' ? data.substring(0, 1000) : (data?.output?.substring(0, 1000) || 'binary/object')
                });
            }

            // 3. Cache Storage
            if (this.isCacheable(request)) {
                const key = this.generateCacheKey(request);
                this.cache.set(key, { result, expires: Date.now() + this.CACHE_TTL_MS });
            }

            return result;
        } catch (e: any) {
            const duration = Date.now() - start;
            logger.error(`[ENGINE] ERROR id=${sessionId} duration=${duration}ms error=${e.message}`);
            
            if (request.traceId) {
                traceManager.logEvent(request.traceId, 'execution', {
                    status: 'failed',
                    duration,
                    error: e.message
                });
            }

            return {
                success: false,
                error: e.message,
                duration
            };
        } finally {
            this.activeCount--;
            this.processQueue();
        }
    }

    private processQueue() {
        if (this.queue.length > 0 && this.activeCount < this.MAX_CONCURRENT) {
            const next = this.queue.shift();
            if (next) {
                const run = () => this.processExecution(next.request).then(next.resolve).catch(next.reject);
                if (next.context) {
                    executionFirewall.context.run(next.context, run);
                } else {
                    run();
                }
            }
        }
    }

    private resolveShell(requestedShell?: string): string {
        if (process.platform === 'win32') return 'powershell.exe';
        if (requestedShell && fs.existsSync(requestedShell)) return requestedShell;
        if (fs.existsSync('/bin/bash')) return '/bin/bash';
        if (fs.existsSync('/bin/sh')) return '/bin/sh';
        return '/bin/sh';
    }

    private getWorkspaceRoot() {
        try {
            const { workspaceService } = require('../services/WorkspaceService');
            return workspaceService.getActiveRoot();
        } catch {
            return process.cwd();
        }
    }

    /**
     * Create an interactive terminal session (PTY)
     */
    async createSession(options: ExecutionOptions): Promise<ExecutionSession> {
        const shell = this.resolveShell(options.shell as string);
        const cwd = options.cwd || this.getWorkspaceRoot();

        if (this.pty) {
            try {
                // Automation terminals must not load a user's PowerShell profile:
                // a trust prompt from PSReadLine can block the first build command
                // while the orchestration layer is correctly waiting for output.
                const shellArgs = process.platform === 'win32' && /(?:^|[\\/])powershell(?:\.exe)?$/i.test(shell)
                    ? ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit']
                    : [];
                const ptyProcess = this.pty.spawn(shell, shellArgs, {
                    name: 'xterm-256color',
                    cols: options.cols || 80,
                    rows: options.rows || 30,
                    cwd: cwd,
                    env: { ...terminalSessionEnv(options.env, options.sessionId), TERM: 'xterm-256color' }
                });

                return {
                    pid: ptyProcess.pid,
                    write: (data: string) => ptyProcess.write(data),
                    resize: (cols: number, rows: number) => ptyProcess.resize(cols, rows),
                    kill: () => ptyProcess.kill(),
                    onData: (cb) => ptyProcess.onData(cb),
                    onExit: (cb) => ptyProcess.on('exit', cb)
                };
            } catch (e: any) {
                logger.error(`[ExecutionEngine] PTY spawn failed: ${e.message}`);
                throw e;
            }
        }

        return this.createFallbackSession(shell, cwd, options);
    }

    private createFallbackSession(shell: string, cwd: string, options: ExecutionOptions): ExecutionSession {
        const { exec } = require('child_process');
        let currentCwd = cwd;
        let dataCallback: (data: string) => void = () => {};
        let exitCallback: (code: number) => void = () => {};

        const executeCommand = (cmd: string): Promise<string> => {
            return new Promise((resolve) => {
                const cdMatch = cmd.match(/^cd\s+(.+)$/);
                if (cdMatch) {
                    const newPath = cdMatch[1].trim();
                    const targetPath = path.isAbsolute(newPath) ? newPath : path.resolve(currentCwd, newPath);
                    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
                        currentCwd = targetPath;
                        resolve('');
                    } else {
                        resolve(`cd: no such directory: ${newPath}\n`);
                    }
                    return;
                }

                // '/bin/sh' does not exist on Windows — when node-pty is missing
                // there, this hardcoded shell made EVERY manual command fail.
                // undefined lets Node pick the platform default (cmd.exe / sh).
                exec(cmd, { cwd: currentCwd, env: isolatedExecutionEnv(options.env), shell: process.platform === 'win32' ? undefined : '/bin/sh', timeout: 30000 }, (err: any, stdout: string, stderr: string) => {
                    if (err && !stdout && !stderr) {
                        resolve(`Error: ${err.message}\n`);
                    } else {
                        resolve((stdout || '') + (stderr || ''));
                    }
                });
            });
        };

        const ptyWrapper = {
            pid: process.pid,
            write: async (data: string) => {
                let currentLine = '';
                for (const char of data) {
                    if (char === '\r' || char === '\n') {
                        dataCallback('\r\n');
                        const cmd = currentLine.trim();
                        currentLine = '';
                        if (cmd) {
                            const output = await executeCommand(cmd);
                            if (output) dataCallback(output);
                        }
                        dataCallback(`${path.basename(currentCwd)}$ `);
                    } else if (char === '\x7f' || char === '\b') {
                        if (currentLine.length > 0) {
                            currentLine = currentLine.slice(0, -1);
                            dataCallback('\b \b');
                        }
                    } else if (char === '\x03') {
                        currentLine = '';
                        dataCallback('^C\r\n');
                        dataCallback(`${path.basename(currentCwd)}$ `);
                    } else {
                        currentLine += char;
                        dataCallback(char);
                    }
                }
            },
            resize: () => {},
            kill: () => exitCallback(0),
            onData: (cb: any) => { dataCallback = cb; setTimeout(() => dataCallback(`${path.basename(currentCwd)}$ `), 100); },
            onExit: (cb: any) => { exitCallback = cb; },
            fallback: true
        };

        return ptyWrapper;
    }

    /**
     * Run a one-off command (legacy/internal wrapper)
     * Now forced through the execute() gateway for performance and safety.
     */
    async run(command: string, options: ExecutionOptions = {}): Promise<any> {
        const result = await this.execute({
            id: 'run_' + Date.now(),
            type: 'shell',
            payload: {
                command,
                options
            },
            priority: 'normal'
        });

        return {
            ok: result.success,
            output: result.data?.output || '',
            error: result.error || result.data?.error || '',
            pid: result.data?.pid,
            duration: result.duration
        };
    }

    /**
     * Run a program with a REAL argv array (no shell, no whitespace splitting).
     * The sanctioned way for a tool to run git/npm/etc with arguments that
     * contain spaces — the caller never touches child_process, so the Single
     * Execution Authority (and its boot-time enforcer) stays intact.
     */
    async runArgv(file: string, args: string[], options: ExecutionOptions = {}): Promise<any> {
        const result = await this.execute({
            id: 'runargv_' + Date.now(),
            type: 'shell',
            payload: { command: file, args, options },
            priority: 'normal'
        });
        return {
            ok: result.success && (result.data?.ok !== false),
            output: result.data?.output || '',
            error: result.data?.error || result.error || '',
            exitCode: result.data?.exitCode,
            pid: result.data?.pid,
            duration: result.duration
        };
    }

    /**
     * STREAMING / LONG-RUNNING execution — the sanctioned way for a tool to
     * WATCH a process line by line (npm install progress, vite build output)
     * or keep one alive and kill it later (a scaffolded server booted for a
     * live write/read proof). Same Single Execution Authority, argv
     * semantics; the caller never touches child_process, so the boot-time
     * enforcer stays intact — this method exists precisely because the
     * enforcer BLOCKED STARTUP on the user's machine when four build tools
     * carried their own spawn calls (field log, 2026-08-03).
     *
     * Returns immediately with { done, kill, pid }: `done` resolves with the
     * exit outcome (never rejects), `kill` stops the child. exitCode is 124
     * on timeout, null when the process could not start at all.
     */
    runArgvStreaming(file: string, args: string[], options: ExecutionOptions & {
        onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
    } = {}): { done: Promise<{ ok: boolean; exitCode: number | null; error?: string }>; kill: () => void; pid?: number } {
        const { onLine, ...rest } = options;
        // npm/npx/yarn/pnpm on Windows are .cmd shims, and since the fix for
        // CVE-2024-27980 (Node 18.20.2 / 20.12.2 / 21.7.3 and everything after)
        // spawning a .cmd or .bat WITHOUT a shell throws outright:
        //
        //   Node app failed: internal_exception: Error: spawn EINVAL
        //       at ExecutionEngine.runArgvStreaming
        //
        // That is the field log, on Node 24: nineteen files of a React project
        // scaffolded, and then `npm install` died before it began. An earlier
        // change here chose `npm.cmd` with no shell to silence a DEP0190
        // deprecation WARNING — and bought a hard failure with it. A warning is
        // survivable; EINVAL is not. The shell comes back, and the arguments are
        // quoted here rather than left to it.
        const isWin = process.platform === 'win32';
        const npmCli = isWin && /^npm(?:\.cmd)?$/i.test(file) ? resolveNpmCli() : null;
        const isShim = WIN_CMD_SHIMS.has(file) || /\.(cmd|bat)$/i.test(file);
        const needsShell = !npmCli && isWin && rest.shell === undefined && isShim;
        const cmd = npmCli ? process.execPath : (isWin && WIN_CMD_SHIMS.has(file)) ? `${file}.cmd` : file;
        const spawnArgs = npmCli ? [npmCli, ...args] : args;
        /** cmd.exe quoting: wrap anything with a space or a metacharacter, and
         *  double an embedded quote — the same rule cmd.exe itself applies. */
        const quoteForCmd = (a: string) => {
            const v = String(a);
            if (!/[\s"&|<>^()%!]/.test(v)) return v;
            return `"${v.replace(/"/g, '""')}"`;
        };
        /**
         * WHY THE COMMAND LINE IS JOINED RATHER THAN PASSED AS ARGV.
         *
         * Node 22 prints on every boot:
         *   [DEP0190] Passing args to a child process with shell option true
         *   can lead to security vulnerabilities, as the arguments are not
         *   escaped, only concatenated.
         *
         * It is right: with `shell: true` node concatenates argv with no
         * quoting at all. We already quote each argument for cmd.exe above —
         * that is what quoteForCmd exists for — so building the line ourselves
         * both removes the warning from the user's log and leaves the quoting
         * with the code that understands the shell it is quoting for.
         */
        const useShell = rest.shell !== undefined ? rest.shell : needsShell;
        const line = useShell ? [quoteForCmd(cmd), ...spawnArgs.map(quoteForCmd)].join(' ') : '';
        const child = useShell
            ? spawn(line, [], {
                cwd: rest.cwd || this.getWorkspaceRoot(),
                env: isolatedExecutionEnv(rest.env),
                shell: true,
                /**
                 *  A CHILD WITH NO CONSOLE TO INHERIT MAKES ITS OWN.
                 *
                 *  He photographed a black window over his work twice and
                 *  wrote «ظهرت مره اخرى». The count I answered with was wrong:
                 *  it counted cmd.exe and conhost.exe PROCESSES, and a console
                 *  process is not a console WINDOW. Counting the visible
                 *  top-level windows instead — by class, ConsoleWindowClass
                 *  and CASCADIA_HOSTING_WINDOW_CLASS — the four shapes
                 *  separate cleanly, and the window even carries its title:
                 *
                 *      shell + wait                        windows +0
                 *      shell + detached                    windows +2  «npm run hi»
                 *      shell + detached + windowsHide      windows +0
                 *      shell + wait     + windowsHide      windows +0
                 *
                 *  A child that keeps our console prints into it and opens
                 *  nothing. A DETACHED child has no console to inherit, so
                 *  Windows gives it a new one — and that new one is the
                 *  window he sees. `windowsHide` is what declines it.
                 *
                 *  Two of this engine's four spawn paths asked for it and two
                 *  did not, so whether he saw a window depended on which door
                 *  a caller happened to come through. It is the same question
                 *  every time, so it is answered in one place: hidden unless a
                 *  caller explicitly asks for a console. Nobody here does.
                 */
                windowsHide: (rest as any).windowsHide !== false,
            } as any)
            : spawn(cmd, spawnArgs, {
                cwd: rest.cwd || this.getWorkspaceRoot(),
                env: isolatedExecutionEnv(rest.env),
                shell: false,
                windowsHide: (rest as any).windowsHide !== false,
            } as any);
        const feed = (stream: 'stdout' | 'stderr') => (b: Buffer) => {
            if (!onLine) return;
            String(b).split(/\r?\n/).filter(Boolean).forEach(l => { try { onLine(l, stream); } catch { /* observer errors never kill the child */ } });
        };
        child.stdout?.on('data', feed('stdout'));
        child.stderr?.on('data', feed('stderr'));
        let settled = false;
        let cancelRequested = false;
        const done = new Promise<{ ok: boolean; exitCode: number | null; error?: string }>((resolve) => {
            const t = rest.timeout ? setTimeout(() => {
                if (settled) return;
                settled = true;
                void terminateProcessTree(child).finally(() => resolve({ ok: false, exitCode: 124, error: 'timeout' }));
            }, rest.timeout) : null;
            const cancel = () => {
                if (settled) return;
                cancelRequested = true;
                void terminateProcessTree(child).finally(() => {
                    if (settled) return;
                    settled = true;
                    if (t) clearTimeout(t);
                    resolve({ ok: false, exitCode: 130, error: 'cancelled' });
                });
            };
            if (rest.cancel) void rest.cancel.then(cancel).catch(() => { /* cancellation is best effort */ });
            child.on('close', (code) => {
                if (settled) return; settled = true;
                if (t) clearTimeout(t);
                resolve(cancelRequested
                    ? { ok: false, exitCode: 130, error: 'cancelled' }
                    : { ok: code === 0, exitCode: code });
            });
            child.on('error', (err) => {
                if (settled) return; settled = true;
                if (t) clearTimeout(t);
                resolve({ ok: false, exitCode: null, error: err.message });
            });
        });
        return { done, kill: () => { void terminateProcessTree(child); }, pid: child.pid };
    }

    /**
     * A PROCESS THAT OUTLIVES THIS ONE.
     *
     * There is exactly one job that needs it: Joe updating himself. The updater
     * stops the server on port 5002, rebuilds, and starts it again — so it
     * cannot be a child of the server it is about to kill, and it cannot write
     * to a pipe nobody will be alive to read.
     *
     * `detached` has been declared in ExecutionOptions all along and honoured
     * nowhere: every path here spawns an attached child and awaits it. An
     * option with no implementation is the exact failure the wiring policy
     * exists to catch, so it gets a real method instead of a silent flag.
     *
     * Output goes to a file rather than a pipe, which is also what lets the UI
     * show the update's progress after the socket it asked over has died.
     */
    runDetached(
        file: string,
        args: string[],
        options: ExecutionOptions & { logFile?: string; outFile?: string; noteFile?: string } = {},
    ): { ok: boolean; pid?: number; logFile?: string; error?: string } {
        // Where the child's OWN stdout/stderr land. Kept separate from any file
        // the child writes to itself: two writers on one file is precisely the
        // shape that failed silently on Windows.
        const streamTo = options.outFile || options.logFile;
        // Where Joe's own remarks go — the exit code, a failure to launch.
        const noteTo = options.noteFile || options.logFile;
        let out: number | 'ignore' = 'ignore';
        try {
            if (streamTo) {
                fs.mkdirSync(path.dirname(streamTo), { recursive: true });
                // append: the caller usually writes a header line first, and
                // truncating here would throw it away.
                out = fs.openSync(streamTo, 'a');
            }
        } catch { out = 'ignore'; }
        const note = (line: string) => {
            try { if (noteTo) fs.appendFileSync(noteTo, line.endsWith('\n') ? line : `${line}\n`); }
            catch { /* the log is a courtesy, never a failure */ }
        };
        try {
            /**
             * DETACHED EVERYWHERE EXCEPT WINDOWS — AND WINDOWS IS WHY.
             *
             * On POSIX `detached` means setsid(), which is exactly what lets an
             * updater outlive the server it is about to kill. On Windows it
             * means DETACHED_PROCESS: the child gets NO CONSOLE AT ALL. And
             * powershell.exe is a console host — with no console its host
             * cannot initialise, so it exits immediately, having run nothing,
             * WITH STATUS 0.
             *
             * That is precisely what his machine reported: found, launched,
             * not one byte written, gone — and no exit code note, because the
             * status was «success». Windows does not kill children when a
             * parent is terminated (no job object is involved), so on Windows
             * the child outlives Joe without being detached at all. It simply
             * inherits the console it needs.
             */
            const detach = options.detached !== undefined
                ? options.detached
                : process.platform !== 'win32';
            const child = spawn(file, args, {
                cwd: options.cwd || this.getWorkspaceRoot(),
                env: isolatedExecutionEnv(options.env),
                detached: detach,
                // stdin closed: a detached updater must never sit waiting on a
                // keypress nobody can give it.
                stdio: ['ignore', out, out],
                shell: options.shell !== undefined ? options.shell : false,
                /**
                 * NOT HIDDEN — BECAUSE DETACHED ALREADY MEANS NO CONSOLE.
                 *
                 * A detached child is created with DETACHED_PROCESS, and
                 * Windows documents CREATE_NO_WINDOW as invalid together with
                 * it. Asking for both is asking the OS to reconcile two
                 * contradictory instructions, and on his machine the result was
                 * a process that was created, produced not one byte, and died:
                 * «العملية انتهت دون أن تبدأ», twice, deterministically.
                 * There is no window to hide when there is no console.
                 */
                /**
                 *  HIDING THE WINDOW DOES NOT KILL THE CHILD. MEASURED.
                 *
                 *  This defaulted to FALSE — show the console — on the
                 *  reasoning recorded above: that asking for a detached
                 *  child AND a hidden window produced a process which was
                 *  created, printed nothing, and died.
                 *
                 *  The observation was real. The inference was wrong, and
                 *  he paid for it twice in one morning with a black console
                 *  window opening over his work — first running `npm start`
                 *  for a generated project, then a bare cmd.exe sitting in
                 *  its directory.
                 *
                 *  Measured on his machine, spawning a real server four ways
                 *  and then asking the port whether anything answered:
                 *
                 *      detached + shell   + ignore                alive: false
                 *      detached + shell   + ignore + windowsHide  alive: false
                 *      detached + NOshell + pipe   + windowsHide  alive: TRUE
                 *      background + shell + pipe   + windowsHide  alive: TRUE
                 *
                 *  The killer is `detached` with a SHELL command, in both
                 *  hide states. Hiding changes nothing about survival — the
                 *  two live cases are both hidden. So the window was never
                 *  the price of a working child; it was a conclusion drawn
                 *  from a coincidence, and six call sites inherited it.
                 *
                 *  A caller that genuinely wants a console can still ask for
                 *  one; nobody in this repository does.
                 */
                windowsHide: options.windowsHide !== false,
            } as any);
            /**
             * A FAILED SPAWN IS NOT A SUCCESS — AND MUST NOT KILL ITS HOST.
             *
             * spawn() does NOT throw when the binary is missing. It returns a
             * child with no pid and emits 'error' on a later tick, and an
             * 'error' event with no listener is an uncaught exception: Joe
             * ITSELF died the moment an updater could not be launched. With
             * nothing left to answer the interface, «الخطوة 1 من 4» sat on the
             * screen for half an hour — the failure was total and invisible at
             * the same time. Measured, not guessed: pid is `undefined` here and
             * this function used to return ok:true.
             *
             * Now the event is caught, written where the user can read it, and
             * a missing binary is reported as the failure it is.
             */
            child.on('error', (e: any) => {
                note(`[X] تعذّر تشغيل ${file}: ${e?.message || e}`);
                try { console.error(`[ExecutionEngine] runDetached(${file}) failed: ${e?.message || e}`); } catch { /* never fatal */ }
            });
            if (!child.pid) {
                const error = `${file} — لم يبدأ (تعذّر العثور على البرنامج أو تشغيله)`;
                note(`[X] ${error}`);
                return { ok: false, error };
            }
            /**
             * A DEATH WITH A NUMBER ON IT.
             *
             * «العملية انتهت دون أن تبدأ» was as far as the diagnosis could go:
             * the child was created, wrote nothing, and vanished — and nothing
             * anywhere recorded WHY. An exit code is one line and it is the
             * difference between «it died» and «it died with 0xC0000142». The
             * listener holds no handle of its own, so it cannot keep this
             * process alive; it simply speaks if the child dies while Joe is
             * still here to hear it.
             */
            const startedAt = Date.now();
            child.on('exit', (code: number | null, signal: string | null) => {
                const secs = Math.round((Date.now() - startedAt) / 1000);
                /**
                 * EVEN A ZERO IS NEWS.
                 *
                 * The first version of this line skipped code 0 — «a clean
                 * finish needs no remark» — and that silence cost a whole
                 * round: the updater was exiting 0 in about a second, having
                 * done nothing, and the log said only that it had ended. «It
                 * succeeded immediately» is the most damning sentence there is
                 * for a process that should take two minutes, and it must be
                 * written down.
                 */
                note(`[!] ${path.basename(file)} انتهى بعد ${secs} ثانية`
                    + ` — رمز الخروج ${code === null ? `(إشارة ${signal})` : code}`
                    + (code ? ` (0x${(code >>> 0).toString(16)})` : ''));
            });
            child.unref();
            return { ok: true, pid: child.pid, logFile: options.logFile };
        } catch (e: any) {
            return { ok: false, error: e?.message || 'spawn_failed' };
        } finally {
            // The parent's copy of the descriptor is not needed; the child holds its own.
            if (typeof out === 'number') { try { fs.closeSync(out); } catch { /* already closed */ } }
        }
    }

    private async runArgvInternal(file: string, args: string[], options: ExecutionOptions = {}): Promise<any> {
        return new Promise((resolve) => {
            const child = spawn(file, args, {
                cwd: options.cwd || this.getWorkspaceRoot(),
                env: isolatedExecutionEnv(options.env),
                shell: false, // argv is already tokenized — never let a shell re-parse it
                stdio: options.stdio || 'pipe',
                //  Same question, same answer — see the note in runArgvStreaming.
                windowsHide: options.windowsHide !== false,
            } as any);
            // An argv launch can be a long-lived local server too. Resolve once
            // the process exists, while retaining the same gateway-owned child
            // that project_stop can terminate later.
            if (options.background || options.detached) {
                let settled = false;
                const finish = (result: any) => {
                    if (settled) return;
                    settled = true;
                    resolve(result);
                };
                child.once('error', (err) => finish({ ok: false, error: err.message, exitCode: null, pid: child.pid }));
                if (options.detached) child.unref();
                setTimeout(() => finish({
                    ok: child.exitCode === null || child.exitCode === 0,
                    pid: child.pid,
                    exitCode: child.exitCode,
                }), 100);
                return;
            }
            let stdout = '';
            let stderr = '';
            let done = false;
            let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
            child.stdout?.on('data', (d) => { stdout += d.toString(); });
            child.stderr?.on('data', (d) => { stderr += d.toString(); });
            child.on('close', (code) => {
                if (done) return; done = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                resolve({ ok: code === 0, output: stdout, error: stderr, exitCode: code, pid: child.pid });
            });
            child.on('error', (err) => {
                if (done) return; done = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                resolve({ ok: false, error: err.message, exitCode: 1 });
            });
            if (options.timeout) {
                timeoutTimer = setTimeout(() => {
                    if (done) return; done = true;
                    try { child.kill('SIGKILL'); } catch {}
                    resolve({ ok: false, error: 'Execution timed out', exitCode: 124 });
                }, options.timeout);
            }
        });
    }

    private async runCommandInternal(command: string, options: ExecutionOptions = {}): Promise<any> {
        return new Promise((resolve) => {
            const parts = command.trim().split(/\s+/);
            const cmd = parts[0];
            const args = parts.slice(1);

            const child = spawn(cmd, args, {
                cwd: options.cwd || this.getWorkspaceRoot(),
                env: isolatedExecutionEnv(options.env),
                shell: options.shell !== undefined ? options.shell : true,
                detached: options.detached,
                windowsHide: options.windowsHide !== false,
                stdio: options.stdio || 'pipe'
            });

            if (options.detached || options.background) {
                //  Only a DETACHED child is disowned. A background child is
                //  still ours: that is the whole difference between the two.
                if (options.detached) child.unref();
                setTimeout(() => {
                    resolve({
                        ok: child.exitCode === null || child.exitCode === 0,
                        pid: child.pid,
                        exitCode: child.exitCode
                    });
                }, 100);
                return;
            }

            let stdout = '';
            let stderr = '';
            let done = false;
            let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
            }

            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }

            child.on('close', (code) => {
                if (done) return; done = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                resolve({
                    ok: code === 0,
                    output: stdout,
                    error: stderr,
                    exitCode: code,
                    pid: child.pid
                });
            });

            child.on('error', (err) => {
                if (done) return; done = true;
                if (timeoutTimer) clearTimeout(timeoutTimer);
                resolve({
                    ok: false,
                    error: err.message,
                    exitCode: 1
                });
            });

            if (options.timeout) {
                timeoutTimer = setTimeout(() => {
                    if (done) return; done = true;
                    try { child.kill(); } catch {}
                    resolve({ ok: false, error: 'Execution timed out', exitCode: 124 });
                }, options.timeout);
            }
        });
    }

    /**
     * Run a system command synchronously (INTERNAL ONLY).
     * Now private to prevent bypass.
     */
    private runCommandInternalSync(command: string, options: any = {}) {
        const { spawnSync } = require('child_process');
        const parts = command.trim().split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);
        
        logger.warn(`[ENGINE] [INTERNAL SYNC] executing: ${command}`);

        const result = spawnSync(cmd, args, {
            ...options,
            encoding: 'utf8',
            env: isolatedExecutionEnv(options.env)
        });

        return {
            ok: result.status === 0,
            output: result.stdout || '',
            error: result.stderr || '',
            exitCode: result.status,
            pid: result.pid
        };
    }
}

export const executionEngine = new ExecutionEngine();
