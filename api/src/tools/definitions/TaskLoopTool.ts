
import { BaseTool } from '../base';
import { ToolPermission } from '../types';

/**
 * TaskLoopTool V2.0 - Enhanced with Exponential Backoff & Wolverine
 * 
 * Modes:
 * - 'fixed_steps': Execute steps in order, abort on failure (legacy)
 * - 'until_success': Retry each step until it succeeds (Wolverine mode)
 */
export class TaskLoopTool extends BaseTool {
    name = 'task_loop';
    description = 'Execute a multi-step plan with self-correction, exponential backoff, and Wolverine self-healing.';
    version = '2.0.0'; // 2.0.0: Added exponential backoff and Wolverine integration
    tags = ['agent', 'recursive', 'loop', 'automation', 'god-mode'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            goal: { type: 'string' },
            sessionId: { type: 'string' },
            workspaceId: { type: 'string' },
            mode: {
                type: 'string',
                enum: ['fixed_steps', 'until_success'],
                description: 'Execution mode. "until_success" retries failed steps with backoff.'
            },
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
            maxIterations: { type: 'number', description: 'Max retries per step (default: 10)' },
            enableWolverine: { type: 'boolean', description: 'Use Wolverine self-healing on errors (default: true)' }
        },
        required: ['goal', 'steps']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            completedSteps: { type: 'number' },
            totalIterations: { type: 'number' },
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
        const sessionId = typeof input?.sessionId === 'string' && input.sessionId.trim() ? input.sessionId.trim() : undefined;
        const workspaceId =
            typeof input?.workspaceId === 'string' && input.workspaceId.trim()
                ? input.workspaceId.trim()
                : typeof input?.__workspaceId === 'string' && input.__workspaceId.trim()
                    ? input.__workspaceId.trim()
                    : undefined;

        const mode = input.mode || 'fixed_steps';
        const maxIterations = input.maxIterations || 10;
        const enableWolverine = input.enableWolverine !== false;
        let totalIterations = 0;

        logs.push(`🔄 TaskLoop V2.0: "${input.goal || 'unspecified'}" (${steps.length} steps, mode: ${mode})`);

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            logs.push(`\n📌 Step ${i + 1}: ${step.name || step.tool}`);

            let stepSuccess = false;
            let retryCount = 0;
            let lastError = '';

            while (!stepSuccess && retryCount < maxIterations) {
                try {
                    // Execute the tool via Registry Dispatcher (Lazy load to avoid circular dependency)
                    const { executeTool } = require('../../services/ToolService');
                    const result = await executeTool(step.tool, step.args || {}, { sessionId, workspaceId });
                    totalIterations++;

                    if (result.ok) {
                        stepSuccess = true;
                        results.push({ step: i, tool: step.tool, ok: true, output: result.output, retries: retryCount });
                        logs.push(`✅ Step succeeded${retryCount > 0 ? ` (after ${retryCount} retries)` : ''}`);
                    } else {
                        lastError = result.error || 'Unknown error';
                        logs.push(`❌ Attempt ${retryCount + 1} failed: ${lastError}`);

                        // Attempt Wolverine self-healing
                        if (enableWolverine && lastError) {
                            logs.push(`🦸 Wolverine attempting to heal...`);
                            try {
                                const healResult = await executeTool('error_recovery', {
                                    error: lastError,
                                    attemptFix: true
                                }, { sessionId, workspaceId });

                                if (healResult.ok && healResult.output?.recovered) {
                                    logs.push(`✅ Wolverine healed the error, retrying...`);
                                }
                            } catch (healErr: any) {
                                logs.push(`⚠️ Wolverine heal failed: ${healErr.message}`);
                            }
                        }

                        // Exponential backoff (only in until_success mode)
                        if (mode === 'until_success') {
                            const delay = Math.min(30000, 1000 * Math.pow(2, retryCount));
                            logs.push(`⏳ Backoff: ${delay}ms before retry ${retryCount + 2}...`);
                            await new Promise(r => setTimeout(r, delay));
                        }

                        retryCount++;
                    }
                } catch (e: any) {
                    lastError = e.message;
                    logs.push(`💥 Exception: ${e.message}`);
                    retryCount++;
                    totalIterations++;
                }

                // In fixed_steps mode, only retry once
                if (mode === 'fixed_steps' && retryCount >= 1 && !stepSuccess) {
                    break;
                }
            }

            if (!stepSuccess) {
                results.push({ step: i, tool: step.tool, ok: false, error: lastError, retries: retryCount });

                if (mode === 'fixed_steps') {
                    success = false;
                    logs.push(`⛔ Step failed after ${retryCount} attempts. Aborting loop.`);
                    break;
                } else {
                    // In until_success mode, we continue but mark overall as failed
                    logs.push(`⚠️ Step failed after ${retryCount} attempts. Moving to next step...`);
                    success = false;
                }
            }
        }

        logs.push(`\n🏁 TaskLoop completed: ${results.filter(r => r.ok).length}/${steps.length} steps succeeded`);

        return {
            ok: success,
            output: {
                success,
                completedSteps: results.filter(r => r.ok).length,
                totalIterations,
                results
            },
            logs
        };
    }
}
