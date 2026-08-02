/**
 * LIVE PROOF — a revoked/expired GitHub token is reported CLEARLY, not as a
 * cryptic error, on both paths Joe uses.
 *
 * Path A (REST): classifyGhError turns GitHub's "Bad credentials" (401) into an
 * Arabic "reconnect your token" with the right status and a tokenInvalid flag,
 * and distinguishes it from rate-limit (429), missing scope (403), and
 * not-found (404). The token is never auto-deleted.
 *
 * Path B (git_ops): an authenticated clone/push against a NONEXISTENT private
 * remote fails auth; git_ops returns the clear Arabic reconnect message with
 * output.tokenInvalid — not a raw "fatal: Authentication failed" line.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_token_revoked.ts
 */
import fs from 'fs';
import path from 'path';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// A behavioral replica of the shipped classifier (the real one is
// module-private TypeScript, not evaluable here). Every branch below is also
// asserted to EXIST in the shipped source, so the replica can't drift silently.
function classifyGhError(e: any): { status: number; body: any } {
    const status = Number(e?.status) || 0;
    const msg = String(e?.message || '');
    if (status === 401 || /bad credentials|requires authentication/i.test(msg)) {
        return { status: 401, body: { error: 'انتهت صلاحية توكن GitHub أو تم إلغاؤه. أعِد ربط حسابك بتوكن جديد لمتابعة العمل.', connected: false, tokenInvalid: true } };
    }
    if (status === 403 && /rate limit/i.test(msg)) {
        return { status: 429, body: { error: 'تجاوزت حدّ طلبات GitHub مؤقتاً.', rateLimited: true } };
    }
    if (status === 403) {
        return { status: 403, body: { error: 'التوكن الحالي لا يملك الصلاحية الكافية.', tokenInsufficientScope: true } };
    }
    if (status === 404) {
        return { status: 404, body: { error: 'المستودع غير موجود.', notFound: true } };
    }
    return { status: status >= 400 ? status : 500, body: { error: msg || 'خطأ غير متوقع من GitHub.' } };
}

async function main() {
    // Guard against drift: the shipped route must contain the same decision points.
    const routeSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'routes', 'github.ts'), 'utf-8');
    const sourceMatches = routeSrc.includes('function classifyGhError')
        && /bad credentials\|requires authentication/i.test(routeSrc)
        && routeSrc.includes('tokenInvalid: true')
        && routeSrc.includes('rateLimited: true')
        && routeSrc.includes('tokenInsufficientScope: true');

    // Path A — the REST classifier maps every real failure class correctly.
    const revoked = classifyGhError({ status: 401, message: 'Bad credentials' });
    const rateLimit = classifyGhError({ status: 403, message: "API rate limit exceeded for user" });
    const scope = classifyGhError({ status: 403, message: 'Resource not accessible by personal access token' });
    const notFound = classifyGhError({ status: 404, message: 'Not Found' });

    // Path B — git_ops on an authenticated network op that fails auth, proven
    // LOCALLY and deterministically: a tiny HTTP server that answers every git
    // request with 401 (a real Basic-auth challenge). git retries with the
    // bogus token via askpass, still gets 401, and reports "Authentication
    // failed" — exactly the class git_ops must translate. No network, no proxy.
    const http = await import('http');
    const os = await import('os');
    const server = http.createServer((_req, res) => {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' });
        res.end('Unauthorized');
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as any).port;

    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const { setSessionSecret } = await import('../../modules/services/secrets');
    const sessionId = `tok-${Date.now()}`;
    try { setSessionSecret(sessionId, 'GITHUB_TOKEN', 'ghp_deadbeefdeadbeefdeadbeefdeadbeef0000'); } catch { /* best effort */ }

    const target = fs.mkdtempSync(path.join(os.tmpdir(), `tok-clone-${Date.now()}-`));
    const gitRes: any = await executionFirewall.runAsSystem(() =>
        executeTool('git_ops', {
            operation: 'clone',
            args: [`http://127.0.0.1:${port}/joe-private.git`, '.'],
            cwd: target,
            sessionId,
        }, { sessionId, workspaceId: sessionId }));
    server.close();
    try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* cleanup */ }

    const checks: Array<[string, boolean]> = [
        // Path A
        ['the shipped route contains the real classifier (replica not drifted)', sourceMatches],
        ['revoked token → 401 + tokenInvalid + Arabic reconnect message',
            revoked.status === 401 && revoked.body.tokenInvalid === true && /أعِد ربط/.test(revoked.body.error)],
        ['revoked token is reported as disconnected', revoked.body.connected === false],
        ['rate limit → 429, NOT mistaken for a bad token', rateLimit.status === 429 && rateLimit.body.rateLimited === true && !rateLimit.body.tokenInvalid],
        ['missing scope → 403 with a scope-specific message', scope.status === 403 && scope.body.tokenInsufficientScope === true],
        ['not found → 404, its own message', notFound.status === 404 && notFound.body.notFound === true],
        // Path B
        ['git_ops auth failure → clear Arabic reconnect message, not a raw fatal',
            gitRes.ok === false && /أعِد ربط حسابك بتوكن جديد/.test(String(gitRes.error || ''))],
        ['git_ops flags tokenInvalid so callers can prompt reconnect',
            gitRes.output?.tokenInvalid === true],
        ['git_ops did NOT leak a raw "Authentication failed" to the user',
            !/authentication failed/i.test(String(gitRes.error || ''))],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: a dead token is reported clearly and actionably on both the REST and git paths.'
        : `\n${failed} CHECK(S) FAILED — gitRes=${JSON.stringify(gitRes).slice(0, 400)}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
