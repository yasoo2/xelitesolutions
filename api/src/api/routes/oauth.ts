import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authenticate } from '../middleware/auth';
import {
  isGoogleOAuthConfigured, isConnected, getConnectedEmail, disconnect,
  getConnectedProfile, refreshProfile, readCachedAvatar, cacheAvatar,
} from '../../modules/integrations/googleOAuth';
import { config } from '../../shared/config';

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
  return config.localUserId;
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

/**
 * The connected account's identity — email, display name and profile photo.
 *
 * The photo was already being fetched from Google during the OAuth callback and
 * then discarded, so the header had nothing to show. Accounts that were
 * connected before it was stored are backfilled here with one lazy call.
 */
router.get('/google/profile', authenticate as any, async (req: Request, res: Response) => {
  const userId = uid(req);
  if (!isConnected(userId)) {
    return res.json({ ok: true, connected: false, email: null, name: null, picture: null });
  }
  let profile = getConnectedProfile(userId) || {};
  if (!profile.picture) {
    const refreshed = await refreshProfile(userId);
    if (refreshed) profile = refreshed;
  }
  // Warm the local copy so the photo keeps working offline.
  if (profile.picture && !readCachedAvatar(userId)) {
    await cacheAvatar(userId, profile.picture);
  }
  return res.json({
    ok: true,
    connected: true,
    email: profile.email || null,
    name: profile.name || null,
    // The browser loads the photo from Joe itself, not from Google.
    picture: profile.picture ? '/api/oauth/google/avatar' : null,
    remotePicture: profile.picture || null,
  });
});

/**
 * The cached photo bytes. Served from localhost so the avatar still renders with
 * no internet. No `authenticate` middleware: an <img> cannot send an
 * Authorization header — the id is resolved from ?token= or the local user, the
 * same way /google/start already does it.
 */
router.get('/google/avatar', async (req: Request, res: Response) => {
  const userId = uid(req);
  let avatar = readCachedAvatar(userId);
  if (!avatar) {
    const profile = getConnectedProfile(userId);
    if (profile?.picture) avatar = await cacheAvatar(userId, profile.picture);
  }
  if (!avatar) return res.status(404).json({ ok: false, error: 'no_avatar' });
  res.setHeader('Content-Type', avatar.contentType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.end(avatar.buffer);
});

/** Disconnect (forget the stored tokens). */
router.post('/google/disconnect', authenticate as any, (req: Request, res: Response) => {
  const result = disconnect(uid(req));
  // A disconnect that did not actually remove the token must not answer 200:
  // the client would show "disconnected" while the refresh token is still there.
  return res.status(result.ok ? 200 : 500).json(result);
});

export default router;
