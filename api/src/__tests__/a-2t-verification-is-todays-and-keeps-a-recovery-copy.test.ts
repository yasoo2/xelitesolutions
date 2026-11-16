/**
 * A 2T VERIFICATION IS TODAY'S, AND KEEPS A RECOVERY COPY OUTSIDE THE PROJECT (design v13.3 §5b, §12.5; agent H).
 *
 * 2T is a delivered Node server whose data today's put-back covers and that §3b's router finds no clear harm in. It is
 * verified exactly as today — today's walk, today's snapshot, today's whole-file put-back — with the browser behind the
 * fence, and with one addition: from the snapshot to the end of the put-back, every version of every data file Joe sees
 * change is copied into Joe's own data folder (`<JOE_DATA_DIR>/qa-recovery/…`), never into the project, before anything
 * is put back. A change outside every one of the verification's own windows is told: it did not come from the checks.
 *
 * Real verifications: Joe's own project_run / project_stop start and stop the lab's shapes for real; the walk is the real
 * `auditBuiltApp` (row 1) or a test walk that writes what the QA's forms write (the other rows, so the moments are exact).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openQaDoor } from '../core/quality/app-audit';
import type { BrowserQa, DeliveryVerification } from '../core/engine/verify';
import { hasDeliveryRecord } from '../core/quality/qa-target';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { filesUnder, labShape, send, serve, sleep, type LiveShape } from './fixtures/live-app/live-app';
import { realPanel, verifyHarness } from './fixtures/live-app/verify-harness';

jest.setTimeout(900_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-2t-h-'));
const workspace = path.join(tmp, 'projects');
const joeData = path.join(tmp, 'joe-data');
fs.mkdirSync(workspace, { recursive: true });
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = joeData;
const recoveryHome = path.join(joeData, 'qa-recovery');
const ctxOf = (n: string) => ({ sessionId: `joe-2t-h-${n}`, workspaceId: 'joe-2t-h', userId: 'joe-2t-h-user', runId: `joe-2t-h-${n}-run` });
const TOOL_CONTEXT = ctxOf('main');
const TODAY_CONTEXT = ctxOf('today');

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    for (const c of [TOOL_CONTEXT, TODAY_CONTEXT]) await executionFirewall.runInContext('joe-2t-h-stop', () => new ProjectStopTool().execute({}, c)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* a file a stopped server still held: the run root goes at teardown */ }
});

//  A request the test model reads as naming nothing more than the page (so the walk is reached; acceptance is not the subject).
const CUSTOMERS = 'Build a customer list: add customers';
/** app8 keeps its store only once something is saved: it starts from its own empty one. */
const EMPTY_STORE: Record<string, Record<string, string> | undefined> = { app8: { 'data/users.json': JSON.stringify({ users: [], rows: [] }) } };
/** The page the verification's Browser QA opens (its audit folder needs an index.html; the walk itself opens the live address). */
const PAGE = { 'public/index.html': '<!doctype html><main><h1>app</h1></main>' };

/** Starts the shape once and stops it, so the store holds the owner's seeded records before anything is measured. */
async function seed(shape: LiveShape, ctx = TOOL_CONTEXT): Promise<void> {
    const run: any = await executionFirewall.runInContext('joe-2t-h-seed', () => new ProjectRunTool().execute({ cwd: shape.dir, restart: true }, ctx));
    expect({ ok: run?.ok, error: run?.error }).toEqual({ ok: true, error: undefined });
    await sleep(500);
    await executionFirewall.runInContext('joe-2t-h-seed-stop', () => new ProjectStopTool().execute({}, ctx));
    await sleep(300);
    expect(fs.existsSync(shape.store)).toBe(true);
}

/** Every file under the recovery folder for one project, and the run folders. */
function recoveryOf(): Array<{ rel: string; abs: string; bytes: Buffer }> { return filesUnder(recoveryHome); }

interface FakeWalkOptions {
    /** What the QA's forms save, as the walk would (a POST to the app), with the windows the walk reports. */
    qaWrites?: number;
    /** The owner saves a record straight to his app this long after the walk's last request (outside its windows). */
    ownerAfterMs?: number;
    ownerName?: string;
    /** A long-lived connection (an SSE stream) the walk reports as one long window over its whole span. */
    longWindow?: boolean;
    qaBody?: (i: number) => Record<string, string>;
}
/** A test walk that writes what the QA's forms write, through the app itself, and reports its windows like the fence does. */
function fakeWalk(o: FakeWalkOptions): BrowserQa & { audits: any[] } {
    const audits: any[] = [];
    return {
        audits,
        async watcher() { return { sessionId: 'joe-2t-h-panel', watching: true }; },
        async audit(_dir, opts) {
            audits.push(opts);
            const base = String(opts.serveUrl).replace(/\/$/u, '');
            const windows: Array<{ start: number; end: number; long: boolean; what: string }> = [];
            const t0 = Date.now();
            for (let i = 0; i < (o.qaWrites ?? 1); i++) {
                const start = Date.now();
                await send(`${base}/api/customers`, 'POST', o.qaBody ? o.qaBody(i) : { name: `QA Tester ${audits.length}-${i}`, email: `joe.qa+${i}@example.test` });
                windows.push({ start, end: Date.now(), long: false, what: 'POST /api/customers' });
            }
            if (o.ownerAfterMs !== undefined) {
                await sleep(o.ownerAfterMs);
                await send(`${base}/api/customers`, 'POST', { name: o.ownerName || 'Owner Real Customer', email: 'owner.real@his-company.com' });
                await sleep(1300);
            }
            if (o.longWindow) windows.push({ start: t0, end: Date.now(), long: true, what: 'GET /events' });
            const ran = opts.qaPin?.path || 'as-today';
            return { score: 100, findings: [], qaPath: { path: ran, reasons: [], comparable: true, windows, blocked: 0, blockedHosts: [], notTried: [], streamed: true, signedIn: false } } as any;
        },
    };
}

/** Whether some recovery copy holds the text (a JSON store), or a row with that name (a SQLite store). */
function inSomeVersion(text: string): boolean {
    const files = recoveryOf();
    if (files.some(f => !/\.db$/i.test(f.rel) && f.bytes.toString('utf8').includes(text))) return true;
    const { DatabaseSync } = require('node:sqlite');
    for (const f of files.filter(x => /\.db$/i.test(x.rel))) {
        try { const d = new DatabaseSync(f.abs, { readOnly: true }); const n = d.prepare('SELECT COUNT(*) n FROM customers WHERE name = ?').get(text).n; d.close(); if (n) return true; } catch { /* not a store */ }
    }
    return false;
}

describe('12.5 row 1 — each 2T shape, nobody else writing: today\'s verification, put back as today, told', () => {
    //  Two shapes whose walk really saves into his store (a visit counter on every load; Remove links), so a put-back runs.
    for (const [name, app, flags, request] of [['visit', 'app9', 'visit', CUSTOMERS], ['getdel', 'app9', 'getdel', CUSTOMERS]] as const) {
        it(`${name}: the store after the verdict is the snapshot, the findings are today's, and checkedAsBefore + recoverySaved are told`, async () => {
            const hub = require('../modules/browser/wsHub');
            const SID = `joe-2t-h-panel-${name}`;
            jest.spyOn(hub, 'panelWatcherCount').mockImplementation((...args: unknown[]) => (args[0] === SID ? 1 : 0));
            jest.spyOn(hub, 'broadcastBrowserEvent').mockImplementation(() => undefined);
            const shape = labShape(workspace, `r1-${name}`, app, flags, { files: { ...PAGE, ...EMPTY_STORE[app] } });
            const today = labShape(workspace, `r1-${name}-today`, app, flags, { delivered: false, files: { ...PAGE, ...EMPTY_STORE[app] } });
            await seed(shape);
            await seed(today, TODAY_CONTEXT);
            const snapshot = fs.readFileSync(shape.store);
            const todayBefore = fs.readFileSync(today.store);
            //  Today, on an identical copy right after: today's walk (no door option at all) + today's put-back.
            //  (One after the other: project_run gives both copies the same port; the lab's same-moment pairs are in out-real13.md.)
            const leaves = require('../core/quality/qa-leaves-no-trace');
            const todaySide = async () => {
                const snap = await leaves.snapshotAppData(today.dir);
                const run: any = await executionFirewall.runInContext('joe-2t-h-today', () => new ProjectRunTool().execute({ cwd: today.dir, restart: true }, TODAY_CONTEXT));
                const pub = `${today.dir}-pub`; fs.mkdirSync(pub, { recursive: true }); fs.writeFileSync(path.join(pub, 'index.html'), '<!doctype html><main><h1>app</h1></main>');
                const a = await require('../core/quality/app-audit').auditBuiltApp(pub, { serveUrl: String(run.output.url), request, timeoutMs: 45_000, requireAuthenticatedCoverage: true });
                await executionFirewall.runInContext('joe-2t-h-today-stop', () => new ProjectStopTool().execute({}, TODAY_CONTEXT));
                await leaves.restoreAppData(snap, []);
                await leaves.discardSnapshot(snap);
                return a;
            };
            const h = verifyHarness({ name: `joe-2t-h-r1-${name}`, request, toolContext: TOOL_CONTEXT });
            const qa = realPanel(SID);
            const report = await h.verify(shape.dir, qa);
            await h.stop();
            const todayAudit = await todaySide();
            expect(qa.audits.length).toBeGreaterThanOrEqual(1);
            const walk = qa.results[0];
            expect(walk.qaPath?.path).toBe('2t');
            expect(report.delivery.qaPath?.path).toBe('2t');
            //  Put back as today: byte for byte the snapshot (and the same as today's own put-back left its copy).
            expect(fs.readFileSync(shape.store).equals(snapshot)).toBe(true);
            expect(fs.readFileSync(today.store).equals(todayBefore)).toBe(true);
            //  The findings are today's.
            const ids = (a: any) => (a.findings || []).map((f: any) => `${f.id}/${f.severity}`).sort();
            expect(ids(walk)).toEqual(ids(todayAudit));
            //  The QA's records were really written on his live app during the walk, and copied before the put-back.
            expect(report.delivery.qaPath!.recovery?.versions).toBeGreaterThan(0);
            const summary = h.summaryOf(report, request);
            expect(summary).toContain('Joe\'s checks ran on your app the way they always have, trying its forms and buttons; afterwards your app\'s data files were put back as before.');
            //  Review 7, B3: what pruning really keeps, and the chat that brings a copy back.
            expect(summary).toContain('Joe kept your app\'s data files as they were before each put-back, outside your project, for 14 days — unless the space Joe sets aside for these copies fills up first, when the oldest go first. To bring one back, ask Joe in the chat.');
            //  The copies are Joe's, outside the project.
            expect(filesUnder(shape.dir).some(f => /qa-recovery/.test(f.rel))).toBe(false);
        });
    }
});

describe('12.5 row 2 — the owner writes at three moments: during the start, during the walk, after it', () => {
    it('each of his records is in a version outside the project; his live store is put back as today; only the write outside every window is told', async () => {
        const shape = labShape(workspace, 'r2-owner', 'app9', '-');
        await seed(shape);
        const snapshot = fs.readFileSync(shape.store);
        let started = 0; let stopped = 0;
        const h = verifyHarness({
            name: 'joe-2t-h-r2', request: CUSTOMERS, toolContext: TOOL_CONTEXT,
            around: async (tool, input, run) => {
                if (tool === 'project_stop' && stopped++ === 0) {
                    //  After the walk, before the put-back: the server is being stopped for it.
                    const live = String((h.calls.find(c => c.tool === 'project_run')?.result as any)?.output?.url || '').replace(/\/$/u, '');
                    await send(`${live}/api/customers`, 'POST', { name: 'Owner After The Walk', email: 'owner.after@his-company.com' });
                }
                const r = await run();
                if (tool === 'project_run' && started++ === 0) {
                    //  During the start: the server has just come up.
                    await send(`${String(r?.output?.url || '').replace(/\/$/u, '')}/api/customers`, 'POST', { name: 'Owner During The Start', email: 'owner.start@his-company.com' });
                }
                return r;
            },
        });
        const report = await h.verify(shape.dir, fakeWalk({ qaWrites: 1, ownerAfterMs: 1600, ownerName: 'Owner During The Walk' }));
        await h.stop();
        const q = report.delivery.qaPath!;
        expect(q.path).toBe('2t');
        for (const name of ['Owner During The Start', 'Owner During The Walk', 'Owner After The Walk']) expect({ name, kept: inSomeVersion(name) }).toEqual({ name, kept: true });
        //  As today: his live store is the snapshot again (the put-back overwrote his writes — the risk 2T keeps).
        expect(fs.readFileSync(shape.store).equals(snapshot)).toBe(true);
        //  The write during the walk, outside its windows, is told; the start's and the stop's are inside windows.
        expect(q.recovery?.unexplained).toEqual(['data/store.json']);
        //  Review 7, M2: told as a change at a moment no request of the checks could save — «may not have come from the checks».
        expect(h.summaryOf(report)).toContain('While the checks ran, «data/store.json» also changed at a moment when none of the checks\' requests could save anything, so the change may not have come from the checks; then it was put back.');
        expect(filesUnder(shape.dir).some(f => f.bytes.toString('utf8').includes('Owner During The Walk'))).toBe(false);
    });
});

describe('12.5 row 3 — a SQLite store in WAL mode', () => {
    it('the owner writes after the walk: every copied version opens on its own and the last holds his row', async () => {
        const shape = labShape(workspace, 'r3-sqlite', 'app14', 'sqlite');
        await seed(shape);
        const before = new Set(recoveryOf().map(f => f.abs));
        const h = verifyHarness({ name: 'joe-2t-h-r3', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        const report = await h.verify(shape.dir, fakeWalk({ qaWrites: 1, ownerAfterMs: 1600, ownerName: 'Owner Sqlite Row' }));
        await h.stop();
        expect(report.delivery.qaPath?.path).toBe('2t');
        const dbs = recoveryOf().filter(f => !before.has(f.abs) && /\.db$/i.test(f.rel));
        expect(dbs.length).toBeGreaterThan(0);
        //  One file per version (backup(), out of WAL): no -wal or -shm beside a copy.
        expect(recoveryOf().filter(f => !before.has(f.abs) && /-(?:wal|shm)$/i.test(f.rel))).toEqual([]);
        const { DatabaseSync } = require('node:sqlite');
        const names: string[][] = [];
        for (const f of dbs.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }))) {
            const d = new DatabaseSync(f.abs, { readOnly: true });
            names.push(d.prepare('SELECT name FROM customers ORDER BY id').all().map((r: any) => r.name));
            d.close();
        }
        //  Every version opened on its own (above); one taken before the put-back holds his row (later ones may be the restored file).
        expect(names.some(n => n.includes('Owner Sqlite Row'))).toBe(true);
        expect(inSomeVersion('Owner Sqlite Row')).toBe(true);
    });

    it('with nobody else writing, the stop-time checkpoint is the app\'s own: nothing is told', async () => {
        const shape = labShape(workspace, 'r3-sqlite-quiet', 'app14', 'sqlite');
        await seed(shape);
        const h = verifyHarness({ name: 'joe-2t-h-r3q', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        const report = await h.verify(shape.dir, fakeWalk({ qaWrites: 2 }));
        await h.stop();
        expect(report.delivery.qaPath?.path).toBe('2t');
        expect(report.delivery.qaPath?.recovery?.unexplained).toEqual([]);
    });
});

describe('12.5 rows 4–5 — what the windows say', () => {
    it('an SSE stream open over the whole walk counts only for its first second: the owner\'s write mid-walk is told', async () => {
        const shape = labShape(workspace, 'r4-sse', 'app14', 'sse');
        await seed(shape);
        const h = verifyHarness({ name: 'joe-2t-h-r4', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        const report = await h.verify(shape.dir, fakeWalk({ qaWrites: 1, ownerAfterMs: 1600, ownerName: 'Owner Mid Walk', longWindow: true }));
        await h.stop();
        expect(report.delivery.qaPath?.recovery?.unexplained).toEqual(['data/store.json']);
        expect(inSomeVersion('Owner Mid Walk')).toBe(true);
    });

    it('a debounced save (the app writes 2 s after it answers) is told as unexplained — and the line only says it did not come from the checks', async () => {
        const shape = labShape(workspace, 'r5-debounce', 'app14', 'debounce');
        await seed(shape);
        const h = verifyHarness({ name: 'joe-2t-h-r5', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        //  The walk's own save; the app writes it 2 s later, outside the walk's window and its grace.
        const qa = fakeWalk({ qaWrites: 1 });
        const audit = qa.audit.bind(qa);
        qa.audit = async (d, o) => { const a = await audit(d, o); await sleep(3500); return a; };
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(report.delivery.qaPath?.recovery?.unexplained).toEqual(['data/store.json']);
        const summary = h.summaryOf(report);
        expect(summary).toContain('so the change may not have come from the checks');
    });
});

describe('12.5 row 6 — over the per-project cap', () => {
    it('only the newest pre-put-back version of each file is kept, and recoveryOverBudget is told', async () => {
        const leaves = require('../core/quality/qa-leaves-no-trace');
        const real = leaves.watchAppData;
        //  The cap scaled down (512 MB → 6 KB) so the test writes kilobytes, not half a gigabyte.
        jest.spyOn(leaves, 'watchAppData').mockImplementation((...args: unknown[]) => real(args[0], { ...(args[1] as any), budget: { ...(args[1] as any).budget, projectBytes: 6 * 1024 } }));
        const shape = labShape(workspace, 'r6-budget', 'app9', '-');
        await seed(shape);
        const h = verifyHarness({ name: 'joe-2t-h-r6', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        const big = 'x'.repeat(2500);
        const qa = fakeWalk({ qaWrites: 6, qaBody: i => ({ name: `QA Tester ${i} ${big}`, email: `joe.qa+${i}@example.test` }) });
        const slow = qa.audit.bind(qa);
        //  Each save lands in its own poll (versions pile up past the cap).
        qa.audit = async (d, o) => slow(d, o);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        const r = report.delivery.qaPath!.recovery!;
        expect(r.overBudget).toBe(true);
        expect(h.summaryOf(report)).toContain('Joe kept only the last version of each data file before it was put back; the data was larger than Joe keeps in full.');
        const runDir = path.join(leaves.recoveryRunDir('default', shape.dir, r.runId));
        const kept = filesUnder(runDir).filter(f => /data\/store\.json$/.test(f.rel));
        expect(kept).toHaveLength(1);
        //  …and it is the newest: it holds the walk's last save.
        expect(kept[0].bytes.toString('utf8')).toContain('QA Tester 5');
    });
});

describe('12.5 rows 7–8 — the router is best-effort', () => {
    const app = (name: string, files: Record<string, string>, pkg: Record<string, unknown> = {}) => {
        const dir = path.join(workspace, `router-${name}`);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>x</title>');
        fs.writeFileSync(path.join(dir, '.joe', 'delivered'), '');
        fs.writeFileSync(path.join(dir, 'data', 'store.json'), '[]');
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, private: true, scripts: { start: 'node server.js' }, ...pkg }, null, 2));
        for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); }
        return dir;
    };
    const SERVER = (extra = '') => `const http = require('http');\nconst fs = require('fs');\nconst path = require('path');\n${extra}\nconst file = path.join(__dirname, 'data', 'store.json');\nhttp.createServer((q, s) => { if (q.method === 'POST') fs.writeFileSync(file, '[1]'); s.end('ok'); }).listen(process.env.PORT || 3000);\n`;
    const choose = async (dir: string) => {
        const d = await openQaDoor(path.join(dir, 'dist'), { projectRoot: dir, serveUrl: 'http://127.0.0.1:59133/', startKind: 'npm-start' });
        await d?.close();
        return { path: d?.path, key: d?.choice.reasons[0]?.key };
    };

    it('nodemailer, an outside fetch in server code, require(\'net\'), a key-shaped .env, os.homedir() and a link each take path 3 with their key', async () => {
        expect(await choose(app('plain', { 'server.js': SERVER() }))).toEqual({ path: '2t', key: undefined });
        expect(await choose(app('nodemailer', { 'server.js': SERVER() }, { dependencies: { nodemailer: '6.9.0' } }))).toEqual({ path: 'no-write', key: 'sender' });
        expect(await choose(app('fetch', { 'server.js': SERVER("fetch('https://hooks.example.test/order', { method: 'POST' }).catch(() => {});") }))).toEqual({ path: 'no-write', key: 'sender' });
        expect(await choose(app('net', { 'server.js': SERVER("const net = require('net'); void net;") }))).toEqual({ path: 'no-write', key: 'sender' });
        //  Written at test time, never committed (§10).
        expect(await choose(app('env', { 'server.js': SERVER("require('dotenv').config();"), '.env': 'PORT=3000\nSMTP_PASS=x\n' }))).toEqual({ path: 'no-write', key: 'envName' });
        expect(await choose(app('homedir', { 'server.js': SERVER("const os = require('os');\nfs.writeFileSync(path.join(os.homedir(), 'shop-notes.txt'), '');") }))).toEqual({ path: 'no-write', key: 'outsidePath' });
        const linked = app('link', { 'server.js': SERVER() });
        const elsewhere = fs.mkdtempSync(path.join(tmp, 'elsewhere-'));
        fs.symlinkSync(elsewhere, path.join(linked, 'shared'), 'junction');
        expect(await choose(linked)).toEqual({ path: 'no-write', key: 'link' });
    });

    it('t3-fetch-alias (the attack\'s slip-through: fetch under another name) takes 2T and is walked as today — its own outbound call goes out, as today', async () => {
        const outside = await serve((_q, res) => res.end('ok'));
        try {
            const dir = app('t3-fetch-alias', {
                'server.js': `const http=require('http');const send = globalThis.fetch;\nhttp.createServer((q,s)=>{ if(q.method==='POST'){ send('${outside.url}sendMessage?chat_id=1&text=order').catch(()=>{}); s.end('ok'); return;} s.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Order</title></head><body><main><h1>Order</h1><form method=post><button>Order</button></form></main></body></html>'); }).listen(process.env.PORT||3000);\n`,
            });
            expect(await choose(dir)).toEqual({ path: '2t', key: undefined });
            expect(hasDeliveryRecord(dir)).toBe('delivered');
            const h = verifyHarness({ name: 'joe-2t-h-r8', request: 'Build an order page', toolContext: TOOL_CONTEXT });
            const qa: BrowserQa & { audits: any[] } = {
                audits: [],
                async watcher() { return { sessionId: 'joe-2t-h-panel', watching: true }; },
                async audit(_d, o) { qa.audits.push(o); await send(String(o.serveUrl), 'POST', 'order'); await sleep(500); return { score: 100, findings: [], qaPath: { path: o.qaPin?.path, reasons: [], comparable: true, windows: [], blocked: 0, blockedHosts: [], notTried: [], streamed: true, signedIn: false } } as any; },
            };
            const report = await h.verify(dir, qa);
            await h.stop();
            expect(qa.audits[0].qaPin.path).toBe('2t');
            expect(report.delivery.qaPath?.path).toBe('2t');
            //  The fence covers the browser only: the server's own call went out, as it does today (§3b, §14 risk 8).
            expect(outside.hits.some(x => /sendMessage/.test(x.url))).toBe(true);
        } finally { await outside.close(); }
    });
});

describe('12.5 row 9 — the project\'s own tests', () => {
    it('its test command writes the store during the verification: inside a window, so never told as unexplained', async () => {
        const shape = labShape(workspace, 'r9-own-tests', 'app9', '-', {
            files: {
                'test/store.test.js': "const test = require('node:test');\nconst fs = require('fs');\nconst path = require('path');\ntest('the store can be written', () => {\n  const file = path.join(__dirname, '..', 'data', 'store.json');\n  const s = JSON.parse(fs.readFileSync(file, 'utf8'));\n  s.other = (s.other || []).concat(['written by the project\\'s own test']);\n  fs.writeFileSync(file, JSON.stringify(s));\n});\n",
            },
        });
        const pkg = JSON.parse(fs.readFileSync(path.join(shape.dir, 'package.json'), 'utf8'));
        pkg.scripts.test = 'node --test';
        fs.writeFileSync(path.join(shape.dir, 'package.json'), JSON.stringify(pkg, null, 2));
        await seed(shape);
        const snapshot = fs.readFileSync(shape.store);
        const h = verifyHarness({ name: 'joe-2t-h-r9', request: 'Build a customer list with its own API server: add customers', toolContext: TOOL_CONTEXT });
        const report: DeliveryVerification = await h.verify(shape.dir, fakeWalk({ qaWrites: 1 }));
        await h.stop();
        const log = report.delivery.log.join('\n');
        expect(log).toMatch(/the project's own tests (?:passed|failed)/);
        expect(inSomeVersion('written by the project\'s own test')).toBe(true);
        expect(report.delivery.qaPath?.recovery?.unexplained).toEqual([]);
        expect(fs.readFileSync(shape.store).equals(snapshot)).toBe(true);
    });
});
