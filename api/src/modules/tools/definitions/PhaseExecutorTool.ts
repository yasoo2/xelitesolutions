import { ToolDefinition, ToolPermission } from '../types';

import { executeTool } from '../../services/ToolService';

/**
 * PhaseExecutorTool - Executes a single phase from a project plan.
 *
 * This is the bridge between planning and doing. It must execute with a trusted
 * context (userId, workspaceId, sessionId) so ToolService can enforce ownership,
 * approvals, and workspace isolation consistently.
 */
export class PhaseExecutorTool implements ToolDefinition {
    name = 'phase_executor';
    version = '2.1.1';
    description = 'Execute a single phase of a project plan by running each task\'s tool with trusted execution context';
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
                    tasks: { type: 'array' as const, items: { type: 'object' as const } }
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
                    workspaceId: { type: 'string' as const },
                    userId: { type: 'string' as const }
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

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    rateLimitPerMinute = 10;
    auditFields = ['phase', 'projectContext'];
    mockSupported = false;

    async execute(input: { phase: any; projectContext?: any }, context?: any) {
        const { phase, projectContext } = input;
        const logs: string[] = [];
        const results: Array<{ task: string; tool: string; ok: boolean; error?: string }> = [];
        let completedCount = 0;

        const executionContext = {
            sessionId: context?.sessionId || projectContext?.sessionId,
            workspaceId: context?.workspaceId || projectContext?.workspaceId,
            userId: context?.userId || projectContext?.userId,
            onThought: (m: string) => context?.onThought?.(m),
            onProgress: (m: string) => context?.onProgress?.(m),
        };

        try {
            const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
            const totalTasks = tasks.length;

            if (!executionContext.sessionId) logs.push('[PhaseExecutor] Warning: missing sessionId in execution context');
            if (!executionContext.workspaceId) logs.push('[PhaseExecutor] Warning: missing workspaceId in execution context');
            if (!executionContext.userId) logs.push('[PhaseExecutor] Warning: missing userId in execution context');

            logs.push(`[PhaseExecutor] Starting Phase ${phase.phaseNumber}: ${phase.name} (${totalTasks} tasks)`);

            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                const toolName = String(task.tool || '').trim();
                const taskDesc = String(task.task || task.description || `Task ${i + 1}`);

                if (!toolName || toolName === 'manual') {
                    logs.push(`[PhaseExecutor] Task ${i + 1}: "${taskDesc}" — skipped (manual/no tool)`);
                    results.push({ task: taskDesc, tool: 'manual', ok: true });
                    completedCount++;
                    continue;
                }

                logs.push(`[PhaseExecutor] Task ${i + 1}/${totalTasks}: "${taskDesc}" — executing tool: ${toolName}`);

                const toolArgs = {
                    ...(task.args || {}),
                    ...(task.input || {}),
                };

                if (executionContext.sessionId && typeof (toolArgs as any).sessionId !== 'string') (toolArgs as any).sessionId = executionContext.sessionId;
                if (executionContext.workspaceId && typeof (toolArgs as any).workspaceId !== 'string') (toolArgs as any).workspaceId = executionContext.workspaceId;

                try {
                    const toolResult = await executeTool(toolName, toolArgs, {
                        ...executionContext,
                        onProgress: (m: string) => context?.onProgress?.(`[${toolName}] ${m}`),
                    });

                    if (toolResult.ok) {
                        logs.push(`[PhaseExecutor] ✅ Task ${i + 1} completed: ${toolName}`);
                        results.push({ task: taskDesc, tool: toolName, ok: true });
                        completedCount++;
                    } else {
                        const errMsg = String(toolResult.error || 'Unknown error');
                        logs.push(`[PhaseExecutor] ❌ Task ${i + 1} failed: ${toolName} — ${errMsg}`);
                        results.push({ task: taskDesc, tool: toolName, ok: false, error: errMsg });

                        if (task.priority === 'high' || task.required === true) {
                            logs.push('[PhaseExecutor] ⚠️ High-priority task failed. Retrying once...');
                            try {
                                const retryResult = await executeTool(toolName, toolArgs, {
                                    ...executionContext,
                                    onProgress: (m: string) => context?.onProgress?.(`[${toolName} RETRY] ${m}`),
                                });
                                if (retryResult.ok) {
                                    logs.push(`[PhaseExecutor] ✅ Retry succeeded for task ${i + 1}: ${toolName}`);
                                    results[results.length - 1] = { task: taskDesc, tool: toolName, ok: true };
                                    completedCount++;
                                } else {
                                    logs.push('[PhaseExecutor] ⛔ Retry also failed. Stopping phase.');
                                    break;
                                }
                            } catch (retryErr: any) {
                                logs.push(`[PhaseExecutor] ⛔ Retry threw error: ${retryErr?.message}. Stopping phase.`);
                                break;
                            }
                        }
                    }
                } catch (toolError: any) {
                    const errMsg = String(toolError?.message || toolError || 'Execution error');
                    logs.push(`[PhaseExecutor] ❌ Task ${i + 1} threw: ${errMsg}`);
                    results.push({ task: taskDesc, tool: toolName, ok: false, error: errMsg });

                    if (task.priority === 'high' || task.required === true) {
                        logs.push('[PhaseExecutor] ⛔ Critical task threw. Stopping phase.');
                        break;
                    }
                }
            }

            const allOk = results.length > 0 && results.every(r => r.ok);
            let status = allOk ? 'completed' : (completedCount > 0 ? 'partial' : 'failed');

            logs.push(`[PhaseExecutor] Phase ${phase.phaseNumber} ${status}: ${completedCount}/${totalTasks} tasks completed`);

            if (phase.verificationTask && allOk) {
                const vTask = phase.verificationTask;
                const vToolName = String(vTask.tool || 'shell_execute').trim();
                const vTaskDesc = String(vTask.task || 'Verify phase output');
                logs.push(`[PhaseExecutor] 🧪 Running verification: "${vTaskDesc}" with ${vToolName}`);

                try {
                    const vResult = await executeTool(vToolName, vTask.args || {}, executionContext);

                    if (vResult.ok) {
                        logs.push(`[PhaseExecutor] ✅ Verification passed for Phase ${phase.phaseNumber}`);
                        results.push({ task: vTaskDesc, tool: vToolName, ok: true });
                    } else {
                        const vErr = String(vResult.error || 'Verification failed');
                        logs.push(`[PhaseExecutor] ⚠️ Verification failed: ${vErr}`);
                        results.push({ task: vTaskDesc, tool: vToolName, ok: false, error: vErr });
                        status = 'partial';
                    }
                } catch (vError: any) {
                    logs.push(`[PhaseExecutor] ⚠️ Verification error: ${vError.message}`);
                    results.push({ task: vTaskDesc, tool: vToolName, ok: false, error: vError.message });
                    status = 'partial';
                }
            }

            const hasCodeTasks = tasks.some((t: any) =>
                ['ai_write_file', 'write_file', 'file_edit', 'file_edit_advanced', 'scaffold_project'].includes(String(t.tool || ''))
            );
            if (hasCodeTasks && !phase.verificationTask && allOk && executionContext.workspaceId) {
                logs.push('[PhaseExecutor] 🔍 Auto-running build check after code generation phase...');
                try {
                    const buildResult = await executeTool('shell_execute', {
                        command: 'npm run build 2>&1 || echo "BUILD_CHECK_FAILED"',
                    }, executionContext);
                    const buildOutput = String((buildResult as any)?.output?.stdout || (buildResult as any)?.output || '');
                    if (buildOutput.includes('BUILD_CHECK_FAILED') || !buildResult.ok) {
                        logs.push('[PhaseExecutor] ⚠️ Auto-build check found issues — orchestrator should route to self-fix');
                        status = 'partial';
                    } else {
                        logs.push('[PhaseExecutor] ✅ Auto-build check passed');
                    }
                } catch {
                    logs.push('[PhaseExecutor] ℹ️ Auto-build check skipped (no build script or error)');
                }
            }

            const ok = status === 'completed' || completedCount > 0;
            const primaryError = ok ? undefined : (results.find(r => !r.ok)?.error || 'Phase failed');

            return {
                ok,
                error: primaryError,
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
                    phaseNumber: phase?.phaseNumber,
                    status: 'fatal_error',
                    completedTasks: completedCount,
                    totalTasks: Array.isArray(phase?.tasks) ? phase.tasks.length : 0,
                    results,
                    nextPhase: phase?.phaseNumber
                },
                logs
            };
        }
    }
}
