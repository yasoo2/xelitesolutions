/**
 * A CHANGE RUN ON PATH 1 OR PATH 3 PUTS NOTHING BACK (design v13.3 §7, §12.4; agent H).
 *
 * Today a verification snapshots the app's data files before the live start and writes them back after the walk. On the
 * owner's live app that put-back would erase whatever he saved meanwhile — and on path 1 (the walked origin holds none of
 * his data) and path 3 (the walk saved nothing) there is nothing of Joe's to put back. So the snapshot is still taken at
 * rest on every change run (v13.3 §7: the path chosen before the start can still change after it), and on paths 1 and 3
 * it is discarded unused: the owner's record written during the walk is still there afterwards. A new build is put back
 * exactly as today.
 *
 * A real verification (Joe's own project_run starts the app for real); the walk is a test walk, and what «writes during the
 * walk» is the owner, straight into his store file.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { BrowserQa } from '../core/engine/verify';
import { ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { labShape, DELIVERED_HISTORY } from './fixtures/live-app/live-app';
import { verifyHarness } from './fixtures/live-app/verify-harness';

jest.setTimeout(600_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-putback-h-'));
const workspace = path.join(tmp, 'projects');
fs.mkdirSync(workspace, { recursive: true });
const TOOL_CONTEXT = { sessionId: 'joe-putback-h-session', workspaceId: 'joe-putback-h', userId: 'joe-putback-h-user', runId: 'joe-putback-h-run' };

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-putback-h-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

const OWNER_RECORD = { id: 99, name: 'Owner Real Customer', email: 'owner.real@his-company.com' };

/** The walk: while it runs, the owner saves a record straight into his store file. */
function walkWhileOwnerWrites(store: string, watching: boolean): BrowserQa & { audits: any[] } {
    const audits: any[] = [];
    return {
        audits,
        async watcher() { return { sessionId: 'joe-putback-h-panel', watching }; },
        async audit(_dir, opts) {
            audits.push(opts);
            const s = JSON.parse(fs.readFileSync(store, 'utf8'));
            (s.customers = s.customers || []).push(OWNER_RECORD);
            fs.writeFileSync(store, JSON.stringify(s));
            const ran = opts.qaPin?.path || 'as-today';
            return { score: 100, findings: [], ...(ran === 'as-today' ? {} : { qaPath: { path: ran, reasons: [], comparable: true, blocked: 0, blockedHosts: [], notTried: [], streamed: false, signedIn: false } }) } as any;
        },
    };
}

function spyOnPutBack() {
    const leaves = require('../core/quality/qa-leaves-no-trace');
    return {
        snapshot: jest.spyOn(leaves, 'snapshotAppData'),
        restore: jest.spyOn(leaves, 'restoreAppData'),
        discard: jest.spyOn(leaves, 'discardSnapshot'),
    };
}

describe('12.4 row 1 — path 3: his record written during the walk is still there', () => {
    it('a server that can send (path 3): the snapshot is taken at rest and discarded, nothing is put back, and the server is never stopped for it', async () => {
        const shape = labShape(workspace, 'p3-customers', 'app9', 'dead', { dependencies: { nodemailer: '6.9.0' } });
        fs.mkdirSync(path.dirname(shape.store), { recursive: true });
        fs.writeFileSync(shape.store, JSON.stringify({ seq: 3, customers: [{ id: 1, name: 'Huda Salem', email: 'huda@client.example' }], other: [] }));
        const h = verifyHarness({ name: 'joe-putback-h-p3', request: 'Build a customer list: add customers', toolContext: TOOL_CONTEXT });
        const spy = spyOnPutBack();
        const qa = walkWhileOwnerWrites(shape.store, false);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(qa.audits).toHaveLength(1);
        expect(report.delivery.qaPath).toMatchObject({ path: 'no-write', walked: true });
        expect(JSON.parse(fs.readFileSync(shape.store, 'utf8')).customers).toContainEqual(OWNER_RECORD);
        expect(spy.snapshot).toHaveBeenCalledTimes(1);
        expect(spy.restore).not.toHaveBeenCalled();
        expect(spy.discard).toHaveBeenCalled();
        expect(h.calls.filter(c => c.tool === 'project_stop')).toHaveLength(0);
        expect(h.calls.filter(c => c.tool === 'project_run')).toHaveLength(1);
        expect(report.delivery.qaPath!.recovery).toBeUndefined();
    });
});

describe('12.4 row 1 — path 1: his record written during the walk is still there', () => {
    it('Joe\'s static preview of a delivered static site (path 1): nothing is put back', async () => {
        const dir = path.join(workspace, 'p1-static');
        fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Our customers</title></head><body><main><h1>Our customers</h1><ul id="list"></ul><script>fetch("data/store.json").then(r=>r.json()).then(s=>{document.getElementById("list").innerHTML=s.customers.map(c=>"<li>"+c.name+"</li>").join("")})</script></main></body></html>');
        const store = path.join(dir, 'data', 'store.json');
        fs.writeFileSync(store, JSON.stringify({ customers: [{ id: 1, name: 'Huda Salem' }] }));
        fs.writeFileSync(path.join(dir, '.joe', 'history.json'), DELIVERED_HISTORY);
        const h = verifyHarness({ name: 'joe-putback-h-p1', request: 'Build a page that lists our customers', toolContext: TOOL_CONTEXT });
        const spy = spyOnPutBack();
        const qa = walkWhileOwnerWrites(store, false);
        const report = await h.verify(dir, qa);
        await h.stop();
        expect(qa.audits).toHaveLength(1);
        expect(report.delivery.qaPath).toMatchObject({ path: 'private-live', walked: true });
        expect(JSON.parse(fs.readFileSync(store, 'utf8')).customers).toContainEqual(OWNER_RECORD);
        expect(spy.restore).not.toHaveBeenCalled();
        expect(h.calls.filter(c => c.tool === 'project_stop')).toHaveLength(0);
    });
});

describe('12.4 row 2 — a new build is put back as today', () => {
    it('no delivery record: the snapshot is taken, the walk\'s record is put back, and no word about paths is said', async () => {
        const shape = labShape(workspace, 'new-build', 'app9', 'dead', { delivered: false });
        fs.mkdirSync(path.dirname(shape.store), { recursive: true });
        const seed = JSON.stringify({ seq: 3, customers: [{ id: 1, name: 'Huda Salem', email: 'huda@client.example' }], other: [] });
        fs.writeFileSync(shape.store, seed);
        const h = verifyHarness({ name: 'joe-putback-h-new', request: 'Build a customer list: add customers', toolContext: TOOL_CONTEXT });
        const spy = spyOnPutBack();
        const qa = walkWhileOwnerWrites(shape.store, true);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(qa.audits).toHaveLength(1);
        expect(qa.audits[0].qaPin).toMatchObject({ path: 'as-today', record: '' });
        expect(report.delivery.qaPath).toBeUndefined();
        expect(spy.snapshot).toHaveBeenCalledTimes(1);
        expect(spy.restore).toHaveBeenCalled();
        expect(fs.readFileSync(shape.store, 'utf8')).toBe(seed);
        expect(report.delivery.log.join('\n')).not.toMatch(/qa path:/u);
    });
});
