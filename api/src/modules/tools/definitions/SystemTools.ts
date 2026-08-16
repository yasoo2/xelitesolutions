
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import { workspaceService } from '../../services/WorkspaceService';
import { persistJoeProjects } from '../../../api/page-store';
import { resolveToolPath as sharedResolveToolPath } from '../utils';
import { commandRouter } from '../../terminal/command-router';
import { broadcast, broadcastTerminalLine } from '../../../api/ws';
import { handleShellCommand } from '../handlers';
import { executionEngine } from '../../../kernel/ExecutionEngine';

// Background Process Store
const backgroundProcesses = new Map<string, { pid: number, command: string, cwd: string, startTime: number, process: any }>();

function isBackgroundProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function sameBackgroundInvocation(left: { command: string; cwd: string }, command: string, cwd: string): boolean {
    return left.command.trim() === command.trim() && path.resolve(left.cwd) === path.resolve(cwd);
}

/**
 * Reconcile only the deterministic, npm-invalid parts of a generated manifest.
 *
 * Models occasionally turn prose such as "node:sqlite or JSON file fallback"
 * into a dependency key. npm cannot install that key, and guessing a replacement
 * package would violate the evidence-first engineering contract. Removing the
 * impossible dependency is the narrow, reversible repair; runtime imports still
 * have to pass the later build/test gates.
 */
export function reconcileNpmManifest(workDir: string): {
    ok: boolean;
    changed: boolean;
    packageJsonPath?: string;
    removedDependencies?: string[];
    renamedPackage?: { from: string; to: string };
    recursiveScripts?: string[];
    error?: string;
} {
    const packageJsonPath = path.join(workDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return { ok: true, changed: false, packageJsonPath };
    }

    let manifest: any;
    try {
        manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } catch (error: any) {
        return { ok: false, changed: false, packageJsonPath, error: `invalid_package_json:${String(error?.message || error)}` };
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { ok: false, changed: false, packageJsonPath, error: 'invalid_package_json:manifest must be an object' };
    }

    const removedDependencies: string[] = [];
    const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    const npmName = /^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/;
    for (const section of dependencySections) {
        const entries = manifest[section];
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
        for (const dependencyName of Object.keys(entries)) {
            if (dependencyName.length > 214 || !npmName.test(dependencyName)) {
                delete entries[dependencyName];
                removedDependencies.push(`${section}.${dependencyName}`);
            }
        }
    }

    let renamedPackage: { from: string; to: string } | undefined;
    if (typeof manifest.name === 'string' && manifest.name !== manifest.name.toLowerCase()) {
        const normalized = manifest.name.toLowerCase();
        if (npmName.test(normalized)) {
            renamedPackage = { from: manifest.name, to: normalized };
            manifest.name = normalized;
        }
    }
    if (typeof manifest.name === 'string' && !npmName.test(manifest.name)) {
        return {
            ok: false,
            changed: false,
            packageJsonPath,
            removedDependencies,
            renamedPackage,
            error: `invalid_package_name:${manifest.name}`,
        };
    }

    const recursiveScripts: string[] = [];
    const scripts = manifest.scripts;
    if (scripts && typeof scripts === 'object' && !Array.isArray(scripts)) {
        for (const [scriptName, rawCommand] of Object.entries(scripts)) {
            if (typeof rawCommand !== 'string') continue;
            const escapedName = scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const selfReference = new RegExp(`(?:^|[;&|]|&&|\\n)\\s*npm\\s+(?:run|run-script)\\s+${escapedName}(?=\\s|$)`);
            if (selfReference.test(rawCommand)) recursiveScripts.push(scriptName);
        }
    }

    const changed = removedDependencies.length > 0 || !!renamedPackage;
    if (changed) {
        fs.writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }
    if (recursiveScripts.length) {
        return {
            ok: false,
            changed,
            packageJsonPath,
            removedDependencies,
            renamedPackage,
            recursiveScripts,
            error: `recursive_npm_scripts:${recursiveScripts.join(',')}`,
        };
    }
    if (!changed) {
        return { ok: true, changed: false, packageJsonPath, removedDependencies, renamedPackage };
    }
    return { ok: true, changed: true, packageJsonPath, removedDependencies, renamedPackage };
}

// Helper
function getWorkspaceRoot(workspaceId?: string) {
    try {
        const active = workspaceService.getActiveRoot(workspaceId);
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

/**
 * Anchor and contain a tool path.
 *
 * This file used to carry its OWN resolver of this name, and it had the hole the
 * shared one had already been fixed for:
 *
 *     if (path.isAbsolute(val)) return val;   // ← containment check skipped
 *
 * write_file, file_edit, ls, grep_search and the shell's working directory all
 * ran through it, so any absolute path the model produced was used verbatim.
 * Proven, not theorised: a test drove write_file and it created
 * /etc/joe-owned-write-file.txt. Its relative branch also compared with
 * `startsWith`, which admits a sibling directory that merely shares a prefix.
 *
 * There is one resolver now. Four copies of a security check meant four chances
 * to get it wrong, and three of them were wrong.
 */
const resolveToolPath = (p: string, workspaceId?: string) =>
    sharedResolveToolPath(p, { workspaceId });

/**
 * The resolver throws on an escape. Every caller here has to turn that into a
 * refused tool result instead of an exception, because an exception escaping
 * `execute` is reported to the agent as a crash rather than as "not allowed" —
 * and an agent that reads a crash retries, while one that reads a refusal stops.
 */
type SafePath = { ok: true; path: string } | { ok: false; error: string };
function safePath(p: string, workspaceId?: string): SafePath {
    try { return { ok: true, path: resolveToolPath(p, workspaceId) }; }
    catch (e: any) { return { ok: false, error: String(e?.message || e) }; }
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
            find: { type: 'string', description: 'Text to find (alias: search / old_string)' },
            replace: { type: 'string', description: 'Replacement text (alias: new_string)' }
        },
        required: ['filename', 'find', 'replace']
    };
    outputSchema = { type: 'object' as const, properties: { success: { type: 'boolean' } } };
    permissions: ToolPermission[] = ['write', 'read'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 60;
    auditFields = ['filename'];

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const filename = String(input?.filename ?? input?.path ?? '').trim();
        // `search`/`old_string` are what every other editor in this codebase —
        // and every model that has seen one — calls this field. It was not
        // accepted here, and an empty `find` made `content.replace('', x)`
        // PREPEND the replacement to the file: a silent corruption that looked
        // like a successful edit. The wiring proof had been passing on it.
        const find = String(input?.find ?? input?.search ?? input?.old_string ?? '');
        const replace = String(input?.replace ?? input?.new_string ?? '');
        // An empty filename resolved to the workspace ROOT, which exists, so the
        // guard below waved it through and node died on `EISDIR` reading a
        // directory. A missing argument is ordinary; it earns a sentence.
        if (!filename) return { ok: false, error: 'file_edit needs a filename to edit.', logs };
        if (!find) return { ok: false, error: 'file_edit needs the text to find (`find`).', logs };
        const resolved = safePath(filename, context?.workspaceId);
        if (!resolved.ok) return { ok: false, error: resolved.error, logs };
        const full = resolved.path;

        if (!fs.existsSync(full)) {
            console.error(`[file_edit] File not found. input.filename: ${filename}, resolved full path: ${full}`);
            return { ok: false, error: 'File not found', logs };
        }
        if (fs.statSync(full).isDirectory()) {
            return { ok: false, error: `${filename} is a folder, not a file.`, logs };
        }

        let content = fs.readFileSync(full, 'utf-8');
        if (!content.includes(find)) {
            return { ok: false, error: 'Text to replace not found', logs };
        }
        content = content.replace(find, replace);
        fs.writeFileSync(full, content);
        logs.push(`edit=${filename}`);

        const findLines = find.split('\n').length;
        const replaceLines = replace.split('\n').length;
        broadcast({
            type: 'diff',
            data: {
                path: filename,
                content: content,
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

/**
 * DELETE A FILE — the capability the wiring audit found MISSING.
 *
 * 149 tools could create, read, edit, search and list; not one could remove.
 * «احذف الملف الفلاني» had nowhere to go but a shell command, and the
 * surgical editor had to unlink files behind the tool layer's back. The same
 * containment as every other file tool applies: the path is resolved inside
 * the workspace or the call is refused, a directory needs `recursive: true`
 * said out loud, and a file that is already gone is reported honestly rather
 * than counted as a deletion.
 */
export class DeleteFileTool extends BaseTool {
    name = 'delete_file';
    description = 'Delete a file (or, with recursive:true, a directory) inside the workspace. Refuses anything outside it.';
    version = '1.0.0';
    tags = ['fs', 'delete'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'File or directory to delete' },
            filename: { type: 'string', description: 'Alias of path' },
            recursive: { type: 'boolean', description: 'Required to delete a directory and everything under it' },
        },
        required: [] as string[],
    };
    outputSchema = { type: 'object' as const, properties: { deleted: { type: 'boolean' } } };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 60;
    auditFields = ['path'];

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const rawPath = String(input?.path || input?.filename || '').trim();
        if (!rawPath) return { ok: false, error: 'delete_file needs a path — name the file to remove.', logs };
        const resolved = safePath(rawPath, context?.workspaceId);
        if (!resolved.ok) return { ok: false, error: resolved.error, logs };
        const full = resolved.path;
        if (!fs.existsSync(full)) {
            // Not a deletion, and not a crash: the truth is that it is not there.
            return { ok: false, error: `not_found: ${rawPath} does not exist — nothing was deleted.`, logs };
        }
        const isDir = fs.statSync(full).isDirectory();
        if (isDir && input?.recursive !== true) {
            return { ok: false, error: `is_directory: ${rawPath} is a directory — pass recursive:true to remove it and everything inside.`, logs };
        }
        try {
            if (isDir) fs.rmSync(full, { recursive: true, force: true });
            else fs.unlinkSync(full);
        } catch (e: any) {
            return { ok: false, error: `delete_failed: ${String(e?.message || e)}`, logs };
        }
        logs.push(`delete=${rawPath}${isDir ? ' (recursive)' : ''}`);
        return { ok: true, output: { deleted: true, path: rawPath, wasDirectory: isDir }, logs };
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
            path: { type: 'string' },
            content: { type: 'string' }
        },
        required: ['content']
    };
    outputSchema = { type: 'object' as const, properties: { success: { type: 'boolean' } } };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 60;
    auditFields = ['filename'];

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const rawPath = String(input?.filename || input?.path || '').trim();
        const content = String(input?.content ?? '');
        if (!rawPath) return { ok: false, error: 'filename or path is required', logs: [] };
        // Containment is decided BEFORE the directory is created. Creating it
        // first left attacker-chosen directories across the filesystem even when
        // the write itself was correctly refused.
        const resolved = safePath(rawPath, context?.workspaceId);
        if (!resolved.ok) return { ok: false, error: resolved.error, logs };
        const full = resolved.path;

        const dir = path.dirname(full);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
            return { ok: false, error: `EISDIR: Cannot write file content to a directory path (${rawPath}). Please specify a full filename like '${rawPath}/index.html'.`, logs: [] };
        }

        fs.writeFileSync(full, content);
        logs.push(`write=${rawPath}`);

        const lines = content.split('\n');
        broadcast({
            type: 'diff',
            data: {
                path: rawPath,
                content: content,
                additions: lines.length,
                deletions: 0,
                lines: lines.map((line, i) => ({ type: 'add', content: line, lineNumber: i + 1 }))
            }
        });

        // [CODE, LIVE] Autonomous builds write files with THIS tool, but only
        // the page builder streamed to the live Logs panel — so a general build
        // (JS, Python, config…) wrote files the user never watched appear. Emit
        // the same file_stream event the page builder does, so every file Joe
        // writes shows up live in the Logs tab, marked done (it is already on
        // disk). Best-effort; the write already succeeded above.
        try {
            broadcast({
                type: 'file_stream',
                sessionId: context?.sessionId,
                data: {
                    sessionId: context?.sessionId,
                    file: rawPath,
                    chunk: content.slice(0, 60_000),
                    done: true,
                    label: 'written to disk',
                    bytes: Buffer.byteLength(content),
                    at: Date.now(),
                },
            } as any);
        } catch { /* the live view is a window, never a dependency of the write */ }

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

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const p = String(input?.path ?? '.');
        const includeHidden = Boolean(input?.includeHidden);
        // A directory listing is not a harmless read: it is how a path to
        // something worth taking gets found.
        const resolved = safePath(p, context?.workspaceId);
        if (!resolved.ok) return { ok: false, error: resolved.error, logs };
        const full = resolved.path;

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
    permissions: ToolPermission[] = ['read', 'execute'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 60;
    auditFields = ['query', 'path'];

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const query = String(input?.query ?? '');
        const searchPath = String(input?.path ?? '.');
        const include = String(input?.include ?? '');
        const exclude = String(input?.exclude ?? '');
        const resolvedDir = safePath(searchPath, context?.workspaceId);
        if (!resolvedDir.ok) return { ok: false, error: resolvedDir.error, logs };
        const workDir = resolvedDir.path;

        try {
            const hasGnuGrepRes = await executionEngine.execute({
                id: 'grep_check',
                type: 'shell',
                payload: { command: 'grep --help' },
                priority: 'low'
            });
            const hasGnuGrep = (hasGnuGrepRes.data?.output || '').includes('--exclude-dir');

            logs.push(`grep.flavor=${hasGnuGrep ? 'gnu' : 'busybox/bsd'}`);

            let stdout = '';
            let stderr = '';
            let code = 0;

            if (hasGnuGrep) {
                const args: string[] = ['-rnI'];
                if (include) args.push(`--include=${include}`);
                if (exclude) args.push(`--exclude-dir=${exclude}`);
                else args.push('--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist', '--exclude-dir=build', '--exclude-dir=.gemini');
                args.push('--', query, workDir);
                logs.push(`grep.args=${args.join(' ')}`);

                const r = await executionEngine.execute({
                    id: 'grep_gnu',
                    type: 'shell',
                    payload: { command: `grep ${args.join(' ')}`, options: { cwd: getWorkspaceRoot() } },
                    priority: 'normal'
                });
                stdout = r.data?.output || '';
                stderr = r.data?.error || '';
                code = r.data?.exitCode ?? (r.success ? 0 : 1);
            } else {
                const excludePatterns = exclude ? [exclude] : ['node_modules', '.git', 'dist', 'build', '.gemini'];
                let findCmd = `find ${workDir} -type f`;
                for (const pat of excludePatterns) {
                    findCmd += ` ! -path "*/${pat}/*"`;
                }
                if (include) findCmd += ` -name "${include}"`;

                logs.push(`grep.fallback_find=${findCmd}`);

                const findResult = await executionEngine.execute({
                    id: 'grep_fallback_find',
                    type: 'shell',
                    payload: { command: findCmd, options: { cwd: getWorkspaceRoot() } },
                    priority: 'normal'
                });
                const files = (findResult.data?.output || '').split('\n').filter(Boolean);
                
                if (files.length > 0) {
                    const grepArgs = `-nI -- "${query}" ${files.slice(0, 500).join(' ')}`;
                    const r = await executionEngine.execute({
                        id: 'grep_fallback_grep',
                        type: 'shell',
                        payload: { command: `grep ${grepArgs}`, options: { cwd: getWorkspaceRoot() } },
                        priority: 'normal'
                    });
                    stdout = r.data?.output || '';
                    stderr = r.data?.error || '';
                    code = r.data?.exitCode ?? (r.success ? 0 : 1);
                } else {
                    code = 1;
                }
            }

            if (code === 1 && !stdout) return { ok: true, output: { matches: [], count: 0 }, logs };
            if (code !== 0 && !stdout) return { ok: false, error: (stderr || 'grep_failed').trim(), logs };

            const lines = (stdout || '').split('\n').filter(Boolean).slice(0, 100);
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
        properties: { command: { type: 'string' }, packages: { type: 'array', items: { type: 'string' } }, dev: { type: 'boolean' }, cwd: { type: 'string' }, projectPath: { type: 'string' } },
        required: ['command']
    };
    outputSchema = { type: 'object' as const, properties: { output: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'write', 'internet'];
    sideEffects: ToolPermission[] = ['execute', 'write', 'internet'];
    rateLimitPerMinute = 30;

    async execute(input: any, context?: any) {
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
            const requestedCwd = String(input?.cwd || input?.projectPath || '').trim();
            const resolvedWorkDir = requestedCwd
                ? safePath(requestedCwd, context?.workspaceId)
                : { ok: true as const, path: getWorkspaceRoot(context?.workspaceId) };
            if (!resolvedWorkDir.ok) return { ok: false, error: resolvedWorkDir.error, logs };
            const workDir = resolvedWorkDir.path;
            logs.push(`npm.cwd=${workDir}`);
            const installLike = ['install', 'i', 'ci'].includes(cmdParts[0]);
            if (installLike) {
                const manifest = reconcileNpmManifest(workDir);
                if (!manifest.ok) {
                    logs.push(`npm.manifest_error=${manifest.error || 'invalid_package_json'}`);
                    return { ok: false, error: manifest.error || 'invalid_package_json', logs };
                }
                if (manifest.changed) {
                    logs.push(`npm.manifest_reconciled=${(manifest.removedDependencies || []).join(',')}`);
                }
            }
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

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const rawStructure = input?.structure || {};
        const declaredBaseDir = String(input?.baseDir || input?.projectName || input?.name || '.').trim() || '.';
        // Models sometimes include the project folder in every structure key
        // while also naming it as baseDir. Strip that one repeated prefix rather
        // than creating project/project/src and then losing project identity.
        const basePrefix = declaredBaseDir.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/u, '');
        const structureEntries = Object.entries(rawStructure);
        const repeatedPrefix = basePrefix !== '.' && structureEntries.length > 0
            && structureEntries.every(([relativePath]) => {
                const key = String(relativePath).replace(/\\/g, '/');
                return key === basePrefix || key.startsWith(`${basePrefix}/`);
            });
        const structure = repeatedPrefix
            ? Object.fromEntries(structureEntries.map(([relativePath, content]) => {
                const key = String(relativePath).replace(/\\/g, '/');
                return [key === basePrefix ? '' : key.slice(`${basePrefix}/`.length), content];
            }))
            : rawStructure;
        const baseDir = declaredBaseDir;
        const resolvedBaseDir = safePath(baseDir, context?.workspaceId);
        if (!resolvedBaseDir.ok) return { ok: false, error: resolvedBaseDir.error, logs };
        const resolvedBase = resolvedBaseDir.path;
        const created: string[] = [];
        const errors: string[] = [];

        for (const [relativePath, content] of Object.entries(structure)) {
            // Containing only the base is not enough — every key of `structure`
            // is a path fragment the model chose, and one of them being
            // "../../../.ssh/authorized_keys" escapes a base that is itself fine.
            const entry = safePath(path.join(resolvedBase, relativePath), context?.workspaceId);
            if (!entry.ok) { errors.push(`${relativePath}: ${entry.error}`); continue; }
            const fullPath = entry.path;
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

        // A generic scaffold is still a real project. Remember its directory
        // under the current session so later project_run, preview and surgical
        // edits operate on the artifact just created instead of the workspace
        // repository that happens to contain it.
        const sessionId = typeof context?.sessionId === 'string' ? context.sessionId.trim() : '';
        if (sessionId && created.length > 0) {
            const sessionKey = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
            const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
            const previous = projects[sessionKey] || {};
            projects[sessionKey] = {
                ...previous,
                dir: resolvedBase,
                type: previous.type || 'scaffold',
                updatedAt: Date.now(),
                lastRequest: String(input?.projectName || input?.name || path.basename(resolvedBase)).slice(0, 80),
            };
            persistJoeProjects();
            logs.push(`scaffold_project: registered active project ${sessionKey} -> ${resolvedBase}`);
        }
        return { ok: errors.length === 0, output: { created, errors, ...(sessionId ? { projectDir: resolvedBase } : {}) }, logs };
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
            command: { type: 'string', description: 'The command to execute' },
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
    rateLimitPerMinute = 60;
    auditFields = ['command', 'cwd'];

    async execute(input: any, context?: any) {
        const startedAt = Date.now();
        const logs: string[] = [];
        const command = String(input?.command ?? '').trim();
        // Called with no command, this tool built a request out of nothing and
        // handed it to the shell anyway — the audit saw `[object Object]` go
        // through the gateway. No instruction means no execution.
        if (!command) return { ok: false, error: 'shell_execute needs a command — nothing was run.', logs };
        let cwdInput = String(input?.cwd ?? '');
        // Package managers and build tools routinely run for minutes — on the
        // user's real laptop `npm install` alone can take five. The old flat
        // 30s default KILLED those runs mid-install and the failure surfaced
        // as a build error nobody could reproduce. Explicit timeouts always
        // win; only the default is command-aware.
        const isLongRunner = /^\s*(npm|npx|yarn|pnpm|pip3?|composer|dotnet|cargo|mvn|gradle|make)\b/.test(command)
            || /&&\s*(npm|npx|yarn|pnpm)\b/.test(command);
        const timeoutVal = Number(input?.timeout ?? (isLongRunner ? 300000 : 30000));
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
            // Credentials embedded in a git remote URL — a tokenized clone/push
            // (https://x-access-token:ghp_…@github.com/…) must never surface in
            // the visible terminal or the logs.
            out = out.replace(/(https?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, '$1$2:[REDACTED]@');
            out = out.replace(/\bgh[pousr]_[A-Za-z0-9]{16,}/g, '[REDACTED]');
            return out;
        };

        // [VISIBLE TERMINAL] Every autonomous command is addressed to the run's
        // actual session.  A raw `joe-agent` id has no registered owner and was
        // therefore either dropped by the socket privacy filter or missed by the
        // user's visible panel.  The shared panel stream is safely owner-scoped
        // and understands every terminal tab alias.
        const terminalSessionId = typeof context?.sessionId === 'string' ? context.sessionId : undefined;
        const paintToTerminal = (chunk: string) => {
            try {
                if (chunk) broadcastTerminalLine(terminalSessionId, chunk);
            } catch { /* the view is a window, never a dependency */ }
        };
        const echoCommand = () => paintToTerminal(`\r\n\x1b[36m$ ${redactCmd(command)}\x1b[0m\r\n`);
        const echoResult = (stdout: string, stderr: string, exit: number) => {
            const body = String(stdout || '') + (stderr ? `\x1b[31m${stderr}\x1b[0m` : '');
            // Terminals want CRLF; a bare LF from a child process stair-steps.
            paintToTerminal(body.replace(/\r?\n/g, '\r\n'));
            paintToTerminal(exit === 0 ? '\x1b[32m✓\x1b[0m\r\n' : `\x1b[31m✗ exit ${exit}\x1b[0m\r\n`);
        };

        if (dryRun) {
            const safeCmd = redactCmd(command);
            echoCommand();
            paintToTerminal(`\x1b[33m[dry run] ${safeCmd}\x1b[0m\r\n`);
            return { ok: true, output: { dryRun: true, status: 'success', command: safeCmd, stdout: `[dry run] ${safeCmd}`, exitCode: 0 }, logs: [`dryRun: ${safeCmd}`] };
        }

        if (command.includes('rm -rf /') || command.includes('sudo')) {
            const safeCmd = redactCmd(command);
            logs.push(`exec=${safeCmd} blocked=1`);
            echoCommand();
            paintToTerminal('\x1b[31m✗ command blocked by safety policy\x1b[0m\r\n');
            return { ok: false, error: 'command_not_allowed', logs };
        }

        const root = getWorkspaceRoot(context?.workspaceId);
        const stateFile = path.join(root, '.joe', 'shell_state.json');
        if (!cwdInput && fs.existsSync(stateFile)) {
            try {
                const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
                if (state.cwd && fs.existsSync(state.cwd)) cwdInput = state.cwd;
            } catch { }
        }

        // The persisted shell state is a path from a previous run, so it is
        // validated on the way back in — a cwd that was allowed once, or was
        // written into the state file by something else, is not trusted now.
        let workDir = root;
        if (cwdInput) {
            const resolvedCwd = safePath(cwdInput, context?.workspaceId);
            if (!resolvedCwd.ok) {
                echoCommand();
                paintToTerminal(`\x1b[31m✗ ${resolvedCwd.error}\x1b[0m\r\n`);
                return { ok: false, error: resolvedCwd.error, logs };
            }
            workDir = resolvedCwd.path;
        }

        try {
            if (background) {
                if (input.serverId) throw new Error('Background execution not yet supported for remote servers');

                // A planner can describe the same launch more than once (for
                // example after a bounded self-fix). Starting a second copy of
                // a real service is not progress: it usually fails with
                // EADDRINUSE and makes a previously successful phase look
                // broken. Reuse only a live process with the exact same
                // command and workspace, and discard stale entries first.
                for (const [existingId, existing] of backgroundProcesses) {
                    if (!isBackgroundProcessAlive(existing.pid)) {
                        backgroundProcesses.delete(existingId);
                        continue;
                    }
                    if (sameBackgroundInvocation(existing, command, workDir)) {
                        logs.push(`exec_bg_reused=${redactCmd(command)} id=${existingId} pid=${existing.pid}`);
                        echoCommand();
                        paintToTerminal(`\x1b[32m✓ already running (${existingId})\x1b[0m\r\n`);
                        return {
                            ok: true,
                            output: {
                                status: 'already_running',
                                id: existingId,
                                pid: existing.pid,
                                cwd: workDir,
                                message: 'The exact command is already running in this workspace; reused the live process.',
                            },
                            logs,
                        };
                    }
                }

                const id = 'bg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

                const result = await executionEngine.execute({
                    id,
                    type: 'shell',
                    payload: { command, options: { cwd: workDir, detached: true, stdio: 'ignore' } },
                    priority: 'low'
                });

                backgroundProcesses.set(id, {
                    pid: result.data?.pid || 0,
                    command,
                    cwd: workDir,
                    startTime: Date.now(),
                    process: result.data,
                });

                logs.push(`exec_bg=${redactCmd(command)} id=${id} pid=${result.data?.pid}`);
                echoCommand();
                paintToTerminal(`\x1b[32m✓ started in background (${id})\x1b[0m\r\n`);
                return {
                    ok: true,
                    output: { status: 'background', id, pid: result.data?.pid, message: 'Command started in background.' },
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
                echoCommand();
                echoResult(String(result.stdout || ''), String(result.stderr || ''), Number(result.code || 0));

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

            echoCommand();
            const r = await handleShellCommand(command, [], workDir, timeoutVal, false, context?.sessionId);
            const durationMs = Date.now() - startedAt;
            logs.push(...(r.logs || []));
            logs.push(`exec=${redactCmd(command)} server=local exit=${r.ok ? 0 : 1}`);
            echoResult(String(r.output || ''), r.ok ? '' : String(r.error || ''), r.ok ? 0 : 1);

            return {
                ok: r.ok,
                error: r.ok ? undefined : String(r.error || 'command_failed'),
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
            echoCommand();
            echoResult(String(e.stdout || ''), String(e.stderr || e.message || 'Command failed'), Number(e.code || 1));
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

        let running = true;
        try {
            process.kill(proc.pid, 0);
        } catch (e) {
            running = false;
        }

        if (!running) {
            backgroundProcesses.delete(id);
        }

        return {
            ok: true,
            output: { running, pid: proc.pid, command: proc.command, uptime: Date.now() - proc.startTime },
            logs: []
        };
    }
}
