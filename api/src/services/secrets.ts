type PendingToolContext = {
  runId: string;
  name: string;
  input: any;
};

type SecretEntry = {
  value: string;
  expiresAt?: number;
  enc?: {
    alg: 'aes-256-gcm';
    ivB64: string;
    tagB64: string;
  };
};

const sessionSecrets = new Map<string, Map<string, SecretEntry>>();
const pendingToolBySession = new Map<string, PendingToolContext>();

function nowMs() {
  return Date.now();
}

function getMasterKeyBytes(): Buffer | null {
  const raw = String(process.env.SECRETS_MASTER_KEY || process.env.JWT_SECRET || '').trim();
  if (!raw) return null;
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encrypt(value: string) {
  const key = getMasterKeyBytes();
  if (!key) return null;
  const crypto = require('crypto') as typeof import('crypto');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const c1 = cipher.update(value, 'utf8');
  const c2 = cipher.final();
  const tag = cipher.getAuthTag();
  const buf = Buffer.concat([c1, c2]);
  return { value: buf.toString('base64'), ivB64: iv.toString('base64'), tagB64: tag.toString('base64') };
}

function decrypt(entry: SecretEntry): string | null {
  if (!entry.enc) return entry.value;
  const key = getMasterKeyBytes();
  if (!key) return null;
  const crypto = require('crypto') as typeof import('crypto');
  const iv = Buffer.from(entry.enc.ivB64, 'base64');
  const tag = Buffer.from(entry.enc.tagB64, 'base64');
  const decipher = crypto.createDecipheriv(entry.enc.alg, key, iv);
  decipher.setAuthTag(tag);
  const c1 = decipher.update(Buffer.from(entry.value, 'base64'));
  const c2 = decipher.final();
  return Buffer.concat([c1, c2]).toString('utf8');
}

function purgeExpired(bucket: Map<string, SecretEntry>) {
  const now = nowMs();
  for (const [k, v] of bucket.entries()) {
    if (typeof v.expiresAt === 'number' && v.expiresAt > 0 && v.expiresAt <= now) bucket.delete(k);
  }
}

export function setSessionSecret(sessionId: string, key: string, value: string) {
  const sid = String(sessionId || '').trim();
  const k = String(key || '').trim();
  if (!sid || !k) return;
  let bucket = sessionSecrets.get(sid);
  if (!bucket) {
    bucket = new Map<string, SecretEntry>();
    sessionSecrets.set(sid, bucket);
  }
  purgeExpired(bucket);
  bucket.set(k, { value });
}

export function getSessionSecret(sessionId: string, key: string): string | null {
  const sid = String(sessionId || '').trim();
  const k = String(key || '').trim();
  if (!sid || !k) return null;
  const bucket = sessionSecrets.get(sid);
  if (!bucket) return null;
  purgeExpired(bucket);
  const entry = bucket.get(k);
  if (!entry) return null;
  if (typeof entry.expiresAt === 'number' && entry.expiresAt > 0 && entry.expiresAt <= nowMs()) {
    bucket.delete(k);
    return null;
  }
  const plain = decrypt(entry);
  return plain ?? null;
}

export function clearSessionSecrets(sessionId: string) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  sessionSecrets.delete(sid);
}

export function setSessionSecretEncrypted(sessionId: string, key: string, value: string, ttlSeconds?: number) {
  const sid = String(sessionId || '').trim();
  const k = String(key || '').trim();
  if (!sid || !k) return null;
  let bucket = sessionSecrets.get(sid);
  if (!bucket) {
    bucket = new Map<string, any>();
    sessionSecrets.set(sid, bucket);
  }
  purgeExpired(bucket as any);

  const ttl = typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : undefined;
  const expiresAt = ttl ? nowMs() + ttl * 1000 : undefined;

  const enc = encrypt(String(value ?? ''));
  if (enc) {
    bucket.set(k, { value: enc.value, expiresAt, enc: { alg: 'aes-256-gcm', ivB64: enc.ivB64, tagB64: enc.tagB64 } });
  } else {
    bucket.set(k, { value: String(value ?? ''), expiresAt });
  }
  return expiresAt ?? null;
}

export function setPendingTool(sessionId: string, ctx: PendingToolContext) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  pendingToolBySession.set(sid, ctx);
}

export function popPendingTool(sessionId: string): PendingToolContext | null {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const ctx = pendingToolBySession.get(sid) || null;
  pendingToolBySession.delete(sid);
  return ctx;
}
