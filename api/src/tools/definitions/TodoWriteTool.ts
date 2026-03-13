import { broadcast } from '../../ws';
import { ToolDefinition } from '../types';

export const TodoWriteTool: ToolDefinition = {
    name: 'todo_write',
    description: 'Proactively create and manage a structured task list for your current coding session. This helps track progress, organize complex tasks, and demonstrate thoroughness to the user.',
    version: '1.0.0',
    tags: ['task', 'management', 'ui', 'productivity'],
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['todos'],
    mockSupported: true,
    outputSchema: {
        type: 'object',
        properties: {
            acknowledged: { type: 'boolean' },
            count: { type: 'number' }
        }
    },
    inputSchema: {
        type: 'object',
        properties: {
            merge: {
                type: 'boolean',
                description: 'If true, existing todos not in this list will be preserved. If false, the entire list is replaced.'
            },
            todos: {
                type: 'array',
                description: 'Array of todo items to write to the workspace.',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', description: 'Unique identifier for the todo item' },
                        status: {
                            type: 'string',
                            enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                            description: 'The current status of the todo item'
                        },
                        content: { type: 'string', description: 'The description/content of the todo item' }
                    },
                    required: ['id', 'status', 'content']
                }
            },
            workspaceId: { type: 'string', description: 'The current workspace ID to target the UI update.' }
        },
        required: ['merge', 'todos']
    },
    execute: async (input) => {
        try {
            // Emitting it directly to the connected clients via the backend WS broadcaster.
            broadcast({
                type: 'todo_update',
                id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, // Unique ID to avoid dedup
                data: {
                    merge: input.merge,
                    todos: input.todos,
                    sessionId: input.workspaceId, // Include for session routing
                    timestamp: new Date().toISOString()
                }
            });

            return {
                ok: true,
                data: { acknowledged: true, count: input.todos.length },
                logs: [`Successfully broadcasted ${input.todos.length} todo items. (merge: ${input.merge})`]
            };

        } catch (error: any) {
            return {
                ok: false,
                error: `Failed to update todos: ${error.message}`,
                logs: [`Error: ${error.message}`]
            };
        }
    }
};
