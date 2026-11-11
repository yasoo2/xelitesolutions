/**
 * ⛔ A HELPER THAT REGISTERS ROUTES IS READ, AND HIS LABEL NAMES ITS OWN TABLE.
 *
 * The 500-prompt exam, 2026-11-04, P158: «ابني نظام متكامل لـصيدلية: … إدارة
 * الأدوية والوصفات والموردين، وكل موظف يرى سجلاته فقط.» The builder served
 * all three — `Object.keys(SCHEMAS).forEach(registerCollection)`, where
 * `function registerCollection(key)` mounts `app.use(`/api/${key}`, router)` —
 * and the client named them in its own table: `prescriptions: { title:
 * 'الوصفات', columns: [{ key: 'patientName', … }] }`. Refused as «wsfats —
 * الوصفات (not served)»:
 *
 *   - the dictionary has no English for «الوصفات», so the record's key is a
 *     transliteration, and the label reader bound his word to the first
 *     `key:` after it — `patientName`, a column inside the table;
 *   - the routes were registered by a helper the loop calls by name, which
 *     the loop reader did not follow;
 *   - so the probe asked for /api/wsfats and /api/patientname, the API's own
 *     404 answered, and a served record was «absent».
 *
 * His label names the table that holds it (the property the label's object
 * sits under, or the object's own key fields — never a nested column); a
 * helper called by name from a loop, or called with the path itself, is read
 * as the routes it registers; and a record whose only name is a
 * transliteration, served under no name the source binds, stays «not
 * measured».
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
import { collectServerEvidence, requestedRecords } from '../core/quality/request-coverage';

jest.setTimeout(240_000);

const P158 = 'ابني نظام متكامل لـصيدلية: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الأدوية والوصفات والموردين، وكل موظف يرى سجلاته فقط.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

/** The P158 server: a table of schemas, a helper that mounts one router per key, called by name from a loop. */
const SERVER = (tables: string[]) => [
    `const express = require('express');`,
    `const app = express();`,
    `app.use(express.json());`,
    `app.post('/api/auth/login', (req, res) => res.json({ token: 't' }));`,
    `app.get('/api/auth/me', auth, (req, res) => res.json(req.user));`,
    `app.get('/api/users', auth, adminOnly, (req, res) => res.json([]));`,
    `const SCHEMAS = {`,
    ...tables.map(t => `  ${t}: { label: '${t}', fields: { name: { label: 'الاسم', type: 'string', required: true } } },`),
    `};`,
    `// سجلات الأدوية والوصفات والموردين`,
    `function registerCollection(key) {`,
    `  const schema = SCHEMAS[key];`,
    `  const router = express.Router();`,
    `  router.use(auth);`,
    `  router.get('/', (req, res) => res.json(db[key]));`,
    `  router.post('/', (req, res) => res.status(201).json(add(key, req.body)));`,
    `  router.get('/:id', (req, res) => res.json(one(key, req.params.id)));`,
    `  router.delete('/:id', (req, res) => res.json({ ok: true }));`,
    `  app.use(\`/api/\${key}\`, router);`,
    `}`,
    `Object.keys(SCHEMAS).forEach(registerCollection);`,
    `app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));`,
    `app.listen(process.env.PORT || 3000);`,
].join('\n');

/** The P158 client's own table: each collection under its key, his word as its title, its columns nested. */
const CLIENT = [
    `export const COLLECTIONS = {`,
    `  medicines: { title: 'الأدوية', singular: 'دواء', columns: [{ key: 'name', label: 'الاسم' }, { key: 'genericName', label: 'الاسم العلمي' }] },`,
    `  prescriptions: {`,
    `    title: 'الوصفات',`,
    `    singular: 'وصفة',`,
    `    columns: [`,
    `      { key: 'patientName', label: 'المريض' },`,
    `      { key: 'doctorName', label: 'الطبيب' },`,
    `    ],`,
    `  },`,
    `  suppliers: { title: 'الموردون', columns: [{ key: 'name', label: 'الاسم' }] },`,
    `};`,
].join('\n');

/** The live server: a mounted collection answers 401 without a token (its router signs in first); the rest of /api is the API's 404. */
async function liveServer(tables: string[]): Promise<{ base: string; asked: string[]; close: () => Promise<void> }> {
    const asked: string[] = [];
    const server = http.createServer((req, res) => {
        asked.push(String(req.url));
        const segments = String(req.url || '').split('?')[0].split('/').filter(Boolean);
        if (segments[0] === 'api') {
            const mounted = tables.includes(segments[1] || '');
            res.writeHead(mounted ? 401 : 404, { 'content-type': 'application/json' });
            return res.end(JSON.stringify(mounted ? { error: 'سجّل الدخول' } : { error: 'المسار غير موجود' }));
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><div id="root"></div>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
    return {
        base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
        asked,
        close: () => new Promise<void>(resolve => server.close(() => resolve())),
    };
}

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-helper-routes-'));
    roots.push(dir);
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

async function measure(request: string, files: Record<string, string>, served: string[]) {
    const dir = tree(files);
    const live = await liveServer(served);
    try {
        const ledger = new DeliveryLedger();
        const delivery = deliveryRun({
            productRequest: request,
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
            report,
            served: Object.fromEntries(report.records.map(r => [r.ar, r.served])),
            coverage: ledger.all().find(m => m.instrument === 'coverage'),
            asked: live.asked,
        };
    } finally {
        await live.close();
    }
}

const ALL = ['medicines', 'prescriptions', 'suppliers'];

describe('P158: a pharmacy whose collections a helper mounts, named in the client\'s own table', () => {
    it('is not refused for «الوصفات»', async () => {
        const { served, coverage, report } = await measure(P158, { 'server/index.js': SERVER(ALL), 'client/src/schemas.js': CLIENT }, ALL);
        expect(served).toEqual({ 'الأدوية': true, 'الوصفات': true, 'الموردون': true });
        expect(String(coverage?.error || '')).not.toMatch(/requested_entities_not_delivered/u);
        expect(report.records.find(r => r.ar === 'الوصفات')?.evidence.join(' | ')).toMatch(/\/api\/prescriptions/u);
    });

    it('his word names the table it titles, never a column inside it', async () => {
        const dir = tree({ 'client/src/schemas.js': CLIENT });
        const records = requestedRecords(P158, { backendRequested: true }).entities;
        const evidence = await collectServerEvidence([dir], records);
        const prescriptions = records.find(r => r.ar === 'الوصفات')!;
        expect(evidence.labelKeys[prescriptions.key]).toEqual(['prescriptions']);
    });

    it('the helper\'s routes are read: a mount per key of the table', async () => {
        const dir = tree({ 'server/index.js': SERVER(ALL) });
        const evidence = await collectServerEvidence([dir], []);
        expect(evidence.routes.filter(r => !r.dynamic).map(r => `${r.method} ${r.path}`))
            .toEqual(expect.arrayContaining(['use /api/medicines', 'use /api/prescriptions', 'use /api/suppliers']));
        expect(evidence.routes.filter(r => r.dynamic)).toEqual([]);
    });
});

describe('a helper called with the path itself', () => {
    const CRUD = [
        `const express = require('express');`,
        `const app = express();`,
        `function crud(route, coll) {`,
        `  app.get(route, auth, (req, res) => res.json(db[coll]));`,
        `  app.get(\`\${route}/:id\`, auth, (req, res) => res.json(one(coll, req.params.id)));`,
        `  app.post(route, auth, (req, res) => res.status(201).json(add(coll, req.body)));`,
        `}`,
        `crud('/api/medicines', 'medicines');`,
        `crud('/api/prescriptions', 'prescriptions');`,
    ].join('\n');

    it('is read as the routes each call registers', async () => {
        const evidence = await collectServerEvidence([tree({ 'server/index.js': CRUD })], []);
        expect(evidence.routes.filter(r => !r.dynamic).map(r => `${r.method} ${r.path}`)).toEqual(expect.arrayContaining([
            'get /api/medicines', 'get /api/medicines/:id', 'post /api/prescriptions', 'get /api/prescriptions/:id',
        ]));
        //  On an application object: the path as written is the served path.
        expect(evidence.routes.find(r => r.path === '/api/prescriptions')?.known).toBe(true);
    });

    it('…but a helper also called with a path the source does not say keeps its route unread', async () => {
        const evidence = await collectServerEvidence([tree({ 'server/index.js': `${CRUD}\ncrud(pathFor('suppliers'), 'suppliers');` })], []);
        expect(evidence.routes.some(r => r.dynamic)).toBe(true);
    });
});

describe('what is not served stays measured honestly', () => {
    it('a pharmacy without prescriptions: «الأدوية» and «الموردون» served, «الوصفات» refused or not measured — never served', async () => {
        const tables = ['medicines', 'suppliers'];
        const client = CLIENT.replace(/  prescriptions: \{[\s\S]*?\n  \},\n/u, '');
        const { served } = await measure(P158, { 'server/index.js': SERVER(tables), 'client/src/schemas.js': client }, tables);
        expect(served['الأدوية']).toBe(true);
        expect(served['الموردون']).toBe(true);
        //  His word has no English the source binds: Joe cannot name it, so it cannot say it is absent.
        expect(served['الوصفات']).toBeNull();
    });

    it('a table that titles his word but is served nowhere is «not served»', async () => {
        const tables = ['medicines', 'suppliers'];
        const { served, coverage } = await measure(P158, { 'server/index.js': SERVER(tables), 'client/src/schemas.js': CLIENT }, tables);
        expect(served['الوصفات']).toBe(false);
        expect(String(coverage?.error)).toMatch(/الوصفات \(not served\)/u);
    });
});
