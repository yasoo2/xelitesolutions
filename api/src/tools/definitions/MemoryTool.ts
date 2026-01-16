import { ToolDefinition } from '../types';
import { VectorMemory } from '../../memory/VectorMemory';

const memory = new VectorMemory();

export const MemoryTool: ToolDefinition = {
    name: 'memory_ops',
    version: '1.0.0',
    tags: ['memory', 'knowledge', 'store'],
    description: 'Store and retrieve long-term knowledge, code snippets, and architectural patterns.',
    inputSchema: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['remember', 'recall'] },
            content: { type: 'string', description: 'The text/code to store or the query to search for.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for organization (remember only)' },
            id: { type: 'string', description: 'Unique ID for the memory (optional, auto-generated if empty)' }
        },
        required: ['action', 'content']
    },
    outputSchema: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            memoryId: { type: 'string' },
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        content: { type: 'string' },
                        score: { type: 'number' }
                    }
                }
            }
        }
    },
    permissions: ['read', 'write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['action', 'content'],
    mockSupported: true,
    execute: async (input) => {
        const action = input.action;
        const content = input.content;

        if (action === 'remember') {
            const id = input.id || `mem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            await memory.add(id, content, { tags: input.tags || [] });
            return { ok: true, output: { success: true, memoryId: id }, logs: [`Stored memory: ${id}`] };
        }

        if (action === 'recall') {
            const results = await memory.search(content, 5);
            // Map Chroma/VectorDB results to simple format
            const simpleResults = results.ids[0].map((id: string, idx: number) => ({
                id: id,
                content: results.documents[0][idx] || '',
                score: results.distances ? results.distances[0][idx] : 0
            }));

            return { ok: true, output: { success: true, results: simpleResults }, logs: [`Found ${simpleResults.length} matches`] };
        }

        return { ok: false, error: 'Invalid action', logs: [] };
    }
};
