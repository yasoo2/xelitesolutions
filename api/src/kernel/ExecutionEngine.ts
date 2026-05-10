
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { logger } from '../shared/utils/logger';

export interface ExecutionRequest {
    id: string;
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
    stdio?: 'ignore' | 'pipe' | 'inherit';
    sessionId?: string;
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
export class ExecutionEngine {
    private pty: any = null;
    private cache = new Map<string, { result: ExecutionResult, expires: number }>();
    private queue: { request: ExecutionRequest, resolve: (res: ExecutionResult) => void, reject: (err: any) => void }[] = [];
    private activeCount = 0;
    private readonly MAX_CONCURRENT = 15;
    private readonly MAX_QUEUE_SIZE = 100;
    private readonly CACHE_TTL_MS = 5000;

    constructor() {
        try {
            this.pty = require('node-pty');
        } catch (e) {
            logger.warn('[ExecutionEngine] node-pty not available, will use fallback');
        }
        
        // Periodic cache cleanup
        setInterval(() => {
            const now = Date.now();
            for (const [key, val] of this.cache) {
                if (now > val.expires) this.cache.delete(key);
            }
        }, 30000);
    }

    private generateCacheKey(request: ExecutionRequest): string {
        const payload = request.payload;
        const parts = [
            request.type,
            payload.command || '',
            (payload.args || []).join(','),
            payload.options?.cwd || ''
        ];
        return parts.join('|');
    }

    private isCacheable(request: ExecutionRequest): boolean {
        if (request.type !== 'shell') return false;
        const cmd = (request.payload.command || '').toLowerCase();
        // Safe read-only commands
        const safeCommands = ['ls', 'git log', 'git status', 'pwd', 'df', 'whoami', 'cat', 'grep', 'find', 'du'];
        return safeCommands.some(c => cmd.startsWith(c));
    }

    /**
     * Unified Execution Entry Point (Phase 2.2 Optimized)
     */
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
        // 1. Cache Check
        if (this.isCacheable(request)) {
            const key = this.generateCacheKey(request);
            const cached = this.cache.get(key);
            if (cached && Date.now() < cached.expires) {
                logger.info(`[ENGINE] [CACHE HIT] id=${request.id || 'anon'} key=${key}`);
                // Return a copy to prevent mutation issues
                return { ...cached.result, duration: 0 };
            }
            logger.debug(`[ENGINE] [CACHE MISS] id=${request.id || 'anon'} key=${key}`);
        }

        // 2. Concurrency Control (Queue)
        if (this.activeCount >= this.MAX_CONCURRENT) {
            if (this.queue.length >= this.MAX_QUEUE_SIZE) {
                logger.warn(`[ENGINE] [QUEUE FULL] rejecting id=${request.id || 'anon'}`);
                return {
                    success: false,
                    error: 'Execution queue is full. Please try again later.',
                    duration: 0
                };
            }
            return new Promise((resolve, reject) => {
                this.queue.push({ request, resolve, reject });
            });
        }

        return this.processExecution(request);
    }

    private async processExecution(request: ExecutionRequest): Promise<ExecutionResult> {
        this.activeCount++;
        const start = Date.now();
        const sessionId = request.id || 'anonymous';
        
        try {
            let data: any;

            switch (request.type) {
                case 'shell':
                    data = await this.runCommandInternal(request.payload.command!, request.payload.options);
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

            // 3. Cache Storage
            if (this.isCacheable(request)) {
                const key = this.generateCacheKey(request);
                this.cache.set(key, { result, expires: Date.now() + this.CACHE_TTL_MS });
            }

            return result;
        } catch (e: any) {
            const duration = Date.now() - start;
            logger.error(`[ENGINE] ERROR id=${sessionId} duration=${duration}ms error=${e.message}`);
            
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
                this.processExecution(next.request)
                    .then(next.resolve)
                    .catch(next.reject);
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
                const ptyProcess = this.pty.spawn(shell, [], {
                    name: 'xterm-256color',
                    cols: options.cols || 80,
                    rows: options.rows || 30,
                    cwd: cwd,
                    env: { ...process.env, ...options.env, TERM: 'xterm-256color' }
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

                exec(cmd, { cwd: currentCwd, shell: '/bin/sh', timeout: 30000 }, (err: any, stdout: string, stderr: string) => {
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

    private async runCommandInternal(command: string, options: ExecutionOptions = {}): Promise<any> {
        return new Promise((resolve) => {
            const parts = command.trim().split(/\s+/);
            const cmd = parts[0];
            const args = parts.slice(1);
            
            const child = spawn(cmd, args, {
                cwd: options.cwd || this.getWorkspaceRoot(),
                env: { ...process.env, ...options.env },
                shell: options.shell !== undefined ? options.shell : true,
                detached: options.detached,
                stdio: options.stdio || 'pipe'
            });

            if (options.detached) {
                child.unref();
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
                resolve({
                    ok: code === 0,
                    output: stdout,
                    error: stderr,
                    exitCode: code,
                    pid: child.pid
                });
            });

            child.on('error', (err) => {
                resolve({
                    ok: false,
                    error: err.message,
                    exitCode: 1
                });
            });

            if (options.timeout) {
                setTimeout(() => {
                    try { child.kill(); } catch {}
                    resolve({ ok: false, error: 'Execution timed out', exitCode: 124 });
                }, options.timeout);
            }
        });
    }

    /**
     * Run a system command synchronously.
     * ONLY for metadata/checks.
     */
    runSync(command: string, options: any = {}) {
        const { spawnSync } = require('child_process');
        const [cmd, ...args] = command.split(' ');
        
        const result = spawnSync(cmd, args, {
            ...options,
            encoding: 'utf8',
            env: { ...process.env, ...(options.env || {}) }
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
