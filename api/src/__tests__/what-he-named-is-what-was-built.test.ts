import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import {
    collectServerEvidence,
    coverageError,
    identifiersFor,
    judgeRequestCoverage,
    probeServedResources,
    requestedRecords,
    testsRequestedIn,
} from '../core/quality/request-coverage';
import { buildPipelineDecisionEvidence, inspectProjectQualityContract } from '../modules/tools/definitions/ProjectPipelineTool';
import { deliveryVerdict } from '../core/quality/delivery-verdict';

/**
 * Eval round 15 (P101): a stock bookings API was delivered for «… نقاط وصول
 * لـالمرضى والمواعيد والعلاجات، مع … اختبارات آلية لكل نقطة» and Joe called it
 * complete — no gate read the records the request named. These tests are
 * Joe's own delivery check, with the review's counterexamples.
 */
const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P151 = 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.';
const LANDING = 'Build a professional landing website for a dental clinic with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu.';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-coverage-'));
    roots.push(dir);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), body);
    }
    return dir;
}

describe('the records he named, and every item that could not be read', () => {
    it('P101: patients, appointments and treatments, with tests asked for', () => {
        const r = requestedRecords(P101, { backendRequested: true });
        expect(r.entities.map(e => e.key)).toEqual(expect.arrayContaining(['patients', 'appointments']));
        expect(r.entities.some(e => e.ar.includes('العلاجات'))).toBe(true);
        expect(r.entities).toHaveLength(3);
        expect(r.unread).toEqual([]);
        expect(r.testsRequested).toMatch(/اختبارات آلية/);
    });
    it('an item the readers decline is reported unread, not dropped', () => {
        const r = requestedRecords('Create a REST API with endpoints for users, roles, permissions and audit logs.', { backendRequested: true });
        expect(r.entities.map(e => e.key)).toContain('users');
        expect(r.unread).toEqual(expect.arrayContaining(['roles', 'permissions', 'audit logs']));
    });
    it('tests asked for in their own sentence are read', () => {
        expect(testsRequestedIn('Build a Flask API for a library with books and members. Write unit tests for every endpoint.')).toMatch(/unit tests/);
        expect(testsRequestedIn('Build a booking page and test it in the browser.')).toBeNull();
    });
    it('a landing page\'s sections are not records', () => {
        // Round 20: the reading also names stated rules and behaviour clauses — none here.
        expect(requestedRecords(LANDING, { backendRequested: false })).toEqual({ entities: [], unread: [], capabilities: [], clauses: [], testsRequested: null });
    });
});

describe('evidence comes from routes with handlers, never from test calls or client calls', () => {
    it('harvests registrations and label-bound keys; skips supertest and axios calls', () => {
        const dir = tree({
            'server.js': "const app = require('express')();\napp.get('/api/patients', (req, res) => res.json([]));\nrouter.post('/appointments', handler);\napp.use('/api/alajats', alajatRouter);\n// app.get('/api/commented', h)\n",
            'models.js': "module.exports = [{ key: 'alajats', ar: 'العلاجات', en: 'العلاجات', fields: [] }];\n",
            'client.js': "import React from 'react';\naxios.get('/api/doctors', { params });\n",
            // A server-side HTTP client calls a route; it does not serve one.
            'services/sync.js': "const axios = require('axios');\naxios.get('/api/nurses', config);\n",
            'tests/api.test.js': "request(app).get('/api/treatments').expect(200);\n",
        });
        const records = requestedRecords(P101, { backendRequested: true }).entities;
        const ev = collectServerEvidence([dir], records);
        const paths = ev.routes.map(r => r.path);
        expect(paths).toEqual(expect.arrayContaining(['/api/patients', '/appointments', '/api/alajats']));
        expect(paths).not.toContain('/api/treatments');
        expect(paths).not.toContain('/api/doctors');
        expect(paths).not.toContain('/api/nurses');
        expect(paths).not.toContain('/api/commented');
        expect(ev.testFiles).toHaveLength(1);
        const treat = records.find(e => e.ar.includes('العلاجات'))!;
        expect(ev.labelKeys[treat.key]).toContain('alajats');
        expect(identifiersFor({ item: 'training sessions', key: 'sessions', ar: '', en: 'training sessions' })).toEqual(expect.arrayContaining(['training-sessions', 'training_sessions', 'trainingSessions', 'training-session']));
    });
});

describe('the verdict per record', () => {
    it('P101\'s stock bookings API misses every record, and says so by name', () => {
        const dir = tree({ 'server.js': "app.get('/api/bookings', (q, s) => s.json([]));\napp.post('/api/orders', h);\n" });
        const records = requestedRecords(P101, { backendRequested: true });
        const report = judgeRequestCoverage({ records, evidence: collectServerEvidence([dir], records.entities), backendRequested: true });
        expect(report.missing).toHaveLength(3);
        expect(report.missing.every(r => r.served === false && r.tested === false)).toBe(true);
        const error = coverageError(report);
        expect(error).toMatch(/^requested_entities_not_delivered: patients — المرضى \(not served, untested\)/);
        expect(error).toMatch(/appointments/);
        expect(report.patternResources).toEqual(expect.arrayContaining(['bookings', 'orders']));
        expect(report.serverFile).toMatch(/server\.js$/);
    });
    it('a test that calls a route the server lacks does not make it served (T3b)', () => {
        const dir = tree({ 'server.js': "app.get('/api/patients', h);\n", 'test/api.test.js': "request(app).get('/api/treatments');\n" });
        const records = requestedRecords('Create a REST API with endpoints for patients, treatments.', { backendRequested: true });
        const report = judgeRequestCoverage({ records, evidence: collectServerEvidence([dir], records.entities), backendRequested: true });
        expect(report.records.find(r => r.key === 'treatments')?.served).toBe(false);
        expect(report.records.find(r => r.key === 'patients')?.served).toBe(true);
    });
    it('a probed 404 refutes static text, except a write-only or nested route', () => {
        const dir = tree({ 'routes.js': "router.get('/api/patients', h);\nrouter.post('/api/appointments', h);\nrouter.get('/api/patients/:id/treatments', h);\n" });
        const records = requestedRecords('Create a REST API with endpoints for patients, appointments, treatments.', { backendRequested: true });
        const ev = collectServerEvidence([dir], records.entities);
        const report = judgeRequestCoverage({ records, evidence: ev, backendRequested: true, probe: { patients: 'absent', appointments: 'absent', treatments: 'absent' } });
        expect(report.records.find(r => r.key === 'patients')?.served).toBe(false);
        expect(report.records.find(r => r.key === 'appointments')?.served).toBe(true);
        expect(report.records.find(r => r.key === 'treatments')?.served).toBe(true);
    });
    it('a static build with no backend proves a record by its label in the source', () => {
        const dir = tree({ 'src/App.jsx': "export default function App() { return <h1>{'إدارة المواعيد'}</h1>; }\nconst patients = [];\n" });
        const P051 = 'Build an admin dashboard for a dental clinic to manage patients, appointments, treatments: add, edit, delete and search each one, with a summary page showing totals and a chart.';
        const records = requestedRecords(P051, { backendRequested: false });
        expect(records.entities.map(e => e.key)).toEqual(expect.arrayContaining(['patients', 'appointments', 'treatments']));
        const report = judgeRequestCoverage({ records, evidence: collectServerEvidence([dir], records.entities), backendRequested: false });
        expect(report.servedApplies).toBe(false);
        expect(report.records.find(r => r.key === 'patients')?.present).toBe(true);
        // His Arabic label inside a string literal counts for a static build.
        expect(report.records.find(r => r.key === 'appointments')?.present).toBe(true);
        expect(report.records.find(r => r.key === 'treatments')?.present).toBe(false);
        expect(coverageError(report)).toMatch(/treatments.*\(not built\)/);
    });
});

describe('the runtime probe', () => {
    const servers: http.Server[] = [];
    afterAll(() => Promise.all(servers.map(s => new Promise(r => s.close(r)))));
    const serve = (handler: http.RequestListener) => new Promise<string>(resolve => {
        const s = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}/`));
        servers.push(s);
    });
    const ids = (keys: string[]) => keys.map(key => ({ key, ids: [key] }));

    it('a JSON route or a 401 is served; an SPA fallback page is not; a missing resource is absent', async () => {
        const base = await serve((req, res) => {
            const url = String(req.url);
            if (url === '/api/patients') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('[]'); }
            if (url === '/api/appointments') { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{}'); }
            if (url.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{}'); }
            res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html>');
        });
        expect(await probeServedResources(base, [], ids(['patients', 'appointments', 'treatments']), { timeoutMs: 2500 }))
            .toEqual({ patients: 'served', appointments: 'served', treatments: 'absent' });
    });
    it('a catch-all that answers every path proves nothing', async () => {
        const base = await serve((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('[]'); });
        expect(await probeServedResources(base, [], ids(['patients']), { timeoutMs: 2500 })).toEqual({ patients: 'inconclusive' });
    });
    it('a generic resource router with templated paths is proven by the probe', async () => {
        const dir = tree({ 'server.js': "for (const t of TABLES) app.get(`/api/${t}`, (q, s) => s.json([]));\n" });
        const base = await serve((req, res) => {
            const known = ['/api/patients', '/api/appointments'];
            if (known.includes(String(req.url))) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('[]'); }
            res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}');
        });
        const records = requestedRecords('Create a REST API with endpoints for patients, appointments.', { backendRequested: true });
        const ev = collectServerEvidence([dir], records.entities);
        const probe = await probeServedResources(base, ev.prefixes, records.entities.map(r => ({ key: r.key, ids: identifiersFor(r) })), { timeoutMs: 2500 });
        const report = judgeRequestCoverage({ records, evidence: ev, backendRequested: true, probe });
        expect(report.missing).toEqual([]);
    });
});

describe('missing records block delivery and are named first', () => {
    it('scope missing + a record missing + a live URL → blocked, never partial (T13b)', () => {
        const v = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, required: ['browser'], measurements: [
            { instrument: 'live', ok: true, url: 'http://127.0.0.1:4868/' }, { instrument: 'quality', ok: true },
            { instrument: 'scope', ok: false, error: 'artifact coverage 50% — missing: search' },
            { instrument: 'coverage', ok: false, error: 'requested_entities_not_delivered: patients (not served)' },
        ] });
        expect(v.partial).toBe(false);
        expect(v.coverageFailed).toBe(true);
        const evidence = buildPipelineDecisionEvidence({ finalVerified: false, browserQaFailed: false, scopeCoverageFailed: true, liveUrl: 'http://127.0.0.1:4868/', done: 2, total: 2,
            finalHonestBlocker: true, liveRunError: v.firstError, scopeAudit: { built: 1, requested: 2, missing: ['search'] }, requestCoverageFailed: true, requestCoverageMissing: ['patients'] });
        expect(evidence.honestBlocker).toBe('requested_records_missing: patients');
    });
    it('the pipeline maps missing records to «blocked» and measures them on every live run', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(src).toMatch(/: finalDeliveryVerdict\.coverageFailed \? 'blocked'/);
        expect(src).toMatch(/await measureRequestedRecords\(runRes, deliveredRoots\(auditRoots\)\);/);
        expect((src.match(/await recordLiveAcceptance\(/g) || []).length).toBeGreaterThanOrEqual(3);
    });
});

describe('another delivered part answers only for what the request asks of it', () => {
    it('P151: the API root with start/dev only passes; the React root keeps the primary contract', () => {
        const react = tree({ 'package.json': JSON.stringify({ scripts: { build: 'vite build', test: 'vitest run' } }), 'vite.config.js': 'export default {}' });
        const api = tree({ 'package.json': JSON.stringify({ scripts: { start: 'node server.js', dev: 'node --watch server.js' } }) });
        expect(inspectProjectQualityContract(react, P151).ok).toBe(true);
        expect(inspectProjectQualityContract(api, P151, { additionalRoot: true, testsRequested: false })).toEqual({ ok: true, failures: [] });
    });
    it('tests asked for need a test script; a build step needs a build script; placeholders stay refused', () => {
        const api = tree({ 'package.json': JSON.stringify({ scripts: { start: 'node server.js' } }) });
        expect(inspectProjectQualityContract(api, P101, { additionalRoot: true, testsRequested: true }).failures.join()).toMatch(/test script/);
        const ui = tree({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }), 'vite.config.ts': 'export default {}' });
        expect(inspectProjectQualityContract(ui, 'Make a dashboard', { additionalRoot: true }).failures.join()).toMatch(/build script/);
        const fake = tree({ 'package.json': JSON.stringify({ scripts: { start: 'node s.js', test: 'echo "no tests"' } }) });
        expect(inspectProjectQualityContract(fake, 'Make an API', { additionalRoot: true }).ok).toBe(false);
        expect(inspectProjectQualityContract(api, 'Build it, then run npm run build', { additionalRoot: true }).failures.join()).toMatch(/build script/);
    });
});
