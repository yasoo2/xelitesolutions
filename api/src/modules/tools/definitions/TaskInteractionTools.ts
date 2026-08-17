
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { broadcast, registerTerminalOwner, registerTerminalSessionOwner } from '../../../api/ws';
import { terminals, registerTerminal, removeTerminal } from '../terminal/TerminalState';
import { logger } from '../../../shared/utils/logger';
import { terminalKernel } from '../../terminal/terminal-kernel';

function getWorkspaceRoot(workspaceId?: string) {
    try {
        const { workspaceService } = require('../../services/WorkspaceService');
        return workspaceService.getActiveRoot(workspaceId);
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

function resolveToolPath(p: string, workspaceId?: string) {
    const root = getWorkspaceRoot(workspaceId);
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
    description = 'Open a terminal, run a command in it, and READ its output — the live terminal panel, its history, and the last error it printed. Use for "read the terminal", "why did that command fail", "open a new terminal", "what did the console say".';
    version = '2.0.0';
    tags = ['shell', 'terminal', 'console', 'command', 'output', 'history', 'error', 'persistent', 'interactive'];
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

    async execute(input: any, context?: any) {
        const action = input.action;
        const ownerSessionId = String(input?.sessionId || context?.sessionId || '').trim();
        const requestedId = String(input?.id || '').trim();
        // One visible main shell per Joe session. Never fall back to a process-wide
        // `default` terminal when a session context exists.
        const id = ownerSessionId ? `terminal:${ownerSessionId}` : (requestedId || 'default');
        const workDir = getWorkspaceRoot(input?.workspaceId || context?.workspaceId);

        if (action === 'create') {
            try {
                const result: any = await terminalKernel.createTerminal(id, {
                    shell: input.shell,
                    // ONE WORLD. Measured: the panel's shell opened in Joe's own
                    // source directory while shell_execute ran in the session's
                    // workspace — `npm install` in the panel and a build asked of
                    // Joe happened in two different folders, and an `rm` typed in
                    // what looked like «my project» was standing in Joe's code.
                    cwd: workDir,
                    cols: input.cols,
                    rows: input.rows,
                    // The panel's create call carries no userId — the route puts
                    // the signed-in user in the CONTEXT. Reading only the body
                    // meant a terminal was born with no owner, and an unowned
                    // terminal's output went to every connected client.
                    userId: String(input?.userId || context?.userId || '').trim(),
                    sessionId: ownerSessionId
                });

                if (ownerSessionId) registerTerminalSessionOwner(id, ownerSessionId);

                if (result.existing) {
                    return {
                        ok: true,
                        output: { id, message: "Terminal already exists. Attached to existing terminal.", existing: true },
                        logs: [`term_attach_existing=${id}`]
                    };
                }

                return {
                    ok: true,
                    output: { 
                        id, 
                        pid: result.pid, 
                        message: result.fallback ? 'Terminal created (fallback mode).' : 'Terminal created.',
                        fallback: result.fallback 
                    },
                    logs: [`term_create=${id}${result.fallback ? ' fallback=true' : ''}`]
                };
            } catch (e: any) {
                return { ok: false, error: `Failed to spawn terminal via kernel: ${e.message}`, logs: [] };
            }
        }

        if (action === 'read') {
            try {
                const history = await terminalKernel.readHistory(id);
                return { ok: true, output: { history }, logs: [] };
            } catch (e: any) {
                return { ok: false, error: e.message, logs: [] };
            }
        }

        if (action === 'write') {
            if (!input.command) return { ok: false, error: 'command input required', logs: [] };
            
            await terminalKernel.sendInput(id, input.command);
            return { ok: true, output: { message: 'Input sent via kernel' }, logs: [`term_write=${id}`] };
        }

        if (action === 'resize') {
            
            await terminalKernel.resizeTerminal(id, input.cols || 80, input.rows || 30);
            return { ok: true, output: { message: 'Resized via kernel' }, logs: [] };
        }

        if (action === 'kill') {
            await terminalKernel.killTerminal(id);
            return { ok: true, output: { message: 'Terminal killed via kernel' }, logs: [] };
        }

        if (action === 'list') {
            const ids = await terminalKernel.listTerminals(ownerSessionId);
            return { ok: true, output: { terminals: ids }, logs: [] };
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

    async execute(input: any, context?: any) {
        const filePath = resolveToolPath(String(input?.path ?? ''), context?.workspaceId);
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
