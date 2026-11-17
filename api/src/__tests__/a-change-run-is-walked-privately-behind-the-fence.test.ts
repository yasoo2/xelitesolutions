/**
 * A CHANGE RUN IS WALKED IN A PRIVATE BROWSER, BEHIND THE FENCE (design v13.3 §2, §4, §5, §8; agent C).
 *
 * Real walks of `auditBuiltApp` on a tiny app with real servers: the app's own server, and «another address»
 * on a second port standing for the owner's other services or an outside host.
 *
 *   - a folder with no delivery record, walked with the door's options: as today (the page reaches the other
 *     address, as it does today), and a caller that passes none of the door's options gets no qaPath at all;
 *   - a delivered folder on Joe's static preview (path 1): the page's own POST reaches its own server, its POST
 *     to the other address is refused by the fence and told as `blocked`, and the console error it causes is
 *     not charged (12.2 rows 3, 4);
 *   - the audit's own server on a change run (12.1 row 5, 12.2 row 6): its origin is walked, and a POST to
 *     `/api/joe-external/*` is answered 403;
 *   - a delivered Node server the router refuses (path 3): no non-GET reaches the live app, a delete link is
 *     not walked and is listed «not tried» (§5.3, W2, W5);
 *   - a fence that cannot start (12.6 row 5): the walk runs as path 3, `fenceDown`, and still writes nothing;
 *   - the screencast (12.3 row 8): frames reach `broadcastBrowserEvent(streamTo, { type: 'stream_frame' })`,
 *     and the panel's own loop for that id is paused and resumed.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

jest.setTimeout(600_000);

interface Hit { method: string; url: string }
interface Served { url: string; port: number; hits: Hit[]; close(): Promise<void> }

function serve(handler: (req: http.IncomingMessage, res: http.ServerResponse, hits: Hit[]) => void): Promise<Served> {
    const hits: Hit[] = [];
    const srv = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => { hits.push({ method: String(req.method), url: String(req.url) }); handler(req, res, hits); });
    });
    return new Promise(resolve => srv.listen(0, '127.0.0.1', () => {
        const port = (srv.address() as any).port;
        resolve({ url: `http://127.0.0.1:${port}/`, port, hits, close: () => new Promise<void>(r => srv.close(() => r())) });
    }));
}

const page = (otherPort: number) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Shop</title></head>
<body><main><h1>Shop</h1>
<p><a href="/items/delete">Delete all</a></p>
<button id="add" style="min-width:48px;min-height:48px">Add</button>
<p id="out"></p>
<script>
  fetch('/own', { method: 'POST', body: 'x' }).catch(function () {});
  fetch('http://127.0.0.1:${otherPort}/steal', { method: 'POST', body: 'y' }).catch(function () {});
  document.getElementById('add').onclick = function () {
    fetch('/items', { method: 'POST', body: '{}' }).then(function () { document.getElementById('out').textContent = 'added'; }).catch(function () {});
  };
</script></main></body></html>`;

let other: Served;
let app: Served;
const made: string[] = [];

/** A project folder: `dist/index.html`, and, when `delivered`, the `.joe/delivered` marker (§2.1). */
function project(name: string, html: string, opts: { delivered: boolean; pkg?: object; files?: Record<string, string> }): string {
    const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), `joe-door-${name}-`));
    made.push(root);
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
    if (opts.delivered) {
        fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(root, '.joe', 'delivered'), '');
    }
    if (opts.pkg) fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(opts.pkg));
    for (const [rel, text] of Object.entries(opts.files || {})) fs.writeFileSync(path.join(root, rel), text);
    return root;
}

beforeAll(async () => {
    other = await serve((req, res) => { res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }); res.end('ok'); });
    app = await serve((req, res) => {
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            return res.end(page(other.port));
        }
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
    });
});
afterAll(async () => {
    await other?.close();
    await app?.close();
    for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* a locked file stays */ } }
    jest.restoreAllMocks();
});
beforeEach(() => { other.hits.length = 0; app.hits.length = 0; });

const audit = () => require('../core/quality/app-audit') as typeof import('../core/quality/app-audit');
const WALK = { timeoutMs: 20_000, walkMs: 12_000 };
const nonGet = (hits: Hit[]) => hits.filter(h => !/^(?:GET|HEAD|OPTIONS)$/.test(h.method));

describe('the door', () => {
    it('a folder with no delivery record is walked as today, and a caller with no door option gets no qaPath', async () => {
        const root = project('new', page(other.port), { delivered: false });
        const a = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'static' });
        expect(a.skipped).toBeUndefined();
        expect(a.qaPath?.path).toBe('as-today');
        //  Today's walk: no fence, so the page's POST reached the other address.
        expect(other.hits.some(h => h.method === 'POST' && h.url === '/steal')).toBe(true);

        other.hits.length = 0;
        const plain = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url });
        expect(plain.qaPath).toBeUndefined();
        expect(other.hits.some(h => h.method === 'POST' && h.url === '/steal')).toBe(true);
    });

    it('path 1: the page reaches its own origin only; the refused request is told, never charged', async () => {
        const root = project('static', page(other.port), { delivered: true });
        const a = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'static' });
        expect(a.skipped).toBeUndefined();
        expect(a.qaPath?.path).toBe('private-live');
        expect(other.hits).toEqual([]);
        expect(app.hits.some(h => h.method === 'POST' && h.url === '/own')).toBe(true);
        expect(a.qaPath!.blocked).toBeGreaterThanOrEqual(1);
        expect(a.qaPath!.blockedHosts).toContain(`127.0.0.1:${other.port}`);
        expect((a.qaPath!.windows || []).length).toBeGreaterThan(0);
        expect(a.findings.map(f => f.id)).not.toEqual(expect.arrayContaining(['console_errors']));
        expect(a.findings.map(f => f.id)).not.toEqual(expect.arrayContaining(['failed_requests']));
        expect(a.visible).toBe(false);
    });

    it('the audit\'s own server on a change run: its origin is walked, and /api/joe-external/* refuses a write', async () => {
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Own</title></head><body><main><h1>Own</h1>
<script>
  fetch('/api/joe-external/weather', { method: 'POST', body: '{}' })
    .then(function (r) { var i = new Image(); i.src = '/told-' + r.status + '.png'; document.body.appendChild(i); })
    .catch(function () {});
</script></main></body></html>`;
        const root = project('own', html, { delivered: true });
        const a = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, projectRoot: root });
        expect(a.skipped).toBeUndefined();
        expect(a.qaPath?.path).toBe('private-live');
        expect(a.qaPath!.blocked).toBe(0);
        //  The page's own server answered (the image request reached it: a 404 the walk saw, with the status in its name).
        const said = JSON.stringify(a.findings);
        expect(said).toContain('told-403.png');
    });

    it('path 3: no non-GET reaches the live app, and a delete link is not walked but listed', async () => {
        const root = project('server', page(other.port), {
            delivered: true,
            pkg: { name: 'shop', scripts: { start: 'node server.js' }, dependencies: { nodemailer: '6.9.0' } },
            files: { 'server.js': "require('http').createServer((q, s) => s.end('ok')).listen(process.env.PORT || 3000);\n" },
        });
        const a = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'npm-start' });
        expect(a.skipped).toBeUndefined();
        expect(a.qaPath?.path).toBe('no-write');
        expect(a.qaPath!.reasons.map(r => r.key)).toContain('sender');
        expect(nonGet(app.hits)).toEqual([]);
        expect(app.hits.some(h => /delete/.test(h.url))).toBe(false);
        expect(other.hits).toEqual([]);
        expect(a.qaPath!.notTried).toEqual(expect.arrayContaining(['link: Delete all']));
        expect(a.findings.map(f => f.id)).not.toEqual(expect.arrayContaining(['console_errors']));
    });

    it('a fence that cannot start makes the walk path 3, told as fenceDown, and it still writes nothing', async () => {
        const fence = require('../core/quality/qa-fence');
        const spy = jest.spyOn(fence, 'startQaFence').mockRejectedValueOnce(new Error('the fence could not listen'));
        try {
            const root = project('down', page(other.port), { delivered: true });
            const a = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'static' });
            expect(spy).toHaveBeenCalled();
            expect(a.qaPath?.path).toBe('no-write');
            expect(a.qaPath?.fenceDown).toBe(true);
            expect(a.qaPath?.comparable).toBe(true);
            expect(nonGet(app.hits)).toEqual([]);
            expect(nonGet(other.hits)).toEqual([]);
        } finally { spy.mockRestore(); }
    });
});

describe('the owner still watches', () => {
    it('the private walk is streamed to streamTo, with the panel\'s own loop paused and resumed', async () => {
        const hub = require('../modules/browser/wsHub');
        const manager = require('../modules/browser/manager');
        const SID = 'door-stream-proof';
        const frames: any[] = [];
        const watchers = jest.spyOn(hub, 'panelWatcherCount').mockImplementation((...args: unknown[]) => (args[0] === SID ? 1 : 0));
        const sent = jest.spyOn(hub, 'broadcastBrowserEvent').mockImplementation((...args: unknown[]) => { if (args[0] === SID && (args[1] as any)?.type === 'stream_frame') frames.push(args[1]); });
        let resumed = 0;
        const realPause = manager.pauseStreaming;
        const pause = jest.spyOn(manager, 'pauseStreaming').mockImplementation((...args: unknown[]) => {
            const r = realPause(args[0] as string);
            return () => { resumed++; r(); };
        });
        try {
            const root = project('stream', page(other.port), { delivered: true });
            const a = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'static', streamTo: SID, requireVisibleBrowser: true });
            expect(a.skipped).toBeUndefined();
            expect(pause).toHaveBeenCalledWith(SID);
            expect(resumed).toBe(1);
            expect(manager.isStreamingPaused(SID)).toBe(false);
            expect(frames.length).toBeGreaterThan(0);
            expect(frames[0]).toEqual(expect.objectContaining({ type: 'stream_frame', jpegBase64: expect.any(String) }));
            expect(frames[0].w).toBeGreaterThan(0);
            expect(frames[0].h).toBeGreaterThan(0);
            expect(a.qaPath?.streamed).toBe(true);
            expect(a.visible).toBe(true);
            //  The panel-wide id is never a stream target.
            frames.length = 0;
            const shared = await audit().auditBuiltApp(path.join(root, 'dist'), { ...WALK, serveUrl: app.url, projectRoot: root, startKind: 'static', streamTo: 'panel-browser' });
            expect(shared.qaPath?.streamed).toBe(false);
        } finally {
            watchers.mockRestore();
            sent.mockRestore();
            pause.mockRestore();
        }
    });
});
