import path from 'path';
import fs from 'fs';
import { glob } from 'glob';
import { VectorMemory } from '../../memory/VectorMemory';

let memory: VectorMemory | null = null;

export const CodebaseNavigatorTool = {
    name: 'codebase_navigator',
    version: '2.0.0', // Major bump for God Mode
    tags: ['search', 'codebase', 'semantic', 'memory', 'scalable'],
    description: 'Semantically index and search the codebase. Use this to find relevant code snippets via natural language queries. Optimized for large codebases.',
    inputSchema: {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['index', 'search'],
                description: 'Action to perform: "index" to scan files, "search" to query memory.'
            },
            targetDir: {
                type: 'string',
                description: 'Directory to index (absolute path). Required for "index".'
            },
            query: {
                type: 'string',
                description: 'Natural language query. Required for "search".'
            },
            limit: {
                type: 'number',
                default: 5,
                description: 'Number of results to return.'
            },
            pattern: {
                type: 'string',
                default: '**/*.{ts,tsx,js,jsx,py,md,java,go,rs}',
                description: 'Glob pattern for indexing.'
            }
        },
        required: ['action']
    },
    outputSchema: {
        type: 'object',
        properties: {
            ok: { type: 'boolean' },
            output: { type: 'object' },
            logs: { type: 'array' }
        }
    },
    permissions: ['read', 'internet'],
    sideEffects: ['read'],
    rateLimitPerMinute: 10,
    auditFields: ['action', 'query', 'targetDir'],
    mockSupported: false,

    execute: async (input: { action: string, targetDir?: string, query?: string, limit?: number, pattern?: string }) => {
        if (!memory) {
            memory = new VectorMemory();
        }
        await memory.init();

        if (input.action === 'index') {
            if (!input.targetDir) throw new Error('targetDir is required for index action');
            const targetDir = input.targetDir;
            const pattern = input.pattern || '**/*.{ts,tsx,js,jsx,py,md,java,go,rs}';

            console.log(`[Navigator] Indexing ${targetDir} with pattern ${pattern}...`);
            const logs: string[] = [];

            // Use glob to find files efficiently
            // ignore node_modules, dist, etc.
            const files = await glob(pattern, {
                cwd: targetDir,
                ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.git/**'],
                nodir: true,
                absolute: true
            });

            console.log(`[Navigator] Found ${files.length} files.`);
            logs.push(`Found ${files.length} files.`);

            let count = 0;
            // Process in chunks or sequentially to avoid OOM
            // For now sequential is fine for < 100k files if we don't hold content in memory
            for (const fullPath of files) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    // Skip huge files
                    if (content.length > 100000) {
                        logs.push(`Skipped large file: ${path.basename(fullPath)}`);
                        continue;
                    }

                    // Chunk large files into multiple vectors for better search
                    if (content.length > 5000) {
                        const chunkSize = 5000;
                        for (let i = 0; i < content.length; i += chunkSize) {
                            const chunk = content.substring(i, i + chunkSize);
                            await memory.add(`${fullPath}#chunk${Math.floor(i / chunkSize)}`, chunk, {
                                type: 'code',
                                path: fullPath,
                                chunkIndex: Math.floor(i / chunkSize)
                            });
                        }
                    } else {
                        await memory.add(fullPath, content, { type: 'code', path: fullPath });
                    }
                    count++;
                } catch (err: any) {
                    // Ignore read errors
                    logs.push(`Failed to read ${path.basename(fullPath)}: ${err.message}`);
                }
            }

            return { ok: true, output: { message: `Indexed ${count} files.` }, logs };
        }

        if (input.action === 'search') {
            if (!input.query) throw new Error('query is required for search action');

            console.log(`[Navigator] Searching for: "${input.query}"`);
            const results = await memory.search(input.query, input.limit || 5);

            // Format results for the agent
            const snippets = results.ids[0].map((id: string, idx: number) => ({
                filePath: id,
                score: results.distances[0][idx],
                preview: (results.documents[0][idx] || '').substring(0, 300) + '...'
            }));

            return { ok: true, output: { results: snippets }, logs: [] };
        }

        throw new Error(`Unknown action: ${input.action}`);
    }
};
