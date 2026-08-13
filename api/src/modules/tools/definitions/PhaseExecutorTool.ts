import { ToolDefinition, ToolPermission } from '../types';

import { executeTool } from '../../services/ToolService';
import { resolvePlannedTool, unrunnableShellStep, adaptPlannedArgs } from '../../../core/orchestrator/plan-tools';

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
            // Phase tasks may invoke browser tools; retain the panel identifier
            // from the parent run instead of falling back to the chat session.
            browserSessionId: context?.browserSessionId || projectContext?.browserSessionId,
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
                const askedFor = String(task.tool || '').trim();
                const taskDesc = String(task.task || task.description || `Task ${i + 1}`);

                if (!askedFor || askedFor === 'manual') {
                    logs.push(`[PhaseExecutor] Task ${i + 1}: "${taskDesc}" — skipped (manual/no tool)`);
                    results.push({ task: taskDesc, tool: 'manual', ok: true });
                    completedCount++;
                    continue;
                }

                /**
                 * DEFENCE IN DEPTH — the planner already snaps names onto real
                 * tools, but a phase can reach this executor from anywhere (a
                 * repair ticket, a hand-written plan, an older stored plan), and
                 * the field log that motivated this reads:
                 *
                 *   Task 1/2: "Create project repository" — executing tool: Git
                 *   ❌ Task 1 failed: Git — unknown_tool: "Git"
                 *
                 * A name nobody can execute is a defect of the PLAN. Executing it
                 * cannot be attempted, so it is not counted as an attempt that
                 * failed: it is recorded, skipped, and the build carries on.
                 */
                const resolved = resolvePlannedTool(askedFor);
                if (!resolved.tool) {
                    logs.push(`[PhaseExecutor] ⏭️ Task ${i + 1}: "${taskDesc}" — «${askedFor}» ليست أداة في هذا النظام` +
                        `${(resolved as any).why === 'not_software' ? ' (عمل تنظيمي بشري)' : ''}. تخطّيتُها ولم أوقف البناء.`);
                    results.push({ task: taskDesc, tool: 'manual', ok: true });
                    completedCount++;
                    continue;
                }
                const toolName = resolved.tool;
                if (toolName !== askedFor) {
                    logs.push(`[PhaseExecutor] ↪️ «${askedFor}» تعني ${toolName} — نفّذتُ الأداة الحقيقية.`);
                }

                // The same run also tried `sudo apt-get install git -y` on
                // Windows, moments after `git --version` answered exit 0. An
                // impossible command is not a task that failed; it is a task
                // that was never possible, and retrying it burns the run.
                if (toolName === 'shell_execute' || toolName === 'terminal_manager') {
                    const why = unrunnableShellStep((task.args || task.input || {}).command);
                    if (why) {
                        logs.push(`[PhaseExecutor] ⏭️ Task ${i + 1}: "${taskDesc}" — ${why}`);
                        results.push({ task: taskDesc, tool: 'manual', ok: true });
                        completedCount++;
                        continue;
                    }
                }

                logs.push(`[PhaseExecutor] Task ${i + 1}/${totalTasks}: "${taskDesc}" — executing tool: ${toolName}`);

                // A plan's arguments are model-written too: «Git» came with
                // `{action:'status'}` and git_ops declares `operation`, so the
                // renamed tool still failed on its first real run. Speak the
                // tool's own vocabulary.
                // The session goes in BEFORE the adapter runs: an audit with no
                // address is completed from what THIS session just built, and
                // the adapter cannot find that without knowing whose it is.
                const planned: any = { ...(task.args || {}), ...(task.input || {}) };
                if (executionContext.sessionId && typeof planned.sessionId !== 'string') planned.sessionId = executionContext.sessionId;
                if (executionContext.workspaceId && typeof planned.workspaceId !== 'string') planned.workspaceId = executionContext.workspaceId;

                const toolArgs = adaptPlannedArgs(toolName, planned);

                try {
                    const toolResult = await executeTool(toolName, toolArgs, {
                        ...executionContext,
                        onProgress: (m: string) => context?.onProgress?.(`[${toolName}] ${m}`),
                    });

                    if (toolResult.ok) {
                        logs.push(`[PhaseExecutor] ✅ Task ${i + 1} completed: ${toolName}`);
                        /**
                         * THE BUILDER'S OWN WORDS SURVIVE THE PHASE.
                         *
                         * His prompt ended with «At the end, show me plainly
                         * what you actually built and what you did not» — and
                         * he got a list of three phase names. The answer he
                         * asked for was WRITTEN: `react_project` composes a
                         * message naming the live streaming, the video calls
                         * and the AI diagnosis it did NOT build, the two QA
                         * scores, and the owner account. This line threw all
                         * of it away — `{task, tool, ok}` and nothing else —
                         * so the pipeline's report had nothing to carry.
                         *
                         * Bounded, because a report is read, not scrolled.
                         */
                        const output = (toolResult as any)?.output || {};
                        // Most builder tools return a prose message, while shell tools
                        // deliberately return structured stdout/stderr. Preserve both
                        // contracts so a successful terminal task is visible in the
                        // phase report instead of looking like an empty completion.
                        const stdout = String(output.stdout || '').trim();
                        const stderr = String(output.stderr || '').trim();
                        const terminalReport = toolName === 'shell_execute' && (stdout || stderr)
                            ? `${stdout}${stdout && stderr ? '\n' : ''}${stderr ? `stderr: ${stderr}` : ''}`
                            : '';
                        const said = String(output.message || terminalReport).trim();
                        results.push({
                            task: taskDesc, tool: toolName, ok: true,
                            ...(said ? { message: said.slice(0, 8000) } : {}),
                        });
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
                // Same law as the tasks: a verification step that names a tool
                // nobody has verifies nothing. project_detect always exists and
                // answers the only question that matters — is it really there?
                const vToolName = resolvePlannedTool(String(vTask.tool || '').trim()).tool || 'project_detect';
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
                // The check must run WHERE the project lives and ONLY when there
                // is build tooling to check. The old version ran `npm run build`
                // at the workspace ROOT: generated projects live in subfolders,
                // so npm found no package.json, printed an error, and every
                // code phase was falsely marked partial — self-fix churn over a
                // build that never existed. The project dir is derived from the
                // plan's own written package.json path; no package.json written
                // means nothing to build, and skipping is the honest verdict.
                const writtenPaths = tasks
                    .map((t: any) => String(t?.args?.path || t?.args?.filename || t?.input?.path || t?.input?.filename || ''))
                    .filter(Boolean);
                const pkgPath = writtenPaths.find((p: string) => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/')));
                if (!pkgPath) {
                    logs.push('[PhaseExecutor] ℹ️ Auto-build check skipped honestly: this phase wrote no package.json, so there is no build to run.');
                } else {
                    const projectDir = pkgPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
                    logs.push(`[PhaseExecutor] 🔍 Auto-running build check in ${projectDir || 'workspace root'}...`);
                    try {
                        const buildResult = await executeTool('shell_execute', {
                            // --if-present: a project without a build script is
                            // NOT a failure (most simple Node apps have none).
                            command: 'npm run --if-present build 2>&1 || echo BUILD_CHECK_FAILED',
                            ...(projectDir ? { cwd: projectDir } : {}),
                            timeout: 300000,
                        }, executionContext);
                        const buildOutput = String((buildResult as any)?.output?.stdout || (buildResult as any)?.output || '');
                        if (buildOutput.includes('BUILD_CHECK_FAILED') || !buildResult.ok) {
                            const buildError = String((buildResult as any)?.error || 'Auto-build check failed');
                            logs.push(`[PhaseExecutor] ⚠️ Auto-build check found issues — orchestrator should route to self-fix: ${buildError}`);
                            results.push({ task: 'Auto-build check', tool: 'shell_execute', ok: false, error: buildError });
                            status = 'partial';
                        } else {
                            logs.push('[PhaseExecutor] ✅ Auto-build check passed');
                        }
                    } catch {
                        logs.push('[PhaseExecutor] ℹ️ Auto-build check errored — treated as skipped, not as failure');
                    }
                }
            }

            // A partial phase contains useful artefacts, but it is not verified
            // delivery. Propagating ok:true here previously let pipeline and chat
            // callers mistake a failed check for a completed engineering phase.
            const ok = status === 'completed';
            const primaryError = ok ? undefined : (results.find(r => !r.ok)?.error || (status === 'partial' ? 'Phase completed only partially' : 'Phase failed'));

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
