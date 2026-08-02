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
        //
        // This summary IS what lands in the chat: extractAnswer picks the
        // `summary` field of the final node's output. Before this report
        // existed, a completed multi-phase build surfaced as ONE terse line
        // and the whole story (phases, files, how to run) was discarded.
        const total = Number(plannerResult.output.totalPhases || phases.length);
        const done = Number(pipeline?.completedPhases || 0);
        const verified = pipeline?.ok === true;

        // 3 — The last mile: a VERIFIED system is RUN, not left inert on disk.
        // No button — the pipeline starts it and the live preview opens itself.
        // Best-effort: a run failure never turns a good build into a failure;
        // it just means the user starts it manually.
        let liveUrl = '';
        if (verified) {
            try {
                say('▶️ أُشغّل النظام لتراه حيّاً…');
                const runRes = await executeTool('project_run', {}, context);
                if (runRes?.ok && runRes.output?.url) liveUrl = String(runRes.output.url);
            } catch (e: any) {
                say(`ℹ️ اكتمل البناء، لكن التشغيل التلقائي تعثّر: ${e?.message || e}`);
            }
        }

        const summary = this.buildDeliveryReport({
            language: String(context?.language || 'ar').toLowerCase().startsWith('ar') ? 'ar' : 'en',
            projectName: String(plannerResult.output.projectName || 'project'),
            phases, pipeline, done, total, verified, liveUrl,
        });
        say(`[pipeline] ${verified ? `✅ ${done}/${total}` : `⚠️ ${done}/${total}`} — delivery report ready`);

        return {
            ok: verified,
            error: verified ? undefined : summary,
            output: {
                projectName: plannerResult.output.projectName,
                completedPhases: done,
                totalPhases: total,
                verified,
                summary,
                liveUrl: liveUrl || undefined,
                report: pipeline?.engineeringReport,
                reportMarkdown: pipeline?.engineeringReportMarkdown,
                results: pipeline?.results,
                repairTicket: pipeline?.repairTicket,
            },
            logs,
        };
    }

    /**
     * The delivery report the user actually reads in the chat — markdown, in
     * the run's language, built ONLY from what provably happened: the phases
     * that ran, the files the plan wrote, and a run hint only when an entry
     * file is really there to run. No invented claims.
     */
    private buildDeliveryReport(args: {
        language: 'ar' | 'en';
        projectName: string;
        phases: any[];
        pipeline: any;
        done: number;
        total: number;
        verified: boolean;
        liveUrl?: string;
    }): string {
        const { language: lang, projectName, phases, pipeline, done, total, verified, liveUrl } = args;
        const ar = lang === 'ar';
        const lines: string[] = [];

        lines.push(verified
            ? (ar ? `## ✅ اكتمل المشروع: ${projectName}` : `## ✅ Project delivered: ${projectName}`)
            : (ar ? `## ⚠️ توقف البناء بصدق: ${projectName}` : `## ⚠️ Build stopped honestly: ${projectName}`));

        // The live system, front and center — it is RUNNING, not just built.
        if (verified && liveUrl) {
            lines.push('');
            lines.push(ar
                ? `### 🟢 نظامك يعمل الآن\nالمعاينة الحية مفتوحة على: **${liveUrl}**\nيمكنك استخدامه الآن. لإيقافه قل: «أوقف المشروع».`
                : `### 🟢 Your system is live\nOpen at: **${liveUrl}**\nUse it now. To stop it, say: "stop the project".`);
        }
        lines.push(ar
            ? `**المراحل:** ${done}/${total} نُفِّذت وتحقَّقت (تنفيذ فعلي + فحوص، لا مجرد كتابة ملفات).`
            : `**Phases:** ${done}/${total} executed and verified (real execution + checks, not just written files).`);

        // Phase-by-phase, from the pipeline's own results.
        const phaseResults: any[] = Array.isArray(pipeline?.results) ? pipeline.results : [];
        if (phaseResults.length) {
            lines.push('');
            lines.push(ar ? '### المراحل' : '### Phases');
            for (const p of phaseResults) {
                const okMark = p?.status === 'completed' ? '✅' : '❌';
                const name = String(p?.phaseName || `Phase ${p?.phaseNumber ?? '?'}`);
                const tasks = `${p?.completedTasks ?? '?'}/${p?.totalTasks ?? '?'}`;
                const healed = p?.selfFixExecution?.ok ? (ar ? ' — أُصلحت ذاتياً 🔧' : ' — self-healed 🔧') : '';
                lines.push(`- ${okMark} ${name} (${ar ? 'مهام' : 'tasks'}: ${tasks})${healed}`);
            }
        }

        // Files the PLAN wrote — the paths are in the plan itself, so this list
        // is exact, not guessed.
        const writeTools = new Set(['write_file', 'ai_write_file', 'file_write', 'create_file', 'write_to_file']);
        const files: string[] = [];
        for (const ph of phases) {
            for (const t of (Array.isArray(ph?.tasks) ? ph.tasks : [])) {
                if (!writeTools.has(String(t?.tool || ''))) continue;
                const p = String(t?.args?.path || t?.args?.filename || t?.input?.path || t?.input?.filename || '').trim();
                if (p && !files.includes(p)) files.push(p);
            }
        }
        if (files.length) {
            lines.push('');
            lines.push(ar ? '### الملفات' : '### Files');
            for (const f of files.slice(0, 15)) lines.push(`- \`${f}\``);
            if (files.length > 15) lines.push(ar ? `- … و${files.length - 15} ملفات أخرى` : `- … and ${files.length - 15} more`);
        }

        // A run hint ONLY when the plan really wrote an entry file.
        const entry = files.find(f => /(^|\/)(index|main|app|server)\.(js|mjs|cjs|ts)$/i.test(f));
        const wrotePackageJson = files.some(f => /(^|\/)package\.json$/i.test(f));
        if (verified && (entry || wrotePackageJson)) {
            lines.push('');
            lines.push(ar ? '### التشغيل' : '### Run it');
            if (wrotePackageJson) lines.push(ar ? '```\nnpm install\nnpm start\n```' : '```\nnpm install\nnpm start\n```');
            else if (entry) lines.push(`\`\`\`\nnode ${entry}\n\`\`\``);
        }

        // On failure: name the failed phase and the real error head, plus what
        // the self-fix tried — the user deserves the diagnosis, not a shrug.
        if (!verified) {
            const failedPhase = phaseResults.find(p => p?.status !== 'completed');
            const ticket = pipeline?.repairTicket;
            lines.push('');
            lines.push(ar ? '### ماذا حدث' : '### What happened');
            if (failedPhase) {
                lines.push(ar
                    ? `- المرحلة المتعثرة: **${failedPhase.phaseName || failedPhase.phaseNumber}**`
                    : `- Failed phase: **${failedPhase.phaseName || failedPhase.phaseNumber}**`);
            }
            if (ticket?.primaryError) {
                lines.push((ar ? '- الخطأ: ' : '- Error: ') + '`' + String(ticket.primaryError).slice(0, 220) + '`');
            }
            const sfReason = pipeline?.selfFixExecution?.reason || pipeline?.selfFixPlan?.reason;
            if (sfReason) {
                lines.push((ar ? '- محاولة الإصلاح الذاتي: ' : '- Self-fix attempt: ') + String(sfReason).slice(0, 220));
            }
            lines.push(ar
                ? `- ما اكتمل قبل التوقف (${done}/${total}) سليمٌ ومتحقَّق منه.`
                : `- Everything completed before the stop (${done}/${total}) is verified and intact.`);
        }

        return lines.join('\n').slice(0, 3500);
    }
}
