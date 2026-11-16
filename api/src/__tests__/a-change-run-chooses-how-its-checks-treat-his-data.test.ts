/**
 * A CHANGE RUN'S CHECKS CHOOSE, BEFORE ANYTHING STARTS, HOW THEY TREAT THE OWNER'S DATA.
 *
 * Design v13.3 (step 1), the verification's part (verify.ts, delivery-run.ts, certificate.ts):
 * a folder Joe delivered before is the owner's app, and his own records may be in it. So the
 * verification reads the delivery record once, chooses the path before the snapshot, the probes
 * and the walk, and pins it (the stricter of the pin and what really started):
 *   - 2T (a Node server today's put-back covers): walked as today, put back as today, and every
 *     version of his data files copied OUTSIDE the project before anything is put back — told;
 *   - path 3 (anything not proven): nothing is put back (nothing was saved), the probe that
 *     saves data is not run, and the «✅» line is replaced by what was not tried;
 *   - an unwatched 2T walk is skipped exactly as today; path 3 walks unwatched;
 *   - one 2T verification of a project at a time: a busy lock makes this one path 3, told;
 *   - a new build is as it always was.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import { createVerifier, deliveryOutput, listRecoveryVersions, qaPathLines, restoreRecoveryVersion, type BrowserQa, type DeliveryVerification } from '../core/engine/verify';
import { deliveryCertificate } from '../core/engine/certificate';
import { deliveryRun } from '../core/quality/delivery-run';
import { DeliveryLedger } from '../core/quality/delivery-verdict';
import { ISOLATION_FILE } from '../core/quality/isolation-probe';
import { acquireVerifyLock, verifyLockFile } from '../core/quality/qa-leaves-no-trace';
import { seedRequirementsFromRequest } from '../core/engine/seed';
import { newPlan, seededRequirements } from '../core/engine/plan';
import type { EngineResult, ProcessRegistry, RunState, ToolContext } from '../core/engine/types';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(300_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-qa-path-'));
const workspace = path.join(tmp, 'projects');
const joeData = path.join(tmp, 'joe-data');
fs.mkdirSync(workspace, { recursive: true });
const savedDataDir = process.env.JOE_DATA_DIR;
//  The recovery copies go to Joe's own data folder: this test's, never the repository's.
process.env.JOE_DATA_DIR = joeData;

const TOOL_CONTEXT = { sessionId: 'joe-qa-path-session', workspaceId: 'joe-qa-path', userId: 'joe-qa-path-user', runId: 'joe-qa-path-run' };

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-qa-path-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

let projects = 0;
function project(files: Record<string, string>): string {
    const dir = path.join(workspace, `project-${++projects}`);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

/** A notes app that keeps its records in data/notes.json, the way a built app does. */
const notesServer = (extra = '') => [
    "const http = require('http');",
    "const fs = require('fs');",
    "const path = require('path');",
    extra,
    "const file = path.join(__dirname, 'data', 'notes.json');",
    "let notes = JSON.parse(fs.readFileSync(file, 'utf8'));",
    'http.createServer((req, res) => {',
    "  if (req.method === 'POST' && req.url === '/api/notes') {",
    "    let body = '';",
    "    req.on('data', c => { body += c; });",
    "    req.on('end', () => {",
    '      notes.push({ id: notes.length + 1, text: JSON.parse(body).text });',
    '      fs.writeFileSync(file, JSON.stringify(notes));',
    "      res.writeHead(201, { 'content-type': 'application/json' });",
    '      res.end(JSON.stringify(notes[notes.length - 1]));',
    '    });',
    '    return;',
    '  }',
    "  if (req.url === '/api/notes') {",
    "    res.writeHead(200, { 'content-type': 'application/json' });",
    '    return res.end(JSON.stringify(notes));',
    '  }',
    "  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
    "  res.end('<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>My notes</title></head><body><h1>My notes</h1><ul>' + notes.map(n => '<li>' + String(n.text).replace(/</g, '&lt;') + '</li>').join('') + '</ul></body></html>');",
    "}).listen(Number(process.env.PORT) || 4173, '127.0.0.1');",
    '',
].join('\n');
const SEED = JSON.stringify([{ id: 1, text: 'Buy milk' }]);
const REQUEST = 'Build a page that shows my notes.';
const WANTED = [{ text: 'my notes', quote: 'my notes', line: '<h1>My notes</h1>' }];
const DELIVERED = JSON.stringify([{ request: 'Build my notes app', status: 'delivered', at: 1 }]);

/** The notes app. delivered: it has a delivery record (a change run). net: its server code loads a network module (§3b T3 → path 3). */
function notesApp(opts: { delivered: boolean; net?: boolean }): string {
    return project({
        'server.js': notesServer(opts.net ? "const net = require('net'); void net;" : ''),
        'data/notes.json': SEED,
        'package.json': JSON.stringify({ name: 'my-notes', version: '1.0.0', private: true, scripts: { start: 'node server.js' } }, null, 2),
        ...(opts.delivered ? { '.joe/history.json': DELIVERED } : {}),
    });
}

function request(url: string, method = 'GET', body?: string): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method, timeout: 5000, headers: body ? { 'content-type': 'application/json' } : {} }, res => {
            let text = '';
            res.on('data', c => { text += c; });
            res.on('end', () => resolve({ status: res.statusCode || 0, text }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.end(body);
    });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * The panel. Each walk saves a note of its own as the QA's forms do; `ownerWritesAfterMs` makes the owner save one
 * of his own straight to the app that long after the walk's request — outside every window the walk reports.
 */
function panel(opts: { watching: boolean; ownerWritesAfterMs?: number; reportsWindows?: boolean }): BrowserQa & { audits: any[] } {
    const audits: any[] = [];
    return {
        audits,
        async watcher() { return { sessionId: 'joe-qa-path-panel', watching: opts.watching }; },
        async audit(_dir, auditOpts) {
            audits.push(auditOpts);
            const base = String(auditOpts.serveUrl).replace(/\/$/u, '');
            const start = Date.now();
            await request(`${base}/api/notes`, 'POST', JSON.stringify({ text: `QA Tester note ${audits.length}` }));
            const end = Date.now();
            if (opts.ownerWritesAfterMs !== undefined) {
                await sleep(opts.ownerWritesAfterMs);
                await request(`${base}/api/notes`, 'POST', JSON.stringify({ text: 'the owner\'s own note' }));
                await sleep(400);
            }
            const ran = auditOpts.qaPin?.path || 'as-today';
            return {
                score: 100, findings: [],
                ...(opts.reportsWindows ? { qaPath: { path: ran, reasons: [], comparable: true, windows: [{ start, end, long: false }], blocked: 0, blockedHosts: [], notTried: ran === 'no-write' ? ['form: Add a note'] : [], streamed: opts.watching, signedIn: false } } : {}),
            } as any;
        },
    };
}

const calls: Array<{ tool: string; input: any }> = [];
const TOOLS: Record<string, () => { execute(input: any, context?: any): Promise<any> }> = {
    project_run: () => new ProjectRunTool(),
    project_stop: () => new ProjectStopTool(),
    quality_run: () => new QualityRunTool(),
    shell_execute: () => new ShellExecuteTool(),
};
const runTool = async (tool: string, input: any) => {
    const make = TOOLS[tool];
    if (!make) throw new Error(`the verifier asked for a tool this test does not provide: ${tool}`);
    calls.push({ tool, input });
    return executionFirewall.runInContext(`joe-qa-path-${tool}`, () => make().execute(input, TOOL_CONTEXT));
};
beforeEach(() => { calls.length = 0; });

async function ask(prompt: string): Promise<string> {
    if (prompt.startsWith('Read this request')) return JSON.stringify({ requirements: WANTED.map(w => ({ text: w.text, quote: w.quote })) });
    if (prompt.startsWith('Here is the source')) {
        const verdicts = [...prompt.matchAll(/^\s+\d+\. \[([^\]]+)\] (.+?) {3}\(he wrote: «/gmu)]
            .map(m => ({ id: m[1], verdict: 'met', evidence: WANTED[0].line, why: 'the page carries its heading' }));
        return JSON.stringify({ verdicts });
    }
    throw new Error('the test model was asked something it does not answer');
}

const noProcesses: ProcessRegistry = {
    async start() { throw new Error('not used'); }, logs: () => undefined,
    async stop() { return false; }, list: () => [], async stopAll() { /* none */ },
};

async function verify(dir: string, qa: BrowserQa, deadlineMs = 15 * 60_000): Promise<DeliveryVerification> {
    const seeds = await seedRequirementsFromRequest(REQUEST, 'en', ask);
    const state: RunState = {
        plan: newPlan(seededRequirements(seeds)),
        files: new Map(), commands: [], served: [], pages: [], verifications: [],
        steps: 0, modelMs: 0, toolMs: 0,
    };
    const ctx: ToolContext = {
        runId: 'joe-qa-path-run', projectDir: dir, stateDir: path.join(dir, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
        deadlineAt: Date.now() + deadlineMs, language: 'en', request: REQUEST, processes: noProcesses,
        browser: () => { throw new Error('not used'); },
        state, emit: () => undefined, joe: {},
    };
    return executionFirewall.runInContext('joe-qa-path-finish', () => createVerifier({ ask, runTool, browserQa: qa, mend: null })(ctx, { summary: 'done' })) as Promise<DeliveryVerification>;
}

function summaryOf(report: DeliveryVerification): string {
    const result = { status: 'delivered', summary: 'Changed the notes page.', verification: report, filesChanged: [], served: [], steps: 3, model: 'test' } as unknown as EngineResult;
    return String(deliveryOutput({ result, projectRoot: report.delivery.projectRoot, request: REQUEST, language: 'en' }).output.summary);
}

/** Every file under a folder, with its text. */
function filesUnder(dir: string): Array<{ rel: string; text: string }> {
    const out: Array<{ rel: string; text: string }> = [];
    const walk = (d: string, rel: string) => {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) walk(path.join(d, e.name), r);
            else out.push({ rel: r, text: fs.readFileSync(path.join(d, e.name), 'utf8') });
        }
    };
    walk(dir, '');
    return out;
}

/* ───────────────────────── 2T ───────────────────────── */

describe('a change run of a Node server today\'s put-back covers (2T)', () => {
    let kept: { dir: string; report: DeliveryVerification } | undefined;

    it('is walked and put back as today, with every version of his data copied outside the project first — and told', async () => {
        const dir = notesApp({ delivered: true });
        const qa = panel({ watching: true, ownerWritesAfterMs: 1600, reportsWindows: true });
        const report = await verify(dir, qa);
        kept = { dir, report };
        expect(report.passed).toBe(true);
        //  The walk was told the door's facts: his folder, the pin, the panel to stream to, how it started and where.
        expect(qa.audits).toHaveLength(1);
        expect(qa.audits[0]).toMatchObject({ projectRoot: path.resolve(dir), streamTo: 'joe-qa-path-panel', startKind: 'npm-start', serverRoot: path.resolve(dir) });
        expect(qa.audits[0].qaPin).toMatchObject({ path: '2t', record: 'history' });
        expect(qa.audits[0].walkedOrigins).toEqual([new URL(String(report.delivery.liveUrl)).origin]);
        //  Put back as today: the store is the snapshot, the QA's note and his alike.
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toBe(SEED);
        const q = report.delivery.qaPath!;
        expect(q).toMatchObject({ path: '2t', walked: true, blocked: 0, notTried: [], skippedProbes: [] });
        expect(q.recovery).toMatchObject({ overBudget: false, keptDays: 14 });
        expect(q.recovery!.versions).toBeGreaterThan(0);
        //  His write came outside every window of the checks: told, and among the copies.
        expect(q.recovery!.unexplained).toEqual(['data/notes.json']);
        const copies = filesUnder(path.join(joeData, 'qa-recovery'));
        expect(copies.some(c => c.rel.endsWith('data/notes.json') && c.text.includes('the owner\'s own note'))).toBe(true);
        //  Never in the project.
        expect(filesUnder(dir).some(c => c.text.includes('the owner\'s own note'))).toBe(false);
        //  The lock is released.
        expect(fs.existsSync(verifyLockFile('default', dir))).toBe(false);
        const summary = summaryOf(report);
        expect(summary).toContain('✅');
        expect(summary).toContain('Joe\'s checks ran on your app the way they always have, trying its forms and buttons');
        //  Review 7, B3/M2: the copies' retention as pruning really keeps them, the chat that brings one back, and a change
        //  outside every request that could write told as one that may not have come from the checks.
        expect(summary).toContain('Joe kept your app\'s data files as they were before each put-back, outside your project, for 14 days — unless the space Joe sets aside for these copies fills up first, when the oldest go first. To bring one back, ask Joe in the chat.');
        expect(summary).toContain('While the checks ran, «data/notes.json» also changed at a moment when none of the checks\' requests could save anything, so the change may not have come from the checks');
        expect(report.delivery.log.join('\n')).toMatch(/qa path: a change run \(history\); before the start: 2t/u);
    });

    it('a kept version is brought back by Joe\'s code: names and sizes only, and what was there is kept aside', async () => {
        expect(kept).toBeDefined();
        const { dir, report } = kept!;
        const runs = await listRecoveryVersions('default', dir);
        expect(runs.map(r => r.runId)).toContain(report.delivery.qaPath!.recovery!.runId);
        const run = runs.find(r => r.runId === report.delivery.qaPath!.recovery!.runId)!;
        //  The version that holds his note.
        const holding = run.versions.find(v => {
            const file = path.join(joeData, 'qa-recovery', 'default');
            return filesUnder(file).some(c => c.rel.includes(`/${run.runId}/${v.n}/`) && c.text.includes('the owner\'s own note'));
        });
        expect(holding).toBeDefined();
        await executionFirewall.runInContext('joe-qa-path-stop-2', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
        const back = await restoreRecoveryVersion('default', dir, run.runId, holding!.n);
        expect(back.ok).toBe(true);
        expect(back.restored.map(r => r.file)).toEqual(['data/notes.json']);
        expect(back.restored[0].bytes).toBeGreaterThan(0);
        expect(JSON.stringify(back)).not.toContain('Buy milk');
        expect(back.keptAside).toEqual(['data/notes.json']);
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toContain('the owner\'s own note');
        //  A version that is not Joe's is refused.
        expect((await restoreRecoveryVersion('default', dir, '..', 1)).ok).toBe(false);
    });

    it('nobody watching: the walk is skipped exactly as today, and nothing of his is copied', async () => {
        const dir = notesApp({ delivered: true });
        const qa = panel({ watching: false });
        const report = await verify(dir, qa);
        expect(qa.audits).toHaveLength(0);
        expect(report.checks.find(c => c.id === 'browser')?.detail).toMatch(/no one is watching it/u);
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toBe(SEED);
        expect(report.delivery.qaPath).toMatchObject({ path: '2t', walked: false });
        expect(report.delivery.qaPath!.recovery).toBeUndefined();
    });

    it('a second 2T verification of the same project waits for its lock, then runs without saving anything — told', async () => {
        const dir = notesApp({ delivered: true });
        const held = await acquireVerifyLock('default', dir, 'another-verification', { waitMs: 0 });
        expect(held).not.toBeNull();
        try {
            const qa = panel({ watching: true });
            const report = await verify(dir, qa, 8_000);
            expect(qa.audits[0].qaPin.path).toBe('no-write');
            expect(report.delivery.qaPath).toMatchObject({ path: 'no-write', lockBusy: true });
            //  Another check holds the lock, so this one puts nothing back (that check does): the fake walk's note
            //  stays, and he is told which file changed and why it was not put back (review 7, B1).
            expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toContain('QA Tester note 1');
            expect(summaryOf(report)).toContain('Another check of this app was still running, so this one ran without pressing what saves in your app, and put nothing back.');
            expect(summaryOf(report)).toMatch(/these data files of your app changed: «data\/notes\.json»; they were not put back, because another check of this app was running at the same time/u);
        } finally {
            await held!.release();
        }
    });
});

/* ───────────────────────── path 3 ───────────────────────── */

describe('a change run of a server Joe cannot prove (path 3)', () => {
    it('walks even when nobody watches, puts back what changed (review 7, B1), and says what it did not try instead of «✅»', async () => {
        const dir = notesApp({ delivered: true, net: true });
        const qa = panel({ watching: false, reportsWindows: true });
        const report = await verify(dir, qa);
        expect(report.passed).toBe(true);
        expect(qa.audits).toHaveLength(1);
        expect(qa.audits[0].qaPin.path).toBe('no-write');
        //  Never worse than main (review 7, B1): what changed during the checks is put back, the server stopped for it
        //  and started again; every version is kept outside the project first.
        expect(calls.filter(c => c.tool === 'project_stop').length).toBeGreaterThanOrEqual(1);
        expect(calls.filter(c => c.tool === 'project_run')).toHaveLength(2);
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toBe(SEED);
        expect(report.delivery.qaPath).toMatchObject({ path: 'no-write', why: 'sender', walked: true, notTried: ['form: Add a note'], putBack: ['data/notes.json'] });
        expect(report.delivery.qaPath!.recovery?.versions).toBeGreaterThan(0);
        const summary = summaryOf(report);
        expect(summary).not.toContain('✅');
        //  «without saving anything» is never said when something of his changed: what changed is named instead.
        expect(summary).toMatch(/Your app keeps its data on its server \(its server can send to the outside \(mail, messages or requests\): .+\), so Joe's checks ran on your live app without pressing what saves; not tried: «form: Add a note» \(total: 1\)\./u);
        expect(summary).toMatch(/these data files of your app changed: «data\/notes\.json»; they were put back as they were before the checks/u);
    });
});

/* ───────────────────────── a new build ───────────────────────── */

describe('a new build (no delivery record)', () => {
    it('is verified as it always was: put back as today, and no word about paths', async () => {
        const dir = notesApp({ delivered: false });
        const qa = panel({ watching: true });
        const report = await verify(dir, qa);
        expect(report.passed).toBe(true);
        expect(qa.audits[0].qaPin).toMatchObject({ path: 'as-today', record: '' });
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toBe(SEED);
        expect(report.delivery.qaPath).toBeUndefined();
        expect(report.delivery.log.join('\n')).not.toMatch(/qa path:/u);
        expect(qaPathLines(report.delivery.qaPath, 'en')).toEqual([]);
        expect(summaryOf(report)).toContain('✅');
    });
});

/* ───────────────────────── the lines and the certificate ───────────────────────── */

describe('what is told', () => {
    it('a private window is claimed only with no refusal; refusals are told with their hosts; the lines speak his language', () => {
        const base = { path: 'private-live' as const, blocked: 0, notTried: [], skippedProbes: [], walked: true, origin: 'http://127.0.0.1:4317' };
        expect(qaPathLines(base, 'en')).toEqual(['Joe\'s checks ran on your app in a fresh private window holding none of your saved data, and reached only your app\'s address http://127.0.0.1:4317.']);
        const refused = qaPathLines({ ...base, blocked: 2, blockedHosts: ['api.example.test'] }, 'en');
        expect(refused).toEqual(['During the checks your app\'s page tried 2 times to reach other addresses (api.example.test); Joe\'s checks stopped those requests, so what depends on them was not tried.']);
        expect(qaPathLines(base, 'ar')[0]).toContain('نافذة خاصة جديدة');
        expect(qaPathLines({ ...base, path: 'no-write', why: 'ownServer', whyDetail: 'a server of its own (npm-start)', notTried: ['form: A', 'form: B', 'link: C', 'control: D'], skippedProbes: ['isolation'], signedIn: true }, 'en'))
            .toEqual([
                'Your app keeps its data on its server (it runs a server of its own: a server of its own (npm-start)), so Joe\'s checks ran on your live app saving nothing in it beyond signing in with the account you gave; not tried: «form: A», «form: B», «link: C», … (total: 4).',
                'The per-user isolation check was not run because it saves data in your live app.',
            ]);
    });

    it('the certificate says after the browser line how his data was treated, and lists what the no-write walk did not try', () => {
        const input = { request: 'Add a dark mode', summary: 'Added it.', language: 'en', passed: ['live', 'browser'] };
        const plain = deliveryCertificate(input);
        expect(plain).not.toContain('🔒');
        const asBefore = deliveryCertificate({ ...input, qaPath: { path: '2t' } });
        expect(asBefore).toMatch(/\*\*browser test\*\*: .*\n- 🔒 Tried in the browser on your app as always, then its data files were put back as before\./u);
        const noWrite = deliveryCertificate({ ...input, qaPath: { path: 'no-write', notTried: ['form: Add a note', 'control: Delete'] } });
        expect(noWrite).toContain('- 🔒 Tried in the browser on your live app without saving anything in it; 2 things that save data were not tried.');
        expect(noWrite).toMatch(/## Not proven yet\n\n- ⚠️ not tried: form: Add a note\n- ⚠️ not tried: control: Delete/u);
        expect(deliveryCertificate({ ...input, language: 'ar', qaPath: { path: 'private-live' } })).toContain('جُرّب في المتصفح في نافذة خاصة لم تصل إلا إلى عنوان تطبيقك.');
    });
});

/* ───────────────────────── the isolation probe on path 3 ───────────────────────── */

describe('the probe that registers users and creates a record', () => {
    const CLINIC = 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.';
    const DECLARATION = {
        register: { path: '/api/auth/register', body: { email: '{email}', password: '{password}' } },
        login: { path: '/api/auth/login', body: { email: '{email}', password: '{password}' } },
        users: [{ email: 'staff.a@clinic.test', password: 'Passw0rd!a' }, { email: 'staff.b@clinic.test', password: 'Passw0rd!b' }],
        records: { create: { path: '/api/patients', body: { name: '{marker}' } }, list: '/api/patients' },
    };

    async function measure(qaPath?: 'no-write') {
        const writes: string[] = [];
        const server = http.createServer((req, res) => {
            if (req.method !== 'GET') writes.push(`${req.method} ${req.url}`);
            req.resume();
            req.on('end', () => { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"sign in"}'); });
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
        const dir = project({ [ISOLATION_FILE]: JSON.stringify(DECLARATION), 'server/index.js': "app.get('/api/patients', h);\n" });
        try {
            const ledger = new DeliveryLedger();
            const delivery = deliveryRun({
                productRequest: CLINIC, ledger,
                deliveryRoles: { service: true, interface: true, program: false },
                deliveredRoots: (extra = []) => Array.from(new Set([dir, ...extra].filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))),
                deliveryParts: () => [{ root: dir, tool: 'general_agent' }],
                runTool: async () => ({ ok: false, error: 'no tool here' }),
                requireInstrument: () => undefined,
                ...(qaPath ? { qaPath } : {}),
            });
            ledger.record({ instrument: 'live', ok: true, url: base });
            await delivery.measureRequestedRecords({ ok: true, output: { cwd: dir } }, [dir]);
            return { writes, state: delivery.state, coverage: ledger.all().find(m => m.instrument === 'coverage') };
        } finally {
            await new Promise<void>(r => server.close(() => r()));
        }
    }

    it('runs as today on a new build or 2T: it writes to the live server', async () => {
        const { writes, state } = await measure();
        expect(writes.length).toBeGreaterThan(0);
        expect(state.skippedProbes).toBeUndefined();
    });

    it('is not run on path 3: nothing is sent, it is told, and the rule stays not measured — never passed', async () => {
        const { writes, state, coverage } = await measure('no-write');
        expect(writes).toEqual([]);
        expect(state.skippedProbes).toEqual(['isolation']);
        expect((coverage?.unverified || []).join(' ')).toMatch(/per-user record isolation .*not measured/u);
    });
});
