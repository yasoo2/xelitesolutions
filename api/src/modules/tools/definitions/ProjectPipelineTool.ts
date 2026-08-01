import { ToolDefinition, ToolPermission } from '../types';
import { executeTool } from '../../services/ToolService';

/**
 * ProjectPipelineTool — the production bridge to the canonical pipeline.
 *
 * The audit that created this file found the AGENTS.md chain — Plan →
 * PhaseExecutor → QualityGate → RepairTicket → SelfFix → Rerun — fully built,
 * tested by six manual verification harnesses… and called by NOTHING in
 * production. A user asking for a complete multi-file project got either a
 * single HTML page (build fast-path) or an unverified pile of write_file
 * steps from the generic DAG. Files that were never executed are not a
 * delivered project; they are a hope.
 *
 * This tool IS the missing call: plan the project (planner-only tool), then
 * hand the phases to AgentLoopService.runPlannedPhasesIfPresent, which
 * executes each phase with verification tasks, auto build checks after code
 * phases, and the repair-ticket/self-fix loop when a phase fails.
 */
export class ProjectPipelineTool implements ToolDefinition {
    name = 'project_pipeline';
    version = '1.0.0';
    description = 'Build a complete multi-file project through the canonical engineering pipeline: plan phases, execute each with verification and auto build checks, self-heal failures, and report honestly.';
    tags = ['execution', 'project', 'pipeline', 'builder', 'quality'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string' as const, description: 'The full project request, in the user\'s own words' },
        },
        required: ['request'],
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            projectName: { type: 'string' as const },
            completedPhases: { type: 'number' as const },
            totalPhases: { type: 'number' as const },
            verified: { type: 'boolean' as const },
            summary: { type: 'string' as const },
            report: { type: 'object' as const },
        },
    };

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    rateLimitPerMinute = 3;
    auditFields = ['request'];
    mockSupported = false;

    async execute(input: { request: string }, context?: any) {
        const logs: string[] = [];
        const request = String(input?.request || '').trim();
        if (!request) return { ok: false, error: 'request is required', logs };

        const say = (m: string) => { logs.push(m); context?.onProgress?.(m); };

        // 1 — Plan. The planner is planner-only by architecture law; it returns
        // phases and never executes anything itself.
        say('[pipeline] planning the project phases…');
        const plannerResult = await executeTool('project_planner', { projectDescription: request }, context);
        const phases = plannerResult?.output?.phases;
        if (!Array.isArray(phases) || phases.length === 0) {
            return { ok: false, error: plannerResult?.error || 'planner returned no phases', logs };
        }
        say(`[pipeline] plan ready: ${plannerResult.output.projectName || 'project'} — ${phases.length} phases`);

        // 2 — Execute through the canonical pipeline (verification tasks, auto
        // build checks, repair tickets, one self-fix attempt, honest stop).
        // Lazy require: ToolService -> definitions -> AgentLoopService -> ToolService
        // is a cycle if imported at module load.
        const { AgentLoopService } = require('../../services/AgentLoopService');
        const pipeline = await AgentLoopService.runPlannedPhasesIfPresent({
            sessionId: context?.sessionId || `pipeline-${Date.now()}`,
            runId: context?.runId || `run-${Date.now()}`,
            userId: context?.userId || 'anonymous',
            workspaceId: context?.workspaceId || context?.sessionId || 'default',
            plannerResult,
            modelConfig: context?.modelConfig,
            // The live voice: phase-by-phase progress reaches the same panel
            // stream the orchestrator wired into this tool's context.
            onProgress: (m: string) => say(m),
        });

        // 3 — Report with the numbers as they are. A partial delivery announced
        // as partial is engineering; announced as done, it is a lie.
        const total = Number(plannerResult.output.totalPhases || phases.length);
        const done = Number(pipeline?.completedPhases || 0);
        const verified = pipeline?.ok === true;
        const failDetail = !verified
            ? (pipeline?.repairTicket?.summary || pipeline?.error || 'phase failed and self-fix did not recover it')
            : '';
        const summary = verified
            ? `اكتمل المشروع: ${done}/${total} مراحل نُفِّذت وتحقَّقت (بناء + فحوص).`
            : `توقف البناء بصدق عند ${done}/${total} مراحل — ${String(failDetail).slice(0, 300)}`;
        say(`[pipeline] ${summary}`);

        return {
            ok: verified,
            error: verified ? undefined : summary,
            output: {
                projectName: plannerResult.output.projectName,
                completedPhases: done,
                totalPhases: total,
                verified,
                summary,
                report: pipeline?.engineeringReport,
                reportMarkdown: pipeline?.engineeringReportMarkdown,
                results: pipeline?.results,
                repairTicket: pipeline?.repairTicket,
            },
            logs,
        };
    }
}
