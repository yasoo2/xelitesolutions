
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

    constructor() {
        try {
            this.pty = require('node-pty');
        } catch (e) {
            logger.warn('[ExecutionEngine] node-pty not available, will use fallback');
        }
    }

    /**
     * Unified Execution Entry Point (Phase 2)
     */
    async execute(request: ExecutionRequest): Promise<ExecutionResult> {
        const start = Date.now();
        const sessionId = request.id || 'anonymous';
        
        logger.info(`[ENGINE] START type=${request.type} id=${sessionId} priority=${request.priority}`);

        try {
            let data: any;

            switch (request.type) {
                case 'shell':
                    data = await this.run(request.payload.command!, request.payload.options);
                    break;
                case 'pty':
                    data = await this.createSession(request.payload.options || {});
                    break;
                default:
                    throw new Error(`Unsupported execution type: ${request.type}`);
            }

            const duration = Date.now() - start;
            logger.info(`[ENGINE] END type=${request.type} id=${sessionId} duration=${duration}ms success=true`);
            
            return {
                success: true,
                data,
                duration
            };
        } catch (e: any) {
            const duration = Date.now() - start;
            logger.error(`[ENGINE] ERROR type=${request.type} id=${sessionId} duration=${duration}ms error=${e.message}`);
            
            return {
                success: false,
                error: e.message,
                duration
            };
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
     * Run a one-off command (spawn)
     */
    async run(command: string, options: ExecutionOptions = {}): Promise<any> {
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
                    exitCode: code
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
