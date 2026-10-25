import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { spawnSync } from 'child_process';
import { AddressInfo } from 'net';
import {
    inspectProjectQualityContract,
    projectAuditDirectory,
    servedInterfaceDirectory,
    servesHtmlAtRoot,
} from '../modules/tools/definitions/ProjectPipelineTool';
import { deliveryVerdict } from '../core/quality/delivery-verdict';
import {
    deliveredTreeHasInterface,
    hasSearchEvidence,
    hasServiceFilterEvidence,
    hasServiceSearchEvidence,
    scopeReport,
} from '../core/quality/scope-audit';
import { ApiProjectTool, apiTestResources } from '../modules/tools/definitions/ApiProjectTool';

/**
 * Round 20 — the adversarial review of the round-19 delivery verdict.
 *
 * With one verdict that no later instrument can clear, every gate has to ask
 * of a delivery exactly what the request asked — no more (a build script from
 * a plain Node API, a test script from «Build …») and no less (a placeholder
 * «exit 0» test proving a program, a «tool» with buttons judged as a CLI, an
 * unused query parameter proving search).
 */
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r20-delivery-'));
    roots.push(dir);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), body);
    }
    return dir;
}
const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: 'p', scripts });

const P051 = 'Build an admin dashboard for a dental clinic to manage patients, appointments, treatments: add, edit, delete and search each one, with a summary page showing totals and a chart.';
const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P102 = 'Create a REST API with Node.js and Express for a private school with endpoints for students, classes, grades, input validation, proper error codes, and automated tests for every endpoint.';
const LIBRARY = 'Build a REST API with Node and Express for a library with endpoints for books and members.';

describe('one quality contract for every root, the primary one included (findings 8, 25)', () => {
    it('an English «Build …» app without a test script is not asked for one', () => {
        const react = tree({ 'package.json': pkg({ dev: 'vite', build: 'vite build', preview: 'vite preview' }), 'vite.config.js': 'export default {}' });
        expect(inspectProjectQualityContract(react, P051)).toEqual({ ok: true, failures: [] });
    });
    it('an API-only root with no build step is never asked for a build script', () => {
        const api = tree({ 'package.json': pkg({ start: 'node server.js', dev: 'node --watch server.js' }), 'server.js': '' });
        expect(inspectProjectQualityContract(api, LIBRARY)).toEqual({ ok: true, failures: [] });
        const p102 = inspectProjectQualityContract(api, P102);
        expect(p102.failures.join(' ')).toMatch(/test script/);
        expect(p102.failures.join(' ')).not.toMatch(/build script/);
        expect(inspectProjectQualityContract(api, P101).failures.join(' ')).not.toMatch(/build script/);
        const tested = tree({ 'package.json': pkg({ start: 'node server.js', test: 'node --test' }), 'server.js': '' });
        expect(inspectProjectQualityContract(tested, P101)).toEqual({ ok: true, failures: [] });
        expect(inspectProjectQualityContract(tested, P102)).toEqual({ ok: true, failures: [] });
    });
    it('a build step or a named build command still needs a build script; placeholders are refused everywhere', () => {
        const vite = tree({ 'package.json': pkg({ dev: 'vite' }), 'vite.config.ts': 'export default {}' });
        expect(inspectProjectQualityContract(vite, 'Make a dashboard').failures.join(' ')).toMatch(/build script/);
        const plain = tree({ 'package.json': pkg({ start: 'node s.js' }) });
        expect(inspectProjectQualityContract(plain, 'Make it, then run npm run build').failures.join(' ')).toMatch(/build script/);
        for (const placeholder of ['exit 0', 'true', 'echo "no tests"']) {
            const fake = tree({ 'package.json': pkg({ start: 'node s.js', test: placeholder }) });
            expect(inspectProjectQualityContract(fake, 'Write a command-line tool').ok).toBe(false);
        }
    });
});

describe('a program is proven by its tests AND by the same contract (finding 1, parts 2–3)', () => {
    it('a program whose manifest fails the contract is not verified, and an unmeasured contract is not verified either', () => {
        const base = { phaseVerified: true, requestFidelityBlocked: false, primary: 'program' as const, required: ['quality' as const] };
        expect(deliveryVerdict({ ...base, measurements: [{ instrument: 'program', ok: true }, { instrument: 'quality', ok: false, error: 'test script is a placeholder: exit 0' }] }).verified).toBe(false);
        expect(deliveryVerdict({ ...base, measurements: [{ instrument: 'program', ok: true }] }).verified).toBe(false);
        expect(deliveryVerdict({ ...base, measurements: [{ instrument: 'program', ok: true }, { instrument: 'quality', ok: true }] }).verified).toBe(true);
    });
    it('the wiring: a program that serves a page takes the live path; the program proof records the contract first and requires it', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(src).toMatch(/const programOnly = deliveryRoles\.program && !deliveryRoles\.interface && !deliveryRoles\.service && !programServesAPage;/);
        expect(src).toMatch(/let deliveryRequired: DeliveryInstrument\[\] = programOnly \? \['quality'\] : \[\];/);
        const proof = src.slice(src.indexOf('const recordProgramProof = async'), src.indexOf("executeTool('quality_run', { path: programRoot"));
        expect(proof).toContain('inspectProjectQualityContract(programRoot, productRequest)');
        expect(proof).toContain("instrument: 'quality'");
    });
    it('a «tool» build that produced a page serves an interface', () => {
        expect(servedInterfaceDirectory(tree({ 'index.html': '<div id="root"></div>', 'package.json': pkg({ test: 'node --test' }) }))).not.toBe('');
        expect(servedInterfaceDirectory(tree({ 'main.py': 'print(1)', 'test_main.py': '' }))).toBe('');
    });
});

describe('an interface is delivered when one is served (finding 10)', () => {
    it('the P001 tree — src/index.html, no bundler — is a served interface, audited in src/', () => {
        const p001 = tree({
            'package.json': JSON.stringify({ name: 'clinic', type: 'module', scripts: { dev: 'node src/index.js' } }),
            'src/index.html': '<!doctype html><html dir="rtl"><head><link rel="stylesheet" href="styles.css"></head><body><h1>عيادة</h1></body></html>',
            'src/styles.css': 'h1{}',
        });
        expect(servedInterfaceDirectory(p001)).toBe(path.join(p001, 'src'));
        expect(projectAuditDirectory([p001])).toBe(path.join(p001, 'src'));
        // A root index.html still wins, as before.
        const vite = tree({ 'index.html': '<div id="root"></div>', 'src/index.html': 'x' });
        expect(projectAuditDirectory([vite])).toBe(vite);
    });
    it('a framework with no index.html on disk is judged by the page its live address serves — loopback only', async () => {
        const serve = (type: string) => new Promise<{ url: string; close: () => void }>(resolve => {
            const s = http.createServer((_q, r) => { r.writeHead(200, { 'Content-Type': type }); r.end(type.includes('html') ? '<html></html>' : '{}'); })
                .listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(s.address() as AddressInfo).port}/`, close: () => s.close() }));
        });
        const page = await serve('text/html; charset=utf-8');
        const json = await serve('application/json');
        try {
            expect(await servesHtmlAtRoot(page.url)).toBe(true);
            expect(await servesHtmlAtRoot(json.url)).toBe(false);
            expect(await servesHtmlAtRoot('')).toBe(false);
            expect(await servesHtmlAtRoot('http://example.com/')).toBe(false);
        } finally {
            page.close();
            json.close();
        }
    });
    it('the wiring: the pipeline asks servedInterfaceDirectory, the static-site kind and the live page', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(src).toMatch(/const interfaceDelivered = interfaceRoots\.some\(root => !!servedInterfaceDirectory\(root\)\)\s*\|\| String\(liveRunResult\?\.output\?\.kind \|\| ''\) === 'static-site'\s*\|\| await servesHtmlAtRoot\(verifiedLiveUrl\(ledger\.all\(\)\)\);/);
    });
});

describe('a service proves search only inside one route handler, and only when nothing else is delivered (finding 29)', () => {
    const loggedNotUsed = "app.get('/api/products',(req,res)=>{console.log(req.query.q);res.json(products)});\napp.delete('/api/products/:id',(req,res)=>{products=products.filter(p=>p.id!==req.params.id);res.json({ok:true})});";
    it('an unused query parameter beside a .filter in another handler proves nothing', () => {
        expect(hasServiceSearchEvidence(loggedNotUsed)).toBe(false);
        expect(hasServiceFilterEvidence("app.get('/api/p',(req,res)=>{ const { q, category } = req.query; res.json(products)});\napp.delete('/api/p/:id',(req,res)=>{products=products.filter(p=>p.id!==1)});")).toBe(false);
    });
    it('a handler that narrows its rows with the parameter is search — Express, a named handler, SQL, Flask, FastAPI, and api_project\'s own', () => {
        expect(hasServiceSearchEvidence("app.get('/api/items', (req, res) => { const q = req.query.q; res.json(rows.filter(r => r.name.includes(q))); });")).toBe(true);
        expect(hasServiceSearchEvidence("function list(req, res) { const q = req.query.q; res.json(rows.filter(r => r.name.includes(q))); }\napp.get('/api/items', list);")).toBe(true);
        expect(hasServiceSearchEvidence("app.get('/api/books', (req, res) => { const { search } = req.query; res.json(db.prepare('SELECT * FROM books WHERE title LIKE ?').all(`%${search}%`)); });")).toBe(true);
        expect(hasServiceSearchEvidence("@app.route('/api/books')\ndef books():\n    q = request.args.get('q', '')\n    return jsonify([b for b in BOOKS if q.lower() in b['title'].lower()])\n")).toBe(true);
        expect(hasServiceSearchEvidence("@router.get('/books')\nasync def list_books(q: str | None = None):\n    return [b for b in books if q is None or q in b.title]\n")).toBe(true);
        expect(hasServiceSearchEvidence("app.get('/api/' + key, optionalAuth, (req, res) => {\n  let rows = t.list(scopeOf(req));\n  const query = String((req.query || {}).q || '').trim().toLowerCase();\n  if (query) rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query)));\n  res.json({ ok: true, [key]: rows });\n});")).toBe(true);
    });
    it('with an interface delivered, the interface must offer search; an API-only tree is judged by its handlers', () => {
        const realSearch = "app.get('/api/products', (req, res) => { const q = req.query.q; res.json(products.filter(p => p.name.includes(q))); });\napp.listen(3000);";
        const store = 'Build an online store for a bakery: product listing with images and prices, search and category filter.';
        const fullStack = tree({ 'server.js': realSearch, 'src/App.jsx': 'export default function App(){ return <ul>{products.map(p => <li>{p.name}</li>)}</ul>; }' });
        expect(deliveredTreeHasInterface([fullStack])).toBe(true);
        expect(scopeReport(store, [fullStack]).missing.map(c => c.id)).toContain('search');
        const apiOnly = tree({ 'server.js': realSearch, 'package.json': pkg({ start: 'node server.js' }) });
        expect(deliveredTreeHasInterface([apiOnly])).toBe(false);
        expect(scopeReport(store, [apiOnly]).missing.map(c => c.id)).not.toContain('search');
        const fakeApi = tree({ 'server.js': loggedNotUsed, 'package.json': pkg({ start: 'node server.js' }) });
        expect(scopeReport(store, [fakeApi]).missing.map(c => c.id)).toContain('search');
        expect(hasSearchEvidence(realSearch)).toBe(false);
        expect(hasSearchEvidence(realSearch, { serviceOnly: true })).toBe(true);
    });
});

describe('api_project writes real endpoint tests when the request asks for tests (finding 24, part 1)', () => {
    it('the refused body comes from the schema itself', () => {
        expect(apiTestResources({ key: 'patients', columns: [{ key: 'name', type: 'TEXT', required: true }] }, [])).toEqual([{ key: 'patients', invalid: {} }]);
        expect(apiTestResources({ key: 'items', columns: [{ key: 'price', type: 'REAL' }] }, [])[0].invalid).toEqual({ price: 'not-a-number' });
        expect(apiTestResources(null, [{ key: 'visits', fields: [{ key: 'note', type: 'TEXT' }] }])[0].invalid).toEqual({ note: 'x'.repeat(501) });
        expect(apiTestResources(null, [{ key: 'visits', fields: [{ key: 'n', type: 'REAL' }], belongsTo: { entity: 'pets', key: 'pet_id' } }])[0].invalid).toEqual({ pet_id: 999999999 });
        expect(apiTestResources(null, [{ key: 'scores', fields: [{ key: 'v', type: 'REAL' }] }])[0].invalid).toBeNull();
    });

    describe('P101 end to end: the tests run and pass under node --test', () => {
        let tmp: string;
        const savedSchema = process.env.JOE_AI_SCHEMA;
        beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r20-api-tests-')); process.env.JOE_AI_SCHEMA = '0'; });
        afterAll(() => {
            if (savedSchema === undefined) delete process.env.JOE_AI_SCHEMA; else process.env.JOE_AI_SCHEMA = savedSchema;
            // Remove the dependency LINK first, never through it.
            for (const link of fs.existsSync(tmp) ? fs.readdirSync(tmp).map(d => path.join(tmp, d, 'node_modules')) : []) {
                try { if (fs.lstatSync(link)) fs.rmSync(link, { recursive: false, force: true }); } catch { /* no link */ }
                try { fs.rmdirSync(link); } catch { /* gone */ }
            }
            fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            delete (global as any).joeProjects?.['r20-api-tests'];
        });
        it('writes tests/api.test.js and «npm test», and the tests pass against the real server', async () => {
            const res: any = await new ApiProjectTool().execute({ request: P101, skipInstall: true, root: tmp }, { sessionId: 'r20-api-tests' });
            expect(res.ok).toBe(true);
            const proj = res.output.path;
            const manifest = JSON.parse(fs.readFileSync(path.join(proj, 'package.json'), 'utf8'));
            expect(manifest.scripts.test).toBe('node --test');
            const testFile = fs.readFileSync(path.join(proj, 'tests', 'api.test.js'), 'utf8');
            expect(testFile).toContain('"key": "patients"');
            expect(testFile).toContain('"key": "appointments"');
            // The generated project's only dependency (express) comes from this repo's install.
            fs.symlinkSync(path.join(process.cwd(), 'node_modules'), path.join(proj, 'node_modules'), 'junction');
            const run = spawnSync(process.execPath, ['--test'], { cwd: proj, encoding: 'utf8', timeout: 240_000, env: { ...process.env, NODE_NO_WARNINGS: '1' } });
            const out = `${run.stdout}\n${run.stderr}`;
            expect({ status: run.status, out: out.slice(-1500) }).toMatchObject({ status: 0 });
            expect(out).toMatch(/(?:#|ℹ) pass [1-9]\d*/u);
            expect(out).toMatch(/(?:#|ℹ) fail 0/u);
            fs.rmdirSync(path.join(proj, 'node_modules'));
        }, 300_000);
        it('a request that does not ask for tests gets no test file and no script', async () => {
            const res: any = await new ApiProjectTool().execute({ request: 'Create a REST API with Node.js and Express for a gym with endpoints for members and trainers.', skipInstall: true, root: tmp }, { sessionId: 'r20-api-tests' });
            expect(res.ok).toBe(true);
            expect(fs.existsSync(path.join(res.output.path, 'tests', 'api.test.js'))).toBe(false);
            expect(JSON.parse(fs.readFileSync(path.join(res.output.path, 'package.json'), 'utf8')).scripts.test).toBeUndefined();
        }, 120_000);
    });
});

import { normaliseListedRequest } from '../core/design/listed-request';
import { namedEntities } from '../core/design/named-entities';
import { missingRequestedServer } from '../modules/tools/definitions/ProjectPipelineTool';

const P080 = 'ابني لوحة تحكم لإدارة مصمم مستقل: إضافة وتعديل وحذف وبحث في الأعمال والعملاء والفواتير، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.';
const P080_EN = 'Build an admin dashboard for a freelance designer to manage portfolio projects, clients, invoices: add, edit, delete and search each one, with a summary page showing totals and a chart.';

describe('builders and the gate read one list: the actions come off before the records are read (coordinator add-on)', () => {
    it('P080: «إضافة وتعديل وحذف وبحث في …» leaves the three records; its English twin loses the action-only clause', () => {
        const ar = normaliseListedRequest(P080);
        expect(ar.region || '').toMatch(/^الأعمال والعملاء والفواتير(?:[،,]|$)/u);
        expect(ar.actionLed).toBe(true);
        expect(namedEntities(ar.text).map(e => e.ar)).toEqual(['الأعمال', 'العملاء', 'الفواتير']);
        // Read raw, «بحث في الأعمال» swallowed its record.
        expect(namedEntities(P080).map(e => e.ar)).not.toContain('الأعمال');
        const en = normaliseListedRequest(P080_EN);
        expect(en.text).not.toMatch(/add, edit, delete and search/);
        expect(namedEntities(en.text).map(e => e.key)).toEqual(namedEntities(P080_EN).map(e => e.key));
    });
    it('a trailing rule is cut off the list and kept as its own sentence', () => {
        const fs151 = normaliseListedRequest('Build a complete full-stack system for a dental clinic: React frontend, Node backend, management of patients, appointments, treatments, and each staff member only sees their own records.');
        expect(fs151.rules.join(' ')).toMatch(/each staff member only sees their own records/);
        expect(fs151.region || '').not.toMatch(/staff member/);
    });

    describe('api_project on P080 builds the record the gate will ask for', () => {
        let tmp: string;
        const savedSchema = process.env.JOE_AI_SCHEMA;
        beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r20-listed-')); process.env.JOE_AI_SCHEMA = '0'; });
        afterAll(() => {
            if (savedSchema === undefined) delete process.env.JOE_AI_SCHEMA; else process.env.JOE_AI_SCHEMA = savedSchema;
            fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            delete (global as any).joeProjects?.['r20-listed'];
        });
        it('«الأعمال» is a table, beside the clients and the invoices', async () => {
            const res: any = await new ApiProjectTool().execute({ request: P080, skipInstall: true, root: tmp }, { sessionId: 'r20-listed' });
            expect(res.ok).toBe(true);
            const state = (global as any).joeProjects['r20-listed'];
            const built = [state.resource, ...(state.model || []).map((e: any) => e.key)];
            expect(built).toEqual(expect.arrayContaining(namedEntities(normaliseListedRequest(P080).text).map(e => e.key)));
        }, 120_000);
    });
});

describe('a request that needs a server is never delivered by a browser-only build (finding 22, part 4)', () => {
    const P251 = 'Build a booking web app for a car rental company where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view.';
    it('a React-only delivery is blocked, naming the claim; a root that registers routes, or a bound api_project part, satisfies it', () => {
        const react = tree({ 'package.json': pkg({ dev: 'vite', build: 'vite build' }), 'index.html': '<div id="root"></div>', 'src/App.jsx': 'export default function App(){ return null; }' });
        const gap = missingRequestedServer(P251, [react], [{ tool: 'react_project' }]);
        expect(gap).toMatch(/the request needs a server \(.+\), but no delivered part registers server routes/);
        const api = tree({ 'package.json': pkg({ start: 'node server.js' }), 'server.js': "import express from 'express';\nconst app = express();\napp.get('/api/bookings', (req, res) => res.json([]));\napp.listen(4100);" });
        expect(missingRequestedServer(P251, [react, api], [{ tool: 'react_project' }])).toBe('');
        expect(missingRequestedServer(P251, [react], [{ tool: 'react_project' }, { tool: 'api_project' }])).toBe('');
        // No server asked for: nothing to measure.
        expect(missingRequestedServer('Make a quiz game about a bakery with 10 questions and a timer.', [react], [])).toBe('');
    });
    it('the failure blocks — it is never a partial delivery — and the pipeline records it at delivery', () => {
        const v = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [{ instrument: 'live', ok: true }, { instrument: 'service', ok: false, error: 'no server' }] });
        expect(v.verified).toBe(false);
        expect(v.partial).toBe(false);
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(src).toMatch(/const serverGap = missingRequestedServer\(productRequest, interfaceRoots, deliveryPartsForRun\(sessionPartsKey, context\?\.runId\)\);\s*if \(serverGap\) \{\s*ledger\.record\(\{ instrument: 'service', ok: false, error: serverGap \}\);/);
    });
});
