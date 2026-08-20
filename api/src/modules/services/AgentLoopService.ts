import { Run } from '../../shared/models/run';
import { AgentOrchestrator } from '../../orchestration/AgentOrchestrator';
import { broadcastThinkingDetail, broadcast, registerRunOwner, registerSessionOwner } from '../../api/ws';
// [ARCHITECTURE] Required connections for self-healing pipeline (AGENTS.md)
import { RepairTicketService, type RepairTicket } from './RepairTicketService';
import { SelfFixService } from './SelfFixService';
import { SelfFixExecutionService } from './SelfFixExecutionService';
import { executeTool } from './ToolService';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';
import { longTermMemory } from '../../core/memory/long-term-memory';
import { uiText, languageName, messageLanguage } from '../../shared/utils/language';
import { isArabicReply, say as pick } from '../../shared/reply-language';
import { formatAttachmentsBlock } from '../../shared/attachments';
import { describeImageAttachments } from '../../shared/vision';
import { withDeadline, RUN_DEADLINE_MS, DeadlineError } from '../../shared/utils/deadline';
import { persistChatStores } from '../../api/chat-store';
import { clarifyGate } from '../../core/orchestrator/clarify';
import { composeAnswer, composeFailure } from '../../core/orchestrator/answerComposer';
import { compactRuntimeValue } from '../../core/orchestrator/ExecutionMemory';
import { hasRequestFidelityMismatch, hasRequestFidelityEvidenceUnavailable } from '../tools/definitions/ProjectPipelineTool';

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

const MAX_PHASE_RECEIPT_RESULTS = 48;
const MAX_PHASE_RECEIPT_LOGS = 96;
const MAX_PHASE_RECEIPT_STRING_CHARS = 2_000;

function boundReceiptStrings(value: any, depth = 0): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.slice(0, MAX_PHASE_RECEIPT_STRING_CHARS);
    if (depth >= 4) return '[truncated receipt value]';
    if (Array.isArray(value)) {
        const items = value.slice(0, MAX_PHASE_RECEIPT_RESULTS).map(item => boundReceiptStrings(item, depth + 1));
        if (value.length > MAX_PHASE_RECEIPT_RESULTS) items.push(`[...${value.length - MAX_PHASE_RECEIPT_RESULTS} more receipt items]`);
        return items;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        const result: Record<string, any> = {};
        for (const [key, item] of entries.slice(0, 48)) result[key] = boundReceiptStrings(item, depth + 1);
        if (entries.length > 48) result.__truncatedKeys = entries.length - 48;
        return result;
    }
    return value;
}

function compactReceiptValue(value: any): any {
    return boundReceiptStrings(compactRuntimeValue(value));
}

function compactPhaseLogs(logs: any): string[] {
    if (!Array.isArray(logs)) return [];
    const recent = logs.slice(-MAX_PHASE_RECEIPT_LOGS).map(log => String(log ?? '').slice(0, MAX_PHASE_RECEIPT_STRING_CHARS));
    if (logs.length <= MAX_PHASE_RECEIPT_LOGS) return recent;
    return [`[AgentLoop] ... ${logs.length - MAX_PHASE_RECEIPT_LOGS} older phase log entries truncated ...`, ...recent];
}

function compactTaskReceipts(results: any): Array<{ tool: string; ok: boolean; error: string }> {
    if (!Array.isArray(results)) return [];
    return results.slice(0, MAX_PHASE_RECEIPT_RESULTS).map((result: any) => ({
        tool: String(result?.tool || result?.toolName || result?.name || result?.operation || 'unknown tool').slice(0, 240),
        ok: result?.ok === true,
        error: String(result?.error || result?.errorMessage || result?.stderr || result?.output?.stderr || result?.message || result?.output?.message || '').slice(0, MAX_PHASE_RECEIPT_STRING_CHARS),
    }));
}
function phaseReceiptExtras(projectContext: any, taskResults: any, extras: Record<string, any> = {}): Record<string, any> {
    const receiptExtras: Record<string, any> = {
        ...extras,
        taskReceipts: compactTaskReceipts(taskResults),
    };
    const projectRoot = projectContext?.projectRootRuntimeBound === true
        ? String(projectContext?.projectRoot || '').trim()
        : '';
    if (projectRoot) receiptExtras.projectRoot = projectRoot;
    return receiptExtras;
}
function selfFixFailureReason(selfFixExecution: any): string {
    return String(selfFixExecution?.reason || selfFixExecution?.error || selfFixExecution?.message || '').trim();
}

export function compactPhaseReceipt(output: any, logs: any, status?: string, extras: Record<string, any> = {}): any {
    const source = output && typeof output === 'object' ? output : {};
    const receipt: Record<string, any> = {};
    const retainedKeys = [
        'phaseNumber', 'phaseName', 'status', 'completedTasks', 'totalTasks', 'nextPhase',
        'deliverables', 'estimatedTime', 'verificationFailed', 'requiresUserDecision',
        'primaryError', 'error', 'results', 'honestBlocker',
    ];
    for (const key of retainedKeys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
        receipt[key] = key === 'results'
            ? compactReceiptValue(Array.isArray(source[key]) ? source[key].slice(0, MAX_PHASE_RECEIPT_RESULTS) : [])
            : compactReceiptValue(source[key]);
    }
    if (status) receipt.status = String(status).slice(0, 120);
    receipt.logs = compactPhaseLogs(logs);
    for (const [key, value] of Object.entries(extras)) receipt[key] = compactReceiptValue(value);
    return receipt;
}

export type AcceptanceFailureDisposition = 'repairable' | 'honest_blocker';

/**
 * An acceptance verdict is repairable only when the delivery tool provides
 * both the canonical error and the exact unmet criterion IDs. A bare
 * verificationFailed flag must remain a truthful blocker: without structured
 * evidence SelfFix would be guessing what to change.
 */
export function acceptanceFailureDisposition(phaseResult: any): AcceptanceFailureDisposition {
    const unmet = Array.isArray(phaseResult?.output?.delivery?.acceptanceUnmet)
        ? phaseResult.output.delivery.acceptanceUnmet.filter((id: unknown) => String(id || '').trim())
        : [];
    const errorText = [
        phaseResult?.error,
        phaseResult?.output?.error,
        phaseResult?.output?.primaryError,
    ].map(value => String(value || '')).join(' ');
    return unmet.length > 0 && /acceptance_criteria_unmet/i.test(errorText)
        ? 'repairable'
        : 'honest_blocker';
}

export type AcceptanceFidelityLabel = 'request_fidelity_mismatch' | 'fidelity_unverifiable';

export interface AcceptanceFidelityVerdict {
    label: AcceptanceFidelityLabel | null;
    diagnostic: string | null;
}

/**
 * Reuses the delivery-boundary fidelity predicates at the active acceptance
 * layer. The phase output is included as a receipt envelope because
 * PhaseExecutor carries the bounded delivery flags there while task results
 * remain in output.results; the predicates themselves remain single-source.
 */
export function acceptanceFidelityVerdict(phaseResult: any): AcceptanceFidelityVerdict {
    const results = phaseResult?.output?.delivery?.results ?? phaseResult?.output?.results;
    const fidelityEvidence = [
        ...(Array.isArray(results) ? results : []),
        ...(Array.isArray(results) ? results.map(result => ({ output: result })) : []),
        ...(phaseResult?.output ? [{ output: phaseResult.output }] : []),
    ];
    const fidelityMismatch = hasRequestFidelityMismatch(fidelityEvidence);
    const fidelityEvidenceUnavailable = hasRequestFidelityEvidenceUnavailable(fidelityEvidence);
    if (!fidelityMismatch && !fidelityEvidenceUnavailable) {
        return { label: null, diagnostic: null };
    }
    const label: AcceptanceFidelityLabel = fidelityEvidenceUnavailable
        ? 'fidelity_unverifiable'
        : 'request_fidelity_mismatch';
    return {
        label,
        diagnostic: `[AgentLoop] acceptance fidelity verdict: ${label} — الناتج ليس من فئة المطلوب لأن المؤلف القادر غائب`,
    };
}

/**
 * Carries the already-computed acceptance verdict into the user-visible
 * failure surface. This is presentation plumbing only: it never changes the
 * acceptance disposition or the repair decision.
 */
export function surfaceAcceptanceFidelity(primaryError: string, verdict: AcceptanceFidelityVerdict): string {
    if (!verdict.label || !verdict.diagnostic) return primaryError;
    return [primaryError, verdict.diagnostic].filter(Boolean).join(' — ');
}

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
    static async execute(goal: string, options: { sessionId?: string; browserSessionId?: string; workspaceId?: string; userId?: string; userName?: string; systemInstructions?: string; attachments?: import('../../shared/attachments').AttachmentInput[]; traceId?: string; modelConfig?: any; language?: string } = {}) {
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

        /**
         * [CLARIFY GATE] A build prompt with almost nothing in it does not
         * start a build — it starts a CONVERSATION. «ابن لي موقع» gets 4
         * pointed questions (deterministic, no model call); the next message
         * is merged with the original request and the build runs once, with
         * the full picture. Detailed prompts, edits, attachments and «ابدأ
         * مباشرة» pass straight through.
         */
        try {
            const gateLang = messageLanguage(goal, options.language || 'ar');
            const activeKey = String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_');
            const hasActivePage = !!((global as any).joePages && (global as any).joePages[activeKey]);
            const gate = clarifyGate(goal, sessionId, gateLang, {
                hasActivePage,
            });
            if (gate.kind === 'ask' && !(options.attachments || []).length) {
                broadcastThinkingDetail(sessionId, gateLang === 'ar'
                    ? '💬 الطلب مختصر جداً — أسأل توضيحات قبل أن أبني'
                    : '💬 The brief is thin — asking a few questions before building');
                const clarifyRunId = `clarify-${Date.now()}`;
                broadcast({ type: 'text', sessionId, data: { text: gate.text, sessionId }, runId: clarifyRunId } as any);
                broadcast({ type: 'run_finished', runId: clarifyRunId, data: { runId: clarifyRunId, ok: true, sessionId } } as any);
                try {
                    if (process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1') {
                        const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
                        store.push({ _id: `am-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, role: 'assistant', content: gate.text, createdAt: new Date() });
                        persistChatStores();
                    }
                } catch { /* non-fatal */ }
                return { ok: true, result: { answer: gate.text, clarify: true } };
            }
            if (gate.kind === 'merge') {
                console.log(`[AgentLoopService] 💬 clarify: merged the user's answers into the original build request`);
                goal = gate.goal;
            }
        } catch { /* the gate must never block a run */ }

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
        // INSTRUCTIONS ARE NOT THE REQUEST.
        //
        // These three blocks used to be concatenated INTO the goal, and the goal
        // is what the planner plans, what the node's task says, and what the
        // page builder is asked to BUILD. The field log shows the result
        // verbatim: «Executing node: build_page (Building: قم ببناء صفحة جميله
        // لشركة أدوية ومعدات طبية [RESPONSE LANGUAGE — NON-NEGOTIABLE]: … [ENGINEERING
        // DISCIPLINE …])» — Joe was told to build the language contract. And the
        // bulk of it is what blew the request past the provider's per-minute
        // budget: «413 Request too large … Requested 31712, Limit 12000», which
        // killed the build outright.
        //
        // They travel as INSTRUCTIONS now, in the run context, which
        // CentralAnswerTool and the tools already read. The goal stays the
        // user's own sentence — plus what they attached, because an attachment
        // IS part of the request.
        const instructionBlocks: string[] = [];
        if (standing) instructionBlocks.push(`[STANDING USER INSTRUCTIONS — always apply to HOW you work]:\n${standing}`);
        // The user's language is a CONTRACT, not a hint: an Arabic question
        // answered in English (field-reported) reads as not being heard.
        // central_answer additionally measures and enforces this; the block
        // makes every other reply path carry the same obligation.
        // «بسبب كلمة Younes خربشة ترتيب الكلمات» — a Latin name inside an
        // Arabic sentence also triggers BiDi scrambling in some renderers.
        // The display fix is dir="auto"/unicode-bidi in the UI; the CONTENT
        // fix is writing the name in the reply's own script.
        instructionBlocks.push(`[RESPONSE LANGUAGE — NON-NEGOTIABLE]: The user's language is ${languageName(language0)}. Write EVERY word of your reply in it. Personal names too: when replying in Arabic write names in Arabic script (Younes → يونس); never mix a Latin name into an Arabic sentence.`);
        if (looksLikeEngineering) instructionBlocks.push(BUILD_DISCIPLINE);
        const effectiveGoal = blocks.join('\n\n');
        const runInstructions = instructionBlocks.join('\n\n');
        const traceId = options.traceId;
        const modelConfig = options.modelConfig;
        // Project memories are scoped by the workspace selected in the UI. This
        // prevents a plan from an earlier project from changing a new, empty one.
        const workspaceId = String(options.workspaceId || '').trim();
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

        // WHOSE RUN IS THIS? Both owner registries existed and neither was ever
        // called, so every event this run emits — Joe's replies included —
        // resolved to «nobody» and was delivered to EVERY connected client.
        // Measured with two signed-in users in verify_browser_terminal_wiring.ts.
        try {
            if (userId) { registerRunOwner(runId, String(userId)); registerSessionOwner(sessionId, String(userId)); }
        } catch { /* the wire is optional in tests */ }

        const orchestrator = new AgentOrchestrator();

        // [PERSISTENT MEMORY] Recall what Joe already knows about this user/project
        // (name, preferred stack, recent context) and inject it so answers are
        // personalised and carry across sessions. Disk-backed JSON — works fully
        // offline. Best-effort: never blocks the run.
        const memUserId = String(userId || 'local-user');
        let memoryContext = '';
        try {
            // Pass the goal so recall surfaces the memories RELEVANT to it.
            // Keep global profile preferences available to the agent, but only
            // announce project recall when scoped conversation/file/code memory
            // from this exact workspace was actually found.
            const memoryDetails = await longTermMemory.getContextDetails(memUserId, goal, { workspaceId });
            memoryContext = memoryDetails.text;
            if (memoryDetails.hasWorkspaceContext) {
                broadcastThinkingDetail(sessionId, uiText('recalledContext', language));
            }
        } catch { /* non-fatal */ }

        try {
            // [WALL CLOCK] The whole run has a hard ceiling. Past it the user
            // gets an honest failure — never a spinner that lives forever.
            const result = await withDeadline(orchestrator.execute({
                id: runId,
                traceId,
                goal: effectiveGoal,
                context: {
                    userId,
                    userName,
                    systemInstructions: runInstructions,
                    sessionId,
                    // هذا هو معرف لوحة المتصفح الذي أنشأته الواجهة، وليس معرف
                    // الدردشة. يحتفظ به حتى تصل browser_run إلى الصفحة المرئية.
                    browserSessionId: String(options.browserSessionId || '').trim() || undefined,
                    // مستقل عن sessionId: هذا هو جذر مساحة العمل المختارة من الواجهة.
                    workspaceId: workspaceId || undefined,
                    modelConfig,
                    memoryContext,
                    language
                }
            }), RUN_DEADLINE_MS, 'run');

            // [FIX] Surface the final answer to the chat UI.
            // The /run/start route is fire-and-forget, so without this broadcast the
            // orchestrator's result is discarded and the chat shows no reply even
            // though the answer was computed correctly. We emit a 'text' event (the
            // assistant message the frontend renders) plus 'run_finished' (stops the
            // loading spinner). sessionId is included both top-level and in data so
            // the frontend's session filter accepts it.
            const answerText = AgentLoopService.extractAnswer(result, language);
            // A RUN THAT FAILED HALFWAY STILL DID SOMETHING. Measured on a real
            // three-step run: two files were written, the third step failed, and
            // the whole reply was «⚠️ File not found» — the work invisible, the
            // error unplaceable, and in English inside an Arabic session.
            const failureText = Array.isArray((result as any).steps) && (result as any).steps.length
                ? composeFailure((result as any).steps, answerText, language)
                : AgentLoopService.humanizeFailure(answerText, language);
            const finalText = result.ok
                ? (answerText || uiText('done', language))
                : `⚠️ ${failureText || uiText('failed', language)}`;
            broadcast({ type: 'text', sessionId, data: { text: finalText, sessionId }, runId } as any);
            broadcast({ type: 'run_finished', runId, data: { runId, ok: result.ok, sessionId } } as any);

            // Persist Joe's reply too (offline/JSON mode) so reloads show it.
            try {
                if (process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1') {
                    const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
                    store.push({ _id: `am-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, role: 'assistant', content: finalText, createdAt: new Date(), runId });
                    persistChatStores();
                }
            } catch { /* non-fatal */ }

            /**
             * [AUTO-TITLE] Name the session now that it has a first exchange.
             *
             * Auto-naming used to run ONLY from the endpoints that read a
             * session, and a live conversation reads nothing — the reply comes
             * down this socket. So a new chat kept «جلسة جديدة» until the user
             * switched away and back, which is exactly what he reported. The
             * run is the honest trigger: the title appears while he is still
             * looking at the conversation that earned it.
             */
            try {
                const { autoNameSessionAfterReply } = require('../../api/controllers/sessionController');
                void autoNameSessionAfterReply(sessionId);
            } catch { /* naming is never worth failing a run over */ }

            // [PERSISTENT MEMORY] Learn from this turn so Joe remembers it next
            // session: extracts facts (name, preferred languages, project types)
            // and stores a Q/A memory. Best-effort, non-blocking.
            try {
                await longTermMemory.learnFromConversation(memUserId, [{ role: 'user', content: goal }], { workspaceId });
                await longTermMemory.remember(memUserId, {
                    type: 'conversation',
                    content: `س: ${goal}\nج: ${String(finalText).slice(0, 400)}`,
                    metadata: { sessionId, runId, ...(workspaceId ? { workspaceId } : {}) },
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
    /**
     * A RAW SYSTEM ERROR IS NOT AN ANSWER. Field log, verbatim final reply:
     * «⚠️ ENOENT: no such file or directory, scandir 'C:\…\path_to_directory'»
     * — the user asked about a picture and got a filesystem stack line. Raw
     * errors stay (honesty: the technical detail is real and useful for
     * repair) but they arrive WRAPPED in a human sentence in the user's
     * language, clearly marked as the machine detail, never as the reply.
     */
    static humanizeFailure(text: string, language: string): string {
        const t = String(text || '').trim();
        if (!t) return t;
        const RAW_ERROR = /ENOENT|EACCES|EPERM|ECONN|ETIMEDOUT|EADDRINUSE|is not recognized as an internal|SyntaxError:|TypeError:|ReferenceError:|Cannot read propert|no such file or directory|command not found|MODULE_NOT_FOUND/i;
        if (!RAW_ERROR.test(t)) return t;
        return language === 'ar'
            ? `تعذّر إكمال الطلب — صادف التنفيذ خطأً تقنياً وتوقفت بصدق.\nالتفاصيل التقنية (للصيانة): ${t.slice(0, 400)}`
            : `Could not complete the request — execution hit a technical error and stopped honestly.\nTechnical detail (for repair): ${t.slice(0, 400)}`;
    }

    static extractAnswer(result: { ok: boolean; result: any; steps?: any[] }, language?: string): string {
        // THE WHOLE RUN ANSWERS, NOT ONLY ITS LAST STEP. Measured on a real
        // two-step run of «افحص الروابط ثم اكتب تقريراً»: the findings lived in
        // the first step, the second returned {success:true}, and the walk from
        // the end printed `{"success":true}` into the chat as the reply.
        if (result?.ok && Array.isArray(result.steps) && result.steps.length) {
            const composed = composeAnswer(result.steps as any, language);
            if (composed) return composed;
        }
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
                // An error IS worth showing (humanizeFailure wraps it); a
                // structureless object is not. `{"success":true}` reached the
                // chat as the entire reply of a two-step run — a JSON object
                // printed where a sentence belongs. Nothing is invented in its
                // place: an empty string lets the caller fall back to an honest
                // «تم», or to another step that actually spoke.
                if (typeof v.error === 'string' && v.error.trim()) return v.error.trim();
                return '';
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
        browserSessionId?: string;
        plannerResult: any;
        modelConfig?: any;
        providerTimeoutMs?: number;
        plannerTimeoutMs?: number;
        plannerMaxCompletionTokens?: number;
        plannerReasoningEffort?: string;
        /** The language of THIS run — the phase announcements follow it. */
        language?: string;
        onProgress?: (msg: string) => void;
    }) {
        const { sessionId, runId, userId, workspaceId, browserSessionId, plannerResult } = opts;

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
        browserSessionId?: string;
        plannerResult: any;
        language?: string;
        modelConfig?: any;
        providerTimeoutMs?: number;
        plannerTimeoutMs?: number;
        plannerMaxCompletionTokens?: number;
        plannerReasoningEffort?: string;
        onProgress?: (msg: string) => void;
    }) {
        const { sessionId, runId, userId, workspaceId, browserSessionId, plannerResult, modelConfig } = opts;
        /**
         * The phase announcements are the loudest lines in a multi-phase build,
         * and they were hardcoded Arabic — so his English run, in English mode,
         * still read «⚙️ المرحلة 1/3 — Backend & database». The caller now hands
         * the run's language down; with none, the project's own name decides,
         * which is the same rule the rest of the system follows.
         */
        const isAr = isArabicReply({
            language: opts.language,
            text: String(plannerResult?.output?.projectName || ''),
        });
        // The live voice: without it a multi-phase build runs mute for minutes
        // and the user reads the silence as a freeze. Falls back to the panel's
        // thinking_detail stream when no callback was handed in.
        const voice = (m: string) => {
            try { opts.onProgress ? opts.onProgress(m) : broadcastThinkingDetail(sessionId, m); } catch { /* optional */ }
        };
        const phases = plannerResult.output.phases;
        const createsNewProject = plannerResult.output.createsNewProject === true;
        const projectContext = {
            projectName: plannerResult.output.projectName || 'Unknown',
            totalPhases: plannerResult.output.totalPhases || phases.length,
            runId,
            sessionId,
            browserSessionId,
            workspaceId,
            userId,
            // Set by the canonical pipeline from the fully read local
            // specification. This is evidence for downstream artifact workers,
            // not a guessed technology or product template.
            requirementsContext: String(plannerResult?.output?.requirementsContext || ''),
            // Greenfield discovery has no write target yet. A root is accepted
            // only after PhaseExecutor binds a package-bearing artifact written
            // by this run; otherwise an old discovery root can point at Joe.
            createsNewProject,
            // Evidence-backed local root selected by discovery. Downstream tools
            // may use it only when a task has no explicit cwd; they still enforce
            // workspace containment and runnable-marker validation.
            projectRoot: !createsNewProject
                ? (String(plannerResult?.output?.projectRoot || '').trim() || undefined)
                : undefined,
            projectRootRuntimeBound: false,
        };
        const executionContext = {
            runId,
            sessionId,
            browserSessionId,
            workspaceId,
            userId,
            modelConfig,
            // Preserve the caller's engineering budget all the way to every
            // phase/verifier/repair LLM call. Without this, keyless providers
            // silently fall back to their short default timeout.
            providerTimeoutMs: opts.providerTimeoutMs,
            plannerTimeoutMs: opts.plannerTimeoutMs,
            plannerMaxCompletionTokens: opts.plannerMaxCompletionTokens,
            plannerReasoningEffort: opts.plannerReasoningEffort,
            // Every LLM call launched by a phase, verifier, repair, or rerun is
            // bounded engineering work. Keep this marker explicit so downstream
            // tools do not accidentally route it as an ordinary chat turn and
            // inherit the dead-brain fail-fast latch after a transient timeout.
            engineeringPipeline: true,
            purpose: 'internal',
            projectRoot: projectContext.projectRoot,
            projectRootRuntimeBound: projectContext.projectRootRuntimeBound,
            projectName: projectContext.projectName,
            onProgress: voice,
            onThought: voice,
        };
        const results: any[] = [];
        let completedPhases = 0;
        const totalPhases = Number(projectContext.totalPhases || phases.length);

        for (const phase of phases) {
            const n = phase.phaseNumber || completedPhases + 1;
            voice(pick(isAr,
                `⚙️ المرحلة ${n}/${totalPhases} — ${phase.name || 'تنفيذ'}`,
                `⚙️ Phase ${n}/${totalPhases} — ${phase.name || 'work'}`));
            const phaseResult = await executeTool('phase_executor', { phase, projectContext }, executionContext);
            // Keep the executor's evidence visible to the user and to the final
            // pipeline report. Without this, a failed acceptance tool was reduced
            // to the opaque label `verification_failed`, making diagnosis and
            // honest self-healing impossible even though the executor had the
            // exact tool name and error in its logs.
            if (Array.isArray(phaseResult?.logs)) {
                for (const log of phaseResult.logs) voice(String(log));
            }
            const status = String(phaseResult?.output?.status || 'unknown');
            // PhaseExecutor can bind the greenfield artifact inside its own
            // ToolService boundary. Rehydrate that evidence here before either
            // advancing or opening self-fix; otherwise the next phase receives
            // the workspace parent and runtime-contract checks inspect the wrong
            // package.json.
            const boundProjectRoot = String(phaseResult?.output?.projectRoot || '').trim();
            if (phaseResult?.output?.projectRootRuntimeBound === true && boundProjectRoot) {
                projectContext.projectRoot = boundProjectRoot;
                projectContext.projectRootRuntimeBound = true;
                executionContext.projectRoot = boundProjectRoot;
                executionContext.projectRootRuntimeBound = true;
            }

            if (phaseResult?.ok && status === 'completed') {
                voice(pick(isAr,
                    `✅ اكتملت المرحلة ${n}/${totalPhases} وتحقَّقت`,
                    `✅ Phase ${n}/${totalPhases} completed and verified`));
                results.push(compactPhaseReceipt(
                    phaseResult.output,
                    phaseResult.logs,
                    'completed',
                    phaseReceiptExtras(projectContext, phaseResult?.output?.results),
                ));
                completedPhases++;
                continue;
            }

            // A negative acceptance check is useful engineering evidence, not an
            // invitation to invent a search/replace patch. The phase executor and
            // discovery/planning stages can state that the next safe step needs a
            // user decision or that verification disproved delivery. Preserve that
            // truthful outcome before the generic repair path starts.
            const primaryError = String(phaseResult?.output?.primaryError || phaseResult?.error || '');
            const rawPhaseResults = Array.isArray(phaseResult?.output?.results)
                ? phaseResult.output.results
                : [];
            const normalizeFailureEvidence = (r: any) => {
                const tool = String(r?.tool || r?.toolName || r?.name || r?.operation || '').trim();
                const error = String(
                    r?.error ||
                    r?.errorMessage ||
                    r?.stderr ||
                    r?.output?.stderr ||
                    r?.message ||
                    r?.output?.message ||
                    primaryError ||
                    '',
                ).trim();
                return {
                    ...r,
                    task: r?.task || r?.description || 'unknown task',
                    tool: tool || 'unknown tool',
                    error: error || 'failed tool result',
                };
            };
            // PhaseExecutor normally emits { tool, error }, but stored plans and
            // adapters can return the same facts under toolName/name and
            // errorMessage/stderr. Normalize once so the decision gate, repair
            // ticket, and SelfFixService consume the same evidence. A bare
            // verification flag is never enough to authorize a repair.
            const acceptanceDisposition = acceptanceFailureDisposition(phaseResult);
            const acceptanceFidelity = acceptanceFidelityVerdict(phaseResult);
            const surfacedPrimaryError = surfaceAcceptanceFidelity(primaryError, acceptanceFidelity);
            if (acceptanceFidelity.label && /acceptance_criteria_unmet/i.test([
                phaseResult?.error,
                phaseResult?.output?.error,
                phaseResult?.output?.primaryError,
            ].map(value => String(value || '')).join(' '))) {
                console.warn(acceptanceFidelity.diagnostic);
                voice(acceptanceFidelity.diagnostic || '');
            }
            const acceptanceUnmet = Array.isArray(phaseResult?.output?.delivery?.acceptanceUnmet)
                ? phaseResult.output.delivery.acceptanceUnmet.filter((id: unknown) => String(id || '').trim()).map((id: unknown) => String(id).trim())
                : [];
            const normalizedPhaseResults = rawPhaseResults.map((r: any) =>
                r && r.ok === false ? normalizeFailureEvidence(r) : r
            );
            // A structured acceptance verdict is actionable evidence, not a
            // generic retry: preserve the exact criterion IDs and receipt so
            // RepairTicket/SelfFix can make a bounded repair and the rerun is
            // judged by the same acceptance gate again.
            if (acceptanceDisposition === 'repairable') {
                normalizedPhaseResults.push({
                    task: `Acceptance criteria: ${acceptanceUnmet.join(', ')}`,
                    tool: 'acceptance_gate',
                    ok: false,
                    error: `acceptance_criteria_unmet: ${acceptanceUnmet.join(', ')}`,
                    acceptanceUnmet,
                    acceptance: compactReceiptValue(phaseResult?.output?.acceptance),
                    evidenceStatus: 'current_run',
                });
            }
            const failedEvidence = normalizedPhaseResults.filter((r: any) => r && r.ok === false);
            const evidenceText = [
                primaryError,
                ...failedEvidence.map((r: any) => `${r?.tool || ''} ${r?.error || ''} ${r?.command || ''} ${r?.cwd || ''} ${r?.message || ''} ${Array.isArray(r?.acceptanceUnmet) ? r.acceptanceUnmet.join(' ') : ''}`),
            ].join(' ');
            // A failed acceptance/build/lint command is actionable evidence: it
            // must reach RepairTicket -> SelfFix -> phase rerun. Only evidence
            // blockers, user decisions, and security/portability violations
            // stop before repair. Treating every `verificationFailed` as a
            // blocker made Joe stop after writing a project instead of learning
            // from the actual compiler/linter output.
            const isLocalImportError = /unresolved_local_import/i.test(evidenceText);
            const explicitNonRepairableEvidence = /EVIDENCE_BLOCKER|requires?\s+user\s+decision|\boutside_workspace\b|\bpath_outside\b|\bunauthorized\b|\bforbidden\b|\bcredential\b|\bsecret\b|\btoken\b|native\s+addon|\btoolchain\b/i.test(evidenceText);
            const permissionEvidence = /permission/i.test(evidenceText);
            const staleRunEvidence = failedEvidence.some((r: any) => r?.evidenceStatus === 'stale_run_dropped')
                || /stale_run_evidence_dropped|STALE_RUN_EVIDENCE_DROPPED/i.test(evidenceText);
            // Evidence from a previous run is not actionable repair input. It must
            // never reach SelfFix, even if its text also contains build/import
            // keywords. The next controlled attempt must establish fresh evidence.
            // A stale `permission_stop` status can ride along with a deterministic
            // local-import failure. Ignore that inherited word only for this
            // evidence class; explicit security/portability blockers still stop.
            const nonRepairableEvidence = staleRunEvidence || explicitNonRepairableEvidence || (!isLocalImportError && permissionEvidence);
            const hasActionableEvidence = failedEvidence.some((r: any) =>
                String(r?.tool || '').trim() && String(r?.error || '').trim()
            ) || (
                Boolean(primaryError) &&
                /lint|build|npm\s+(?:install|run)|eslint|tsc|typescript|vite|jest|vitest|mocha|test|unresolved_local_import|runtime_contract_mismatch/i.test(evidenceText)
            );
            const hasActionableAcceptanceEvidence = acceptanceDisposition === 'repairable';
            const actionableVerificationFailure =
                phaseResult?.output?.verificationFailed === true &&
                (hasActionableEvidence || hasActionableAcceptanceEvidence) &&
                !nonRepairableEvidence;
            const isHonestBlocker =
                phaseResult?.output?.requiresUserDecision === true ||
                primaryError.includes('EVIDENCE_BLOCKER') ||
                (phaseResult?.output?.verificationFailed === true && !actionableVerificationFailure);
            if (isHonestBlocker) {
                voice(pick(isAr,
                    `⛔ توقفتُ عند عائق موثق — ${surfacedPrimaryError || 'يتطلب قراراً من المستخدم'}`,
                    `⛔ Stopped at a documented blocker — ${surfacedPrimaryError || 'requires user decision'}`));
                results.push(compactPhaseReceipt(phaseResult?.output, phaseResult?.logs, status,
                    phaseReceiptExtras(projectContext, phaseResult?.output?.results, {
                        honestBlocker: true,
                        primaryError: surfacedPrimaryError,
                    }),
                ));
                return { ok: false, completedPhases, results, honestBlocker: true };
            }

            voice(pick(isAr,
                `⚠️ تعثرت المرحلة ${n} — أفتح تذكرة إصلاح وأحاول العلاج الذاتي…`,
                `⚠️ Phase ${n} stumbled — opening a repair ticket and attempting self-healing…`));

            // Phase failed — enter self-healing pipeline
            const failedTasks = failedEvidence.map((r: any) => ({
                ...r,
                task: r.task,
                tool: r.tool,
                ok: false,
                error: r.error,
            }));
            const phaseResultForRepair = Array.isArray(phaseResult?.output?.results)
                ? {
                    ...phaseResult,
                    output: {
                        ...phaseResult.output,
                        results: normalizedPhaseResults,
                    },
                }
                : phaseResult;

            const repairTicket = RepairTicketService.build({
                phase,
                phaseResult: phaseResultForRepair,
                projectName: projectContext.projectName,
                runId,
                sessionId,
                workspaceId,
                projectRoot: projectContext.projectRootRuntimeBound === true
                    ? projectContext.projectRoot
                    : undefined,
            });

            const selfFixPlan = SelfFixService.plan(repairTicket);

            if (!selfFixPlan.allowed) {
                results.push(compactPhaseReceipt(phaseResult?.output, phaseResult?.logs, status,
                    phaseReceiptExtras(projectContext, phaseResult?.output?.results, {
                        repairTicket,
                        selfFixPlan,
                        primaryError: surfacedPrimaryError,
                    }),
                ));
                return { ok: false, completedPhases, results, repairTicket: compactReceiptValue(repairTicket), selfFixPlan: compactReceiptValue(selfFixPlan) };
            }

            const selfFixExecution = await SelfFixExecutionService.executeOnce({
                phase,
                projectContext,
                selfFixPlan,
            executionContext: {
                ...executionContext,
                projectRoot: projectContext.projectRoot,
                projectRootRuntimeBound: projectContext.projectRootRuntimeBound,
                projectName: projectContext.projectName,
            },
        });

            if (selfFixExecution.ok) {
                voice(pick(isAr,
                    `🔧 نجح الإصلاح الذاتي — المرحلة ${n} اكتملت بعد العلاج`,
                    `🔧 Self-healing worked — phase ${n} completed after the repair`));
                results.push(compactPhaseReceipt(
                    selfFixExecution.rerunResult?.output || phaseResult?.output,
                    selfFixExecution.rerunResult?.logs || phaseResult?.logs || [],
                    'completed',
                    phaseReceiptExtras(
                        projectContext,
                        selfFixExecution.rerunResult?.output?.results || phaseResult?.output?.results,
                        { selfFixPlan, selfFixExecution },
                    ),
                ));
                completedPhases++;
                continue;
            }

            // Self-fix failed — stop per AGENTS.md rule
            voice(pick(isAr,
                `⛔ لم ينجح الإصلاح الذاتي — أتوقف بصدق عند ${completedPhases}/${totalPhases} مراحل`,
                `⛔ Self-healing did not work — stopping honestly at ${completedPhases}/${totalPhases} phases`));
            results.push(compactPhaseReceipt(phaseResult?.output, phaseResult?.logs, status,
                phaseReceiptExtras(projectContext, phaseResult?.output?.results, {
                    repairTicket,
                    selfFixPlan,
                    selfFixExecution,
                    selfFixFailureReason: selfFixFailureReason(selfFixExecution),
                    primaryError: surfacedPrimaryError,
                }),
            ));
            return {
                ok: false,
                completedPhases,
                results,
                repairTicket: compactReceiptValue(repairTicket),
                selfFixPlan: compactReceiptValue(selfFixPlan),
                selfFixExecution: compactReceiptValue(selfFixExecution),
            };
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
