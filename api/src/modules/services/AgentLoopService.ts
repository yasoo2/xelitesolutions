import { Run } from '../../shared/models/run';
import { AgentOrchestrator } from '../../orchestration/AgentOrchestrator';
import { broadcastThinkingDetail } from '../../api/ws';
// [ARCHITECTURE] Required connections for self-healing pipeline (AGENTS.md)
import { RepairTicketService, type RepairTicket } from './RepairTicketService';
import { SelfFixService } from './SelfFixService';
import { SelfFixExecutionService } from './SelfFixExecutionService';
import { executeTool } from './ToolService';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';

/**
 * AgentLoopService - Dynamic Runtime Gateway
 * 
 * Provides two execution paths:
 * 1. execute() — Dynamic agent-driven via AgentOrchestrator
 * 2. runPlannedPhasesIfPresent() — Canonical pipeline with self-healing (AGENTS.md)
 */
export class AgentLoopService {
    /**
     * Unified Autonomous Execution Entry Point
     * Everything is now dynamic and agent-driven at runtime.
     */
    static async execute(goal: string, options: { sessionId?: string; userId?: string; traceId?: string; modelConfig?: any } = {}) {
        const sessionId = options.sessionId || `session-${Date.now()}`;
        const userId = options.userId || 'anonymous';
        const traceId = options.traceId;
        const modelConfig = options.modelConfig;

        console.log(`[AgentLoopService] REAL-TIME Execution Request: ${goal} (traceId=${traceId})`);
        broadcastThinkingDetail(sessionId, "🧠 Activating Dynamic Agent Runtime...");

        // Create Run record for observability
        let runId = `run-${Date.now()}`;
        try {
            if (process.env.PERSISTENCE_MODE !== 'JSON' && process.env.OFFLINE_MODE !== 'true') {
                const run = await Run.create({ sessionId, status: 'running', steps: [] });
                runId = run._id.toString();
            }
        } catch (e) {
            console.warn('[AgentLoopService] DB Persistence unavailable, using memory runId');
        }

        const orchestrator = new AgentOrchestrator();
        
        try {
            const result = await orchestrator.execute({ 
                id: runId, 
                traceId,
                goal,
                context: { userId, sessionId, modelConfig }
            });

            // Update run status upon completion
            if (process.env.PERSISTENCE_MODE !== 'JSON' && process.env.OFFLINE_MODE !== 'true') {
                await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } }).catch(() => {});
            }

            return result;
        } catch (error) {
            console.error(`[AgentLoopService] Fatal runtime error:`, error);
            if (process.env.PERSISTENCE_MODE !== 'JSON' && process.env.OFFLINE_MODE !== 'true') {
                await Run.findByIdAndUpdate(runId, { $set: { status: 'failed' } }).catch(() => {});
            }
            throw error;
        }
    }

    /**
     * Unified Autonomous Planning Entry Point
     */
    static async plan(goal: string, options: { sessionId?: string; userId?: string; traceId?: string } = {}) {
        const orchestrator = new AgentOrchestrator();
        return await orchestrator.plan(goal, undefined, options.traceId);
    }

    /**
     * Canonical Pipeline: Plan → PhaseExecutor → QualityGate → RepairTicket → SelfFix → Rerun
     * Required by AGENTS.md. Used by all permanent self-healing verification tests.
     */
    static async runPlannedPhasesIfPresent(opts: {
        sessionId: string;
        runId: string;
        userId: string;
        workspaceId: string;
        plannerResult: any;
        modelConfig?: any;
    }) {
        const { sessionId, runId, userId, workspaceId, plannerResult } = opts;

        if (!plannerResult?.ok || !plannerResult?.output?.phases?.length) {
            return { ok: false, completedPhases: 0, results: [], error: 'No valid phases in planner result' };
        }

        // Wrap in firewall context so ToolService recognizes this as authorized orchestration
        return executionFirewall.runInContext(undefined, () => this._executePhases(opts));
    }

    private static async _executePhases(opts: {
        sessionId: string;
        runId: string;
        userId: string;
        workspaceId: string;
        plannerResult: any;
        modelConfig?: any;
    }) {
        const { sessionId, runId, userId, workspaceId, plannerResult, modelConfig } = opts;
        const phases = plannerResult.output.phases;
        const projectContext = {
            projectName: plannerResult.output.projectName || 'Unknown',
            totalPhases: plannerResult.output.totalPhases || phases.length,
            sessionId,
            workspaceId,
            userId,
        };
        const executionContext = { sessionId, workspaceId, userId, modelConfig };
        const results: any[] = [];
        let completedPhases = 0;

        for (const phase of phases) {
            const phaseResult = await executeTool('phase_executor', { phase, projectContext }, executionContext);
            const status = String(phaseResult?.output?.status || 'unknown');

            if (phaseResult?.ok && status === 'completed') {
                results.push({ ...phaseResult.output, status: 'completed' });
                completedPhases++;
                continue;
            }

            // Phase failed — enter self-healing pipeline
            const failedTasks = (phaseResult?.output?.results || [])
                .filter((r: any) => !r.ok)
                .map((r: any) => ({ task: r.task, tool: r.tool, ok: false, error: r.error }));

            const repairTicket = RepairTicketService.build({
                phase,
                phaseResult,
                projectName: projectContext.projectName,
                sessionId,
                workspaceId,
            });

            const selfFixPlan = SelfFixService.plan(repairTicket);

            if (!selfFixPlan.allowed) {
                results.push({ ...phaseResult?.output, status, repairTicket, selfFixPlan });
                return { ok: false, completedPhases, results, repairTicket, selfFixPlan };
            }

            const selfFixExecution = await SelfFixExecutionService.executeOnce({
                phase,
                projectContext,
                selfFixPlan,
                executionContext,
            });

            if (selfFixExecution.ok) {
                results.push({
                    ...(selfFixExecution.rerunResult?.output || phaseResult?.output),
                    status: 'completed',
                    selfFixPlan,
                    selfFixExecution,
                });
                completedPhases++;
                continue;
            }

            // Self-fix failed — stop per AGENTS.md rule
            results.push({ ...phaseResult?.output, status, repairTicket, selfFixPlan, selfFixExecution });
            return { ok: false, completedPhases, results, repairTicket, selfFixPlan, selfFixExecution };
        }

        const pipelineResult: any = {
            ok: true,
            completedPhases,
            results
        };

        try {
            const reportResult = await executeTool('joe_engineering_report', {
                pipelineResult,
                includeMarkdown: true,
            }, {
                sessionId,
                workspaceId,
                userId: userId ? String(userId) : undefined,
            });
            if (reportResult?.ok) {
                pipelineResult.engineeringReport = reportResult.output?.report;
                pipelineResult.engineeringReportMarkdown = reportResult.output?.markdown;
            } else {
                pipelineResult.engineeringReportError = reportResult?.error || 'engineering_report_failed';
            }
        } catch (reportError: any) {
            pipelineResult.engineeringReportError = String(reportError?.message || reportError || 'engineering_report_failed');
        }

        return pipelineResult;
    }
}
