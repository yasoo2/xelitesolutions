
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { broadcast, registerTerminalOwner } from '../../ws';
// Store for persistent terminals
export const terminals = new Map<string, { pty: any, history: string[] }>();

function getWorkspaceRoot() {
    try {
        const { workspaceService } = require('../../services/WorkspaceService');
        return workspaceService.getActiveRoot();
    } catch {
        return process.cwd();
    }
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

        if (action === 'create') {
            if (terminals.has(id)) return { ok: false, error: 'Terminal already exists', logs: [] };

            try {
                let pty: any;
                try {
                    // Lazy load node-pty to prevent startup crashes if native bindings fail
                    pty = require('node-pty');
                } catch (e) {
                    return { ok: false, error: 'node-pty module not found or failed to load on this system.', logs: [] };
                }

                const shell = input.shell || (process.platform === 'win32' ? 'powershell.exe' : 'bash');
                const ptyProcess = pty.spawn(shell, [], {
                    name: 'xterm-color',
                    cols: input.cols || 80,
                    rows: input.rows || 30,
                    cwd: process.cwd(),
                    env: process.env
                });

                const term = { pty: ptyProcess, history: [] as string[] };
                terminals.set(id, term);
                const userId = typeof input?.userId === 'string' ? String(input.userId).trim() : '';
                if (userId) registerTerminalOwner(id, userId);

                ptyProcess.onData((data: string) => {
                    term.history.push(data);
                    if (term.history.length > 5000) term.history.shift();
                    broadcast({ type: 'terminal_output', id, data });
                });

                return { ok: true, output: { id, pid: ptyProcess.pid, message: 'Terminal created.' }, logs: [`term_create=${id}`] };
            } catch (e: any) {
                return { ok: false, error: `Failed to spawn PTY: ${e.message}`, logs: [] };
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
            term.pty.write(input.command);

            // Wait a bit for output
            await new Promise(r => setTimeout(r, 200));

            return { ok: true, output: { message: 'Input sent' }, logs: [`term_write=${id}`] };
        }

        if (action === 'resize') {
            const term = terminals.get(id);
            if (!term) return { ok: false, error: 'Terminal not found', logs: [] };
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
