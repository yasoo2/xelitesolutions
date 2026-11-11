/**
 * ⛔ A ROUTE BUILT IN A LOOP OVER HIS RECORDS IS READ, NOT MISSED.
 *
 * The 500-prompt exam, 2026-11-04, P157: «Build a complete full-stack system
 * for a real estate agency: … management of properties, viewings, clients, and
 * each staff member only sees their own records.» The builder served all three
 * from one table of resources — `const RESOURCES = { properties, clients,
 * viewings }` and `for (const [name] of Object.entries(RESOURCES)) { const base
 * = `/${name}`; router.get(base, …) }` — mounted at /api behind sign-in. Joe
 * refused it ten times as «properties — العقارات (not served); viewings —
 * المعاينات (not served); customers — العملاء (not served)»:
 *
 *   - the route reader saw `${base}/:id`, a path it could not read, and no
 *     route for any of the three;
 *   - the live probe could not tell either: behind sign-in every path under
 *     /api answers 401, so no parent there proves an absence or a presence;
 *   - and the record he called «clients» was looked for only as `customers`.
 *
 * A route registered in a loop over a table the source names (an object's
 * keys, a list of names, a list of objects' names — in the same file or
 * imported) is read as the routes it registers. His own word for a record is a
 * name it is served under. And a record only a route the reader cannot read
 * could serve, which the live probe cannot settle, is «not measured» — never
 * «not served».
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
import { collectServerEvidence, identifiersFor, requestedRecords } from '../core/quality/request-coverage';

// The delivery run loads the pipeline (its reducers) the first time it is built: a cold transform takes a while.
jest.setTimeout(240_000);

const P157 = 'Build a complete full-stack system for a real estate agency: React frontend, Node backend, user login with roles (admin and staff), management of properties, viewings, clients, and each staff member only sees their own records.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

/** The P157 server's entry: sign-in routes on the app, the resources mounted at /api, a 404 for the rest. */
const INDEX = [
    `import express from 'express';`,
    `import { resourceRouter } from './resources.js';`,
    `const app = express();`,
    `app.use(express.json());`,
    `app.get('/api/health', (req, res) => res.json({ ok: true }));`,
    `app.post('/api/auth/register', (req, res) => res.status(201).json({ token: 't' }));`,
    `app.post('/api/auth/login', (req, res) => res.json({ token: 't' }));`,
    `app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));`,
    `app.use('/api', resourceRouter());`,
    `app.get('/api/users', requireAuth, (req, res) => res.json([]));`,
    `app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));`,
    `app.listen(process.env.PORT || 3000);`,
].join('\n');

/** A router module whose routes are registered in a loop; `table` and `loop` are the parts that vary. */
const routerModule = (table: string, loop: string, imports = '') => [
    `import { Router } from 'express';`,
    imports,
    table,
    `export function resourceRouter() {`,
    `  const router = Router();`,
    `  router.use(requireAuth);`,
    loop,
    `  return router;`,
    `}`,
].join('\n');

/** The P157 builder's own shape, verbatim in structure. */
const P157_RESOURCES = routerModule(
    [
        `const RESOURCES = {`,
        `  properties: { table: 'properties', fields: { name: { t: 'text', req: true }, price: { t: 'number' } } },`,
        `  clients: { table: 'clients', fields: { name: { t: 'text', req: true }, email: { t: 'text' } } },`,
        `  viewings: { table: 'viewings', fields: { property_id: { t: 'ref', ref: 'properties' }, scheduled_at: { t: 'date' } } },`,
        `};`,
    ].join('\n'),
    [
        `  for (const [name, resource] of Object.entries(RESOURCES)) {`,
        `    const base = \`/\${name}\`;`,
        `    router.get(base, (req, res) => res.json(list(resource, req.user)));`,
        `    router.get(\`\${base}/:id\`, (req, res) => res.json(one(resource, req.user, req.params.id)));`,
        `    router.post(base, (req, res) => res.status(201).json(add(resource, req.body, req.user)));`,
        `    router.put(\`\${base}/:id\`, (req, res) => res.json(update(resource, req.params.id, req.body)));`,
        `    router.delete(\`\${base}/:id\`, (req, res) => res.json({ ok: true }));`,
        `  }`,
    ].join('\n'),
);

/**
 * The live server: like P157's, every path under /api answers 401 without a
 * token — the guard runs before any 404 — so no parent under /api is a control.
 * `served` lists the resources the server really has, for an honest «absent».
 */
async function liveServer(): Promise<{ base: string; asked: string[]; close: () => Promise<void> }> {
    const asked: string[] = [];
    const server = http.createServer((req, res) => {
        asked.push(String(req.url));
        const url = String(req.url || '').split('?')[0];
        if (url.startsWith('/api/') && !url.startsWith('/api/health')) {
            res.writeHead(401, { 'content-type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Sign in first' }));
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

/** Joe's records gate on one built tree (files under server/) and the live server. */
async function measure(request: string, files: Record<string, string>) {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-loop-routes-'));
    roots.push(dir);
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, 'server', name)), { recursive: true });
        fs.writeFileSync(path.join(dir, 'server', name), text);
    }
    const live = await liveServer();
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
            dir,
            report,
            served: Object.fromEntries(report.records.map(r => [r.key, r.served])),
            coverage: ledger.all().find(m => m.instrument === 'coverage'),
            asked: live.asked,
        };
    } finally {
        await live.close();
    }
}

describe('P157: three records served from one table of resources, behind sign-in', () => {
    it('the real-estate system the builder delivered is not refused', async () => {
        const { served, coverage, report } = await measure(P157, { 'index.js': INDEX, 'resources.js': P157_RESOURCES });
        expect(served).toEqual({ properties: true, viewings: true, customers: true });
        //  (The isolation rule he stated is measured apart, through the doors a project declares.)
        expect(String(coverage?.error || '')).not.toMatch(/requested_entities_not_delivered/u);
        //  Read from the source and confirmed on the live server at the mounted path.
        expect(report.records.find(r => r.key === 'properties')?.evidence.join(' | ')).toMatch(/route GET \/properties \(resources\.js\).*GET \/api\/properties answered/u);
    });

    it('the routes the loop registers are read as routes, under the mount', async () => {
        const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-loop-routes-'));
        roots.push(dir);
        fs.writeFileSync(path.join(dir, 'resources.js'), P157_RESOURCES);
        const evidence = await collectServerEvidence([dir], []);
        const read = evidence.routes.filter(r => !r.dynamic).map(r => `${r.method} ${r.path}`);
        expect(read).toEqual(expect.arrayContaining([
            'get /properties', 'get /clients', 'get /viewings',
            'post /properties', 'get /properties/:id', 'delete /viewings/:id',
        ]));
        //  A router's path depends on where it is mounted: it can prove, never refute.
        expect(evidence.routes.filter(r => r.path === '/properties').every(r => r.known === false)).toBe(true);
    });
});

describe('his own word is a name his record is served under', () => {
    it('«clients» is the record the dictionary calls customers, and /clients serves it', () => {
        const records = requestedRecords(P157, { backendRequested: true });
        const customers = records.entities.find(r => r.key === 'customers')!;
        expect(customers.item).toBe('clients');
        expect(identifiersFor(customers, [], records.entities)).toEqual(expect.arrayContaining(['customers', 'clients']));
    });
});

describe('the loops a builder writes over a table', () => {
    const SHAPES: Array<[string, string]> = [
        ['a list of names, forEach', routerModule(
            `const RESOURCES = ['properties', 'viewings', 'clients'];`,
            `  RESOURCES.forEach((name) => {\n    router.get('/' + name, (req, res) => res.json([]));\n    router.post('/' + name, (req, res) => res.json({}));\n  });`)],
        ['a list of objects, for…of on a property', routerModule(
            `const RESOURCES = [\n  { path: 'properties', label: 'Property' },\n  { path: 'viewings', label: 'Viewing' },\n  { path: 'clients', label: 'Client' },\n];`,
            `  for (const r of RESOURCES) {\n    router.get(\`/\${r.path}\`, (req, res) => res.json([]));\n  }`)],
        ['a list of objects, destructured', routerModule(
            `const RESOURCES = [{ name: 'properties' }, { name: 'viewings' }, { name: 'clients' }];`,
            `  for (const { name } of RESOURCES) router.get(\`/\${name}\`, (req, res) => res.json([]));`)],
        ['an object\'s keys, for…in', routerModule(
            `const TABLES = { properties: 'properties', viewings: 'viewings', clients: 'clients' };`,
            `  for (const key in TABLES) {\n    router.get(\`/\${key}\`, (req, res) => res.json([]));\n  }`)],
        ['Object.keys(…).forEach', routerModule(
            `const TABLES = { 'properties': {}, "viewings": {}, clients: {} };`,
            `  Object.keys(TABLES).forEach(table => router.get(\`/\${table}\`, (req, res) => res.json([])));`)],
        ['a list written in the loop', routerModule(
            ``,
            `  for (const name of ['properties', 'viewings', 'clients']) {\n    const path = '/' + name;\n    router.get(path, (req, res) => res.json([]));\n  }`)],
    ];

    it.each(SHAPES)('%s', async (_shape, resources) => {
        const { served, coverage } = await measure(P157, { 'index.js': INDEX, 'resources.js': resources });
        expect(served).toEqual({ properties: true, viewings: true, customers: true });
        expect(String(coverage?.error || '')).not.toMatch(/requested_entities_not_delivered/u);
    });

    it('a table imported from another file of the server', async () => {
        const table = `export const RESOURCES = {\n  properties: { label: 'Property' },\n  viewings: { label: 'Viewing' },\n  clients: { label: 'Client' },\n};`;
        const resources = routerModule(``,
            `  for (const name of Object.keys(RESOURCES)) {\n    router.get(\`/\${name}\`, (req, res) => res.json([]));\n  }`,
            `import { RESOURCES } from './config/resources-table.js';`);
        const { served } = await measure(P157, { 'index.js': INDEX, 'resources.js': resources, 'config/resources-table.js': table });
        expect(served).toEqual({ properties: true, viewings: true, customers: true });
    });
});

describe('what the loop does not register is still not served', () => {
    it('a table without clients serves no clients — and the error names his word', async () => {
        const resources = P157_RESOURCES.replace(/\n  clients: \{[^\n]*\n/u, '\n');
        const { served, coverage } = await measure(P157, { 'index.js': INDEX, 'resources.js': resources });
        expect(served).toEqual({ properties: true, viewings: true, customers: false });
        expect(coverage?.ok).toBe(false);
        expect(String(coverage?.error)).toMatch(/customers — العملاء «clients» \(not served\)/u);
    });

    it('a key of the table is never a route when the loop is not over that table', async () => {
        const resources = routerModule(
            `const RESOURCES = { properties: {}, viewings: {}, clients: {} };\nconst OTHER = ['reports'];`,
            `  for (const name of OTHER) router.get(\`/\${name}\`, (req, res) => res.json([]));\n  router.get('/properties', (req, res) => res.json([]));\n  router.get('/viewings', (req, res) => res.json([]));`);
        const { served } = await measure(P157, { 'index.js': INDEX, 'resources.js': resources });
        expect(served).toEqual({ properties: true, viewings: true, customers: false });
    });
});

describe('a route the reader cannot read, behind a guard the probe cannot pass', () => {
    it('is «not measured», never «not served»', async () => {
        //  The resource names come from the database at start: nothing in the source says them.
        const resources = routerModule(``,
            `  for (const name of loadResourceNames()) {\n    router.get(\`/\${name}\`, (req, res) => res.json([]));\n  }\n  router.get('/properties', (req, res) => res.json([]));`);
        const { served, coverage } = await measure(P157, { 'index.js': INDEX, 'resources.js': resources });
        expect(served).toEqual({ properties: true, viewings: null, customers: null });
        expect(String(coverage?.error || '')).not.toMatch(/not served/u);
        expect(coverage?.unverified).toEqual(expect.arrayContaining([expect.stringMatching(/viewings/u), expect.stringMatching(/customers/u)]));
    });
});
