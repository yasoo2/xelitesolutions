/**
 * ⛔ A ROUTE TABLE A HELPER FILLS IS READ AS THE ROUTES IT HOLDS.
 *
 * The hard exam, 2026-11-05, H10: «ابني منصة حجز مواعيد لصالونات تجميل: عدة
 * فروع وموظفين، خدمات بمدد مختلفة …». The builder wrote a server on
 * `http.createServer` with no framework, its routes in a table of its own:
 *
 *     const routes = [];
 *     const on = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern + '$'), handler });
 *     on('GET', '/api/branches', () => [200, listBranches()]);
 *     …
 *     const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
 *
 * Twenty-five routes, and not one was read: the harvester saw only the two
 * page paths the static server compares («/owner», «/entities»). So the
 * delivery was refused four times as «branches — الفروع (not served);
 * employees — الموظفون (not served); services …; bookings …» for a server that
 * answered every one of them, and the builder spent its rounds adding an alias
 * route and an «entities» page to please the check.
 *
 * A helper declared in a server file, that puts its method and path into a
 * table, registers a route at every call that names an HTTP method and a path
 * — the path as written, its pattern parts read as parameters. Whether it is
 * served is still measured on the live server: read routes are probed, never
 * believed.
 *
 * Measured through Joe's own delivery path (deliveryRun.measureRequestedRecords).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';
import { DeliveryLedger } from '../core/quality/delivery-verdict';
import { deliveryRun } from '../core/quality/delivery-run';
import { collectServerEvidence } from '../core/quality/request-coverage';

jest.setTimeout(240_000);

const H10 = 'ابني منصة حجز مواعيد لصالونات تجميل: عدة فروع وموظفين، خدمات بمدد مختلفة، حساب الأوقات المتاحة بلا تعارض، تأكيد الحجز وإلغاؤه، تذكير قبل الموعد، ولوحة للمالك تعرض الإيرادات.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

/** The H10 server as it was delivered: a table, the helper that fills it, and the dispatcher that reads it. */
const SERVER = [
    `'use strict';`,
    `const http = require('node:http');`,
    `function serveStatic(res, pathname) {`,
    `  const rel = pathname === '/' ? '/index.html' : pathname === '/owner' ? '/owner.html' : pathname;`,
    `  res.end(rel);`,
    `}`,
    `// ---------- routes ----------`,
    `const routes = [];`,
    `const on = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern + '$'), handler });`,
    `const idOf = params => Number(params[0]);`,
    `on('GET', '/api/branches', () => [200, listBranches()]);`,
    `on('POST', '/api/branches', ({ body }) => [201, saveBranch(null, body)]);`,
    `on('PUT', '/api/branches/(\\\\d+)', ({ params, body }) => [200, saveBranch(idOf(params), body)]);`,
    `on('GET', '/api/services', () => [200, listServices()]);`,
    `on('GET', '/api/employees', () => [200, listStaff()]);`,
    `on('GET', '/api/staff', () => [200, listStaff()]);`,
    `on('GET', '/api/bookings', ({ query }) => [200, listBookings(query)]);`,
    `on('POST', '/api/bookings/(\\\\d+)/cancel', ({ params }) => [200, cancelBooking(idOf(params))]);`,
    `const server = http.createServer(async (req, res) => {`,
    `  const url = new URL(req.url, 'http://localhost');`,
    `  if (!url.pathname.startsWith('/api/')) return serveStatic(res, url.pathname);`,
    `  const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));`,
    `  const [status, data] = route.handler({ params: url.pathname.match(route.re).slice(1) });`,
    `  res.writeHead(status); res.end(JSON.stringify(data));`,
    `});`,
    `server.listen(3000);`,
].join('\n');

/** The live server: the four tables answer JSON; the rest of /api is the API's own 404. */
async function liveServer(served: string[]): Promise<{ base: string; close: () => Promise<void> }> {
    const server = http.createServer((req, res) => {
        const segments = String(req.url || '').split('?')[0].split('/').filter(Boolean);
        if (segments[0] === 'api') {
            const ok = served.includes(segments[1] || '') && segments.length === 2;
            res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' });
            return res.end(JSON.stringify(ok ? [] : { error: 'المسار غير موجود' }));
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><main></main>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    return {
        base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
        close: () => new Promise<void>(resolve => server.close(() => resolve())),
    };
}

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-route-table-'));
    roots.push(dir);
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

async function measure(files: Record<string, string>, served: string[]) {
    const dir = tree(files);
    const live = await liveServer(served);
    try {
        const ledger = new DeliveryLedger();
        const delivery = deliveryRun({
            productRequest: H10,
            ledger,
            deliveryRoles: { service: true, interface: true, program: false },
            deliveredRoots: (extra = []) => Array.from(new Set([dir, ...extra].filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))),
            deliveryParts: () => [{ root: dir, tool: 'general_agent' }],
            runTool: async () => { throw new Error('no tool expected'); },
            requireInstrument: () => undefined,
        });
        ledger.record({ instrument: 'live', ok: true, url: live.base });
        await delivery.measureRequestedRecords({ ok: true, output: { cwd: dir } }, [dir]);
        const report = delivery.state.requestCoverage!;
        return {
            served: Object.fromEntries(report.records.map(r => [r.key, r.served])),
            coverage: ledger.all().find(m => m.instrument === 'coverage'),
        };
    } finally {
        await live.close();
    }
}

describe('H10: a salon server whose routes a helper puts in a table', () => {
    it('reads every route the helper registers, with its method and path', async () => {
        const evidence = await collectServerEvidence([tree({ 'server.js': SERVER })], []);
        const read = evidence.routes.map(r => `${r.method} ${r.path}`);
        expect(read).toEqual(expect.arrayContaining([
            'get /api/branches', 'post /api/branches', 'get /api/services', 'get /api/employees',
            'get /api/staff', 'get /api/bookings',
        ]));
        //  A pattern part is a parameter, never a literal segment.
        expect(read).toEqual(expect.arrayContaining(['put /api/branches/:id', 'post /api/bookings/:id/cancel']));
        expect(read.some(p => p.includes('\\d'))).toBe(false);
    });

    it('is delivered: every record he named is served by the live server', async () => {
        const { served, coverage } = await measure({ 'server.js': SERVER }, ['branches', 'employees', 'services', 'bookings']);
        expect(served).toEqual({ branches: true, employees: true, services: true, bookings: true });
        expect(String(coverage?.error || '')).not.toMatch(/requested_entities_not_delivered/u);
    });

    it('…and a record no route of the table serves is still named', async () => {
        const noBookings = SERVER.split('\n').filter(line => !line.includes('/api/bookings')).join('\n');
        const { served, coverage } = await measure({ 'server.js': noBookings }, ['branches', 'employees', 'services']);
        expect(served).toEqual({ branches: true, employees: true, services: true, bookings: false });
        expect(String(coverage?.error || '')).toMatch(/bookings/u);
    });

    it('a client helper that calls the API with a method and a path registers nothing', async () => {
        const CLIENT = [
            `const api = (method, path, body) => fetch(path, { method, body: JSON.stringify(body) }).then(r => r.json());`,
            `document.querySelector('#save').addEventListener('click', () => api('POST', '/api/branches', { name: 'x' }));`,
            `api('GET', '/api/bookings', null).then(render);`,
        ].join('\n');
        const evidence = await collectServerEvidence([tree({ 'public/app.js': CLIENT })], []);
        expect(evidence.routes).toEqual([]);
    });
});
