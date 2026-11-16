import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import net from 'net';
import { AddressInfo } from 'net';
import {
    collectServerEvidence,
    coverageUnverified,
    identifiersFor,
    judgeRequestCoverage,
    probePathsFor,
    probeServedResources,
    requestedRecords,
    takenIdentifiers,
    type CoverageEvidence,
    type ProbeResult,
    type RequestedRecords,
} from '../core/quality/request-coverage';
import {
    deliveryVerdict,
    readUnverifiedRecord,
    stillUnverified,
    unverifiedRecordText,
    verifiedAsRequirements,
    type DeliveryMeasurement,
} from '../core/quality/delivery-verdict';

/**
 * The 500 exam on Claude, 2026-11-12/13 (TRIAGE-2026-11-15, groups 3 and 8).
 *
 * Group 3 (P129, P139, P149, P188): «العروض», «وحدات الدم», «الدخول» have no
 * dictionary English, so their only Latin name is a transliteration
 * («whdat_dms») and no route could be matched to it. P139 served and tested
 * /api/blood-units with 29 passing tests, the judge found «نقاط وصول خاصة
 * بوحدات الدم» met — and the delivery was refused as «not measured, so not
 * verified: whdat_dms — وحدات الدم», words the builder could do nothing with.
 *
 * Group 8 (P078): a mosque dashboard served every record through
 * `/api/:kind` behind a table of kinds, with a page route `/prayers` beside
 * it. The probe took the page for a route that «does not answer», never asked
 * `/api/prayers`, and an unanswered probe (the server restarting) became «not
 * served» — the verdict flipped between runs on the same code.
 *
 * Each sound case is paired with one that truly does not serve the record:
 * that one is still refused.
 */
const P139 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـمركز تبرع بالدم فيها نقاط وصول لـالمتبرعين والتبرعات ووحدات الدم، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P078 = 'ابني لوحة تحكم لإدارة مسجد: إضافة وتعديل وحذف وبحث في مواقيت الصلاة والدروس والتبرعات، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.';
const P139_MET = [
    'يجب أن تحتوي الواجهة على نقاط وصول خاصة بالمتبرعين',
    'يجب أن تحتوي الواجهة على نقاط وصول خاصة بالتبرعات',
    'يجب أن تحتوي الواجهة على نقاط وصول خاصة بوحدات الدم',
    'التحقق من صحة المدخلات',
];

const roots: string[] = [];
const servers: http.Server[] = [];
afterAll(async () => {
    await Promise.all(servers.map(s => new Promise(r => s.close(r))));
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-coverage-name-'));
    roots.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
}
const serve = (handler: http.RequestListener) => new Promise<string>(resolve => {
    const s = http.createServer(handler).listen(0, '127.0.0.1', () => { servers.push(s); resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`); });
});
const json = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const page = (res: http.ServerResponse) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><title>x</title>'); };
/** A port nothing listens on: every GET there is refused, as while a server restarts. */
const closedPort = () => new Promise<string>(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const port = (s.address() as AddressInfo).port; s.close(() => resolve(`http://127.0.0.1:${port}`)); });
});

//  Each request here asks for a server (an API, a dashboard with records): read as the gate reads it when one was built.
const read = (text: string) => requestedRecords(text, { backendRequested: true });
async function probeAll(base: string, records: RequestedRecords, evidence: CoverageEvidence) {
    const details: Record<string, string[]> = {};
    const probe: Record<string, ProbeResult> = await probeServedResources(base, evidence.prefixes, records.entities.map(record => {
        const ids = identifiersFor(record, evidence.labelKeys[record.key] || [], records.entities);
        return { key: record.key, ids, paths: probePathsFor(evidence, ids, takenIdentifiers(record, records.entities)) };
    }), { timeoutMs: 1500, details });
    return { probe, details };
}

// ─── P139: a blood bank whose «وحدات الدم» is served at /api/blood-units ─────────────────────────────

const BLOOD_SERVER = (withUnits: boolean) => [
    "const express = require('express');",
    'const app = express();',
    "app.get('/api/donors', (q, r) => r.json([]));",
    "app.post('/api/donors', (q, r) => r.status(201).json({}));",
    "app.get('/api/donations', (q, r) => r.json([]));",
    "app.post('/api/donations', (q, r) => r.status(201).json({}));",
    ...(withUnits ? [
        "app.get('/api/blood-units', (q, r) => r.json([]));",
        "app.post('/api/blood-units', (q, r) => r.status(201).json({}));",
        "app.patch('/api/blood-units/:id/status', (q, r) => r.json({}));",
    ] : []),
    "app.use((q, r) => r.status(404).json({ error: { code: 'ROUTE_NOT_FOUND' } }));",
    'module.exports = app;',
].join('\n');
const BLOOD_TESTS = (withUnits: boolean) => [
    "const test = require('node:test');",
    "test('POST /api/donors', async () => { await call('POST', '/api/donors', {}); });",
    "test('GET /api/donations', async () => { await call('GET', '/api/donations'); });",
    ...(withUnits ? ["test('POST /api/blood-units ينشئ وحدة دم', async () => { await call('POST', '/api/blood-units', {}); });"] : []),
].join('\n');
const bloodTree = (withUnits: boolean) => tree({
    'package.json': JSON.stringify({ name: 'blood', scripts: { start: 'node src/server.js', test: 'node --test' }, dependencies: { express: '^5.1.0' } }),
    'src/app.js': BLOOD_SERVER(withUnits),
    'test/api.test.js': BLOOD_TESTS(withUnits),
});
const bloodBase = (withUnits: boolean) => serve((req, res) => {
    const url = String(req.url).replace(/\/$/u, '');
    if (url === '/api/donors' || url === '/api/donations' || (withUnits && url === '/api/blood-units')) return json(res, 200, []);
    return json(res, 404, { error: { code: 'ROUTE_NOT_FOUND' } });
});
const passed = { root: '/p', ran: true, passed: true, runner: 'npm test' };

async function bloodCoverage(withUnits: boolean) {
    const records = read(P139);
    const evidence = await collectServerEvidence([bloodTree(withUnits)], records.entities);
    const { probe, details } = await probeAll(await bloodBase(withUnits), records, evidence);
    const report = judgeRequestCoverage({ records, evidence, probe, probeDetails: details, backendRequested: true, testsRun: passed });
    return { records, report, unverified: coverageUnverified(report) };
}
const ledger = (coverage: { unverified: string[]; ok?: boolean; error?: string }, testsOk: boolean, met: string[]): DeliveryMeasurement[] => [
    { instrument: 'live', ok: true, url: 'http://127.0.0.1:1' },
    { instrument: 'coverage', ok: coverage.ok !== false, error: coverage.error, unread: [], unverified: coverage.unverified },
    { instrument: 'tests', ok: testsOk, target: '/p' },
    { instrument: 'acceptance', ok: true, met },
];

describe('a record whose only Latin name is a transliteration is measured by the route its tests call, its tests, and the judge (P139)', () => {
    it('his record is «whdat_dms», not measured on its own — and the coverage names the unclaimed route its tests call and how to measure it', async () => {
        const { records, report, unverified } = await bloodCoverage(true);
        expect(records.entities.map(e => e.key)).toContain('whdat_dms');
        expect(report.missing).toEqual([]);
        const units = report.records.find(r => r.key === 'whdat_dms')!;
        expect(units.served).toBeNull();
        expect(units.routes).toEqual(['GET /api/blood-units']);
        const item = unverified.find(u => u.startsWith('whdat_dms'))!;
        expect(item).toMatch(/its tests call routes named for none of his records: GET \/api\/blood-units/u);
        //  …and words the builder can act on.
        expect(item).toMatch(/\{ key: 'blood-units', ar: 'وحدات الدم' \}/u);
    });
    it('served, tested and judged met — «بوحدات الدم» holds «وحدات الدم» — it is delivered', async () => {
        const { unverified } = await bloodCoverage(true);
        const verdict = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: ledger({ unverified }, true, P139_MET) });
        expect(verdict.unverified).toEqual([]);
        expect(verdict.verified).toBe(true);
    });
    it('the route removed (it answers 404): no route stands for it, and it is still not verified, told how to measure it', async () => {
        const { report, unverified } = await bloodCoverage(false);
        expect(report.records.find(r => r.key === 'whdat_dms')!.routes).toEqual([]);
        const verdict = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: ledger({ unverified }, true, P139_MET) });
        expect(verdict.verified).toBe(false);
        expect(verdict.unverified.join(' ')).toMatch(/whdat_dms — وحدات الدم \(serving not measured, tests not measured\) — his word has no English name/u);
    });
    it('the project\'s tests failing, or not run: nothing is read', async () => {
        const { unverified } = await bloodCoverage(true);
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: ledger({ unverified }, false, P139_MET) }).verified).toBe(false);
        const noTests = ledger({ unverified }, true, P139_MET).filter(m => m.instrument !== 'tests');
        expect(stillUnverified(noTests)).toEqual(unverified);
    });
    it('the judge found no requirement holding his words met: nothing is read', async () => {
        const { unverified } = await bloodCoverage(true);
        const verdict = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: ledger({ unverified }, true, P139_MET.filter(m => !m.includes('الدم'))) });
        expect(verdict.verified).toBe(false);
        expect(verdict.unverified).toHaveLength(1);
    });
    it('a rule no instrument measured («each staff member sees only their own records») is never read by the judge', () => {
        const rule = 'per-user record isolation — «وكل موظف يرى سجلاته فقط» (not measured)';
        expect(readUnverifiedRecord(rule)).toBeNull();
        expect(verifiedAsRequirements([rule], ['يجب أن يرى كل موظف سجلاته فقط'], true)).toEqual([]);
    });
    it('one route no named record claims never stands for two transliterated records', async () => {
        const text = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـسينما فيها نقاط وصول لـالأفلام والعروض والحفلات، مع اختبارات آلية لكل نقطة.';
        const records = read(text);
        const translit = records.entities.filter(e => /^[a-z_]+$/u.test(e.key) && !/movie/u.test(e.key));
        expect(translit.map(e => e.key)).toEqual(['arwds', 'hflats']);
        const dir = tree({
            'server.js': "const express = require('express');\nconst app = express();\napp.get('/api/movies', (q, r) => r.json([]));\napp.get('/api/showtimes', (q, r) => r.json([]));\n",
            'test/a.test.js': "test('x', async () => { await call('GET', '/api/movies'); await call('GET', '/api/showtimes'); });\n",
        });
        const report = judgeRequestCoverage({ records, evidence: await collectServerEvidence([dir], records.entities), backendRequested: true, testsRun: passed });
        for (const record of report.records.filter(r => translit.some(t => t.key === r.key))) expect(record.routes || []).toEqual([]);
    });
    it('the item reads back as it was written', () => {
        const text = unverifiedRecordText({ label: 'arwds — العروض', words: 'العروض', serving: true, presence: false, tests: true, routes: ['GET /showtimes', 'POST /showtimes'], how: 'bind it' });
        expect(readUnverifiedRecord(text)).toMatchObject({ label: 'arwds — العروض', words: 'العروض', serving: true, tests: true, presence: false, routes: ['GET /showtimes', 'POST /showtimes'] });
        expect(verifiedAsRequirements([text], ['توفير نقاط وصول للعروض'], true)).toEqual([text]);
    });
});

// ─── P078: `/api/:kind` behind a table of kinds, a page route beside each section ───────────────────

const MOSQUE_SERVER = (kinds: string[], pages: boolean) => [
    "const express = require('express');",
    'const app = express();',
    `const KINDS = { ${kinds.map(k => `${k}: { fields: ['notes'] }`).join(', ')} };`,
    "app.get('/api/sections', (req, res) => res.json([{ key: 'prayers', title: 'مواقيت الصلاة' }, { key: 'lessons', title: 'الدروس' }, { key: 'donations', title: 'التبرعات' }]));",
    ...(pages ? ["for (const key of ['prayers', 'lessons', 'donations']) {", "  app.get('/' + key, (req, res) => res.sendFile('index.html'));", '}'] : []),
    "app.get('/api/summary', (req, res) => res.json({}));",
    "app.get('/api/:kind', (req, res) => { if (!KINDS[req.params.kind]) return res.status(404).json({ error: 'no' }); res.json([]); });",
    "app.post('/api/:kind', (req, res) => res.status(201).json({}));",
].join('\n');
const mosqueBase = (kinds: string[], pages: boolean) => serve((req, res) => {
    const url = String(req.url).replace(/\/$/u, '') || '/';
    if (pages && ['/prayers', '/lessons', '/donations'].includes(url)) return page(res);
    const kind = url.match(/^\/api\/([^/]+)$/u)?.[1];
    if (kind === 'sections' || kind === 'summary') return json(res, 200, []);
    if (kind) return kinds.includes(kind) ? json(res, 200, []) : json(res, 404, { error: 'no' });
    res.writeHead(404, { 'content-type': 'text/html' });
    return res.end('<pre>Cannot GET</pre>');
});

describe('a record served through a table of kinds is asked for where it is served (P078)', () => {
    it('the page route answers with a page: the record is asked for under /api/, and all three are served', async () => {
        const records = read(P078);
        const evidence = await collectServerEvidence([tree({ 'server.js': MOSQUE_SERVER(['prayers', 'lessons', 'donations'], true) })], records.entities);
        const { probe, details } = await probeAll(await mosqueBase(['prayers', 'lessons', 'donations'], true), records, evidence);
        expect(Object.values(probe)).toEqual(['served', 'served', 'served']);
        const report = judgeRequestCoverage({ records, evidence, probe, probeDetails: details, backendRequested: true });
        expect(report.missing).toEqual([]);
        expect(report.unverified).toEqual([]);
        expect(details[records.entities[0].key].join(' ')).toMatch(/answers with a page, not with records/u);
    });
    it('a kind the table does not hold (its /api/ path answers 404) is still not served', async () => {
        const records = read(P078);
        const evidence = await collectServerEvidence([tree({ 'server.js': MOSQUE_SERVER(['lessons', 'donations'], true) })], records.entities);
        const { probe, details } = await probeAll(await mosqueBase(['lessons', 'donations'], true), records, evidence);
        const report = judgeRequestCoverage({ records, evidence, probe, probeDetails: details, backendRequested: true });
        expect(report.missing.map(r => r.ar)).toEqual(['مواقيت الصلاة']);
        expect(report.missing[0].served).toBe(false);
    });
    it('without page routes the label table names «prayers» for «مواقيت الصلاة», and the probe finds it served', async () => {
        const records = read(P078);
        const evidence = await collectServerEvidence([tree({ 'server.js': MOSQUE_SERVER(['prayers', 'lessons', 'donations'], false) })], records.entities);
        const { probe } = await probeAll(await mosqueBase(['prayers', 'lessons', 'donations'], false), records, evidence);
        expect(Object.values(probe)).toEqual(['served', 'served', 'served']);
    });
    it('the server not answering (refused, as while it restarts) is «not measured», never «not served» — and says so', async () => {
        const records = read(P078);
        const evidence = await collectServerEvidence([tree({ 'server.js': MOSQUE_SERVER(['prayers', 'lessons', 'donations'], false) })], records.entities);
        const started = Date.now();
        const { probe, details } = await probeAll(await closedPort(), records, evidence);
        expect(Date.now() - started).toBeLessThan(15000);
        expect(Object.values(probe)).toEqual(['inconclusive', 'inconclusive', 'inconclusive']);
        const report = judgeRequestCoverage({ records, evidence, probe, probeDetails: details, backendRequested: true });
        expect(report.missing).toEqual([]);
        expect(report.records.map(r => r.served)).toEqual([null, null, null]);
        expect(coverageUnverified(report).join(' ')).toMatch(/did not answer the probe, asked twice/u);
    });
    it('a GET whose first answer was lost is asked once more, and the record is served', async () => {
        let first = true;
        const base = await serve((req, res) => {
            if (first) { first = false; req.socket.destroy(); return; }
            return req.url === '/api/patients' ? json(res, 200, []) : json(res, 404, {});
        });
        const dir = tree({ 'server.js': "const express = require('express');\nconst app = express();\napp.get('/api/patients', (q, r) => r.json([]));\n" });
        const evidence = await collectServerEvidence([dir], []);
        const ids = ['patients', 'patient'];
        expect(await probeServedResources(base, evidence.prefixes, [{ key: 'patients', ids, paths: probePathsFor(evidence, ids) }], { timeoutMs: 1500 })).toEqual({ patients: 'served' });
    });
});

describe('a list of Latin names is not a name and its label', () => {
    it('`[\'services\', \'offers\', \'reviews\']` binds nothing; `[\'offers\', \'العروض\']` binds offers to his word', async () => {
        const text = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـسوق عمل حر فيها نقاط وصول لـالخدمات والعروض والتقييمات، مع اختبارات آلية لكل نقطة.';
        const records = read(text);
        const list = await collectServerEvidence([tree({ 'src/store.js': "const COLLECTIONS = ['services', 'offers', 'reviews'];\nmodule.exports = COLLECTIONS;\n" })], records.entities);
        expect(list.labelKeys.services || []).not.toContain('offers');
        const offers = records.entities.find(e => e.ar === 'العروض')!;
        const pair = await collectServerEvidence([tree({ 'src/menu.js': "module.exports = [['offers', 'العروض'], ['reviews', 'التقييمات']];\n" })], records.entities);
        expect(pair.labelKeys[offers.key] || []).toContain('offers');
    });
});
