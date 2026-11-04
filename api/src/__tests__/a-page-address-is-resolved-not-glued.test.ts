/**
 * ⛔ A PAGE'S ADDRESS IS RESOLVED AGAINST THE APP'S, NOT GLUED TO IT.
 *
 * The 500-prompt exam, 2026-11-04 (P456): a customer-service chatbot with one
 * page. The tablet and phone pass walks «/» when there is no other route, and
 * «http://127.0.0.1:4312/» + «/» asked the server for «//». The app read its
 * requests with `new URL(req.url, base)`, which throws on «//»; the server fell
 * over mid-check and the delivery was refused four times as
 * «qa_infrastructure — ERR_CONNECTION_REFUSED» for a request no browser sends.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { auditBuiltApp, routeUrl } from '../core/quality/app-audit';

jest.setTimeout(240_000);

describe('the address of a page', () => {
    it.each([
        ['http://127.0.0.1:4312/', '/', 'http://127.0.0.1:4312/'],
        ['http://127.0.0.1:4312/', '#/orders', 'http://127.0.0.1:4312/#/orders'],
        ['http://127.0.0.1:4312/', 'about.html', 'http://127.0.0.1:4312/about.html'],
        ['http://127.0.0.1:4312/app/', '/', 'http://127.0.0.1:4312/app/'],
        ['http://127.0.0.1:4312/app/', 'page.html', 'http://127.0.0.1:4312/app/page.html'],
    ])('%s with %s is %s', (base, route, expected) => {
        expect(routeUrl(base, route)).toBe(expected);
    });
});

describe('the browser check on a one-page app whose server reads requests as URLs', () => {
    let server: http.Server;
    let url = '';
    const asked: string[] = [];
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-route-url-'));
    beforeAll(async () => {
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Help</title></head><body><h1>Ask the library</h1><button onclick="document.getElementById(\'a\').textContent=\'Open 9-5\'">Hours</button><p id="a"></p></body></html>');
        server = http.createServer((req, res) => {
            asked.push(String(req.url));
            //  The P456 server's own first line, kept from crashing the test.
            try { new URL(String(req.url), 'http://localhost'); } catch { res.writeHead(500); res.end('bad url'); return; }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(path.join(dir, 'index.html')));
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        url = `http://127.0.0.1:${(server.address() as any).port}/`;
    });
    afterAll(async () => {
        await new Promise<void>(r => server.close(() => r()));
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('never asks the server for «//»', async () => {
        await auditBuiltApp(dir, { serveUrl: url, timeoutMs: 45_000 } as any);
        expect(asked.length).toBeGreaterThan(0);
        expect(asked.filter(u => u.startsWith('//'))).toEqual([]);
    });
});
