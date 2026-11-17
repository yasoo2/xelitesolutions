/**
 * THE FENCE LETS THE WALK'S BROWSER REACH THE WALKED ORIGIN AND NOTHING ELSE (design v13.3 §4).
 *
 * The bypass vectors are the v11/v12 attacks' (`accounts-lab/v12/proxy-fence.js`): every spelling of loopback on
 * another port, the machine name, the LAN address, a dedicated worker, a service worker, a WebSocket, an outside
 * HTTPS host. A real Chromium is launched behind the fence the way the walk launches it.
 */
import crypto from 'crypto';
import http from 'http';
import net from 'net';
import os from 'os';
import { chromium, type Browser } from 'playwright';
import { getChromiumLaunchOptions } from '../modules/browser/manager';
import { BROWSER_OWN, startQaFence, type QaFence } from '../core/quality/qa-fence';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const listen = (s: http.Server | net.Server, host?: string) => new Promise<number>(r => s.listen(0, host as any, () => r((s.address() as net.AddressInfo).port)));

/** A minimal WebSocket handshake, so a socket can open through the fence. */
function acceptWebSocket(server: http.Server, onBytes: (n: number) => void): void {
    server.on('upgrade', (q, sock) => {
        const accept = crypto.createHash('sha1').update(`${q.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
        sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        sock.on('data', d => onBytes(d.length));
        sock.on('error', () => { });
    });
}

describe('the default-deny fence', () => {
    let browser: Browser;
    let fence: QaFence;
    let live: http.Server, walked: http.Server, later: http.Server;
    let LIVE = 0, WALKED = 0, LATER = 0;
    const liveHits: string[] = [];
    const walkedHits: string[] = [];
    let liveWsBytes = 0, walkedWsBytes = 0;
    const consoleLines: Array<{ text: string; url: string }> = [];

    beforeAll(async () => {
        //  The owner's other live service: on every interface, so any spelling that got through would land here.
        live = http.createServer((q, r) => { liveHits.push(`${q.method} ${q.url}`); r.setHeader('access-control-allow-origin', '*'); r.end('live'); });
        acceptWebSocket(live, n => { liveWsBytes += n; });
        LIVE = await listen(live);
        const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
        const targets: Record<string, string> = {
            a_127: `http://127.0.0.1:${LIVE}/a`, b_localhost: `http://localhost:${LIVE}/b`, c_v6: `http://[::1]:${LIVE}/c`,
            d_127002: `http://127.0.0.2:${LIVE}/d`, e_mapped: `http://[::ffff:127.0.0.1]:${LIVE}/e`, f_hostname: `http://${os.hostname()}:${LIVE}/f`,
            h_hex: `http://0x7f000001:${LIVE}/h`, i_dot: `http://localhost.:${LIVE}/i`, j_short: `http://127.1:${LIVE}/j`,
            ...(lan ? { g_lan: `http://${lan}:${LIVE}/g` } : {}),
        };
        walked = http.createServer((q, r) => {
            walkedHits.push(`${q.method} ${q.url}`);
            if (q.url === '/worker.js') { r.setHeader('content-type', 'text/javascript'); return r.end(`fetch('http://127.0.0.1:${LIVE}/from-worker',{method:'POST',mode:'no-cors',body:'w'}).catch(()=>{})`); }
            if (q.url === '/sw.js') { r.setHeader('content-type', 'text/javascript'); return r.end(`self.addEventListener('install',e=>{e.waitUntil(fetch('http://127.0.0.1:${LIVE}/from-service-worker',{method:'POST',mode:'no-cors',body:'s'}).catch(()=>{}))})`); }
            if (q.url === '/own') { q.resume(); return r.end('own-ok'); }
            r.setHeader('content-type', 'text/html');
            r.end(`<!doctype html><html><body><h1 id=h>page</h1><script>
const T=${JSON.stringify(targets)};
for (const [k,u] of Object.entries(T)) fetch(u,{method:'POST',mode:'no-cors',body:'joe-qa '+k}).catch(()=>{});
new Worker('/worker.js');
navigator.serviceWorker.register('/sw.js').catch(()=>{});
try { const w = new WebSocket('ws://127.0.0.1:${LIVE}/ws'); w.onopen = () => w.send('x'); } catch (e) {}
fetch('/own',{method:'POST',body:'mine'}).then(r => r.text()).then(t => document.getElementById('h').textContent = 'own: ' + t);
</script></body></html>`);
        });
        acceptWebSocket(walked, n => { walkedWsBytes += n; });
        WALKED = await listen(walked, '127.0.0.1');
        later = http.createServer((q, r) => { r.setHeader('access-control-allow-origin', '*'); r.end('later-ok'); });
        LATER = await listen(later, '127.0.0.1');
        fence = await startQaFence({ allow: [`http://127.0.0.1:${WALKED}`] });
        browser = await chromium.launch({ ...getChromiumLaunchOptions(), proxy: fence.proxy });
    }, 120_000);

    afterAll(async () => {
        await browser?.close().catch(() => { });
        await fence?.close();
        for (const s of [live, walked, later]) s?.close();
    });

    it('routes the browser through a local proxy that removes the loopback bypass', () => {
        expect(fence.proxy.bypass).toBe('<-loopback>');
        expect(fence.proxy.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });

    it('refuses every other spelling, port, worker, service worker and socket; serves the walked origin', async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        page.on('console', m => consoleLines.push({ text: m.text(), url: m.location()?.url || '' }));
        await page.goto(`http://127.0.0.1:${WALKED}/`);
        await page.waitForFunction(() => document.getElementById('h')?.textContent === 'own: own-ok', undefined, { timeout: 20_000 });
        await sleep(4000);
        expect(liveHits).toEqual([]);
        expect(liveWsBytes).toBe(0);
        expect(walkedHits).toContain('POST /own');
        const refused = fence.refusals().map(r => r.what);
        expect(refused.some(w => w.startsWith('CONNECT ') && w.includes(`:${LIVE}`))).toBe(true);   // the WebSocket's tunnel
        expect(refused.filter(w => /^POST /.test(w) && w.includes(`:${LIVE}/`)).length).toBeGreaterThanOrEqual(9);
        expect(refused.some(w => w.endsWith('/from-worker'))).toBe(true);
        expect(refused.some(w => w.endsWith('/from-service-worker'))).toBe(true);
        //  The walked origin's own requests are windows; nothing refused is one.
        const windows = fence.windows();
        expect(windows.some(w => w.what === `POST 127.0.0.1:${WALKED}/own`)).toBe(true);
        expect(windows.every(w => w.what.includes(`127.0.0.1:${WALKED}`))).toBe(true);
        await context.close();
    }, 60_000);

    it('refuses the walked port under another spelling of its host', async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${WALKED}/`);
        await page.waitForFunction(() => document.getElementById('h')?.textContent === 'own: own-ok', undefined, { timeout: 20_000 });
        const before = walkedHits.length;
        const answer = await page.evaluate(async (u) => { try { const r = await fetch(u, { method: 'POST', body: 'x' }); return r.status; } catch { return 'failed'; } }, `http://localhost:${WALKED}/own`);
        expect(answer === 'failed' || answer === 403).toBe(true);
        expect(walkedHits.slice(before).filter(h => h === 'POST /own')).toEqual([]);
        expect(fence.refusals().some(r => r.what === `POST localhost:${WALKED}/own`)).toBe(true);
        await context.close();
    }, 60_000);

    it('refuses an outside HTTPS host at CONNECT, tells it, and drops the error it causes', async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const lines: Array<{ text: string; url: string }> = [];
        page.on('console', m => lines.push({ text: m.text(), url: m.location()?.url || '' }));
        const failed: string[] = [];
        page.on('requestfailed', r => failed.push(`${r.url()} ${r.failure()?.errorText}`));
        await page.goto(`http://127.0.0.1:${WALKED}/`);
        await page.evaluate(() => fetch('https://api.example.test/orders', { method: 'POST', body: '{}' }).catch(e => console.error('send failed: ' + e)));
        await sleep(800);
        expect(fence.appRefusals().some(r => r.what === 'CONNECT api.example.test:443')).toBe(true);
        expect(failed.some(f => /ERR_TUNNEL_CONNECTION_FAILED/.test(f))).toBe(true);
        //  Never charged: the failed request by its URL, and the page's own error line by its text or its moment.
        expect(fence.drops('net::ERR_TUNNEL_CONNECTION_FAILED', 'https://api.example.test/orders')).not.toBe('');
        expect(fence.drops('anything', 'https://api.example.test/orders')).toBe('refused-url');
        const err = lines.find(l => /send failed/.test(l.text));
        expect(err).toBeTruthy();
        expect(fence.drops(err!.text, err!.url)).not.toBe('');
        await context.close();
    }, 60_000);

    it('adds a walked origin the moment it listens, and keeps a tunnel to it as a long window', async () => {
        fence.allow(`http://127.0.0.1:${LATER}`);
        fence.allow(`http://127.0.0.1:${WALKED}`);
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${WALKED}/`);
        const got = await page.evaluate(async (u) => (await fetch(u)).text(), `http://127.0.0.1:${LATER}/x`);
        expect(got).toBe('later-ok');
        await page.evaluate((u) => new Promise<void>(res => { const w = new WebSocket(u); w.onopen = () => { w.send('hello'); setTimeout(res, 300); }; w.onerror = () => res(); }), `ws://127.0.0.1:${WALKED}/ws`);
        await sleep(500);
        expect(walkedWsBytes).toBeGreaterThan(0);
        const windows = fence.windows();
        expect(windows.some(w => w.long && w.what === `CONNECT 127.0.0.1:${WALKED}`)).toBe(true);
        expect(windows.some(w => !w.long && w.what === `CONNECT 127.0.0.1:${WALKED} bytes`)).toBe(true);
        await context.close();
    }, 60_000);

    it('does not tell what Chromium sends by itself', () => {
        for (const what of ['CONNECT update.googleapis.com:443', 'GET clients2.google.com/time/1/current', 'CONNECT www.google.com:443',
            'CONNECT accounts.google.com:443', 'CONNECT content-autofill.googleapis.com:443', 'CONNECT android.clients.google.com:443', 'CONNECT r1---sn-x.gvt1.com:443']) {
            expect(BROWSER_OWN.test(what)).toBe(true);
        }
        expect(BROWSER_OWN.test('POST www.google.com/x')).toBe(false);
        expect(BROWSER_OWN.test('CONNECT api.example.test:443')).toBe(false);
        expect(fence.appRefusals().every(r => !BROWSER_OWN.test(r.what))).toBe(true);
    });

    it('rejects when it cannot listen, so the walk runs as path 3', async () => {
        const taken = net.createServer();
        const port = await listen(taken, '127.0.0.1');
        await expect(startQaFence({ allow: [], port })).rejects.toThrow(/did not start/);
        taken.close();
    }, 30_000);
});
