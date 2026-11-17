/**
 * THE GUARD'S MARK STAYS BEHIND THE FENCE, AND ACTION GETS ARE HELD (review 8: L1, L2).
 *
 *   L1  the guard marks what it lets through only when a fence that holds and strips the mark is in front; with no
 *       fence (`holdWorkers`) his server and every other host never receive Joe's per-process tag.
 *   L2  an untagged GET that names its act in the query (`?action=done`), in a camelCase word (`/4/markDone`) or with
 *       a word that saves (`/1/star`) is held by the fence and never followed by the guard.
 */
import http from 'http';
import net from 'net';
import { chromium, type Browser } from 'playwright';
import { getChromiumLaunchOptions } from '../modules/browser/manager';
import { createLiveDataGuard, isActionUrl, QA_GUARD_HEADER } from '../core/quality/live-data-guard';
import { startQaFence } from '../core/quality/qa-fence';

jest.setTimeout(180_000);

describe('L2 — an action named in the query, a camelCase word or «star» is a write', () => {
    it('the guard reads them as actions, and a plain read is not one', () => {
        for (const url of ['http://x/api/tasks?action=done&id=3', 'http://x/api/tasks/4/markDone', 'http://x/api/tasks/1/star', 'http://x/api/posts/9/unpin']) {
            expect([url, isActionUrl(url)]).toEqual([url, true]);
        }
        for (const url of ['http://x/api/tasks', 'http://x/api/tasks/4', 'http://x/api/starters', 'http://x/api/getUserData']) {
            expect([url, isActionUrl(url)]).toEqual([url, false]);
        }
    });

    it('the holding fence keeps them from his server, and lets a read through', async () => {
        const hits: string[] = [];
        const srv = http.createServer((q, r) => { hits.push(`${q.method} ${q.url}`); r.writeHead(200); r.end('ok'); });
        await new Promise<void>(res => srv.listen(0, '127.0.0.1', () => res()));
        const origin = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}`;
        const fence = await startQaFence({ allow: [origin], hold: true });
        try {
            const via = (p: string) => new Promise<void>((res) => {
                const proxy = new URL(fence.proxy.server);
                const req = http.request({ host: proxy.hostname, port: Number(proxy.port), method: 'GET', path: `${origin}${p}`, headers: { host: new URL(origin).host } }, resp => { resp.resume(); resp.on('end', () => res()); });
                req.on('error', () => res());
                req.end();
            });
            for (const p of ['/api/tasks?action=done&id=3', '/api/tasks/4/markDone', '/api/tasks/1/star', '/api/tasks']) await via(p);
            await new Promise(r => setTimeout(r, 300));
            expect(hits).toEqual(['GET /api/tasks']);
        } finally {
            await fence.close();
            await new Promise<void>(res => srv.close(() => res()));
        }
    });
});

describe('L1 — Joe\'s mark never leaves without a fence in front', () => {
    let browser: Browser;
    let srv: http.Server;
    let origin = '';
    const seen: Array<string | undefined> = [];
    beforeAll(async () => {
        srv = http.createServer((q, r) => {
            seen.push(q.headers[QA_GUARD_HEADER] as string | undefined);
            if (q.url === '/') { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>x</title><h1>x</h1>'); return; }
            r.setHeader('content-type', 'application/json'); r.end('{"ok":true}');
        });
        await new Promise<void>(res => srv.listen(0, '127.0.0.1', () => res()));
        origin = `http://127.0.0.1:${(srv.address() as net.AddressInfo).port}`;
        browser = await chromium.launch(getChromiumLaunchOptions());
    }, 120_000);
    afterAll(async () => { await browser?.close().catch(() => { }); srv?.close(); });

    it('with no fence (holdWorkers) nothing his server receives carries the mark; behind a fence the mark goes on', async () => {
        for (const holdWorkers of [true, false]) {
            seen.length = 0;
            const context = await browser.newContext({ serviceWorkers: 'block' });
            const guard = await createLiveDataGuard(context, holdWorkers ? { holdWorkers: true } : {});
            const page = await context.newPage();
            await page.goto(`${origin}/`);
            await page.evaluate(async (u) => { await fetch(u); }, `${origin}/api/list`);
            await guard.remove?.();
            await context.close();
            expect([holdWorkers, seen.length > 0, seen.every(h => h === undefined)]).toEqual([holdWorkers, true, holdWorkers]);
        }
    });
});
