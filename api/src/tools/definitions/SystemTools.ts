
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import { commandRouter } from '../../terminal/command-router';
import { broadcast } from '../../ws';
import { handleShellCommand } from '../handlers';

// Background Process Store
const backgroundProcesses = new Map<string, { pid: number, command: string, startTime: number, process: any }>();

const spawn = require('child_process').spawn;

// Helper
function getWorkspaceRoot() {
    try {
        const { workspaceService } = require('../../services/WorkspaceService');
        const active = workspaceService.getActiveRoot();
        if (active) return active;
    } catch { }

    const cwd = process.cwd();
    // If we are in the 'api' folder of the project, use the parent
    const isApiFolder = path.basename(cwd).toLowerCase() === 'api';
    if (isApiFolder) {
        const parent = path.resolve(cwd, '..');
        console.log(`[SystemTools] Workspace root redirected from 'api' to: ${parent}`);
        return parent;
    }
    return cwd;
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
    if (!inside) {
        throw new Error('path_outside_workspace');
    }
    return absReal;
}

function splitCommandLine(raw: string) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const args: string[] = [];
    let cur = '';
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (quote) {
            if (ch === quote) {
                quote = null;
                continue;
            }
            if (ch === '\\' && quote === '"' && i + 1 < s.length) {
                cur += s[i + 1];
                i += 1;
                continue;
            }
            cur += ch;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch as any;
            continue;
        }
        if (/\s/.test(ch)) {
            if (cur) {
                args.push(cur);
                cur = '';
            }
            continue;
        }
        cur += ch;
    }
    if (quote) return null;
    if (cur) args.push(cur);
    if (args.length === 0) return null;
    return { command: args[0], args: args.slice(1) };
}

function isAllowedLocalCommand(command: string) {
    const c = String(command || '').trim();
    const allowedCommands = ['git', 'npm', 'node', 'tsc', 'eslint', 'ls', 'cat', 'grep', 'find'];
    return allowedCommands.includes(c);
}

export class EchoTool extends BaseTool {
    name = 'echo';
    description = 'Return the input text (ping/pong).';
    version = '1.0.0';
    tags = ['utility', 'string'];
    inputSchema = { type: 'object' as const, properties: { text: { type: 'string' } }, required: ['text'] };
    outputSchema = { type: 'object' as const, properties: { text: { type: 'string' } } };
    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 120;
    auditFields = ['text'];
    async execute(input: any) { return { ok: true, output: { text: input.text }, logs: [] }; }
}

export class FileEditTool extends BaseTool {
    name = 'file_edit';
    description = 'Replace text in a file.';
    version = '1.0.0';
    tags = ['fs', 'edit', 'write'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            filename: { type: 'string' },
            find: { type: 'string' },
            replace: { type: 'string' }
        },
        required: ['filename', 'find', 'replace']
    };
    outputSchema = { type: 'object' as const, properties: { success: { type: 'boolean' } } };
    permissions: ToolPermission[] = ['write', 'read'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 60;
    auditFields = ['filename'];

    async execute(input: any) {
        const logs: string[] = [];
        const filename = String(input?.filename ?? '');
        const find = String(input?.find ?? '');
        const replace = String(input?.replace ?? '');
        const full = resolveToolPath(filename);

        if (!fs.existsSync(full)) return { ok: false, error: 'File not found', logs };

        let content = fs.readFileSync(full, 'utf-8');
        if (!content.includes(find)) {
            return { ok: false, error: 'Text to replace not found', logs };
        }
        content = content.replace(find, replace);
        fs.writeFileSync(full, content);
        logs.push(`edit=${filename}`);

        // Broadcast diff event for UI
        const findLines = find.split('\n').length;
        const replaceLines = replace.split('\n').length;
        broadcast({
            type: 'diff',
            data: {
                path: filename,
                additions: replaceLines,
                deletions: findLines,
                lines: [
                    ...find.split('\n').map((line, i) => ({ type: 'remove', content: line, lineNumber: i + 1 })),
                    ...replace.split('\n').map((line, i) => ({ type: 'add', content: line, lineNumber: i + 1 }))
                ]
            }
        });

        return { ok: true, output: { success: true }, logs };
    }
}

export class WriteFileTool extends BaseTool {
    name = 'write_file';
    description = 'Write content to a file. Overwrites if exists.';
    version = '1.0.0';
    tags = ['fs', 'write', 'create'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            filename: { type: 'string' },
            content: { type: 'string' }
        },
        required: ['filename', 'content']
    };
    outputSchema = { type: 'object' as const, properties: { success: { type: 'boolean' } } };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 60;
    auditFields = ['filename'];

    async execute(input: any) {
        const logs: string[] = [];
        const filename = String(input?.filename ?? '');
        const content = String(input?.content ?? '');
        const full = resolveToolPath(filename);

        // Ensure directory exists
        const dir = path.dirname(full);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(full, content);
        logs.push(`write=${filename}`);

        // Broadcast diff event for UI (new file)
        const lines = content.split('\n');
        broadcast({
            type: 'diff',
            data: {
                path: filename,
                additions: lines.length,
                deletions: 0,
                lines: lines.map((line, i) => ({ type: 'add', content: line, lineNumber: i + 1 }))
            }
        });

        return { ok: true, output: { success: true }, logs };
    }
}

export class LsTool extends BaseTool {
    name = 'ls';
    description = 'List directory entries.';
    version = '1.0.0';
    tags = ['fs', 'ls', 'read'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            includeHidden: { type: 'boolean' }
        }
    };
    outputSchema = { type: 'object' as const, properties: { path: { type: 'string' }, entries: { type: 'array', items: { type: 'string' } } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 120;
    auditFields = ['path'];

    async execute(input: any) {
        const logs: string[] = [];
        const p = String(input?.path ?? '.');
        const includeHidden = Boolean(input?.includeHidden);
        const full = resolveToolPath(p);

        try {
            const names = fs.readdirSync(full, { withFileTypes: true })
                .filter(d => includeHidden || !d.name.startsWith('.'))
                .map(d => d.isDirectory() ? `${d.name}/` : d.name)
                .sort((a, b) => a.localeCompare(b));
            logs.push(`ls=${p}`);
            return { ok: true, output: { path: p, entries: names }, logs };
        } catch (e: any) {
            return { ok: false, error: e.message, logs };
        }
    }
}

export class GrepSearchTool extends BaseTool {
    name = 'grep_search';
    description = 'Search for text patterns in files using grep.';
    version = '1.0.0';
    tags = ['fs', 'search', 'read'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            query: { type: 'string' },
            path: { type: 'string' },
            include: { type: 'string' },
            exclude: { type: 'string' }
        },
        required: ['query']
    };
    outputSchema = { type: 'object' as const, properties: { matches: { type: 'array' }, count: { type: 'number' } } };
    permissions: ToolPermission[] = ['read', 'execute']; // Execute because it runs grep
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 60;
    auditFields = ['query', 'path'];

    async execute(input: any) {
        const logs: string[] = [];
        const query = String(input?.query ?? '');
        const searchPath = String(input?.path ?? '.');
        const include = String(input?.include ?? '');
        const exclude = String(input?.exclude ?? '');

        const workDir = resolveToolPath(searchPath);

        try {
            const args: string[] = ['-rnI'];
            if (include) args.push(`--include=${include}`);
            if (exclude) args.push(`--exclude-dir=${exclude}`);
            else args.push('--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist', '--exclude-dir=build');
            args.push('--', query, workDir);
            logs.push(`grep.args=${args.join(' ')}`);

            const r = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
                const child = spawn('grep', args, { shell: false, cwd: getWorkspaceRoot() });
                let stdout = '';
                let stderr = '';
                child.stdout.on('data', (d: any) => { stdout += d.toString(); });
                child.stderr.on('data', (d: any) => { stderr += d.toString(); });
                child.on('close', (code: number) => resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr }));
                child.on('error', (e: any) => resolve({ code: 1, stdout, stderr: String(e?.message || e || 'spawn_failed') }));
            });

            if (r.code === 1) return { ok: true, output: { matches: [], count: 0 }, logs };
            if (r.code !== 0) return { ok: false, error: (r.stderr || 'grep_failed').trim(), logs };

            const lines = (r.stdout || '').split('\n').filter(Boolean).slice(0, 100);
            return { ok: true, output: { matches: lines, count: lines.length, truncated: lines.length === 100 }, logs };
        } catch (err: any) {
            logs.push(`grep.error=${String(err?.message || err || 'grep_failed')}`);
            return { ok: false, error: String(err?.message || err || 'grep_failed'), logs };
        }
    }
}

export class NpmManagerTool extends BaseTool {
    name = 'npm_manager';
    description = 'Manage npm dependencies and run scripts.';
    version = '1.0.0';
    tags = ['npm', 'package', 'install'];
    inputSchema = {
        type: 'object' as const,
        properties: { command: { type: 'string' }, packages: { type: 'array', items: { type: 'string' } }, dev: { type: 'boolean' } },
        required: ['command']
    };
    outputSchema = { type: 'object' as const, properties: { output: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'write', 'internet'];
    sideEffects: ToolPermission[] = ['execute', 'write', 'internet'];
    rateLimitPerMinute = 10;

    async execute(input: any) {
        const logs: string[] = [];
        const cmd = String(input?.command || '').trim();
        const pkgs = (input?.packages as string[]) || [];
        const isDev = !!input?.dev;

        try {
            const cmdParts = cmd.split(/\s+/).filter(Boolean);
            if (!cmdParts.length) return { ok: false, error: 'missing_command', logs };
            const args = [...cmdParts, ...(Array.isArray(pkgs) ? pkgs : [])];
            if (isDev && (cmdParts[0] === 'install' || cmdParts[0] === 'i')) args.push('-D');
            logs.push(`npm.args=${args.join(' ')}`);
            const workDir = getWorkspaceRoot();
            const r = await handleShellCommand('npm', args, workDir, 5 * 60_000, false);
            if (!r.ok) return { ok: false, error: r.error || 'npm_failed', logs: [...logs, ...(r.logs || [])] };

            if ((cmdParts[0] === 'install' || cmdParts[0] === 'i') && pkgs.length > 0) {
                const typesToInstall = pkgs.filter(p => !p.startsWith('@types/')).map(p => `@types/${p.split('@')[0]}`);
                if (typesToInstall.length) {
                    try {
                        const r2 = await handleShellCommand('npm', ['install', '-D', ...typesToInstall], workDir, 5 * 60_000, false);
                        if (r2.ok) logs.push(`npm.auto_types=${typesToInstall.join(' ')}`);
                    } catch { }
                }
            }

            return { ok: true, output: { output: String(r.output || '') }, logs: [...logs, ...(r.logs || [])] };
        } catch (e: any) {
            return { ok: false, error: e.message || e.stderr, logs };
        }
    }
}

export class ScaffoldProjectTool extends BaseTool {
    name = 'scaffold_project';
    description = 'Scaffold a project structure from a definition object.';
    version = '1.0.0';
    tags = ['scaffold', 'fs', 'generate'];
    inputSchema = {
        type: 'object' as const,
        properties: { structure: { type: 'object' }, baseDir: { type: 'string' } },
        required: ['structure']
    };
    outputSchema = { type: 'object' as const, properties: { created: { type: 'array' }, errors: { type: 'array' } } };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any) {
        const logs: string[] = [];
        const structure = input?.structure || {};
        const baseDir = String(input?.baseDir || input?.name || '.');
        const resolvedBase = resolveToolPath(baseDir);
        const created: string[] = [];
        const errors: string[] = [];

        for (const [relativePath, content] of Object.entries(structure)) {
            const fullPath = path.join(resolvedBase, relativePath);
            try {
                if (content === null) {
                    if (!fs.existsSync(fullPath)) {
                        fs.mkdirSync(fullPath, { recursive: true });
                        created.push(`${relativePath}/`);
                    }
                } else {
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(fullPath, String(content));
                    created.push(relativePath);
                }
            } catch (e: any) {
                errors.push(`${relativePath}: ${e.message}`);
            }
        }
        return { ok: errors.length === 0, output: { created, errors }, logs };
    }
}

export class ShellExecuteTool extends BaseTool {
    name = 'shell_execute';
    description = 'Execute shell commands with persistent CWD state.';
    version = '1.0.0';
    tags = ['shell', 'execute', 'terminal'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            cwd: { type: 'string' },
            serverId: { type: 'string', description: 'ID of the remote server to execute on' },
            timeout: { type: 'number' },
            background: { type: 'boolean', description: 'Run command in background (fire and forget)' },
            dryRun: { type: 'boolean' }
        },
        required: ['command']
    };
    outputSchema = { type: 'object' as const, properties: { status: { type: 'string' }, stdout: { type: 'string' }, stderr: { type: 'string' }, exitCode: { type: 'number' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 20;
    auditFields = ['command', 'cwd'];

    async execute(input: any) {
        const startedAt = Date.now();
        const logs: string[] = [];
        const command = String(input?.command ?? '');
        let cwdInput = String(input?.cwd ?? '');
        const timeoutVal = Number(input?.timeout ?? 30000);
        const background = !!input?.background;
        const dryRun = !!input?.dryRun;

        const redactCmd = (s: string) => {
            let out = String(s || '');
            out = out.replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]');
            out = out.replace(/(\btoken\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
            out = out.replace(/(\bpassword\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
            out = out.replace(/(\bapi[_-]?key\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
            out = out.replace(/(\bsecret\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
            out = out.replace(/(\b--token\s+)[^\s]+/gi, '$1[REDACTED]');
            return out; // Shortened for brevity
        };

        if (dryRun) {
            const safeCmd = redactCmd(command);
            return { ok: true, output: { dryRun: true, status: 'success', command: safeCmd, stdout: `[dry run] ${safeCmd}`, exitCode: 0 }, logs: [`dryRun: ${safeCmd}`] };
        }

        // Simplistic safety
        if (command.includes('rm -rf /') || command.includes('sudo')) {
            const safeCmd = redactCmd(command);
            logs.push(`exec=${safeCmd} blocked=1`);
            return { ok: false, error: 'command_not_allowed', logs };
        }

        // Persistent CWD
        const root = getWorkspaceRoot();
        const stateFile = path.join(root, '.joe', 'shell_state.json');
        if (!cwdInput && fs.existsSync(stateFile)) {
            try {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
                if (state.cwd && fs.existsSync(state.cwd)) cwdInput = state.cwd;
            } catch { }
        }

        const workDir = cwdInput ? resolveToolPath(cwdInput) : root;



        try {
            if (background) {
                // Background Execution (Local only for now)
                if (input.serverId) {
                    throw new Error('Background execution not yet supported for remote servers');
                }
                const id = 'bg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

                const parsed = splitCommandLine(command);
                if (!parsed) throw new Error('invalid_command');
                if (!isAllowedLocalCommand(parsed.command)) throw new Error('command_not_allowed');

                const child = spawn(parsed.command, parsed.args, { cwd: workDir, shell: false, detached: true, stdio: 'ignore' });

                child.unref();

                backgroundProcesses.set(id, {
                    pid: child.pid,
                    command: command,
                    startTime: Date.now(),
                    process: child
                });

                logs.push(`exec_bg=${redactCmd(command)} id=${id} pid=${child.pid}`);
                return {
                    ok: true,
                    output: { status: 'background', id, pid: child.pid, message: 'Command started in background.' },
                    logs
                };
            }

            if (input.serverId) {
                const result = await commandRouter.execute({
                    command,
                    serverId: input.serverId,
                    workingDirectory: workDir,
                    timeout: timeoutVal
                });

                const durationMs = Date.now() - startedAt;
                logs.push(`exec=${redactCmd(command)} server=${input.serverId || 'local'} exit=${result.code}`);

                return {
                    ok: result.code === 0,
                    output: {
                        status: result.code === 0 ? 'success' : 'failed',
                        stdout: result.stdout,
                        stderr: result.stderr,
                        exitCode: result.code,
                        cwd: workDir,
                        durationMs,
                        executedOn: result.executedOn,
                        serverId: result.serverId
                    },
                    logs
                };
            }

            const parsed = splitCommandLine(command);
            if (!parsed) throw new Error('invalid_command');
            if (!isAllowedLocalCommand(parsed.command)) throw new Error('command_not_allowed');
            const r = await handleShellCommand(parsed.command, parsed.args, workDir, timeoutVal, false);
            const durationMs = Date.now() - startedAt;
            logs.push(...(r.logs || []));
            logs.push(`exec=${redactCmd(command)} server=local exit=${r.ok ? 0 : 1}`);

            return {
                ok: r.ok,
                output: {
                    status: r.ok ? 'success' : 'failed',
                    stdout: String(r.output || ''),
                    stderr: r.ok ? '' : String(r.error || ''),
                    exitCode: r.ok ? 0 : 1,
                    cwd: workDir,
                    durationMs,
                    executedOn: 'local',
                },
                logs
            };

        } catch (e: any) {
            const durationMs = Date.now() - startedAt;
            const logCmd = redactCmd(command);
            logs.push(`exec_error=${logCmd} err=${e.message}`);
            return { ok: false, error: e.message || 'Command failed', output: { status: 'failed', stdout: e.stdout || '', stderr: e.stderr || e.message, exitCode: e.code || 1, cwd: workDir, durationMs }, logs };
        }
    }
}

export class ShellStatusTool extends BaseTool {
    name = 'shell_check_status';
    description = 'Check the status of a background command.';
    version = '1.0.0';
    tags = ['shell', 'status'];
    inputSchema = { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] };
    outputSchema = { type: 'object' as const, properties: { running: { type: 'boolean' } } };
    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];

    async execute(input: any) {
        const id = String(input.id);
        const proc = backgroundProcesses.get(id);
        if (!proc) return { ok: false, error: 'Process not found', logs: [] };

        // Check if PID is running
        let running = true;
        try {
            process.kill(proc.pid, 0); // signal 0 just checks existence
        } catch (e) {
            running = false;
        }

        if (!running) {
            backgroundProcesses.delete(id); // Cleanup dead
        }

        return {
            ok: true,
            output: { running, pid: proc.pid, command: proc.command, uptime: Date.now() - proc.startTime },
            logs: []
        };
    }
}
