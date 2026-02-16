import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { runBrowserInstruction } from '../browser/runner';
import { executePlannedActions } from '../browser/executor';
import { stopSession, getBrowserSession } from '../browser/manager';
import { canAccessBrowserSession } from '../browser/wsHub';

const router = Router();

// [Wakil 5.1] Browser Run Concurrency Guard
const activeBrowserRuns = new Map<string, number>();

async function ensureBrowserSessionAccess(req: Request, res: Response, sessionId: string) {
  const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
  if (authBypass) return { ok: true as const };
  const userId = String((req as any).auth?.sub || '').trim();
  if (!userId) return { ok: false as const, status: 401, body: { error: 'unauthorized' } };
  const ok = await canAccessBrowserSession(userId, sessionId);
  if (!ok) return { ok: false as const, status: 403, body: { error: 'forbidden' } };
  return { ok: true as const, userId };
}

router.post('/run', authenticate as any, async (req: Request, res: Response) => {
  const sid = String(req.body?.sessionId || '').trim();
  try {
    const { instructionText, mode } = req.body || {};
    const text = String(instructionText || '').trim();
    const m = String(mode || 'execute').trim();

    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    if (!text) return res.status(400).json({ error: 'instructionText required' });
    if (m !== 'execute') return res.status(400).json({ error: 'unsupported_mode' });

    // [Wakil 5.1] Concurrency Guard
    if (activeBrowserRuns.has(sid)) {
      console.warn('[Browser] Blocked concurrent run for session:', sid);
      return res.status(429).json({ error: 'browser_run_in_progress', detail: 'Another run is already active for this session.' });
    }
    activeBrowserRuns.set(sid, Date.now());

    const access = await ensureBrowserSessionAccess(req, res, sid);
    if (!access.ok) {
      activeBrowserRuns.delete(sid);
      return res.status(access.status).json(access.body);
    }
    const userId = String((access as any).userId || '').trim();

    const r = await runBrowserInstruction({ userId, sessionId: sid, instructionText: text });
    activeBrowserRuns.delete(sid);
    if (!r.ok) {
      const err = String((r as any)?.error || '').trim();
      if (err === 'browser_unavailable') return res.status(503).json(r);
      return res.status(400).json(r);
    }
    return res.json(r);
  } catch (err: any) {
    activeBrowserRuns.delete(sid);
    // [Wakil 5.1] Full Stack Trace Logging
    console.error('[Browser] /run FAILED:', err?.stack || err);
    return res.status(500).json({ error: err?.message || 'browser_run_failed' });
  }
});

router.post('/actions', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { sessionId, actions } = req.body || {};
    const sid = String(sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    if (!Array.isArray(actions)) return res.status(400).json({ error: 'actions must be an array' });

    const access = await ensureBrowserSessionAccess(req, res, sid);
    if (!access.ok) return res.status(access.status).json(access.body);
    const userId = String((access as any).userId || '').trim();

    try {
      const r = await executePlannedActions({ userId, sessionId: sid, actions });
      return res.json({ ok: true, result: r });
    } catch (err: any) {
      try { console.error('browser_actions_failed', err); } catch { }
      return res.status(503).json({ ok: false, error: 'browser_unavailable', detail: String(err?.message || err || '') });
    }
  } catch (err: any) {
    try { console.error('browser_actions_failed', err); } catch { }
    return res.status(500).json({ error: err?.message || 'browser_actions_failed' });
  }
});

router.post('/stop', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    const access = await ensureBrowserSessionAccess(req, res, sid);
    if (!access.ok) return res.status(access.status).json(access.body);
    try {
      await stopSession(sid);
    } catch { }
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'browser_stop_failed' });
  }
});

router.post('/nav/back', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    const access = await ensureBrowserSessionAccess(req, res, sid);
    if (!access.ok) return res.status(access.status).json(access.body);
    const s = await getBrowserSession(sid);
    let ok = false;
    try {
      const r = await s.page.goBack({ waitUntil: 'domcontentloaded' });
      ok = !!r;
    } catch { }
    return res.json({ ok });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'nav_back_failed' });
  }
});

router.post('/nav/forward', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    const access = await ensureBrowserSessionAccess(req, res, sid);
    if (!access.ok) return res.status(access.status).json(access.body);
    const s = await getBrowserSession(sid);
    let ok = false;
    try {
      const r = await s.page.goForward({ waitUntil: 'domcontentloaded' });
      ok = !!r;
    } catch { }
    return res.json({ ok });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'nav_forward_failed' });
  }
});

router.post('/nav/refresh', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    const access = await ensureBrowserSessionAccess(req, res, sid);
    if (!access.ok) return res.status(access.status).json(access.body);
    const s = await getBrowserSession(sid);
    try { await s.page.reload({ waitUntil: 'domcontentloaded' }); } catch { }
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'nav_refresh_failed' });
  }
});

router.post('/nav/goto', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    const raw = String(req.body?.url || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    if (!raw) return res.status(400).json({ error: 'url required' });
    const access = await ensureBrowserSessionAccess(req, res, sid);
    if (!access.ok) return res.status(access.status).json(access.body);
    const s = await getBrowserSession(sid);
    let u = raw;
    if (!/^[a-z]+:\/\//i.test(u)) u = `https://${u}`;
    try { await s.page.goto(u, { waitUntil: 'domcontentloaded' }); } catch { }
    return res.json({ ok: true, url: s.page.url() });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'nav_goto_failed' });
  }
});

export default router;
