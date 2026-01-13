import { getUserSecret } from '../services/secrets';

const SECRET_TOKEN_RE = /\{\{\s*SECRET\s*:\s*([A-Z0-9_]+)\s*\}\}/g;

export async function resolveSecretsInText(userId: string, text: string) {
  const uid = String(userId || '').trim();
  const raw = String(text || '');
  if (!uid) return { ok: false as const, text: raw, missing: ['USER_ID_REQUIRED'] };

  const keys: string[] = [];
  raw.replace(SECRET_TOKEN_RE, (_full: string, keyRaw: string) => {
    const k = String(keyRaw || '').trim();
    if (k) keys.push(k);
    return _full;
  });

  const unique = Array.from(new Set(keys));
  const stillMissing: string[] = [];
  for (const k of unique) {
    const v = await getUserSecret(uid, 'internal', k);
    if (!(typeof v === 'string' && v.trim())) stillMissing.push(k);
  }

  return { ok: stillMissing.length === 0, text: raw, missing: stillMissing };
}

export function redactSecretsFromString(s: string) {
  let out = String(s || '');
  out = out.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]');
  out = out.replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, 'ghp_[REDACTED]');
  out = out.replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, 'github_pat_[REDACTED]');
  out = out.replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]');
  out = out.replace(/([?&]token=)[^&\s]+/gi, '$1[REDACTED]');
  out = out.replace(/([?&]password=)[^&\s]+/gi, '$1[REDACTED]');
  out = out.replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
  out = out.replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, 'x-worker-key:[REDACTED]');
  out = out.replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET|OPENAI_API_KEY)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, '$1=[REDACTED]');
  return out;
}
