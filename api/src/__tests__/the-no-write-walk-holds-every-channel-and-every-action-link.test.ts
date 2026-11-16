/**
 * THE NO-WRITE WALK HOLDS EVERY CHANNEL AND EVERY ACTION LINK (review 7, B1 prevention, B2, M2).
 *
 * Review 7 proved two holes in path 3, the walk that must save nothing in the owner's live app:
 *   B1  a «Mark done» link (`GET /tasks/1/done`, the classic Express pattern) was followed, and his open tasks were
 *       marked done — while he was told nothing was saved and «not tried: —»;
 *   B2  a SharedWorker's POST and a dedicated worker's WebSocket frame never pass `context.route`, so they reached
 *       his server; one shared worker marked all his notifications read.
 *
 * Here the real `auditBuiltApp` walks an in-process owner app (his `.joe/history.json` holds a delivered run, he
 * depends on nodemailer, so the door chooses path 3 by itself), and the real guard and fence are driven channel by
 * channel; the owner's server logs what it RECEIVES.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { WebSocketServer } from 'ws';
import { addressShape, createLiveDataGuard, isActionUrl, isWritingGet } from '../core/quality/live-data-guard';
import { startQaFence } from '../core/quality/qa-fence';

jest.setTimeout(300_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r7-hold-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

describe('W10 — what an action GET is', () => {
    it('a path segment that names an action, in English or Arabic, and never a static file or a page', () => {
        for (const u of ['/tasks/1/done', '/tasks/2/complete', '/tasks/2/approve', '/notifications/mark-as-read', '/posts/3/like', '/logout',
            '/orders/7/cancel', '/items/4/toggle', '/subscribe?list=a', '/x?action=archive', '/x?_method=DELETE', '/مهام/3/تم', '/طلبات/2/إلغاء']) {
            expect([u, isActionUrl(`http://127.0.0.1:5000${u}`)]).toEqual([u, true]);
        }
        for (const u of ['/', '/about', '/tasks', '/tasks/1', '/reader', '/done.css', '/js/toggle.js', '/img/like.png', '/x?action=view', '/products?sort=complete']) {
            expect([u, isActionUrl(`http://127.0.0.1:5000${u}`)]).toEqual([u, false]);
        }
        expect(isWritingGet('http://127.0.0.1:5000/tasks/1/done')).toBe(false);   // W4 alone never caught it (B1)
        expect(addressShape('http://h/tasks/12/star')).toBe('/tasks/:id/star');
    });
});

/** The owner's delivered app: tasks with «Mark done» and «Star» GET links, notifications a shared worker marks read. */
function ownerApp(withWorker: boolean) {
    const dir = fs.mkdtempSync(path.join(tmp, 'owner-'));
    for (const d of ['.joe', 'data', 'public']) fs.mkdirSync(path.join(dir, d), { recursive: true });
    fs.writeFileSync(path.join(dir, '.joe', 'history.json'), JSON.stringify([{ request: 'the first build', status: 'delivered', summary: '', at: 1 }]));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'tasks', scripts: { start: 'node server.js' }, dependencies: { nodemailer: '^6' } }));
    fs.writeFileSync(path.join(dir, 'server.js'), "require('http').createServer(()=>{}).listen(process.env.PORT||3000);\n");
    const TASKS = path.join(dir, 'data', 'tasks.json');
    const NOTES = path.join(dir, 'data', 'notifications.json');
    fs.writeFileSync(TASKS, JSON.stringify([{ id: 1, title: 'Pay the supplier invoice 4471', done: false, star: false }, { id: 2, title: 'Call the bank', done: false, star: false }], null, 1));
    fs.writeFileSync(NOTES, JSON.stringify([{ id: 1, text: 'Client replied', read: false }, { id: 2, text: 'Invoice overdue', read: false }], null, 1));
    const before = { tasks: fs.readFileSync(TASKS, 'utf8'), notes: fs.readFileSync(NOTES, 'utf8') };
    const page = () => {
        const tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8'));
        return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Office tasks</title></head><body>
<header><nav><a href="/">Tasks</a> <a href="/about">About</a></nav></header>
<main><h1>Office tasks</h1><ul>${tasks.map((t: any) => `<li>${t.title} — ${t.done ? 'done' : 'open'} <a href="/tasks/${t.id}/done">Mark done</a> <a href="/tasks/${t.id}/star">Star</a></li>`).join('')}</ul></main>
<script>${withWorker ? "try { var w = new SharedWorker('/sync.js'); w.port.start(); } catch (e) {}" : ''}</script></body></html>`;
    };
    const received: string[] = [];
    const srv = http.createServer((q, r) => {
        let b = ''; q.on('data', x => { b += x; }); q.on('end', () => {
            if (!/favicon/.test(String(q.url))) received.push(`${q.method} ${q.url}`);
            const m = String(q.url).match(/^\/tasks\/(\d+)\/(done|star)$/);
            if (m && q.method === 'GET') {
                const tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8'));
                const t = tasks.find((x: any) => x.id === Number(m[1])); if (t) t[m[2]] = true;
                fs.writeFileSync(TASKS, JSON.stringify(tasks, null, 1));
                r.writeHead(302, { location: '/' }); r.end(); return;
            }
            if (q.url === '/api/notifications/read-all' && q.method === 'POST') {
                const notes = JSON.parse(fs.readFileSync(NOTES, 'utf8')); notes.forEach((n: any) => { n.read = true; });
                fs.writeFileSync(NOTES, JSON.stringify(notes, null, 1)); r.writeHead(204); r.end(); return;
            }
            if (q.url === '/sync.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); r.end("onconnect = function(){ fetch('/api/notifications/read-all', { method: 'POST' }).catch(function(){}); };"); return; }
            if (q.url === '/about') { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>About</title><main><h1>About</h1><a href="/">Back</a></main>'); return; }
            r.writeHead(200, { 'content-type': 'text/html' }); r.end(page());
        });
    });
    fs.writeFileSync(path.join(dir, 'public', 'index.html'), page());
    return { dir, TASKS, NOTES, before, received, srv };
}

async function walk(app: ReturnType<typeof ownerApp>) {
    await new Promise<void>(res => app.srv.listen(0, '127.0.0.1', () => res()));
    const url = `http://127.0.0.1:${(app.srv.address() as any).port}/`;
    const { auditBuiltApp } = require('../core/quality/app-audit');
    try {
        return await auditBuiltApp(path.join(app.dir, 'public'), {
            request: 'an office task list', serveUrl: url, artifactRootDir: app.dir, requireVisibleBrowser: true, timeoutMs: 45_000,
            requireAuthenticatedCoverage: true, projectRoot: app.dir, qaPin: { record: 'history' }, serverRoot: app.dir, startKind: 'npm-start', walkedOrigins: [url],
        });
    } finally {
        await new Promise<void>(res => app.srv.close(() => res()));
    }
}

describe('B1 — the real walk on path 3 never follows a «Mark done» link', () => {
    it('his tasks are untouched, no action GET reached his server, and every one is told «not tried»', async () => {
        const app = ownerApp(false);
        const audit = await walk(app);
        expect(audit.qaPath?.path).toBe('no-write');
        expect(app.received.filter(r => /\/done$/.test(r))).toEqual([]);
        expect(fs.readFileSync(app.TASKS, 'utf8').includes('"done": true')).toBe(false);
        expect((audit.qaPath?.notTried || []).filter((l: string) => /Mark done/.test(l)).length).toBeGreaterThan(0);
        //  W10: a GET that redirected («Star») is a write signal, told — and no second address of its shape is opened.
        const stars = app.received.filter(r => /\/star$/.test(r));
        expect(stars.length).toBeLessThanOrEqual(1);
        if (stars.length) expect(audit.qaPath?.writeSignals).toEqual([stars[0].replace(/^GET /, '')]);
    });
});

describe('B2 — a shared worker on his page saves nothing on path 3', () => {
    it('the real walk: his notifications stay unread, and the held write is told «not tried»', async () => {
        const app = ownerApp(true);
        const audit = await walk(app);
        expect(audit.qaPath?.path).toBe('no-write');
        expect(app.received.filter(r => /^POST /.test(r))).toEqual([]);
        expect(fs.readFileSync(app.NOTES, 'utf8')).toBe(app.before.notes);
        expect((audit.qaPath?.notTried || []).some((l: string) => /POST \/api\/notifications\/read-all/.test(l))).toBe(true);
    });
});

describe('B2 — channel by channel, behind the fence that holds writes', () => {
    it('a dedicated worker\'s fetch and WebSocket frame, a shared worker\'s POST and a page frame never reach him; the one sign-in does', async () => {
        const { chromium } = require('playwright');
        const received: string[] = [];
        const WORKER = "self.onmessage = function(){ fetch('/api/worker-post', { method: 'POST', body: 'w' }).catch(function(){}); try { var ws = new WebSocket('ws://' + self.location.host + '/live'); ws.onopen = function(){ ws.send('frame-from-worker: delete order 7'); }; } catch (e) {} };";
        const SHARED = "onconnect = function(){ fetch('/api/shared-post', { method: 'POST', body: 's' }).catch(function(){}); };";
        const srv = http.createServer((q, r) => {
            let b = ''; q.on('data', x => { b += x; }); q.on('end', () => {
                if (!/favicon/.test(String(q.url))) received.push(`${q.method} ${q.url}${b ? ` BODY ${b.slice(0, 40)}` : ''}`);
                if (q.url === '/w.js' || q.url === '/s.js') { r.writeHead(200, { 'content-type': 'text/javascript' }); r.end(q.url === '/w.js' ? WORKER : SHARED); return; }
                r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>t</title><h1>t</h1>');
            });
        });
        const wss = new WebSocketServer({ server: srv });
        wss.on('connection', ws => ws.on('message', m => received.push(`WS-FRAME ${String(m).slice(0, 60)}`)));
        await new Promise<void>(res => srv.listen(0, '127.0.0.1', () => res()));
        const origin = `http://127.0.0.1:${(srv.address() as any).port}`;
        const account = { identity: 'owner@shop.example', password: 'Secret-1234' };
        const fence = await startQaFence({ allow: [origin], hold: true, signIn: account });
        const browser = await chromium.launch({ headless: true, proxy: fence.proxy });
        try {
            const context = await browser.newContext({ serviceWorkers: 'block' });
            const guard = await createLiveDataGuard(context, { signIn: account });
            const page = await context.newPage();
            await page.goto(`${origin}/`, { waitUntil: 'load' });
            await page.evaluate(() => { const w = new Worker('/w.js'); w.postMessage(1); });
            await page.evaluate(() => { const s = new SharedWorker('/s.js'); s.port.start(); });
            await page.evaluate(() => new Promise<void>(res => { const ws = new WebSocket(`ws://${location.host}/live`); ws.onopen = () => { ws.send('frame-from-page'); setTimeout(res, 300); }; ws.onerror = () => res(); }));
            await page.waitForTimeout(2500);
            expect(received.filter(r => /^POST |^WS-FRAME/.test(r))).toEqual([]);
            //  W7 still lets the one sign-in through, guard and fence alike.
            await guard.allowing(account, () => page.evaluate(([id, pw]: string[]) => fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: id, password: pw }) }).then(() => undefined), [account.identity, account.password]));
            await page.waitForTimeout(500);
            expect(received.filter(r => /^POST /.test(r)).map(r => r.split(' BODY')[0])).toEqual(['POST /api/login']);
            expect(fence.held().map(h => h.what.replace(/127\.0\.0\.1:\d+/u, 'H'))).toEqual(expect.arrayContaining(['POST H/api/shared-post', 'WS H/live']));
            await context.close();
        } finally {
            await browser.close().catch(() => undefined);
            await fence.close();
            wss.close();
            await new Promise<void>(res => srv.close(() => res()));
        }
    });

    it('with no fence that can read the traffic, workers are never created, and each one asked for is told «not tried»', async () => {
        const { chromium } = require('playwright');
        const received: string[] = [];
        const srv = http.createServer((q, r) => { received.push(`${q.method} ${q.url}`); r.writeHead(200, { 'content-type': q.url === '/w.js' ? 'text/javascript' : 'text/html' }); r.end(q.url === '/w.js' ? "fetch('/api/from-worker')" : '<!doctype html><title>t</title><h1>t</h1>'); });
        await new Promise<void>(res => srv.listen(0, '127.0.0.1', () => res()));
        const origin = `http://127.0.0.1:${(srv.address() as any).port}`;
        const browser = await chromium.launch({ headless: true });
        try {
            const context = await browser.newContext({ serviceWorkers: 'block' });
            const guard = await createLiveDataGuard(context, { holdWorkers: true });
            const page = await context.newPage();
            await page.goto(`${origin}/`, { waitUntil: 'load' });
            const thrown = await page.evaluate(() => { const out: string[] = []; for (const make of [() => new Worker('/w.js'), () => new SharedWorker('/w.js')]) { try { make(); out.push('created'); } catch (e: any) { out.push(String(e?.name)); } } return out; });
            await page.waitForTimeout(500);
            expect(thrown).toEqual(['SecurityError', 'SecurityError']);
            expect(received.filter(r => /w\.js|from-worker/.test(r))).toEqual([]);
            expect(guard.notTriedLabels.filter(l => l.startsWith('channel:')).length).toBe(2);
            expect(guard.drops('Uncaught SecurityError: Worker is held by Joe\'s checks')).toBe('blocked-text');
            await context.close();
        } finally {
            await browser.close().catch(() => undefined);
            await new Promise<void>(res => srv.close(() => res()));
        }
    });
});

describe('M2 — a plain GET read explains no change to his data', () => {
    it('the fence marks each forwarded request: a GET read writes nothing, a POST or a redirect may', async () => {
        const srv = http.createServer((q, r) => { if (q.url === '/go') { r.writeHead(302, { location: '/' }); r.end(); return; } r.writeHead(200); r.end('ok'); });
        await new Promise<void>(res => srv.listen(0, '127.0.0.1', () => res()));
        const origin = `http://127.0.0.1:${(srv.address() as any).port}`;
        const fence = await startQaFence({ allow: [origin] });
        try {
            const via = (method: string, p: string) => new Promise<void>((res) => {
                const proxy = new URL(fence.proxy.server);
                const req = http.request({ host: proxy.hostname, port: Number(proxy.port), method, path: `${origin}${p}`, headers: { host: new URL(origin).host } }, resp => { resp.resume(); resp.on('end', () => res()); });
                req.on('error', () => res());
                req.end(method === 'POST' ? 'x' : undefined);
            });
            await via('GET', '/read');
            await via('POST', '/save');
            await via('GET', '/go');
            await new Promise(r => setTimeout(r, 300));
            const w = fence.windows().map(x => [x.what.replace(/127\.0\.0\.1:\d+/u, 'H'), x.writes]);
            expect(w).toEqual([['GET H/read', false], ['POST H/save', true], ['GET H/go', true]]);
        } finally {
            await fence.close();
            await new Promise<void>(res => srv.close(() => res()));
        }
    });
});
