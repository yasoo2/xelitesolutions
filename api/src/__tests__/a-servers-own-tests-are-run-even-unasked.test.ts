import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { DeliveryLedger } from '../core/quality/delivery-verdict';
import { deliveryRun } from '../core/quality/delivery-run';
import { systemPrompt } from '../core/engine/prompt';

/**
 * A SERVER'S OWN TESTS ARE RUN WHENEVER IT HAS THEM, ASKED FOR OR NOT.
 *
 * Until 2026-11-05 Joe ran a project's tests only when the request said
 * «tests». A server the engine wrote tests for (H01, H02: «1 test file») was
 * delivered without them ever running, so a red suite could ship under a
 * certificate that said nothing about it — and a change run had no proof that
 * the features already there still worked. Now the engine is told to write
 * tests for every server, and delivery runs a server's own tests when it has
 * them: a pass goes into the certificate, a failure is a check to repair. A
 * project with no tests of its own is not refused for it.
 */
jest.setTimeout(60_000);
const roots: string[] = [];
const servers: http.Server[] = [];
afterAll(async () => {
    for (const s of servers) await new Promise<void>(r => s.close(() => r()));
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-own-tests-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

async function liveUrl(): Promise<string> {
    const server = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return `http://127.0.0.1:${(server.address() as any).port}/`;
}

const SERVER = `const express = require('express');
const app = express();
app.use(express.json());
const notes = [];
app.get('/api/notes', (req, res) => res.json(notes));
app.post('/api/notes', (req, res) => { notes.push(req.body); res.status(201).json(req.body); });
module.exports = app;
if (require.main === module) app.listen(process.env.PORT || 3000);
`;
const manifest = (test: string) => JSON.stringify({ name: 'notes-api', scripts: { start: 'node server.js', test } });

/** What delivery records for this tree, and the tools it ran. */
async function delivered(request: string, roles: { service: boolean; interface: boolean; program: boolean }, files: Record<string, string>, testsPass = true) {
    const root = tree(files);
    const url = await liveUrl();
    const ledger = new DeliveryLedger();
    const calls: Array<{ tool: string; input: any }> = [];
    const delivery = deliveryRun({
        productRequest: request,
        ledger,
        deliveryRoles: roles,
        deliveredRoots: (extra = []) => Array.from(new Set([root, ...extra].filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))),
        deliveryParts: () => [{ root, tool: 'general_agent' }],
        runTool: async (tool, input) => {
            calls.push({ tool, input });
            if (tool !== 'quality_run') throw new Error(`no tool expected: ${tool}`);
            return testsPass
                ? { ok: true, output: { results: [{ task: 'test', skipped: false, ok: true }] } }
                : { ok: false, error: 'not ok 1 - POST /api/notes keeps the note', output: { results: [{ task: 'test', skipped: false, ok: false, error: 'not ok 1' }] } };
        },
        requireInstrument: () => { },
    });
    await delivery.recordLiveAcceptance({ ok: true, output: { url, cwd: root, kind: 'npm-start' } }, root, [root]);
    return { tests: ledger.all().filter(m => m.instrument === 'tests'), calls, root };
}

const API = { service: true, interface: false, program: false };

describe('a server\'s own tests', () => {
    it('are run although the request never said «tests», and a pass is recorded', async () => {
        const { tests, calls, root } = await delivered('Build a notes REST API with Express.', API, { 'package.json': manifest('node --test'), 'server.js': SERVER, 'test/notes.test.js': 'require("node:test");' });
        expect(calls).toEqual([{ tool: 'quality_run', input: { path: root, tasks: ['test'] } }]);
        expect(tests).toEqual([expect.objectContaining({ instrument: 'tests', ok: true })]);
    });

    it('that fail are a check to repair, naming what failed', async () => {
        const { tests } = await delivered('Build a notes REST API with Express.', API, { 'package.json': manifest('node --test'), 'server.js': SERVER }, false);
        expect(tests).toHaveLength(1);
        expect(tests[0].ok).toBe(false);
        expect(tests[0].error).toMatch(/^the project's own tests did not pass in [^:]+: .*not ok 1/u);
    });

    it('are not demanded when there are none: npm\'s placeholder script is no test suite', async () => {
        const { tests, calls } = await delivered('Build a notes REST API with Express.', API, { 'package.json': manifest('echo "Error: no test specified" && exit 1'), 'server.js': SERVER });
        expect(calls).toEqual([]);
        expect(tests).toEqual([]);
    });

    /**
     * The rerun of H10, 2026-11-05: «ابني منصة حجز مواعيد لصالونات تجميل …» —
     * a request the reader does not read as asking for a server. The builder
     * wrote one anyway, with 25 routes and a test file it ran four times; the
     * delivery said «tests skipped: the request asks for no tests» and never
     * ran them. A server is what the delivered tree registers, not only what
     * the request names.
     */
    it('are run for a server the delivered tree registers, though the request named none', async () => {
        const H10 = 'ابني منصة حجز مواعيد لصالونات تجميل: عدة فروع وموظفين، خدمات بمدد مختلفة، تأكيد الحجز وإلغاؤه، ولوحة للمالك تعرض الإيرادات.';
        const { tests, calls, root } = await delivered(H10, { service: false, interface: true, program: false }, { 'package.json': manifest('node --test'), 'server.js': SERVER, 'test/api.test.js': 'require("node:test");' });
        expect(calls).toEqual([{ tool: 'quality_run', input: { path: root, tasks: ['test'] } }]);
        expect(tests).toEqual([expect.objectContaining({ instrument: 'tests', ok: true })]);
    });

    it('a page with no server keeps its own business', async () => {
        const { tests, calls } = await delivered('Build a landing page for a bakery.', { service: false, interface: true, program: false }, { 'package.json': manifest('node --test'), 'index.html': '<h1>Bakery</h1>' });
        expect(calls).toEqual([]);
        expect(tests).toEqual([]);
    });
});

describe('the engine is told to write them', () => {
    it('every server gets tests for its routes, run before task_finish and again on a change', () => {
        const prompt = systemPrompt({ platform: 'linux', shell: 'bash' });
        expect(prompt).toMatch(/A project with a server gets automated tests for its routes/u);
        expect(prompt).toMatch(/On a change, run its existing tests too/u);
    });
});
