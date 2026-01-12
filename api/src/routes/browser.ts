import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { runBrowserInstruction } from '../browser/runner';
import { executePlannedActions } from '../browser/executor';

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
    if (!r.ok) return res.status(400).json(r);
    return res.json(r);
  } catch (err: any) {
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

    const r = await executePlannedActions({ userId, sessionId: sid, actions });
    return res.json({ ok: true, result: r });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'browser_actions_failed' });
  }
});

export default router;
