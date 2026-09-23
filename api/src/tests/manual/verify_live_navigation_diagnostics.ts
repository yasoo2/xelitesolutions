/** Explicitly owned local session only; no generation or provider calls. */
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { readNavigationFailureEvidence } from './verification-evidence';

async function main() {
    const { JOE_TEST_USER_ID, JOE_TEST_SESSION_ID, JWT_SECRET, JOE_TEST_RESTORE_URL } = process.env;
    assert(JOE_TEST_USER_ID && JOE_TEST_SESSION_ID && JWT_SECRET && JOE_TEST_RESTORE_URL,
        'Provide an owned local test account/session, test JWT secret, and restore URL');
    const headers = { Authorization: `Bearer ${jwt.sign({ sub: JOE_TEST_USER_ID, role: 'USER' }, JWT_SECRET, { expiresIn: '5m' })}`,
        'Content-Type': 'application/json' };
    const active = await fetch('http://127.0.0.1:5000/api/runs/active', { headers });
    assert.equal(active.status, 200);
    assert.deepEqual((await active.json() as any).runs, [], 'Do not disturb an active task');
    const server = http.createServer((request, response) => {
        if (request.url === '/pending.js') return; // Deliberately unfinished module until cleanup.
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Navigation diagnostic</title><script type="module" src="/pending.js"></script>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const navigate = (url: string) => fetch('http://127.0.0.1:5000/api/browser/nav/goto', {
        // Two default 45-second server attempts, retry delay, and bounded overhead.
        method: 'POST', headers, signal: AbortSignal.timeout(110000),
        body: JSON.stringify({ sessionId: `browser:${JOE_TEST_SESSION_ID}`, url }),
    });
    try {
        const ready = await navigate(JOE_TEST_RESTORE_URL);
        assert.equal(ready.status, 200, 'Verify the restore target and warm the owned browser before measuring');
        const response = await navigate(`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/`);
        const evidence = await readNavigationFailureEvidence(() => response.json());
        console.log(JSON.stringify({ status: response.status, evidence }));
        assert.equal(response.status, 502);
        assert.deepEqual(evidence, { kind: 'timeout', attempts: 2, documentState: 'interactive' });
    } catch (error) {
        console.error('Navigation diagnostic failed:', error);
        throw error;
    } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
        const restored = await navigate(JOE_TEST_RESTORE_URL);
        console.log(JSON.stringify({ restoreStatus: restored.status }));
        assert.equal(restored.status, 200, 'Restore the owned preview');
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
