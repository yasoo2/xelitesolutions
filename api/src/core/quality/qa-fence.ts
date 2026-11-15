/**
 * THE DEFAULT-DENY FENCE: THE WALK'S BROWSER REACHES THE WALKED ORIGIN AND NOTHING ELSE.
 *
 * Design v13.3 §4. Every walk that is not a new build launches its private Chromium with
 * `proxy: { server: <this fence>, bypass: '<-loopback>' }`. `'<-loopback>'` removes Chromium's built-in loopback
 * bypass, so the fence is the browser's WHOLE network: pages, popups, iframes, dedicated, shared and service
 * workers, and WebSockets (CONNECT) all pass through it, under every spelling of every host.
 *
 * It forwards, any method, only to a walked origin — the exact `host:port` the browser asked for, so
 * `http://127.0.0.1:4317` allows `127.0.0.1:4317` and `localhost:4317` is another spelling, refused. Everything
 * else — other loopback ports and spellings, the LAN, the owner's other services, other users' apps on a shared
 * server, every outside host — is refused (`403` with `x-joe-fence: refused`, or `HTTP/1.1 403` on CONNECT) and
 * recorded.
 *
 * It runs in a `worker_threads` Worker of Joe's own process, created inline from source text (the pattern
 * `EngineFileTools.ts › startParser` uses), so it works from the esbuild bundle and under ts-node alike and no
 * file is loaded beside this one. It starts no process, and it keeps the proxying off Joe's event loop.
 * When it cannot start, `startQaFence` rejects and the walk runs as path 3 (§4.5) — the caller's rule.
 *
 * The fence covers the BROWSER only, never the app's server.
 */
import { Worker } from 'worker_threads';

/** One refused request: `'POST 127.0.0.1:5055/api/orders'`, `'CONNECT api.x.sa:443'`; `at` is when it was refused. */
export interface QaFenceRefusal { what: string; at: number }

/**
 * A stretch of time in which the verification itself may have made the app write (§5b step 4).
 * From the fence: one per forwarded request, from its start to the end of its response; a response open more
 * than 5 s, or a tunnel (a WebSocket), is `long` and counts only for its first second. `what` names it.
 */
export interface QaWindow { start: number; end: number; long: boolean; what: string }

export interface QaFence {
    /** What to pass to `chromium.launch({ proxy })`. */
    proxy: { server: string; bypass: '<-loopback>' };
    /** Adds a walked origin (`scheme://host:port`), e.g. the audit's own server the moment it listens (§4.2, §4.4). */
    allow(origin: string): void;
    /** Everything refused, Chromium's own traffic included. */
    refusals(): QaFenceRefusal[];
    /** The refusals minus what Chromium sends by itself (`BROWSER_OWN`): what the owner is told as `blocked` (§4.3). */
    appRefusals(): QaFenceRefusal[];
    /** Every forwarded request as a window (§5b step 3); a response open > 5 s or a tunnel: `long`. */
    windows(): QaWindow[];
    /**
     * Whether a console message, page error or failed request is the fence's own doing, so never charged (§4.3), on
     * EVERY fenced path: `'refused-url'` its URL (or a URL its text names) was refused; `'refused-text'` it names the
     * fence's refusal (`ERR_TUNNEL_CONNECTION_FAILED`, `x-joe-fence`); `'refused-window'` it came within 1,500 ms
     * after a refusal of a request the page made. `''`: charge it as today.
     */
    drops(text: string, url?: string): '' | 'refused-url' | 'refused-text' | 'refused-window';
    /** Stops the worker; every connection through it ends. */
    close(): Promise<void>;
}

/**
 * What Chromium sends by itself (measured, `accounts-lab/v13/out-bg-traffic.txt`): refused like everything else,
 * never told as the app's. Tested against a refusal's `what`.
 */
export const BROWSER_OWN = /(?:^|\s)(?:CONNECT |GET )(?:update\.googleapis\.com|clients\d*\.google\.com|accounts\.google\.com|www\.google\.com|content-autofill\.googleapis\.com|android\.clients\.google\.com|optimizationguide-pa\.googleapis\.com|safebrowsing\.googleapis\.com|[\w-]+\.gvt1\.com)[:/]/;

/** A console message that names the fence's refusal. */
const FENCE_TEXT = /ERR_TUNNEL_CONNECTION_FAILED|x-joe-fence/i;
/** How long after a refusal the page's messages are its consequence (W9's window). */
export const FENCE_DROP_WINDOW_MS = 1500;
/** A forwarded response open longer than this is `long` (an SSE stream, a long poll). */
export const FENCE_LONG_MS = 5000;
/** How long the worker may take to listen before the fence is called down. */
const START_TIMEOUT_MS = 10_000;
/** Bounds on what is kept in memory for one walk. */
const MAX_KEPT = 20_000;

/**
 * The worker, as source text (`{ eval: true }`). Plain CommonJS; it talks to the parent with small messages:
 *   → { type: 'listening', port } | { type: 'error', message } | { type: 'refused', what, at }
 *   → { type: 'open', id, start, what, tunnel } | { type: 'close', id, end } | { type: 'burst', start, end, what }
 *   ← { type: 'allow', key }
 */
const QA_FENCE_SOURCE = String.raw`
'use strict';
const { parentPort, workerData } = require('worker_threads');
const http = require('http');
const net = require('net');
const allowed = new Set(workerData.allow || []);
const keyOf = (h, p) => String(h).toLowerCase().replace(/^\[|\]$/g, '') + ':' + String(p);
const bare = h => String(h).replace(/^\[|\]$/g, '');
let seq = 0;
const tell = m => { try { parentPort.postMessage(m); } catch (e) { /* the parent is gone */ } };
parentPort.on('message', m => { if (m && m.type === 'allow' && typeof m.key === 'string') allowed.add(m.key); });
const refuse = what => tell({ type: 'refused', what, at: Date.now() });
const HOP = new Set(['proxy-connection', 'proxy-authorization', 'keep-alive', 'connection', 'transfer-encoding', 'te', 'trailer', 'upgrade']);
const server = http.createServer((q, r) => {
  q.on('error', () => {}); r.on('error', () => {});
  let u; try { u = new URL(q.url); } catch (e) { refuse(String(q.method).toUpperCase() + ' ' + String(q.url).slice(0, 200)); r.writeHead(403, { 'x-joe-fence': 'refused' }); return r.end(); }
  const m = String(q.method).toUpperCase();
  const port = u.port || (u.protocol === 'https:' ? 443 : 80);
  if (u.protocol !== 'http:' || !allowed.has(keyOf(u.hostname, port))) {
    refuse(m + ' ' + u.host + u.pathname); r.writeHead(403, { 'x-joe-fence': 'refused', 'content-type': 'text/plain' }); return r.end('refused by Joe: not the walked origin');
  }
  const id = ++seq; tell({ type: 'open', id, start: Date.now(), what: m + ' ' + u.host + u.pathname, tunnel: false });
  let closed = false; const closeWin = () => { if (closed) return; closed = true; tell({ type: 'close', id, end: Date.now() }); };
  r.on('close', closeWin);
  const headers = {}; for (const [k, v] of Object.entries(q.headers)) if (!HOP.has(k.toLowerCase())) headers[k] = v;
  const up = http.request({ host: bare(u.hostname), port, path: u.pathname + u.search, method: m, headers }, ur => {
    const back = {}; for (const [k, v] of Object.entries(ur.headers)) if (!HOP.has(k.toLowerCase())) back[k] = v;
    r.writeHead(ur.statusCode || 502, back); ur.pipe(r);
  });
  up.on('error', () => { try { if (!r.headersSent) r.writeHead(502); r.end(); } catch (e) { /* gone */ } closeWin(); });
  q.pipe(up);
});
server.on('clientError', (e, sock) => { try { sock.destroy(); } catch (x) { /* gone */ } });
const tunnel = (what, start, sock, up) => {
  const id = ++seq; tell({ type: 'open', id, start, what, tunnel: true });
  let burst = null;
  sock.on('data', () => {
    const t = Date.now();
    if (burst) { burst.end = t; return; }
    burst = { start: t, end: t };
    setTimeout(() => { const b = burst; burst = null; if (b) tell({ type: 'burst', start: b.start, end: b.end, what: what + ' bytes' }); }, 100);
  });
  let closed = false; const done = () => { if (closed) return; closed = true; tell({ type: 'close', id, end: Date.now() }); };
  sock.on('close', done); up.on('close', done);
};
server.on('connect', (q, sock, head) => {
  sock.on('error', () => {});
  const parts = String(q.url).split(/:(?=\d+$)/); const h = parts[0]; const p = parts[1] || '443';
  if (!allowed.has(keyOf(h, p))) { refuse('CONNECT ' + q.url); sock.end('HTTP/1.1 403 Forbidden\r\nx-joe-fence: refused\r\n\r\n'); return; }
  const start = Date.now();
  const up = net.connect(Number(p), bare(h), () => { sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head && head.length) up.write(head); up.pipe(sock); sock.pipe(up); });
  up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  tunnel('CONNECT ' + q.url, start, sock, up);
});
server.on('upgrade', (q, sock, head) => {
  sock.on('error', () => {});
  let u; try { u = new URL(q.url); } catch (e) { refuse('UPGRADE ' + String(q.url).slice(0, 200)); sock.end('HTTP/1.1 403 Forbidden\r\nx-joe-fence: refused\r\n\r\n'); return; }
  const port = u.port || 80;
  if (!allowed.has(keyOf(u.hostname, port))) { refuse('UPGRADE ' + u.host + u.pathname); sock.end('HTTP/1.1 403 Forbidden\r\nx-joe-fence: refused\r\n\r\n'); return; }
  const start = Date.now();
  const up = net.connect(Number(port), bare(u.hostname), () => {
    let text = String(q.method) + ' ' + (u.pathname + u.search) + ' HTTP/1.1\r\n';
    for (let i = 0; i < q.rawHeaders.length; i += 2) if (!/^proxy-/i.test(q.rawHeaders[i])) text += q.rawHeaders[i] + ': ' + q.rawHeaders[i + 1] + '\r\n';
    up.write(text + '\r\n'); if (head && head.length) up.write(head); up.pipe(sock); sock.pipe(up);
  });
  up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
  tunnel('UPGRADE ' + u.host + u.pathname, start, sock, up);
});
server.on('error', e => tell({ type: 'error', message: String(e && e.message || e) }));
server.listen(Number(workerData.port) || 0, '127.0.0.1', () => tell({ type: 'listening', port: server.address().port }));
`;

/** `host:port` as the fence compares it: lowercased, IPv6 brackets off, the scheme's default port filled in. */
function originKey(origin: string): string | null {
    try {
        const u = new URL(origin);
        const port = u.port || (u.protocol === 'https:' || u.protocol === 'wss:' ? '443' : '80');
        return `${u.hostname.toLowerCase().replace(/^\[|\]$/g, '')}:${port}`;
    } catch { return null; }
}

/** What a refusal's `what` names, to match a URL against: `host/path` for a request, `host:port` for a tunnel. */
function refusalTargets(what: string): { pathKey?: string; tunnelKey?: string; host?: string } {
    const m = what.match(/^(\S+) (\S+)$/);
    if (!m) return {};
    const [, method, rest] = m;
    if (method === 'CONNECT') {
        const host = rest.replace(/:\d+$/, '');
        return { tunnelKey: rest.toLowerCase().replace(/^\[|\](?=:)/g, ''), host: host.replace(/^\[|\]$/g, '').toLowerCase() };
    }
    const slash = rest.indexOf('/');
    const hostPart = slash < 0 ? rest : rest.slice(0, slash);
    return { pathKey: rest.toLowerCase(), host: hostPart.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase() };
}

/**
 * Starts a fence that allows `allow` (walked origins, `scheme://host:port`). Rejects when the worker cannot start
 * or cannot listen within 10 s (§4.5: the caller then runs the walk as path 3 and tells `fenceDown`).
 * `port`: a fixed port to listen on (tests; 0 or absent = any free port).
 */
export function startQaFence(input: { allow: string[]; port?: number }): Promise<QaFence> {
    const keys = (input.allow || []).map(originKey).filter((k): k is string => !!k);
    let worker: Worker;
    try { worker = new Worker(QA_FENCE_SOURCE, { eval: true, workerData: { allow: keys, port: input.port || 0 } }); }
    catch (e: any) { return Promise.reject(new Error(`the fence could not start (${String(e?.message || e).split('\n')[0]})`)); }
    const refused: QaFenceRefusal[] = [];
    const open = new Map<number, { start: number; end: number; what: string; tunnel: boolean }>();
    const done: Array<{ start: number; end: number; what: string; tunnel: boolean }> = [];
    const bursts: QaWindow[] = [];
    let lastAppRefusal = -Infinity;
    const keep = <T>(list: T[], item: T) => { if (list.length < MAX_KEPT) list.push(item); };
    return new Promise<QaFence>((resolve, reject) => {
        let settled = false;
        const fail = (why: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.terminate().catch(() => undefined);
            reject(new Error(`the fence did not start (${why})`));
        };
        const timer = setTimeout(() => fail('no answer in 10 s'), START_TIMEOUT_MS);
        worker.on('error', e => fail(String((e as any)?.message || e).split('\n')[0]));
        worker.on('exit', code => fail(`exit code ${code}`));
        worker.on('message', (m: any) => {
            if (!m || typeof m !== 'object') return;
            switch (m.type) {
                case 'listening': {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    worker.unref();
                    resolve(fence(Number(m.port)));
                    return;
                }
                case 'error': fail(String(m.message)); return;
                case 'refused': {
                    const r = { what: String(m.what), at: Number(m.at) };
                    keep(refused, r);
                    if (!BROWSER_OWN.test(r.what)) lastAppRefusal = Math.max(lastAppRefusal, r.at);
                    return;
                }
                case 'open': if (open.size < MAX_KEPT) open.set(Number(m.id), { start: Number(m.start), end: NaN, what: String(m.what), tunnel: !!m.tunnel }); return;
                case 'close': {
                    const w = open.get(Number(m.id));
                    if (!w) return;
                    open.delete(Number(m.id));
                    w.end = Number(m.end);
                    keep(done, w);
                    return;
                }
                case 'burst': keep(bursts, { start: Number(m.start), end: Number(m.end), long: false, what: String(m.what) }); return;
                default: return;
            }
        });

        const fence = (port: number): QaFence => {
            let closed = false;
            const appRefusals = () => refused.filter(r => !BROWSER_OWN.test(r.what));
            return {
                proxy: { server: `http://127.0.0.1:${port}`, bypass: '<-loopback>' },
                allow(origin: string) {
                    const key = originKey(origin);
                    if (key && !closed) worker.postMessage({ type: 'allow', key });
                },
                refusals: () => refused.slice(),
                appRefusals,
                windows() {
                    const now = Date.now();
                    const shape = (w: { start: number; end: number; what: string; tunnel: boolean }): QaWindow => {
                        const end = Number.isFinite(w.end) ? w.end : now;
                        return { start: w.start, end, long: w.tunnel || end - w.start > FENCE_LONG_MS, what: w.what };
                    };
                    return [...done.map(shape), ...[...open.values()].map(shape), ...bursts.map(b => ({ ...b }))].sort((a, b) => a.start - b.start);
                },
                drops(text: string, url?: string) {
                    const t = String(text || '');
                    if (FENCE_TEXT.test(t)) return 'refused-text';
                    const app = appRefusals();
                    if (url) {
                        try {
                            const u = new URL(url);
                            const pathKey = `${u.host}${u.pathname}`.toLowerCase();
                            const tunnelKey = originKey(url);
                            if (app.some(r => { const x = refusalTargets(r.what); return x.pathKey === pathKey || (!!x.tunnelKey && x.tunnelKey === tunnelKey); })) return 'refused-url';
                        } catch { /* not a URL */ }
                    }
                    const lower = t.toLowerCase();
                    if (lower && app.some(r => { const x = refusalTargets(r.what); return (!!x.pathKey && x.pathKey.length > 1 && lower.includes(x.pathKey)) || (!!x.tunnelKey && !!x.host && lower.includes(x.host)); })) return 'refused-url';
                    if (Date.now() - lastAppRefusal < FENCE_DROP_WINDOW_MS) return 'refused-window';
                    return '';
                },
                async close() {
                    if (closed) return;
                    closed = true;
                    await worker.terminate().catch(() => undefined);
                },
            };
        };
    });
}
