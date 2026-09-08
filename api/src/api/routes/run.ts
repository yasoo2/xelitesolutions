import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { AgentLoopService } from '../../modules/services/AgentLoopService';
import { authenticate, authenticateOptional } from '../middleware/auth';
import { loadUploadedFiles } from './files';
import { persistChatStores } from '../chat-store';
import { Run } from '../../shared/models/run';
import { ToolExecution } from '../../shared/models/toolExecution';
import { Artifact } from '../../shared/models/artifact';
import { Session } from '../../shared/models/session';
import { traceManager } from '../../modules/services/TraceManager';
import { broadcast } from '../ws';
import { getRunEvidence, getRunEvidenceForSession } from '../../shared/run-evidence-store';
import { getActiveRunSessions, registerRunSession, unregisterRunSession, sessionOwnerOf, runOwnerOf } from '../ws';
import { registerRun, releaseHandle } from '../../core/session/attended-run';
import { workspaceService } from '../../modules/services/WorkspaceService';
import { Message } from '../../shared/models/message';
import { continuationExecutionGoal, findInterruptedContinuation, isContinuationCommand } from '../../core/resume/continuation-command';
import { isWithinRoot } from '../../modules/tools/path-containment';

const router = Router();

function usesJsonRunStore(): boolean {
    // Runtime truth wins over configuration. The session controllers already
    // fall back to the durable JSON store while Mongo is disconnected; /runs/start
    // must make the same decision or the UI can list a local chat and then crash
    // trying to start work in that very chat.
    return mongoose.connection.readyState !== 1
        || process.env.OFFLINE_MODE === 'true'
        || process.env.PERSISTENCE_MODE === 'JSON'
        || process.env.MOCK_DB === 'true'
        || String(process.env.MOCK_DB) === '1';
}

/** A supplied session id is a capability only for its authenticated owner. */
export async function mayUseRunSession(sessionId: string, userId: string): Promise<boolean> {
    const id = String(sessionId || '').trim();
    if (!id || !userId) return !id;
    if (usesJsonRunStore()) {
        const session = ((global as any).mockSessions || []).find((item: any) =>
            String(item.id ?? item._id) === id || String(item._id) === id);
        return !session || String(session.userId || '') === userId;
    }
    const session = await Session.findById(id).select('userId').lean();
    return !session || String((session as any).userId || '') === userId;
}

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
router.post('/start', authenticate as any, async (req: Request, res: Response) => {
    const { text, sessionId, browserSessionId, workspaceId, provider, model, apiKey, baseUrl, language } = req.body || {};
    const submittedText = String(text || '').trim();
    // The UI language the user picked. Everything Joe SAYS must follow it —
    // previously nothing carried it here, so every reply came back in Arabic no
    // matter which language the switcher was set to. Fall back to the browser's
    // Accept-Language, then English.
    const uiLanguage = String(language || '').trim().toLowerCase().split('-')[0]
        || String(req.headers['accept-language'] || '').trim().toLowerCase().split(',')[0].split('-')[0]
        || 'en';
    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
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

    if (!submittedText) {
        return res.status(400).json({ error: 'Goal text is required' });
    }

    // Resolve the identity before touching any state. A fresh composer does not
    // have a saved session yet, but attachments, history, ownership, tracing,
    // and WebSocket frames must still all describe the same run.
    const runSessionId = String(sessionId || '').trim()
        || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const effectiveBrowserSessionId = String(browserSessionId || '').trim()
        || `browser:${runSessionId}`;
    if (!(await mayUseRunSession(runSessionId, userId))) {
        return res.status(404).json({ error: 'Session not found' });
    }
    const resolvedWorkspaceId = String(workspaceId || '').trim() || undefined;

    // A one-word continuation is a control command, not a new conversational
    // question. Restore the last substantive user request only when durable run
    // evidence proves that this session really has interrupted/stopped work.
    // The submitted word remains in chat; only the execution goal is restored.
    let executionText = submittedText;
    let resumedRunId = '';
    let resumeProjectRoot = '';
    if (isContinuationCommand(submittedText)) {
        const [runs, messages] = await Promise.all([
            getRunEvidenceForSession(runSessionId),
            usesJsonRunStore()
                ? Promise.resolve(((global as any).mockMessages || []).filter((message: any) => String(message.sessionId) === runSessionId))
                : Message.find({ sessionId: runSessionId }).sort({ createdAt: 1 }).lean(),
        ]);
        const continuation = findInterruptedContinuation(submittedText, runs, messages as any[]);
        if (continuation) {
            executionText = continuationExecutionGoal(continuation.goal, continuation.projectName);
            resumedRunId = continuation.runId;
            const candidateRoot = path.resolve(String(continuation.projectRoot || '').trim() || '.');
            const allowedRoots = [
                workspaceService.getActiveRoot(resolvedWorkspaceId),
                workspaceService.getActiveRoot(),
            ].map(root => path.resolve(root));
            resumeProjectRoot = fs.existsSync(candidateRoot)
                && fs.statSync(candidateRoot).isDirectory()
                && allowedRoots.some(root => isWithinRoot(candidateRoot, root))
                ? candidateRoot
                : '';
            console.log(`[RunRoute] Resuming interrupted run ${resumedRunId} in session ${runSessionId}`);
        }
    }

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
            if (attachments.length) rememberSessionFiles(runSessionId, fileIds);
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
        const recallMode = attachmentRecallMode(submittedText);
        if (recallMode !== 'none') {
            // Strong reference (الصوره، الملف، حللها…) recalls within the full
            // TTL; a weak one (هذا، فيها، this…) only while the file is FRESH.
            const remembered = recallSessionFiles(runSessionId, recallMode === 'strong' ? undefined : WEAK_REFERENCE_WINDOW_MS);
            if (remembered.length) {
                try {
                    attachments = await loadUploadedFiles(remembered);
                    if (attachments.length) {
                        console.log(`[RunRoute] 🧷 Re-attached ${attachments.length} earlier file(s) — ${recallMode} reference (attachment memory)`);
                        // Touch the memory so a CHAIN of follow-ups keeps the
                        // picture on the table («حلل» → «هل هذا هاتف؟» → «وماذا عن…»).
                        rememberSessionFiles(runSessionId, remembered);
                    }
                } catch (e: any) {
                    console.warn('[RunRoute] Attachment memory reload failed (continuing without):', e?.message || e);
                }
            }
        }
    }
    
    console.log(`[RunRoute] Unified execution requested for session: ${runSessionId}`);

    /**
     *  A RUN WITHOUT A BROWSER SESSION CAN NEVER BE WATCHED.
     *
     *  Measured with the eye open on his screen:
     *
     *      POST_RUN browserSessionId=undefined sessionId=undefined
     *      [SelfQA] session=panel-browser watching=false ctxSid=absent
     *      canvas 300x150 lit=0.0%
     *
     *  The FIRST message of a new chat is sent before any session exists —
     *  the server mints one and the interface adopts it afterwards. That is a
     *  sound design, but the browser session was derived on the CLIENT, from
     *  a session id that did not exist yet. So the most common case there is
     *  — a fresh chat, one build request — could never show him its self-QA,
     *  no matter what the client sent.
     *
     *  Derive it here instead, from whatever session this run ends up with.
     *  One place, every client, first message included.
     */
    // Persist the user message in offline/JSON mode so the chat shows the FULL
    // conversation (user + Joe) and it survives reloads. Agent runs go through this
    // route, which previously saved nothing — so only Joe's reply ever appeared.
    // What the user ATTACHED is part of what the user SAID — the chips must
    // survive a reload, so the meta (never the content) is stored with the
    // message and rebuilt into the history events.
    const attachmentMeta = () => attachments.map(a => ({ id: a.id, name: a.name, mimeType: a.mimeType, size: a.size }));
    try {
        if (usesJsonRunStore()) {
            const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
            store.push({ _id: `um-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId: runSessionId, role: 'user', content: submittedText, attachments: attachmentMeta(), createdAt: new Date() });
            persistChatStores();
        }
    } catch { /* non-fatal */ }

    // Canonical run id is created before the first frame so every visible and
    // persisted event addresses the same execution.
    const tempRunId = `run-${Date.now()}`;

    // A Stop request may arrive as soon as the client receives the start
    // response. Register its real cancellation handle before scheduling the
    // background executor, otherwise the first asynchronous setup gap turns
    // Stop into a visual-only control.
    const runCancellation = registerRun(tempRunId, runSessionId);
    registerRunSession(tempRunId, runSessionId);

    // OWNERSHIP AT THE DOOR. The very first frames of a run — the echo of what
    // the user typed, and the run_started the panels wait for — used to be
    // emitted before anyone had claimed the session, so they resolved to
    // «nobody» and were delivered to EVERY connected client: another signed-in
    // user read the sentence you typed. Claim it here, before the first frame.
    try {
        const { registerSessionOwner } = require('../ws');
        if (userId && userId !== 'anonymous') registerSessionOwner(runSessionId, String(userId));
    } catch { /* the wire is optional in tests */ }

    // Echo the user's message to the chat via WebSocket so it shows in the
    // conversation. The composer that posts here does not add it client-side, so
    // without this only Joe's reply would appear.
    try {
        broadcast({ type: 'user_input', sessionId: runSessionId, runId: tempRunId, data: { text: submittedText, sessionId: runSessionId, runId: tempRunId, files: attachmentMeta() }, id: `uin-${Date.now()}` } as any);
        // The panels listen for the RUN starting — that is when the workspace
        // reveals itself and the live file list clears. They were listening
        // for an event the server never sent; the auto-open only happened
        // later, by luck, on the first tool.
        broadcast({ type: 'run_started', sessionId: runSessionId, runId: tempRunId, data: { sessionId: runSessionId, runId: tempRunId, text: submittedText.slice(0, 200), ...(resumedRunId ? { resumedRunId } : {}) }, id: `run-${Date.now()}` } as any);
    } catch { /* non-fatal */ }

    try {
        const traceId = traceManager.startTrace(runSessionId, executionText);
        
        // [ELITE FIX] Make execution non-blocking to prevent Nginx timeouts and frontend hang
        // The background process will handle its own errors and broadcast status via WS
        AgentLoopService.execute(executionText, {
            sessionId: runSessionId,
            // لا تستبدل جلسة لوحة المتصفح بجلسة الدردشة؛ تستخدمها browser_run
            // للتحكم في الصفحة نفسها التي تعرضها الواجهة.
            browserSessionId: effectiveBrowserSessionId || undefined,
            // مساحة العمل يختارها المستخدم في الواجهة ويجب أن تصل إلى كل أداة
            // تعتمد على ملفات المشروع، لا أن تتحول إلى مجلد جلسة الدردشة.
            workspaceId: resolvedWorkspaceId,
            resumeProjectRoot: resumeProjectRoot || undefined,
            resumeOriginRunId: resumedRunId || undefined,
            userId,
            userName,
            systemInstructions,
            attachments,
            traceId,
            runId: tempRunId,
            cancellationHandle: runCancellation,
            language: uiLanguage,
            modelConfig: {
                provider,
                model,
                apiKey,
                baseUrl
            }
        }).catch(err => {
            console.error(`[RunRoute] Background execution fatal error:`, err);
        }).finally(() => {
            // AgentLoopService releases this handle during normal completion;
            // this second, idempotent cleanup covers exits before it begins.
            releaseHandle(runCancellation, tempRunId, runSessionId);
            unregisterRunSession(tempRunId, runSessionId);
        });

        // Return immediately so the frontend can start listening for WS updates
        return res.json({
            ok: true,
            runId: tempRunId,
            traceId,
            sessionId: runSessionId,
        });
    } catch (error: any) {
        console.error('[RunRoute] Execution failed:', error);
        return res.status(500).json({ error: error.message || 'Internal execution error' });
    }
});

/**
 * Basic Run Management Routes
 */
router.get('/', authenticate as any, async (req, res) => {
    const userId = String((req as any).auth?.sub || '').trim();
    if (usesJsonRunStore()) return res.json([]);
    const sessions = await Session.find({ userId }).select('_id').lean();
    const runs = await Run.find({ sessionId: { $in: sessions.map((session: any) => String(session._id)) } })
        .sort({ createdAt: -1 }).limit(50).lean();
    res.json(runs);
});

/** Recovery snapshot for the session switcher. WebSocket events are live, but
 * a user who returns after run_started needs a persisted answer too. */
router.get('/active', authenticate as any, async (req, res) => {
    const userId = String((req as any).auth?.sub || '').trim();
    const runs = getActiveRunSessions();
    res.json({
        runs: runs.filter(run => sessionOwnerOf(run.sessionId) === userId || runOwnerOf(run.runId) === userId).map(run => ({
            runId: run.runId,
            sessionId: run.sessionId,
            status: 'running',
        })),
    });
});

router.get('/:id/receipt', authenticate as any, async (req, res) => {
    const evidence = await getRunEvidence(req.params.id);
    if (!evidence) return res.status(404).json({ error: 'No receipt for this run' });
    if (!(await mayUseRunSession(String(evidence.sessionId || ''), String((req as any).auth?.sub || '').trim()))) {
        return res.status(404).json({ error: 'No receipt for this run' });
    }
    res.json({ ...evidence, ...(evidence.receipt || {}) });
});

router.get('/:id', authenticate as any, async (req, res) => {
    const id = String(req.params.id || '').trim();
    const jsonMode = process.env.OFFLINE_MODE === 'true' || process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1';
    if (jsonMode) {
        const evidence = await getRunEvidence(id);
        if (!evidence) return res.status(404).json({ error: 'Run not found' });
        if (!(await mayUseRunSession(String(evidence.sessionId || ''), String((req as any).auth?.sub || '').trim()))) {
            return res.status(404).json({ error: 'Run not found' });
        }
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
    if (!(await mayUseRunSession(String((run as any).sessionId || ''), String((req as any).auth?.sub || '').trim()))) {
        return res.status(404).json({ error: 'Run not found' });
    }

    const runKeys = [id, String((run as any)._id || '')].filter(Boolean);
    const execs = await ToolExecution.find({ runId: { $in: runKeys } }).lean();
    const artifacts = await Artifact.find({ runId: { $in: runKeys } }).lean();

    res.json({ run, execs, artifacts });
});

/**
 *  ⛔ THIS ANSWERED `ok: true` ABOUT WORK THAT KEPT RUNNING.
 *
 *  Measured on the owner's machine, 2026-08-28: a build hung at
 *  `[17:30:26] ▶ react_project`, he pressed Stop twice, this route returned
 *  `ok: true` both times, and sixty-nine minutes later the counter still read
 *  `68:35` with not one new log line.
 *
 *  It wrote a database field. It never reached the run. **Joe blocks delivery
 *  of pages containing dead controls and shipped one** — and one that reports
 *  the opposite of what happened, which sent him hunting a build defect that
 *  was not there.
 *
 *  So it looks the run up among the live ones and trips it, and it reports
 *  WHETHER ANYTHING STOPPED. «I did not find that run» is a fact he can act
 *  on; `ok` over a run that continued is not.
 */
router.post('/stop', authenticate as any, async (req, res) => {
  const { runId, sessionId } = req.body || {};
  const { stopRun } = require('../../core/session/attended-run');
  const requestedRunId = String(runId || '').trim();
  const requestedSessionId = String(sessionId || '').trim();
  // Resolve the session before stopping. The browser normally sends both ids,
  // but a remounted composer may only have the run id; the cancellation event
  // still needs a concrete session so every open tab can clear its own state.
  const activeBeforeStop = getActiveRunSessions();
  const target = activeBeforeStop.find(run =>
    (requestedRunId && run.runId === requestedRunId)
    || (requestedSessionId && run.sessionId === requestedSessionId)
  );
  const resolvedSessionId = requestedSessionId || target?.sessionId || '';
  const resolvedRunId = requestedRunId || target?.runId || '';
  const userId = String((req as any).auth?.sub || '').trim();
  const liveOwner = sessionOwnerOf(resolvedSessionId) || runOwnerOf(resolvedRunId);
  if (!userId || !resolvedSessionId || liveOwner && liveOwner !== userId || !(await mayUseRunSession(resolvedSessionId, userId))) {
    return res.status(404).json({ error: 'Run not found' });
  }
    //  Both ids: this route is called with a runId, the tool layer registers a
    //  sessionId, and a stop that only travels through one of them is a stop
    //  that works on some screens.
  const stopped = !!stopRun(resolvedRunId, resolvedSessionId);
  if (requestedRunId && mongoose.Types.ObjectId.isValid(requestedRunId)) {
      await Run.findByIdAndUpdate(requestedRunId, { $set: { status: 'failed' } });
  }
  if (stopped && resolvedSessionId) {
      broadcast({
          type: 'run_cancelled',
          sessionId: resolvedSessionId,
          runId: resolvedRunId || undefined,
          data: {
              sessionId: resolvedSessionId,
              runId: resolvedRunId || undefined,
              reason: 'owner_requested',
          },
      } as any);
  }
  res.json({ ok: stopped, stopped, sessionId: resolvedSessionId || undefined });
});

export default router;
