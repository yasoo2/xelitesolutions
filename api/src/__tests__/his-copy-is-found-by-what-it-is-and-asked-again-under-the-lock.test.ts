/**
 * HIS COPY IS FOUND BY WHAT IT IS, AND ASKED AGAIN UNDER THE LOCK (review 12: L1, L2, M1, L3).
 *
 *   L1  The listed copy was looked up by its id. Ids are given by time — two copies made in the same second are `X`
 *       and `X-2` — so when the older one was pruned after the list, the other became `X`: his real line for `X-2`
 *       was refused («its folder changed, or it is another chat's project now», both untrue), and his line for the
 *       pruned `X` was told the same instead of «no longer kept». Now the copy is found by its folder, run and version.
 *   L2  «Once» read any failure to read the record as «no record»: with the record held by another program (EBUSY —
 *       an antivirus, an indexer), the use was kept only in memory and the unused record stayed on disk, so a second
 *       Joe, or this one after a restart, brought the same copy back again. Now only ENOENT is «gone».
 *   M1  Every list and restore resolved (realpath) the project of every chat Joe knows, about three times each: on a
 *       server of many sessions the whole process stopped for seconds. Now one resolver per call, at about an lstat
 *       per folder, and his own folder resolved once.
 *   L3  The scope was computed before the wait for the locks (up to five seconds): a folder that became another
 *       chat's project during the wait was still stopped and written. Now it is asked again under the locks.
 */
import fs from 'fs';
import { fork } from 'child_process';
import net from 'net';
import os from 'os';
import path from 'path';
import { acquireVerifyLock, recoveryRunDir } from '../core/quality/qa-leaves-no-trace';
import { _forgetRecoveryConfirmations, ProjectDataRecoveryTool, projectRecoveryScope } from '../modules/tools/definitions/ProjectDataRecoveryTool';

jest.setTimeout(240_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r12-what-'));
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = path.join(base, 'joe-data');
const savedNarration = process.env.DISABLE_NARRATION;
process.env.DISABLE_NARRATION = 'true';
const children: Array<{ kill(): void }> = [];
const links: string[] = [];
const projectKeys: string[] = [];
afterAll(async () => {
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
    for (const key of Array.from(_runningServers.keys()) as string[]) if (String(key).startsWith('joe-r12-')) _runningServers.delete(key);
    for (const k of projectKeys) delete ((global as any).joeProjects || {})[k];
    //  The links first, on their own: a removal through a junction would reach what it points at.
    for (const l of links) { try { fs.unlinkSync(l); } catch { try { fs.rmdirSync(l); } catch { /* gone */ } } }
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    if (savedNarration === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = savedNarration;
    try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* a stopped server's file: gone at teardown */ }
});
afterEach(() => { _forgetRecoveryConfirmations(); jest.restoreAllMocks(); });

const { writeJoeProject } = require('../api/page-store');
const { previewKey } = require('../modules/tools/preview-site');
const read = (f: string) => fs.readFileSync(f, 'utf8');
const answers = (port: number) => new Promise<boolean>(res => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
const freePort = () => new Promise<number>(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const SERVER = "require('http').createServer((q,s)=>s.end('x')).listen(Number(process.env.PORT||process.argv[2]),'127.0.0.1',()=>process.send&&process.send('up'));";
const WS = 'ws-r12';

function folder(rel: string, files: Record<string, string>): string {
    const root = path.join(base, rel);
    fs.mkdirSync(root, { recursive: true });
    for (const [f, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
        fs.writeFileSync(path.join(root, f), text);
    }
    return root;
}
/** One kept copy, as the checks keep it: `<run>/1/<file>` and the run's `run.json`. */
function keptCopy(root: string, runId: string, at: number, rel: string, content: string): string {
    const run = recoveryRunDir(WS, root, runId);
    fs.mkdirSync(path.dirname(path.join(run, '1', rel)), { recursive: true });
    fs.writeFileSync(path.join(run, '1', rel), content);
    fs.writeFileSync(path.join(run, 'run.json'), JSON.stringify({ runId, startedAt: at, versions: [{ n: 1, at, files: [rel], bytes: content.length }] }));
    return run;
}
function openProject(sessionId: string, entry: Record<string, unknown>) {
    projectKeys.push(previewKey(sessionId));
    writeJoeProject(previewKey(sessionId), { type: 'agent', updatedAt: Date.now(), ...entry }, 'run-earlier');
}
const tool = new ProjectDataRecoveryTool();
const turn = (sessionId: string, runId: string, ownerMessage: unknown, language = 'en') => ({ sessionId, workspaceId: WS, language, runId, ownerMessage });
const restoreWith = (t: ProjectDataRecoveryTool, sessionId: string, runId: string, id: string): Promise<any> => {
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    return executionFirewall.runInContext(`joe-r12-${runId}`, () => t.execute({ action: 'restore', restore: id }, turn(sessionId, runId, `restore copy ${id}`)));
};
const restore = (sessionId: string, runId: string, id: string) => restoreWith(tool, sessionId, runId, id);
const list = async (sessionId: string, runId = 'turn-1'): Promise<any> => tool.execute({ action: 'list' }, turn(sessionId, runId, 'show my data copies'));

describe('L1 — the listed copy is found by its folder, run and version, never by an id that shifted', () => {
    /** Two copies made in the same second: ids X (the older, COPY A) and X-2 (COPY B). */
    async function sameSecond(name: string, sessionId: string) {
        const shop = folder(name, { 'data/orders.json': '[{"id":1,"item":"today"}]' });
        const F = path.join(shop, 'data', 'orders.json');
        const T = Math.floor(Date.now() / 1000) * 1000 - 60_000;
        const runA = keptCopy(shop, 'run-a', T + 100, 'data/orders.json', '[{"id":1,"item":"COPY A"}]');
        keptCopy(shop, 'run-b', T + 200, 'data/orders.json', '[{"id":1,"item":"COPY B"}]');
        openProject(sessionId, { dir: shop });
        const listed = await list(sessionId);
        const ids = listed.output.versions.map((v: any) => v.id);
        const X = ids.find((i: string) => !i.endsWith('-2'));
        expect(ids).toEqual([`${X}-2`, X]);
        return { F, X, runA };
    }

    it('the older copy of the same second is pruned after the list: his line for X-2 brings COPY B back', async () => {
        const { F, X, runA } = await sameSecond('l1-shift', 'joe-r12-shift');
        fs.rmSync(runA, { recursive: true, force: true });
        const r = await restore('joe-r12-shift', 'turn-2', `${X}-2`);
        expect([r.ok, r.error, r.output.restored?.map((x: any) => x.file)]).toEqual([true, undefined, ['data/orders.json']]);
        expect(read(F)).toBe('[{"id":1,"item":"COPY B"}]');
    });

    it('his line for the pruned X is told «no longer kept» — never «its folder changed», never the other copy', async () => {
        const { F, X, runA } = await sameSecond('l1-older', 'joe-r12-older');
        fs.rmSync(runA, { recursive: true, force: true });
        const r = await restore('joe-r12-older', 'turn-2', X);
        expect([r.ok, r.error, r.output.nonRecoverable]).toEqual([false, 'not_kept', true]);
        expect(r.output.message).toMatch(new RegExp(`copy ${X} is no longer kept`, 'u'));
        expect(r.output.message).not.toMatch(/its folder changed/u);
        expect(read(F)).toBe('[{"id":1,"item":"today"}]');
        //  Not a use of the line: the list's other copy is still his to bring back, in a later turn.
        const b = await restore('joe-r12-older', 'turn-3', `${X}-2`);
        expect([b.ok, b.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/orders.json']]);
        expect(read(F)).toBe('[{"id":1,"item":"COPY B"}]');
    });
});

describe('L2 — «once» holds when the record is held by another program', () => {
    async function listedShop(name: string, sessionId: string): Promise<{ id: string; F: string }> {
        const root = folder(name, { 'data/orders.json': '[{"id":1,"item":"today"}]' });
        keptCopy(root, 'run-1', Date.now() - 60_000, 'data/orders.json', '[{"id":1,"item":"COPY"}]');
        openProject(sessionId, { dir: root });
        const listed = await list(sessionId);
        return { id: listed.output.versions[0].id, F: path.join(root, 'data', 'orders.json') };
    }
    const busy = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    const inRecord = (p: unknown) => String(p).includes('qa-recovery-shown');
    /** The record is held (a sharing violation): its write, rename and removal refused; with `reads`, its read too — from the first write on, or at once. */
    function held(reads: 'after-first-write' | 'always' | 'never') {
        let writing = reads === 'always';
        for (const name of ['writeFileSync', 'renameSync', 'rmSync', 'unlinkSync'] as const) {
            const real = (fs as any)[name].bind(fs);
            jest.spyOn(fs as any, name).mockImplementation((...args: any[]) => { if (inRecord(args[0])) { writing = true; throw busy(); } return real(...args); });
        }
        if (reads === 'never') return;
        const realRead = fs.readFileSync.bind(fs);
        jest.spyOn(fs, 'readFileSync').mockImplementation(((p: any, ...rest: any[]) => { if (writing && inRecord(p)) throw busy(); return (realRead as any)(p, ...rest); }) as any);
    }

    it('nothing comes back while the record can be neither written nor read; afterwards one Joe or another brings it back once', async () => {
        const sessionId = 'joe-r12-busy';
        const { id, F } = await listedShop('l2-busy', sessionId);
        held('after-first-write');
        const today = '[{"id":1,"item":"today"},{"id":2,"item":"order taken now"}]';
        fs.writeFileSync(F, today);
        const first = await restore(sessionId, 'turn-2', id);
        expect([first.ok, first.error, first.output.nonRecoverable]).toEqual([false, 'use_not_recorded', true]);
        expect(first.output.restored).toBeUndefined();
        expect(first.output.message).toMatch(/Nothing was brought back: Joe could not record that the line/u);
        expect(first.output.message).toMatch(/another program holds the list's record/u);
        expect(read(F)).toBe(today);
        jest.restoreAllMocks();
        //  A second Joe on the same data folder (or this one after a restart): its own memory, the same record on disk.
        let other: ProjectDataRecoveryTool | undefined;
        jest.isolateModules(() => { other = new (require('../modules/tools/definitions/ProjectDataRecoveryTool').ProjectDataRecoveryTool)(); });
        const second = await restoreWith(other!, sessionId, 'turn-3', id);
        expect([second.ok, second.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/orders.json']]);
        expect(read(F)).toBe('[{"id":1,"item":"COPY"}]');
        const later = '[{"id":1,"item":"COPY"},{"id":3,"item":"order taken after the restore (must stay)"}]';
        fs.writeFileSync(F, later);
        //  The first Joe — whose memory still holds the list unused — reads the use the second recorded on disk.
        //  (Its refusal shows the list again, and that new list's line is a new line: so one refusal is asked here.)
        const again = await restoreWith(tool, sessionId, 'turn-4', id);
        expect(again.output.restored).toBeUndefined();
        expect(again.output.message).toMatch(/was used already/u);
        expect(read(F)).toBe(later);
    });

    it('a record that cannot be read at all is never «no list shown yet»: nothing comes back, truthfully, the record left as it is', async () => {
        const sessionId = 'joe-r12-busy-read';
        const { id, F } = await listedShop('l2-busy-read', sessionId);
        const recordFile = path.join(process.env.JOE_DATA_DIR as string, 'qa-recovery-shown', fs.readdirSync(path.join(process.env.JOE_DATA_DIR as string, 'qa-recovery-shown'))[0]);
        const before = read(recordFile);
        held('always');
        const r = await restore(sessionId, 'turn-2', id);
        expect([r.ok, r.error, r.output.nonRecoverable]).toEqual([false, 'use_not_recorded', true]);
        expect(r.output.message).toMatch(/cannot read the record of the list/u);
        expect(r.output.message).not.toMatch(/has not shown you a list/u);
        expect(r.output.versions).toBeUndefined();
        jest.restoreAllMocks();
        expect(read(recordFile)).toBe(before);
        expect(read(F)).toBe('[{"id":1,"item":"today"}]');
        //  Once the record is free, his line works, once.
        const ok = await restore(sessionId, 'turn-3', id);
        expect([ok.ok, ok.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/orders.json']]);
    });

    it('a record that is only refused writes (ENOSPC, review 11) and then really gone still counts as gone: the copy comes back once', async () => {
        const sessionId = 'joe-r12-gone';
        const { id, F } = await listedShop('l2-gone', sessionId);
        //  The disk refuses writes and renames; the removal of the unused record succeeds (ENOENT afterwards).
        for (const name of ['writeFileSync', 'renameSync'] as const) {
            const real = (fs as any)[name].bind(fs);
            jest.spyOn(fs as any, name).mockImplementation((...args: any[]) => { if (inRecord(args[0])) throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }); return real(...args); });
        }
        const r = await restore(sessionId, 'turn-2', id);
        expect([r.ok, r.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/orders.json']]);
        expect(read(F)).toBe('[{"id":1,"item":"COPY"}]');
        fs.writeFileSync(F, '[{"id":9}]');
        const twice = await restore(sessionId, 'turn-3', id);
        expect(twice.output.restored).toBeUndefined();
        expect(read(F)).toBe('[{"id":9}]');
    });
});

describe('M1 — the scope of one call resolves each folder once, at about an lstat each', () => {
    it('hundreds of chats\' projects (half of them deleted): a handful of realpath calls, never one per chat', () => {
        const users = path.join(base, 'm1-users');
        const mine = folder('m1-mine', { 'api/server.js': '' });
        const added: string[] = [];
        for (let i = 0; i < 300; i++) {
            const d = path.join(users, `u${i}`);
            if (i % 2 === 0) fs.mkdirSync(d, { recursive: true });
            const k = `joe-r12-m1-${i}`;
            ((global as any).joeProjects ||= {})[k] = { dir: d, type: 'agent', updatedAt: Date.now() };
            added.push(k);
        }
        projectKeys.push(...added);
        //  A chat whose project is a folder inside his, registered through a junction: still that chat's project.
        const inner = folder('m1-mine/admin', { 'data/a.json': '[]' });
        const viaLink = path.join(base, 'm1-link-to-admin');
        fs.symlinkSync(inner, viaLink, 'junction');
        links.push(viaLink);
        (global as any).joeProjects['joe-r12-m1-link'] = { dir: viaLink, type: 'agent', updatedAt: Date.now() };
        projectKeys.push('joe-r12-m1-link');
        const realpath = jest.spyOn(fs.realpathSync, 'native');
        const t0 = Date.now();
        const scope = projectRecoveryScope({ dir: mine });
        const ms = Date.now() - t0;
        const calls = realpath.mock.calls.length;
        realpath.mockRestore();
        expect(scope.exclude).toEqual([path.resolve(viaLink)]);
        expect(scope.roots.map(r => path.resolve(r))).toEqual([path.resolve(mine), path.resolve(mine, 'api')]);
        //  4c34be39c: three realpath walks per chat (over 900 here). Now: his folder, the roots and the links.
        expect(calls).toBeLessThan(40);
        expect(ms).toBeLessThan(5_000);
    });
});

describe('M1 — realFolderResolver gives the answer of realFolderOf', () => {
    it('plain, other case, a junction and below it, a part not there yet, a dangling junction, a file, a device path, a short name', () => {
        const { realFolderOf, realFolderResolver } = require('../modules/tools/path-containment');
        const real = folder('m1-eq/Real', { 'sub/deep/f.txt': 'x' });
        const jn = path.join(base, 'm1-eq', 'jn');
        fs.symlinkSync(real, jn, 'junction');
        links.push(jn);
        const gone = folder('m1-eq/gone', {});
        const dangling = path.join(base, 'm1-eq', 'dangling');
        fs.symlinkSync(gone, dangling, 'junction');
        links.push(dangling);
        fs.rmdirSync(gone);
        const long = folder('m1-eq/a long folder name here', {});
        const B = String.fromCharCode(92);
        const cases = [real, real.toUpperCase(), real + path.sep, jn, path.join(jn, 'sub'), path.join(jn, 'sub', 'deep'), path.join(jn, 'not', 'yet'),
            dangling, path.join(dangling, 'x'), path.join(real, 'sub', 'deep', 'f.txt'), path.join(real, 'sub', 'deep', 'f.txt', 'x'),
            path.join(base, 'm1-eq', 'missing', 'a', 'b'), long, real + '.', path.join(base, 'm1-eq', 'متجر'), os.homedir(), path.parse(real).root,
            ...(process.platform === 'win32' ? [B + B + '?' + B + real, B + B + '?' + B + path.join(jn, 'sub')] : [])];
        //  Windows: the 8.3 short name of the long folder, when the volume keeps short names (cmd's own %~s).
        if (process.platform === 'win32') {
            let short = '';
            try {
                short = require('child_process').execFileSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${long}") do @echo %~sI"`], { windowsVerbatimArguments: true, encoding: 'utf8' }).trim();
            } catch { /* no cmd: the other cases still hold */ }
            if (short && short.includes('~')) cases.push(short, path.join(short, 'x'));
        }
        const shared = realFolderResolver();
        for (const c of cases) {
            expect([c, realFolderResolver()(c)]).toEqual([c, realFolderOf(c)]);
            expect([c, shared(c)]).toEqual([c, realFolderOf(c)]);
        }
        //  Many children of one folder are answered from one listing — the same answers.
        const many = path.join(base, 'm1-eq', 'many');
        for (let i = 0; i < 20; i += 2) fs.mkdirSync(path.join(many, `p${i}`), { recursive: true });
        fs.symlinkSync(real, path.join(many, 'p7'), 'junction');
        links.push(path.join(many, 'p7'));
        const one = realFolderResolver();
        for (let i = 0; i < 20; i++) expect(one(path.join(many, `p${i}`))).toBe(realFolderOf(path.join(many, `p${i}`)));
    });
});

describe('L3 — the scope is asked again once the locks are held', () => {
    it('a recorded folder that became another chat\'s project while the restore waited for its lock: nothing stopped or written there', async () => {
        const work = folder('l3-work', { 'shop/index.html': '<h1>shop</h1>', 'shop/data/cart.json': '[{"id":1}]', 'api/data/orders.json': '[{"id":1,"item":"old order"}]' });
        const shop = path.join(work, 'shop');
        const api = path.join(work, 'api');
        const F = path.join(api, 'data', 'orders.json');
        keptCopy(api, 'run-api', Date.now() - 120_000, 'data/orders.json', '[{"id":1,"item":"old order"},{"id":9,"item":"Joe QA"}]');
        keptCopy(shop, 'run-shop', Date.now() - 60_000, 'data/cart.json', '[{"id":1},{"id":2}]');
        openProject('joe-r12-A', { dir: shop, packagedInto: api });
        const listed = await list('joe-r12-A');
        const apiCopy = listed.output.versions.find((v: any) => path.resolve(v.folder) === path.resolve(api));
        const shopCopy = listed.output.versions.find((v: any) => path.resolve(v.folder) === path.resolve(shop));
        expect([!!apiCopy, !!shopCopy]).toEqual([true, true]);
        //  The server chat B will run there (started now, so the wait below is short and certain).
        fs.writeFileSync(path.join(api, 'server.cjs'), SERVER);
        const port = await freePort();
        const child = fork(path.join(api, 'server.cjs'), [String(port)], { cwd: api, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
        //  One of Joe's checks holds the API folder's lock as he sends his line.
        const check = await acquireVerifyLock(WS, api, 'joe-r12-check', { waitMs: 0 });
        expect(check).not.toBeNull();
        const pending = restore('joe-r12-A', 'turn-2', apiCopy.id);
        await new Promise(r => setTimeout(r, 600));
        //  Meanwhile chat B opens the API folder as ITS project, its server Joe's; its customer writes.
        const today = '[{"id":1,"item":"old order"},{"id":2,"item":"chat B customer order (today)"}]';
        fs.writeFileSync(F, today);
        _runningServers.set('joe-r12-api-b', { pid: child.pid, port, cwd: api, command: 'node server.cjs', startedAt: Date.now(), sessionKey: previewKey('joe-r12-B'), sessionId: 'joe-r12-B' });
        openProject('joe-r12-B', { dir: api });
        await check!.release();
        const r = await pending;
        expect([r.ok, r.error, r.output.nonRecoverable]).toEqual([false, 'copy_moved', true]);
        expect(r.output.message).toMatch(/Nothing was brought back and Joe stopped nothing/u);
        expect(read(F)).toBe(today);
        expect(await answers(port)).toBe(true);
        expect(_runningServers.has('joe-r12-api-b')).toBe(true);
        //  The shop's own copy, from the same list, still comes back in a later turn.
        const ok = await restore('joe-r12-A', 'turn-3', shopCopy.id);
        expect([ok.ok, ok.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/cart.json']]);
        expect(read(F)).toBe(today);
        expect(await answers(port)).toBe(true);
    });
});
