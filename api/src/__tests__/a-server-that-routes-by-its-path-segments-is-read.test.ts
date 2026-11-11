/**
 * ⛔ A SERVER THAT ROUTES BY ITS PATH'S OWN SEGMENTS IS READ AS THE ROUTES IT SERVES.
 *
 * The 500 exam, 2026-11-06, P070: «ابني لوحة تحكم لإدارة وكالة سفر: إضافة
 * وتعديل وحذف وبحث في الرحلات والحجوزات والمسافرين …». The builder wrote a
 * server on `http.createServer` that cuts the path into parts and serves
 * every collection a list names:
 *
 *     const COLLECTIONS = ['trips', 'travelers', 'bookings'];
 *     const parts = url.pathname.split('/').filter(Boolean); // api, coll, id?
 *     if (parts[1] === 'summary') …
 *     const coll = parts[1];
 *     if (!COLLECTIONS.includes(coll) || parts.length > 3) return 404;
 *
 * Not one route was read, and the delivery was refused as «trips — الرحلات
 * (not served); bookings — الحجوزات (not served); travelers — المسافرون (not
 * served)» while the server answered every one of them. The fixture is that
 * server, as delivered.
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

const P070 = 'ابني لوحة تحكم لإدارة وكالة سفر: إضافة وتعديل وحذف وبحث في الرحلات والحجوزات والمسافرين، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.';
const FIXTURE = path.join(__dirname, 'fixtures-travel-p070');
const SERVER = fs.readFileSync(path.join(FIXTURE, 'server.js'), 'utf8');

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-segment-routes-'));
    roots.push(dir);
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

/** The live server as the delivered one answers: the listed collections under /api, and the API's own 404. */
async function liveServer(served: string[]): Promise<{ base: string; close: () => Promise<void> }> {
    const server = http.createServer((req, res) => {
        const segments = String(req.url || '').split('?')[0].split('/').filter(Boolean);
        if (segments[0] === 'api') {
            const ok = (served.includes(segments[1] || '') || segments[1] === 'summary') && segments.length === 2;
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

async function measure(files: Record<string, string>, served: string[]) {
    const dir = tree(files);
    const live = await liveServer(served);
    try {
        const ledger = new DeliveryLedger();
        const delivery = deliveryRun({
            productRequest: P070,
            ledger,
            deliveryRoles: { service: false, interface: true, program: false },
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

describe('P070: a travel agency server that routes by its path segments', () => {
    it('reads a route for every collection the list names, and the literal segment beside it', async () => {
        const evidence = await collectServerEvidence([tree({ 'server.js': SERVER })], []);
        const read = evidence.routes.map(r => r.path);
        expect(read).toEqual(expect.arrayContaining(['/api/trips', '/api/travelers', '/api/bookings', '/api/summary']));
        //  The served path is the server's to prove: never believed, only probed.
        expect(evidence.routes.filter(r => ['/api/trips', '/api/travelers', '/api/bookings'].includes(r.path)).every(r => r.known === false)).toBe(true);
    });

    it('is delivered: every record he named is served by the live server', async () => {
        const { served, coverage } = await measure({ 'server.js': SERVER }, ['trips', 'travelers', 'bookings']);
        expect(served).toEqual({ trips: true, bookings: true, travelers: true });
        expect(String(coverage?.error || '')).not.toMatch(/requested_entities_not_delivered/u);
    });

    it('…and a collection the list does not name is still not served', async () => {
        const noTravelers = SERVER.replace("const COLLECTIONS = ['trips', 'travelers', 'bookings'];", "const COLLECTIONS = ['trips', 'bookings'];");
        const evidence = await collectServerEvidence([tree({ 'server.js': noTravelers })], []);
        expect(evidence.routes.map(r => r.path)).not.toContain('/api/travelers');
    });

    it('a list checked against something that is not a path segment registers nothing', async () => {
        const ROLES = [
            `const http = require('http');`,
            `const ROLES = ['admin', 'agent'];`,
            `http.createServer((req, res) => {`,
            `  const role = req.headers['x-role'];`,
            `  if (!ROLES.includes(role)) { res.writeHead(403); return res.end(); }`,
            `  res.end('ok');`,
            `}).listen(3000);`,
        ].join('\n');
        const evidence = await collectServerEvidence([tree({ 'server.js': ROLES })], []);
        expect(evidence.routes.map(r => r.path)).not.toEqual(expect.arrayContaining(['/admin']));
        expect(evidence.routes.map(r => r.path)).not.toEqual(expect.arrayContaining(['/agent']));
    });
});
