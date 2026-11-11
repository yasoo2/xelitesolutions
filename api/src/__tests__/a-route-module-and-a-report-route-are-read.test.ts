/**
 * ⛔ A ROUTE MODULE'S ROUTER IS A ROUTER, AND A REPORT IS SERVED AT ITS OWN PATH.
 *
 * The hard exam, 2026-11-04, the re-runs of H01 and H02:
 *
 *   - H01, a clinic: every route module was `module.exports = function
 *     register(api, deps) { api.get('/patients', (req, res) => …) }`, mounted
 *     with `app.use('/api', api)`. The route reader treats a receiver called
 *     `api` as an HTTP client (an axios instance), so it read no route at all:
 *     «patients, appointments, invoices … (not served)».
 *   - H02, a school: «تقارير للإدارة» was served at /api/reports/summary. The
 *     probe asked for /api/reports, the API's own 404 answered, and the record
 *     was «not served».
 *
 * A call whose handler takes a request (`(req, res) =>`, after any middleware)
 * registers a route, whatever its receiver is called — except in a file that
 * mocks an API in the browser (msw, miragejs). And a route that continues past
 * the record's word with fixed segments is probed at its whole path too.
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

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-route-module-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

/**
 * A live server: the listed paths answer 401 without a token; the rest of /api
 * is the API's own 404 — or, like H01's, every /api path asks for a sign-in
 * first (`authEverywhere`), so no parent there can prove anything.
 */
async function liveServer(served: string[], authEverywhere = false): Promise<{ base: string; close: () => Promise<void> }> {
    const server = http.createServer((req, res) => {
        const p = String(req.url || '').split('?')[0].replace(/\/+$/u, '');
        const hit = served.includes(p) || (authEverywhere && p.startsWith('/api/'));
        res.writeHead(hit ? 401 : 404, { 'content-type': 'application/json' });
        res.end(JSON.stringify(hit ? { error: 'unauthorized' } : { error: 'not_found' }));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, close: () => new Promise<void>(r => server.close(() => r())) };
}

async function measure(request: string, files: Record<string, string>, served: string[], authEverywhere = false) {
    const dir = tree(files);
    const live = await liveServer(served, authEverywhere);
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
        return { report, served: Object.fromEntries(report.records.map(r => [r.key, r.served])) };
    } finally {
        await live.close();
    }
}

/** The H01 shape: an app that mounts one router, and route modules that receive it as `api`. */
const CLINIC = {
    'server/src/app.js': [
        `const express = require('express');`,
        `function createApp(deps) {`,
        `  const app = express();`,
        `  const api = express.Router();`,
        `  for (const register of [require('./routes/patients'), require('./routes/appointments'), require('./routes/invoices')]) register(api, deps);`,
        `  app.use('/api', api);`,
        `  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));`,
        `  return app;`,
        `}`,
        `module.exports = { createApp };`,
    ].join('\n'),
    ...Object.fromEntries(['patients', 'appointments', 'invoices'].map(t => [`server/src/routes/${t}.js`, [
        `module.exports = function register(api, { db, audit }) {`,
        `  api.get('/${t}', requireRole('admin', 'doctor'), (req, res) => res.json(db.all('${t}')));`,
        `  api.post('/${t}', requireRole('admin'), async (req, res) => res.status(201).json(db.add('${t}', req.body)));`,
        `  api.delete('/${t}/:id', requireRole('admin'), function (req, res) { res.json(db.remove('${t}', req.params.id)); });`,
        `};`,
    ].join('\n')])),
};

const H01 = 'Build a complete clinic management system: React frontend, Node backend with SQLite, logins with three roles (admin, doctor, receptionist) and different permissions for each, patients, appointments with no double-booking and per-doctor working hours, invoices with payment status, a monthly revenue report with a chart, an audit log of every change, search and filters, an Arabic/English language switch, and automated API tests.';

describe('H01: route modules that receive the router as `api`', () => {
    it('their routes are read', async () => {
        const evidence = await collectServerEvidence([tree(CLINIC)], []);
        expect(evidence.routes.map(r => `${r.method} ${r.path}`)).toEqual(expect.arrayContaining(['get /patients', 'post /appointments', 'delete /invoices/:id']));
    });

    it('the clinic\'s records are served, found at the mounted path', async () => {
        const { served } = await measure(H01, CLINIC, ['/api/patients', '/api/appointments', '/api/invoices'], true);
        expect(served).toMatchObject({ patients: true, appointments: true, invoices: true });
    });
});

describe('a client or a browser mock is still no server', () => {
    it.each([
        ['an axios instance called api', `import axios from 'axios';\nconst api = axios.create({ baseURL: '/api' });\nexport const load = () => api.get('/patients', { params: { q } }).then(r => r.data);\n`],
        ['an API call with a callback that is not a handler', `const api = makeClient();\napi.get('/patients', (err, data) => render(data));\n`],
        ['msw handlers', `import { rest } from 'msw';\nexport const handlers = [rest.get('/api/patients', (req, res, ctx) => res(ctx.json([])))];\n`],
    ])('%s', async (_name, source) => {
        const evidence = await collectServerEvidence([tree({ 'src/api.js': source })], []);
        expect(evidence.routes).toEqual([]);
    });
});

describe('H02: a report served at its own path', () => {
    const SCHOOL = { 'server/app.js': `const express = require('express');\nconst app = express();\napp.get('/api/students', (req, res) => res.json([]));\napp.get('/api/reports/summary', requireAdmin, (_req, res) => res.json({}));\napp.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));\napp.listen(3000);\n` };
    const H02 = 'ابني نظام إدارة مدرسة متكامل: طلاب ومعلمون وصفوف، جدول حصص بلا تعارض، حضور يومي، علامات وشهادات قابلة للطباعة، بوابة لولي الأمر يرى أبناءه فقط، تقارير للإدارة، واختبارات آلية للخادم.';

    it('«تقارير للإدارة» at /api/reports/summary is served', async () => {
        const { report } = await measure(H02, SCHOOL, ['/api/students', '/api/reports/summary']);
        const reports = report.records.find(r => r.key === 'reports');
        expect(reports?.served).toBe(true);
        expect(reports?.evidence.join(' | ')).toMatch(/GET \/api\/reports\/summary answered/u);
    });

    it('…and a report route that does not answer is still not served', async () => {
        const { report } = await measure(H02, SCHOOL, ['/api/students']);
        expect(report.records.find(r => r.key === 'reports')?.served).toBe(false);
    });
});
