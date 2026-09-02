/**
 * The revoked-token audit: when a GitHub token expires or is revoked mid-work,
 * does Joe report it clearly or leak a cryptic error? Before, both paths were
 * opaque — the REST routes re-emitted "Bad credentials" as a raw HTTP 500, and
 * the UI swallowed it into an empty repo list; git_ops surfaced a raw "fatal:
 * Authentication failed". Now every path says, in Arabic, "reconnect your token".
 */
import fs from 'fs';
import path from 'path';

const ghRoute = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'routes', 'github.ts'), 'utf-8');
const gitTools = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'GitTools.ts'), 'utf-8');
const joePage = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf-8');
const dialog = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'GitHubConnectDialog.tsx'), 'utf-8');

describe('REST: failure classes are distinguished, not lumped into a 500', () => {
    test('the classifier exists and covers auth / rate-limit / scope / not-found', () => {
        expect(ghRoute).toMatch(/function classifyGhError/);
        expect(ghRoute).toMatch(/bad credentials\|requires authentication/i);
        expect(ghRoute).toMatch(/status: 401[\s\S]*tokenInvalid: true/);
        expect(ghRoute).toMatch(/status: 429[\s\S]*rateLimited: true/);
        expect(ghRoute).toMatch(/tokenInsufficientScope: true/);
        expect(ghRoute).toMatch(/notFound: true/);
    });
    test('the data routes use the classifier instead of a raw 500', () => {
        expect(ghRoute).not.toMatch(/res\.status\(500\)\.json\(\{ error: e\.message \}\)/);
        expect((ghRoute.match(/classifyGhError\(e\)/g) || []).length).toBeGreaterThanOrEqual(5);
    });
    test('the token is never auto-deleted on a 401 (a blip must not wipe a good connection)', () => {
        // Explicit disconnect may delete the token; the 401 catch path may not.
        const connectStart = ghRoute.indexOf("router.post('/connect'");
        const statusStart = ghRoute.indexOf("router.get('/status'");
        const connectRoute = ghRoute.slice(connectStart, statusStart > connectStart ? statusStart : undefined);
        const catchStart = connectRoute.lastIndexOf('} catch');
        expect(connectRoute.slice(catchStart)).not.toMatch(/deleteUserSecret|removeUserSecret/);
    });
});

describe('git_ops: an auth failure is translated, not leaked raw', () => {
    test('network-op auth failures map to the Arabic reconnect message + tokenInvalid', () => {
        expect(gitTools).toMatch(/looksAuth/);
        expect(gitTools).toMatch(/authentication failed\|could not read username/i);
        expect(gitTools).toMatch(/أعِد ربط حسابك بتوكن جديد/);
        expect(gitTools).toMatch(/tokenInvalid: true/);
    });
});

describe('UI: the failure is surfaced, never swallowed', () => {
    test('token errors are captured into state and shown, not caught-and-dropped', () => {
        expect(joePage).toMatch(/setGhError/);
        expect(joePage).toMatch(/توكن\|token\|صلاحية\|credential/);
        // The refresh path opens the reconnect dialog on a dead token.
        expect(joePage).toMatch(/setGhError\(msg\); setIsGitHubOpen\(true\)/);
    });
    test('the reconnect dialog renders the live token error as a banner', () => {
        expect(dialog).toMatch(/tokenError/);
        expect(dialog).toMatch(/tokenError && !success/);
    });
});
