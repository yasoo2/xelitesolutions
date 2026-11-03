/**
 * ⛔ «EACH STAFF MEMBER ONLY SEES THEIR OWN RECORDS» IS MEASURED, NOT ASSUMED
 * (core/quality/isolation-probe.ts).
 *
 * The exam, 2026-11-03: all 50 full-stack prompts end with that rule, Joe had
 * no instrument for it, and P151 was refused five times as «per-user record
 * isolation (not measured)» — a requirement no build could satisfy. These run
 * the probe against real servers: one that keeps records apart, and the ways
 * a server leaks them.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { asksPerUserIsolation, isolationBrief, measureIsolation, readIsolationDeclaration, ISOLATION_FILE, type IsolationDeclaration } from '../core/quality/isolation-probe';

type Leak = 'none' | 'list' | 'by-id' | 'signed-out' | 'cookie';

/** A clinic API: register, login, and patients that belong to whoever created them. */
function clinic(leak: Leak): http.Server {
    const users = new Map<string, { password: string; id: number }>();
    const tokens = new Map<string, number>();
    const patients: Array<{ id: number; owner: number; name: string }> = [];
    let next = 1;
    return http.createServer((req, res) => {
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
            const body = raw ? JSON.parse(raw) : {};
            const send = (status: number, data: unknown, headers: Record<string, string> = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
            const auth = String(req.headers.authorization || '').replace(/^Bearer /u, '') || (String(req.headers.cookie || '').match(/sid=([^;]+)/u)?.[1] ?? '');
            const me = tokens.get(auth);
            if (req.method === 'POST' && req.url === '/api/auth/register') {
                if (users.has(body.email)) return send(409, { error: 'exists' });
                users.set(body.email, { password: body.password, id: next++ });
                return send(201, { ok: true });
            }
            if (req.method === 'POST' && req.url === '/api/auth/login') {
                const u = users.get(body.email);
                if (!u || u.password !== body.password) return send(401, { error: 'bad credentials' });
                const t = `t${u.id}-${Math.random().toString(36).slice(2)}`;
                tokens.set(t, u.id);
                return leak === 'cookie' ? send(200, { ok: true }, { 'set-cookie': `sid=${t}; HttpOnly; Path=/` }) : send(200, { token: t });
            }
            if (req.url === '/api/patients' && req.method === 'POST') {
                if (!me) return send(401, { error: 'sign in' });
                const p = { id: next++, owner: me, name: String(body.name) };
                patients.push(p);
                return send(201, p);
            }
            if (req.url === '/api/patients' && req.method === 'GET') {
                if (!me && leak !== 'signed-out') return send(401, { error: 'sign in' });
                return send(200, leak === 'list' || leak === 'signed-out' ? patients : patients.filter(p => p.owner === me));
            }
            const one = /^\/api\/patients\/(\d+)$/u.exec(req.url || '');
            if (one && req.method === 'GET') {
                const p = patients.find(x => x.id === Number(one[1]));
                if (!me) return send(401, { error: 'sign in' });
                if (!p || (p.owner !== me && leak !== 'by-id')) return send(404, { error: 'not found' });
                return send(200, p);
            }
            send(404, { error: 'no route' });
        });
    });
}

const DECLARATION: IsolationDeclaration = {
    register: { path: '/api/auth/register', body: { email: '{email}', password: '{password}' } },
    login: { path: '/api/auth/login', body: { email: '{email}', password: '{password}' } },
    users: [{ email: 'staff.a@clinic.test', password: 'Passw0rd!a' }, { email: 'staff.b@clinic.test', password: 'Passw0rd!b' }],
    records: { create: { path: '/api/patients', body: { name: '{marker}' } }, list: '/api/patients' },
};

async function probe(leak: Leak, decl: IsolationDeclaration = DECLARATION) {
    const server = clinic(leak);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    try {
        return await measureIsolation(`http://127.0.0.1:${(server.address() as any).port}/`, decl);
    } finally {
        await new Promise<void>(r => server.close(() => r()));
    }
}

describe('the requests that name the rule', () => {
    it('reads it in English and in Arabic, and only there', () => {
        expect(asksPerUserIsolation('Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.')).toBe(true);
        expect(asksPerUserIsolation('ابني نظام متكامل لـمدرسة خاصة: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الطلاب والصفوف والعلامات، وكل موظف يرى سجلاته فقط.')).toBe(true);
        expect(asksPerUserIsolation('Build an admin dashboard for a dental clinic to manage patients, appointments and treatments.')).toBe(false);
    });

    it('the builder is told the doors to declare', () => {
        expect(isolationBrief()).toContain(ISOLATION_FILE);
        expect(isolationBrief()).toContain('{marker}');
    });
});

describe('the measurement, on a live server', () => {
    it('holds when each user sees only their own records', async () => {
        const r = await probe('none');
        expect(r).toMatchObject({ ok: true });
        expect(r.evidence.join('\n')).toMatch(/GET \/api\/patients as B \(staff\.b@clinic\.test\) → 200, does not show A's record/u);
    });

    it('a cookie session is followed as well as a bearer token', async () => {
        expect(await probe('cookie')).toMatchObject({ ok: true });
    });

    it.each([
        ['list', /B \(staff\.b@clinic\.test\) sees A \(staff\.a@clinic\.test\)'s record «joe-isolation-[0-9a-f]+» at GET \/api\/patients/u],
        ['by-id', /B \(staff\.b@clinic\.test\) opens A \(staff\.a@clinic\.test\)'s record by its id at GET \/api\/patients\/\d+/u],
        ['signed-out', /B \(staff\.b@clinic\.test\) sees A|a visitor who is not signed in sees/u],
    ] as Array<[Leak, RegExp]>)('a server that leaks (%s) fails with what it answered', async (leak, why) => {
        const r = await probe(leak);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(why);
    });

    it('a door that does not open is named with its answer', async () => {
        const r = await probe('none', { ...DECLARATION, register: undefined });
        expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/^A \(staff\.a@clinic\.test\) could not sign in at POST \/api\/auth\/login: 401/u) });
    });

    it('never leaves the run\'s own server', async () => {
        const r = await probe('none', { ...DECLARATION, login: { path: '//evil.example/login', body: {} } });
        expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/leaves the run's own server/u) });
    });
});

describe('the declaration', () => {
    const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'joe-isolation-'));

    it('missing: the builder is told what to write, by name', () => {
        expect(readIsolationDeclaration([dir()]).error).toMatch(new RegExp(`${ISOLATION_FILE.replace('.', '\\.')}, which the project does not have`, 'u'));
    });

    it('incomplete: every missing door is named', () => {
        const d = dir();
        fs.writeFileSync(path.join(d, ISOLATION_FILE), JSON.stringify({ login: { path: '/login' }, users: [{ email: 'a', password: 'x' }], records: { create: { path: '/r', body: { name: 'x' } }, list: 'r' } }));
        const e = readIsolationDeclaration([d]).error || '';
        expect(e).toContain('"users" needs two accounts');
        expect(e).toContain('must hold "{marker}"');
        expect(e).toContain('"records.list" needs a path');
    });

    it('complete: read from the first delivered root that has it', () => {
        const empty = dir();
        const d = dir();
        fs.writeFileSync(path.join(d, ISOLATION_FILE), JSON.stringify(DECLARATION));
        expect(readIsolationDeclaration([empty, d])).toMatchObject({ declaration: DECLARATION, file: path.join(d, ISOLATION_FILE) });
    });
});
