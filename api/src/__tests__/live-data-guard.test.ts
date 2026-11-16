/**
 * THE NO-WRITE WALK SAVES NOTHING IN THE OWNER'S LIVE APP (design v13.3 §5, path 3).
 *
 * A real Chromium context with the guard installed meets a live server that logs every request: no non-GET
 * reaches it but the one sign-in of W7, no GET that deletes or carries Joe's typed values, no WebSocket frame from
 * the page. The errors a block causes are dropped, not charged; a control that deletes is never pressed.
 */
import crypto from 'crypto';
import http from 'http';
import net from 'net';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { getChromiumLaunchOptions } from '../modules/browser/manager';
import { createLiveDataGuard, DELETE_URL, DELETE_WORDS, isDeleteControl, LIVE_DATA_NOT_MEASURED, QA_MARKS, type LiveDataGuard } from '../core/quality/live-data-guard';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const ACCOUNT = { identity: 'owner@shop.test', password: 'Pass-1234' };

describe('the live-data guard in a real browser', () => {
    let browser: Browser;
    let server: http.Server;
    let ORIGIN = '';
    const hits: string[] = [];
    let wsBytesFromPage = 0;

    beforeAll(async () => {
        server = http.createServer((q, r) => {
            let body = '';
            q.on('data', d => { body += d; });
            q.on('end', () => {
                if (q.url !== '/favicon.ico') hits.push(`${q.method} ${q.url}${body ? ` ${body}` : ''}`);   // the browser's own
                if (q.url === '/') { r.setHeader('content-type', 'text/html'); return r.end('<!doctype html><title>shop</title><h1>Customers</h1>'); }
                r.setHeader('content-type', 'application/json');
                r.end('{"ok":true}');
            });
        });
        server.on('upgrade', (q, sock) => {
            const accept = crypto.createHash('sha1').update(`${q.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
            sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
            //  The server greets the page: a server → page frame («welcome»), which must reach it.
            sock.write(Buffer.concat([Buffer.from([0x81, 7]), Buffer.from('welcome')]));
            sock.on('data', d => { if ((d[0] & 0x0f) === 0x1) wsBytesFromPage += d.length; });
            sock.on('error', () => { });
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        ORIGIN = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
        browser = await chromium.launch(getChromiumLaunchOptions());
    }, 120_000);
    afterAll(async () => { await browser?.close().catch(() => { }); server?.close(); });

    async function open(): Promise<{ context: BrowserContext; page: Page; guard: LiveDataGuard }> {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const guard = await createLiveDataGuard(context, { signIn: ACCOUNT });
        const page = await context.newPage();
        await page.goto(`${ORIGIN}/`);
        return { context, page, guard };
    }
    const send = (page: Page, url: string, method = 'GET', body?: string, type = 'application/json') =>
        page.evaluate(async ([u, m, b, t]) => { try { const r = await fetch(u as string, { method: m as string, body: (b as string) ?? undefined, headers: b ? { 'content-type': t as string } : {} }); return r.status; } catch (e) { return 'blocked'; } }, [url, method, body, type]);

    it('lets reads through and aborts every write, GETs that delete or carry Joe\'s values included', async () => {
        const { context, page, guard } = await open();
        const from = hits.length;
        expect(await send(page, `${ORIGIN}/api/customers`)).toBe(200);
        expect(await send(page, `${ORIGIN}/css/reset.css`)).toBe(200);
        for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(await send(page, `${ORIGIN}/api/customers/3`, m, '{"name":"QA Tester"}')).toBe('blocked');
        expect(await send(page, `${ORIGIN}/customers/3/delete`)).toBe('blocked');
        expect(await send(page, `${ORIGIN}/api/remove?id=3`)).toBe('blocked');
        expect(await send(page, `${ORIGIN}/api/search?q=joe.qa%2B1`)).toBe('blocked');
        expect(await send(page, `${ORIGIN}/api/search?q=${encodeURIComponent('اختبار')}`)).toBe('blocked');
        expect(hits.slice(from).map(h => h.split(' ').slice(0, 2).join(' '))).toEqual(['GET /api/customers', 'GET /css/reset.css']);
        expect(guard.aborted().map(a => a.kind)).toEqual(['write', 'write', 'write', 'write', 'get-write', 'get-write', 'get-write', 'get-write']);
        expect(guard.wasAborted(`${ORIGIN}/customers/3/delete`)).toBe(true);
        await guard.remove();
        await context.close();
    }, 60_000);

    it('passes exactly one sign-in per allowance, holding both the identity and the password, to one address', async () => {
        const { context, page, guard } = await open();
        const from = hits.length;
        const form = `email=${encodeURIComponent(ACCOUNT.identity)}&password=${encodeURIComponent(ACCOUNT.password)}`;
        await guard.allowing(ACCOUNT, async () => {
            //  No identity in the body: not the sign-in.
            expect(await send(page, `${ORIGIN}/login`, 'POST', `password=${encodeURIComponent(ACCOUNT.password)}`, 'application/x-www-form-urlencoded')).toBe('blocked');
            expect(await send(page, `${ORIGIN}/login`, 'POST', form, 'application/x-www-form-urlencoded')).toBe(200);
            //  A second non-GET in the same allowance, even with both: refused.
            expect(await send(page, `${ORIGIN}/login`, 'POST', form, 'application/x-www-form-urlencoded')).toBe('blocked');
        });
        expect(guard.signInUrl()).toBe(`${ORIGIN}/login`);
        //  A later re-sign-in goes only to the same address (a change-password or register form is never sent).
        await guard.allowing(ACCOUNT, async () => {
            expect(await send(page, `${ORIGIN}/account/password`, 'POST', JSON.stringify({ email: ACCOUNT.identity, password: ACCOUNT.password }))).toBe('blocked');
            expect(await send(page, `${ORIGIN}/login`, 'POST', JSON.stringify({ email: ACCOUNT.identity, password: ACCOUNT.password }))).toBe(200);
        });
        //  Outside an allowance, and with an account too short to be one: nothing passes.
        expect(await send(page, `${ORIGIN}/login`, 'POST', form, 'application/x-www-form-urlencoded')).toBe('blocked');
        await guard.allowing({ identity: 'ab', password: ACCOUNT.password }, async () => {
            expect(await send(page, `${ORIGIN}/login`, 'POST', `ab ${ACCOUNT.password}`, 'text/plain')).toBe('blocked');
        });
        expect(hits.slice(from).filter(h => !h.startsWith('GET ')).map(h => h.split(' ').slice(0, 2).join(' '))).toEqual(['POST /login', 'POST /login']);
        await guard.remove();
        await context.close();
    }, 60_000);

    it('drops the page\'s WebSocket frames and lets the server\'s through', async () => {
        const { context, page, guard } = await open();
        const got = await page.evaluate((u) => new Promise<string>(res => {
            const w = new WebSocket(u);
            w.onmessage = e => { w.send('delete customer 3'); setTimeout(() => res(String(e.data)), 400); };
            w.onerror = () => res('error');
        }), `${ORIGIN.replace(/^http/, 'ws')}/ws`);
        expect(got).toBe('welcome');
        await sleep(300);
        expect(wsBytesFromPage).toBe(0);
        expect(guard.aborted().some(a => a.kind === 'ws' && a.method === 'WS')).toBe(true);
        await guard.remove();
        await context.close();
    }, 60_000);

    it('after remove(), the context is as it was', async () => {
        const { context, page, guard } = await open();
        await guard.remove();
        const from = hits.length;
        expect(await send(page, `${ORIGIN}/api/customers`, 'POST', '{}')).toBe(200);
        expect(hits.slice(from).map(h => h.split(' ').slice(0, 2).join(' '))).toEqual(['POST /api/customers']);
        await context.close();
    }, 60_000);
});

describe('what the guard tells and drops (W9)', () => {
    /** A context stand-in: the guard only routes on it; these cases drive its bookkeeping through its own route. */
    function fakeContext() {
        let handler: ((route: any) => Promise<void>) | null = null;
        const context: any = {
            route: async (_: string, h: any) => { handler = h; },
            routeWebSocket: async () => undefined,
            unroute: async () => { handler = null; },
        };
        const request = async (method: string, url: string) => {
            let outcome = '';
            await handler!({
                request: () => ({ method: () => method, url: () => url, postDataBuffer: () => Buffer.from('') }),
                abort: async () => { outcome = 'aborted'; },
                fallback: async () => { outcome = 'passed'; },
            });
            return outcome;
        };
        return { context, request };
    }

    it('keeps a background abort apart from an action, and nests brackets', async () => {
        let t = 10_000;
        const { context, request } = fakeContext();
        const guard = await createLiveDataGuard(context, { now: () => t });
        expect(await request('POST', 'http://127.0.0.1:1/api/heartbeat')).toBe('aborted');   // no action open: background
        expect(guard.mark()).toBe(0);
        expect(guard.aborted()[0]).toMatchObject({ background: true, landing: true, kind: 'write' });
        const outer = guard.begin();
        const inner = guard.begin();
        expect(await request('POST', 'http://127.0.0.1:1/api/heartbeat')).toBe('aborted');   // first seen as background: stays so
        expect(await request('POST', 'http://127.0.0.1:1/api/orders')).toBe('aborted');
        expect(guard.end(inner)).toBe(1);
        expect(guard.end(outer)).toBe(1);
        expect(guard.aborted().map(a => [a.background, a.landing])).toEqual([[true, true], [true, false], [false, false]]);
        //  Within 1,500 ms of the action's abort every message is its doing; after that, none is.
        t += 1000;
        expect(guard.drops('TypeError: x is undefined')).toBe('action-window');
        t += 1000;
        expect(guard.drops('TypeError: x is undefined')).toBe('');
        expect(guard.drops('net::ERR_BLOCKED_BY_CLIENT')).toBe('blocked-text');
        expect(guard.drops('Failed to load resource', 'http://127.0.0.1:1/api/orders')).toBe('aborted-url');
        //  A background abort drops only a network-shaped message.
        expect(await request('POST', 'http://127.0.0.1:1/api/heartbeat')).toBe('aborted');
        t += 200;
        expect(guard.drops('TypeError: x is undefined')).toBe('');
        expect(guard.drops('TypeError: Failed to fetch')).toBe('background-network');
        expect(guard.drops('GET https://cdn.x/sdk.js net::ERR_TUNNEL_CONNECTION_FAILED')).toBe('blocked-text');
        guard.notTried('form: Add customer');
        guard.notTried('form: Add customer');
        guard.notTried('link: Remove Owner A');
        expect(guard.notTriedLabels).toEqual(['form: Add customer', 'link: Remove Owner A']);
        expect(LIVE_DATA_NOT_MEASURED).toBe('live_data_not_measured');
    });

    it('holds a dropped socket\'s own errors while it is open and 3 s after it closes — and no other error', async () => {
        let t = 50_000;
        let wsHandler: ((ws: any) => void) | null = null;
        const context: any = {
            route: async () => undefined,
            routeWebSocket: async (_: RegExp, h: any) => { wsHandler = h; },
            unroute: async () => undefined,
        };
        const guard = await createLiveDataGuard(context, { now: () => t });
        //  A page socket: its frames to the server, and both sides' close.
        const on: { message?: (m: string) => void; pageClose?: (c?: number, r?: string) => void; serverClose?: (c?: number, r?: string) => void } = {};
        const closed: string[] = [];
        const server = { send: () => undefined, close: async () => { closed.push('server'); }, onClose: (h: any) => { on.serverClose = h; } };
        wsHandler!({
            url: () => 'ws://127.0.0.1:4317/ws',
            connectToServer: () => server,
            onMessage: (h: any) => { on.message = h; },
            onClose: (h: any) => { on.pageClose = h; },
            close: async () => { closed.push('page'); },
        });
        const lateSocketError = 'live updates: the server did not answer the subscription';
        //  Before a frame of it was dropped, its errors are the page's.
        expect(guard.drops(lateSocketError)).toBe('');
        on.message!(JSON.stringify({ type: 'subscribe', topic: 'customers' }));
        expect(guard.aborted().map(a => a.kind)).toEqual(['ws']);
        //  3 s on (the 1,500 ms window long gone), the socket still open: its own error is the block's…
        t += 3000;
        expect(guard.drops(lateSocketError)).toBe('socket-window');
        expect(guard.drops('Could not reach ws://127.0.0.1:4317/ws')).toBe('socket-window');
        //  …and an error that is not about it stays the page's.
        expect(guard.drops('TypeError: Cannot read properties of null (reading \'textContent\')')).toBe('');
        //  The page closes it: the close reaches the server, and its errors are held 3 s more.
        on.pageClose!(1000, 'done');
        await new Promise(r => setImmediate(r));
        expect(closed).toEqual(['server']);
        t += 2900;
        expect(guard.drops(lateSocketError)).toBe('socket-window');
        t += 200;
        expect(guard.drops(lateSocketError)).toBe('');
    });
});

describe('the delete words (W5, W8)', () => {
    it('matches whole words only, in every language, and the icons anywhere', () => {
        for (const label of ['Delete', 'delete customer', 'Remove', 'Clear all', 'Log-out', 'sign-out', 'Cancel order', 'Supprimer', 'Eliminar',
            'Löschen', 'Удалить', 'удалить запись', 'حذف', 'احذف', 'والحذف', 'بالحذف', 'إزالة العميل', 'امسح', 'إلغاء', 'احذِف', '🗑️', 'Trash 🗑', '❌', 'Archive']) {
            expect([label, isDeleteControl(label)]).toEqual([label, true]);
        }
        for (const label of ['Confirm', 'Model', 'Blockchain', 'Deleted items', 'Removal', 'Clearance', 'Save', 'Add customer', 'انحياز', 'أضف عميلاً', 'Dropdown', 'Edit']) {
            expect([label, isDeleteControl(label)]).toEqual([label, false]);
        }
    });

    it('a lone × counts unless it closes an open dialog; an href that deletes counts', () => {
        expect(isDeleteControl('×')).toBe(true);
        expect(isDeleteControl('×', undefined, true)).toBe(false);
        expect(isDeleteControl('Customer 3', '/customers/3/delete')).toBe(true);
        expect(isDeleteControl('Customer 3', '/customers/3?action=remove')).toBe(true);
        expect(isDeleteControl('Customer 3', '/customers/3/edit')).toBe(false);
        expect(isDeleteControl('Models', '/models/del-mar')).toBe(true);   // a token in a URL: bounded by / and -
        expect(DELETE_URL.test('/api/delete_all')).toBe(true);
        expect(DELETE_URL.test('/api/deleted')).toBe(false);
        expect(DELETE_WORDS.test('Remove')).toBe(true);
        expect(QA_MARKS.test('name=QA%20Tester')).toBe(true);
        expect(QA_MARKS.test('name=Owner')).toBe(false);
    });
});
