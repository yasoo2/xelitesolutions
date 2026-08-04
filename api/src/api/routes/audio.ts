/**
 * VOICE — the missing half of a feature that was fully built on the client.
 *
 * The composer has had a voice mode for a long time: it speaks every reply
 * Joe writes, and it asks the server first, at `POST /api/audio/speech`, for
 * real neural speech before falling back to the browser's own synthesizer.
 * That route did not exist. Not «broken» — never mounted. Express answered
 * the browser's own «Cannot POST /api/audio/speech» 404 page, the client
 * swallowed it as a failed request, and the fallback covered the hole so well
 * that nobody noticed the good half of the feature had never once run.
 *
 * This is exactly the defect the wiring policy exists to catch: something
 * added on one side of a seam and never connected on the other.
 *
 * The route is honest about what it can do:
 *   - a local OpenAI-compatible speech server (TTS_BASE_URL) is used first,
 *     because it costs nothing and works with no internet;
 *   - otherwise OpenAI, with the user's own key (set from the UI) or the
 *     environment's;
 *   - with neither, it answers 503 and a REASON, immediately, so the client
 *     falls back to browser speech without waiting on a timeout.
 * It never pretends: no silent empty audio, no fabricated success.
 */
import { Router, Request, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { getDynamicOpenAIKey } from '../../core/llm';
import { config } from '../../shared/config';

const router = Router();

/** OpenAI caps a single speech request at 4096 characters. */
const MAX_CHARS = 4000;
const TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 20000);

type Engine =
    | { kind: 'local'; url: string; model: string; key: string }
    | { kind: 'openai'; url: string; model: string; key: string; source: 'user' | 'env' }
    | { kind: 'none'; reason: string };

/** Which speech engine this request can actually use — decided, not guessed. */
export function pickEngine(userId: string): Engine {
    const local = String(process.env.TTS_BASE_URL || '').trim().replace(/\/+$/, '');
    if (local) {
        return {
            kind: 'local',
            url: `${local.replace(/\/v1$/, '')}/v1/audio/speech`,
            model: String(process.env.TTS_MODEL || 'tts-1'),
            key: String(process.env.TTS_API_KEY || 'local'),
        };
    }
    const userKey = String(getDynamicOpenAIKey(userId) || '').trim();
    const envKey = String(process.env.OPENAI_API_KEY || '').trim();
    const key = userKey || envKey;
    if (key && key.startsWith('sk-')) {
        return {
            kind: 'openai',
            url: 'https://api.openai.com/v1/audio/speech',
            model: String(process.env.TTS_MODEL || 'tts-1'),
            key,
            source: userKey ? 'user' : 'env',
        };
    }
    return {
        kind: 'none',
        reason: 'لا يوجد محرّك نطق: أضف مفتاح OpenAI من الإعدادات، أو شغّل خادم نطق محلّياً وضع عنوانه في TTS_BASE_URL.',
    };
}

const uid = (req: Request) =>
    String((req as AuthenticatedRequest).auth?.sub || config.localUserId).trim();

/**
 * GET /api/audio/speech/status — what the UI may rely on before it tries.
 * Never leaks the key itself, only where it came from.
 */
router.get('/speech/status', authenticate, (req: Request, res: Response) => {
    const e = pickEngine(uid(req));
    res.json({
        ok: true,
        available: e.kind !== 'none',
        engine: e.kind,
        model: e.kind === 'none' ? null : e.model,
        source: e.kind === 'openai' ? e.source : e.kind === 'local' ? 'TTS_BASE_URL' : 'none',
        reason: e.kind === 'none' ? e.reason : undefined,
    });
});

/**
 * POST /api/audio/speech  { text, voice?, format? } → audio bytes.
 *
 * The client reads the body as a blob and plays it, so the success path must
 * be audio and nothing else; every failure path is JSON with a reason, and a
 * status the client can tell apart (401 re-auth, 503 fall back to browser).
 */
router.post('/speech', authenticate, async (req: Request, res: Response) => {
    const raw = String(req.body?.text ?? req.body?.input ?? '').trim();
    if (!raw) return res.status(400).json({ ok: false, error: 'bad_request', message: 'text is required' });

    const text = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) : raw;
    const voice = String(req.body?.voice || 'onyx').trim() || 'onyx';
    const format = /^(mp3|opus|aac|flac|wav|pcm)$/.test(String(req.body?.format || ''))
        ? String(req.body.format) : 'mp3';

    const engine = pickEngine(uid(req));
    if (engine.kind === 'none') {
        // 503, not 404: the feature exists, this machine just cannot serve it
        // right now — and the client should fall back immediately.
        return res.status(503).json({ ok: false, error: 'tts_unavailable', message: engine.reason });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const upstream = await fetch(engine.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${engine.key}` },
            body: JSON.stringify({ model: engine.model, input: text, voice, response_format: format }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (!upstream.ok) {
            const detail = (await upstream.text().catch(() => '')).slice(0, 300);
            return res.status(upstream.status === 401 ? 502 : 502).json({
                ok: false,
                error: 'tts_upstream_failed',
                engine: engine.kind,
                status: upstream.status,
                // the key never appears in a body we echo back
                message: detail.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***'),
            });
        }

        const buf = Buffer.from(await upstream.arrayBuffer());
        if (!buf.length) {
            return res.status(502).json({ ok: false, error: 'tts_empty', message: 'the engine returned no audio' });
        }
        res.setHeader('Content-Type', upstream.headers.get('content-type') || `audio/${format === 'mp3' ? 'mpeg' : format}`);
        res.setHeader('Content-Length', String(buf.length));
        res.setHeader('Cache-Control', 'no-store');
        return res.end(buf);
    } catch (e: any) {
        clearTimeout(timer);
        const aborted = e?.name === 'AbortError';
        return res.status(aborted ? 504 : 502).json({
            ok: false,
            error: aborted ? 'tts_timeout' : 'tts_unreachable',
            message: aborted ? `no answer within ${TIMEOUT_MS}ms` : String(e?.message || e).slice(0, 200),
        });
    }
});

export default router;
