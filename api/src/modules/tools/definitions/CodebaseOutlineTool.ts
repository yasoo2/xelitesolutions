
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';

export class CodebaseOutlineTool extends BaseTool {
    name = 'codebase_outline';
    description = 'Scan a file and extract its structure (Classes, Functions, Interfaces) using fast regex pattern matching.';
    version = '1.0.0';
    tags = ['code', 'analysis', 'outline'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            filePath: { type: 'string', description: 'Absolute path or relative path to the file.' }
        },
        required: ['filePath']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            classes: { type: 'array' },
            functions: { type: 'array' },
            interfaces: { type: 'array' },
            imports: { type: 'array' },
            totalLines: { type: 'number' }
        }
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 60;
    auditFields = ['filePath'];

    async execute(input: any) {
        const filePath = String(input.filePath || '');
        if (!filePath) return { ok: false, error: 'filePath is required', logs: [] };

        const root = process.cwd();
        const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);

        if (!fs.existsSync(fullPath)) return { ok: false, error: `File not found: ${fullPath}`, logs: [] };

        try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const outline = {
                classes: [] as string[],
                functions: [] as string[],
                interfaces: [] as string[],
                imports: [] as string[],
                totalLines: lines.length
            };

            // Regex patterns (simplified for speed)
            const patterns = {
                class: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_]+)/,
                func: /^\s*(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)/,
                funcConst: /^\s*(?:export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/,
                interface: /^\s*(?:export\s+)?interface\s+([a-zA-Z0-9_]+)/,
                import: /^\s*import\s/
            };

            lines.forEach((line, idx) => {
                const num = idx + 1;
                const trimmed = line.trim();

                let match = trimmed.match(patterns.class);
                if (match) { outline.classes.push(`L${num}: ${match[1]}`); return; }

                match = trimmed.match(patterns.func);
                if (match) { outline.functions.push(`L${num}: ${match[1]}`); return; }

                match = trimmed.match(patterns.funcConst);
                if (match) { outline.functions.push(`L${num}: ${match[1]}`); return; }

                match = trimmed.match(patterns.interface);
                if (match) { outline.interfaces.push(`L${num}: ${match[1]}`); return; }

                match = trimmed.match(patterns.import);
                if (match) { outline.imports.push(`L${num}: ${trimmed.substring(0, 50)}...`); return; }
            });

            return {
                ok: true,
                output: outline,
                logs: [`Scanned ${filePath}: ${outline.classes.length} classes, ${outline.functions.length} functions.`]
            };

        } catch (e: any) {
            return { ok: false, error: `Failed to read file: ${e.message}`, logs: [] };
        }
    }
}
