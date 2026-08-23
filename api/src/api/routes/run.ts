import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AgentLoopService } from '../../modules/services/AgentLoopService';
import { authenticateOptional } from '../middleware/auth';
import { loadUploadedFiles } from './files';
import { persistChatStores } from '../chat-store';
import { Run } from '../../shared/models/run';
import { ToolExecution } from '../../shared/models/toolExecution';
import { Artifact } from '../../shared/models/artifact';
import { Session } from '../../shared/models/session';
import { traceManager } from '../../modules/services/TraceManager';
import { broadcast } from '../ws';
import { getRunEvidence } from '../../shared/run-evidence-store';

const router = Router();

/**
 * ATTACHMENT MEMORY (per session, in-process). Maps a sessionId to the file
 * ids it last attached, so a follow-up message that REFERS to «الصوره/الملف»
 * without re-attaching still reaches the model WITH the file. Bounded and
 * time-limited: a session remembers only its latest batch, for six hours.
 */
const SESSION_FILE_MEMORY = new Map<string, { fileIds: string[]; at: number }>();
const SESSION_FILE_TTL_MS = 6 * 3600_000;

export function rememberSessionFiles(sessionId: string, fileIds: string[]): void {
    if (!sessionId || !fileIds.length) return;
    SESSION_FILE_MEMORY.set(sessionId, { fileIds: [...fileIds], at: Date.now() });
    // The map only grows by one entry per session; prune stale ones lazily.
    if (SESSION_FILE_MEMORY.size > 500) {
        for (const [k, v] of SESSION_FILE_MEMORY) {
            if (Date.now() - v.at > SESSION_FILE_TTL_MS) SESSION_FILE_MEMORY.delete(k);
        }
    }
}

export function recallSessionFiles(sessionId: string, maxAgeMs: number = SESSION_FILE_TTL_MS): string[] {
    const hit = SESSION_FILE_MEMORY.get(sessionId);
    if (!hit || Date.now() - hit.at > maxAgeMs) return [];
    return [...hit.fileIds];
}

/**
 * Does this message point at an attachment? Nouns («الصوره، الملف، اللقطة»),
 * demonstratives with analysis verbs («حللها، افحصها، اقرأها»), and their
 * English counterparts. Deliberately conservative: an unrelated follow-up
 * («ابنِ لي موقعاً») must NOT drag the old screenshot back in.
 */
export const REFERS_TO_ATTACHMENT =
    // NB: \b is ASCII-only in JS and silently fails around Arabic letters —
    // the pronoun suffix is bounded with a lookahead instead.
    /(صور|لقط|سكرين|مرفق|المستند|الملف|فايل|ملف|image|photo|picture|screenshot|attach|\bfile\b|document|\bpdf\b|docx|xlsx|pptx)|(حلل|افحص|اقرأ|صِ?ف|وضّ?ح|لخّ?ص|ترجم|شوف|طالع)(ها|يها|ه)(?![ء-ي])/i;

/**
 * The WEAK tier — «صار يتهبل» (field log): «هل هذا متعلق بهاتف أم آيباد؟»
 * points at the picture with nothing but a demonstrative, missed the strong
 * regex, and the planner spawned an iPad-vs-iPhone browser expedition. Bare
 * demonstratives and feminine pronoun suffixes (عنها، فيها — الصورة) DO
 * refer to the attachment in a live conversation — but only a FRESH one, so
 * this tier recalls within a short window, not the full six hours.
 */
export const WEAK_ATTACHMENT_REFERENCE =
    // «مشابهه لها» (field log) pointed at the fresh screenshot with a bare
    // pronoun and missed recall — the page was built WITHOUT the image.
    /(?<![ء-ي])(هذا|هذه|هذي|ذلك|تلك|بهذا|بهذه|لهذا|لهذه|عليها|عنها|فيها|منها|إليها|اليها|لها|بها|مثلها|مثله|كهذه|كهذا)(?![ء-ي])|\b(this|that|these|those|it)\b/i;
export const WEAK_REFERENCE_WINDOW_MS = 15 * 60_000;

/** How strongly the message points at the session's last attachment. */
export function attachmentRecallMode(text: string): 'strong' | 'weak' | 'none' {
    const t = String(text || '');
    if (REFERS_TO_ATTACHMENT.test(t)) return 'strong';
    if (WEAK_ATTACHMENT_REFERENCE.test(t)) return 'weak';
    return 'none';
}

/**
 * [PROVIDER VERIFY] Actually test a provider with a tiny prompt and report
 * whether it responds. The provider button is coloured GREEN on ok, RED on fail.
 * Works for free providers too — a placeholder key routes through the free mesh,
 * so "verify" checks that the free path (keyless proxies / local model) responds.
 */
router.post('/verify', authenticateOptional as any, async (req: Request, res: Response) => {
    const { provider, apiKey, baseUrl, model } = req.body || {};
    try {
        // HONEST verify: test the SPECIFIC provider, never the whole free mesh — so a
        // green dot means THAT provider actually answered, and a key-required provider
        // with no key is reported as "needs a key" instead of borrowing another
        // provider's success (the old behaviour that made every free provider look
        // connected even when it wasn't).
        const { verifyProviderDirect } = require('../../core/llm/intelligent-router');
        const result = await verifyProviderDirect(provider, { apiKey, baseUrl, model });
        if (!result.ok) {
            return res.status(200).json({ ok: false, error: result.detail || 'empty_response', provider });
        }
        return res.json({ ok: true, provider, detail: result.detail });
    } catch (e: any) {
        // 200 with ok:false so the UI can colour the button red (not a hard error).
        return res.status(200).json({ ok: false, error: e?.message || 'verify_failed', provider });
    }
});

/**
 * [REAL-TIME RUNTIME GATEWAY]
 * This route now delegates all intelligence to the AgentOrchestrator.
 * Legacy simulation logic has been decommissioned.
 */
router.post('/start', authenticateOptional as any, async (req: Request, res: Response) => {
    const { text, sessionId, browserSessionId, workspaceId, userId: bodyUserId, provider, model, apiKey, baseUrl, language } = req.body || {};
    // The UI language the user picked. Everything Joe SAYS must follow it —
    // previously nothing carried it here, so every reply came back in Arabic no
    // matter which language the switcher was set to. Fall back to the browser's
    // Accept-Language, then English.
    const uiLanguage = String(language || '').trim().toLowerCase().split('-')[0]
        || String(req.headers['accept-language'] || '').trim().toLowerCase().split(',')[0].split('-')[0]
        || 'en';
    const userId = (req as any).auth?.sub || bodyUserId || 'anonymous';
    // The user's display name, threaded to the tools so Joe can greet them
    // personally («مساء الخير يا يونس»). Local tokens often carry the literal
    // placeholder 'User', so prefer, in order: a real token name, the name the
    // UI resolved (Google profile / stored account, sent in the body), and
    // finally the email's local part («younes.sowady2011» -> «Younes»).
    const isGenericName = (n: string) => !n || /^(user|admin|anonymous|unknown|مستخدم)$/i.test(n);
    const authName = String((req as any).auth?.name || '').trim();
    const bodyName = String(req.body?.userName || '').trim().slice(0, 60);
    const emailLocal = String((req as any).auth?.email || '').split('@')[0].split(/[._\-+]/)[0].replace(/\d+$/, '');
    const emailName = emailLocal ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1) : '';
    const userName = [authName, bodyName, emailName].find(n => !isGenericName(n)) || '';
    // Standing instructions from Settings («تعليمات جو الدائمة») — they shape HOW
    // Joe works on every task (e.g. terminal-first building). Previously the UI
    // sent this field and the server silently dropped it.
    const systemInstructions = String(req.body?.systemInstructions || '').trim().slice(0, 4000);

    /**
     * THE PAPERCLIP'S MISSING HALF. The composer uploads each attachment,
     * /files/upload extracts its text and stores it, the chip shows success,
     * and the message arrives here carrying fileIds — which this route never
     * read. Same disease as systemInstructions above: the UI sent it, the
     * server dropped it, and Joe answered «لخص هذا الملف» without ever seeing
     * the file. Load them now and hand them to the run.
     */
    const fileIds: string[] = Array.isArray(req.body?.fileIds) ? req.body.fileIds : [];
    let attachments: Awaited<ReturnType<typeof loadUploadedFiles>> = [];
    if (fileIds.length) {
        try {
            attachments = await loadUploadedFiles(fileIds);
            console.log(`[RunRoute] Loaded ${attachments.length}/${fileIds.length} attachment(s) for the run`);
            if (attachments.length < fileIds.length) {
                console.warn(`[RunRoute] ${fileIds.length - attachments.length} attachment id(s) could not be found`);
            }
            // Remember what this session attached — the NEXT message may refer
            // to it without re-attaching (see below).
            if (attachments.length) rememberSessionFiles(String(sessionId || ''), fileIds);
        } catch (e: any) {
            console.warn('[RunRoute] Loading attachments failed (continuing without):', e?.message || e);
        }
    } else {
        /**
         * ATTACHMENT MEMORY — the field failure this closes: the user sent an
         * image with «حلل», then followed up «قم بتحليل هذه الصوره» — and the
         * composer sends fileIds only WITH the message that uploaded them, so
         * the follow-up reached Joe with no attachment at all. The planner,
         * seeing «analyze the image» and no image, invented an exiftool/grep/
         * write-file circus and answered with a raw ENOENT. A human keeps the
         * picture on the table for the whole conversation; now Joe does too:
         * when a message REFERS to an attachment (هذه الصوره، الملف، حللها…)
         * and carries none, the session's last uploaded files ride again.
         */
        const recallMode = attachmentRecallMode(String(text || ''));
        if (recallMode !== 'none') {
            // Strong reference (الصوره، الملف، حللها…) recalls within the full
            // TTL; a weak one (هذا، فيها، this…) only while the file is FRESH.
            const remembered = recallSessionFiles(String(sessionId || ''), recallMode === 'strong' ? undefined : WEAK_REFERENCE_WINDOW_MS);
            if (remembered.length) {
                try {
                    attachments = await loadUploadedFiles(remembered);
                    if (attachments.length) {
                        console.log(`[RunRoute] 🧷 Re-attached ${attachments.length} earlier file(s) — ${recallMode} reference (attachment memory)`);
                        // Touch the memory so a CHAIN of follow-ups keeps the
                        // picture on the table («حلل» → «هل هذا هاتف؟» → «وماذا عن…»).
                        rememberSessionFiles(String(sessionId || ''), remembered);
                    }
                } catch (e: any) {
                    console.warn('[RunRoute] Attachment memory reload failed (continuing without):', e?.message || e);
                }
            }
        }
    }
    
    console.log(`[RunRoute] Unified execution requested for session: ${sessionId}`);

    if (!text) {
        return res.status(400).json({ error: 'Goal text is required' });
    }

    /**
     * The first message of a new chat can arrive before the client has a
     * session id to derive its browser session from. The server owns the
     * canonical run session, so cover that first message here as well as the
     * client-side fallback used by later messages.
     */
    const runSessionId = String(sessionId || '').trim();
    const effectiveBrowserSessionId = String(browserSessionId || '').trim()
        || (runSessionId ? `browser:${runSessionId}` : '');

    // Persist the user message in offline/JSON mode so the chat shows the FULL
    // conversation (user + Joe) and it survives reloads. Agent runs go through this
    // route, which previously saved nothing — so only Joe's reply ever appeared.
    // What the user ATTACHED is part of what the user SAID — the chips must
    // survive a reload, so the meta (never the content) is stored with the
    // message and rebuilt into the history events.
    const attachmentMeta = () => attachments.map(a => ({ id: a.id, name: a.name, mimeType: a.mimeType, size: a.size }));
    try {
        if (process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1') {
            const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
            store.push({ _id: `um-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, role: 'user', content: text, attachments: attachmentMeta(), createdAt: new Date() });
            persistChatStores();
        }
    } catch { /* non-fatal */ }

    // Canonical run id is created before the first frame so every visible and
    // persisted event addresses the same execution.
    const tempRunId = `run-${Date.now()}`;

    // OWNERSHIP AT THE DOOR. The very first frames of a run — the echo of what
    // the user typed, and the run_started the panels wait for — used to be
    // emitted before anyone had claimed the session, so they resolved to
    // «nobody» and were delivered to EVERY connected client: another signed-in
    // user read the sentence you typed. Claim it here, before the first frame.
    try {
        const { registerSessionOwner } = require('../ws');
        if (userId && userId !== 'anonymous') registerSessionOwner(sessionId, String(userId));
    } catch { /* the wire is optional in tests */ }

    // Echo the user's message to the chat via WebSocket so it shows in the
    // conversation. The composer that posts here does not add it client-side, so
    // without this only Joe's reply would appear.
    try {
        broadcast({ type: 'user_input', sessionId, runId: tempRunId, data: { text, sessionId, runId: tempRunId, files: attachmentMeta() }, id: `uin-${Date.now()}` } as any);
        // The panels listen for the RUN starting — that is when the workspace
        // reveals itself and the live file list clears. They were listening
        // for an event the server never sent; the auto-open only happened
        // later, by luck, on the first tool.
        broadcast({ type: 'run_started', sessionId, runId: tempRunId, data: { sessionId, runId: tempRunId, text: String(text || '').slice(0, 200) }, id: `run-${Date.now()}` } as any);
    } catch { /* non-fatal */ }

    try {
        const traceId = traceManager.startTrace(sessionId || 'anonymous', text);
        
        // [ELITE FIX] Make execution non-blocking to prevent Nginx timeouts and frontend hang
        // The background process will handle its own errors and broadcast status via WS
        AgentLoopService.execute(text, {
            sessionId,
            // لا تستبدل جلسة لوحة المتصفح بجلسة الدردشة؛ تستخدمها browser_run
            // للتحكم في الصفحة نفسها التي تعرضها الواجهة.
            browserSessionId: effectiveBrowserSessionId || undefined,
            // مساحة العمل يختارها المستخدم في الواجهة ويجب أن تصل إلى كل أداة
            // تعتمد على ملفات المشروع، لا أن تتحول إلى مجلد جلسة الدردشة.
            workspaceId: String(workspaceId || '').trim() || undefined,
            userId,
            userName,
            systemInstructions,
            attachments,
            traceId,
            runId: tempRunId,
            language: uiLanguage,
            modelConfig: {
                provider,
                model,
                apiKey,
                baseUrl
            }
        }).catch(err => {
            console.error(`[RunRoute] Background execution fatal error:`, err);
        });

        // Return immediately so the frontend can start listening for WS updates
        return res.json({
            ok: true,
            runId: tempRunId,
            traceId
        });
    } catch (error: any) {
        console.error('[RunRoute] Execution failed:', error);
        return res.status(500).json({ error: error.message || 'Internal execution error' });
    }
});

/**
 * Basic Run Management Routes
 */
router.get('/', async (req, res) => {
    const runs = await Run.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(runs);
});

router.get('/:id/receipt', async (req, res) => {
    const evidence = await getRunEvidence(req.params.id);
    if (!evidence) return res.status(404).json({ error: 'No receipt for this run' });
    res.json({ ...evidence, ...(evidence.receipt || {}) });
});

router.get('/:id', async (req, res) => {
    const id = String(req.params.id || '').trim();
    const jsonMode = process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1';
    if (jsonMode) {
        const evidence = await getRunEvidence(id);
        if (!evidence) return res.status(404).json({ error: 'Run not found' });
        return res.json({
            run: { _id: evidence.id || id, runId: evidence.runId, sessionId: evidence.sessionId, status: evidence.status, createdAt: evidence.startedAt, updatedAt: evidence.updatedAt },
            execs: evidence.events || [],
            artifacts: [],
        });
    }

    const query = mongoose.Types.ObjectId.isValid(id)
        ? { $or: [{ _id: id }, { runId: id }] }
        : { runId: id };
    const run = await Run.findOne(query).lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const runKeys = [id, String((run as any)._id || '')].filter(Boolean);
    const execs = await ToolExecution.find({ runId: { $in: runKeys } }).lean();
    const artifacts = await Artifact.find({ runId: { $in: runKeys } }).lean();

    res.json({ run, execs, artifacts });
});

router.post('/stop', async (req, res) => {
    // Basic stop logic - since orchestrator is stateless per-request in this version,
    // we mark the run as failed in DB.
    const { runId } = req.body;
    if (runId && mongoose.Types.ObjectId.isValid(runId)) {
        await Run.findByIdAndUpdate(runId, { $set: { status: 'failed' } });
    }
    res.json({ ok: true });
});

export default router;
