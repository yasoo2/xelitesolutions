import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import { isGoogleOAuthConfigured, isConnected, getConnectedEmail, disconnect } from '../../modules/integrations/googleOAuth';

const router = Router();

/** Resolve the acting user id (auth subject, a ?token= JWT, or a local default). */
function uid(req: Request): string {
  const fromAuth = String((req as any).auth?.sub || (req as any).auth?.userId || '').trim();
  if (fromAuth) return fromAuth;
  const qtoken = String((req.query?.token as string) || '').trim();
  if (qtoken) {
    try {
      const dec: any = jwt.verify(qtoken, process.env.JWT_SECRET || 'devsecret123');
      const id = String(dec?.sub || dec?.id || dec?.userId || '').trim();
      if (id) return id;
    } catch { /* fall through */ }
  }
  return String(process.env.DEFAULT_USER_ID || 'local-user').trim();
}

/** Connection status for the "Connect Google" card in Settings. */
router.get('/google/status', authenticate as any, (req: Request, res: Response) => {
  const userId = uid(req);
  return res.json({ ok: true, configured: isGoogleOAuthConfigured(), connected: isConnected(userId), email: getConnectedEmail(userId) || null });
});

/** "Connect Google" for a user who signed in another way: reuse the ONE unified
 *  Google flow (/api/auth/google), which requests identity + account scopes in a
 *  single consent and stores the tokens — so there is no separate connect logic. */
router.get('/google/start', (req: Request, res: Response) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(400).json({ ok: false, error: 'google_oauth_not_configured', detail: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
  }
  const returnTo = String(req.query?.returnTo || process.env.APP_URL || `http://localhost:${process.env.PORT || 5002}`).trim();
  return res.redirect(`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
});

/** Disconnect (forget the stored tokens). */
router.post('/google/disconnect', authenticate as any, (req: Request, res: Response) => {
  return res.json(disconnect(uid(req)));
});

export default router;
