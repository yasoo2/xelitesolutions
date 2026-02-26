import { ToolDefinition } from '../types';
import { executeTool } from '../../services/ToolService';

/**
 * PhaseExecutorTool - Executes a single phase from a project plan
 * 
 * REAL EXECUTOR: Actually calls executeTool() for each task in the phase.
 * This is the bridge between planning and doing.
 */
export class PhaseExecutorTool implements ToolDefinition {
    name = 'phase_executor';
    version = '2.0.0';
    description = 'Execute a single phase of a project plan by running each task\'s tool';
    tags = ['execution', 'project', 'phase', 'builder'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            phase: {
                type: 'object' as const,
                description: 'The phase to execute',
                properties: {
                    phaseNumber: { type: 'number' as const },
                    name: { type: 'string' as const },
                    description: { type: 'string' as const },
                    tasks: {
                        type: 'array' as const,
                        items: { type: 'object' as const },
                        description: 'List of tasks in this phase'
                    }
                },
                required: ['phaseNumber', 'name', 'tasks']
            },
            projectContext: {
                type: 'object' as const,
                description: 'Context about the overall project',
                properties: {
                    projectName: { type: 'string' as const },
                    totalPhases: { type: 'number' as const },
                    sessionId: { type: 'string' as const },
                    workspaceId: { type: 'string' as const }
                }
            }
        },
        required: ['phase']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            phaseNumber: { type: 'number' as const },
            status: { type: 'string' as const },
            completedTasks: { type: 'number' as const },
            totalTasks: { type: 'number' as const },
            results: { type: 'array' as const },
            nextPhase: { type: 'number' as const }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 10;
    auditFields = [];
    mockSupported = false;

    async execute(input: { phase: any; projectContext?: any }, context?: any) {
        const { phase, projectContext } = input;
        const logs: string[] = [];
        const results: Array<{ task: string; tool: string; ok: boolean; error?: string }> = [];
        let completedCount = 0;

        try {
            const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
            const totalTasks = tasks.length;

            const startMsg = `[PhaseExecutor] Starting Phase ${phase.phaseNumber}: ${phase.name} (${totalTasks} tasks)`;
            logs.push(startMsg);

            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const toolName = String(task.tool || '').trim();
                const taskDesc = String(task.task || task.description || `Task ${i + 1}`);

                // Skip tasks without a tool specification
                if (!toolName || toolName === 'manual') {
                    logs.push(`[PhaseExecutor] Task ${i + 1}: "${taskDesc}" — skipped (manual/no tool)`);
                    results.push({ task: taskDesc, tool: 'manual', ok: true });
                    completedCount++;
                    continue;
                }

                const execMsg = `[PhaseExecutor] Task ${i + 1}/${totalTasks}: "${taskDesc}" — executing tool: ${toolName}`;
                logs.push(execMsg);

                try {
                    // Build tool args from task definition + project context
                    const toolArgs = {
                        ...(task.args || {}),
                        ...(task.input || {}),
                    };

                    // Inject workspace context if available
                    if (projectContext?.sessionId) toolArgs.sessionId = projectContext.sessionId;
                    if (projectContext?.workspaceId) toolArgs.workspaceId = projectContext.workspaceId;

                    const toolResult = await executeTool(toolName, toolArgs, {
                        sessionId: projectContext?.sessionId,
                        workspaceId: projectContext?.workspaceId,
                        onThought: (m: string) => context?.onThought?.(m),
                        onProgress: (m: string) => context?.onProgress?.(`[${toolName}] ${m}`),
                    });

                    if (toolResult.ok) {
                        const successMsg = `[PhaseExecutor] ✅ Task ${i + 1} completed: ${toolName}`;
                        logs.push(successMsg);
                        results.push({ task: taskDesc, tool: toolName, ok: true });
                        completedCount++;
                    } else {
                        const errMsg = String(toolResult.error || 'Unknown error');
                        const failMsg = `[PhaseExecutor] ❌ Task ${i + 1} failed: ${toolName} — ${errMsg}`;
                        logs.push(failMsg);
                        results.push({ task: taskDesc, tool: toolName, ok: false, error: errMsg });

                        // If this is a required task (high priority), stop the phase
                        if (task.priority === 'high' || task.required === true) {
                            logs.push(`[PhaseExecutor] ⛔ High-priority task failed. Stopping phase.`);
                            break;
                        }
                    }
                } catch (toolError: any) {
                    const errMsg = String(toolError?.message || toolError || 'Execution error');
                    logs.push(`[PhaseExecutor] ❌ Task ${i + 1} threw: ${errMsg}`);
                    results.push({ task: taskDesc, tool: toolName, ok: false, error: errMsg });

                    if (task.priority === 'high' || task.required === true) {
                        logs.push(`[PhaseExecutor] ⛔ Critical task threw. Stopping phase.`);
                        break;
                    }
                }
            }

            const allOk = results.every(r => r.ok);
            const status = allOk ? 'completed' : (completedCount > 0 ? 'partial' : 'failed');

            logs.push(`[PhaseExecutor] Phase ${phase.phaseNumber} ${status}: ${completedCount}/${totalTasks} tasks completed`);

            return {
                ok: allOk || completedCount > 0,
                output: {
                    phaseNumber: phase.phaseNumber,
                    phaseName: phase.name,
                    status,
                    completedTasks: completedCount,
                    totalTasks,
                    results,
                    nextPhase: phase.phaseNumber + 1,
                    deliverables: phase.deliverables || [],
                    estimatedTime: phase.estimatedTime || 'unknown'
                },
                logs
            };

        } catch (error: any) {
            logs.push(`[PhaseExecutor] Fatal error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                output: {
                    phaseNumber: phase.phaseNumber,
                    status: 'fatal_error',
                    completedTasks: completedCount,
                    totalTasks: Array.isArray(phase.tasks) ? phase.tasks.length : 0,
                    results,
                    nextPhase: phase.phaseNumber
                },
                logs
            };
        }
    }
}
