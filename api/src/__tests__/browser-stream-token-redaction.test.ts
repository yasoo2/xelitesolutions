/**
 * BrowserStream must never log a credential-bearing WebSocket URL.
 *
 * Real evidence (C07): a Guest Joe run's raw UAT log contained the guest JWT
 * because ModernBrowserStream logged its full wsUrl (sessionId + token query)
 * and the harness persisted console output verbatim. The product-side repair is
 * a general credential redactor for URLs used at every observability surface.
 *
 * The redactor classifies by credential meaning, not by one parameter name:
 * token/auth/secret/password-family names (any case, any affix), API key
 * spellings, bearer/jwt markers, JWT-shaped values wherever they appear,
 * credentials carried in the hash fragment, and URL userinfo
 * (username/password are both redacted: tokens are routinely carried as the
 * username in basic-auth URLs, so keeping the username would leak them).
 * Non-credential values such as sessionId pass through so logs stay
 * diagnosable.
 *
 * Percent-encoded credentials are classified by their single-decoded form:
 * decoding the redacted output must never recover the original credential.
 */
import fs from 'fs';
import path from 'path';
import { redactCredentialsFromUrl } from '../../../web/src/utils/redactUrl';

const COMPONENT = path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'ModernBrowserStream.tsx');

const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJndWVzdCJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

describe('redactCredentialsFromUrl', () => {
    it('redacts the token param of a BrowserStream ws URL but keeps sessionId', () => {
        const out = redactCredentialsFromUrl(
            `ws://127.0.0.1:5000/ws/browser?sessionId=panel-browser&token=${JWT}`,
        );
        expect(out).not.toContain(JWT);
        expect(out).toContain('token=[redacted]');
        expect(out).toContain('sessionId=panel-browser');
        expect(out).toContain('/ws/browser');
    });

    it('redacts credential names regardless of case and affixes', () => {
        for (const name of ['Access_Token', 'AUTHTOKEN', 'api_key', 'APIKEY', 'client_secret', 'Password', 'PASSWD']) {
            const out = redactCredentialsFromUrl(`https://joe.example/ws?sessionId=s1&${name}=supersecret`);
            expect(out).not.toContain('supersecret');
            expect(out).toContain('sessionId=s1');
        }
    });

    it('redacts a JWT carried by an unknown parameter name', () => {
        // `next` is not a credential name; the JWT shape itself must trigger redaction.
        const out = redactCredentialsFromUrl(`https://joe.example/login?next=${JWT}&lang=en`);
        expect(out).not.toContain(JWT);
        expect(out).toContain('lang=en');
    });

    it('redacts a percent-encoded JWT carried by an unknown query parameter', () => {
        // Encoded variants are built programmatically so the source holds no
        // additional credential-shaped literals. `%65` is `e`, the JWT head.
        const firstCharEncoded = '%65' + JWT.slice(1);
        const out = redactCredentialsFromUrl(`https://joe.example/login?opaque=${firstCharEncoded}&lang=en`);
        expect(decodeURIComponent(out)).not.toContain(JWT);
        expect(out).toContain('lang=en');
        const fullyEncoded = JWT.split('').map((ch) => '%' + ch.charCodeAt(0).toString(16)).join('');
        const outFull = redactCredentialsFromUrl(`https://joe.example/login?opaque=${fullyEncoded}`);
        expect(decodeURIComponent(outFull)).not.toContain(JWT);
    });

    it('redacts percent-encoded credentials in fragments and relative URLs', () => {
        const encoded = '%65' + JWT.slice(1);
        const frag = redactCredentialsFromUrl(`https://joe.example/app#opaque=${encoded}&view=main`);
        expect(decodeURIComponent(frag)).not.toContain(JWT);
        expect(frag).toContain('view=main');
        const rel = redactCredentialsFromUrl(`/ws/browser?sessionId=s1&opaque=${encoded}`);
        expect(decodeURIComponent(rel)).not.toContain(JWT);
        expect(rel).toContain('sessionId=s1');
        // An encoded credential name in an unparseable URL is still a name hit.
        const relName = redactCredentialsFromUrl('/ws/browser?%74oken=supersecret');
        expect(relName).not.toContain('supersecret');
    });

    it('bounds decoding to a single pass and stays idempotent', () => {
        // Double-encoded text is inert after one server-side decode, so the
        // redactor must neither decode it twice nor mangle the transport URL.
        const doubleEncoded = JWT.split('')
            .map((ch) => '%' + ch.charCodeAt(0).toString(16))
            .join('')
            .split('')
            .map((ch) => (ch === '%' ? '%25' : ch))
            .join('');
        const once = redactCredentialsFromUrl(`https://joe.example/?sessionId=s1&blob=${doubleEncoded}`);
        expect(once).toContain('sessionId=s1');
        expect(redactCredentialsFromUrl(once)).toBe(once);
        const redacted = redactCredentialsFromUrl('wss://joe.example/stream?token=topsecret&sessionId=public');
        expect(redactCredentialsFromUrl(redacted)).toBe(redacted);
    });

    it('redacts credentials carried in the hash fragment', () => {
        const out = redactCredentialsFromUrl(`https://joe.example/app#token=${JWT}&view=main`);
        expect(out).not.toContain(JWT);
        expect(out).toContain('view=main');
    });

    it('redacts URL userinfo credentials but keeps host, path and sessionId', () => {
        const out = redactCredentialsFromUrl(
            'wss://synthetic-user:synthetic-password@127.0.0.1:5000/ws?sessionId=synthetic-session',
        );
        expect(out).not.toContain('synthetic-user');
        expect(out).not.toContain('synthetic-password');
        expect(out).toContain('127.0.0.1:5000/ws');
        expect(out).toContain('sessionId=synthetic-session');
        // The marker preserves the fact that userinfo was present.
        expect(out).toContain('[redacted]');
    });

    it('redacts a token carried as the URL username', () => {
        // Token-as-username is a real basic-auth pattern (https://TOKEN@host),
        // so the username position must not be treated as a safe identifier.
        const out = redactCredentialsFromUrl(`https://oauth2:${JWT}@joe.example/api`);
        expect(out).not.toContain(JWT);
        expect(out).not.toContain('oauth2');
        expect(out).toContain('joe.example/api');
    });

    it('redacts userinfo in unparseable URLs via the pattern fallback', () => {
        const out = redactCredentialsFromUrl('//deploy:s3cr3t@[2001:db8::1/oops?token=x');
        expect(out).not.toContain('s3cr3t');
        expect(out).not.toContain('deploy:s3cr3t@');
        expect(out).not.toContain('token=x');
    });

    it('does not mistake a bare email address for URL userinfo', () => {
        const text = 'contact ops@example.com for access';
        expect(redactCredentialsFromUrl(text)).toBe(text);
    });

    it('leaves URLs without credentials byte-for-byte identical', () => {
        const clean = 'ws://127.0.0.1:5000/ws/browser?sessionId=panel-browser&attempt=2';
        expect(redactCredentialsFromUrl(clean)).toBe(clean);
    });

    it('handles relative and malformed URLs without throwing or leaking', () => {
        const out = redactCredentialsFromUrl(`/ws/browser?sessionId=s1&token=${JWT}`);
        expect(out).not.toContain(JWT);
        expect(out).toContain('sessionId=s1');
        expect(() => redactCredentialsFromUrl('nota url at all [[[token=xyz')).not.toThrow();
    });

    it('passes empty input through and fails closed on non-strings', () => {
        expect(redactCredentialsFromUrl('')).toBe('');
        expect(redactCredentialsFromUrl(undefined as any)).toBe('[redacted]');
        expect(redactCredentialsFromUrl(null as any)).toBe('[redacted]');
    });
});

describe('ModernBrowserStream observability surface', () => {
    it('logs a redacted URL, never the raw credential-bearing wsUrl', () => {
        const src = fs.readFileSync(COMPONENT, 'utf-8');
        expect(src).toContain('redactCredentialsFromUrl');
        expect(src).not.toContain("console.log('[BrowserStream] Connecting to:', wsUrl)");
    });

    it('keeps the WebSocket connected to the original URL', () => {
        // Redaction covers the observability surface only; the connection
        // itself must keep receiving the unmodified authenticated URL.
        const src = fs.readFileSync(COMPONENT, 'utf-8');
        expect(src).toContain('new WebSocket(wsUrl)');
    });
});
