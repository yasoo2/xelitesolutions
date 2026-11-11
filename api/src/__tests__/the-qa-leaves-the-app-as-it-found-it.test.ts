/**
 * THE QA'S OWN RECORDS WERE DELIVERED WITH THE APP, AND THEN JUDGED.
 *
 * qa-live15, 2026-11-11, the electronics store. The Browser QA typed
 * `<b>qa</b><img src=x onerror=…>` into the order and warranty forms, the app
 * kept it, and the delivered data/store.db held two orders, three warranties
 * and a product «QA123» that nobody but the QA had made. The next measurement
 * opened on them: the look judge was shown «<b>qa</b>…» in the products table
 * and said «does not look clean» — twice. Two refused deliveries and four
 * minutes of re-measuring, for text the app had escaped correctly.
 *
 * Now the files the app keeps its records in are read before the QA's first
 * press and put back after its last, with the server stopped; a delivered
 * server is started again on the same address, on the user's records alone.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { addressIsFree, appDataChanges, discardSnapshot, restoreAppData, restoreLine, snapshotAppData } from '../core/quality/qa-leaves-no-trace';
import { createVerifier, type BrowserQa, type DeliveryVerification } from '../core/engine/verify';
import { seedRequirementsFromRequest } from '../core/engine/seed';
import { newPlan, seededRequirements } from '../core/engine/plan';
import type { ProcessRegistry, RunState, ToolContext } from '../core/engine/types';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(240_000);

const TOOL_CONTEXT = { sessionId: 'joe-qa-trace-session', workspaceId: 'joe-qa-trace', userId: 'joe-qa-trace-user', runId: 'joe-qa-trace-run' };
const workspace = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-qa-trace-'));

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-qa-trace-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => { fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

let projects = 0;
function project(files: Record<string, string | Buffer>): string {
    const dir = path.join(workspace, `project-${++projects}`);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

/* ───────────────────────── what is data, and what is put back ───────────────────────── */

describe('the files an app keeps its records in', () => {
    const files = {
        'data/store.db': Buffer.from('SQLite format 3\u0000 seed rows'),
        'data/store.db-wal': Buffer.from('wal of the seed'),
        'data/seed.js': 'module.exports = [{ id: 1 }];\n',
        'db.json': '{"notes":[{"id":1,"text":"Buy milk"}]}',
        'server/storage/sessions.json': '[]',
        'src/store/index.ts': 'export const store = {};\n',
        'dist/bundle.db': 'a build output named like a database',
        'node_modules/pkg/data/x.json': '{}',
        '.joe/look/page.jpg': 'a screenshot of Joe\'s own',
        'server.js': 'require("http").createServer().listen(0);\n',
    };

    it('are read: databases, records files and what is under a records folder — never code, builds, dependencies or Joe\'s own', async () => {
        const root = project(files);
        const s = await snapshotAppData(root);
        const kept = [...s.files.keys()].map(f => path.relative(root, f).replace(/\\/gu, '/')).sort();
        expect(kept).toEqual(['data/store.db', 'data/store.db-wal', 'db.json', 'server/storage/sessions.json']);
    });

    it('what the app changed is put back, what it created is removed, and what was kept on purpose is left', async () => {
        const root = project(files);
        const s = await snapshotAppData(root);
        fs.writeFileSync(path.join(root, 'data/store.db'), 'SQLite format 3\u0000 seed rows + <b>qa</b><img src=x onerror=…>');
        fs.rmSync(path.join(root, 'data/store.db-wal'));
        fs.writeFileSync(path.join(root, 'data/store.db-shm'), 'made by the server while the QA pressed');
        fs.mkdirSync(path.join(root, 'uploads'), { recursive: true });
        fs.writeFileSync(path.join(root, 'uploads/qa.png'), 'the QA\'s upload');
        fs.writeFileSync(path.join(root, 'db.json'), '{"notes":[{"id":1,"text":"Buy milk"},{"id":2,"text":"QA123"}]}');
        fs.writeFileSync(path.join(root, 'server/storage/sessions.json'), '["a repair wrote this on purpose"]');
        fs.writeFileSync(path.join(root, 'src/store/index.ts'), 'export const store = { mended: true };\n');

        expect((await appDataChanges(s, ['server/storage/sessions.json'])).map(f => path.relative(root, f).replace(/\\/gu, '/')).sort())
            .toEqual(['data/store.db', 'data/store.db-shm', 'data/store.db-wal', 'db.json', 'uploads/qa.png']);
        const r = await restoreAppData(s, ['server/storage/sessions.json']);
        expect(r.failed).toEqual([]);
        expect(fs.readFileSync(path.join(root, 'data/store.db'), 'utf8')).toBe('SQLite format 3\u0000 seed rows');
        expect(fs.readFileSync(path.join(root, 'data/store.db-wal'), 'utf8')).toBe('wal of the seed');
        expect(fs.existsSync(path.join(root, 'data/store.db-shm'))).toBe(false);
        expect(fs.existsSync(path.join(root, 'uploads/qa.png'))).toBe(false);
        expect(fs.readFileSync(path.join(root, 'db.json'), 'utf8')).toBe('{"notes":[{"id":1,"text":"Buy milk"}]}');
        //  Kept on purpose, and code: left exactly as they are now.
        expect(fs.readFileSync(path.join(root, 'server/storage/sessions.json'), 'utf8')).toBe('["a repair wrote this on purpose"]');
        expect(fs.readFileSync(path.join(root, 'src/store/index.ts'), 'utf8')).toContain('mended: true');
        expect(restoreLine(r)).toMatch(/^the QA's own records are gone from the app: 3 data file\(s\) put back .*; 2 file\(s\) it made the app create removed/u);
        expect(await appDataChanges(s, ['server/storage/sessions.json'])).toEqual([]);
    });

    it('the copies are kept on disk, a database whole or not at all, and are gone once discarded', async () => {
        const big = Buffer.alloc(65 * 1024 * 1024, 1);
        const root = project({ 'data/app.db': big, 'data/app.db-wal': 'the log of the big one', 'data/notes.json': '[]' });
        const s = await snapshotAppData(root);
        //  Too large to copy, so its log is not copied either: put back alone, it would replay over a newer file.
        expect([...s.files.keys()].map(f => path.basename(f))).toEqual(['notes.json']);
        expect(s.tooLarge.map(f => path.basename(f)).sort()).toEqual(['app.db', 'app.db-wal']);
        fs.writeFileSync(path.join(root, 'data/app.db-wal'), 'the log the QA left');
        fs.writeFileSync(path.join(root, 'data/app.db-shm'), 'made while the QA pressed');
        expect(await appDataChanges(s)).toEqual([]);
        //  Its times come back with its bytes.
        const when = new Date('2026-01-02T03:04:05Z');
        fs.utimesSync(path.join(root, 'data/notes.json'), when, when);
        const s2 = await snapshotAppData(root);
        fs.writeFileSync(path.join(root, 'data/notes.json'), '[{"id":1}]');
        await restoreAppData(s2);
        expect(fs.statSync(path.join(root, 'data/notes.json')).mtime.toISOString()).toBe(when.toISOString());
        expect(fs.existsSync(s.dir)).toBe(true);
        await discardSnapshot(s);
        await discardSnapshot(s2);
        expect(fs.existsSync(s.dir)).toBe(false);
        expect(fs.existsSync(s2.dir)).toBe(false);
    });

    it('an address is free only when nothing answers there any more', async () => {
        const server = http.createServer((_q, r) => r.end('still here'));
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        const url = `http://127.0.0.1:${(server.address() as any).port}/`;
        expect(await addressIsFree(url, 600)).toBe(false);
        await new Promise<void>(r => server.close(() => r()));
        expect(await addressIsFree(url, 600)).toBe(true);
    });

    it('a link inside the project is never followed: what it points at is neither read nor removed', async () => {
        const outside = project({ 'data/elsewhere.db': 'someone else\'s database' });
        const root = project({ 'data/store.db': 'seed' });
        fs.symlinkSync(path.join(outside, 'data'), path.join(root, 'linked'), 'junction');
        const s = await snapshotAppData(root);
        expect([...s.files.keys()].map(f => path.relative(root, f))).toEqual([path.join('data', 'store.db')]);
        fs.writeFileSync(path.join(outside, 'data', 'new.db'), 'created outside');
        await restoreAppData(s);
        expect(fs.readFileSync(path.join(outside, 'data', 'elsewhere.db'), 'utf8')).toBe('someone else\'s database');
        expect(fs.existsSync(path.join(outside, 'data', 'new.db'))).toBe(true);
        fs.rmSync(path.join(root, 'linked'));
    });
});

/* ───────────────────────── a delivery that the QA wrote into ───────────────────────── */

/** A notes app that keeps its records in data/notes.json, the way a built app does. */
const NOTES_SERVER = [
    "const http = require('http');",
    "const fs = require('fs');",
    "const path = require('path');",
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

function notesApp(): string {
    return project({
        'server.js': NOTES_SERVER,
        'data/notes.json': SEED,
        'package.json': JSON.stringify({ name: 'my-notes', version: '1.0.0', private: true, scripts: { start: 'node server.js' } }, null, 2),
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

/** The watched panel: every walk reads the notes it opens on, then saves one of its own as the QA's forms do. */
function writingPanel(findingsPerWalk: Array<any[]>): BrowserQa & { sawOnOpening: string[][] } {
    const sawOnOpening: string[][] = [];
    let walks = 0;
    return {
        sawOnOpening,
        async watcher() { return { sessionId: 'joe-qa-trace-panel', watching: true }; },
        async audit(_dir, opts) {
            const base = String(opts.serveUrl).replace(/\/$/u, '');
            sawOnOpening.push(JSON.parse((await request(`${base}/api/notes`)).text).map((n: any) => n.text));
            await request(`${base}/api/notes`, 'POST', JSON.stringify({ text: `<b>qa</b><img src=x onerror="window.__joeQaXss=1"> walk-${walks + 1}` }));
            const findings = findingsPerWalk[Math.min(walks, findingsPerWalk.length - 1)] || [];
            walks++;
            return { score: findings.length ? 70 : 100, findings };
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
/** A stop that says it stopped and did not (qa-live16: its process check timed out on a loaded machine). */
let stopSaysStoppedAndIsNot = false;
const runTool = async (tool: string, input: any) => {
    const make = TOOLS[tool];
    if (!make) throw new Error(`the verifier asked for a tool this test does not provide: ${tool}`);
    calls.push({ tool, input });
    if (tool === 'project_stop' && stopSaysStoppedAndIsNot) return { ok: true, output: { stopped: false, message: 'pid 23180 is no longer running; nothing to kill' } };
    return executionFirewall.runInContext(`joe-qa-trace-${tool}`, () => make().execute(input, TOOL_CONTEXT));
};
beforeEach(() => { calls.length = 0; stopSaysStoppedAndIsNot = false; });

/** The request reader and the source judge, answered the way Joe's parsers read them. */
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

async function verify(dir: string, qa: BrowserQa): Promise<DeliveryVerification> {
    const seeds = await seedRequirementsFromRequest(REQUEST, 'en', ask);
    const state: RunState = {
        plan: newPlan(seededRequirements(seeds)),
        files: new Map(), commands: [], served: [], pages: [], verifications: [],
        steps: 0, modelMs: 0, toolMs: 0,
    };
    const ctx: ToolContext = {
        runId: 'joe-qa-trace-run', projectDir: dir, stateDir: path.join(dir, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
        deadlineAt: Date.now() + 15 * 60_000, language: 'en', request: REQUEST, processes: noProcesses,
        browser: () => { throw new Error('not used'); },
        state, emit: () => undefined, joe: {},
    };
    return executionFirewall.runInContext('joe-qa-trace-finish', () => createVerifier({ ask, runTool, browserQa: qa, mend: null })(ctx, { summary: 'done' })) as Promise<DeliveryVerification>;
}

describe('a delivery the Browser QA wrote into', () => {
    it('is delivered on the user\'s records alone: the file is put back, and the live server is started again on them, at the same address', async () => {
        const dir = notesApp();
        const qa = writingPanel([[]]);
        const report = await verify(dir, qa);
        expect(report.passed).toBe(true);
        expect(qa.sawOnOpening).toEqual([['Buy milk']]);
        //  The QA's note is not in the file he receives…
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toBe(SEED);
        //  …nor in the server that stays live for him, which answers where it did.
        const live = String(report.delivery.liveUrl).replace(/\/$/u, '');
        expect(JSON.parse((await request(`${live}/api/notes`)).text)).toEqual([{ id: 1, text: 'Buy milk' }]);
        const runs = calls.filter(c => c.tool === 'project_run');
        expect(runs).toHaveLength(2);
        expect(runs[1].input).toEqual({ cwd: dir, restart: true, port: Number(new URL(live).port) });
        expect(report.delivery.log.join('\n')).toMatch(/browser QA: the QA's own records are gone from the app: 1 data file\(s\) put back as they were before it \(data[\\/]notes\.json\)/u);
    });

    it('a second walk opens on the records the first one found, never on the first one\'s note', async () => {
        const dir = notesApp();
        const budget = [{ id: 'qa_budget_exhausted', severity: 'medium', detail: 'the walk ran out of time', detailEn: 'the walk ran out of time' }];
        const qa = writingPanel([budget, []]);
        const report = await verify(dir, qa);
        expect(qa.sawOnOpening).toEqual([['Buy milk'], ['Buy milk']]);
        expect(report.passed).toBe(true);
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toBe(SEED);
    });

    it('a refused delivery is put back too, with its server stopped, so the next check opens on the same records', async () => {
        const dir = notesApp();
        const dead = [{ id: 'dead_controls', severity: 'high', detail: 'زر لا يفعل شيئاً', detailEn: 'a button that does nothing' }];
        const qa = writingPanel([dead]);
        const report = await verify(dir, qa);
        expect(report.passed).toBe(false);
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toBe(SEED);
        //  Stopped, as a refused delivery's server always is: not started again for the QA.
        expect(calls.filter(c => c.tool === 'project_run')).toHaveLength(1);
        const again = await verify(dir, writingPanel([[]]));
        expect(again.passed).toBe(true);
    });

    it('a stop that did not stop the server leaves the file as it is, and the live server is not started a second time', async () => {
        const dir = notesApp();
        stopSaysStoppedAndIsNot = true;
        const report = await verify(dir, writingPanel([[]]));
        expect(report.passed).toBe(true);
        //  Never written under a server that still runs, and keeps its own copy.
        expect(fs.readFileSync(path.join(dir, 'data', 'notes.json'), 'utf8')).toContain('walk-1');
        expect(calls.filter(c => c.tool === 'project_run')).toHaveLength(1);
        expect(report.delivery.log.join('\n')).toMatch(/the records its forms left were not put back: something still answers at http:\/\/127\.0\.0\.1:\d+\/? after the server was stopped/u);
        const live = String(report.delivery.liveUrl).replace(/\/$/u, '');
        expect((await request(`${live}/api/notes`)).status).toBe(200);
    });

    it('an app whose records did not change is not stopped or started again for nothing', async () => {
        const dir = notesApp();
        const reader: BrowserQa = {
            async watcher() { return { sessionId: 'joe-qa-trace-panel', watching: true }; },
            async audit() { return { score: 100, findings: [] }; },
        };
        const report = await verify(dir, reader);
        expect(report.passed).toBe(true);
        expect(calls.filter(c => c.tool === 'project_run')).toHaveLength(1);
        expect(calls.filter(c => c.tool === 'project_stop')).toHaveLength(0);
    });
});
