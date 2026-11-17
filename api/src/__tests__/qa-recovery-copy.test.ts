/**
 * THE RECOVERY COPY KEEPS EVERY VERSION THE VERIFICATION SAW, OUTSIDE THE PROJECT (design v13.3 §5b).
 *
 * On path 2T Joe walks the owner's live app as today and puts his data files back as today, whole, so a record he
 * wrote meanwhile is overwritten — today's behaviour. Step 1 keeps every version the watcher saw in Joe's own data
 * folder, never under the project, with retention, caps and a one-verification-per-project lock.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    acquireVerifyLock, isInsideFolder, isVerifyLockStale, projectKeyOf, pruneRecovery, recoveryHome, recoveryIntervalMs,
    recoveryProjectDir, recoveryRunDir, RECOVERY_BUDGET, restoreAppData, snapshotAppData, discardSnapshot, startRecoveryUpkeep,
    sweepStaleVerifyLocks, verifyLockFile, VERIFY_LOCK_STALE_MS, watchAppData,
} from '../core/quality/qa-leaves-no-trace';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await check()) return; await sleep(25); }
    throw new Error('timed out');
}
const read = (f: string) => fs.readFileSync(f, 'utf8');

let base: string;
let env: NodeJS.ProcessEnv;
beforeAll(async () => {
    base = await fs.promises.mkdtemp(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-recovery-'));
    env = { JOE_DATA_DIR: path.join(base, 'joe-data') };
});
afterAll(async () => { await fs.promises.rm(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

async function project(name: string, files: Record<string, string>): Promise<string> {
    const root = path.join(base, 'projects', 'ws1', name);
    for (const [rel, text] of Object.entries(files)) {
        await fs.promises.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
        await fs.promises.writeFile(path.join(root, rel), text);
    }
    return root;
}

describe('where the copies live', () => {
    it('is Joe\'s own data folder, outside the project and outside every workspace root', async () => {
        const root = await project('shop', { 'data/store.json': '[]' });
        const run = recoveryRunDir('ws1', root, 'run-1', env);
        expect(run.startsWith(path.join(env.JOE_DATA_DIR as string, 'qa-recovery'))).toBe(true);
        expect(run).toBe(path.join(recoveryHome(env), 'ws1', projectKeyOf(root), 'run-1'));
        expect(projectKeyOf(root)).toMatch(/^[0-9a-f]{16}$/);
        expect(isInsideFolder(run, root)).toBe(false);
        expect(isInsideFolder(run, path.join(base, 'projects'))).toBe(false);
        //  With Joe's own defaults: <cwd>/data/qa-recovery sits beside data/projects, the workspaces' parent, never in it.
        const cwd = process.cwd();
        const home = recoveryHome({});
        expect(home).toBe(path.join(cwd, 'data', 'qa-recovery'));
        for (const projects of [path.join(cwd, 'data', 'projects'), path.join(cwd, '..', 'data', 'projects')]) {
            expect(isInsideFolder(home, projects)).toBe(false);
            expect(isInsideFolder(projects, home)).toBe(false);
        }
        //  A workspace id or run id is a folder name, never a path.
        expect(recoveryRunDir('../../etc', root, '..', env).startsWith(recoveryHome(env))).toBe(true);
    });

    it('refuses a recovery folder inside the project', async () => {
        const root = await project('inside', { 'data/store.json': '[]' });
        const snap = await snapshotAppData(root);
        expect(() => watchAppData(snap, { into: path.join(root, '.joe', 'qa-recovery', 'r'), budget: RECOVERY_BUDGET })).toThrow(/outside the project/);
        await discardSnapshot(snap);
    });

    it('scales its poll to the number of files, and to the number of watchers on the server', () => {
        expect(recoveryIntervalMs(3)).toBe(50);
        expect(recoveryIntervalMs(50)).toBe(50);
        expect(recoveryIntervalMs(200)).toBe(250);
        expect(recoveryIntervalMs(2000)).toBe(1000);
        expect(recoveryIntervalMs(3, 8)).toBe(50);
        expect(recoveryIntervalMs(3, 9)).toBe(1000);
    });
});

describe('a 2T verification span', () => {
    it('keeps the owner\'s write made during the span, and the put-back is still today\'s', async () => {
        const root = await project('crm', { 'data/store.json': '[{"id":1,"name":"Owner A"}]', 'server.js': 'listen' });
        const snap = await snapshotAppData(root);
        const into = recoveryRunDir('ws1', root, 'run-owner', env);
        const watch = watchAppData(snap, { into, budget: RECOVERY_BUDGET });
        const store = path.join(root, 'data', 'store.json');
        //  The owner adds a customer while the checks run.
        await sleep(120);
        fs.writeFileSync(store, '[{"id":1,"name":"Owner A"},{"id":2,"name":"Owner B"}]');
        await until(() => watch.versions().length === 1);
        expect(watch.changes().map(c => c.file)).toEqual(['data/store.json']);
        //  Rewritten with the same bytes: a touch, not a change, and no second copy.
        await sleep(30);
        fs.writeFileSync(store, '[{"id":1,"name":"Owner A"},{"id":2,"name":"Owner B"}]');
        await sleep(300);
        expect(watch.versions().length).toBe(1);
        //  The walk deletes him again; the put-back's flush takes the last version first.
        fs.writeFileSync(store, '[{"id":1,"name":"Owner A"},{"id":2,"name":"Owner B"},{"id":3,"name":"QA Tester"}]');
        await watch.flush('before put-back');
        const r = await restoreAppData(snap);
        await watch.flush('after put-back');
        await watch.stop();
        await discardSnapshot(snap);
        //  Today's put-back: the live store is the snapshot again.
        expect(read(store)).toBe('[{"id":1,"name":"Owner A"}]');
        expect(r.restored.map(f => f.replace(/\\/g, '/'))).toEqual(['data/store.json']);
        //  Every version is outside the project, and his record is in one of them.
        const versions = watch.versions();
        expect(versions.length).toBeGreaterThanOrEqual(2);
        const texts = versions.map(v => read(path.join(into, String(v.n), 'data', 'store.json')));
        expect(texts.some(t => t.includes('Owner B'))).toBe(true);
        expect(fs.existsSync(path.join(root, '.joe', 'qa-recovery'))).toBe(false);
        const index = JSON.parse(read(path.join(into, 'run.json')));
        expect(index.versions.length).toBe(versions.length);
        if (process.platform !== 'win32') {
            for (const d of [recoveryHome(env), recoveryProjectDir('ws1', root, env), into]) expect(fs.statSync(d).mode & 0o777).toBe(0o700);
            expect(fs.statSync(path.join(into, String(versions[0].n), 'data', 'store.json')).mode & 0o777).toBe(0o600);
        }
    }, 60_000);

    it('copies a file the walk created, which the put-back then removes', async () => {
        const root = await project('uploads', { 'data/store.json': '[]' });
        const snap = await snapshotAppData(root);
        const into = recoveryRunDir('ws1', root, 'run-new', env);
        const watch = watchAppData(snap, { into, budget: RECOVERY_BUDGET });
        await sleep(100);
        fs.mkdirSync(path.join(root, 'uploads'), { recursive: true });
        fs.writeFileSync(path.join(root, 'uploads', 'owner-photo.jpg'), 'photo bytes');
        await until(() => watch.versions().some(v => v.files.includes('uploads/owner-photo.jpg')));
        await watch.flush('put-back');
        const r = await restoreAppData(snap);
        await watch.stop();
        await discardSnapshot(snap);
        expect(r.removed.map(f => f.replace(/\\/g, '/'))).toEqual(['uploads/owner-photo.jpg']);
        const v = watch.versions().find(x => x.files.includes('uploads/owner-photo.jpg'))!;
        expect(read(path.join(into, String(v.n), 'uploads', 'owner-photo.jpg'))).toBe('photo bytes');
    }, 60_000);

    it('copies a live WAL database consistently: every version opens and the last holds his row', async () => {
        const root = await project('sqlite', { 'server.js': 'listen' });
        fs.mkdirSync(path.join(root, 'data'), { recursive: true });
        const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
        const file = path.join(root, 'data', 'app.db');
        const db = new DatabaseSync(file);
        db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);');
        db.prepare('INSERT INTO customers (name) VALUES (?)').run('Owner A');
        try {
            expect(fs.existsSync(`${file}-wal`)).toBe(true);
            const snap = await snapshotAppData(root);
            const into = recoveryRunDir('ws1', root, 'run-sqlite', env);
            const watch = watchAppData(snap, { into, budget: RECOVERY_BUDGET });
            await sleep(100);
            db.prepare('INSERT INTO customers (name) VALUES (?)').run('QA Tester');
            await until(() => watch.versions().length >= 1);
            db.prepare('INSERT INTO customers (name) VALUES (?)').run('Owner B after the walk');
            await watch.flush('put-back');
            await watch.stop();
            await discardSnapshot(snap);
            const versions = watch.versions();
            expect(versions.length).toBeGreaterThanOrEqual(2);
            let last: string[] = [];
            for (const v of versions) {
                expect(v.files).toEqual(['data/app.db']);   // one consistent x.db, no -wal beside it
                expect(fs.existsSync(path.join(into, String(v.n), 'data', 'app.db-wal'))).toBe(false);
                const copy = new DatabaseSync(path.join(into, String(v.n), 'data', 'app.db'), { readOnly: true });
                try { last = (copy.prepare('SELECT name FROM customers ORDER BY id').all() as Array<{ name: string }>).map(r => r.name); } finally { copy.close(); }
            }
            expect(last).toEqual(['Owner A', 'QA Tester', 'Owner B after the walk']);
        } finally { db.close(); }
    }, 60_000);

    it('over the per-project cap keeps only the newest version of each file, and says so', async () => {
        const root = await project('big', { 'data/store.json': 'x'.repeat(100) });
        const snap = await snapshotAppData(root);
        const into = recoveryRunDir('ws1', root, 'run-big', env);
        const budget = { ...RECOVERY_BUDGET, projectBytes: 2500 };
        const watch = watchAppData(snap, { into, budget });
        const store = path.join(root, 'data', 'store.json');
        for (let i = 1; i <= 4; i++) {
            fs.writeFileSync(store, String(i).repeat(1000));
            await until(() => watch.versions().length >= Math.min(i, 2) || watch.overBudget());
            await sleep(120);
        }
        fs.writeFileSync(store, 'L'.repeat(1000));
        await watch.flush('put-back');
        await watch.stop();
        await discardSnapshot(snap);
        expect(watch.overBudget()).toBe(true);
        const versions = watch.versions();
        expect(versions.length).toBe(1);
        expect(read(path.join(into, String(versions[0].n), 'data', 'store.json'))).toBe('L'.repeat(1000));
        expect(JSON.parse(read(path.join(into, 'run.json'))).overBudget).toBe(true);
    }, 60_000);

    it('leaves no run folder when nothing changed', async () => {
        const root = await project('quiet', { 'data/store.json': '[]' });
        const snap = await snapshotAppData(root);
        const into = recoveryRunDir('ws1', root, 'run-quiet', env);
        const watch = watchAppData(snap, { into, budget: RECOVERY_BUDGET });
        await sleep(200);
        await watch.flush('put-back');
        await watch.stop();
        await discardSnapshot(snap);
        expect(watch.versions()).toEqual([]);
        expect(fs.existsSync(into)).toBe(false);
    }, 30_000);
});

describe('retention and disk', () => {
    const DAY = 24 * 60 * 60 * 1000;
    async function fakeRun(dir: string, startedAt: number, bytes = 10): Promise<void> {
        await fs.promises.mkdir(path.join(dir, '1', 'data'), { recursive: true });
        await fs.promises.writeFile(path.join(dir, 'run.json'), JSON.stringify({ startedAt }));
        await fs.promises.writeFile(path.join(dir, '1', 'data', 'store.json'), 'x'.repeat(bytes));
    }

    it('drops runs older than 14 days and keeps every younger run of a project (review 7, B3: as he is told)', async () => {
        const penv = { JOE_DATA_DIR: path.join(base, 'prune-a') };
        const root = await project('retain', { 'data/store.json': '[]' });
        const now = Date.now();
        for (let i = 0; i < 6; i++) await fakeRun(recoveryRunDir('ws1', root, `run-${i}`, penv), now - i * 60_000);
        await fakeRun(recoveryRunDir('ws1', root, 'run-old', penv), now - 15 * DAY);
        const r = await pruneRecovery({ env: penv });
        const left = fs.readdirSync(recoveryProjectDir('ws1', root, penv)).sort();
        expect(left).toEqual(['run-0', 'run-1', 'run-2', 'run-3', 'run-4', 'run-5']);
        expect(r.removedRuns.map(d => path.basename(d)).sort()).toEqual(['run-old']);
    });

    it('holds the server under its cap, the oldest runs of any project first', async () => {
        const penv = { JOE_DATA_DIR: path.join(base, 'prune-b') };
        const a = await project('srv-a', {}), b = await project('srv-b', {});
        const now = Date.now();
        await fakeRun(recoveryRunDir('ws1', a, 'a-old', penv), now - 3000, 1000);
        await fakeRun(recoveryRunDir('ws2', b, 'b-mid', penv), now - 2000, 1000);
        await fakeRun(recoveryRunDir('ws1', a, 'a-new', penv), now - 1000, 1000);
        await pruneRecovery({ env: penv, budget: { ...RECOVERY_BUDGET, serverBytes: 2500 } });
        expect(fs.existsSync(recoveryRunDir('ws1', a, 'a-old', penv))).toBe(false);
        expect(fs.existsSync(recoveryRunDir('ws2', b, 'b-mid', penv))).toBe(true);
        expect(fs.existsSync(recoveryRunDir('ws1', a, 'a-new', penv))).toBe(true);
    });

    it('prunes the project when a watcher starts, at boot, and never a run being written', async () => {
        const penv = { JOE_DATA_DIR: path.join(base, 'prune-c') };
        const root = await project('upkeep', { 'data/store.json': '[]' });
        await fakeRun(recoveryRunDir('ws1', root, 'run-ancient', penv), Date.now() - 30 * DAY);
        const snap = await snapshotAppData(root);
        const into = recoveryRunDir('ws1', root, 'run-live', penv);
        const watch = watchAppData(snap, { into, budget: RECOVERY_BUDGET });
        await until(() => !fs.existsSync(recoveryRunDir('ws1', root, 'run-ancient', penv)));
        //  The boot pass and the hourly one: the live run is never touched, an old one is.
        await fakeRun(recoveryRunDir('ws1', root, 'run-ancient-2', penv), Date.now() - 30 * DAY);
        const upkeep = startRecoveryUpkeep({ env: penv, everyMs: 60_000 });
        await upkeep.ready;
        upkeep.stop();
        expect(fs.existsSync(recoveryRunDir('ws1', root, 'run-ancient-2', penv))).toBe(false);
        expect(fs.existsSync(into)).toBe(true);
        await watch.stop();
        await discardSnapshot(snap);
    }, 30_000);

    it('never sweeps a folder that is not a recovery home', async () => {
        const stray = path.join(base, 'not-a-home', 'ws', 'key');
        await fakeRun(path.join(stray, 'r1'), Date.now() - 30 * DAY);
        const r = await pruneRecovery({ home: path.join(base, 'not-a-home') });
        expect(r.removedRuns).toEqual([]);
        expect(fs.existsSync(path.join(stray, 'r1'))).toBe(true);
    });
});

describe('one 2T verification per project at a time', () => {
    it('waits for a held lock, then gives up so the run goes to path 3', async () => {
        const root = await project('locked', {});
        const first = await acquireVerifyLock('ws1', root, 'run-a', { waitMs: 0, env });
        expect(first).not.toBeNull();
        const t0 = Date.now();
        const second = await acquireVerifyLock('ws1', root, 'run-b', { waitMs: 400, env, pollMs: 50 });
        expect(second).toBeNull();
        expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
        await first!.release();
        const third = await acquireVerifyLock('ws1', root, 'run-c', { waitMs: 0, env });
        expect(third).not.toBeNull();
        expect(JSON.parse(read(verifyLockFile('ws1', root, env)))).toMatchObject({ pid: process.pid, runId: 'run-c' });
        await third!.release();
        expect(fs.existsSync(verifyLockFile('ws1', root, env))).toBe(false);
    });

    it('takes over a lock left by a dead process, by a reused pid, or older than 20 minutes', async () => {
        const root = await project('stale', {});
        const file = verifyLockFile('ws1', root, env);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        let dead = 4_000_000;
        while ((() => { try { process.kill(dead, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; } })()) dead++;
        for (const info of [
            { pid: dead, processStart: 1, runId: 'killed', at: Date.now() },
            { pid: process.pid, processStart: 1, runId: 'reused-pid', at: Date.now() },
            { pid: process.pid, processStart: 0, runId: 'old', at: Date.now() - VERIFY_LOCK_STALE_MS - 1000 },
        ]) {
            expect(isVerifyLockStale(info)).toBe(true);
            fs.writeFileSync(file, JSON.stringify(info));
            const lock = await acquireVerifyLock('ws1', root, 'run-new', { waitMs: 0, env });
            expect(lock).not.toBeNull();
            await lock!.release();
        }
    });

    it('is released in a finally after a thrown error, and stale locks are swept at boot', async () => {
        const root = await project('finally', {});
        await expect((async () => {
            const lock = await acquireVerifyLock('ws1', root, 'run-throws', { waitMs: 0, env });
            try { throw new Error('the walk failed'); } finally { await lock?.release(); }
        })()).rejects.toThrow('the walk failed');
        expect(fs.existsSync(verifyLockFile('ws1', root, env))).toBe(false);
        const other = await project('boot-sweep', {});
        fs.mkdirSync(path.dirname(verifyLockFile('ws1', other, env)), { recursive: true });
        fs.writeFileSync(verifyLockFile('ws1', other, env), JSON.stringify({ pid: process.pid, processStart: 1, runId: 'x', at: Date.now() }));
        expect(await sweepStaleVerifyLocks(env)).toBeGreaterThanOrEqual(1);
        expect(fs.existsSync(verifyLockFile('ws1', other, env))).toBe(false);
    });
});
