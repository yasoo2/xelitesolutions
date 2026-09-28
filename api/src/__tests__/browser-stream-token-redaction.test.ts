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
 * spellings, bearer/jwt markers, JWT-shaped values wherever they appear, and
 * credentials carried in the hash fragment. Non-credential values such as
 * sessionId pass through so logs stay diagnosable.
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

    it('redacts credentials carried in the hash fragment', () => {
        const out = redactCredentialsFromUrl(`https://joe.example/app#token=${JWT}&view=main`);
        expect(out).not.toContain(JWT);
        expect(out).toContain('view=main');
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
});
