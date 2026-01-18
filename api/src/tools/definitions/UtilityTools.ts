
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

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

    async execute(input: any) {
        const root = process.cwd();
        const dirPath = input.path ? (path.isAbsolute(input.path) ? input.path : path.resolve(root, input.path)) : root;
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

    async execute(input: any) {
        const pattern = String(input.pattern);
        const searchPath = input.path ? (path.isAbsolute(input.path) ? input.path : path.resolve(process.cwd(), input.path)) : process.cwd();

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

    async execute(input: any) {
        const filePath = input.filePath ? (path.isAbsolute(input.filePath) ? input.filePath : path.resolve(process.cwd(), input.filePath)) : '';
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

    async execute(input: any) {
        const filePath = input.filePath ? (path.isAbsolute(input.filePath) ? input.filePath : path.resolve(process.cwd(), input.filePath)) : '';
        const edits = input.edits || [];

        if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found', logs: [] };

        try {
            let content = fs.readFileSync(filePath, 'utf-8');
            let failedEdits = 0;

            for (const edit of edits) {
                if (content.includes(edit.find)) {
                    content = content.replace(edit.find, edit.replace);
                } else {
                    failedEdits++;
                }
            }

            fs.writeFileSync(filePath, content);

            return {
                ok: failedEdits === 0,
                output: { success: true, failedCount: failedEdits },
                logs: [`applied=${edits.length - failedEdits} failed=${failedEdits}`]
            };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}
