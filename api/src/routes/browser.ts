import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { runBrowserInstruction } from '../browser/runner';
import { executePlannedActions } from '../browser/executor';
import { stopSession, getBrowserSession } from '../browser/manager';

const router = Router();

router.post('/run', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { sessionId, instructionText, mode } = req.body || {};
    const sid = String(sessionId || '').trim();
    const text = String(instructionText || '').trim();
    const m = String(mode || 'execute').trim();

    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    if (!text) return res.status(400).json({ error: 'instructionText required' });
    if (m !== 'execute') return res.status(400).json({ error: 'unsupported_mode' });

    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    const r = await runBrowserInstruction({ userId, sessionId: sid, instructionText: text });
    if (!r.ok) {
      const err = String((r as any)?.error || '').trim();
      if (err === 'browser_unavailable') return res.status(503).json(r);
      return res.status(400).json(r);
    }
    return res.json(r);
  } catch (err: any) {
    try { console.error('browser_run_failed', err); } catch {}
    return res.status(500).json({ error: err?.message || 'browser_run_failed' });
  }
});

router.post('/actions', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { sessionId, actions } = req.body || {};
    const sid = String(sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    if (!Array.isArray(actions)) return res.status(400).json({ error: 'actions must be an array' });

    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'unauthorized' });

    try {
      const r = await executePlannedActions({ userId, sessionId: sid, actions });
      return res.json({ ok: true, result: r });
    } catch (err: any) {
      try { console.error('browser_actions_failed', err); } catch {}
      return res.status(503).json({ ok: false, error: 'browser_unavailable', detail: String(err?.message || err || '') });
    }
  } catch (err: any) {
    try { console.error('browser_actions_failed', err); } catch {}
    return res.status(500).json({ error: err?.message || 'browser_actions_failed' });
  }
});

router.post('/stop', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    try {
      await stopSession(sid);
    } catch {}
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'browser_stop_failed' });
  }
});

router.post('/nav/back', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    const s = await getBrowserSession(sid);
    let ok = false;
    try {
      const r = await s.page.goBack({ waitUntil: 'domcontentloaded' });
      ok = !!r;
    } catch {}
    return res.json({ ok });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'nav_back_failed' });
  }
});

router.post('/nav/forward', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    const s = await getBrowserSession(sid);
    let ok = false;
    try {
      const r = await s.page.goForward({ waitUntil: 'domcontentloaded' });
      ok = !!r;
    } catch {}
    return res.json({ ok });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'nav_forward_failed' });
  }
});

router.post('/nav/refresh', authenticate as any, async (req: Request, res: Response) => {
  try {
    const sid = String(req.body?.sessionId || '').trim();
    if (!sid) return res.status(400).json({ error: 'sessionId required' });
    const s = await getBrowserSession(sid);
    try { await s.page.reload({ waitUntil: 'domcontentloaded' }); } catch {}
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
    const s = await getBrowserSession(sid);
    let u = raw;
    if (!/^[a-z]+:\/\//i.test(u)) u = `https://${u}`;
    try { await s.page.goto(u, { waitUntil: 'domcontentloaded' }); } catch {}
    return res.json({ ok: true, url: s.page.url() });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'nav_goto_failed' });
  }
});

export default router;
