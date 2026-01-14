import { getSessionSecret, getUserSecret } from '../services/secrets';

const SECRET_TOKEN_RE = /\{\{\s*SECRET\s*:\s*([A-Z0-9_]+)\s*\}\}/g;

export async function resolveSecretsInText(userId: string, sessionId: string, text: string) {
  const uid = String(userId || '').trim();
  const sid = String(sessionId || '').trim();
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
    const sessionVal = sid ? getSessionSecret(sid, k) : null;
    if (typeof sessionVal === 'string' && sessionVal.trim()) continue;
    const v = await getUserSecret(uid, 'internal', k);
    if (!(typeof v === 'string' && v.trim())) stillMissing.push(k);
  }

  return { ok: stillMissing.length === 0, text: raw, missing: stillMissing };
}

function stripWrappingQuotes(s: string) {
  const t = String(s || '').trim();
  if (!t) return '';
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
  if (t.startsWith('“') && t.endsWith('”')) return t.slice(1, -1).trim();
  return t;
}

function cleanTrailingPunctuation(s: string) {
  return String(s || '').replace(/[)\].,;:!?،؛]+$/g, '').trim();
}

function isLikelyPasswordToken(token: string) {
  const t = String(token || '').trim();
  if (!t) return false;
  if (t.length < 4) return false;
  if (/@/.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^[)\].,;:!?،؛]+$/.test(t)) return false;
  return true;
}

export function rewriteInlineLoginCredentialsToSecrets(rawText: string) {
  const raw = String(rawText || '');
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = cleanTrailingPunctuation(String(emailMatch?.[0] || '').trim());

  const pwByKeyword =
    raw.match(/(?:\bpassword\b|\bpass\b|\bpasscode\b|كلمة\s*المرور|باسورد|الباسورد)\s*[:=：]?\s*("[^"]+"|'[^']+'|“[^”]+”|[^\s"'“”<>]{3,128})/i)?.[1] ||
    '';
  let password = cleanTrailingPunctuation(stripWrappingQuotes(pwByKeyword));
  if (password && !isLikelyPasswordToken(password)) password = '';

  if (!password && emailMatch) {
    const idx = typeof emailMatch.index === 'number' ? emailMatch.index : raw.indexOf(email);
    const after = idx >= 0 ? raw.slice(idx + email.length) : '';
    const nextToken = after.match(/^\s*[:=,-]?\s*("[^"]+"|'[^']+'|“[^”]+”|[^\s"'“”<>]{3,128})/)?.[1] || '';
    const candidate = cleanTrailingPunctuation(stripWrappingQuotes(nextToken));
    if (isLikelyPasswordToken(candidate)) password = candidate;
  }

  if (!email && !password) return { ok: false as const, email: '', password: '', sanitizedText: rawText };

  let sanitized = raw;
  if (email) sanitized = sanitized.split(email).join('{{SECRET:JOE_LOGIN_EMAIL}}');
  if (password) sanitized = sanitized.split(password).join('{{SECRET:JOE_LOGIN_PASSWORD}}');
  sanitized = sanitized.trim();

  const hasAnySecretToken = /\{\{\s*SECRET\s*:\s*JOE_LOGIN_(?:EMAIL|PASSWORD)\s*\}\}/i.test(sanitized);
  const looksLikeLogin = /(login|log\s*in|sign\s*in|signin|تسجيل\s*الدخول|سجل\s*دخول|سجّل\s*دخول|ادخل|أدخل|املأ|عبّي|عبئ|ايميل|إيميل|البريد|password|باسورد|كلمة\s*المرور)/i.test(
    sanitized,
  );
  if (hasAnySecretToken && looksLikeLogin) {
    const hint = `استخدم البريد {{SECRET:JOE_LOGIN_EMAIL}} وكلمة المرور {{SECRET:JOE_LOGIN_PASSWORD}}.`;
    if (!sanitized.includes('{{SECRET:JOE_LOGIN_EMAIL}}') || !sanitized.includes('{{SECRET:JOE_LOGIN_PASSWORD}}')) {
      sanitized = `${sanitized}\n${hint}`;
    }
  }

  return { ok: true as const, email, password, sanitizedText: sanitized };
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
