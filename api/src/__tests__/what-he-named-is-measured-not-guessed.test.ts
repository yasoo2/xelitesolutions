import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { AddressInfo } from 'net';
import {
    applyTestScriptPatch,
    backendRequestedFor,
    collectServerEvidence,
    coverageUnverified,
    identifiersFor,
    isTestFile,
    judgeRequestCoverage,
    liveTestText,
    probePathsFor,
    probeServedResources,
    requestCoverageRepairTask,
    requestedRecords,
    runRequestedTests,
    testsRequestedIn,
    type RequestCoverageReport,
    type RequestedRecords,
} from '../core/quality/request-coverage';
import { deliveryVerdict } from '../core/quality/delivery-verdict';

/**
 * Round 20 — the adversarial review of round 19's record-coverage gate found
 * it misread what he named and measured the wrong thing:
 *   - Arabic admin lists led by «إضافة وتعديل وحذف وبحث في …» produced no
 *     records at all (18/50 admin prompts silently skipped), while English
 *     «add, edit, delete» became records called adds/edits/deletes;
 *   - «and each staff member only sees their own records» was an «unread
 *     record», so 49/50 full-stack prompts could never be verified;
 *   - a landing page's sections («الخدمات، وآراء العملاء») were demanded as
 *     records, and .html was never read — the real P001 tree was blocked;
 *   - a POST route outvoted a GET route the probe found absent; versioned and
 *     FastAPI trailing-slash routes were refuted by a probe of the wrong path;
 *   - an API-client module's `api.post('/api/x', data)` counted as a route;
 *   - «tested» was a word in any test file, even a skipped one, and never ran;
 *   - «students, teachers and tests» asked for automated tests.
 */
const P001 = 'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.';
const P002 = 'Build a professional landing website for a private school with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu.';
const P051 = 'Build an admin dashboard for a dental clinic to manage patients, appointments, treatments: add, edit, delete and search each one, with a summary page showing totals and a chart.';
const P052 = 'ابني لوحة تحكم لإدارة مدرسة خاصة: إضافة وتعديل وحذف وبحث في الطلاب والصفوف والعلامات، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.';
const P053 = 'Build an admin dashboard for a restaurant to manage menu items, orders, tables: add, edit, delete and search each one, with a summary page showing totals and a chart.';
const P080 = 'ابني لوحة تحكم لإدارة مصمم مستقل: إضافة وتعديل وحذف وبحث في الأعمال والعملاء والفواتير، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.';
const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P102 = 'Create a REST API with Node.js and Express for a private school with endpoints for students, classes, grades, input validation, proper error codes, and automated tests for every endpoint.';
const P151 = 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.';
const P152 = 'ابني نظام متكامل لـمدرسة خاصة: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الطلاب والصفوف والعلامات، وكل موظف يرى سجلاته فقط.';
const P245 = 'ابني متجر إلكتروني لـإدارة المصاريف الشخصية: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.';
const P445 = 'اعمل لعبة أسئلة في المتصفح عن إدارة المصاريف الشخصية فيها 10 أسئلة، ومؤقت لكل سؤال، وحساب النقاط، وشاشة نتيجة نهائية وزر إعادة.';

const read = (text: string) => requestedRecords(text, { backendRequested: backendRequestedFor(text) });
const keys = (r: RequestedRecords) => r.entities.map(e => e.key).sort();

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-coverage-'));
    roots.push(dir);
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
}

describe('what the request names is read in both languages, actions and rules taken off', () => {
    it('a presentation page owes no records: P001 and P002 alike', () => {
        expect(read(P001)).toMatchObject({ entities: [], unread: [] });
        expect(read(P002)).toMatchObject({ entities: [], unread: [] });
    });
    it('an Arabic admin list led by actions is read like its English twin (P051/P052)', () => {
        expect(keys(read(P051))).toEqual(['appointments', 'patients', 'treatments']);
        expect(read(P052)).toMatchObject({ unread: [] });
        expect(keys(read(P052))).toEqual(['classes', 'grades', 'students']);
    });
    it('«add, edit, delete and search each one» is never a table (P053), and Arabic actions are never unread (P080)', () => {
        const p053 = read(P053);
        expect(keys(p053)).not.toEqual(expect.arrayContaining(['adds']));
        expect(p053.entities.map(e => e.key)).toEqual(expect.arrayContaining(['tables', 'orders']));
        expect(p053.unread).toEqual([]);
        const p080 = read(P080);
        expect(p080.unread).toEqual([]);
        expect(p080.entities.map(e => e.key)).toEqual(expect.arrayContaining(['customers', 'invoices']));
        expect(p080.entities.length).toBe(3);
    });
    it('«each staff member only sees their own records» is a named capability, never an unread record (P151/P152)', () => {
        const en = read(P151);
        expect(keys(en)).toEqual(['appointments', 'patients', 'treatments']);
        expect(en.unread).toEqual([]);
        expect(en.capabilities?.join(' ')).toMatch(/per-user record isolation .*each staff member only sees their own records/);
        const ar = read(P152);
        expect(keys(ar)).toEqual(['classes', 'grades', 'students']);
        expect(ar.unread).toEqual([]);
        expect(ar.capabilities?.join(' ')).toMatch(/per-user record isolation .*كل موظف يرى سجلاته فقط/);
    });
    it('a short rule clause ends the list in both languages — it is behaviour, never an unread record', () => {
        const en = read('Build a system to manage orders, invoices, customers, where admins approve each invoice.');
        expect(en.unread).toEqual([]);
        expect(en.clauses?.join(' ')).toMatch(/where admins approve/);
        const ar = read('ابني نظاماً فيه إدارة الطلبات والفواتير والعملاء، حيث يوافق المدير');
        expect(ar.unread).toEqual([]);
        expect(ar.clauses?.join(' ')).toMatch(/حيث يوافق المدير/);
    });
    it('a landing page that also has a sign-in still owes sections, not records', () => {
        expect(read('Build a landing page for a gym with sign in, services, trainers and pricing sections.')).toMatchObject({ entities: [], unread: [] });
    });
    it('P101 names patients, appointments and treatments — «العلاجات» has its English, not a transliteration', () => {
        expect(keys(read(P101))).toEqual(['appointments', 'patients', 'treatments']);
    });
    it('stack and login words in a list are not records; a noun nobody can translate stays unread, honestly (P178)', () => {
        const p178 = read('ابني نظام متكامل لـمسجد: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة مواقيت الصلاة والدروس والتبرعات، وكل موظف يرى سجلاته فقط.');
        expect(p178.unread).toEqual(['مواقيت الصلاة']);
        expect(p178.entities.map(e => e.key).sort()).toEqual(['donations', 'lessons']);
    });
    it('a store\'s feature list and a quiz game\'s features are not records (P245, P445)', () => {
        expect(read(P245).unread).toEqual([]);
        expect(read(P445)).toMatchObject({ entities: [], unread: [] });
    });
    it('the backend the gate asks about is a declared one — an invoice in a list is a record, not a server', () => {
        expect(backendRequestedFor(P080)).toBe(false);
        expect(backendRequestedFor(P101)).toBe(true);
        expect(backendRequestedFor(P151)).toBe(true);
    });
});

describe('tests are a deliverable only when asked for as one', () => {
    it('qualified or framed tests count; a records list or a verb does not', () => {
        expect(testsRequestedIn(P101)).toMatch(/اختبارات آلية/);
        expect(testsRequestedIn(P102)).toMatch(/automated tests/);
        expect(testsRequestedIn('Build a Flask API for a library with books and members. Write unit tests for every endpoint.')).toMatch(/unit tests/);
        expect(testsRequestedIn('Build a school system with login to manage students, teachers and tests')).toBeNull();
        expect(testsRequestedIn('ابني نظام لمدرسة لإدارة الطلاب والمعلمين والاختبارات مع تسجيل دخول')).toBeNull();
        expect(testsRequestedIn('Build a quiz app that tests kids on math')).toBeNull();
    });
    it('common test layouts are test files', () => {
        expect(isTestFile('/p/app/tests.py')).toBe(true);
        expect(isTestFile('/p/test.js')).toBe(true);
        expect(isTestFile('/p/src/patients.js')).toBe(false);
    });
});

const records = (entities: Array<{ key: string; ar?: string; en?: string }>, testsRequested: string | null = null): RequestedRecords => ({
    entities: entities.map(e => ({ item: e.ar || e.key, key: e.key, ar: e.ar || '', en: e.en || e.key })),
    unread: [],
    capabilities: [],
    clauses: [],
    testsRequested,
});

describe('routes are harvested from what serves them, never from an HTTP client', () => {
    it('an API-client module registers nothing; an app named «api» does', () => {
        const dir = tree({
            'web/src/services/patients.js': "import api from './api';\nexport const add = data => api.post('/api/patients', data);\nexport const edit = (id, data) => api.put(`/api/patients/${id}`, data);\n",
            'server/server.js': "const express = require('express');\nconst api = express();\napi.get('/api/bookings', (req, res) => res.json([]));\napi.listen(3000);\n",
        });
        const evidence = collectServerEvidence([dir], []);
        expect(evidence.routes.map(r => r.path)).toEqual(['/api/bookings']);
        expect(evidence.routes[0].known).toBe(true);
    });
    it('a FastAPI router joins its prefix to its decorator path', () => {
        const dir = tree({ 'main.py': 'from fastapi import FastAPI, APIRouter\napp = FastAPI()\nrouter = APIRouter(prefix="/books")\n@router.get("/")\ndef books():\n    return []\napp.include_router(router)\n' });
        const evidence = collectServerEvidence([dir], []);
        expect(evidence.routes.map(r => r.path)).toContain('/books/');
    });
    it('a static site\'s page is read for presence — HTML too, public/ when there is no bundler', () => {
        const dir = tree({ 'public/index.html': '<section id="services"><h2>الخدمات</h2></section>', 'public/app.js': 'void 0;' });
        const report = judgeRequestCoverage({ records: records([{ key: 'services', ar: 'الخدمات', en: 'services' }]), evidence: collectServerEvidence([dir], []), backendRequested: false });
        expect(report.missing).toEqual([]);
        expect(report.records[0].present).toBe(true);
    });
});

describe('the probe measures the path each record\'s route registers', () => {
    const servers: http.Server[] = [];
    afterAll(() => Promise.all(servers.map(s => new Promise(r => s.close(r)))));
    const serve = (handler: http.RequestListener) => new Promise<string>(resolve => {
        const s = http.createServer(handler).listen(0, '127.0.0.1', () => { servers.push(s); resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}`); });
    });
    const json = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

    it('a versioned Express API under /api/v1 is served, not refuted by /api/', async () => {
        const base = await serve((req, res) => (/^\/api\/v1\/(patients|appointments)\/?$/.test(String(req.url)) ? json(res, 200, []) : json(res, 404, {})));
        const dir = tree({ 'server.js': "const express = require('express');\nconst app = express();\napp.get('/api/v1/patients', (q, r) => r.json([]));\napp.get('/api/v1/appointments', (q, r) => r.json([]));\n" });
        const evidence = collectServerEvidence([dir], []);
        const recs = records([{ key: 'patients' }, { key: 'appointments' }]);
        const details: Record<string, string[]> = {};
        const probe = await probeServedResources(base, evidence.prefixes, recs.entities.map(r => { const ids = identifiersFor(r); return { key: r.key, ids, paths: probePathsFor(evidence, ids) }; }), { timeoutMs: 2000, details });
        expect(probe).toEqual({ patients: 'served', appointments: 'served' });
        expect(judgeRequestCoverage({ records: recs, evidence, probe, probeDetails: details, backendRequested: true }).missing).toEqual([]);
    });
    it('a FastAPI trailing-slash redirect is followed once', async () => {
        const base = await serve((req, res) => {
            if (req.url === '/books') { res.writeHead(307, { location: '/books/' }); return res.end(); }
            return req.url === '/books/' ? json(res, 200, []) : json(res, 404, {});
        });
        const dir = tree({ 'main.py': 'from fastapi import FastAPI, APIRouter\napp = FastAPI()\nrouter = APIRouter(prefix="/books")\n@router.get("/")\ndef books():\n    return []\n' });
        const evidence = collectServerEvidence([dir], []);
        const ids = identifiersFor({ item: 'books', key: 'books', ar: '', en: 'books' });
        expect(await probeServedResources(base, evidence.prefixes, [{ key: 'books', ids, paths: probePathsFor(evidence, ids) }], { timeoutMs: 2000 })).toEqual({ books: 'served' });
    });
    it('a registered GET that does not answer (unmounted, or a 500) is NOT served — a POST beside it cannot outvote the probe', async () => {
        const base = await serve((req, res) => (req.url === '/api/patients' ? json(res, 500, { error: 'boom' }) : json(res, 404, {})));
        const dir = tree({ 'server.js': "const express = require('express');\nconst app = express();\napp.get('/api/patients', (q, r) => r.json([]));\napp.post('/api/patients', (q, r) => r.json({}));\n" });
        const evidence = collectServerEvidence([dir], []);
        const recs = records([{ key: 'patients' }]);
        const ids = identifiersFor(recs.entities[0]);
        const probe = await probeServedResources(base, evidence.prefixes, [{ key: 'patients', ids, paths: probePathsFor(evidence, ids) }], { timeoutMs: 2000 });
        expect(probe).toEqual({ patients: 'absent' });
        const report = judgeRequestCoverage({ records: recs, evidence, probe, backendRequested: true });
        expect(report.records[0].served).toBe(false);
    });
    it('a write-only route is what a GET probe cannot see: still served', () => {
        const dir = tree({ 'server.js': "const express = require('express');\nconst app = express();\napp.post('/api/visits', (q, r) => r.json({}));\n" });
        const report = judgeRequestCoverage({ records: records([{ key: 'visits' }]), evidence: collectServerEvidence([dir], []), probe: { visits: 'absent' }, backendRequested: true });
        expect(report.records[0].served).toBe(true);
    });
    it('a permissive catch-all prefix proves nothing either way', async () => {
        const base = await serve((req, res) => json(res, 200, []));
        const dir = tree({ 'server.js': "const express = require('express');\nconst app = express();\napp.get('/api/:resource', (q, r) => r.json([]));\n" });
        const evidence = collectServerEvidence([dir], []);
        const probe = await probeServedResources(base, evidence.prefixes, [{ key: 'patients', ids: ['patients'], paths: probePathsFor(evidence, ['patients']) }], { timeoutMs: 2000 });
        expect(probe.patients).toBe('inconclusive');
    });
});

describe('«tested» means his tests ran and passed', () => {
    const evidence = (testText: string) => ({ routes: [{ path: '/api/students', method: 'get', file: '/s/server.js', dynamic: false, known: true }], prefixes: ['/api/'], serverFiles: ['/s/server.js'], testFiles: ['/s/tests/a.test.js'], sourceText: '', testText, labelKeys: {} });
    const recs = records([{ key: 'students' }], 'automated tests for every endpoint');

    it('a skipped test is not evidence, and the route path is required', () => {
        expect(liveTestText("test.skip('students', () => { get('/api/students'); });")).not.toMatch(/students/);
        const skipped = judgeRequestCoverage({ records: recs, evidence: evidence("test.skip('students', () => {});"), probe: { students: 'served' }, backendRequested: true, testsRun: { root: '/s', ran: true, passed: true } });
        expect(skipped.records[0].tested).toBe(false);
    });
    it('a mention in a test that never ran is not tested; a passing run of a test that hits the route is', () => {
        const text = "test('lists', async () => { await request(app).get('/api/students').expect(200); });";
        expect(judgeRequestCoverage({ records: recs, evidence: evidence(text), probe: { students: 'served' }, backendRequested: true, testsRun: { root: '/s', ran: true, passed: false } }).records[0].tested).toBe(false);
        expect(judgeRequestCoverage({ records: recs, evidence: evidence(text), probe: { students: 'served' }, backendRequested: true, testsRun: { root: '/s', ran: true, passed: true } }).records[0].tested).toBe(true);
    });
    it('runRequestedTests runs the project\'s own runner, and refuses a placeholder script', async () => {
        const calls: any[] = [];
        const exec = async (tool: string, input: any) => { calls.push([tool, input]); return tool === 'quality_run' ? { ok: true, output: { results: [{ task: 'test', ok: true, skipped: false }] } } : { ok: true }; };
        const node = tree({ 'package.json': JSON.stringify({ scripts: { test: 'node --test tests/' } }) });
        expect(await runRequestedTests(node, exec)).toMatchObject({ ran: true, passed: true, runner: 'npm test' });
        const placeholder = tree({ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) });
        expect(await runRequestedTests(placeholder, exec)).toMatchObject({ ran: false, passed: false });
        const py = tree({ 'app.py': 'x = 1\n', 'tests.py': 'import unittest\n' });
        expect(await runRequestedTests(py, exec)).toMatchObject({ ran: true, passed: true, runner: 'python -m unittest discover -v' });
        const unknown = tree({ 'main.rb': 'puts 1' });
        expect(await runRequestedTests(unknown, exec)).toMatchObject({ ran: false, noRunner: true });
        expect(calls.map(c => c[0])).toEqual(['quality_run', 'shell_execute']);
    });
});

describe('what cannot be measured is said as such', () => {
    it('a transliterated-only record is «not measured», never «not served»', () => {
        const dir = tree({ 'server.js': "const express = require('express');\nconst app = express();\napp.get('/api/rakhams', (q, r) => r.json([]));\n" });
        const report = judgeRequestCoverage({ records: records([{ key: 'mrabws', ar: 'المرابع', en: 'المرابع' }]), evidence: collectServerEvidence([dir], []), probe: { mrabws: 'absent' }, backendRequested: true });
        expect(report.missing).toEqual([]);
        expect(report.unverified.map(r => r.key)).toEqual(['mrabws']);
    });
    it('capabilities and unverified records keep the delivery «not verified» — and never «partial»', () => {
        const report = judgeRequestCoverage({ records: { ...records([]), capabilities: ['per-user record isolation — «x»'] }, evidence: collectServerEvidence([], []), backendRequested: true });
        const unverified = coverageUnverified(report);
        expect(unverified.join(' ')).toMatch(/per-user record isolation .*not measured/);
        const verdict = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [{ instrument: 'live', ok: true }, { instrument: 'coverage', ok: true, unverified }] });
        expect(verdict.verified).toBe(false);
        expect(verdict.unverified).toEqual(unverified);
        const scopeShape = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [{ instrument: 'live', ok: true }, { instrument: 'scope', ok: false }, { instrument: 'coverage', ok: true, unverified }] });
        expect(scopeShape.partial).toBe(false);
    });
    it('a failed tests run blocks, named by its own instrument', () => {
        const verdict = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [{ instrument: 'live', ok: true }, { instrument: 'tests', ok: false, error: 'the requested tests did not pass' }], required: ['tests'] });
        expect(verdict.verified).toBe(false);
        expect(verdict.firstError).toMatch(/requested tests did not pass/);
    });
});

describe('the repair stays inside the server it repairs', () => {
    const base = (over: Partial<RequestCoverageReport>): RequestCoverageReport => ({
        checked: 1, records: [], missing: [], unread: [], testsRequested: 'automated tests', servedApplies: true,
        serverFile: '', patternResources: [], prefixes: ['/api/'], testFiles: [], ...over,
    });
    const untested = { key: 'patients', ar: 'المرضى', en: 'patients', item: 'المرضى', served: true, tested: false, present: null, evidence: [] };

    it('never targets the interface\'s client module or UI test; a server file elsewhere means no target', () => {
        const root = tree({ 'api/package.json': JSON.stringify({ scripts: { start: 'node server.js' } }), 'api/server.js': '' });
        const notServed = { ...untested, served: false };
        expect(requestCoverageRepairTask(base({ missing: [notServed], serverFile: path.join(root, 'web/src/services/patients.js'), serverFiles: [path.join(root, 'web/src/services/patients.js')] }),
            { request: 'r', serverRoot: path.join(root, 'api'), testFiles: [] })).toBeNull();
        const task = requestCoverageRepairTask(base({ missing: [untested] }), { request: 'r', serverRoot: path.join(root, 'api'), testFiles: [path.join(root, 'web/src/__tests__/App.test.jsx')] });
        expect(task?.repairFile).toBe(path.join(root, 'api', 'tests', 'requested-records.test.js'));
        expect(task?.manifestPatch).toEqual({ file: path.join(root, 'api', 'package.json'), script: 'node --test tests/' });
    });
    it('a Python server gets a Python test, run by its own runner — never a .js file', () => {
        const root = tree({ 'requirements.txt': 'flask\n', 'app.py': '' });
        const task = requestCoverageRepairTask(base({ missing: [untested], serverFile: path.join(root, 'app.py'), serverFiles: [path.join(root, 'app.py')] }), { request: 'r', serverRoot: root, testFiles: [] });
        expect(task?.repairFile).toBe(path.join(root, 'tests', 'test_requested_records.py'));
        expect(task?.manifestPatch).toBeUndefined();
    });
    it('the manifest patch adds the test script and hands back the bytes for a restore', () => {
        const root = tree({ 'package.json': '{\r\n  "scripts": {\r\n    "start": "node server.js"\r\n  }\r\n}\r\n' });
        const before = applyTestScriptPatch({ file: path.join(root, 'package.json'), script: 'node --test tests/' });
        expect(String(before)).toContain('"start"');
        const after = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
        expect(JSON.parse(after).scripts).toEqual({ start: 'node server.js', test: 'node --test tests/' });
        expect(after).toContain('\r\n');
    });
});

describe('the pipeline measures the tests it was asked for', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
    const body = src.slice(src.indexOf('const measureRequestedRecords = async'), src.indexOf('const recordLiveAcceptance = async'));
    it('reads the declared backend, probes exact paths, runs and requires the tests, and records what it could not measure', () => {
        expect(body).toContain('const backendRequested = backendRequestedFor(productRequest);');
        expect(body).toContain('paths: probePathsFor(evidence, ids)');
        expect(body).toMatch(/testsRun = await runRequestedTests\(testsRoot,/);
        expect(body).toMatch(/deliveryRequired = Array\.from\(new Set<DeliveryInstrument>\(\[\.\.\.deliveryRequired, 'tests'\]\)\);/);
        expect(body).toMatch(/instrument: 'tests',/);
        expect(body).toMatch(/judgeRequestCoverage\(\{ records, evidence, probe, probeDetails, backendRequested, testsRun \}\)/);
        expect(body).toMatch(/unread: requestCoverage\.unread,\s+unverified,/);
    });
});
