/**
 * A CHANGE RUN ON EVERY PATH PUTS BACK WHAT ITS CHECKS CHANGED — NEVER WORSE THAN MAIN (review 7, B1 + H3).
 *
 * The branch had stopped putting the owner's data back on paths 1 and 3 («the walk saved nothing»). Review 7 proved
 * the walk did save: a «Mark done» link, a shared worker, the project's own tests (H3) — and nothing put it back,
 * where main's put-back would have. The owner's law for this branch: a change run is never worse than main, and what
 * he is told is true. So on every path the snapshot is taken before any check that can write (the project's own
 * tests included), what changed is put back as main put it back, and he is told plainly which data files changed
 * and that they were put back. A record he wrote meanwhile is in the recovery copy, which the chat brings back
 * (project_data_recovery). A new build is put back exactly as today.
 *
 * A real verification (Joe's own project_run starts the app for real); the walk is a test walk, and what «writes
 * during the walk» is the owner, straight into his store file — or, for H3, the project's own test script.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { qaPathLines, listRecoveryVersions, type BrowserQa } from '../core/engine/verify';
import { recoveryVersionDir } from '../core/quality/qa-leaves-no-trace';
import { ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { labShape, DELIVERED_HISTORY } from './fixtures/live-app/live-app';
import { verifyHarness } from './fixtures/live-app/verify-harness';

jest.setTimeout(600_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-putback-r7-'));
const workspace = path.join(tmp, 'projects');
const joeData = path.join(tmp, 'joe-data');
fs.mkdirSync(workspace, { recursive: true });
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = joeData;
const TOOL_CONTEXT = { sessionId: 'joe-putback-r7-session', workspaceId: 'joe-putback-r7', userId: 'joe-putback-r7-user', runId: 'joe-putback-r7-run' };

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-putback-r7-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* Windows still holds a file: the temp folder is the OS's to clear */ }
});

const OWNER_RECORD = { id: 99, name: 'Owner Real Customer', email: 'owner.real@his-company.com' };
const SEED = JSON.stringify({ seq: 3, customers: [{ id: 1, name: 'Huda Salem', email: 'huda@client.example' }], other: [] });

/** The walk: while it runs, something saves a record straight into his store file (`write` false: nothing does). */
function walkWhile(store: string, watching: boolean, write = true): BrowserQa & { audits: any[] } {
    const audits: any[] = [];
    return {
        audits,
        async watcher() { return { sessionId: 'joe-putback-r7-panel', watching }; },
        async audit(_dir, opts) {
            audits.push(opts);
            if (write) {
                const s = JSON.parse(fs.readFileSync(store, 'utf8'));
                (s.customers = s.customers || []).push(OWNER_RECORD);
                fs.writeFileSync(store, JSON.stringify(s));
            }
            const ran = opts.qaPin?.path || 'as-today';
            return { score: 100, findings: [], ...(ran === 'as-today' ? {} : { qaPath: { path: ran, reasons: [], comparable: true, blocked: 0, blockedHosts: [], notTried: [], streamed: false, signedIn: false } }) } as any;
        },
    };
}

function spyOnPutBack() {
    const leaves = require('../core/quality/qa-leaves-no-trace');
    return { snapshot: jest.spyOn(leaves, 'snapshotAppData'), restore: jest.spyOn(leaves, 'restoreAppData') };
}

/** Every file of every kept version of this project, read back (what the chat would bring back). */
async function keptVersions(dir: string): Promise<string[]> {
    //  The verification keeps them under its run's workspace (the harness gives none: «default»).
    const runs = await listRecoveryVersions('default', dir);
    const out: string[] = [];
    for (const run of runs) for (const v of run.versions) for (const f of v.files) {
        out.push(fs.readFileSync(path.join(recoveryVersionDir('default', dir, run.runId, v.n), ...f.split('/')), 'utf8'));
    }
    return out;
}

describe('B1 — path 3: what changed during the walk is put back, kept, and told', () => {
    it('a server that can send (path 3): the store is the snapshot after the verdict, the record is in the recovery copy, and the owner is told which file changed', async () => {
        const shape = labShape(workspace, 'p3-customers', 'app9', 'dead', { dependencies: { nodemailer: '6.9.0' } });
        fs.mkdirSync(path.dirname(shape.store), { recursive: true });
        fs.writeFileSync(shape.store, SEED);
        const h = verifyHarness({ name: 'joe-putback-r7-p3', request: 'Build a customer list: add customers', toolContext: TOOL_CONTEXT });
        const spy = spyOnPutBack();
        const qa = walkWhile(shape.store, false);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(qa.audits).toHaveLength(1);
        expect(report.delivery.qaPath).toMatchObject({ path: 'no-write', walked: true, putBack: ['data/store.json'] });
        expect(spy.restore).toHaveBeenCalled();
        expect(JSON.parse(fs.readFileSync(shape.store, 'utf8')).customers).toEqual(JSON.parse(SEED).customers);
        //  Nothing is lost: the version with his record is among the copies the chat brings back.
        expect((await keptVersions(shape.dir)).some(t => t.includes(OWNER_RECORD.email))).toBe(true);
        expect(report.delivery.qaPath!.recovery?.versions).toBeGreaterThan(0);
        const told = qaPathLines(report.delivery.qaPath, 'en').join('\n');
        expect(told).toMatch(/these data files of your app changed: «data\/store\.json»; they were put back as they were before the checks/u);
        expect(told).not.toMatch(/without saving anything in it/u);
        expect(told).toMatch(/ask Joe in the chat/u);
        expect(qaPathLines(report.delivery.qaPath, 'ar').join('\n')).toMatch(/وأُعيدت كما كانت قبل الفحوص/u);
    });

    it('H3 — the project\'s own tests write his store and no walk runs: it is put back all the same', async () => {
        const shape = labShape(workspace, 'p3-tests', 'app9', 'dead', {
            dependencies: { nodemailer: '6.9.0' },
            files: {
                'owner-test.js': "const fs = require('fs'); const p = require('path').join(__dirname, 'data', 'store.json'); const s = JSON.parse(fs.readFileSync(p, 'utf8')); s.customers.push({ id: 77, name: 'Fixture Row From The Tests' }); fs.writeFileSync(p, JSON.stringify(s)); console.log('ok 1 - adds a row'); console.log('1..1'); console.log('# tests 1'); console.log('# pass 1'); console.log('# fail 0');\n",
            },
        });
        const manifest = JSON.parse(fs.readFileSync(path.join(shape.dir, 'package.json'), 'utf8'));
        manifest.scripts.test = 'node owner-test.js';
        fs.writeFileSync(path.join(shape.dir, 'package.json'), JSON.stringify(manifest, null, 2));
        fs.mkdirSync(path.dirname(shape.store), { recursive: true });
        fs.writeFileSync(shape.store, SEED);
        const h = verifyHarness({ name: 'joe-putback-r7-tests', request: 'Build a customer list: add customers', toolContext: TOOL_CONTEXT });
        const qa = walkWhile(shape.store, false, false);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(h.calls.some(c => c.tool === 'quality_run' || c.tool === 'shell_execute')).toBe(true);
        expect(fs.readFileSync(shape.store, 'utf8')).not.toMatch(/Fixture Row From The Tests/u);
        expect(JSON.parse(fs.readFileSync(shape.store, 'utf8')).customers).toEqual(JSON.parse(SEED).customers);
        expect(report.delivery.qaPath?.putBack).toEqual(['data/store.json']);
    });
});

describe('B1 — path 1: what changed is put back too', () => {
    it('Joe\'s static preview of a delivered static site (path 1): the store is put back and told', async () => {
        const dir = path.join(workspace, 'p1-static');
        fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Our customers</title></head><body><main><h1>Our customers</h1><ul id="list"></ul><script>fetch("data/store.json").then(r=>r.json()).then(s=>{document.getElementById("list").innerHTML=s.customers.map(c=>"<li>"+c.name+"</li>").join("")})</script></main></body></html>');
        const store = path.join(dir, 'data', 'store.json');
        const seed = JSON.stringify({ customers: [{ id: 1, name: 'Huda Salem' }] });
        fs.writeFileSync(store, seed);
        fs.writeFileSync(path.join(dir, '.joe', 'history.json'), DELIVERED_HISTORY);
        const h = verifyHarness({ name: 'joe-putback-r7-p1', request: 'Build a page that lists our customers', toolContext: TOOL_CONTEXT });
        const qa = walkWhile(store, false);
        const report = await h.verify(dir, qa);
        await h.stop();
        expect(qa.audits).toHaveLength(1);
        expect(report.delivery.qaPath).toMatchObject({ path: 'private-live', walked: true, putBack: ['data/store.json'] });
        expect(fs.readFileSync(store, 'utf8')).toBe(seed);
        expect((await keptVersions(dir)).some(t => t.includes(OWNER_RECORD.email))).toBe(true);
    });
});

describe('a new build is put back as today', () => {
    it('no delivery record: the snapshot is taken, the walk\'s record is put back, and no word about paths is said', async () => {
        const shape = labShape(workspace, 'new-build', 'app9', 'dead', { delivered: false });
        fs.mkdirSync(path.dirname(shape.store), { recursive: true });
        fs.writeFileSync(shape.store, SEED);
        const h = verifyHarness({ name: 'joe-putback-r7-new', request: 'Build a customer list: add customers', toolContext: TOOL_CONTEXT });
        const spy = spyOnPutBack();
        const qa = walkWhile(shape.store, true);
        const report = await h.verify(shape.dir, qa);
        await h.stop();
        expect(qa.audits).toHaveLength(1);
        expect(qa.audits[0].qaPin).toMatchObject({ path: 'as-today', record: '' });
        expect(report.delivery.qaPath).toBeUndefined();
        expect(spy.snapshot).toHaveBeenCalledTimes(1);
        expect(spy.restore).toHaveBeenCalled();
        expect(fs.readFileSync(shape.store, 'utf8')).toBe(SEED);
        expect(report.delivery.log.join('\n')).not.toMatch(/qa path:/u);
    });
});
