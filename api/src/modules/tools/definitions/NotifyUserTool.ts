import { broadcast } from '../../../api/ws';
import { ToolDefinition } from '../types';

/**
 * NotifyUserTool — Non-blocking progress update.
 *
 * Unlike `echo` (which terminates the Agent Loop), this tool sends a
 * message to the frontend UI **without** breaking the autonomous cycle.
 * The agent can continue executing tools after calling this.
 *
 * The backend `run.ts` loop must NOT break when `plan.name === 'notify_user'`.
 */
export class NotifyUserTool implements ToolDefinition {
    name = 'notify_user';
    description =
        'Send a non-blocking progress update to the user\'s chat UI. ' +
        'Unlike `echo`, this does NOT stop your autonomous execution loop. ' +
        'Use this to keep the user informed about intermediate steps ' +
        '(e.g. "Installing dependencies…", "Running tests…"). ' +
        'Use `echo` ONLY for the final concluding message.';
    version = '1.0.0';
    tags = ['communication', 'ui', 'progress', 'agent'];
    permissions: any = ['write'];
    sideEffects: any = ['write'];
    rateLimitPerMinute = 30;
    auditFields = ['message'];
    mockSupported = true;
    outputSchema = {
        type: 'object',
        properties: {
            acknowledged: { type: 'boolean' },
        },
    };
    inputSchema = {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description:
                    'The progress update message to display to the user. Keep it concise and informative.',
            },
            level: {
                type: 'string',
                enum: ['info', 'warning', 'success', 'error'],
                description: 'Severity level of the notification. Default: info.',
            },
        },
        required: ['message'],
    };

    async execute(input: any, context?: any) {
        try {
            const level = input.level || 'info';
            const message = String(input.message || '');

            // Broadcast to all connected WebSocket clients
            broadcast({
                type: 'agent_notification',
                data: {
                    message,
                    level,
                    timestamp: new Date().toISOString(),
                    isProgress: true, // Flag so the frontend knows this is NOT a final answer
                },
            });

            // Also emit as a regular text event so it shows in the chat stream
            if (context?.ev) {
                context.ev({ type: 'text', data: `🔔 ${message}` });
            }

            return {
                ok: true,
                output: { acknowledged: true },
                logs: [`Notification sent: "${message}" (level: ${level})`],
            };
        } catch (error: any) {
            return {
                ok: false,
                error: `Failed to send notification: ${error.message}`,
                logs: [`Error: ${error.message}`],
            };
        }
    }
}
