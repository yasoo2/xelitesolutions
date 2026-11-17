/**
 * A RESTORE GOES ONLY WHERE HIS PROJECT IS NOW (review 11: F1, F2, F3, F4, F5).
 *
 *   F1  The copy's folder was read from the record of the list, never checked against the project's folders at the
 *       restore: a folder that became another chat's project after the list (its server running, its customers
 *       writing) was written — without its lock, its server neither stopped nor checked — and Joe said «no server of
 *       your app running». Now the record's copy is accepted only when the copies of his project NOW hold the same
 *       folder, run and version under that id; the folder is taken from them. Otherwise nothing is stopped or written.
 *   F2  Another chat's project known by a second spelling of its folder (a junction, a symlink, an 8.3 short name, a
 *       `subst` drive) was not recognised. Now the scope and the server checks compare the folders as the file system
 *       knows them.
 *   F3  «Once» was not once when the record could not be rewritten (a full disk, a read-only file): the unused record
 *       on disk won over the used one in memory. Now the use is recorded first, and when it cannot be, nothing comes back.
 *   F4  «اعرض نسخ بياناتى» (the final «ى» of an Egyptian or phone keyboard) and the Persian «ی»/«ک» are his line.
 *   F5  The restart's environment is what project_run passed the server, and nothing claims more.
 */
import fs from 'fs';
import { fork } from 'child_process';
import net from 'net';
import os from 'os';
import path from 'path';
import { discardSnapshot, RECOVERY_BUDGET, recoveryRunDir, restoreAppData, snapshotAppData, watchAppData } from '../core/quality/qa-leaves-no-trace';
import { _forgetRecoveryConfirmations, ProjectDataRecoveryTool, projectRecoveryScope } from '../modules/tools/definitions/ProjectDataRecoveryTool';

const RR = () => require('../core/engine/restore-reply');
jest.setTimeout(240_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r11-where-'));
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = path.join(base, 'joe-data');
const savedNarration = process.env.DISABLE_NARRATION;
process.env.DISABLE_NARRATION = 'true';
const children: Array<{ kill(): void }> = [];
const links: string[] = [];
afterAll(async () => {
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    const { _runningServers, ProjectStopTool } = require('../modules/tools/definitions/ProjectRunTool');
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    for (const key of Array.from(_runningServers.keys()) as string[]) {
        if (String(key).startsWith('joe-r11-')) await executionFirewall.runInContext('joe-r11-stop', () => new ProjectStopTool().execute({}, { workspaceId: key })).catch(() => undefined);
    }
    //  The links first, on their own: a removal through a junction would reach what it points at.
    for (const l of links) { try { fs.unlinkSync(l); } catch { try { fs.rmdirSync(l); } catch { /* gone */ } } }
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    if (savedNarration === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = savedNarration;
    try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* a stopped server's file: gone at teardown */ }
});
afterEach(() => { _forgetRecoveryConfirmations(); jest.restoreAllMocks(); });

const until = async (ok: () => boolean, ms = 10_000) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 50)); };
const { writeJoeProject } = require('../api/page-store');
const { previewKey } = require('../modules/tools/preview-site');
const read = (f: string) => fs.readFileSync(f, 'utf8');
const answers = (port: number) => new Promise<boolean>(res => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
const freePort = () => new Promise<number>(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const SERVER = "require('http').createServer((q,s)=>s.end('x')).listen(Number(process.env.PORT||process.argv[2]),'127.0.0.1',()=>process.send&&process.send('up'));";

function folder(rel: string, files: Record<string, string>): string {
    const root = path.join(base, rel);
    fs.mkdirSync(root, { recursive: true });
    for (const [f, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
        fs.writeFileSync(path.join(root, f), text);
    }
    return root;
}
function junction(target: string, at: string): string {
    fs.symlinkSync(target, at, 'junction');
    links.push(at);
    return at;
}
/** One run of the checks as verify/owner-data-span keeps it: snapshot, watch, a change during the checks, the put-back. */
async function oneRun(ws: string, root: string, runId: string, rel: string, during: string): Promise<void> {
    const snap = await snapshotAppData(root);
    const watch = watchAppData(snap, { into: recoveryRunDir(ws, root, runId), budget: RECOVERY_BUDGET });
    fs.writeFileSync(path.join(root, rel), during);
    await until(() => watch.versions().length > 0);
    await watch.flush('put-back');
    await watch.stop();
    await restoreAppData(snap);
    await discardSnapshot(snap);
    await new Promise(r => setTimeout(r, 1100));   // the next copy is made in a later second
}
function openProject(sessionId: string, entry: Record<string, unknown>) { writeJoeProject(previewKey(sessionId), { type: 'agent', updatedAt: Date.now(), ...entry }, 'run-earlier'); }
const tool = new ProjectDataRecoveryTool();
const turn = (sessionId: string, runId: string, ownerMessage: unknown, language = 'en') => ({ sessionId, workspaceId: 'ws-r11', language, runId, ownerMessage });
const restore = (sessionId: string, runId: string, id: string): Promise<any> => {
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    return executionFirewall.runInContext(`joe-r11-${runId}`, () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, runId, `restore copy ${id}`)));
};
const shownDir = () => path.join(process.env.JOE_DATA_DIR as string, 'qa-recovery-shown');

describe('F1 — the copy goes only where the project is now', () => {
    it('a folder that became another chat\'s project after the list: nothing is written there, its server keeps answering, and he is told the truth', async () => {
        const work = folder('f1-work', { 'shop/index.html': '<h1>shop</h1>', 'shop/data/cart.json': '[{"id":1}]', 'api/data/orders.json': '[{"id":1,"item":"old order"}]' });
        const shop = path.join(work, 'shop');
        const api = path.join(work, 'api');
        const F = path.join(api, 'data', 'orders.json');
        await oneRun('ws-r11', api, 'run-api', 'data/orders.json', '[{"id":1,"item":"old order"},{"id":9,"item":"Joe QA"}]');
        await oneRun('ws-r11', shop, 'run-shop', 'data/cart.json', '[{"id":1},{"id":2}]');
        //  Chat A's project is the shop; Joe recorded its packaged API folder outside it.
        openProject('joe-r11-A', { dir: shop, packagedInto: api });
        const listed: any = await tool.execute({ action: 'list' }, turn('joe-r11-A', 'turn-1', 'show my data copies'));
        const apiCopy = listed.output.versions.find((v: any) => path.resolve(v.folder) === path.resolve(api));
        expect(apiCopy).toBeDefined();
        //  Chat B opens the API folder as ITS project, runs its server there; its customer writes today's order.
        const today = '[{"id":1,"item":"old order"},{"id":2,"item":"chat B customer order (today)"}]';
        fs.writeFileSync(F, today);
        fs.writeFileSync(path.join(api, 'server.cjs'), SERVER);
        const port = await freePort();
        const child = fork(path.join(api, 'server.cjs'), [String(port)], { cwd: api, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
        _runningServers.set('joe-r11-api-b', { pid: child.pid, port, cwd: api, command: 'node server.cjs', startedAt: Date.now(), sessionKey: previewKey('joe-r11-B'), sessionId: 'joe-r11-B' });
        openProject('joe-r11-B', { dir: api });
        expect(projectRecoveryScope(((global as any).joeProjects || {})[previewKey('joe-r11-A')]).roots.map(r => path.resolve(r))).toEqual([path.resolve(shop)]);

        const r = await restore('joe-r11-A', 'turn-2', apiCopy.id);
        expect([r.ok, r.error, r.output.nonRecoverable]).toEqual([false, 'copy_moved', true]);
        expect(r.output.restored).toBeUndefined();
        expect(r.output.message).toMatch(/Nothing was brought back and Joe stopped nothing/u);
        expect(r.output.message).toMatch(/show my data copies/u);
        expect(r.output.message).not.toMatch(/no server of your app running/u);
        expect(read(F)).toBe(today);
        expect(await answers(port)).toBe(true);
        //  The shop's own copy, from the same list, still comes back (in a later turn).
        const shopCopy = listed.output.versions.find((v: any) => path.resolve(v.folder) === path.resolve(shop));
        const ok = await restore('joe-r11-A', 'turn-3', shopCopy.id);
        expect([ok.ok, ok.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/cart.json']]);
        expect(read(path.join(shop, 'data', 'cart.json'))).toBe('[{"id":1},{"id":2}]');
        expect(read(F)).toBe(today);
    });

    it('a record changed on disk to aim his line at another folder with kept copies: nothing is written there', async () => {
        const work = folder('f1-tamper', { 'shop/data/a.json': '[1]', 'clinic/data/patients.json': '["old"]' });
        const shop = path.join(work, 'shop');
        const clinic = path.join(work, 'clinic');
        const P = path.join(clinic, 'data', 'patients.json');
        await oneRun('ws-r11', clinic, 'run-c', 'data/patients.json', '["old","Joe QA"]');
        await oneRun('ws-r11', shop, 'run-s', 'data/a.json', '[1,2]');
        openProject('joe-r11-T', { dir: shop });
        const listed: any = await tool.execute({ action: 'list' }, turn('joe-r11-T', 'turn-1', 'show my data copies'));
        const id = listed.output.versions[0].id;
        //  Anything that can write Joe's data folder points the copy of that id at the clinic's kept copy.
        const file = path.join(shownDir(), fs.readdirSync(shownDir()).find(f => f.endsWith('.json')) as string);
        const rec = JSON.parse(read(file));
        rec.copies[id] = { ...rec.copies[id], root: clinic, runId: 'run-c', n: 1 };
        fs.writeFileSync(file, JSON.stringify(rec));
        fs.writeFileSync(P, '["old","Amal (today)"]');
        const r = await restore('joe-r11-T', 'turn-2', id);
        expect([r.ok, r.error]).toEqual([false, 'copy_moved']);
        expect(read(P)).toBe('["old","Amal (today)"]');
        expect(read(path.join(shop, 'data', 'a.json'))).toBe('[1]');
    });
});

describe('F2 — another chat\'s project by a second spelling of its folder is still that project', () => {
    it('a junction (or symlink) to another chat\'s project: never a root, never walked into, its server never stopped', async () => {
        const work = folder('f2-work', { 'shop/data/a.json': '[]', 'clinic/data/b.json': '[]', 'clinic/server.js': SERVER });
        const shop = path.join(work, 'shop');
        const clinic = path.join(work, 'clinic');
        const viaLink = junction(clinic, path.join(base, 'f2-link-to-clinic'));
        expect(fs.realpathSync.native(viaLink).toLowerCase()).toBe(fs.realpathSync.native(clinic).toLowerCase());
        //  Chat A's recorded live folder is the clinic; chat B registered the clinic through the junction.
        const roots = projectRecoveryScope({ dir: shop, live: { cwd: clinic, projectCwd: clinic } }, [viaLink]).roots.map(r => path.resolve(r));
        expect(roots).toEqual([path.resolve(shop)]);
        //  …and the other way round: chat A recorded the junction, chat B the real folder.
        expect(projectRecoveryScope({ dir: shop, live: { cwd: viaLink } }, [clinic]).roots.map(r => path.resolve(r))).toEqual([path.resolve(shop)]);
        //  A chat whose folder holds the clinic (known to it by the junction): the clinic is excluded, not a server folder.
        const holder = projectRecoveryScope({ dir: work }, [viaLink]);
        expect(holder.exclude).toEqual([viaLink]);
        expect(holder.roots.map(r => path.resolve(r))).toEqual([path.resolve(work)]);
        //  The clinic's server (its working folder spelled the real way) is neither counted nor stopped by the holder's restore.
        const { _runningServers, portsOfServersServing, stopServersServing } = require('../modules/tools/definitions/ProjectRunTool');
        const port = await freePort();
        const child = fork(path.join(clinic, 'server.js'), [String(port)], { cwd: clinic, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        _runningServers.set('joe-r11-clinic', { pid: child.pid, port, cwd: clinic, command: 'node server.js', startedAt: Date.now() });
        expect(portsOfServersServing([work], undefined, [viaLink])).not.toContain(port);
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const stop = await executionFirewall.runInContext('joe-r11-f2-stop', () => stopServersServing([work], undefined, [], [viaLink]));
        expect(stop.stopped.map((s: any) => s.port)).not.toContain(port);
        expect(await answers(port)).toBe(true);
        //  The same server, its folder a root by a second spelling: it IS this project's, and counted.
        expect(portsOfServersServing([viaLink], undefined, [])).toContain(port);
    });

    it('his own project known by a second spelling is one root, not two', () => {
        const work = folder('f2-own', { 'shop/data/a.json': '[]', 'shop/api/server.js': '' });
        const shop = path.join(work, 'shop');
        const viaLink = junction(shop, path.join(base, 'f2-link-to-shop'));
        const roots = projectRecoveryScope({ dir: shop, live: { cwd: viaLink } }, []).roots.map(r => path.resolve(r));
        expect(roots).toEqual([path.resolve(shop), path.resolve(shop, 'api')]);
    });
});

describe('F3 — «once» holds when the record cannot be rewritten', () => {
    async function listedShop(name: string, sessionId: string): Promise<{ id: string; F: string }> {
        const root = folder(name, { 'data/orders.json': '[{"id":1}]' });
        const F = path.join(root, 'data', 'orders.json');
        await oneRun('ws-r11', root, 'run-1', 'data/orders.json', '[{"id":1},{"id":2,"name":"Joe QA"}]');
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'show my data copies'));
        return { id: listed.output.versions[0].id, F };
    }
    /** From here on the disk refuses the record: every write (a full disk), and with `removals` every removal too. */
    function fullDisk(removals: boolean) {
        const enospc = () => Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
        const inRecord = (p: unknown) => String(p).includes('qa-recovery-shown');
        const names: Array<'writeFileSync' | 'renameSync' | 'rmSync' | 'unlinkSync'> = ['writeFileSync', 'renameSync', ...(removals ? ['rmSync', 'unlinkSync'] as const : [])];
        for (const name of names) {
            const real = (fs as any)[name].bind(fs);
            jest.spyOn(fs as any, name).mockImplementation((...args: any[]) => { if (inRecord(args[0])) throw enospc(); return real(...args); });
        }
    }

    it('the «used» record cannot be written: the copy comes back once, the same line never again', async () => {
        const sessionId = 'joe-r11-full';
        const { id, F } = await listedShop('f3-full', sessionId);
        fullDisk(false);
        fs.writeFileSync(F, '[{"id":1},{"id":3,"name":"today"}]');
        const first = await restore(sessionId, 'turn-2', id);
        expect([first.ok, first.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/orders.json']]);
        const afterFirst = read(F);
        fs.writeFileSync(F, '[{"id":1},{"id":4,"name":"after the restore"}]');
        const again = await restore(sessionId, 'turn-3', id);
        expect(again.output.restored).toBeUndefined();
        expect(again.output.message).toMatch(/was used already/u);
        expect(read(F)).toBe('[{"id":1},{"id":4,"name":"after the restore"}]');
        expect(afterFirst).toBe('[{"id":1},{"id":2,"name":"Joe QA"}]');
    });

    it('neither the «used» record nor the removal of the unused one is taken: nothing comes back, truthfully, his data as it was', async () => {
        const sessionId = 'joe-r11-full-all';
        const { id, F } = await listedShop('f3-full-all', sessionId);
        fullDisk(true);
        const today = '[{"id":1},{"id":3,"name":"today"}]';
        fs.writeFileSync(F, today);
        for (const t of ['turn-2', 'turn-3']) {
            const r = await restore(sessionId, t, id);
            expect([r.ok, r.error, r.output.nonRecoverable]).toEqual([false, 'use_not_recorded', true]);
            expect(r.output.message).toMatch(/Nothing was brought back: Joe could not record that the line/u);
            expect(r.output.message).not.toMatch(/was used already/u);
            expect(read(F)).toBe(today);
        }
    });

    it('a new list the disk would not take is the one that counts — never an older one left on disk', async () => {
        const sessionId = 'joe-r11-newer';
        const { id, F } = await listedShop('f3-newer', sessionId);
        //  The first line is used, on a healthy disk.
        expect((await restore(sessionId, 'turn-2', id)).ok).toBe(true);
        //  The disk fills; he asks for the list again — it lives in memory only.
        fullDisk(false);
        const again: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-3', 'show my data copies'));
        expect(again.ok).toBe(true);
        fs.writeFileSync(F, '[{"id":1},{"id":5,"name":"today"}]');
        //  Its line (the same id, a new list) brings the copy back once; the newest record speaks, not the used one on disk.
        const r = await restore(sessionId, 'turn-4', id);
        expect([r.ok, r.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/orders.json']]);
        fs.writeFileSync(F, '[{"id":1},{"id":6,"name":"later"}]');
        const twice = await restore(sessionId, 'turn-5', id);
        expect(twice.output.restored).toBeUndefined();
        expect(read(F)).toBe('[{"id":1},{"id":6,"name":"later"}]');
    });
});

describe('F4 — the keyboards\' own yeh and kaf, and nothing else', () => {
    const id = '20261117-002502';
    it('the final «ى» and the Persian «ی» are his show line; the Persian «ی» is his restore line', () => {
        for (const yes of ['اعرض نسخ بياناتى', 'اعرض نسخ بیاناتی', 'اعرض نسخ بياناتی', 'أعرض نسخ بياناتى.', 'اعرض نسخ بياناتى !']) {
            expect([yes, RR().isShowCopiesLine(yes)]).toEqual([yes, true]);
        }
        expect(RR().restoreReplyCopyId(`استعید النسخة ${id}`)).toBe(id);
        expect(RR().restoreReplyCopyId(`استعید النسخه ${id}`)).toBe(id);
    });
    it('…and nothing more folds in', () => {
        for (const no of ['اعرض نسخ بيانىاتي', 'اعرض نسخ بياناتى؟', 'اعرض نسخ بياناتىى', 'اعرض نسخ بياناتک', 'اعرض نسخ بيانات', 'اعرض نسخى بياناتي', '«اعرض نسخ بياناتى»', 'اعرض نسخ بياناتي ي']) {
            expect([no, RR().isShowCopiesLine(no)]).toEqual([no, false]);
        }
        for (const no of [`استعى النسخة ${id}`, `استعدی النسخة ${id}`, `استعید النسخة ${id}؟`]) {
            expect([no, RR().restoreReplyCopyId(no)]).toEqual([no, undefined]);
        }
    });
});

describe('F5 — the restart\'s environment is what project_run passed, and nothing claims more', () => {
    it('a real start records only what project_run passed (PORT, HOST, BROWSER, CI); a restart carries those, the port never', async () => {
        const root = folder('f5-run', { 'srv.cjs': "require('http').createServer((q,s)=>s.end('x')).listen(Number(process.env.PORT),'127.0.0.1');", 'package.json': '{"name":"f5","scripts":{"start":"node srv.cjs"}}' });
        const run = require('../modules/tools/definitions/ProjectRunTool');
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const key = 'joe-r11-f5';
        const port = await freePort();
        const r: any = await executionFirewall.runInContext('joe-r11-f5-run', () => new run.ProjectRunTool().execute({ cwd: root, restart: true, command: 'node srv.cjs', port }, { restartKey: key, restartEnv: { PORT: '1', EXTRA: 'from-a-restart' }, language: 'en', runId: 'joe-r11-f5-run' }));
        expect(r.ok).toBe(true);
        const env = run._runningServers.get(key)?.env;
        expect(Object.keys(env || {}).sort()).toEqual(['BROWSER', 'CI', 'EXTRA', 'HOST', 'PORT']);
        expect(env.PORT).toBe(String(r.output.port));
        //  The start that is not a restart passes the four, nothing else.
        const key2 = 'joe-r11-f5-b';
        const port2 = await freePort();
        const r2: any = await executionFirewall.runInContext('joe-r11-f5-run2', () => new run.ProjectRunTool().execute({ cwd: root, restart: true, command: 'node srv.cjs', port: port2 }, { workspaceId: key2, restartEnv: { EXTRA: 'never without restartKey' }, language: 'en', runId: 'joe-r11-f5-run2' }));
        expect(r2.ok).toBe(true);
        expect(Object.keys(run._runningServers.get(key2)?.env || {}).sort()).toEqual(['BROWSER', 'CI', 'HOST', 'PORT']);
    });
    it('no comment or test claims a restart gives a server an environment it needed from outside Joe', () => {
        const src = read(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'));
        expect(src).not.toMatch(/beyond the inherited one/u);
        expect(src).not.toMatch(/The environment Joe started it with/u);
        expect(src).toMatch(/never an environment it\s+\/\/\s+needed from outside Joe/u);
        const test = read(path.join(__dirname, 'a-failed-restore-is-final-and-his-copies-have-their-own-line.test.ts'));
        expect(test).not.toMatch(/the server that needs it answers again/u);
    });
});
