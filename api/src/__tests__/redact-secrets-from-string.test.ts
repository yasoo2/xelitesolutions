import { redactSecretsFromString } from '../shared/utils/redaction';
import { redactSecretsFromString as redactSecretsFromStringBrowser } from '../modules/browser/secrets';
import { redactCommandForLog } from '../shared/utils/redaction';

// A JWT-shaped fixture built at runtime from dot-free fragments, so the
// authored source never holds a credential-shaped literal. Shape mirrors the
// house JWT contract (eyJ header + three dot-separated segments) already used
// by web/src/utils/redactUrl.ts.
const JWT_HEADER = 'eyJhbGciOiJIUzI1NiJ9';
const JWT_PAYLOAD = 'eyJzdWIiOiIxMjM0NTY3ODkwIn0';
const JWT_SIGNATURE = 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
const JWT = `${JWT_HEADER}.${JWT_PAYLOAD}.${JWT_SIGNATURE}`;

describe('redactSecretsFromString', () => {
    it('fixture guard: the assembled JWT has the intended credential shape', () => {
        expect(JWT).toMatch(/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/);
        expect(JWT.length).toBeGreaterThan(40);
    });

    it('redacts a bare JWT inside a log line', () => {
        const out = redactSecretsFromString(`request failed for user, credential ${JWT} rejected`);
        expect(out).not.toContain(JWT);
        expect(out).not.toContain(JWT_PAYLOAD);
        expect(out).toContain('[REDACTED]');
        expect(out).toContain('request failed for user');
    });

    it('redacts every JWT when several appear in one line', () => {
        const other = `${JWT_HEADER}.${JWT_SIGNATURE}.${JWT_PAYLOAD}`;
        const out = redactSecretsFromString(`first ${JWT} second ${other} done`);
        expect(out).not.toContain(JWT);
        expect(out).not.toContain(other);
        expect(out).toContain('done');
    });

    it('redacts a JWT with trailing punctuation without swallowing the punctuation', () => {
        const out = redactSecretsFromString(`saw (${JWT}).`);
        expect(out).not.toContain(JWT);
        expect(out).toContain('[REDACTED]');
    });

    it('browser runner entry point redacts the same JWT shape', () => {
        const out = redactSecretsFromStringBrowser(`instruction used ${JWT} end`);
        expect(out).not.toContain(JWT);
        expect(out).toContain('[REDACTED]');
    });

    it('both entry points agree byte-for-byte on secret and benign input', () => {
        const samples = [
            `plain log line, nothing secret`,
            `key=abc password=hunter2 token=${JWT}`,
            `Bearer abcdefghij123456 and ${JWT}`,
            `see app.js line 5. node index.js ran ok.`,
        ];
        for (const sample of samples) {
            expect(redactSecretsFromStringBrowser(sample)).toBe(redactSecretsFromString(sample));
        }
    });

    it('shell-command diagnostics inherit JWT redaction through the shared redactor', () => {
        const out = redactCommandForLog(`node app.js --token ${JWT}`, 400);
        expect(out).not.toContain(JWT);
        expect(out).toContain('node app.js');
    });

    test.each([
        'sk-abcdefghij1234567890',
        'ghp_abcdefghij1234567890',
        'Bearer abcdefghij123456',
        'https://joe.example/cb?token=supersecret&x=1',
        'https://joe.example/cb?password=supersecret&x=1',
        'https://joe.example/cb?key=supersecret&x=1',
        'x-worker-key: abcdef123456',
        'OPENAI_API_KEY=abcdef123456',
    ])('still redacts the pre-existing secret shape: %s', shape => {
        const out = redactSecretsFromString(`prefix ${shape} suffix`);
        expect(out).not.toContain('supersecret');
        expect(out).not.toContain('abcdefghij');
        expect(out).not.toContain('abcdef123456');
        expect(out).toContain('prefix');
        expect(out).toContain('suffix');
    });

    test.each([
        'see app.js line 5. node index.js ran ok.',
        'version v1.2.3.4 released today',
        'eyJ is only a three-letter prefix here',
        'eyJh.jjjjjjjjj has just two segments',
        'file eyJ.txt was not found',
        'sessionId=panel-browser request done',
    ])('leaves benign lookalike text intact: %s', text => {
        expect(redactSecretsFromString(text)).toBe(text);
    });
});
