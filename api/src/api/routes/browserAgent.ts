import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { setSessionSecret } from '../../modules/services/secrets';
import { getLastTaskForSession } from '../../modules/browser/reactLoop';
import { BrowserAgent } from '../../orchestration/agents/BrowserAgent';
import { config } from '../../shared/config';

const router = Router();

function uid(req: Request): string {
  return String((req as any).auth?.sub || (req as any).auth?.userId || config.localUserId).trim();
}

/**
 * POST /api/browser-agent/resume
 * The user supplied what the agent asked for (a missing credential, or a 2FA/OTP
 * code). Store it as a session secret, then RESUME the same task on the same live
 * browser session — the agent re-observes the page (now the secret exists) and
 * continues from exactly where it paused.
 * Body: { sessionId, key, value, goal? }
 */
router.post('/resume', authenticate as any, async (req: Request, res: Response) => {
  const sessionId = String(req.body?.sessionId || '').trim();
  const key = String(req.body?.key || '').trim().toUpperCase();
  const value = String(req.body?.value ?? '');
  if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId_required' });
  if (!/^[A-Z0-9_]+$/.test(key)) return res.status(400).json({ ok: false, error: 'invalid_key' });
  if (!value) return res.status(400).json({ ok: false, error: 'value_required' });

  // Store the user-provided value where the browser executor resolves {{SECRET:KEY}}.
  try { setSessionSecret(sessionId, key, value); } catch (e: any) {
    return res.status(500).json({ ok: false, error: 'store_failed' });
  }

  // Extra secrets supplied in the SAME prompt (e.g. the password entered together
  // with the email) so the agent doesn't pause a second time — store them all now,
  // BEFORE resuming, under the same live browser session.
  const extra = req.body?.secrets;
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      const kk = String(k || '').trim().toUpperCase();
      const vv = String((v as any) ?? '');
      if (/^[A-Z0-9_]+$/.test(kk) && vv && kk !== key) {
        try { setSessionSecret(sessionId, kk, vv); } catch { /* best-effort */ }
      }
    }
  }

  // Resume the exact task the agent paused on (looked up per-session, so the panel
  // does not need to know the original prompt).
  const goal = String(req.body?.goal || '').trim() || getLastTaskForSession(sessionId) || '';
  if (!goal) return res.status(409).json({ ok: false, error: 'no_task_to_resume' });

  const userId = uid(req);
  // The live browser runs under `sessionId`; the CHAT that must show the
  // continuation is a DIFFERENT id. Mirror activity to the chat session the panel
  // reported (falls back to the browser id when the panel didn't send one) so the
  // chat visibly moves after the user submits credentials — the earlier bug was
  // that resume mirrored to the browser session, which the chat filters out.
  const chatSessionId = String(req.body?.chatSessionId || '').trim() || sessionId;
  try {
    const agent = new BrowserAgent();
    const result = await agent.execute(goal, { sessionId, resume: true }, { userId, sessionId: chatSessionId });
    return res.json({ ok: result.ok, data: result.output, error: result.error });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
