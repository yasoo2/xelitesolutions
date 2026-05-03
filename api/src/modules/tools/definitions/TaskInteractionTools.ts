
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { broadcast, registerTerminalOwner } from '../../../api/ws';
// Store for persistent terminals
export const terminals = new Map<string, { pty: any, history: string[] }>();

import { logger } from '../../../shared/utils/logger';

function getWorkspaceRoot() {
    try {
        const { workspaceService } = require('../../services/WorkspaceService');
        return workspaceService.getActiveRoot();
    } catch {
        return process.cwd();
    }
}

function resolveShell(requestedShell?: string): string {
    if (process.platform === 'win32') return 'powershell.exe';
    if (requestedShell && fs.existsSync(requestedShell)) return requestedShell;
    if (fs.existsSync('/bin/bash')) return '/bin/bash';
    if (fs.existsSync('/bin/sh')) return '/bin/sh';
    return '/bin/sh';
}

function resolveToolPath(p: string) {
    const root = getWorkspaceRoot();
    const val = String(p ?? '').trim();
    if (!val || val === '.') return root;
    const rootReal = (() => {
        try { return fs.realpathSync(root); } catch { return root; }
    })();
    const abs = path.isAbsolute(val) ? path.resolve(val) : path.resolve(rootReal, val);
    const absReal = (() => {
        try { return fs.realpathSync(abs); } catch { return abs; }
    })();
    const rel = path.relative(rootReal, absReal);
    const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    if (!inside) throw new Error('path_outside_workspace');
    return absReal;
}


/**
 * TerminalManagerTool: Persistent terminal sessions.
 * Equivalent to `read_terminal` / `create_terminal`.
 */
export class TerminalManagerTool extends BaseTool {
    name = 'terminal_manager';
    description = 'Manage persistent interactive terminal sessions (create, read, write, kill, resize).';
    version = '2.0.0';
    tags = ['shell', 'terminal', 'persistent', 'interactive'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            action: { type: 'string', enum: ['create', 'read', 'write', 'kill', 'list', 'resize'] },
            id: { type: 'string' },
            command: { type: 'string', description: 'For write (input)' },
            cols: { type: 'number' },
            rows: { type: 'number' },
            shell: { type: 'string', default: 'bash' }
        },
        required: ['action']
    };
    outputSchema = { type: 'object' as const, properties: { output: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const action = input.action;
        const id = input.id || 'default';
        const workDir = getWorkspaceRoot();

        if (action === 'create') {
            if (terminals.has(id)) return { ok: false, error: 'Terminal already exists', logs: [] };

            const shell = resolveShell(input.shell);
            logger.info(`terminal_create_requested id=${id} shell=${shell} cwd=${workDir}`);

            try {
                let ptyProcess: any = null;
                let useFallback = false;

                // Try node-pty first
                try {
                    const pty = require('node-pty');
                    ptyProcess = pty.spawn(shell, [], {
                        name: 'xterm-256color',
                        cols: input.cols || 80,
                        rows: input.rows || 30,
                        cwd: workDir,
                        env: { ...process.env, TERM: 'xterm-256color' }
                    });
                } catch (ptyError: any) {
                    // PTY failed, use child_process fallback
                    useFallback = true;
                    logger.warn(`[Terminal] PTY failed, using child_process fallback: ${ptyError.message}`);
                }

                if (useFallback) {
                    // Fallback: Use child_process for an interactive-like shell
                    const { spawn, exec } = require('child_process');

                    // Create a line buffer for commands
                    let currentLine = '';
                    let currentCwd = workDir;

                    // Helper to execute a command and return output
                    const executeCommand = (cmd: string): Promise<string> => {
                        return new Promise((resolve) => {
                            // Handle cd specially
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

                    // Create a wrapper that mimics PTY interface
                    const ptyWrapper = {
                        pid: process.pid, // Use current process as fallback pid
                        write: (data: string) => {
                            const term = terminals.get(id);
                            if (!term) return;

                            logger.debug(`terminal_input_received id=${id} bytes=${data.length}`);

                            // Echo input character by character
                            for (const char of data) {
                                if (char === '\r' || char === '\n') {
                                    // Execute command when Enter is pressed
                                    const out = '\r\n';
                                    logger.debug(`terminal_output_broadcast id=${id} bytes=${out.length}`);
                                    broadcast({ type: 'terminal_output', id, data: out });
                                    const cmd = currentLine.trim();
                                    currentLine = '';

                                    if (cmd) {
                                        executeCommand(cmd).then((output) => {
                                            if (output) {
                                                term.history.push(output);
                                                logger.debug(`terminal_output_broadcast id=${id} bytes=${output.length}`);
                                                broadcast({ type: 'terminal_output', id, data: output });
                                            }
                                            // Show next prompt
                                            const prompt = `${path.basename(currentCwd)}$ `;
                                            logger.debug(`terminal_output_broadcast id=${id} bytes=${prompt.length}`);
                                            broadcast({ type: 'terminal_output', id, data: prompt });
                                        });
                                    } else {
                                        // Empty command, just show prompt
                                        const prompt = `${path.basename(currentCwd)}$ `;
                                        logger.debug(`terminal_output_broadcast id=${id} bytes=${prompt.length}`);
                                        broadcast({ type: 'terminal_output', id, data: prompt });
                                    }
                                } else if (char === '\x7f' || char === '\b') {
                                    // Backspace
                                    if (currentLine.length > 0) {
                                        currentLine = currentLine.slice(0, -1);
                                        const out = '\b \b';
                                        logger.debug(`terminal_output_broadcast id=${id} bytes=${out.length}`);
                                        broadcast({ type: 'terminal_output', id, data: out });
                                    }
                                } else if (char === '\x03') {
                                    // Ctrl+C
                                    currentLine = '';
                                    const out = '^C\r\n';
                                    logger.debug(`terminal_output_broadcast id=${id} bytes=${out.length}`);
                                    broadcast({ type: 'terminal_output', id, data: out });
                                    const prompt = `${path.basename(currentCwd)}$ `;
                                    logger.debug(`terminal_output_broadcast id=${id} bytes=${prompt.length}`);
                                    broadcast({ type: 'terminal_output', id, data: prompt });
                                } else {
                                    // Regular character - echo and add to buffer
                                    currentLine += char;
                                    logger.debug(`terminal_output_broadcast id=${id} bytes=${char.length}`);
                                    broadcast({ type: 'terminal_output', id, data: char });
                                }
                            }
                        },
                        resize: (cols: number, rows: number) => {
                            logger.info(`terminal_resize_received id=${id} cols=${cols} rows=${rows}`);
                        },
                        kill: () => { /* No-op - no actual process to kill */ },
                        onData: () => { /* Data is broadcast directly in write() */ },
                        _isFallback: true
                    };

                    const term = { pty: ptyWrapper, history: [] as string[] };
                    terminals.set(id, term);
                    const userId = typeof input?.userId === 'string' ? String(input.userId).trim() : '';
                    if (userId) registerTerminalOwner(id, userId);

                    // Send initial prompt
                    setTimeout(() => {
                        const prompt = `${path.basename(currentCwd)}$ `;
                        logger.debug(`terminal_output_broadcast id=${id} bytes=${prompt.length}`);
                        broadcast({ type: 'terminal_output', id, data: prompt });
                    }, 100);

                    logger.info(`terminal_create_ok id=${id} mode=fallback pid=${ptyWrapper.pid}`);
                    return { ok: true, output: { id, pid: ptyWrapper.pid, message: 'Terminal created (fallback mode).', fallback: true }, logs: [`term_create=${id} fallback=true`] };
                }

                // PTY succeeded
                const term = { pty: ptyProcess, history: [] as string[] };
                terminals.set(id, term);
                const userId = typeof input?.userId === 'string' ? String(input.userId).trim() : '';
                if (userId) registerTerminalOwner(id, userId);

                ptyProcess.onData((data: string) => {
                    term.history.push(data);
                    if (term.history.length > 5000) term.history.shift();
                    logger.debug(`terminal_output_broadcast id=${id} bytes=${data.length}`);
                    broadcast({ type: 'terminal_output', id, data });
                });

                logger.info(`terminal_create_ok id=${id} mode=pty pid=${ptyProcess.pid}`);
                return { ok: true, output: { id, pid: ptyProcess.pid, message: 'Terminal created.' }, logs: [`term_create=${id}`] };
            } catch (e: any) {
                logger.error(`terminal_create_failed id=${id} error=${e.message}`);
                return { ok: false, error: `Failed to spawn terminal: ${e.message}`, logs: [] };
            }
        }

        if (action === 'read') {
            const term = terminals.get(id);
            if (!term) return { ok: false, error: 'Terminal not found', logs: [] };
            // Return concatenated history
            return { ok: true, output: { history: term.history.join('') }, logs: [] };
        }

        if (action === 'write') {
            const term = terminals.get(id);
            if (!term) return { ok: false, error: 'Terminal not found', logs: [] };

            if (!input.command) return { ok: false, error: 'command input required', logs: [] };
            
            logger.debug(`terminal_input_received id=${id} bytes=${input.command.length}`);
            term.pty.write(input.command);

            // Wait a bit for output
            await new Promise(r => setTimeout(r, 200));

            return { ok: true, output: { message: 'Input sent' }, logs: [`term_write=${id}`] };
        }

        if (action === 'resize') {
            const term = terminals.get(id);
            if (!term) return { ok: false, error: 'Terminal not found', logs: [] };
            
            logger.info(`terminal_resize_received id=${id} cols=${input.cols} rows=${input.rows}`);
            term.pty.resize(input.cols || 80, input.rows || 30);
            return { ok: true, output: { message: 'Resized' }, logs: [] };
        }

        if (action === 'kill') {
            const term = terminals.get(id);
            if (!term) return { ok: false, error: 'Terminal not found', logs: [] };
            term.pty.kill();
            terminals.delete(id);
            return { ok: true, output: { message: 'Terminal killed' }, logs: [] };
        }

        if (action === 'list') {
            return { ok: true, output: { terminals: Array.from(terminals.keys()) }, logs: [] };
        }

        return { ok: false, error: 'Unknown action', logs: [] };
    }
}

/**
 * SafeReadFileTool: Paginated file reading.
 * Equivalent to `view_file`.
 */
export class SafeReadFileTool extends BaseTool {
    name = 'read_file';
    description = 'Read file content safely with pagination limits.';
    version = '1.0.0';
    tags = ['fs', 'read', 'safe'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            startLine: { type: 'number', default: 1 },
            endLine: { type: 'number', default: 1000 }
        },
        required: ['path']
    };
    outputSchema = { type: 'object' as const, properties: { content: { type: 'string' }, totalLines: { type: 'number' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];

    async execute(input: any) {
        const filePath = resolveToolPath(String(input?.path ?? ''));
        if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found', logs: [] };

        // [Wakil 4.6] Smart Directory Peek (Voice Feedback)
        // Goal: "Don't be stupid and just stop at a folder. Open it!"
        try {
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                const items = fs.readdirSync(filePath);
                const formattedList = items.map(i => {
                    try {
                        const isDir = fs.statSync(path.join(filePath, i)).isDirectory();
                        return isDir ? `${i}/` : i;
                    } catch { return i; }
                }).join('\n');

                return {
                    ok: true,
                    output: {
                        content: `⚠️ PATH IS A DIRECTORY (Auto-Listed):\nI cannot read a directory as a file, but here are the contents so you can select the target:\n\n${formattedList}\n\n[ACTION REQUIRED] Select a specific file from the list above.`,
                        totalLines: items.length
                    },
                    logs: [`read_peek=directory path=${filePath} items=${items.length}`]
                };
            }
        } catch (e: any) {
            return { ok: false, error: `Stat/Read failed: ${e.message}`, logs: [] };
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');
            const start = Math.max(0, (input.startLine || 1) - 1);
            const end = Math.min(lines.length, (input.endLine || 1000));

            return {
                ok: true,
                output: {
                    content: lines.slice(start, end).join('\n'),
                    totalLines: lines.length,
                    truncated: lines.length > end
                },
                logs: [`read=${filePath} lines=${start + 1}-${end}`]
            };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

/**
 * AskUserTool: Blocking input request.
 * Equivalent to `notify_user` with input expectation.
 */
export class AskUserTool extends BaseTool {
    name = 'ask_user';
    description = 'Ask the user a question and wait for a response. Use this if you are blocked or need clarification.';
    version = '1.0.0';
    tags = ['user', 'interaction', 'blocking'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } }
        },
        required: ['question']
    };
    outputSchema = { type: 'object' as const, properties: { response: { type: 'string' } } };
    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = []; // Technically blocks, but doesn't modify system

    async execute(input: any) {
        broadcast({
            type: 'user_input_request',
            data: {
                question: input.question,
                options: input.options,
                timestamp: Date.now()
            }
        });

        return {
            ok: true,
            output: { status: 'waiting_for_user_input', message: 'Request sent. Agent loop should now pause.' },
            logs: [`ask="${input.question}"`]
        };
    }
}
