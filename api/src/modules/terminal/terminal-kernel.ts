
import fs from 'fs';
import path from 'path';
import { terminals, registerTerminal, removeTerminal } from '../tools/terminal/TerminalState';
import { broadcast, registerTerminalOwner } from '../../api/ws';
import { logger } from '../../shared/utils/logger';
import { sshManager } from './ssh-manager';
import { ServerConfigModel } from '../../shared/models/ServerConfigModel';
import mongoose from 'mongoose';

function resolveShell(requestedShell?: string): string {
    if (process.platform === 'win32') return 'powershell.exe';
    if (requestedShell && fs.existsSync(requestedShell)) return requestedShell;
    if (fs.existsSync('/bin/bash')) return '/bin/bash';
    if (fs.existsSync('/bin/sh')) return '/bin/sh';
    return '/bin/sh';
}

function getWorkspaceRoot() {
    try {
        const { workspaceService } = require('../services/WorkspaceService');
        return workspaceService.getActiveRoot();
    } catch {
        return process.cwd();
    }
}

/**
 * TerminalKernel
 * Central control layer for all terminal operations.
 * Phase 1: Infrastructure Cleanup & Control Routing.
 */
export class TerminalKernel {
    /**
     * Create a new terminal session
     */
    async createTerminal(id: string, options: { serverId?: string; shell?: string; cwd?: string; cols?: number; rows?: number; userId?: string }) {
        const ts = Date.now();
        logger.info(`[kernel.session.created] sessionId=${id} ts=${ts} serverId=${options.serverId || 'local'}`);
        if (options.serverId) {
            // Remote sessions are managed by sshManager for now, but routed via Kernel
            await sshManager.requestShell(options.serverId, id);
            return { id, serverId: options.serverId };
        }

        if (terminals.has(id)) {
            logger.info(`[Kernel] Terminal already exists: ${id}`);
            return { id, existing: true };
        }

        const workDir = options.cwd || getWorkspaceRoot();
        const shell = resolveShell(options.shell);
        logger.info(`[Kernel] Terminal create requested: ${id} shell=${shell} cwd=${workDir}`);

        try {
            let ptyProcess: any = null;
            let useFallback = false;

            // Try node-pty first
            try {
                const pty = require('node-pty');
                ptyProcess = pty.spawn(shell, [], {
                    name: 'xterm-256color',
                    cols: options.cols || 80,
                    rows: options.rows || 30,
                    cwd: workDir,
                    env: { ...process.env, TERM: 'xterm-256color' }
                });
            } catch (ptyError: any) {
                useFallback = true;
                logger.warn(`[Kernel] PTY failed, using child_process fallback: ${ptyError.message}`);
            }

            if (useFallback) {
                const { exec } = require('child_process');
                let currentLine = '';
                let currentCwd = workDir;

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
                    write: (data: string) => {
                        const term = terminals.get(id);
                        if (!term) return;
                        for (const char of data) {
                            if (char === '\r' || char === '\n') {
                                broadcast({ type: 'terminal_output', id, data: '\r\n' });
                                const cmd = currentLine.trim();
                                currentLine = '';
                                if (cmd) {
                                    executeCommand(cmd).then((output) => {
                                        if (output) {
                                            term.history.push(output);
                                            broadcast({ type: 'terminal_output', id, data: output });
                                        }
                                        broadcast({ type: 'terminal_output', id, data: `${path.basename(currentCwd)}$ ` });
                                    });
                                } else {
                                    broadcast({ type: 'terminal_output', id, data: `${path.basename(currentCwd)}$ ` });
                                }
                            } else if (char === '\x7f' || char === '\b') {
                                if (currentLine.length > 0) {
                                    currentLine = currentLine.slice(0, -1);
                                    broadcast({ type: 'terminal_output', id, data: '\b \b' });
                                }
                            } else if (char === '\x03') {
                                currentLine = '';
                                broadcast({ type: 'terminal_output', id, data: '^C\r\n' });
                                broadcast({ type: 'terminal_output', id, data: `${path.basename(currentCwd)}$ ` });
                            } else {
                                currentLine += char;
                                broadcast({ type: 'terminal_output', id, data: char });
                            }
                        }
                    },
                    resize: () => {},
                    kill: () => {},
                    onData: () => {},
                    _isFallback: true
                };

                const term = { pty: ptyWrapper, history: [], write: (d: string) => ptyWrapper.write(d), resize: () => {}, kill: () => {}, fallback: true };
                registerTerminal(id, term);
                if (options.userId) registerTerminalOwner(id, options.userId);
                
                setTimeout(() => broadcast({ type: 'terminal_output', id, data: `${path.basename(currentCwd)}$ ` }), 100);
                return { id, pid: ptyWrapper.pid, fallback: true };
            }

            const term = { 
                pty: ptyProcess, 
                history: [] as string[],
                write: (data: string) => ptyProcess.write(data),
                resize: (cols: number, rows: number) => ptyProcess.resize(cols, rows),
                kill: () => ptyProcess.kill()
            };
            registerTerminal(id, term);
            if (options.userId) registerTerminalOwner(id, options.userId);

            ptyProcess.onData((data: string) => {
                const outTs = Date.now();
                term.history.push(data);
                if (term.history.length > 5000) term.history.shift();
                logger.info(`[kernel.output.emitted] sessionId=${id} ts=${outTs} bytes=${data.length}`);
                broadcast({ type: 'terminal_output', id, data });
            });

            return { id, pid: ptyProcess.pid };
        } catch (e: any) {
            logger.error(`[Kernel] Terminal create failed: ${e.message}`);
            throw e;
        }
    }

    /**
     * Send input to a terminal session
     */
    async sendInput(id: string, data: string, serverId?: string) {
        const ts = Date.now();
        logger.info(`[kernel.input.received] sessionId=${id} ts=${ts} bytes=${data.length} serverId=${serverId || 'local'}`);
        if (serverId) {
            if (sshManager.isConnected(serverId)) {
                await sshManager.sendInput(id, data);
            }
            return;
        }

        const term = terminals.get(id);
        if (!term) {
            logger.warn(`[Kernel] Attempted input to non-existent terminal: ${id}`);
            return;
        }
        
        logger.debug(`[Kernel] Forwarding input to terminal: ${id} (${data.length} bytes)`);
        // Control routing only for now
        term.write(data);
    }

    /**
     * Resize a terminal session
     */
    async resizeTerminal(id: string, cols: number, rows: number, serverId?: string) {
        if (serverId) {
            sshManager.resizeShell(id, cols, rows);
            return;
        }

        const term = terminals.get(id);
        if (!term) return;
        
        logger.info(`[Kernel] Resizing terminal: ${id} to ${cols}x${rows}`);
        term.resize(cols, rows);
    }

    /**
     * Kill a terminal session
     */
    async killTerminal(id: string) {
        const term = terminals.get(id);
        if (term) {
            term.kill();
            removeTerminal(id);
            logger.info(`[Kernel] Terminal killed: ${id}`);
        }
    }

    /**
     * Read terminal history
     */
    async readHistory(id: string): Promise<string> {
        const term = terminals.get(id);
        if (!term) throw new Error('Terminal not found');
        return term.history.join('');
    }

    /**
     * List all active terminal IDs
     */
    async listTerminals(): Promise<string[]> {
        return Array.from(terminals.keys());
    }
}

export const terminalKernel = new TerminalKernel();
