/**
 * ⛔ A ROUTE VOUCHES ONLY FOR THE RECORD IT IS BOUND TO (request-coverage routeBoundTo,
 * delivery-verdict verifiedAsRequirements).
 *
 * The r40 review, 2026-11-15: every record whose only Latin name is a transliteration was
 * handed the same list of unclaimed tested routes. With two such records and two unrelated
 * routes, a record never built («العروض») passed once the judge's met text held its words,
 * on the strength of `/api/settings`. Pinned: a route stands for a record only where the
 * delivery writes his word beside it (a test's name, an index entry, the handler), and for
 * one record only; the sound P139 shape (a-record-served-and-tested-is-measured-whatever-
 * its-name.test.ts) is still delivered.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence, coverageUnverified, judgeRequestCoverage, requestedRecords } from '../core/quality/request-coverage';
import { deliveryVerdict, unverifiedRecordText, verifiedAsRequirements, type DeliveryMeasurement } from '../core/quality/delivery-verdict';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-route-bound-'));
    roots.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
}

const CINEMA = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـسينما فيها نقاط وصول لـالأفلام والعروض والحفلات، مع اختبارات آلية لكل نقطة.';
const MET = ['توفير نقاط وصول للأفلام', 'توفير نقاط وصول للعروض', 'توفير نقاط وصول للحفلات'];
const passed = { root: '/p', ran: true, passed: true, runner: 'npm test' };

/** A cinema whose «الحفلات» is served at /api/parties, with /api/settings beside it; «العروض» is built or not. */
function cinema(withShowtimes: boolean) {
    return tree({
        'server.js': [
            "const express = require('express');",
            'const app = express();',
            "app.get('/api/movies', (q, r) => r.json([]));",
            "app.get('/api/parties', (q, r) => r.json([]));",
            "app.get('/api/settings', (q, r) => r.json({ theme: 'dark' }));",
            ...(withShowtimes ? ["app.get('/api/showtimes', (q, r) => r.json([]));"] : []),
        ].join('\n'),
        'test/api.test.js': [
            "const test = require('node:test');",
            "test('GET /api/movies', async () => { await call('GET', '/api/movies'); });",
            "test('GET /api/parties يعرض الحفلات', async () => { await call('GET', '/api/parties'); });",
            "test('GET /api/settings', async () => { await call('GET', '/api/settings'); });",
            ...(withShowtimes ? ["test('GET /api/showtimes يعرض قائمة العروض', async () => { await call('GET', '/api/showtimes'); });"] : []),
        ].join('\n'),
    });
}

async function judge(withShowtimes: boolean) {
    const records = requestedRecords(CINEMA, { backendRequested: true });
    const evidence = await collectServerEvidence([cinema(withShowtimes)], records.entities);
    const report = judgeRequestCoverage({ records, evidence, backendRequested: true, testsRun: passed });
    const unverified = coverageUnverified(report);
    const measurements: DeliveryMeasurement[] = [
        { instrument: 'live', ok: true, url: 'http://127.0.0.1:1' },
        { instrument: 'coverage', ok: report.missing.length === 0, unread: [], unverified },
        { instrument: 'tests', ok: true, target: '/p' },
        { instrument: 'acceptance', ok: true, met: MET },
    ];
    return { records, report, verdict: deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements }) };
}

describe('an unrelated tested route never stands for a record', () => {
    it('«العروض», never built, is not verified by /api/settings', async () => {
        const { records, report, verdict } = await judge(false);
        const shows = records.entities.find(e => e.ar === 'العروض')!;
        expect(report.records.find(r => r.key === shows.key)!.routes || []).toEqual([]);
        expect(verdict.verified).toBe(false);
        expect(verdict.unverified.join(' ')).toMatch(/العروض/u);
    });

    it('a route listed for two records stands for neither', () => {
        const a = unverifiedRecordText({ label: 'arwds — العروض', words: 'العروض', serving: true, presence: false, tests: true, routes: ['GET /api/settings'] });
        const b = unverifiedRecordText({ label: 'hflats — الحفلات', words: 'الحفلات', serving: true, presence: false, tests: true, routes: ['GET /api/settings'] });
        expect(verifiedAsRequirements([a, b], MET, true)).toEqual([]);
    });
});

describe('the must-not twin: the route his word is written beside still stands for it', () => {
    it('«الحفلات» is bound to /api/parties by its test\'s name and delivered; «العروض» built at /api/showtimes is too', async () => {
        const without = await judge(false);
        const parties = without.records.entities.find(e => e.ar === 'الحفلات')!;
        expect(without.report.records.find(r => r.key === parties.key)!.routes).toEqual(['GET /api/parties']);
        expect(without.verdict.unverified.join(' ')).not.toMatch(/الحفلات/u);

        const built = await judge(true);
        const shows = built.records.entities.find(e => e.ar === 'العروض')!;
        expect(built.report.records.find(r => r.key === shows.key)!.routes).toEqual(['GET /api/showtimes']);
        expect(built.verdict.unverified).toEqual([]);
        expect(built.verdict.verified).toBe(true);
    });

    it('his word in the handler a registration opens binds it (P139: «notFound(\'وحدة الدم\')»)', async () => {
        const request = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـمركز تبرع بالدم فيها نقاط وصول لـالمتبرعين والتبرعات ووحدات الدم، مع اختبارات آلية لكل نقطة.';
        const records = requestedRecords(request, { backendRequested: true });
        const dir = tree({
            'src/app.js': [
                "const express = require('express');",
                'const app = express();',
                "app.get('/api/donors', (q, r) => r.json([]));",
                "app.get('/api/donations', (q, r) => r.json([]));",
                "app.get('/api/blood-units/:id', (req, res) => {",
                '  const unit = store.get(req.params.id);',
                "  if (!unit) throw notFound('وحدة الدم', req.params.id);",
                '  res.json(unit);',
                '});',
                "app.get('/api/blood-units', (q, r) => r.json([]));",
            ].join('\n'),
            'test/api.test.js': "test('units', async () => { await call('GET', '/api/blood-units'); await call('GET', '/api/donors'); await call('GET', '/api/donations'); });\n",
        });
        const report = judgeRequestCoverage({ records, evidence: await collectServerEvidence([dir], records.entities), backendRequested: true, testsRun: passed });
        const units = records.entities.find(e => e.ar === 'وحدات الدم')!;
        expect(report.records.find(r => r.key === units.key)!.routes).toEqual([expect.stringMatching(/^GET \/api\/blood-units/u)]);
    });

    it('a route listed for one record only, with a requirement holding his words met, is read', () => {
        const a = unverifiedRecordText({ label: 'arwds — العروض', words: 'العروض', serving: true, presence: false, tests: true, routes: ['GET /api/showtimes'] });
        const b = unverifiedRecordText({ label: 'hflats — الحفلات', words: 'الحفلات', serving: true, presence: false, tests: true, routes: ['GET /api/parties'] });
        expect(verifiedAsRequirements([a, b], MET, true)).toEqual([a, b]);
    });
});
