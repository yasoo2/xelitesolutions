import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

async function main() {
    const { JOE_TEST_USER_ID, JOE_TEST_SESSION_ID, JWT_SECRET, JOE_TEST_RESTORE_URL } = process.env;
    assert(JOE_TEST_USER_ID && JOE_TEST_SESSION_ID && JWT_SECRET && JOE_TEST_RESTORE_URL);
    const headers = { Authorization: `Bearer ${jwt.sign({ sub: JOE_TEST_USER_ID, role: 'USER' }, JWT_SECRET, { expiresIn: '5m' })}`,
        'Content-Type': 'application/json' };
    const active = await fetch('http://127.0.0.1:5000/api/runs/active', { headers });
    assert.equal(active.status, 200);
    assert.deepEqual((await active.json() as any).runs, []);
    const counts = new Map<string, number>();
    const arrivals = new Map<string, () => void>();
    const server = http.createServer((request, response) => {
        const route = request.url || '/';
        const count = (counts.get(route) || 0) + 1;
        counts.set(route, count);
        if (route.startsWith('/pending-')) {
            arrivals.get(route.replace('/pending-', '/slow-'))?.();
            return;
        }
        if (route.startsWith('/slow-') && count === 1) {
            response.setHeader('Content-Type', 'text/html');
            response.end(`<script type="module" src="${route.replace('/slow-', '/pending-')}"></script>`);
            return; // Commit history before hanging DOMContentLoaded.
        }
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Navigation fixture</title><p>Ready</p>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const navigate = async (action: string, url?: string) => {
        const response = await fetch(`http://127.0.0.1:5000/api/browser/nav/${action}`, {
            method: 'POST', headers, signal: AbortSignal.timeout(110000),
            body: JSON.stringify({ sessionId: `browser:${JOE_TEST_SESSION_ID}`, url }),
        });
        return { status: response.status, body: await response.json() as any };
    };
    try {
        assert.equal((await navigate('goto', JOE_TEST_RESTORE_URL)).status, 200);
        for (const action of ['back', 'refresh']) {
            assert.equal((await navigate('goto', `${base}/one-${action}`)).status, 200);
            assert.equal((await navigate('goto', `${base}/two-${action}`)).status, 200);
            const target = `/slow-${action}`;
            let timer: ReturnType<typeof setTimeout> | undefined;
            const arrived = new Promise<void>((resolve, reject) => {
                arrivals.set(target, resolve);
                timer = setTimeout(() => reject(new Error('fixture navigation not observed')), 15000);
            });
            const older = navigate('goto', `${base}${target}`);
            try { await arrived; } finally { clearTimeout(timer); }
            const newer = await navigate(action);
            const superseded = await older;
            assert.equal(newer.status, 200);
            assert.equal(newer.body.ok, true);
            assert.equal(superseded.status, 409);
            assert.equal(superseded.body.error, 'nav_superseded');
            console.log(JSON.stringify({ action, newerStatus: newer.status, olderStatus: superseded.status }));
        }
        // A committed goto truncates forward history, so forward is exercised
        // normally here; its retry interleaving is covered by the route test.
        assert.equal((await navigate('goto', `${base}/history-one`)).status, 200);
        assert.equal((await navigate('goto', `${base}/history-two`)).status, 200);
        assert.equal((await navigate('back')).body.ok, true);
        assert.equal((await navigate('forward')).body.ok, true);
        console.log(JSON.stringify({ forwardHistory: 'passed' }));
    } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
        const restored = await navigate('goto', JOE_TEST_RESTORE_URL);
        console.log(JSON.stringify({ restoreStatus: restored.status }));
        assert.equal(restored.status, 200);
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
