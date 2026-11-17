/**
 * THE RECOVERY COPY IS OUT OF REACH (design v13.3 §5b steps 2–3, §12.6 rows 4, 9, 10; review S10; agent H).
 *
 * A 2T verification copies every version of the owner's data files it sees change into Joe's own data folder,
 * `<JOE_DATA_DIR>/qa-recovery/<workspaceId>/<projectKey>/<runId>/<n>/…` — beside the workspaces, never inside a project.
 * Nothing that acts on a project can therefore carry his records anywhere: not the model's file tools (by place and by
 * name, links included), not a Pages publish of a static root, not a project zip or export, not `git add -A` in a
 * repository above the project, not a static server of the project. Joe's own code brings a version back when he asks,
 * and says only which files and how large. The copies do not pile up: old runs, a sixth run and a server over its cap
 * are pruned at boot, when a watcher starts, and every hour.
 */
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import AdmZip from 'adm-zip';
import { listRecoveryVersions, restoreRecoveryVersion } from '../core/engine/verify';
import { archiveProject } from '../core/transfer/project-archive';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';
import { filesUnder, sleep } from './fixtures/live-app/live-app';

jest.setTimeout(300_000);

const OWNER_RECORD = 'Owner Real Customer 7f3a-only-in-the-copy';
let fx: FileToolsFixture;
let leaves: typeof import('../core/quality/qa-leaves-no-trace');
const savedDataDir = process.env.JOE_DATA_DIR;
let home = '';
let runId = '';
let versionFile = '';

/*
 * The project is a plain static site with a records file, and a real watcher keeps a copy of the owner's write
 * before today's put-back restores the file — exactly what a 2T verification does with his data.
 */
beforeAll(async () => {
    fx = fileToolsFixture('h-reach');
    //  Joe's data folder beside the workspaces (as <cwd>/data holds data/projects/<workspaceId>).
    process.env.JOE_DATA_DIR = fx.base;
    jest.resetModules();
    leaves = require('../core/quality/qa-leaves-no-trace');
    home = leaves.recoveryHome();
    fx.put('index.html', '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title></head><body><h1>Shop</h1></body></html>');
    fx.put('data/store.json', JSON.stringify({ customers: [{ id: 1, name: 'Huda Salem' }] }));
    const snap = await leaves.snapshotAppData(fx.project);
    runId = `run-reach-${Date.now().toString(36)}`;
    const w = leaves.watchAppData(snap, { into: leaves.recoveryRunDir(fx.workspaceId, fx.project, runId), budget: leaves.RECOVERY_BUDGET });
    fx.put('data/store.json', JSON.stringify({ customers: [{ id: 1, name: 'Huda Salem' }, { id: 2, name: OWNER_RECORD }] }));
    await sleep(400);
    await w.flush('put-back');
    await leaves.restoreAppData(snap, []);
    await w.stop();
    await leaves.discardSnapshot(snap);
    versionFile = filesUnder(home).find(f => f.bytes.toString('utf8').includes(OWNER_RECORD))!.abs;
});
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    fx.cleanup();
});

describe('where the copy is', () => {
    it('in Joe\'s data folder, beside the workspaces: not in the project, not in the workspace, and the project holds none of it', () => {
        expect(versionFile).toBeTruthy();
        expect(leaves.isInsideFolder(versionFile, home)).toBe(true);
        expect(leaves.isInsideFolder(versionFile, fx.project)).toBe(false);
        expect(leaves.isInsideFolder(versionFile, fx.workspace)).toBe(false);
        expect(leaves.isInsideFolder(fx.workspace, home)).toBe(false);
        //  Today's put-back restored his file; his write lives only in the copy.
        expect(fx.text('data/store.json')).not.toContain(OWNER_RECORD);
        expect(filesUnder(fx.project).filter(f => f.bytes.toString('utf8').includes(OWNER_RECORD) || /qa-recovery/i.test(f.rel))).toEqual([]);
    });
});

describe('12.6 row 4 / row 10 — the model\'s file tools never reach it', () => {
    it('read by its own path, by a path that climbs, through a link inside the workspace; list and search of the project: refused or absent', async () => {
        const rel = path.relative(fx.project, versionFile).split(path.sep).join('/');
        for (const p of [versionFile, rel]) {
            const r = await fx.run('engine_file_read', { path: p });
            expect({ p, ok: r.ok }).toEqual({ p, ok: false });
            expect(JSON.stringify(r)).not.toContain(OWNER_RECORD);
        }
        //  A link planted in the project, pointing at the copies.
        fx.link('copies', home);
        const inside = path.relative(home, versionFile).split(path.sep).join('/');
        const viaLink = await fx.run('engine_file_read', { path: `copies/${inside}` });
        expect(viaLink.ok).toBe(false);
        expect(JSON.stringify(viaLink)).not.toContain(OWNER_RECORD);
        const list = await fx.run('engine_file_list', { depth: 8 });
        expect(JSON.stringify(list)).not.toContain(OWNER_RECORD);
        expect(JSON.stringify(list.output || '')).not.toMatch(new RegExp(runId));
        const search = await fx.run('engine_file_search', { pattern: '7f3a-only-in-the-copy' });
        expect(JSON.stringify(search)).not.toContain(OWNER_RECORD);
        fs.unlinkSync(path.join(fx.project, 'copies'));
    });
});

describe('12.6 row 4 — nothing that carries the project carries the copy', () => {
    it('a Pages publish of the static root copies the root as it is: no copy is in it', () => {
        //  deploy_pages publishes a plain static root as-is (DeployPagesTool: outDir = cwd; fs.cpSync(outDir, stage)).
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'DeployPagesTool.ts'), 'utf8');
        expect(src).toMatch(/outDir = cwd;/);
        expect(src).toMatch(/fs\.cpSync\(outDir, stage, \{ recursive: true \}\)/);
        const stage = path.join(fx.base, 'pages-stage');
        fs.cpSync(fx.project, stage, { recursive: true });
        expect(filesUnder(stage).filter(f => f.bytes.toString('utf8').includes(OWNER_RECORD))).toEqual([]);
    });

    it('the project zip (deploy_project) and the project export pack the project folder only: no copy is in them', () => {
        const zipSrc = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'DeployProjectTool.ts'), 'utf8');
        expect(zipSrc).toMatch(/const sourcePath = outputDir \? path\.join\(projectPath, outputDir\) : projectPath;/);
        const out = archiveProject(fx.project);
        const zip = new AdmZip(out.buffer);
        const entries = zip.getEntries();
        expect(entries.map(e => e.entryName)).toContain('data/store.json');
        expect(entries.filter(e => /qa-recovery/i.test(e.entryName) || e.getData().toString('utf8').includes(OWNER_RECORD))).toEqual([]);
    });

    it('git add -A in a repository whose root is above the project stages no copy', async () => {
        const run = (command: string) => executionFirewall.runInContext('h-reach-git', () => new ShellExecuteTool().execute({ command, cwd: fx.workspace, timeout: 60_000 }, fx.context));
        const init: any = await run('git init -q && git add -A && git ls-files');
        const listed = JSON.stringify(init);
        expect(listed).toMatch(/project\/data\/store\.json/);
        expect(listed).not.toMatch(/qa-recovery/i);
        const grep: any = await run('git grep --cached -l "7f3a-only-in-the-copy" || echo NO-MATCH');
        expect(JSON.stringify(grep)).toContain('NO-MATCH');
    });

    it('a static server of the project (Express, dot folders served) answers 404 for every way to the copy', async () => {
        const express = require('express');
        const app = express();
        app.use(express.static(fx.project, { dotfiles: 'allow' }));
        const server = await new Promise<any>(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
        const port = (server.address() as AddressInfo).port;
        const inside = path.relative(home, versionFile).split(path.sep).join('/');
        const ask = (p: string) => new Promise<{ status: number; body: string }>(resolve => {
            require('http').get({ host: '127.0.0.1', port, path: p }, (res: any) => { let b = ''; res.on('data', (c: any) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }).on('error', () => resolve({ status: 0, body: '' }));
        });
        try {
            expect((await ask('/data/store.json')).status).toBe(200);
            for (const p of [`/qa-recovery/${inside}`, `/../qa-recovery/${inside}`, `/%2e%2e/qa-recovery/${inside}`, `/..%2fqa-recovery/${inside}`, `/../../qa-recovery/${inside}`]) {
                const r = await ask(p);
                expect({ p, status: r.status >= 400 }).toEqual({ p, status: true });
                expect(r.body).not.toContain(OWNER_RECORD);
            }
        } finally { await new Promise<void>(r => server.close(() => r())); }
    });
});

describe('12.6 row 10 — Joe brings a version back when he asks', () => {
    it('restoreRecoveryVersion copies it into the project and reports names and sizes only; what was there is kept aside', async () => {
        const runs = await listRecoveryVersions(fx.workspaceId, fx.project);
        const run = runs.find(r => r.runId === runId)!;
        expect(run).toBeDefined();
        const holding = run.versions.find(v => fs.existsSync(path.join(leaves.recoveryVersionDir(fx.workspaceId, fx.project, runId, v.n), 'data', 'store.json'))
            && fs.readFileSync(path.join(leaves.recoveryVersionDir(fx.workspaceId, fx.project, runId, v.n), 'data', 'store.json'), 'utf8').includes(OWNER_RECORD))!;
        expect(holding).toBeDefined();
        const back = await restoreRecoveryVersion(fx.workspaceId, fx.project, runId, holding.n);
        expect(back.ok).toBe(true);
        expect(back.restored.map(r => r.file)).toEqual(['data/store.json']);
        expect(back.restored[0].bytes).toBeGreaterThan(0);
        expect(JSON.stringify(back)).not.toContain(OWNER_RECORD);
        expect(JSON.stringify(back)).not.toContain('Huda Salem');
        expect(fx.text('data/store.json')).toContain(OWNER_RECORD);
        expect((await restoreRecoveryVersion(fx.workspaceId, fx.project, '../..', 1)).ok).toBe(false);
    });
});

describe('12.6 row 9 — the copies do not pile up', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const plant = (ws: string, key: string, name: string, startedAt: number, bytes = 10) => {
        const dir = path.join(home, ws, key, name);
        fs.mkdirSync(path.join(dir, '1', 'data'), { recursive: true });
        fs.writeFileSync(path.join(dir, '1', 'data', 'store.json'), 'x'.repeat(bytes));
        fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ runId: name, startedAt, overBudget: false, versions: [] }));
        return dir;
    };

    it('at boot (the boot hook\'s one call): a run older than 14 days goes, every younger run stays as he is told (review 7, B3); and the server cap takes the oldest first', async () => {
        const boot = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.ts'), 'utf8');
        expect(boot).toMatch(/require\('\.\.\/core\/quality\/qa-leaves-no-trace'\)\.startRecoveryUpkeep\(\)/);
        const now = Date.now();
        const old = plant('ws-boot', 'aaaaaaaaaaaaaaaa', 'run-old', now - 15 * DAY);
        const fresh = plant('ws-boot', 'aaaaaaaaaaaaaaaa', 'run-fresh', now - DAY);
        const six = [0, 1, 2, 3, 4, 5].map(i => plant('ws-boot', 'bbbbbbbbbbbbbbbb', `run-${i}`, now - (10 - i) * 60_000));
        const upkeep = leaves.startRecoveryUpkeep();
        await upkeep.ready;
        upkeep.stop();
        expect(fs.existsSync(old)).toBe(false);
        expect(fs.existsSync(fresh)).toBe(true);
        expect(six.every(d => fs.existsSync(d))).toBe(true);

        //  The server-wide cap (5 GB, scaled down here): the oldest runs of any project go first.
        const a = plant('ws-cap', 'cccccccccccccccc', 'run-a', now - 3 * 60_000, 4000);
        const b = plant('ws-cap', 'dddddddddddddddd', 'run-b', now - 2 * 60_000, 4000);
        const c = plant('ws-cap', 'eeeeeeeeeeeeeeee', 'run-c', now - 60_000, 4000);
        const capped = leaves.startRecoveryUpkeep({ budget: { ...leaves.RECOVERY_BUDGET, serverBytes: 12_000 } });
        await capped.ready;
        capped.stop();
        expect(fs.existsSync(a)).toBe(false);
        expect([fs.existsSync(b), fs.existsSync(c)]).toEqual([true, true]);
    });

    it('when a watcher starts (that project), and by the hourly sweep while Joe runs', async () => {
        const now = Date.now();
        fx.put('data/notes.json', '[]');
        const key = leaves.projectKeyOf(fx.project);
        const old = plant(fx.workspaceId, key, 'run-before-this-one', now - 20 * DAY);
        const snap = await leaves.snapshotAppData(fx.project);
        const w = leaves.watchAppData(snap, { into: leaves.recoveryRunDir(fx.workspaceId, fx.project, `run-now-${now}`), budget: leaves.RECOVERY_BUDGET });
        await sleep(800);
        expect(fs.existsSync(old)).toBe(false);
        await w.stop();
        await leaves.discardSnapshot(snap);

        const upkeep = leaves.startRecoveryUpkeep({ everyMs: 1000 });
        await upkeep.ready;
        const later = plant('ws-sweep', 'ffffffffffffffff', 'run-stale', Date.now() - 30 * DAY);
        await sleep(2500);
        upkeep.stop();
        expect(fs.existsSync(later)).toBe(false);
    });
});
