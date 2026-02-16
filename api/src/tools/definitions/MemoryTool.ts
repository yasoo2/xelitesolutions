
import { ToolDefinition } from '../types';

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
    },
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
    },
];
