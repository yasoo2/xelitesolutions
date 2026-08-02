import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AgentLoopService } from '../../modules/services/AgentLoopService';
import { authenticateOptional } from '../middleware/auth';
import { loadUploadedFiles } from './files';
import { Run } from '../../shared/models/run';
import { ToolExecution } from '../../shared/models/toolExecution';
import { Artifact } from '../../shared/models/artifact';
import { Session } from '../../shared/models/session';
import { traceManager } from '../../modules/services/TraceManager';
import { broadcast } from '../ws';

const router = Router();

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
    const { text, sessionId, userId: bodyUserId, provider, model, apiKey, baseUrl, language } = req.body || {};
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
        } catch (e: any) {
            console.warn('[RunRoute] Loading attachments failed (continuing without):', e?.message || e);
        }
    }
    
    console.log(`[RunRoute] Unified execution requested for session: ${sessionId}`);

    if (!text) {
        return res.status(400).json({ error: 'Goal text is required' });
    }

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
        }
    } catch { /* non-fatal */ }

    // Echo the user's message to the chat via WebSocket so it shows in the
    // conversation. The composer that posts here does not add it client-side, so
    // without this only Joe's reply would appear.
    try {
        broadcast({ type: 'user_input', sessionId, data: { text, sessionId, files: attachmentMeta() }, id: `uin-${Date.now()}` } as any);
    } catch { /* non-fatal */ }

    try {
        const traceId = traceManager.startTrace(sessionId || 'anonymous', text);
        
        // Generate a runId immediately so we can return it
        const tempRunId = `run-${Date.now()}`;
        
        // [ELITE FIX] Make execution non-blocking to prevent Nginx timeouts and frontend hang
        // The background process will handle its own errors and broadcast status via WS
        AgentLoopService.execute(text, {
            sessionId,
            userId,
            userName,
            systemInstructions,
            attachments,
            traceId,
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

router.get('/:id', async (req, res) => {
    const run = await Run.findById(req.params.id).lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });
    
    const execs = await ToolExecution.find({ runId: req.params.id }).lean();
    const artifacts = await Artifact.find({ runId: req.params.id }).lean();
    
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
