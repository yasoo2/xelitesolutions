import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { sendCommand, isExtensionConnected } from '../../modules/extension/gateway';
import { config } from '../../shared/config';

const router = Router();

function uid(req: Request): string {
  return String((req as any).auth?.sub || (req as any).auth?.userId || config.localUserId).trim();
}

/** Is the user's real browser (extension) connected? */
router.get('/status', authenticate as any, (req: Request, res: Response) => {
  return res.json({ ok: true, connected: isExtensionConnected(uid(req)) });
});

/** Forward an interactive action from Joe's panel to the user's real browser.
 *  Supported: navigate, startStream, stopStream, click_xy, type_keys, read, screenshot. */
router.post('/action', authenticate as any, async (req: Request, res: Response) => {
  const userId = uid(req);
  const cmd = String(req.body?.cmd || req.body?.action || '').trim();
  const args = (req.body?.args && typeof req.body.args === 'object') ? req.body.args : (req.body || {});
  if (!cmd) return res.status(400).json({ ok: false, error: 'cmd_required' });
  if (!isExtensionConnected(userId)) return res.status(409).json({ ok: false, error: 'extension_not_connected' });
  try {
    const result = await sendCommand(userId, cmd, args, cmd === 'navigate' ? 30000 : 12000);
    return res.json({ ok: true, result });
  } catch (e: any) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
});

export default router;
