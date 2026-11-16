/**
 * STEP 1 IS NEVER WORSE THAN TODAY FOR THE OWNER'S DATA (design v13.3 §12.6, review S10; agent H).
 *
 * The claim, exactly: fewer things may be tried (on path 3, and wherever the fence refuses), always told — and nothing
 * step 1 adds ever writes more into the owner's live app than today's verification did:
 *   - an unwatched 2T walk is skipped exactly as today (row 1);
 *   - a build that was never delivered stays a new build, whatever Joe's own folders say (row 2);
 *   - a path that turns 2T only once the server has started still has today's snapshot and put-back (row 3);
 *   - the fence starts wherever Joe runs (the esbuild bundle, ts-node, ts-jest), and when it cannot, the walk saves
 *     nothing and says so (row 5);
 *   - a request the fence refused is never charged (row 6);
 *   - the verify lock never strands a project (row 7), and the watcher never costs more than its interval says (row 8).
 */
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import type { BrowserQa } from '../core/engine/verify';
import { openQaDoor } from '../core/quality/app-audit';
import { improveUntilItStops, seedLoopQaPin } from '../core/quality/improve-loop';
import { hasDeliveryRecord, type QaPin } from '../core/quality/qa-target';
import { changeContextFor } from '../core/engine/run';
import { snapshotProject } from '../core/project/versions';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { labShape, writesOf, clearLog, send, sleep, serve, filesUnder, type LiveShape } from './fixtures/live-app/live-app';
import { realPanel, verifyHarness } from './fixtures/live-app/verify-harness';

jest.setTimeout(900_000);

const API = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-never-worse-h-'));
const workspace = path.join(tmp, 'projects');
const joeData = path.join(tmp, 'joe-data');
fs.mkdirSync(workspace, { recursive: true });
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = joeData;
const TOOL_CONTEXT = { sessionId: 'joe-never-worse-h-session', workspaceId: 'joe-never-worse-h', userId: 'joe-never-worse-h-user', runId: 'joe-never-worse-h-run' };

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-never-worse-h-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* a file a stopped server still held: the run root goes at teardown */ }
});

//  A request the test model reads as naming nothing more than the page (so the walk is reached; acceptance is not the subject).
const CUSTOMERS = 'Build a customer list: add customers';

async function seed(shape: LiveShape): Promise<void> {
    const run: any = await executionFirewall.runInContext('joe-never-worse-h-seed', () => new ProjectRunTool().execute({ cwd: shape.dir, restart: true }, TOOL_CONTEXT));
    expect({ ok: run?.ok, error: run?.error }).toEqual({ ok: true, error: undefined });
    await sleep(500);
    await executionFirewall.runInContext('joe-never-worse-h-seed-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT));
    await sleep(300);
}

/** A walk that saves what the QA's forms save, through the app, reporting its windows. */
function savingWalk(watching = true): BrowserQa & { audits: any[] } {
    const audits: any[] = [];
    return {
        audits,
        async watcher() { return { sessionId: 'joe-never-worse-h-panel', watching }; },
        async audit(_dir, opts) {
            audits.push(opts);
            const start = Date.now();
            await send(`${String(opts.serveUrl).replace(/\/$/u, '')}/api/customers`, 'POST', { name: `QA Tester ${audits.length}`, email: 'joe.qa+1@example.test' });
            const ran = opts.qaPin?.path || 'as-today';
            return { score: 100, findings: [], ...(ran === 'as-today' ? {} : { qaPath: { path: ran, reasons: [], comparable: true, windows: [{ start, end: Date.now(), long: false, what: 'POST' }], blocked: 0, blockedHosts: [], notTried: [], streamed: watching, signedIn: false } }) } as any;
        },
    };
}

describe('12.6 row 1 — a 2T change run with no panel watcher', () => {
    it('the verification skips the walk exactly as today: nothing reaches his live store', async () => {
        const hub = require('../modules/browser/wsHub');
        jest.spyOn(hub, 'panelWatcherCount').mockImplementation(() => 0);
        const shape = labShape(workspace, 'r1-unwatched', 'app9', 'native');
        await seed(shape);
        const before = fs.readFileSync(shape.store);
        clearLog(shape);
        const h = verifyHarness({ name: 'joe-never-worse-h-r1', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        const qa = realPanel('joe-never-worse-h-panel', false);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(qa.audits).toHaveLength(0);
        expect(report.checks.find(c => c.id === 'browser')?.detail).toMatch(/no one is watching it/u);
        expect(report.delivery.qaPath).toMatchObject({ path: '2t', walked: false });
        expect(writesOf(shape)).toEqual([]);
        expect(fs.readFileSync(shape.store).equals(before)).toBe(true);
    });

    it('and the door itself refuses an unwatched 2T walk that must be seen, before any page is opened', async () => {
        const hub = require('../modules/browser/wsHub');
        jest.spyOn(hub, 'panelWatcherCount').mockImplementation(() => 0);
        const shape = labShape(workspace, 'r1-door', 'app9', 'native');
        const run: any = await executionFirewall.runInContext('joe-never-worse-h-r1d', () => new ProjectRunTool().execute({ cwd: shape.dir, restart: true }, TOOL_CONTEXT));
        await sleep(400);
        const before = fs.readFileSync(shape.store);
        clearLog(shape);
        const pub = `${shape.dir}-pub`; fs.mkdirSync(pub, { recursive: true }); fs.writeFileSync(path.join(pub, 'index.html'), '<!doctype html><main><h1>app</h1></main>');
        const { auditBuiltApp } = require('../core/quality/app-audit');
        const a = await auditBuiltApp(pub, { serveUrl: String(run.output.url), watchSessionId: 'joe-never-worse-h-panel', requireVisibleBrowser: true, projectRoot: shape.dir, startKind: String(run.output.kind), streamTo: 'joe-never-worse-h-panel', timeoutMs: 30_000 });
        expect(a.skipped).toMatch(/browser eye required/u);
        expect(writesOf(shape)).toEqual([]);
        expect(fs.readFileSync(shape.store).equals(before)).toBe(true);
    });
});

describe('12.6 row 2 — what Joe\'s own folders do not make a delivery', () => {
    it('«كمّل» on an interrupted new build, after changeContextFor created .joe-versions/, stays as today', async () => {
        const dir = path.join(workspace, 'r2-resumed');
        fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>x</title>');
        fs.writeFileSync(path.join(dir, 'index.js'), "require('http').createServer((q, s) => s.end('ok')).listen(process.env.PORT || 3000);\n");
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'shop', private: true, scripts: { start: 'node index.js' } }, null, 2));
        fs.writeFileSync(path.join(dir, '.joe', 'result.json'), JSON.stringify({ status: 'failed' }));
        fs.writeFileSync(path.join(dir, '.joe', 'transcript.jsonl'), '{"role":"user","content":"ابن متجر"}\n');
        const change = changeContextFor(dir, 'كمّل');
        expect(fs.existsSync(path.join(dir, '.joe-versions'))).toBe(true);
        expect(change.snapshot).toBeTruthy();
        expect(hasDeliveryRecord(dir)).toBe('');
        const pin = await seedLoopQaPin({ projectRoot: dir, hasServeUrl: true });
        expect(pin).toMatchObject({ path: 'as-today', record: '' });
        const d = await openQaDoor(path.join(dir, 'dist'), { projectRoot: dir, serveUrl: 'http://127.0.0.1:59140/', qaPin: pin });
        try { expect(d).toMatchObject({ path: 'as-today', comparable: true, fence: null }); } finally { await d?.close(); }
    });

    it('a repair round on a never-delivered folder, after its snapshot(), keeps the loop comparable: no rollback from a path flip', async () => {
        const dir = path.join(workspace, 'r2-repair');
        fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>x</title>');
        fs.writeFileSync(path.join(dir, 'styles.css'), 'body { color: #333; }\n');
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>x</title><link rel="stylesheet" href="styles.css">');
        const pin: QaPin = await seedLoopQaPin({ projectRoot: dir, hasServeUrl: false });
        const measureByDoor = async () => {
            const d = await openQaDoor(path.join(dir, 'dist'), { projectRoot: dir, qaPin: pin });
            await d?.close();
            return { path: d?.path, comparable: d?.comparable };
        };
        expect(await measureByDoor()).toEqual({ path: 'as-today', comparable: true });
        const rollback = jest.fn(async () => true);
        const r = await improveUntilItStops({ score: 70, findingIds: ['small_targets'] }, {
            snapshot: label => String(snapshotProject(dir, label)?.id || ''),
            repair: async () => { fs.writeFileSync(path.join(dir, 'styles.css'), 'body { color: #222; } button { min-height: 44px; }\n'); return ['styles.css']; },
            rebuild: async () => true,
            measure: async () => {
                const m = await measureByDoor();
                expect(m).toEqual({ path: 'as-today', comparable: true });
                return { score: 90, findingIds: [] };
            },
            rollback,
            maxRounds: 1,
        });
        expect(fs.existsSync(path.join(dir, '.joe-versions'))).toBe(true);
        expect(r.rounds[0].notComparable).toBeUndefined();
        expect(r.rounds[0].rolledBack).toBe(false);
        expect(rollback).not.toHaveBeenCalled();
        expect(r.final.score).toBe(90);
    });
});

describe('12.6 row 3 — the path turns 2T only once the server started', () => {
    it('a static root before the start, a Node server in a subfolder after it: the snapshot was taken, and the put-back runs', async () => {
        const root = path.join(workspace, 'r3-split');
        const backend = path.join(root, 'backend');
        const shape = labShape(root, 'backend', 'app9', 'native', { delivered: false });
        fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(root, '.joe', 'history.json'), JSON.stringify([{ request: 'the first build', status: 'delivered', at: 1 }]));
        fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Customers</title></head><body><main><h1>Customers</h1></main></body></html>');
        await seed(shape);
        const snapshot = fs.readFileSync(shape.store);
        const leaves = require('../core/quality/qa-leaves-no-trace');
        const snap = jest.spyOn(leaves, 'snapshotAppData');
        const restore = jest.spyOn(leaves, 'restoreAppData');
        //  project_run, asked for the project, starts its Node server from the subfolder (as a nested project does).
        const h = verifyHarness({
            name: 'joe-never-worse-h-r3', request: CUSTOMERS, toolContext: TOOL_CONTEXT,
            around: async (tool, input, run) => tool === 'project_run'
                ? executionFirewall.runInContext('joe-never-worse-h-r3-run', () => new ProjectRunTool().execute({ ...input, cwd: backend }, TOOL_CONTEXT))
                : run(),
        });
        const report = await h.verify(root, savingWalk(true));
        await h.stop();
        const log = report.delivery.log.join('\n');
        expect(log).toMatch(/qa path: a change run \(history\); before the start: private-live/u);
        expect(log).toMatch(/qa path: after the start \(npm-start in backend\): 2t; the checks run 2t/u);
        expect(snap).toHaveBeenCalledWith(path.resolve(root));
        expect(restore).toHaveBeenCalled();
        expect(report.delivery.qaPath?.path).toBe('2t');
        expect(fs.readFileSync(shape.store).equals(snapshot)).toBe(true);
    });
});

describe('12.6 row 5 — the fence starts wherever Joe runs, and when it cannot, nothing is saved', () => {
    async function throughFence(startQaFence: (i: { allow: string[]; port?: number }) => Promise<any>) {
        const allowed = await serve((_q, res) => res.end('allowed'));
        const other = await serve((_q, res) => res.end('other'));
        try {
            const fence = await startQaFence({ allow: [allowed.url] });
            const viaProxy = (target: string) => new Promise<{ status: number; refused: string }>(resolve => {
                const u = new URL(fence.proxy.server);
                const req = require('http').request({ host: u.hostname, port: Number(u.port), method: 'POST', path: target, headers: { host: new URL(target).host } }, (res: any) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, refused: String(res.headers['x-joe-fence'] || '') })); });
                req.on('error', () => resolve({ status: 0, refused: '' }));
                req.end('x');
            });
            const a = await viaProxy(`${allowed.url}own`);
            const b = await viaProxy(`${other.url}steal`);
            await fence.close();
            return { a, b, allowedHits: allowed.hits.length, otherHits: other.hits.length };
        } finally { await allowed.close(); await other.close(); }
    }

    it('from the esbuild bundle (the inline worker loads no file beside it)', async () => {
        const out = path.join(tmp, 'bundle', 'fence.bundle.js');
        await require('esbuild').build({ entryPoints: [path.join(API, 'src', 'core', 'quality', 'qa-fence.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, packages: 'external', logLevel: 'silent' });
        expect(fs.readdirSync(path.dirname(out))).toEqual(['fence.bundle.js']);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const bundled = require(out);
        const r = await throughFence(bundled.startQaFence);
        expect(r.a.status).toBe(200);
        expect(r.b).toEqual({ status: 403, refused: 'refused' });
        expect(r.allowedHits).toBe(1);
        expect(r.otherHits).toBe(0);
    });

    it('under ts-jest (this suite) and under ts-node (Joe\'s dev start)', async () => {
        const r = await throughFence(require('../core/quality/qa-fence').startQaFence);
        expect([r.a.status, r.b.status, r.otherHits]).toEqual([200, 403, 0]);
        const script = path.join(tmp, 'fence-under-ts-node.js');
        fs.writeFileSync(script, `require(${JSON.stringify(path.join(API, 'src', 'core', 'quality', 'qa-fence.ts'))}).startQaFence({ allow: ['http://127.0.0.1:9'] }).then(async f => { console.log('FENCE-UP ' + f.proxy.server); await f.close(); process.exit(0); }, e => { console.log('FENCE-DOWN ' + e); process.exit(1); });\n`);
        const out: any = await executionFirewall.runInContext('joe-never-worse-h-tsnode', () => new ShellExecuteTool().execute({ command: `node -r ts-node/register/transpile-only "${script}"`, cwd: API, timeout: 120_000 }, TOOL_CONTEXT));
        expect(JSON.stringify(out)).toMatch(/FENCE-UP http:\/\/127\.0\.0\.1:\d+/);
    });

    it('a fence that cannot listen rejects; the verification then saves nothing in his app and says so', async () => {
        const blocker = net.createServer();
        await new Promise<void>(r => blocker.listen(0, '127.0.0.1', () => r()));
        const port = (blocker.address() as net.AddressInfo).port;
        await expect(require('../core/quality/qa-fence').startQaFence({ allow: [], port })).rejects.toBeTruthy();
        await new Promise<void>(r => blocker.close(() => r()));

        const fenceModule = require('../core/quality/qa-fence');
        jest.spyOn(fenceModule, 'startQaFence').mockRejectedValue(new Error('the fence could not listen'));
        const shape = labShape(workspace, 'r5-fence-down', 'app9', 'native');
        await seed(shape);
        const before = fs.readFileSync(shape.store);
        const h = verifyHarness({ name: 'joe-never-worse-h-r5', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        const qa = savingWalk(false);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(report.delivery.qaPath).toMatchObject({ path: 'no-write', fenceDown: true });
        expect(qa.audits[0].qaPin.path).toBe('no-write');
        //  The fake walk saved a record: the put-back that main did ran (review 7, B1), and «nothing saved» is never said.
        expect(fs.readFileSync(shape.store)).toEqual(before);
        expect(h.summaryOf(report)).toContain('Joe\'s network fence did not start, so the checks ran without pressing what saves in your app.');
        expect(h.summaryOf(report)).toMatch(/they were put back as they were before the checks/u);
        //  No lock left behind.
        expect(report.delivery.qaPath!.putBack).toEqual(['data/store.json']);
        expect(fs.existsSync(require('../core/quality/qa-leaves-no-trace').verifyLockFile('default', shape.dir))).toBe(false);
    });
});

describe('12.6 row 6 — a request the fence refused on 2T is never charged', () => {
    it('holes: its page posts to another local port (a stand-in for a mail service); refused, told, and its console error is not charged', async () => {
        const shape = labShape(workspace, 'r6-holes', 'app9', 'holes', { partner: true });
        const run: any = await executionFirewall.runInContext('joe-never-worse-h-r6', () => new ProjectRunTool().execute({ cwd: shape.dir, restart: true }, TOOL_CONTEXT));
        expect({ ok: run?.ok, error: run?.error }).toEqual({ ok: true, error: undefined });
        await sleep(400);
        clearLog(shape);
        const partnerPort = Number(new URL(String(run.output.url)).port) + 1;
        const pub = `${shape.dir}-pub`; fs.mkdirSync(pub, { recursive: true }); fs.writeFileSync(path.join(pub, 'index.html'), '<!doctype html><main><h1>app</h1></main>');
        const { auditBuiltApp } = require('../core/quality/app-audit');
        const a = await auditBuiltApp(pub, { serveUrl: String(run.output.url), request: CUSTOMERS, timeoutMs: 60_000, projectRoot: shape.dir, startKind: String(run.output.kind), qaPin: { record: hasDeliveryRecord(shape.dir) } });
        expect(a.qaPath?.path).toBe('2t');
        expect(a.qaPath.blocked).toBeGreaterThan(0);
        expect(a.qaPath.blockedHosts).toContain(`127.0.0.1:${partnerPort}`);
        const log = fs.existsSync(shape.log) ? fs.readFileSync(shape.log, 'utf8') : '';
        expect(log.split('\n').filter(l => /^X-ORIGIN (?!GET|OPTIONS)/.test(l))).toEqual([]);
        expect((a.findings || []).map((f: any) => f.id)).not.toContain('console_errors');
    });
});

describe('12.6 row 7 — the verify lock never strands a project', () => {
    const lockOf = (dir: string) => require('../core/quality/qa-leaves-no-trace').verifyLockFile('default', dir);
    const writeLock = (dir: string, info: Record<string, unknown>) => { const f = lockOf(dir); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(info)); };

    it('a lock left by a killed Joe (its pid is dead) and a lock older than 20 minutes are stale: taken over, and the run is 2T', async () => {
        for (const [name, info] of [
            ['r7-dead-pid', { pid: 2147480000, processStart: 1, runId: 'killed-joe', at: Date.now() }],
            ['r7-old', { pid: process.ppid || process.pid, processStart: 1, runId: 'an-old-run', at: Date.now() - 21 * 60_000 }],
        ] as const) {
            const shape = labShape(workspace, name, 'app9', 'native');
            await seed(shape);
            writeLock(shape.dir, info);
            const h = verifyHarness({ name: `joe-never-worse-h-${name}`, request: CUSTOMERS, toolContext: TOOL_CONTEXT });
            const report = await h.verify(shape.dir, savingWalk(true));
            await h.stop();
            expect({ name, path: report.delivery.qaPath?.path, busy: report.delivery.qaPath?.lockBusy }).toEqual({ name, path: '2t', busy: undefined });
            expect(fs.existsSync(lockOf(shape.dir))).toBe(false);
        }
    });

    it('a live lock held past the wait makes the run path 3, told; and a run that throws still releases its own lock', async () => {
        const leaves = require('../core/quality/qa-leaves-no-trace');
        const shape = labShape(workspace, 'r7-busy', 'app9', 'native');
        await seed(shape);
        const held = await leaves.acquireVerifyLock('default', shape.dir, 'another-verification', { waitMs: 0 });
        try {
            const h = verifyHarness({ name: 'joe-never-worse-h-r7b', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
            const report = await h.verify(shape.dir, savingWalk(true), { deadlineMs: 8_000 });
            await h.stop();
            expect(report.delivery.qaPath).toMatchObject({ path: 'no-write', lockBusy: true });
            //  The check that holds the lock puts back; this one puts nothing back, and says which file changed (B1).
            expect(h.summaryOf(report)).toContain('Another check of this app was still running, so this one ran without pressing what saves in your app, and put nothing back.');
            expect(h.summaryOf(report)).toMatch(/«data\/store\.json»; they were not put back, because another check of this app was running at the same time/u);
        } finally { await held.release(); }

        const thrower = labShape(workspace, 'r7-throws', 'app9', 'native');
        await seed(thrower);
        jest.spyOn(leaves, 'restoreAppData').mockRejectedValue(new Error('the disk said no'));
        const h = verifyHarness({ name: 'joe-never-worse-h-r7t', request: CUSTOMERS, toolContext: TOOL_CONTEXT });
        let lockDuring = false;
        const qa = savingWalk(true);
        const walk = qa.audit.bind(qa);
        qa.audit = async (d, o) => { lockDuring = fs.existsSync(lockOf(thrower.dir)); return walk(d, o); };
        await expect(h.verify(thrower.dir, qa)).rejects.toThrow(/the disk said no/u);
        await h.stop();
        expect(lockDuring).toBe(true);
        expect(fs.existsSync(lockOf(thrower.dir))).toBe(false);
    });
});

describe('12.6 row 8 — the watcher\'s interval scales with what it watches', () => {
    it('3, 200 and 2,000 data files poll every 50 ms, 250 ms and 1 s; a ninth watcher on one server runs at 1 s', async () => {
        const leaves = require('../core/quality/qa-leaves-no-trace');
        const delays: number[] = [];
        const realSetTimeout = global.setTimeout;
        jest.spyOn(global, 'setTimeout').mockImplementation(((fn: any, ms?: number, ...rest: any[]) => { if (ms === 50 || ms === 250 || ms === 1000) delays.push(ms); return realSetTimeout(fn, ms, ...rest); }) as any);
        const project = (name: string, n: number) => {
            const dir = path.join(tmp, 'watch', name);
            fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
            for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dir, 'data', `r${i}.json`), '{}');
            return dir;
        };
        const watchOne = async (dir: string) => {
            const snap = await leaves.snapshotAppData(dir);
            delays.length = 0;
            const w = leaves.watchAppData(snap, { into: leaves.recoveryRunDir('default', dir, `run-${path.basename(dir)}-${Date.now()}`), budget: leaves.RECOVERY_BUDGET });
            await sleep(1300);
            return { w, snap, first: delays[0] };
        };
        const results: Record<string, number> = {};
        for (const [name, n] of [['three', 3], ['two-hundred', 200], ['two-thousand', 2000]] as const) {
            const { w, snap, first } = await watchOne(project(name, n));
            results[name] = first;
            await w.stop();
            await leaves.discardSnapshot(snap);
        }
        expect(results).toEqual({ three: 50, 'two-hundred': 250, 'two-thousand': 1000 });
        //  Eight watchers at full rate, and a ninth on the same server.
        const held: any[] = [];
        for (let i = 0; i < 8; i++) held.push(await watchOne(project(`eight-${i}`, 3)));
        expect(held.map(h => h.first)).toEqual([50, 50, 50, 50, 50, 50, 50, 50]);
        //  The eight poll at 50 ms only; once a ninth starts, a 1 s poll appears (the ninth's).
        delays.length = 0;
        await sleep(600);
        expect(delays.filter(d => d === 1000)).toEqual([]);
        const ninth = await watchOne(project('ninth', 3));
        expect(delays).toContain(1000);
        for (const h of [...held, ninth]) { await h.w.stop(); await leaves.discardSnapshot(h.snap); }
        expect(filesUnder(path.join(joeData, 'qa-recovery')).filter(f => /run-(?:three|eight|ninth)/.test(f.rel) && !/run\.json$/.test(f.rel))).toEqual([]);
    });
});
