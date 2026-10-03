import { getSessionSecret, getUserSecret } from '../services/secrets';

const SECRET_TOKEN_RE = /\{\{\s*SECRET\s*:\s*([A-Z0-9_]+)\s*\}\}/g;

const PUBLIC_TEST_DOMAINS = [
  'herokuapp.com',
  'saucedemo.com',
  'test.com',
  'example.com',
  'localhost',
  '127.0.0.1'
];

export async function resolveSecretsInText(
  userId: string,
  sessionId: string,
  text: string,
  options?: { mode?: 'browser_test' | 'browser_secure'; url?: string }
) {
  const uid = String(userId || '').trim();
  const sid = String(sessionId || '').trim();
  const raw = String(text || '');
  const mode = options?.mode || 'browser_test';
  const url = options?.url || '';

  if (!uid) return { ok: false as const, text: raw, missing: ['USER_ID_REQUIRED'] };

  const keys: string[] = [];
  raw.replace(SECRET_TOKEN_RE, (_full: string, keyRaw: string) => {
    const k = String(keyRaw || '').trim();
    if (k) keys.push(k);
    return _full;
  });

  const unique = Array.from(new Set(keys));
  const stillMissing: string[] = [];

  const isPublicTest = PUBLIC_TEST_DOMAINS.some(d => url.includes(d));

  for (const k of unique) {
    const sessionVal = sid ? getSessionSecret(sid, k) : null;
    if (typeof sessionVal === 'string' && sessionVal.trim()) continue;

    // Classification Logic
    const isUserProvided = k.startsWith('JOE_LOGIN_');
    const isPublic = isPublicTest || k.startsWith('TEST_');

    if (mode === 'browser_test') {
      if (isUserProvided || isPublic) continue;
    }

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
    raw.match(
      /(?:\bpassword\b|\bpass(?:code)?\b|كلمة\s*المرور|رمز\s*المرور|باسورد|باسوورد|الباسورد|الباسوورد)\s*(?:هو|هي|is)?\s*[:=：]?\s*("[^"]+"|'[^']+'|“[^”]+”|[^\s"'“”<>]{3,128})/i,
    )?.[1] ||
    '';
  let password = cleanTrailingPunctuation(stripWrappingQuotes(pwByKeyword));
  if (password && !isLikelyPasswordToken(password)) password = '';

  if (!password && emailMatch) {
    const idx = typeof emailMatch.index === 'number' ? emailMatch.index : raw.indexOf(email);
    const after = idx >= 0 ? raw.slice(idx + email.length) : '';
    const pwAfterKeyword =
      after.match(
        /(?:\bpassword\b|\bpass(?:code)?\b|كلمة\s*المرور|رمز\s*المرور|باسورد|باسوورد|الباسورد|الباسوورد)\s*(?:هو|هي|is)?\s*[:=：]?\s*("[^"]+"|'[^']+'|“[^”]+”|[^\s"'“”<>]{3,128})/i,
      )?.[1] || '';
    const candidate1 = cleanTrailingPunctuation(stripWrappingQuotes(pwAfterKeyword));
    if (isLikelyPasswordToken(candidate1)) {
      password = candidate1;
    } else {
      const nextToken = after.match(/^\s*[:=,-]?\s*("[^"]+"|'[^']+'|“[^”]+”|[^\s"'“”<>]{3,128})/)?.[1] || '';
      const candidate2 = cleanTrailingPunctuation(stripWrappingQuotes(nextToken));
      if (isLikelyPasswordToken(candidate2)) password = candidate2;
    }
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

// Single implementation lives in shared/utils/redaction: this re-export keeps
// the browser runner's existing `from './secrets'` import working while
// guaranteeing both entry points redact exactly the same credential shapes.
export { redactSecretsFromString } from '../../shared/utils/redaction';

