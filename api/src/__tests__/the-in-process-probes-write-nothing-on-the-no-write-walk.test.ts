/**
 * ⛔ THE PROBES JOE SENDS FROM ITS OWN PROCESS, ON A CHANGE RUN (design v13.3 §6, §5b step 4).
 *
 *   - The isolation probe registers two accounts and creates a record as the first, never deleted: on the
 *     no-write walk (path 3) it sends nothing, and says it was skipped — «not proven», never failed.
 *   - The builder proofs POST an empty record, DELETE it and sign in with a bad account: on path 3 only
 *     `GET /api/health` is asked, and the claims are «not measured» (`builderClaimsRemeasured(…, true)`).
 *   - Every request the isolation probe and the served-resources probe send is one of the verification's
 *     windows, so a change the server makes while answering is never told as «unexplained».
 * A caller that passes none of the new options gets each probe exactly as before.
 */
import http from 'http';
import { isolationRunsOn, measureIsolation, type IsolationDeclaration } from '../core/quality/isolation-probe';
import { builderClaimsRemeasured, measureBuilderProofs, regressedBuilderProofs } from '../core/quality/builder-proofs';
import { probeServedResources } from '../core/quality/request-coverage';
import { createQaWindows } from '../core/quality/qa-windows';

jest.setTimeout(60_000);

const servers: http.Server[] = [];
afterAll(async () => { for (const s of servers) await new Promise<void>(r => s.close(() => r())); });

/** A server that keeps one list per signed-in user, and logs every request. */
async function app(): Promise<{ base: string; log: string[] }> {
    const log: string[] = [];
    const rows: Array<{ id: number; owner: string; name: string }> = [];
    const server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
            log.push(`${req.method} ${req.url}`);
            const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
            const body = (() => { try { return JSON.parse(raw || '{}'); } catch { return {}; } })();
            const who = String(req.headers.authorization || '').replace(/^Bearer /u, '');
            if (req.url === '/api/health') return json(200, { ok: true, joe: 'api_project', resource: 'notes', tables: { notes: rows.length } });
            if (req.url === '/api/auth/login' && req.method === 'POST') return body.email && body.password && !String(body.email).startsWith('joe-reproof') ? json(200, { token: body.email }) : json(401, { error: 'no' });
            if (req.url === '/api/notes' && req.method === 'POST') {
                if (!who) return json(401, { error: 'sign in' });
                const row = { id: rows.length + 1, owner: who, name: String(body.name || '') };
                rows.push(row);
                return json(201, row);
            }
            if (String(req.url).startsWith('/api/notes') && req.method === 'GET') return json(200, rows.filter(r => r.owner === who));
            json(404, { error: 'not found' });
        });
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { base: `http://127.0.0.1:${(server.address() as any).port}`, log };
}

const DECLARATION: IsolationDeclaration = {
    login: { path: '/api/auth/login', body: { email: '{email}', password: '{password}' }, token: 'token' },
    users: [{ email: 'staff.a@example.test', password: 'Passw0rd!a' }, { email: 'staff.b@example.test', password: 'Passw0rd!b' }],
    records: { create: { path: '/api/notes', body: { name: '{marker}' } }, list: '/api/notes' },
};

test('the isolation probe sends nothing on the no-write walk and says it was skipped, never failed', async () => {
    const server = await app();
    expect(isolationRunsOn('no-write')).toBe(false);
    expect(['as-today', 'private-live', '2t', undefined].every(p => isolationRunsOn(p as any))).toBe(true);
    const r = await measureIsolation(server.base, DECLARATION, { qaPath: 'no-write' });
    expect(r.skipped).toBe('no-write');
    expect(r.ok).toBe(false);
    expect(r.evidence).toEqual([]);
    expect(server.log).toEqual([]);
});

test('on every other path it measures as before, each request inside one of the verification\'s windows', async () => {
    const server = await app();
    const windows = createQaWindows();
    const r = await measureIsolation(server.base, DECLARATION, { qaPath: '2t', windows });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBeUndefined();
    expect(windows.list().length).toBe(server.log.length);
    expect(windows.list().every(w => w.what.startsWith('isolation ') && w.end >= w.start)).toBe(true);
    //  No option at all: the probe it always was.
    const before = await app();
    const plain = await measureIsolation(before.base, DECLARATION);
    expect(plain.ok).toBe(true);
    expect(before.log.filter(l => l.startsWith('POST ')).length).toBe(3);
});

test('the builder proofs ask only for the health on the no-write walk; their claims are not measured, not lost', async () => {
    const server = await app();
    const quiet = await measureBuilderProofs(server.base, { timeoutMs: 2000, noWrite: true });
    expect(server.log).toEqual(['GET /api/health']);
    expect(quiet).toMatchObject({ health: true, contract: 'api_project', noWrite: true });
    expect(quiet.anonymousWrite).toBeUndefined();
    expect(quiet.badPassword).toBeUndefined();
    expect(builderClaimsRemeasured(quiet, quiet, true)).toBe(true);
    expect(builderClaimsRemeasured({ ...quiet, health: false }, quiet, true)).toBe(false);

    //  Today's proofs: the write, its refusal and the bad login — and a no-write side loses none of them.
    const full = await measureBuilderProofs(server.base, { timeoutMs: 2000 });
    expect(full.noWrite).toBeUndefined();
    expect(full.anonymousWrite?.outcome).toBe('refused');
    expect(full.badPassword?.refused).toBe(true);
    expect(server.log.some(l => l.startsWith('POST /api/notes'))).toBe(true);
    expect(builderClaimsRemeasured(full, full)).toBe(true);
    expect(regressedBuilderProofs(full, quiet)).toEqual([]);
    expect(regressedBuilderProofs(full, { ...full, anonymousWrite: { resource: 'notes', status: 201, outcome: 'written' } })).toHaveLength(1);
});

test('every GET of the served-resources probe is a window when the verification keeps them, and the same answer either way', async () => {
    const server = await app();
    const records = [{ key: 'notes', ids: ['notes'] }];
    const windows = createQaWindows();
    const kept = await probeServedResources(server.base, ['/api/'], records, { timeoutMs: 2000, windows });
    const count = server.log.length;
    expect(count).toBeGreaterThan(0);
    expect(windows.list().length).toBe(count);
    expect(windows.list().every(w => w.what.startsWith('coverage GET '))).toBe(true);
    const plain = await probeServedResources(server.base, ['/api/'], records, { timeoutMs: 2000 });
    expect(plain).toEqual(kept);
    expect(server.log.slice(count).every(l => l.startsWith('GET '))).toBe(true);
});
