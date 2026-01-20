import { ToolDefinition } from '../base';

export const MemoryTools: ToolDefinition[] = [
    {
        name: 'recall_memory',
        description: 'Search the deep memory (Project Knowledge Base) for code snippets, logic, or architectural details. Use this when the user asks about something not in the current file.',
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
