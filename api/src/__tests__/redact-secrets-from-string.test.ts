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

    // Boundary contract (Codex c226 review condition): the pre-consolidation
    // browser entry normalized with String(s || ''), so every falsy input
    // became ''. The browser wrapper must preserve that; it must never leak
    // a non-string through a log/debug path that expects a string.
    test.each([
        ['undefined', undefined],
        ['null', null],
        ['zero', 0],
        ['false', false],
        ['empty string', ''],
    ])('browser entry normalizes falsy input (%s) to an empty string', (_label, value) => {
        expect(redactSecretsFromStringBrowser(value as unknown as string)).toBe('');
    });

    // Same pre-consolidation contract: truthy non-strings were coerced with
    // String(...) and then redacted, never thrown on.
    test.each([
        [123456789012, '123456789012'],
        [true, 'true'],
    ])('browser entry coerces truthy non-string %s instead of throwing', (value, expected) => {
        expect(redactSecretsFromStringBrowser(value as unknown as string)).toBe(expected);
    });

    it('browser entry coerces then redacts a secret hidden in a non-string object', () => {
        const carrier = { toString: () => `prefix ${JWT} suffix` };
        const out = redactSecretsFromStringBrowser(carrier as unknown as string);
        expect(out).not.toContain(JWT);
        expect(out).not.toContain(JWT_PAYLOAD);
        expect(out).toContain('[REDACTED]');
        expect(out).toContain('prefix');
    });

    it('shared entry keeps its strict string contract on the empty string', () => {
        expect(redactSecretsFromString('')).toBe('');
    });
});

// Transfer cases: spelled-out and long-form credential names the original
// enumeration never listed. A redactor must classify by the MEANING of the
// class (a named credential), not by the few short spellings it was built
// with — otherwise every synonym silently leaks.
describe('redactSecretsFromString transfer: non-enumerated credential spellings', () => {
    test.each([
        ['bare password assignment', 'prefix password=hunter2 suffix', 'hunter2'],
        ['digitless secret value still redacted (fail closed)', 'prefix secret: blueberry-patch suffix', 'blueberry-patch'],
        ['spelled-out api_key compound', 'prefix api_key=AKIAIOSFODNN7EXAMPLE suffix', 'AKIAIOSFODNN7EXAMPLE'],
        ['JSON password field', 'prefix {"password": "hunter2"} suffix', 'hunter2'],
        ['JSON token field with digit', 'prefix {"token": "abc123"} suffix', 'abc123'],
        ['client_secret compound', 'prefix client_secret=shhh-value-1 suffix', 'shhh-value-1'],
        ['token with digit', 'prefix token: abc123 suffix', 'abc123'],
        ['camelCase accessToken', 'prefix accessToken=abc123 suffix', 'abc123'],
        ['camelCase apiKey', 'prefix apiKey=hunter2 suffix', 'hunter2'],
        ['csrf token', 'prefix _csrf=abc123 suffix', 'abc123'],
    ])('redacts %s', (_label, input, leaked) => {
        const out = redactSecretsFromString(input);
        expect(out).not.toContain(leaked);
        expect(out).toContain('[REDACTED]');
        expect(out).toContain('prefix');
        expect(out).toContain('suffix');
    });

    it('redacts a non-enumerated query parameter but keeps its neighbors', () => {
        const out = redactSecretsFromString('prefix ?access_token=secret123&x=1 suffix');
        expect(out).not.toContain('secret123');
        expect(out).toContain('?access_token=[REDACTED]&x=1');
    });

    it('redacts a compound query parameter', () => {
        const out = redactSecretsFromString('prefix ?api_key=xyz789 suffix');
        expect(out).not.toContain('xyz789');
        expect(out).toContain('[REDACTED]');
    });

    it('redacts a URI userinfo password but keeps user, host and path', () => {
        const out = redactSecretsFromString('prefix mongodb://joe:hunter2@db.internal:27017/app suffix');
        expect(out).not.toContain('hunter2');
        expect(out).toContain('mongodb://joe:[REDACTED]@db.internal:27017/app');
    });

    it('keeps trailing punctuation outside the redaction', () => {
        const out = redactSecretsFromString('prefix token=abc123. suffix');
        expect(out).not.toContain('abc123');
        expect(out).toContain('token=[REDACTED].');
    });

    it('documents the fail-closed over-redaction: password: required is redacted', () => {
        // `required` after a password cue is indistinguishable from a real
        // password by shape. The redactor fails closed (redacts) rather than
        // leaking digitless passwords such as `blueberry`. Pinned on purpose.
        const out = redactSecretsFromString('prefix password: required suffix');
        expect(out).not.toContain('required');
        expect(out).toContain('password:[REDACTED]');
    });

    test.each([
        ['mustache secret placeholder keeps its key name', 'send {{SECRET:JOE_LOGIN_PASSWORD}} now'],
        ['keyboard key name is not a credential', '{"key":"Enter"}'],
        ['usage telemetry is not a credential', 'prompt tokens: 150 done'],
        ['null literal is not a credential', 'prefix token: null suffix'],
        ['none literal is not a credential', 'prefix auth: none suffix'],
        ['false literal is not a credential', 'prefix secret: false suffix'],
        ['correlation UUID is not redacted', 'key: 550e8400-e29b-41d4-a716-446655440000'],
        ['empty quoted value means unset', 'prefix password: "" suffix'],
        ['port number is not a userinfo password', 'see https://host:5000/api for details'],
        ['cue must not match the tail of a longer word', 'prefix monkey=banana suffix'],
        ['cue must not match the head of a longer word', 'the tokenizer=X1 setting'],
        ['auth must not match author', 'node app.js --author bob done'],
        ['digitless short token value is kept (documented residual)', 'prefix token=panel-browser suffix'],
    ])('leaves intact: %s', (_label, text) => {
        expect(redactSecretsFromString(text)).toBe(text);
    });

    it('is idempotent: re-redacting never appends extra markers', () => {
        const mixed = 'u=joe password=hunter2 token=abc123 tokens=150 key=Enter ?a=1&token=xyz9 end';
        const once = redactSecretsFromString(mixed);
        expect(once).toContain('password=[REDACTED]');
        expect(once).toContain('token=[REDACTED]');
        expect(once).toContain('tokens=150');
        expect(once).toContain('key=Enter');
        expect(redactSecretsFromString(once)).toBe(once);
    });

    it('browser entry agrees byte-for-byte on the new shapes', () => {
        const samples = [
            'prefix password=hunter2 suffix',
            '{"key":"Enter"}',
            'prefix ?access_token=x1&y=2 suffix',
            'send {{SECRET:JOE_LOGIN_EMAIL}} now',
            'prompt tokens: 150 done',
        ];
        for (const sample of samples) {
            expect(redactSecretsFromStringBrowser(sample)).toBe(redactSecretsFromString(sample));
        }
    });
});
