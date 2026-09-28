/**
 * Redact credential-bearing values from a URL before it reaches any
 * observability surface (console, status detail, logs, persisted evidence).
 *
 * Classification is by credential meaning, not by one parameter name: any
 * query/fragment parameter whose name contains a credential hint (any case,
 * any affix) has its value replaced, and any JWT-shaped value is replaced
 * wherever it appears. Non-credential values such as sessionId pass through
 * unchanged so logs stay diagnosable.
 *
 * Deliberate over-redaction: a name like `author` (contains `auth`) is
 * redacted too. In a log line a hidden non-secret is harmless; a leaked
 * secret is not. Fail closed everywhere: unparseable input still goes
 * through the pattern fallback, and non-string input yields [redacted].
 */
export const REDACTED_URL_VALUE = '[redacted]';

const CREDENTIAL_NAME_HINTS = [
    'token',
    'auth',
    'secret',
    'passwd',
    'password',
    'pwd',
    'apikey',
    'api_key',
    'api-key',
    'bearer',
    'jwt',
    'credential',
    'private_key',
    'client_secret',
    'access_key',
    'key',
];

function isCredentialName(name: string): boolean {
    const lower = String(name || '').toLowerCase();
    if (!lower) return false;
    return CREDENTIAL_NAME_HINTS.some((hint) => lower.includes(hint));
}

// A JWT header always starts with eyJ (base64url of {"alg"); three segments.
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

// One `name=value` pair inside a query-like string (query or fragment body).
const PAIR_PATTERN = /([^?&#;=\s][^?&#;=]*)(=)([^&#;]*)/g;

function redactPairs(body: string): string {
    PAIR_PATTERN.lastIndex = 0;
    return body.replace(PAIR_PATTERN, (match, name: string, eq: string) =>
        isCredentialName(name) ? `${name}${eq}${REDACTED_URL_VALUE}` : match,
    );
}

function redactJwtShaped(text: string): string {
    JWT_PATTERN.lastIndex = 0;
    return text.replace(JWT_PATTERN, REDACTED_URL_VALUE);
}

export function redactCredentialsFromUrl(raw: string): string {
    if (typeof raw !== 'string') return REDACTED_URL_VALUE;
    if (raw.length === 0) return raw;
    let out: string;
    try {
        const parsed = new URL(raw);
        const names = Array.from(parsed.searchParams.keys());
        for (const name of names) {
            if (isCredentialName(name)) parsed.searchParams.set(name, REDACTED_URL_VALUE);
        }
        if (parsed.hash && parsed.hash.includes('=')) {
            parsed.hash = redactPairs(parsed.hash);
        }
        out = parsed.toString();
        // searchParams percent-encodes the marker; restore its readable form.
        out = out.split(encodeURIComponent(REDACTED_URL_VALUE)).join(REDACTED_URL_VALUE);
    } catch {
        out = redactPairs(raw);
    }
    return redactJwtShaped(out);
}
