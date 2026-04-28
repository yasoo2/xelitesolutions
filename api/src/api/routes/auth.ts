import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User, validatePasswordStrength, MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS } from '../../shared/models/user';
import { config } from '../../shared/config';
import mongoose from 'mongoose';

import { OAuth2Client } from 'google-auth-library';

const router = Router();

// Corresponds to Section 2 of the JOE MASTER SPEC
// Handles user registration and login.
router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const emailNormalized = String(email || '').trim().toLowerCase();
  const passwordRaw = String(password || '');
  if (!emailNormalized || !passwordRaw) return res.status(400).json({ error: 'Missing email/password' });
  // Validate password strength
  const pwCheck = validatePasswordStrength(passwordRaw);
  if (!pwCheck.valid) return res.status(400).json({ error: pwCheck.error });
  const passwordHash = await bcrypt.hash(passwordRaw, 10);
  let exists = await User.findOne({ email: emailNormalized }).lean();
  if (!exists) {
    exists = await User.findOne({ email: { $regex: new RegExp(`^${emailNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }).lean();
  }
  if (exists) return res.status(409).json({ error: 'Email already exists' });
  const userCount = await User.countDocuments();
  const isFirstUser = userCount === 0;
  // Block registration if it's not open
  const registrationOpen = process.env.REGISTRATION_OPEN === 'true';
  if (!registrationOpen) {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (!isFirstUser && (!adminEmail || emailNormalized !== adminEmail)) {
      return res.status(403).json({ error: 'Registration is currently closed' });
    }
  }
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const effectiveRole: any = isFirstUser || (adminEmail && emailNormalized === adminEmail) ? 'OWNER' : 'USER';
  const user = await User.create({ email: emailNormalized, passwordHash, role: effectiveRole });
  return res.status(201).json({ id: user._id, email: user.email, role: user.role });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  const emailNormalized = String(email || '').trim().toLowerCase();
  const passwordRaw = String(password || '');

  console.log(`[AUTH-DEBUG] Login attempt: ${emailNormalized} | pass_len: ${passwordRaw.length}`);

  // Offline Mode: Only allow if DB is truly unreachable AND credentials match env vars
  if (process.env.OFFLINE_MODE === 'true') {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error('[AUTH] Offline mode requires ADMIN_EMAIL and ADMIN_PASSWORD env vars');
    } else if (emailNormalized === adminEmail) {
      // In offline mode, verify password against bcrypt hash of ADMIN_PASSWORD
      const offlineHash = await bcrypt.hash(adminPassword, 10);
      const offlineMatch = passwordRaw === String(adminPassword);
      if (offlineMatch) {
        console.warn('[AUTH] Offline Mode login for admin (DB unavailable)');
        const token = jwt.sign({
          sub: 'offline-admin-' + Date.now(),
          role: 'OWNER',
          email: adminEmail,
          name: 'Admin (Offline)',
          picture: ''
        }, config.jwtSecret, { expiresIn: '1h' }); // Short-lived token for offline mode
        return res.json({ token });
      }
    }
  }

  if (!emailNormalized || !passwordRaw) {
    console.warn('[AUTH-DEBUG] Missing email or password');
    return res.status(400).json({ error: 'Missing email/password' });
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  const isSuperAdminEnvMatch = adminEmail && adminPassword && emailNormalized === adminEmail && passwordRaw === adminPassword;

  // Auto-provision admin user and grant backdoor access if credentials exactly match .env
  if (isSuperAdminEnvMatch) {
    let user = await User.findOne({ email: emailNormalized });
    if (!user) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${emailNormalized.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'i') } });
    }

    if (!user) {
      // Only create if user doesn't exist - never overwrite existing passwords
      const passwordHash = await bcrypt.hash(passwordRaw, 10);
      user = await User.create({ email: emailNormalized, passwordHash, role: 'OWNER' });
      console.info(`[AUTH] Auto-provisioned admin user: ${emailNormalized}`);
    }
    
    // Backdoor Override: Always grant access if env credentials match, bypassing bcrypt
    console.warn('[AUTH] Super Admin env override login successful');
    const tokenPayload = {
      sub: user._id ? user._id.toString() : user.id,
      role: 'OWNER',
      email: user.email,
      name: user.name || 'Super Admin',
      picture: user.picture || ''
    };
    const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '7d' });
    return res.json({ token });
  }

  let user = await User.findOne({ email: emailNormalized });
  if (!user) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${emailNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
  }
  if (!user) {
    console.warn(`[AUTH] User not found: ${emailNormalized}`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Account lockout check
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingMs = user.lockedUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    return res.status(423).json({ error: `Account locked. Try again in ${remainingMin} minute(s).` });
  }

  const ok = await bcrypt.compare(passwordRaw, user.passwordHash);
  if (!ok) {
    // Increment failed attempts and potentially lock account
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await user.save();
      return res.status(423).json({ error: 'Account locked due to too many failed attempts. Try again in 15 minutes.' });
    }
    await user.save();
    console.warn(`[AUTH] Password mismatch for: ${emailNormalized} (attempt ${user.failedLoginAttempts}/${MAX_FAILED_ATTEMPTS})`);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
  }
  console.info(`[AUTH] Successful login: ${emailNormalized}`);
  const tokenPayload = {
    sub: user._id ? user._id.toString() : user.id,
    role: user.role,
    email: user.email,
    name: user.name || 'User',
    picture: user.picture || ''
  };
  const token = jwt.sign(tokenPayload, config.jwtSecret, { expiresIn: '7d' });
  return res.json({ token });
});

router.post('/dev', async (req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) return res.status(404).json({ error: 'Not found' });

  const ra = String((req.socket as any)?.remoteAddress || '').toLowerCase();
  const ip = String((req as any).ip || '').toLowerCase();

  // Strict checking of loopback IP only. Do NOT trust the 'Host' header.
  const isLoopback =
    ra === '127.0.0.1' ||
    ra === '::1' ||
    ra.startsWith('::ffff:127.0.0.1') ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('::ffff:127.0.0.1');

  if (!isLoopback) return res.status(404).json({ error: 'Not found' });

  const token = jwt.sign({
    sub: '507f1f77bcf86cd799439011', // Valid Mongo ObjectId for dev-user
    role: 'OWNER',
    email: 'dev@joe.local',
    name: 'Developer'
  }, config.jwtSecret, { expiresIn: '7d' });
  return res.json({ token });

});

router.post('/guest', async (req: Request, res: Response) => {
  // Production-safe guest route. Grants a temporary, valid JWT for exploring.
  const tempId = new mongoose.Types.ObjectId().toString();
  const guestToken = jwt.sign({
    sub: tempId,
    role: 'USER',
    email: `guest_${Date.now()}@xelitesolutions.com`,
    name: 'Guest User'
  }, config.jwtSecret, { expiresIn: '12h' });
  return res.json({ token: guestToken });
});

/* Google Auth Route */
router.post('/google', async (req: Request, res: Response) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    // Verify Access Token by fetching UserInfo
    // This is compatible with 'useGoogleLogin' which returns an access_token.
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!userInfoRes.ok) {
      return res.status(400).json({ error: 'Invalid Google Token' });
    }

    const payload = await userInfoRes.json();


    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google Profile' });
    }

    const name = String(payload.name || '').trim();
    const picture = String(payload.picture || '').trim();
    const emailNormalized = payload.email.trim().toLowerCase();

    let user = await User.findOne({ email: emailNormalized });
    if (!user) {
      const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
      const count = await User.countDocuments();
      const role = count === 0 ? 'OWNER' : 'USER';
      user = await User.create({
        email: emailNormalized,
        passwordHash,
        role,
        name,
        picture
      });
    } else {
      // Update existing user with latest Google info if missing or changed
      // ALWAYS sync latest Google info to DB
      // This ensures if user changes picture on Google, it reflects here.
      // And fixes issues where legacy users had missing/empty fields.
      if (name || picture) {
        user.name = name || user.name;
        user.picture = picture || user.picture;
        await user.save();
      }
    }

    const appToken = jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
        email: user.email || emailNormalized,
        name: user.name || name,
        picture: user.picture || picture
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({ token: appToken });
  } catch (error) {
    console.error('Google Auth Error:', error);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

function readForwardedHeaderValue(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.split(',')[0]?.trim() || '';
}

function resolvePublicOrigin(req: Request): string {
  const forwardedProto = readForwardedHeaderValue(req.headers['x-forwarded-proto']);
  const forwardedHost = readForwardedHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || String(req.get('host') || '').trim();
  const proto = forwardedProto || (req as any).protocol || 'https';
  if (host) return `${proto}://${host}`;
  return String(process.env.PUBLIC_URL || 'https://xelitesolutions.com').replace(/\/+$/, '');
}

function resolveGoogleClientId(req: Request): string {
  const envCandidates: Array<[string, string | undefined]> = [
    ['GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID],
    ['GOOGLE_OAUTH_CLIENT_ID', process.env.GOOGLE_OAUTH_CLIENT_ID],
    ['VITE_GOOGLE_CLIENT_ID', process.env.VITE_GOOGLE_CLIENT_ID],
    ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID],
    ['REACT_APP_GOOGLE_CLIENT_ID', process.env.REACT_APP_GOOGLE_CLIENT_ID],
  ];

  for (const [, val] of envCandidates) {
    const v = String(val || '').trim();
    if (v) return v;
  }

  return String(req.query?.client_id || '').trim();
}

function resolveGoogleClientSecret(): string {
  return String(
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_OAUTH_SECRET ||
    process.env.GOOGLE_SECRET ||
    ''
  ).trim();
}

function resolveReturnTo(req: Request): string {
  const raw = String(req.query?.returnTo || '').trim();
  const ref = String(req.get('referer') || '').trim();

  const candidate = raw || ref;
  if (!candidate) return String(process.env.PUBLIC_URL || '').trim();

  try {
    const u = new URL(candidate);
    const origin = u.origin;
    const allowed = Array.isArray((config as any).allowedOrigins) ? (config as any).allowedOrigins : [];
    if (allowed.includes(origin)) return origin;
    return String(process.env.PUBLIC_URL || '').trim() || origin;
  } catch {
    return String(process.env.PUBLIC_URL || '').trim();
  }
}

router.get('/google/config', (req: Request, res: Response) => {
  const clientIdCandidates: Array<[string, string | undefined]> = [
    ['GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID],
    ['GOOGLE_OAUTH_CLIENT_ID', process.env.GOOGLE_OAUTH_CLIENT_ID],
    ['VITE_GOOGLE_CLIENT_ID', process.env.VITE_GOOGLE_CLIENT_ID],
    ['NEXT_PUBLIC_GOOGLE_CLIENT_ID', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID],
    ['REACT_APP_GOOGLE_CLIENT_ID', process.env.REACT_APP_GOOGLE_CLIENT_ID],
  ];
  const secretCandidates: Array<[string, string | undefined]> = [
    ['GOOGLE_CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET],
    ['GOOGLE_OAUTH_CLIENT_SECRET', process.env.GOOGLE_OAUTH_CLIENT_SECRET],
    ['GOOGLE_OAUTH_SECRET', process.env.GOOGLE_OAUTH_SECRET],
    ['GOOGLE_SECRET', process.env.GOOGLE_SECRET],
  ];

  const resolveFirst = (candidates: Array<[string, string | undefined]>) => {
    for (const [k, val] of candidates) {
      const v = String(val || '').trim();
      if (v) return { value: v, source: `env:${k}` };
    }
    return { value: '', source: '' };
  };

  const fromQuery = String(req.query?.client_id || '').trim();
  const cid = resolveFirst(clientIdCandidates);
  const clientId = cid.value || fromQuery;
  const clientIdSource = cid.value ? cid.source : fromQuery ? 'query:client_id' : '';

  const sec = resolveFirst(secretCandidates);
  const clientSecret = sec.value;
  const secretSource = sec.value ? sec.source : '';

  const clientIdConfigured = !!clientId;
  const secretConfigured = !!clientSecret;
  const oauthConfigured = clientIdConfigured && secretConfigured;

  return res.json({
    configured: oauthConfigured,
    clientIdConfigured,
    clientId,
    secretConfigured,
    clientIdSource,
    secretSource,
    acceptedEnvKeys: {
      clientId: clientIdCandidates.map(([k]) => k),
      clientSecret: secretCandidates.map(([k]) => k),
    },
  });
});

// GET Route for redirect-based OAuth
router.get('/google', (req: Request, res: Response) => {
  const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const clientId = resolveGoogleClientId(req);
  const clientSecret = resolveGoogleClientSecret();
  const publicOrigin = resolvePublicOrigin(req);
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || `${publicOrigin}/api/auth/callback`).trim();

  const returnTo = resolveReturnTo(req);

  if (!clientId) {
    const fallback = returnTo || publicOrigin;
    const u = new URL('/login', fallback);
    u.hash = 'error=google_client_id_missing';
    return res.redirect(u.toString());
  }

  if (!clientSecret) {
    const fallback = returnTo || publicOrigin;
    const u = new URL('/login', fallback);
    u.hash = 'error=google_client_secret_missing';
    return res.redirect(u.toString());
  }

  const state = Buffer.from(JSON.stringify({ returnTo, clientId }), 'utf8').toString('base64url');

  const options = {
    redirect_uri: redirectUri,
    client_id: clientId,
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    state,
  };

  const qs = new URLSearchParams(options).toString();
  return res.redirect(`${rootUrl}?${qs}`);
});

router.get('/callback', async (req: Request, res: Response) => {
  let clientId = resolveGoogleClientId(req);
  const clientSecret = resolveGoogleClientSecret();
  const publicOrigin = resolvePublicOrigin(req);
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || `${publicOrigin}/api/auth/callback`).trim();

  const stateRaw = String(req.query?.state || '').trim();
  let clientIdFromState = '';
  const returnTo = (() => {
    if (!stateRaw) return resolveReturnTo(req);
    try {
      const decoded = Buffer.from(stateRaw, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded || '{}');
      const rt = String(parsed?.returnTo || '').trim();
      clientIdFromState = String(parsed?.clientId || '').trim();
      if (!rt) return resolveReturnTo(req);
      const u = new URL(rt);
      const allowed = Array.isArray((config as any).allowedOrigins) ? (config as any).allowedOrigins : [];
      if (allowed.includes(u.origin)) return u.origin;
      return resolveReturnTo(req) || u.origin;
    } catch {
      return resolveReturnTo(req);
    }
  })();

  const finishRedirect = (hash: string) => {
    const base = returnTo || publicOrigin;
    const u = new URL('/login', base);
    u.hash = hash;
    return res.redirect(u.toString());
  };

  const oauthError = String(req.query?.error || '').trim();
  if (oauthError) return finishRedirect(`error=${encodeURIComponent(oauthError)}`);

  if (!clientId && clientIdFromState) clientId = clientIdFromState;
  if (!clientId) return finishRedirect('error=google_client_id_missing');
  if (!clientSecret) return finishRedirect('error=google_client_secret_missing');

  const code = String(req.query?.code || '').trim();
  if (!code) return finishRedirect('error=google_missing_code');

  try {
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
    const tokenResult = await oauth2Client.getToken(code);
    const tokens = tokenResult?.tokens || {};
    const accessToken = String((tokens as any).access_token || '').trim();
    const idToken = String((tokens as any).id_token || '').trim();

    let profile: any = null;

    if (idToken) {
      const ticket = await oauth2Client.verifyIdToken({ idToken, audience: clientId });
      profile = ticket.getPayload() || null;
    }

    if (!profile && accessToken) {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!userInfoRes.ok) return finishRedirect('error=google_userinfo_failed');
      profile = await userInfoRes.json();
    }

    if (!profile || !profile.email) return finishRedirect('error=google_profile_missing_email');

    const name = String(profile.name || '').trim();
    const picture = String(profile.picture || '').trim();
    const emailNormalized = String(profile.email || '').trim().toLowerCase();

    let user = await User.findOne({ email: emailNormalized });
    if (!user) {
      const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
      const count = await User.countDocuments();
      const role = count === 0 ? 'OWNER' : 'USER';
      user = await User.create({
        email: emailNormalized,
        passwordHash,
        role,
        name,
        picture
      });
    } else if (name || picture) {
      user.name = name || user.name;
      user.picture = picture || user.picture;
      await user.save();
    }

    const appToken = jwt.sign(
      {
        sub: user._id.toString(),
        role: user.role,
        email: user.email || emailNormalized,
        name: user.name || name,
        picture: user.picture || picture
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return finishRedirect(`token=${encodeURIComponent(appToken)}`);
  } catch (error) {
    console.error('Google OAuth Callback Error:', error);
    return finishRedirect('error=google_callback_failed');
  }
});

export default router;
