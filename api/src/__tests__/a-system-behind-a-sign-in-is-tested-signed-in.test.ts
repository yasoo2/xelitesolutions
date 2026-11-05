/**
 * ⛔ A SYSTEM BEHIND A SIGN-IN IS TESTED SIGNED IN, THROUGH ITS OWN FORM.
 *
 * The hard exam, 2026-11-05, H01: a clinic that opened on its sign-in page, as
 * it should. Joe's live filter probe operated the sign-in page — «Username»,
 * «English», «العربية» … «the data shown never changed» — and never the
 * patients list behind it; and the Browser QA, inside the clinic, pressed its
 * «العربية» switch first, renamed every other control, and reported «22 of 34
 * controls were gone before I could press them». Fifty-five minutes, and a
 * working clinic refused twice over (core/quality/sign-in.ts).
 *
 * The builder gives task_finish an account it seeds (`sign_in`); Joe signs in
 * with it through the product's own form and tests the screens behind it. A
 * language switch is pressed after every other control. Without an account, a
 * product that shows a sign-in says what Joe needs; with a wrong one, the
 * product's own refusal is said.
 *
 * Measured with a real browser on a real server.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { DeliveryLedger } from '../core/quality/delivery-verdict';
import { deliveryRun } from '../core/quality/delivery-run';
import { auditBuiltApp } from '../core/quality/app-audit';
import { parseSignInAccount } from '../core/quality/sign-in';
import { parseFinishArgs } from '../core/engine/finish';
import { shownArgs } from '../core/engine/run';
import { deliveryCertificate } from '../core/engine/certificate';

jest.setTimeout(300_000);

const ACCOUNT = { identity: 'admin', password: 'clinic-demo-1' };

/** The clinic's page: a language switch ahead of everything, a sign-in form, and behind it a list with a filter. */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Clinic</title>
<style>body{font-family:sans-serif;margin:0}button,select,input{min-height:44px;min-width:44px;font-size:16px}header{display:flex;gap:8px;padding:8px}main{padding:16px}li{padding:4px}</style></head>
<body><header><div class="lang-switch" role="group" aria-label="Language"><button type="button" id="en">English</button><button type="button" id="ar">العربية</button></div></header>
<main id="root"></main>
<script>
const WORDS = {
  en: { title: 'Clinic', user: 'Username', pass: 'Password', signIn: 'Sign in', patients: 'Patients', invoices: 'Invoices', audit: 'Audit log', all: 'All statuses', out: 'Log out', bad: 'Wrong username or password', none: 'No invoices yet', log: 'No changes yet' },
  ar: { title: 'العيادة', user: 'اسم المستخدم', pass: 'كلمة المرور', signIn: 'تسجيل الدخول', patients: 'المرضى', invoices: 'الفواتير', audit: 'سجل التدقيق', all: 'كل الحالات', out: 'تسجيل الخروج', bad: 'اسم المستخدم أو كلمة المرور خطأ', none: 'لا فواتير بعد', log: 'لا تغييرات بعد' },
};
let lang = localStorage.getItem('lang') || 'en';
let view = 'patients';
let chosen = '';
let rows = [];
let error = '';
const t = (k) => WORDS[lang][k];
document.getElementById('en').onclick = () => { lang = 'en'; localStorage.setItem('lang', lang); draw(); };
document.getElementById('ar').onclick = () => { lang = 'ar'; localStorage.setItem('lang', lang); draw(); };
async function load() {
  const r = await fetch('/api/patients', { headers: { authorization: 'Bearer ' + localStorage.getItem('token') } });
  if (r.status === 401) { localStorage.removeItem('token'); return draw(); }
  rows = await r.json();
  draw();
}
function draw() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('en').setAttribute('aria-pressed', String(lang === 'en'));
  document.getElementById('ar').setAttribute('aria-pressed', String(lang === 'ar'));
  const root = document.getElementById('root');
  if (!localStorage.getItem('token')) {
    root.innerHTML = '<h1>' + t('title') + '</h1><form id="f"><p role="alert">' + error + '</p><label>' + t('user') + ' <input name="username" autocomplete="username" required></label><label>' + t('pass') + ' <input type="password" name="password" required></label><button type="submit">' + t('signIn') + '</button></form>';
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const body = { username: e.target.username.value, password: e.target.password.value };
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { error = t('bad'); return draw(); }
      localStorage.setItem('token', (await r.json()).token);
      error = '';
      load();
    };
    return;
  }
  const nav = ['patients', 'invoices', 'audit'].map(k => '<button type="button" data-view="' + k + '">' + t(k) + '</button>').join('');
  let body = '';
  if (view === 'patients') {
    const shown = rows.filter(p => !chosen || p.status === chosen);
    body = '<select id="status" aria-label="status"><option value="">' + t('all') + '</option><option value="active"' + (chosen === 'active' ? ' selected' : '') + '>active</option><option value="discharged"' + (chosen === 'discharged' ? ' selected' : '') + '>discharged</option></select><ul>' + shown.map(p => '<li>' + p.name + ' — ' + p.status + '</li>').join('') + '</ul>';
  } else body = '<p>' + t(view === 'invoices' ? 'none' : 'log') + '</p>';
  root.innerHTML = '<h1>' + t(view) + '</h1><nav>' + nav + '<button type="button" id="out">' + t('out') + '</button></nav>' + body;
  root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { view = b.dataset.view; draw(); });
  document.getElementById('out').onclick = () => { localStorage.removeItem('token'); draw(); };
  const select = document.getElementById('status');
  if (select) select.onchange = () => { chosen = select.value; draw(); };
}
if (localStorage.getItem('token')) load(); else draw();
</script></body></html>`;

const PATIENTS = [
    { name: 'Layla Hassan', status: 'active' }, { name: 'Omar Said', status: 'discharged' },
    { name: 'Sara Ali', status: 'active' }, { name: 'Yousef Nasser', status: 'discharged' }, { name: 'Mona Adel', status: 'active' },
];

const roots: string[] = [];
const servers: http.Server[] = [];
afterAll(async () => {
    for (const s of servers) await new Promise<void>(r => s.close(() => r()));
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function clinic(): Promise<{ dir: string; url: string }> {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-sign-in-'));
    roots.push(dir);
    fs.writeFileSync(path.join(dir, 'index.html'), PAGE);
    const server = http.createServer((req, res) => {
        const url = String(req.url || '/').split('?')[0];
        if (url === '/api/login' && req.method === 'POST') {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                let body: any = {};
                try { body = JSON.parse(raw); } catch { /* a bad body is a refusal */ }
                const ok = body.username === ACCOUNT.identity && body.password === ACCOUNT.password;
                res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
                res.end(JSON.stringify(ok ? { token: 'session-1' } : { error: 'invalid credentials' }));
            });
            return;
        }
        if (url === '/api/patients') {
            const ok = req.headers.authorization === 'Bearer session-1';
            res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
            res.end(JSON.stringify(ok ? PATIENTS : { error: 'sign in' }));
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(PAGE);
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { dir, url: `http://127.0.0.1:${(server.address() as any).port}/` };
}

const REQUEST = 'Build a clinic system: logins, patients with their status, invoices, an audit log, filters, and an Arabic/English language switch.';

/** The scope verdict the delivery records for the clinic, served live, with or without an account. */
async function scopeOf(signIn?: { identity: string; password: string }) {
    const { dir, url } = await clinic();
    const ledger = new DeliveryLedger();
    const lines: string[] = [];
    const delivery = deliveryRun({
        productRequest: REQUEST,
        ledger,
        deliveryRoles: { service: false, interface: true, program: false },
        deliveredRoots: (extra = []) => Array.from(new Set([dir, ...extra].filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))),
        deliveryParts: () => [{ root: dir, tool: 'general_agent' }],
        runTool: async () => { throw new Error('no tool expected'); },
        requireInstrument: () => { },
        log: line => lines.push(line),
        signIn,
    });
    await delivery.recordLiveAcceptance({ ok: true, output: { url, cwd: dir, kind: 'static-site' } }, dir, [dir]);
    return { scope: ledger.all().find(m => m.instrument === 'scope'), lines };
}

describe('the sign-in account task_finish gives', () => {
    it('is read as {username|email, password}, and a malformed one is refused with how to give it', () => {
        expect(parseSignInAccount({ username: 'admin', password: 'p' })).toEqual({ identity: 'admin', password: 'p' });
        expect(parseSignInAccount({ email: 'a@b.c', password: 'p' })).toEqual({ identity: 'a@b.c', password: 'p' });
        expect(parseSignInAccount({ username: 'admin' })).toBeNull();
        const ok = parseFinishArgs({ summary: 'done', sign_in: { username: 'admin', password: 'p' } });
        expect(ok).toEqual({ ok: true, value: { summary: 'done', sign_in: { identity: 'admin', password: 'p' } } });
        const bad = parseFinishArgs({ summary: 'done', sign_in: 'admin/p' });
        expect(bad.ok).toBe(false);
        expect((bad as any).error).toMatch(/"sign_in" must be an account the project seeds/u);
    });

    it('the certificate says Joe signed in with it — its name, never its password', () => {
        const base = { request: REQUEST, summary: 'clinic', language: 'ar', passed: ['live', 'browser'] };
        const signed = deliveryCertificate({ ...base, signedInAs: 'admin' });
        expect(signed).toMatch(/سجّل جو الدخول بحساب التجربة «admin» من نموذج الدخول نفسه/u);
        expect(signed).not.toContain('clinic-demo-1');
        //  Only when the browser check that signed in passed.
        expect(deliveryCertificate({ ...base, passed: ['live'], signedInAs: 'admin' })).not.toMatch(/بحساب التجربة/u);
        expect(deliveryCertificate(base)).not.toMatch(/بحساب التجربة/u);
    });

    it('is never shown with its password on the run\'s live events', () => {
        const shown = shownArgs('task_finish', { summary: 'done', sign_in: { identity: 'admin', password: 'clinic-demo-1' } });
        expect(JSON.stringify(shown)).not.toContain('clinic-demo-1');
        expect(shown).toMatchObject({ sign_in: { identity: 'admin', password: '[hidden]' } });
        expect(shownArgs('file_write', { path: 'a', content: 'password' })).toEqual({ path: 'a', content: 'password' });
    });
});

describe('H01: the live filter probe signs in through the product\'s own form', () => {
    it('with the account: the list behind the sign-in is filtered on the live page', async () => {
        const { scope, lines } = await scopeOf(ACCOUNT);
        expect(scope?.ok).toBe(true);
        expect(lines.join('\n')).toMatch(/interaction filtering shown: on the live page, choosing «(?:active|discharged)»/u);
    });

    it('without one: the sign-in page is not reported as the system, and Joe says what it needs', async () => {
        const { scope } = await scopeOf();
        expect(scope?.ok).toBe(false);
        expect(String(scope?.error)).toMatch(/opens on a sign-in form and task_finish gave no account to pass it: give task_finish "sign_in"/u);
    });

    it('with a wrong one: the product\'s own refusal is said', async () => {
        const { scope } = await scopeOf({ identity: 'admin', password: 'not-it' });
        expect(scope?.ok).toBe(false);
        expect(String(scope?.error)).toMatch(/signing in with the account task_finish gave failed: the product kept its sign-in form .*«Wrong username or password»/u);
    });
});

describe('H01: the Browser QA signs in, and presses the language switch last', () => {
    it('signed in, every control behind the sign-in is pressed — none «gone before I could press them»', async () => {
        const { dir, url } = await clinic();
        const audit: any = await auditBuiltApp(dir, { serveUrl: url, request: REQUEST, timeoutMs: 45_000, credentials: ACCOUNT, requireAuthenticatedCoverage: true });
        expect(audit.authenticated).toBe(true);
        const ids = audit.findings.map((f: any) => f.id);
        expect(ids).not.toContain('controls_not_reached');
        expect(ids).not.toContain('auth_failed');
        expect(ids).not.toContain('authenticated_coverage_missing');
        const pressed = (audit.controls || []).filter((c: any) => c.worked).map((c: any) => String(c.bare || c.label));
        expect(pressed).toEqual(expect.arrayContaining(['Invoices', 'Audit log']));
    });

    it('without an account, a product that shows a sign-in is not proven past its door', async () => {
        const { dir, url } = await clinic();
        const audit: any = await auditBuiltApp(dir, { serveUrl: url, request: REQUEST, timeoutMs: 30_000, requireAuthenticatedCoverage: true });
        expect(audit.findings.map((f: any) => f.id)).toContain('authenticated_coverage_missing');
    });
});
