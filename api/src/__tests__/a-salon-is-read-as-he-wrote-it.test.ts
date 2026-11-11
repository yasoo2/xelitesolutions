/**
 * ⛔ «عدة فروع وموظفين … تأكيد الحجز وإلغاؤه» NAMES BRANCHES, STAFF AND BOOKINGS.
 *
 * The hard exam, 2026-11-04, H10: «ابني منصة حجز مواعيد لصالونات تجميل: عدة
 * فروع وموظفين، خدمات بمدد مختلفة، حساب الأوقات المتاحة بلا تعارض، تأكيد
 * الحجز وإلغاؤه، تذكير قبل الموعد، ولوحة للمالك تعرض الإيرادات.» A salon
 * platform that served branches, staff, services and bookings was refused four
 * times over «ada_frwas — عدة فروع (presence not measured)»:
 *   - «عدة» says how many; it was keyed into the record's name;
 *   - «تأكيد الحجز» is confirming the booking, read as a record of its own,
 *     and «إلغاؤه» (cancelling it) as an unread item;
 *   - its server routed with `if (m === 'POST' && p === '/api/branches')` on
 *     `http.createServer`, so no route was read and the build was measured as
 *     a static page;
 *   - his «موظفين» are the build's `staff`.
 * Measured over the 520 exam prompts and the 554 projects the exam built: only
 * H10's records changed, and only projects routing by comparing paths gained
 * routes; none lost one.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { cleanListItem } from '../core/design/request-lists';
import { isActionWord } from '../core/design/listed-request';
import { collectServerEvidence, identifiersFor, judgeRequestCoverage, requestedRecords } from '../core/quality/request-coverage';

const H10 = 'ابني منصة حجز مواعيد لصالونات تجميل: عدة فروع وموظفين، خدمات بمدد مختلفة، حساب الأوقات المتاحة بلا تعارض، تأكيد الحجز وإلغاؤه، تذكير قبل الموعد، ولوحة للمالك تعرض الإيرادات.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-salon-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const SERVER = [
    `const http = require('http');`,
    `async function handleApi(req, res, url) {`,
    `  const p = url.pathname.replace(/\\/+$/, '');`,
    `  const m = req.method;`,
    `  if (m === 'GET' && p === '/api/state') return send(res, 200, db);`,
    `  if (m === 'POST' && p === '/api/branches') return send(res, 201, addBranch(req));`,
    `  if (m === 'POST' && p === '/api/services') return send(res, 201, addService(req));`,
    `  if (m === 'POST' && p === '/api/staff') return send(res, 201, addStaff(req));`,
    `  if (m === 'POST' && p === '/api/bookings') return send(res, 201, createBooking(req));`,
    `}`,
    `http.createServer(async (req, res) => {`,
    `  const url = new URL(req.url, 'http://localhost');`,
    `  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);`,
    `  const file = url.pathname === '/' ? '/index.html' : url.pathname;`,
    `  serveFile(res, file);`,
    `}).listen(process.env.PORT || 3000);`,
].join('\n');

describe('a quantifier, an action on a record, and a server with no framework', () => {
    it.each([
        ['عدة فروع', 'فروع'],
        ['جميع الطلبات', 'الطلبات'],
        ['multiple branches', 'branches'],
        ['several warehouses', 'warehouses'],
    ])('«%s» lists «%s»', (raw, item) => {
        expect(cleanListItem(raw)).toBe(item);
    });

    it.each(['إلغاؤه', 'وإلغاؤه', 'تعديله', 'cancel', 'confirm'])('«%s» is an action on a record, never an item', word => {
        expect(isActionWord(word)).toBe(true);
    });

    it('H10 names branches, staff, services and bookings — and nothing it did not name', () => {
        const reading = requestedRecords(H10, { backendRequested: true });
        expect(reading.entities.map(e => e.key).sort()).toEqual(['bookings', 'branches', 'employees', 'services']);
        expect(reading.unread).toEqual(['تذكير قبل الموعد']);
    });

    it('his «موظفين» answer to the build\'s `staff`', () => {
        const employees = requestedRecords(H10, { backendRequested: true }).entities.find(e => e.key === 'employees')!;
        expect(identifiersFor(employees)).toContain('staff');
    });

    it('a server that routes by comparing the path serves those paths, with their methods', async () => {
        const evidence = await collectServerEvidence([tree({ 'server.js': SERVER, 'public/index.html': '<h1>صالون</h1>' })], []);
        const served = evidence.routes.map(r => `${r.method} ${r.path}`);
        expect(served).toEqual(expect.arrayContaining(['get /api/state', 'post /api/branches', 'post /api/staff', 'post /api/bookings']));
        //  the page and its root are no routes
        expect(evidence.routes.some(r => r.path === '' || r.path === '/' || r.path.includes('.'))).toBe(false);
    });

    it('H10\'s records are measured served on that server', async () => {
        const records = requestedRecords(H10, { backendRequested: false });
        const evidence = await collectServerEvidence([tree({ 'server.js': SERVER })], records.entities);
        const report: any = judgeRequestCoverage({ records, evidence, backendRequested: false });
        expect(report.records.map((r: any) => [r.key, r.served])).toEqual(expect.arrayContaining([
            ['branches', true], ['employees', true], ['services', true], ['bookings', true],
        ]));
    });

    it('a static file server with no path of its own registers nothing', async () => {
        const STATIC = [
            `const http = require('http');`,
            `http.createServer((req, res) => {`,
            `  const file = req.url === '/' ? '/index.html' : req.url;`,
            `  if (file === '/favicon.ico') return res.end();`,
            `  serveFile(res, file);`,
            `}).listen(8080);`,
        ].join('\n');
        expect((await collectServerEvidence([tree({ 'server.js': STATIC })], [])).routes).toEqual([]);
    });
});
