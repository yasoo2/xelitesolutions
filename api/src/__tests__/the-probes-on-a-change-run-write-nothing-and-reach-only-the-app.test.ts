/**
 * ⛔ THE PROBES THAT OPEN THEIR OWN BROWSER, ON A CHANGE RUN (design v13.3 §6, §4.4).
 *
 * The interaction probe (search, filtering, sorting) and the role probe (what each role may see) launch a
 * Chromium of their own. On a change run they take `browserProxy` from the verification's fence, so their
 * browser reaches the app's own address and nothing else; on the no-write walk (path 3) they also run under
 * the guard:
 *   - the interaction probe types into a search box but never presses Enter, never presses an apply/submit
 *     button, and does not press a chip or open a door whose words delete;
 *   - the role probe signs in once per role through the guard's allowance — the only write the app sees —
 *     and does not press a door whose words delete.
 * A caller that passes neither option gets the probe exactly as before.
 *
 * Real browsers, a real fence and real servers that log every request.
 */
import http from 'http';
import { measureInteractions } from '../core/quality/interaction-probe';
import { measureRoles } from '../core/quality/role-probe';
import { startQaFence } from '../core/quality/qa-fence';

jest.setTimeout(300_000);

const servers: http.Server[] = [];
afterAll(async () => { for (const s of servers) await new Promise<void>(r => s.close(() => r())); });

async function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse, body: string) => void): Promise<{ origin: string; log: string[] }> {
    const log: string[] = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => { log.push(`${req.method} ${req.url}`); handler(req, res, body); });
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { origin: `http://127.0.0.1:${(server.address() as any).port}`, log };
}
const html = (res: http.ServerResponse, page: string) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); };
const json = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

/** Another service on this machine: the fence must keep the probe's browser from it. */
async function elsewhere() { return serve((_req, res) => json(res, 200, { ok: true })); }

/*
 * A notes page: a search box INSIDE an entry form (GET, so an Enter would send what was typed), a period
 * filter whose form has an «Apply», and chips — one of them «Archive all».
 */
const notesPage = (beacon: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Notes</title></head><body>
<h1>Notes</h1>
<form id="entry" method="get" action="/notes/new">
  <label>Title <input name="title"></label>
  <label>Search notes <input type="search" name="q"></label>
  <button type="submit">Save note</button>
</form>
<form id="period" method="get" action="/notes/period"><label>Period <select name="p"><option>all</option><option>week</option></select></label><button type="submit">Apply</button></form>
<div class="chips"><button type="button" id="all">All</button><button type="button" id="arch">Archive all</button></div>
<ul id="list"><li>alpha meeting notes</li><li>beta shopping list</li><li>gamma travel plan</li></ul>
<script>
  document.getElementById('arch').onclick = () => { fetch('/notes/chip-pressed').catch(() => null); };
  //  A read of another service (a GET passes the guard): only the fence keeps it in.
  fetch(${JSON.stringify(beacon)}).catch(() => null);
</script></body></html>`;

test('the interaction probe on the no-write walk types without Enter, presses no apply and no delete chip, behind the fence', async () => {
    const other = await elsewhere();
    const app = await serve((req, res) => html(res, notesPage(`${other.origin}/beacon`)));
    const fence = await startQaFence({ allow: [app.origin] });
    try {
        const measured = await measureInteractions(`${app.origin}/`, ['search', 'filtering'], { timeoutMs: 60_000, qaPath: 'no-write', browserProxy: fence.proxy });
        expect(measured.measured).toBe(true);
        //  Typed, never sent: no request of either form reached the app, nor the chip's.
        expect(app.log.filter(l => /^GET \/notes\//.test(l))).toEqual([]);
        expect(app.log.filter(l => !/^GET /.test(l))).toEqual([]);
        expect(measured.notTried).toEqual(expect.arrayContaining(['control: Apply', 'control: Archive all']));
        //  Behind the fence: the page's request to another service never left the browser.
        expect(other.log).toEqual([]);
        expect(fence.appRefusals().some(r => r.what.includes(other.origin.replace('http://', '')))).toBe(true);
        expect(fence.windows().length).toBeGreaterThan(0);
    } finally {
        await fence.close();
    }
});

test('the interaction probe without the new options is the probe it was: Enter pressed, apply pressed, every chip pressed', async () => {
    const other = await elsewhere();
    const app = await serve((req, res) => html(res, notesPage(`${other.origin}/beacon`)));
    const measured = await measureInteractions(`${app.origin}/`, ['search', 'filtering'], { timeoutMs: 60_000 });
    expect(measured.measured).toBe(true);
    expect(measured.notTried).toBeUndefined();
    expect(app.log.some(l => /^GET \/notes\/(?:new|period|chip-pressed)/.test(l))).toBe(true);
    expect(other.log.length).toBeGreaterThan(0);
});

const ACCOUNTS = [
    { identity: 'manager', password: 'manager-demo-1', role: 'manager' },
    { identity: 'clerk', password: 'clerk-demo-1', role: 'clerk' },
];
const CLINIC = `<!doctype html><html><head><meta charset="utf-8"><title>Office</title></head><body><div id="root"></div><script>
const root = document.getElementById('root');
const call = (path) => fetch(path, { headers: { authorization: 'Bearer ' + localStorage.getItem('token') } }).then(r => r.json());
function signIn() {
  root.innerHTML = '<form id="f"><h2>Sign in</h2><input name="username" autocomplete="username"><input type="password" name="password"><button type="submit">Sign in</button></form>';
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
  root.innerHTML = '<nav>' + me.screens.map(s => '<button type="button" data-s="' + s + '">' + s + '</button>').join('') + '<button type="button" id="purge">Purge records</button></nav><main id="m"></main>';
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { document.getElementById('m').textContent = JSON.stringify(await call('/api/' + b.dataset.s.toLowerCase())); });
  document.getElementById('purge').onclick = () => { fetch('/api/door-pressed').catch(() => null); };
}
if (localStorage.getItem('token')) app(); else signIn();
</script></body></html>`;

async function office() {
    return serve((req, res, body) => {
        const url = String(req.url || '/').split('?')[0];
        if (url === '/api/login' && req.method === 'POST') {
            const b = JSON.parse(body || '{}');
            const a = ACCOUNTS.find(x => x.identity === b.username && x.password === b.password);
            return a ? json(res, 200, { token: `t-${a.role}` }) : json(res, 401, { error: 'invalid' });
        }
        if (url.startsWith('/api/')) {
            const role = String(req.headers.authorization || '').replace(/^Bearer t-/u, '');
            if (url === '/api/me') return json(res, 200, { screens: role === 'manager' ? ['Orders', 'Revenue'] : ['Orders'] });
            if (url === '/api/revenue') return role === 'manager' ? json(res, 200, { total: 4200 }) : json(res, 403, { error: 'forbidden' });
            return json(res, 200, [{ id: 1 }]);
        }
        html(res, CLINIC);
    });
}

test('the role probe on the no-write walk signs in once per role, presses no delete door, behind the fence', async () => {
    const app = await office();
    const fence = await startQaFence({ allow: [app.origin] });
    try {
        const m = await measureRoles(`${app.origin}/`, ACCOUNTS, { timeoutMs: 120_000, qaPath: 'no-write', browserProxy: fence.proxy });
        expect(m.measured).toBe(true);
        expect(m.leaks).toEqual([]);
        //  The only writes the app saw: one sign-in per role.
        expect(app.log.filter(l => !/^GET /.test(l))).toEqual(['POST /api/login', 'POST /api/login']);
        expect(app.log.some(l => l.includes('/api/door-pressed'))).toBe(false);
        expect(m.notTried).toContain('control: Purge records');
        expect(fence.windows().length).toBeGreaterThan(0);
    } finally {
        await fence.close();
    }
});

test('the role probe without the new options presses every door as before', async () => {
    const app = await office();
    const m = await measureRoles(`${app.origin}/`, ACCOUNTS, { timeoutMs: 120_000 });
    expect(m.measured).toBe(true);
    expect(m.notTried).toBeUndefined();
    expect(app.log.some(l => l.includes('/api/door-pressed'))).toBe(true);
});
