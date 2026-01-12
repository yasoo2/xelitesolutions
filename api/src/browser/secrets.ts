import { getUserSecret } from '../services/secrets';

const SECRET_TOKEN_RE = /\{\{\s*SECRET\s*:\s*([A-Z0-9_]+)\s*\}\}/g;

export async function resolveSecretsInText(userId: string, text: string) {
  const uid = String(userId || '').trim();
  const raw = String(text || '');
  if (!uid) return { ok: false as const, text: raw, missing: ['USER_ID_REQUIRED'] };

  const missing: string[] = [];
  const resolved = await raw.replaceAll(SECRET_TOKEN_RE, (full, keyRaw) => {
    const key = String(keyRaw || '').trim();
    if (!key) return full;
    missing.push(key);
    return full;
  });

  if (missing.length === 0) return { ok: true as const, text: raw, missing: [] as string[] };

  const unique = Array.from(new Set(missing));
  const map = new Map<string, string>();
  for (const k of unique) {
    const v = await getUserSecret(uid, 'internal', k);
    if (typeof v === 'string' && v.trim()) map.set(k, v);
  }
  const stillMissing: string[] = [];
  const finalText = raw.replaceAll(SECRET_TOKEN_RE, (full, keyRaw) => {
    const key = String(keyRaw || '').trim();
    const v = map.get(key);
    if (!v) {
      stillMissing.push(key);
      return full;
    }
    return v;
  });

  return { ok: stillMissing.length === 0, text: finalText, missing: Array.from(new Set(stillMissing)) };
}

export function redactSecretsFromString(s: string) {
  return String(s || '').replace(SECRET_TOKEN_RE, '{{SECRET:REDACTED}}');
}

