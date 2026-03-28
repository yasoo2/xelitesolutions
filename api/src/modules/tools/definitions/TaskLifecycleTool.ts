
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { broadcast } from '../../../api/ws';

export class TaskLifecycleTool extends BaseTool {
    name = 'task_lifecycle';
    description = 'Manage the lifecycle of an agent task loop. Use this to update the UI with your current status, summary, and mode.';
    version = '1.0.0';
    tags = ['system', 'ui', 'lifecycle'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            action: { type: 'string', enum: ['update', 'complete', 'fail'] },
            taskName: { type: 'string' },
            taskStatus: { type: 'string', description: 'What you are doing right now (e.g. "Scanning files...")' },
            taskSummary: { type: 'string', description: 'What you have done so far.' },
            mode: { type: 'string', enum: ['PLANNING', 'EXECUTION', 'VERIFICATION'] }
        },
        required: ['action']
    };
    outputSchema = { type: 'object' as const, properties: { success: { type: 'boolean' } } };
    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];

    async execute(input: any) {
        const action = input.action || 'update';

        // Broadcast event to specific listening frontend components
        // "task_update" is a new event type we will support in the frontend
        broadcast({
            type: 'task_update',
            data: {
                action,
                taskName: input.taskName || 'Task',
                taskStatus: input.taskStatus,
                taskSummary: input.taskSummary,
                mode: input.mode || 'EXECUTION',
                timestamp: Date.now()
            }
        });

        return { ok: true, output: { success: true }, logs: [`Task ${action}: ${input.taskStatus}`] };
    }
}
