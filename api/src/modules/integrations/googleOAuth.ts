/* ============================================================
   GOOGLE OAUTH 2.0 — connect a user's Google account the standard,
   globally-used way ("Sign in with Google"). Zero install, scalable to
   thousands of users. The user consents ONCE (passing their own normal
   verification/2FA), and Joe then acts in their account through official
   Google APIs using a refresh token — no passwords stored, nothing bypassed.

   Setup (one time, in Google Cloud Console):
     1) Create an OAuth 2.0 Client ID (type: Web application).
     2) Authorized redirect URI: <your-joe-url>/api/oauth/google/callback
        (local dev default: http://localhost:5002/api/oauth/google/callback)
     3) Put the values in the environment:
        GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (optional)
   ============================================================ */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TOKEN_DIR = process.env.INTEGRATIONS_DIR
  || path.join(process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', 'integrations', 'google');

/** Default OAuth scopes — read/send mail, read calendar & drive metadata, identity.
 *  Override with GOOGLE_OAUTH_SCOPES (space-separated). */
const DEFAULT_SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

// Reuse the same client-id/secret env names the login flow (routes/auth.ts) uses,
// so a single Google Cloud OAuth client serves BOTH sign-in and account access.
function clientId() {
  return String(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
    || process.env.VITE_GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    || process.env.REACT_APP_GOOGLE_CLIENT_ID || '').trim();
}
function clientSecret() {
  return String(process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET
    || process.env.GOOGLE_OAUTH_SECRET || process.env.GOOGLE_SECRET || '').trim();
}
export function isGoogleOAuthConfigured(): boolean { return !!(clientId() && clientSecret()); }
function redirectUri() {
  return String(process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 5002}/api/oauth/google/callback`).trim();
}
function scopes() {
  const env = String(process.env.GOOGLE_OAUTH_SCOPES || '').trim();
  return env ? env.split(/\s+/) : DEFAULT_SCOPES;
}

// ---- CSRF-safe state (carries the userId through the redirect) ----
function stateSecret() { return process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'joe-oauth-state'; }
export function signState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: Date.now(), n: crypto.randomBytes(8).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyState(state: string): { userId: string } | null {
  try {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return null;
    const expect = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!obj?.u || Date.now() - Number(obj.t || 0) > 15 * 60 * 1000) return null; // 15-min window
    return { userId: String(obj.u) };
  } catch { return null; }
}

// ---- Encrypted per-user token storage (AES-256-GCM, no plaintext at rest) ----
function tokenKey(userId: string): Buffer {
  const master = process.env.INTEGRATIONS_SECRET || process.env.JWT_SECRET || 'joe-integrations-secret';
  return crypto.createHash('sha256').update(`${master}::google::${userId}`).digest();
}
function tokenFile(userId: string): string {
  const h = crypto.createHash('sha256').update(String(userId || 'default')).digest('hex').slice(0, 40);
  return path.join(TOKEN_DIR, `${h}.enc`);
}
type TokenRecord = { refresh_token?: string; access_token?: string; expiry?: number; scope?: string; email?: string; name?: string; picture?: string };

const PRIMARY_KEY = '__primary__'; // last-connected mirror, used only as a local fallback
function writeEnc(userId: string, rec: TokenRecord) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(userId), iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(rec), 'utf-8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(tokenFile(userId), Buffer.concat([iv, tag, enc]));
}
function saveTokens(userId: string, rec: TokenRecord) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  writeEnc(userId, rec);
  if (userId !== PRIMARY_KEY) writeEnc(PRIMARY_KEY, rec); // mirror for the local single-user case
}
function loadTokens(userId: string): TokenRecord | null {
  try {
    const f = tokenFile(userId);
    if (!fs.existsSync(f)) return null;
    const blob = fs.readFileSync(f);
    if (blob.length < 28) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(userId), blob.subarray(0, 12));
    decipher.setAuthTag(blob.subarray(12, 28));
    const dec = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
    return JSON.parse(dec.toString('utf-8'));
  } catch { return null; }
}

/** The connected account's identity as last stored (email, name, photo URL). */
export function getConnectedProfile(userId: string): { email?: string; name?: string; picture?: string } | null {
  const rec = loadTokens(userId) || loadTokens(PRIMARY_KEY);
  if (!rec) return null;
  return { email: rec.email, name: rec.name, picture: rec.picture };
}

export function isConnected(userId: string): boolean { return !!(loadTokens(userId)?.refresh_token || loadTokens(PRIMARY_KEY)?.refresh_token); }
export function getConnectedEmail(userId: string): string | undefined { return loadTokens(userId)?.email || loadTokens(PRIMARY_KEY)?.email; }
/**
 * Forget the user's Google tokens.
 *
 * This returned `{ ok: true }` unconditionally, with both unlink calls wrapped
 * in `catch { /* ignore *​/ }`. If a file was locked or the disk was read-only,
 * the refresh token stayed on disk and the user was told their Google account
 * had been disconnected. That is the one claim in this module that must never be
 * made on faith, so the result is now verified by re-reading the filesystem.
 */
export function disconnect(userId: string): { ok: boolean; error?: string; remaining?: string[] } {
  const errors: string[] = [];
  const remaining: string[] = [];
  for (const key of [userId, PRIMARY_KEY]) {
    const f = tokenFile(key);
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e: any) {
      errors.push(`${f}: ${e?.message || e}`);
    }
    // Trust the filesystem, not the absence of a thrown error.
    try { if (fs.existsSync(f)) remaining.push(f); } catch { remaining.push(f); }
  }
  if (remaining.length) {
    console.error(`[GoogleOAuth] disconnect FAILED, tokens still on disk: ${remaining.join(', ')}`);
    return {
      ok: false,
      error: errors.join('; ') || 'the token file still exists after deletion',
      remaining,
    };
  }
  return { ok: true };
}

/** Build the Google consent URL the user is redirected to. */
export function getAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: scopes().join(' '),
    access_type: 'offline',     // needed to receive a refresh_token
    include_granted_scopes: 'true',
    prompt: 'consent',          // ensure a refresh_token is returned
    state: signState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange the authorization code for tokens and persist them (encrypted). */
export async function handleCallback(code: string, userId: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId(), client_secret: clientSecret(),
        redirect_uri: redirectUri(), grant_type: 'authorization_code',
      }).toString(),
    });
    const data: any = await res.json();
    if (!res.ok || !data?.access_token) return { ok: false, error: data?.error_description || data?.error || 'token_exchange_failed' };
    const existing = loadTokens(userId) || {};
    const rec: TokenRecord = {
      refresh_token: data.refresh_token || existing.refresh_token, // Google omits it on re-consent sometimes
      access_token: data.access_token,
      expiry: Date.now() + (Number(data.expires_in || 3600) * 1000),
      scope: data.scope,
    };
    // Fetch the account email so the UI can show which account is connected.
    try {
      const ui = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${data.access_token}` } });
      const uinfo: any = await ui.json();
      // Keep the whole identity, not just the address: the display name and the
      // profile photo were fetched here and then thrown away, which is why the
      // header could never show the user's real Google picture.
      if (uinfo?.email) rec.email = uinfo.email;
      if (uinfo?.name) rec.name = uinfo.name;
      if (uinfo?.picture) rec.picture = uinfo.picture;
    } catch { /* non-fatal */ }
    saveTokens(userId, rec);
    return { ok: true, email: rec.email };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'callback_failed' };
  }
}

/** Exchange an auth code for tokens WITHOUT storing (used by unified login). */
export async function exchangeCodeForTokens(code: string): Promise<(TokenRecord) | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirectUri(), grant_type: 'authorization_code' }).toString(),
    });
    const data: any = await res.json();
    if (!res.ok || !data?.access_token) return null;
    return { refresh_token: data.refresh_token, access_token: data.access_token, expiry: Date.now() + (Number(data.expires_in || 3600) * 1000), scope: data.scope };
  } catch { return null; }
}

/** Fetch the Google profile for an access token (email/name/picture/sub). */
export async function fetchUserInfo(accessToken: string): Promise<{ email?: string; name?: string; picture?: string; sub?: string } | null> {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) return null;
    return await r.json() as any;
  } catch { return null; }
}

/** Persist tokens for a specific user id, preserving an existing refresh_token
 *  if Google omitted it on this exchange. */
export function saveTokensForUser(userId: string, rec: { refresh_token?: string; access_token?: string; expiry?: number; scope?: string; email?: string }) {
  const existing = loadTokens(userId) || {};
  saveTokens(userId, { ...existing, ...rec, refresh_token: rec.refresh_token || existing.refresh_token });
}

/** Return a valid access token for the user, refreshing it when expired. */
export async function getAccessToken(userId: string): Promise<string | null> {
  let rec = loadTokens(userId);
  // Local single-user convenience: if nothing under this id, fall back to the
  // last-connected account (keeps chat-tool context and the OAuth route in sync
  // even when their resolved user ids differ). Harmless for real multi-user.
  if (!rec?.refresh_token && userId !== PRIMARY_KEY) { rec = loadTokens(PRIMARY_KEY); if (rec?.refresh_token) userId = PRIMARY_KEY; }
  if (!rec) return null;
  if (rec.access_token && rec.expiry && rec.expiry - Date.now() > 60_000) return rec.access_token;
  if (!rec.refresh_token) return rec.access_token || null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId(), client_secret: clientSecret(),
        refresh_token: rec.refresh_token, grant_type: 'refresh_token',
      }).toString(),
    });
    const data: any = await res.json();
    if (!res.ok || !data?.access_token) {
      try { console.warn(`[GoogleOAuth] refresh failed (${res.status}): ${data?.error || ''} ${data?.error_description || ''}`.trim()); } catch { }
      // invalid_grant = the refresh token was revoked/expired -> force reconnect.
      if (data?.error === 'invalid_grant') { try { clearTokensEverywhere(userId); } catch { } }
      return null;
    }
    rec.access_token = data.access_token;
    rec.expiry = Date.now() + (Number(data.expires_in || 3600) * 1000);
    if (data.refresh_token) rec.refresh_token = data.refresh_token;
    saveTokens(userId, rec);
    return rec.access_token || null;
  } catch (e: any) { try { console.warn(`[GoogleOAuth] refresh error: ${e?.message || e}`); } catch { } return null; }
}

/** Remove tokens for a user AND the primary mirror (used on invalid_grant). */
function clearTokensEverywhere(userId: string) {
  try { const f = tokenFile(userId); if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  try { const f = tokenFile(PRIMARY_KEY); if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
}

/**
 * Re-read the identity from Google and persist it.
 *
 * Accounts connected before name/picture were stored have only an email on
 * disk, so a one-time refresh is what actually gets the user's photo. Called
 * lazily by the profile route — never on a hot path.
 */
export async function refreshProfile(userId: string): Promise<{ email?: string; name?: string; picture?: string } | null> {
  const accessToken = await getAccessToken(userId);
  if (!accessToken) return null;
  const info = await fetchUserInfo(accessToken);
  if (!info) return null;
  const existing = loadTokens(userId) || loadTokens(PRIMARY_KEY) || {};
  const rec: TokenRecord = {
    ...existing,
    email: info.email || existing.email,
    name: info.name || existing.name,
    picture: info.picture || existing.picture,
  };
  saveTokens(userId, rec);
  return { email: rec.email, name: rec.name, picture: rec.picture };
}

/* ---- Avatar bytes, cached on disk ------------------------------------------
   Google serves the photo from lh3.googleusercontent.com, so an <img> pointing
   straight at it shows nothing the moment Joe runs without internet — which is
   how it normally runs. Fetch it once, keep the bytes next to the tokens, and
   serve them from localhost afterwards. */

function avatarFile(userId: string): string {
  const h = crypto.createHash('sha256').update(String(userId || 'default')).digest('hex').slice(0, 40);
  return path.join(TOKEN_DIR, `${h}.avatar.json`);
}

export function readCachedAvatar(userId: string): { contentType: string; buffer: Buffer } | null {
  for (const id of [userId, PRIMARY_KEY]) {
    try {
      const f = avatarFile(id);
      if (!fs.existsSync(f)) continue;
      const rec = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (rec?.b64) return { contentType: String(rec.contentType || 'image/jpeg'), buffer: Buffer.from(rec.b64, 'base64') };
    } catch { /* try the next one */ }
  }
  return null;
}

/** Download the photo and cache it. Returns null when there is no photo or no network. */
export async function cacheAvatar(userId: string, url: string): Promise<{ contentType: string; buffer: Buffer } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const contentType = String(r.headers.get('content-type') || 'image/jpeg');
    if (!contentType.startsWith('image/')) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    if (!buffer.length || buffer.length > 2_000_000) return null;
    fs.mkdirSync(TOKEN_DIR, { recursive: true });
    const rec = JSON.stringify({ contentType, url, b64: buffer.toString('base64'), at: Date.now() });
    fs.writeFileSync(avatarFile(userId), rec);
    if (userId !== PRIMARY_KEY) fs.writeFileSync(avatarFile(PRIMARY_KEY), rec);
    return { contentType, buffer };
  } catch { return null; }
}
