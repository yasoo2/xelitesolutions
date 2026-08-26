
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

function getWorkspaceRoot(workspaceId?: string) {
    try {
        const { workspaceService } = require('../../services/WorkspaceService');
        return workspaceService.getActiveRoot(workspaceId);
    } catch {
        return process.cwd();
    }
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
 * DirectoryInspectionTool: Returns a structured JSON tree of a directory.
 * Equivalent to `list_dir`.
 */
export class DirectoryInspectionTool extends BaseTool {
    name = 'inspect_directory';
    description = 'List directory contents in a structured JSON format (recursive supported).';
    version = '1.0.0';
    tags = ['fs', 'ls', 'inspect'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            depth: { type: 'number', default: 1 }
        },
        required: ['path']
    };
    outputSchema = { type: 'object' as const, properties: { tree: { type: 'array' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];

    async execute(input: any, context?: any) {
        const dirPath = resolveToolPath(String(input?.path ?? '.'), context?.workspaceId);
        const depth = Number(input.depth || 1);

        if (!fs.existsSync(dirPath)) return { ok: false, error: 'Directory not found', logs: [] };

        const buildTree = (currentPath: string, currentDepth: number): any[] => {
            if (currentDepth > depth) return [];
            try {
                const items = fs.readdirSync(currentPath, { withFileTypes: true });
                return items.map(item => {
                    const full = path.join(currentPath, item.name);
                    const isDir = item.isDirectory();
                    return {
                        name: item.name,
                        type: isDir ? 'directory' : 'file',
                        size: isDir ? 0 : (fs.statSync(full).size), // simplistic
                        children: isDir ? buildTree(full, currentDepth + 1) : undefined
                    };
                });
            } catch (e) {
                return [];
            }
        };

        const tree = buildTree(dirPath, 1);
        return { ok: true, output: { tree }, logs: [`listed=${dirPath} depth=${depth}`] };
    }
}

/**
 * FileSearchTool: smart find by name.
 * Equivalent to `find_by_name`.
 */
export class FileSearchTool extends BaseTool {
    name = 'search_files';
    description = 'Search for files by name patterns (glob).';
    version = '1.0.0';
    tags = ['fs', 'find', 'search'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            pattern: { type: 'string', description: 'Glob pattern e.g. **/*.ts' },
            path: { type: 'string', description: 'Root directory to search in' }
        },
        required: ['pattern']
    };
    outputSchema = { type: 'object' as const, properties: { files: { type: 'array' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];

    async execute(input: any, context?: any) {
        const pattern = String(input.pattern);
        const searchPath = resolveToolPath(String(input?.path ?? '.'), context?.workspaceId);

        try {
            const files = await glob(pattern, {
                cwd: searchPath,
                ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
                absolute: true
            });

            return {
                ok: true,
                output: { files: files.slice(0, 100) }, // Limit to 100 to avoid token blowup
                logs: [`found=${files.length} pattern=${pattern}`]
            };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

/**
 * SEARCH INSIDE FILES — the capability the wiring audit found missing, and
 * the one six well-known names were quietly pointed at the wrong tool for.
 *
 * `search_files` matches FILENAMES with a glob. Every model in the world says
 * «grep», «ripgrep», «code_search», «find_in_files» when it means «find this
 * TEXT in the code», and the alias table sent all of them to the glob tool —
 * which answered `{ files: [] }`. Not an error, not a refusal: a confident,
 * empty, wrong answer. Those names now land here, where the text is really
 * read, and the glob keeps its own name.
 */
export class SearchTextTool extends BaseTool {
    name = 'search_text';
    description = 'Search for TEXT (or a regular expression) inside files in the workspace, returning file, line number and the matching line.';
    version = '1.0.0';
    tags = ['search', 'grep', 'read'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            query: { type: 'string', description: 'The text to find' },
            pattern: { type: 'string', description: 'Alias of query' },
            path: { type: 'string', description: 'Directory to search (defaults to the workspace root)' },
            regex: { type: 'boolean', description: 'Treat the query as a regular expression' },
            caseSensitive: { type: 'boolean' },
            glob: { type: 'string', description: 'Limit to files matching this glob (default all text files)' },
            maxResults: { type: 'number', description: 'Default 200' },
        },
        // Either public alias satisfies the same semantic requirement. The
        // planner's argument repair pass understands this extension while the
        // JSON-schema `required` list remains empty for backward compatibility.
        required: [] as string[],
        requiredAny: [['query', 'pattern']],
    };
    outputSchema = { type: 'object' as const, properties: { matches: { type: 'array' }, total: { type: 'number' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];

    async execute(input: any, context?: any) {
        const raw = String(input?.query ?? input?.pattern ?? '').trim();
        if (!raw) return { ok: false, error: 'search_text needs a query — the text to look for.', logs: [] };
        let root: string;
        try {
            root = resolveToolPath(String(input?.path ?? '.'), context?.workspaceId);
        }
        catch (e: any) { return { ok: false, error: String(e?.message || e), logs: [] }; }

        const max = Math.max(1, Math.min(1000, Number(input?.maxResults) || 200));
        let re: RegExp;
        try {
            re = input?.regex === true
                ? new RegExp(raw, input?.caseSensitive ? 'g' : 'gi')
                : new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), input?.caseSensitive ? 'g' : 'gi');
        } catch (e: any) { return { ok: false, error: `bad_regex: ${String(e?.message || e)}`, logs: [] }; }

        const files = await glob(String(input?.glob || '**/*'), {
            cwd: root, nodir: true, absolute: true, dot: false,
            ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**', '**/*.png', '**/*.jpg',
                '**/*.jpeg', '**/*.gif', '**/*.webp', '**/*.woff2', '**/*.zip', '**/*.pdf', '**/*.mp4'],
        });
        const matches: Array<{ file: string; line: number; text: string }> = [];
        let scanned = 0;
        for (const f of files) {
            if (matches.length >= max) break;
            try {
                const st = fs.statSync(f);
                if (!st.isFile() || st.size > 2_000_000) continue;      // a 2MB text file is not source
                const body = fs.readFileSync(f, 'utf-8');
                if (body.includes('\u0000')) continue;                  // binary
                scanned++;
                const lines = body.split(/\r?\n/);
                for (let i = 0; i < lines.length && matches.length < max; i++) {
                    re.lastIndex = 0;
                    if (re.test(lines[i])) {
                        matches.push({ file: path.relative(root, f) || path.basename(f), line: i + 1, text: lines[i].trim().slice(0, 300) });
                    }
                }
            } catch { /* unreadable file — skip, never fail the search */ }
        }
        return {
            ok: true,
            output: { matches, total: matches.length, truncated: matches.length >= max },
            logs: [`search_text=${raw} scanned=${scanned} matches=${matches.length}`],
        };
    }
}


/**
 * SymbolInspectorTool: extracts specific function/class definitions.
 * Equivalent to `view_code_item`.
 */
export class SymbolInspectorTool extends BaseTool {
    name = 'inspect_symbol';
    description = 'Extract the code definition of a specific Class or Function by name.';
    version = '1.0.0';
    tags = ['code', 'inspect', 'read'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            filePath: { type: 'string' },
            symbolName: { type: 'string' },
            type: { type: 'string', enum: ['function', 'class'], description: 'Optional hint' }
        },
        required: ['filePath', 'symbolName']
    };
    outputSchema = { type: 'object' as const, properties: { code: { type: 'string' } } };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];

    async execute(input: any, context?: any) {
        const filePath = resolveToolPath(String(input?.filePath ?? ''), context?.workspaceId);
        const symbol = String(input.symbolName);

        if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found', logs: [] };

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            // Heuristic extraction: Find start line matching regex, then count braces
            const regex = new RegExp(`(?:class|function|const|let|var)\\s+${symbol}\\b`);
            let startLine = -1;

            for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                    startLine = i;
                    break;
                }
            }

            if (startLine === -1) return { ok: false, error: `Symbol '${symbol}' not found in file.`, logs: [] };

            // Brace counting
            let openBraces = 0;
            let endLine = -1;
            let foundStart = false;

            for (let i = startLine; i < lines.length; i++) {
                const line = lines[i];
                openBraces += (line.match(/{/g) || []).length;
                openBraces -= (line.match(/}/g) || []).length;

                if (openBraces > 0) foundStart = true;
                if (foundStart && openBraces <= 0) {
                    endLine = i;
                    break;
                }
            }

            // Fallback if no braces (e.g. export const x = ...)
            if (endLine === -1) endLine = startLine + 20; // safe fallback

            return {
                ok: true,
                output: { code: lines.slice(startLine, endLine + 1).join('\n') },
                logs: [`extracted=${symbol}`]
            };

        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}

/**
 * AdvancedFileEditTool: Multi-chunk replacement.
 * Equivalent to `multi_replace_file_content`.
 */
/**
 *  A REPLACEMENT MUST ARRIVE IN THE FILE'S OWN LINE ENDINGS.
 *
 *  Every file Joe generates on this machine is CRLF — counted on a real
 *  build: App.jsx 53/53, employees.js 13/13, main.jsx 1/1. A model writes
 *  its `find` and `replace` blocks with bare LF. The matcher below is
 *  whitespace-tolerant and finds the text anyway; the REPLACEMENT was
 *  then spliced in as LF, leaving a file with two kinds of line ending
 *  and the next literal edit unable to match what it had just written.
 */
function endingOf(content: string): string {
    const crlf = (content.match(/\r\n/g) || []).length;
    const bareLf = (content.match(/(?<!\r)\n/g) || []).length;
    return crlf >= bareLf && crlf > 0 ? '\r\n' : '\n';
}

function applyAdvancedReplacement(content: string, find: string, replace: string): string | null {
    const ending = endingOf(content);
    const asFile = (t: string) => t.replace(/\r\n?/g, '\n').split('\n').join(ending);
    const findHere = asFile(find);
    const replaceHere = asFile(replace);
    if (content.includes(findHere)) return content.replace(findHere, replaceHere);
    const lines = String(find || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    const escaped = lines.map(line => [...line].map(char => /\s/.test(char)
        ? '\\s*'
        : `${char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`).join(''));
    try {
        const re = new RegExp(escaped.join('\\s*\\n\\s*'));
        const match = content.match(re);
        if (match && match.index !== undefined) {
            return content.slice(0, match.index) + replaceHere + content.slice(match.index + match[0].length);
        }
    } catch { /* malformed evidence is refused honestly */ }
    return null;
}

export class AdvancedFileEditTool extends BaseTool {
    name = 'file_edit_advanced';
    description = 'Advanced file editing with multiple non-contiguous replacements.';
    version = '1.0.0';
    tags = ['fs', 'edit', 'write', 'advanced'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            filePath: { type: 'string' },
            edits: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        find: { type: 'string' },
                        replace: { type: 'string' }
                    },
                    required: ['find', 'replace']
                }
            }
        },
        required: ['filePath', 'edits']
    };
    outputSchema = { type: 'object' as const, properties: { success: { type: 'boolean' } } };
    permissions: ToolPermission[] = ['write', 'read'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any, context?: any) {
        const filePath = resolveToolPath(String(input?.filePath ?? ''), context?.workspaceId);
        const edits = input.edits || [];

        if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found', logs: [] };

        try {
            const original = fs.readFileSync(filePath, 'utf-8');
            let content = original;
            let failedEdits = 0;

            for (const edit of edits) {
                const next = applyAdvancedReplacement(content, String(edit?.find ?? ''), String(edit?.replace ?? ''));
                if (next === null) {
                    failedEdits++;
                } else {
                    content = next;
                }
            }

            // Never persist a partial multi-edit. A failed recovery must leave
            // the repository unchanged so the next diagnosis sees honest state.
            if (failedEdits > 0) {
                return {
                    ok: false,
                    error: `Advanced edit could not match ${failedEdits} replacement(s).`,
                    output: { success: false, failedCount: failedEdits },
                    logs: [`applied=${edits.length - failedEdits} failed=${failedEdits}`],
                };
            }
            fs.writeFileSync(filePath, content);

            return {
                ok: true,
                output: { success: true, failedCount: 0 },
                logs: [`applied=${edits.length} failed=0`]
            };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}
