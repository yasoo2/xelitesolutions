import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import {
  isGoogleOAuthConfigured, getAuthUrl, handleCallback, verifyState,
  isConnected, getConnectedEmail, disconnect,
} from '../../modules/integrations/googleOAuth';

const router = Router();

/** Resolve the acting user id consistently. On a full-page OAuth navigation the
 *  Authorization header is absent, so also accept a ?token= JWT and decode it. */
function uid(req: Request): string {
  const fromAuth = String((req as any).auth?.sub || (req as any).auth?.userId || '').trim();
  if (fromAuth) return fromAuth;
  const qtoken = String((req.query?.token as string) || '').trim();
  if (qtoken) {
    try {
      const secret = process.env.JWT_SECRET || 'devsecret123';
      const dec: any = jwt.verify(qtoken, secret);
      const id = String(dec?.sub || dec?.id || dec?.userId || '').trim();
      if (id) return id;
    } catch { /* fall through to default */ }
  }
  return String(process.env.DEFAULT_USER_ID || 'local-user').trim();
}

/** Where to send the browser back to after the consent dance. */
function appUrl(): string {
  return String(process.env.APP_URL || `http://localhost:${process.env.PORT || 5002}`).replace(/\/+$/, '');
}

/** Connection status for the "Connect Google" button in the UI. */
router.get('/google/status', authenticate as any, (req: Request, res: Response) => {
  const userId = uid(req);
  return res.json({ ok: true, configured: isGoogleOAuthConfigured(), connected: isConnected(userId), email: getConnectedEmail(userId) || null });
});

/** Begin the OAuth flow — redirects the user to Google's consent screen. */
router.get('/google/start', authenticate as any, (req: Request, res: Response) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(400).json({ ok: false, error: 'google_oauth_not_configured', detail: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' });
  }
  return res.redirect(getAuthUrl(uid(req)));
});

/** Google redirects back here with ?code&state. We exchange + store, then bounce
 *  the user back into the app. No auth middleware: the signed state proves identity. */
router.get('/google/callback', async (req: Request, res: Response) => {
  const code = String(req.query.code || '').trim();
  const state = String(req.query.state || '').trim();
  const err = String(req.query.error || '').trim();
  if (err) return res.redirect(`${appUrl()}/joe?google=denied`);
  const st = verifyState(state);
  if (!code || !st) return res.redirect(`${appUrl()}/joe?google=invalid_state`);
  const result = await handleCallback(code, st.userId);
  if (!result.ok) return res.redirect(`${appUrl()}/joe?google=error`);
  return res.redirect(`${appUrl()}/joe?google=connected&email=${encodeURIComponent(result.email || '')}`);
});

/** Disconnect (forget the stored tokens). */
router.post('/google/disconnect', authenticate as any, (req: Request, res: Response) => {
  return res.json(disconnect(uid(req)));
});

export default router;
