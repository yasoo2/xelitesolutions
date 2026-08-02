import { Run } from '../../shared/models/run';
import { AgentOrchestrator } from '../../orchestration/AgentOrchestrator';
import { broadcastThinkingDetail, broadcast } from '../../api/ws';
// [ARCHITECTURE] Required connections for self-healing pipeline (AGENTS.md)
import { RepairTicketService, type RepairTicket } from './RepairTicketService';
import { SelfFixService } from './SelfFixService';
import { SelfFixExecutionService } from './SelfFixExecutionService';
import { executeTool } from './ToolService';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';
import { longTermMemory } from '../../core/memory/long-term-memory';
import { uiText, languageName, messageLanguage } from '../../shared/utils/language';
import { formatAttachmentsBlock } from '../../shared/attachments';
import { describeImageAttachments } from '../../shared/vision';
import { withDeadline, RUN_DEADLINE_MS, DeadlineError } from '../../shared/utils/deadline';

/**
 * Lessons Joe applies to every system HE builds — each line was paid for by a
 * real outage of Joe itself (the adm-zip crash loop of 2026-08). A launcher
 * that trusts the mere existence of node_modules restarts a deterministic
 * crash forever; an updater that mistakes a dead network for a history
 * conflict destroys local state. Joe must never ship those bugs to others.
 */
export const BUILD_DISCIPLINE = [
    '[ENGINEERING DISCIPLINE — apply when you build launch/update/deploy scripts or long-running services]:',
    '1. Dependency freshness: an install step must re-run when the manifest (package.json, requirements.txt, ...) changes — compare a stored hash/stamp; never skip installing just because node_modules (or venv) exists.',
    '2. Crash-loop guard: any auto-restart loop must stop after ~3 consecutive fast crashes (<15s uptime) with a clear message naming the likely cause, and should attempt ONE automatic dependency reinstall before giving up. Never restart a deterministic crash forever.',
    '3. Failure taxonomy in updaters: distinguish network failure (could not resolve host / timeout) from state conflict (merge/history). Network failure = warn and keep the current version; NEVER destructively reset over a connectivity error.',
].join('\n');

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
    static async execute(goal: string, options: { sessionId?: string; userId?: string; userName?: string; systemInstructions?: string; attachments?: import('../../shared/attachments').AttachmentInput[]; traceId?: string; modelConfig?: any; language?: string } = {}) {
        const sessionId = options.sessionId || `session-${Date.now()}`;
        const userId = options.userId || 'anonymous';
        const userName = String(options.userName || '').trim();
        // Standing user instructions ride WITH the goal so the planner and every
        // tool see them — this is what makes «استخدم الطرفية في كل بناء» actually
        // change how the whole run behaves, not just one reply.
        const standing = String(options.systemInstructions || '').trim().slice(0, 4000);
        // The build discipline rides only on runs that smell like engineering —
        // scripts, services, deploys — so a plain question is not taxed with it.
        const looksLikeEngineering = /build|deploy|script|install|server|service|launch|restart|update|setup|مشروع|سكربت|خادم|تشغيل|تحديث|نشر|ابنِ|ابني|موقع|تطبيق|نظام/i.test(goal);
        const blocks = [goal];
        /**
         * What the user ATTACHED rides directly after what the user SAID —
         * the message «لخص هذا الملف» is meaningless without the file under
         * it. Bounded by formatAttachmentsBlock so a huge attachment cannot
         * evict the instructions that follow.
         *
         * Images get EYES first: a vision model turns each attached picture
         * into a precise description (all visible text transcribed) before
         * the block is built, so «حلل هذه اللقطة» is answered from the
         * pixels, not from the filename. Runs in this background execute —
         * the HTTP response already returned — and never blocks the run:
         * with no vision provider the image stays honestly declared.
         */
        // The MESSAGE decides the language, the UI switcher only breaks ties:
        // the field log carried «The user's language is English» over the goal
        // «حلل هذه الصوره» because the switcher said so. messageLanguage reads
        // the script of what the user actually wrote.
        const language0 = messageLanguage(goal, options.language || 'ar');
        if ((options.attachments || []).some(a => /^image\//i.test(a.mimeType || '') && !String(a.content || '').trim())) {
            broadcastThinkingDetail(options.sessionId || '', language0 === 'ar' ? '👁️ أفحص الصور المرفقة بنموذج رؤية…' : '👁️ Reading the attached images with a vision model…');
            try {
                const mc = options.modelConfig || {};
                const r = await describeImageAttachments(options.attachments || [], {
                    language: language0,
                    groqApiKey: String(mc.provider || '').toLowerCase() === 'groq' ? mc.apiKey : undefined,
                });
                if (r.described) console.log(`[AgentLoopService] Vision described ${r.described} image(s), ${r.skipped} skipped`);
            } catch (e: any) { console.warn('[AgentLoopService] vision pass failed (continuing):', e?.message || e); }
        }
        const attachBlock = formatAttachmentsBlock(options.attachments || []);
        if (attachBlock) blocks.push(attachBlock);
        if (standing) blocks.push(`[STANDING USER INSTRUCTIONS — always apply to HOW you work]:\n${standing}`);
        // The user's language is a CONTRACT, not a hint: an Arabic question
        // answered in English (field-reported) reads as not being heard.
        // central_answer additionally measures and enforces this; the block
        // makes every other reply path carry the same obligation.
        blocks.push(`[RESPONSE LANGUAGE — NON-NEGOTIABLE]: The user's language is ${languageName(language0)}. Write EVERY word of your reply in it.`);
        if (looksLikeEngineering) blocks.push(BUILD_DISCIPLINE);
        const effectiveGoal = blocks.join('\n\n');
        const traceId = options.traceId;
        const modelConfig = options.modelConfig;
        // One language for the whole run — the block above, uiText fallbacks,
        // and context.language (which central_answer measures against) all
        // follow the message-derived choice, never the raw switcher value.
        const language = language0;

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

        // [PERSISTENT MEMORY] Recall what Joe already knows about this user/project
        // (name, preferred stack, recent context) and inject it so answers are
        // personalised and carry across sessions. Disk-backed JSON — works fully
        // offline. Best-effort: never blocks the run.
        const memUserId = String(userId || 'local-user');
        let memoryContext = '';
        try {
            // Pass the goal so recall surfaces the memories RELEVANT to it.
            memoryContext = await longTermMemory.getContextSummary(memUserId, goal);
            if (memoryContext) broadcastThinkingDetail(sessionId, uiText('recalledContext', language));
        } catch { /* non-fatal */ }

        try {
            // [WALL CLOCK] The whole run has a hard ceiling. Past it the user
            // gets an honest failure — never a spinner that lives forever.
            const result = await withDeadline(orchestrator.execute({
                id: runId,
                traceId,
                goal: effectiveGoal,
                context: { userId, userName, systemInstructions: standing, sessionId, modelConfig, memoryContext, language }
            }), RUN_DEADLINE_MS, 'run');

            // [FIX] Surface the final answer to the chat UI.
            // The /run/start route is fire-and-forget, so without this broadcast the
            // orchestrator's result is discarded and the chat shows no reply even
            // though the answer was computed correctly. We emit a 'text' event (the
            // assistant message the frontend renders) plus 'run_finished' (stops the
            // loading spinner). sessionId is included both top-level and in data so
            // the frontend's session filter accepts it.
            const answerText = AgentLoopService.extractAnswer(result);
            const finalText = result.ok
                ? (answerText || uiText('done', language))
                : `⚠️ ${answerText || uiText('failed', language)}`;
            broadcast({ type: 'text', sessionId, data: { text: finalText, sessionId }, runId } as any);
            broadcast({ type: 'run_finished', runId, data: { runId, ok: result.ok, sessionId } } as any);

            // Persist Joe's reply too (offline/JSON mode) so reloads show it.
            try {
                if (process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1') {
                    const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
                    store.push({ _id: `am-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, role: 'assistant', content: finalText, createdAt: new Date(), runId });
                }
            } catch { /* non-fatal */ }

            // [PERSISTENT MEMORY] Learn from this turn so Joe remembers it next
            // session: extracts facts (name, preferred languages, project types)
            // and stores a Q/A memory. Best-effort, non-blocking.
            try {
                await longTermMemory.learnFromConversation(memUserId, [{ role: 'user', content: goal }]);
                await longTermMemory.remember(memUserId, {
                    type: 'conversation',
                    content: `س: ${goal}\nج: ${String(finalText).slice(0, 400)}`,
                    metadata: { sessionId, runId },
                    importance: result.ok ? 0.6 : 0.4,
                });
            } catch { /* non-fatal */ }

            // Update run status upon completion
            if (process.env.PERSISTENCE_MODE !== 'JSON' && process.env.OFFLINE_MODE !== 'true') {
                await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } }).catch(() => {});
            }

            return result;
        } catch (error: any) {
            console.error(`[AgentLoopService] Fatal runtime error:`, error);
            // A deadline expiry is explained in the user's language, with the
            // truthful promise the checkpoints make good on.
            const failText = error instanceof DeadlineError
                ? (language === 'ar'
                    ? `⚠️ تجاوزت المهمة حدّها الزمني الكلي (${Math.round(RUN_DEADLINE_MS / 60000)} دقيقة) فأوقفتُها بصدق بدل تركها معلّقة. أعد إرسال نفس الطلب وسيستأنف البناء من نقطة الحفظ دون إعادة ما اكتمل.`
                    : `⚠️ The task exceeded its total time limit (${Math.round(RUN_DEADLINE_MS / 60000)} min) and was stopped honestly instead of hanging. Send the same request again — the build resumes from its checkpoint.`)
                : `⚠️ ${error?.message || uiText('unexpectedError', language)}`;
            // Still tell the UI so it stops "thinking" and shows what went wrong.
            broadcast({ type: 'text', sessionId, data: { text: failText, sessionId }, runId } as any);
            broadcast({ type: 'run_finished', runId, data: { runId, ok: false, sessionId } } as any);
            if (process.env.PERSISTENCE_MODE !== 'JSON' && process.env.OFFLINE_MODE !== 'true') {
                await Run.findByIdAndUpdate(runId, { $set: { status: 'failed' } }).catch(() => {});
            }
            throw error;
        }
    }

    /**
     * Extracts a human-readable answer string from an orchestrator result.
     * The orchestrator returns { ok, result } where result maps stepId -> output.
     * For a chat/direct-answer node this output is the reply text.
     */
    private static extractAnswer(result: { ok: boolean; result: any }): string {
        const toText = (v: any): string => {
            if (v == null) return '';
            if (typeof v === 'string') return v.trim();
            if (typeof v === 'object') {
                if (typeof v.output === 'string') return v.output.trim();
                if (typeof v.text === 'string') return v.text.trim();
                if (typeof v.answer === 'string') return v.answer.trim();
                // `summary` MUST be preferred over `message`: a tool's message is a
                // one-line status ("analysis complete") while the summary is the
                // actual content. Checking message first meant a successful repo
                // analysis surfaced as "done" and the whole report was discarded.
                if (typeof v.summary === 'string' && v.summary.trim()) return v.summary.trim();
                if (typeof v.message === 'string') return v.message.trim();
                try { return JSON.stringify(v); } catch { return String(v); }
            }
            return String(v);
        };
        const r = result?.result;
        if (r == null) return '';
        if (typeof r === 'string') return r.trim();
        if (typeof r === 'object') {
            for (const key of ['direct_response', 'recovery_node']) {
                if (r[key] != null) { const t = toText(r[key]); if (t) return t; }
            }
            const vals = Object.values(r);
            for (let i = vals.length - 1; i >= 0; i--) {
                const t = toText(vals[i]);
                if (t) return t;
            }
        }
        return '';
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
        onProgress?: (msg: string) => void;
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
        onProgress?: (msg: string) => void;
    }) {
        const { sessionId, runId, userId, workspaceId, plannerResult, modelConfig } = opts;
        // The live voice: without it a multi-phase build runs mute for minutes
        // and the user reads the silence as a freeze. Falls back to the panel's
        // thinking_detail stream when no callback was handed in.
        const voice = (m: string) => {
            try { opts.onProgress ? opts.onProgress(m) : broadcastThinkingDetail(sessionId, m); } catch { /* optional */ }
        };
        const phases = plannerResult.output.phases;
        const projectContext = {
            projectName: plannerResult.output.projectName || 'Unknown',
            totalPhases: plannerResult.output.totalPhases || phases.length,
            sessionId,
            workspaceId,
            userId,
        };
        const executionContext = { sessionId, workspaceId, userId, modelConfig, onProgress: voice, onThought: voice };
        const results: any[] = [];
        let completedPhases = 0;
        const totalPhases = Number(projectContext.totalPhases || phases.length);

        for (const phase of phases) {
            voice(`⚙️ المرحلة ${phase.phaseNumber || completedPhases + 1}/${totalPhases} — ${phase.name || 'تنفيذ'}`);
            const phaseResult = await executeTool('phase_executor', { phase, projectContext }, executionContext);
            const status = String(phaseResult?.output?.status || 'unknown');

            if (phaseResult?.ok && status === 'completed') {
                voice(`✅ اكتملت المرحلة ${phase.phaseNumber || completedPhases + 1}/${totalPhases} وتحقَّقت`);
                results.push({ ...phaseResult.output, status: 'completed' });
                completedPhases++;
                continue;
            }

            voice(`⚠️ تعثرت المرحلة ${phase.phaseNumber || completedPhases + 1} — أفتح تذكرة إصلاح وأحاول العلاج الذاتي…`);

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
                voice(`🔧 نجح الإصلاح الذاتي — المرحلة ${phase.phaseNumber || completedPhases + 1} اكتملت بعد العلاج`);
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
            voice(`⛔ لم ينجح الإصلاح الذاتي — أتوقف بصدق عند ${completedPhases}/${totalPhases} مراحل`);
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
