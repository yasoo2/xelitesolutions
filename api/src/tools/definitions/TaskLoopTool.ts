
import { BaseTool } from '../base';
import { executeTool } from '../../services/ToolService'; // Import the dispatcher
import { ToolPermission } from '../types';

export class TaskLoopTool extends BaseTool {
    name = 'task_loop';
    description = 'Execute a multi-step plan with self-correction and context preservation.';
    version = '1.0.1'; // 1.0.1: Extracted to class
    tags = ['agent', 'recursive', 'loop', 'automation'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            goal: { type: 'string' },
            steps: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        tool: { type: 'string' },
                        args: { type: 'object' }
                    }
                }
            },
            maxIterations: { type: 'number' }
        },
        required: ['goal', 'steps']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            completedSteps: { type: 'number' },
            results: { type: 'array' }
        }
    };

    permissions: ToolPermission[] = ['execute', 'internet', 'read', 'write'];
    sideEffects: ToolPermission[] = ['execute', 'write'];
    rateLimitPerMinute = 2;
    auditFields = ['goal'];

    async execute(input: any) {
        const logs: string[] = [];
        const steps = Array.isArray(input.tasks) ? input.tasks : (input.steps || []);
        const results: any[] = [];
        let success = true;

        logs.push(`Starting TaskLoop for: ${input.goal || 'unspecified'} (${steps.length} steps)`);

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            logs.push(`Step ${i + 1}: ${step.name || step.tool}`);

            try {
                // Execute the tool via Registry Dispatcher
                const result = await executeTool(step.tool, step.args || {});
                results.push({ step: i, tool: step.tool, ok: result.ok, output: result.output, error: result.error });

                if (!result.ok) {
                    logs.push(`Step failed: ${result.error}`);
                    // Simple self-correction: retry once
                    logs.push('Retrying step...');
                    const retry = await executeTool(step.tool, step.args || {});
                    results[i] = { step: i, tool: step.tool, ok: retry.ok, output: retry.output, error: retry.error, retried: true };

                    if (!retry.ok) {
                        success = false;
                        logs.push(`Retry failed. Aborting loop.`);
                        break;
                    }
                }
            } catch (e: any) {
                logs.push(`Exception in step: ${e.message}`);
                success = false;
                break;
            }
        }

        return { ok: success, output: { success, completedSteps: results.length, results }, logs };
    }
}
