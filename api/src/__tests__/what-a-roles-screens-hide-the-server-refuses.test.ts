/**
 * ⛔ WHAT A ROLE'S SCREENS HIDE FROM IT, THE SERVER MUST REFUSE IT.
 *
 * A menu is not a permission (core/quality/role-probe.ts). Joe signs in as
 * each role the builder seeded, through the product's own form, walks the
 * screens its menu offers, and asks the server — with each role's own session
 * — for the data of the screens only other roles have.
 *
 * Measured with a real browser on a real server: a clinic whose receptionist
 * has no «Revenue» or «Audit log» screen, once with a server that checks the
 * role on every route, once with one that only hides the menu.
 */
import http from 'http';
import { asksRolePermissions, measureRoles, parseRoleAccounts, roleLeakError } from '../core/quality/role-probe';
import { parseFinishArgs } from '../core/engine/finish';
import { shownArgs } from '../core/engine/run';
import { deliveryCertificate } from '../core/engine/certificate';
import { systemPrompt } from '../core/engine/prompt';

jest.setTimeout(240_000);

const ACCOUNTS = [
    { identity: 'admin', password: 'admin-demo-1', role: 'admin' },
    { identity: 'doctor', password: 'doctor-demo-1', role: 'doctor' },
    { identity: 'reception', password: 'reception-demo-1', role: 'receptionist' },
];
const SCREENS: Record<string, string[]> = {
    admin: ['patients', 'appointments', 'revenue', 'audit'],
    doctor: ['patients', 'appointments'],
    receptionist: ['patients', 'appointments'],
};
const LABEL: Record<string, string> = { patients: 'Patients', appointments: 'Appointments', revenue: 'Revenue', audit: 'Audit log' };
const DATA: Record<string, unknown> = {
    patients: [{ name: 'Layla Hassan' }], appointments: [{ at: '09:00' }],
    revenue: { month: '2026-11', total: 4200 }, audit: [{ change: 'invoice 7 paid' }],
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Clinic</title></head><body><div id="root"></div><script>
const LABEL = ${JSON.stringify(LABEL)};
const root = document.getElementById('root');
const call = (path) => fetch(path, { headers: { authorization: 'Bearer ' + localStorage.getItem('token') } }).then(r => r.json());
function signIn() {
  root.innerHTML = '<form id="f"><input name="username" autocomplete="username"><input type="password" name="password"><button type="submit">Sign in</button></form>';
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: e.target.username.value, password: e.target.password.value }) });
    if (!r.ok) return;
    localStorage.setItem('token', (await r.json()).token);
    app();
  };
}
async function app() {
  const me = await call('/api/me');
  root.innerHTML = '<nav>' + me.screens.map(s => '<button type="button" data-s="' + s + '">' + LABEL[s] + '</button>').join('') + '<button type="button" id="out">Log out</button></nav><main id="m"></main>';
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { document.getElementById('m').textContent = JSON.stringify(await call('/api/' + b.dataset.s)); });
  document.getElementById('out').onclick = () => { localStorage.removeItem('token'); signIn(); };
}
if (localStorage.getItem('token')) app(); else signIn();
</script></body></html>`;

const servers: http.Server[] = [];
afterAll(async () => { for (const s of servers) await new Promise<void>(r => s.close(() => r())); });

/** The clinic; `checks` false is a server that only hides the menu. */
async function clinic(checks: boolean): Promise<string> {
    const server = http.createServer((req, res) => {
        const url = String(req.url || '/').split('?')[0];
        const json = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
        if (url === '/api/login' && req.method === 'POST') {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                const body = JSON.parse(raw || '{}');
                const account = ACCOUNTS.find(a => a.identity === body.username && a.password === body.password);
                account ? json(200, { token: `t-${account.role}` }) : json(401, { error: 'invalid credentials' });
            });
            return;
        }
        if (url.startsWith('/api/')) {
            const role = String(req.headers.authorization || '').replace(/^Bearer t-/u, '');
            if (!SCREENS[role]) return json(401, { error: 'sign in' });
            if (url === '/api/me') return json(200, { role, screens: SCREENS[role] });
            const screen = url.slice('/api/'.length);
            if (!(screen in DATA)) return json(404, { error: 'not found' });
            if (checks && !SCREENS[role].includes(screen)) return json(403, { error: 'forbidden' });
            return json(200, DATA[screen]);
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(PAGE);
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return `http://127.0.0.1:${(server.address() as any).port}/`;
}

describe('the accounts task_finish gives, one per role', () => {
    it('are read as [{username|email, password, role}], and anything else is refused', () => {
        expect(parseRoleAccounts([{ username: 'admin', password: 'p', role: 'admin' }, { email: 'd@c.o', password: 'q', role: 'doctor' }]))
            .toEqual([{ identity: 'admin', password: 'p', role: 'admin' }, { identity: 'd@c.o', password: 'q', role: 'doctor' }]);
        expect(parseRoleAccounts([{ username: 'admin', password: 'p' }])).toBeNull();
        expect(parseRoleAccounts('admin')).toBeNull();
    });

    it('task_finish takes them, refuses a malformed list with how to give it, and never shows their passwords', () => {
        const given = [{ username: 'admin', password: 'admin-demo-1', role: 'admin' }, { username: 'reception', password: 'reception-demo-1', role: 'receptionist' }];
        const parsed = parseFinishArgs({ summary: 'clinic', accounts: given });
        expect(parsed).toEqual({ ok: true, value: { summary: 'clinic', accounts: [
            { identity: 'admin', password: 'admin-demo-1', role: 'admin' }, { identity: 'reception', password: 'reception-demo-1', role: 'receptionist' },
        ] } });
        const bad = parseFinishArgs({ summary: 'clinic', accounts: [{ username: 'admin', password: 'p' }] });
        expect((bad as any).error).toMatch(/"accounts" must list one account the project seeds for each role/u);
        const shown = JSON.stringify(shownArgs('task_finish', (parsed as any).value));
        expect(shown).not.toMatch(/admin-demo-1|reception-demo-1/u);
        expect(shown).toContain('"role":"receptionist"');
    });

    it('a request that names roles or permissions asks for them; one that does not, does not', () => {
        expect(asksRolePermissions('Build a complete clinic management system: logins with three roles (admin, doctor, receptionist) and different permissions for each, patients and invoices.')).toBe(true);
        expect(asksRolePermissions('ابني نظام مدرسة بصلاحيات للمدير والمعلم والطالب')).toBe(true);
        expect(asksRolePermissions('Build a landing page for a bakery with a contact form.')).toBe(false);
    });

    it('the certificate says what each role sees, once the permissions held', () => {
        const base = { request: 'clinic', summary: 'clinic', language: 'ar' };
        const roles = [{ role: 'admin', screens: ['المرضى', 'الإيرادات'] }, { role: 'receptionist', screens: ['المرضى'] }];
        const held = deliveryCertificate({ ...base, passed: ['live', 'roles'], roles });
        expect(held).toMatch(/\*\*الصلاحيات\*\*: دخل جو بحساب كل دور/u);
        expect(held).toMatch(/\*\*receptionist\*\*: المرضى/u);
        expect(deliveryCertificate({ ...base, passed: ['live'], roles })).not.toMatch(/ما يراه كل دور/u);
    });

    it('the engine is told to give an account per role, and that a hidden screen is refused by the server', () => {
        const prompt = systemPrompt({ platform: 'linux', shell: 'bash' });
        expect(prompt).toMatch(/give one account per role in task_finish as accounts/u);
        expect(prompt).toMatch(/refused to that role by the server itself, not only hidden from its menu/u);
    });
});

describe('a clinic with three roles', () => {
    it('whose server checks the role: every role signs in, and every hidden screen\'s data is refused', async () => {
        const m = await measureRoles(await clinic(true), ACCOUNTS);
        expect(m.measured).toBe(true);
        expect(m.views.map(v => [v.role, v.signedIn, v.screens])).toEqual([
            ['admin', true, ['Patients', 'Appointments', 'Revenue', 'Audit log']],
            ['doctor', true, ['Patients', 'Appointments']],
            ['receptionist', true, ['Patients', 'Appointments']],
        ]);
        expect(m.leaks).toEqual([]);
        expect(m.refused.map(r => `${r.role} ${r.path} ${r.status}`)).toEqual(expect.arrayContaining([
            'doctor /api/revenue 403', 'doctor /api/audit 403', 'receptionist /api/revenue 403', 'receptionist /api/audit 403',
        ]));
        expect(roleLeakError(m)).toBeNull();
    });

    it('whose server only hides the menu: the leak is named — the role, the address, the screen and whose it is', async () => {
        const m = await measureRoles(await clinic(false), ACCOUNTS);
        expect(m.measured).toBe(true);
        expect(m.leaks.map(l => `${l.role} ${l.path} «${l.screen}» of ${l.of}`)).toEqual(expect.arrayContaining([
            'receptionist /api/revenue «Revenue» of admin', 'receptionist /api/audit «Audit log» of admin',
        ]));
        expect(roleLeakError(m)).toMatch(/^the server gives a role what its screens hide from it: .*receptionist was given GET \/api\/revenue \(200\) — the data of «Revenue», a screen only admin has/u);
    });

    it('an account that cannot sign in is said, and one role alone is not a comparison', async () => {
        const url = await clinic(true);
        const m = await measureRoles(url, [ACCOUNTS[0], { identity: 'doctor', password: 'wrong', role: 'doctor' }]);
        expect(m.measured).toBe(false);
        expect(m.error).toMatch(/fewer than two of the accounts signed in: doctor \(the product kept its sign-in form/u);
        expect((await measureRoles(url, [ACCOUNTS[0]])).measured).toBe(false);
    });
});
