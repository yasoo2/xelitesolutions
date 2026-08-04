
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { ToolDefinition } from '../types';
import { vectorDb } from '../../services/vectorDb';

/**
 * THE TOOL IS THE IMPLEMENTATION.
 *
 * These two carried a name, a description and a schema — and no execute() at
 * all. The work lived as a special case inside ToolService, so anything that
 * called the tool directly (a registry audit, the orchestrator's direct path)
 * died on «t.execute is not a function»: a catalogue entry promising a
 * capability the object did not have. The bodies now live here, where the
 * schema that advertises them lives, and a missing argument earns an honest
 * sentence rather than a TypeError.
 */
export const MemoryTools: ToolDefinition[] = [
    {
        name: 'recall_memory',
        description: 'Search the deep memory (Project Knowledge Base) for code snippets, logic, or architectural details. Use this when the user asks about something not in the current file.',
        version: '1.0.0',
        tags: ['memory', 'search'],
        permissions: ['read'],
        sideEffects: [],
        rateLimitPerMinute: 60,
        auditFields: ['query'],
        mockSupported: true,
        outputSchema: { type: 'string' },
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query (e.g., "User schema definition", "Auth logic", "How X works")',
                },
                limit: {
                    type: 'number',
                    description: 'Max number of results to return (default: 5)',
                }
            },
            required: ['query'],
        },
        execute: async (input: any) => {
            const query = String(input?.query || '').trim();
            if (!query) return { ok: false, output: 'recall_memory needs a query — say what to look for.', logs: [] };
            try {
                const results = await vectorDb.search(query, Number(input?.limit) || 5);
                const output = results.map((r: any) =>
                    `[File: ${r.doc.metadata.filePath}]\nScore: ${r.score.toFixed(2)}\nContent:\n${r.doc.content}`
                ).join('\n---\n');
                return { ok: true, output: output || 'No relevant memory found.', logs: [] };
            } catch (e: any) {
                return { ok: false, output: `Memory Recall Failed: ${e.message}`, logs: [] };
            }
        },
    } as any,
    {
        name: 'memorize_codebase',
        description: 'Scan and index the entire codebase (or a specific directory) into Deep Memory. Run this to initialize or update the memory.',
        version: '1.0.0',
        tags: ['memory', 'index'],
        permissions: ['read', 'write'],
        sideEffects: ['write'],
        rateLimitPerMinute: 10,
        auditFields: ['directory'],
        mockSupported: true,
        outputSchema: { type: 'string' },
        inputSchema: {
            type: 'object',
            properties: {
                directory: {
                    type: 'string',
                    description: 'Root directory to start indexing (default: current working directory)',
                },
                extensions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'File extensions to include (e.g., ["ts", "tsx", "js", "md"])',
                }
            },
        },
        execute: async (input: any, context?: any) => {
            try {
                const { workspaceService } = require('../../services/WorkspaceService');
                const root = input?.directory || workspaceService.getActiveRoot(context?.workspaceId);
                if (!root || !fs.existsSync(root)) {
                    return { ok: false, output: 'memorize_codebase needs a real directory to index.', logs: [] };
                }
                const exts: string[] = Array.isArray(input?.extensions) && input.extensions.length
                    ? input.extensions : ['ts', 'tsx', 'js', 'json', 'md', 'py', 'css', 'html'];
                const files = await glob(`**/*.{${exts.join(',')}}`, {
                    cwd: root, ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
                });
                await vectorDb.clear();
                let count = 0;
                for (const file of files) {
                    const fullPath = path.join(root, file);
                    try {
                        if (fs.statSync(fullPath).isDirectory()) continue;
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        await vectorDb.addDocument(content.length > 50000 ? content.slice(0, 20000) : content, { filePath: file });
                        count++;
                    } catch { /* one unreadable file never stops the index */ }
                }
                return { ok: true, output: `Successfully indexed ${count} files into Deep Memory.`, logs: [] };
            } catch (e: any) {
                return { ok: false, output: `Memorization Failed: ${e.message}`, logs: [] };
            }
        },
    } as any,
];
