/**
 * Redact credential-bearing values from a URL before it reaches any
 * observability surface (console, status detail, logs, persisted evidence).
 *
 * Classification is by credential meaning, not by one parameter name: any
 * query/fragment parameter whose name contains a credential hint (any case,
 * any affix) has its value replaced, any JWT-shaped value is replaced
 * wherever it appears, and URL userinfo (username and password) is replaced:
 * tokens are routinely carried as the username in basic-auth URLs
 * (https://TOKEN@host), so the username position must not be treated as a
 * safe identifier. Non-credential values such as sessionId pass through
 * unchanged so logs stay diagnosable.
 *
 * Percent-encoded credentials are classified by their single-decoded form,
 * matching one server-side decode: a JWT with encoded characters is still a
 * JWT once decoded, so decoded query/fragment values are checked as well as
 * names. Decoding is bounded to one pass per value; double-encoded text is
 * left alone and the URL structure itself is never decoded wholesale.
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

// Non-global twin for testing single decoded values without shared lastIndex.
const JWT_VALUE_TEST = new RegExp(JWT_PATTERN.source);

function safeDecodeComponent(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

// One `name=value` pair inside a query-like string (query or fragment body).
const PAIR_PATTERN = /([^?&#;=\s][^?&#;=]*)(=)([^&#;]*)/g;

function redactPairs(body: string): string {
    PAIR_PATTERN.lastIndex = 0;
    return body.replace(PAIR_PATTERN, (match, name: string, eq: string, value: string) => {
        if (isCredentialName(name) || isCredentialName(safeDecodeComponent(name))) {
            return `${name}${eq}${REDACTED_URL_VALUE}`;
        }
        if (JWT_VALUE_TEST.test(safeDecodeComponent(value))) {
            return `${name}${eq}${REDACTED_URL_VALUE}`;
        }
        return match;
    });
}

function redactJwtShaped(text: string): string {
    JWT_PATTERN.lastIndex = 0;
    return text.replace(JWT_PATTERN, REDACTED_URL_VALUE);
}

// `//userinfo@` in input the URL parser rejects (protocol-relative or
// malformed). Requires the `//` prefix so bare emails never match.
const USERINFO_FALLBACK_PATTERN = /\/\/([^\s/?#]+)@/g;

function redactUserinfoFallback(text: string): string {
    USERINFO_FALLBACK_PATTERN.lastIndex = 0;
    return text.replace(USERINFO_FALLBACK_PATTERN, `//${REDACTED_URL_VALUE}@`);
}

export function redactCredentialsFromUrl(raw: string): string {
    if (typeof raw !== 'string') return REDACTED_URL_VALUE;
    if (raw.length === 0) return raw;
    let out: string;
    try {
        const parsed = new URL(raw);
        const names = Array.from(parsed.searchParams.keys());
        for (const name of names) {
            if (isCredentialName(name)) {
                parsed.searchParams.set(name, REDACTED_URL_VALUE);
                continue;
            }
            // searchParams values arrive single-decoded, so an encoded JWT in
            // any parameter is caught here even when the name is unknown.
            const values = parsed.searchParams.getAll(name);
            if (values.some((entry) => JWT_VALUE_TEST.test(entry))) {
                parsed.searchParams.set(name, REDACTED_URL_VALUE);
            }
        }
        if (parsed.hash && parsed.hash.includes('=')) {
            parsed.hash = redactPairs(parsed.hash);
        }
        if (parsed.username || parsed.password) {
            // Both positions: tokens are routinely carried as the username.
            parsed.username = REDACTED_URL_VALUE;
            parsed.password = parsed.password ? REDACTED_URL_VALUE : '';
        }
        out = parsed.toString();
        // URL serialization percent-encodes the marker; restore its readable form.
        out = out.split(encodeURIComponent(REDACTED_URL_VALUE)).join(REDACTED_URL_VALUE);
    } catch {
        out = redactUserinfoFallback(redactPairs(raw));
    }
    return redactJwtShaped(out);
}
