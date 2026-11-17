/**
 * A FAILED RESTORE IS FINAL, AND HIS COPIES HAVE THEIR OWN LINE (review 10: H1, M1, M2, M3, L1, L3, L4, L5).
 *
 *   H1  A refused or failed restore was ok:false with no reason to stop, so the orchestrator planned a repair, the
 *       planner's first door planned the restore again from the same context, and the node ran a second time in the
 *       same turn: the run ended ok:true with «Joe has not shown you a list yet», and his server, stopped for the
 *       restore, stayed down untold. Now every refusal is final, the door opens only on his fresh typed message (never
 *       a repair or a re-run), and the answer says first, plainly, when his server is down and how to start it.
 *   M1  A recorded folder that IS another chat's project passed; a session folder holding another chat's project
 *       walked into it. Now neither is ever a root, its copies are never listed or written, its server never stopped,
 *       and every listed copy names its folder.
 *   M2  The capability router (toolCatalog.ts) still ranked the tool by words: 18 of 144 short English phrasings
 *       planned it. Now no word router reaches it.
 *   M3  «ask Joe in the chat» led nowhere (or to the CODE undo). Now he is told one exact line, «اعرض نسخ بياناتي» /
 *       «show my data copies», read the same deterministic way as the restore line.
 *   L1  The common spellings of the verb, and a space before the final «.», are his line; nothing else folds in.
 *   L3  Which list was shown lives on disk: a restart of Joe does not refuse his real line.
 *   L4  With no typed text the doors stay shut — never a fallback to the goal.
 *   L5  A server started again gets the environment Joe started it with.
 */
jest.mock('../modules/services/ToolService', () => ({
    ...jest.requireActual('../modules/services/ToolService'), executeTool: jest.fn(),
}));
import fs from 'fs';
import { fork } from 'child_process';
import net from 'net';
import os from 'os';
import path from 'path';
import { executeTool } from '../modules/services/ToolService';
import { restoreReplyCopyId } from '../core/engine/restore-reply';
import { discardSnapshot, RECOVERY_BUDGET, recoveryRunDir, recoveryVersionDir, restoreAppData, snapshotAppData, watchAppData } from '../core/quality/qa-leaves-no-trace';
import { _forgetRecoveryConfirmations, ProjectDataRecoveryTool } from '../modules/tools/definitions/ProjectDataRecoveryTool';

/* Read when used, so each test below fails on its own where the code before review 10 lacks them. */
const RR = () => require('../core/engine/restore-reply');
const isShowCopiesLine = (t: unknown) => RR().isShowCopiesLine(t);
const isDataCopiesLine = (t: unknown) => RR().isDataCopiesLine(t);
const projectRecoveryScope = (p: any, o: string[]): { base: string; roots: string[]; exclude: string[] } => require('../modules/tools/definitions/ProjectDataRecoveryTool').projectRecoveryScope(p, o);
const SHOW_COPIES_AR = 'اعرض نسخ بياناتي';
const SHOW_COPIES_EN = 'show my data copies';

jest.setTimeout(240_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r10-final-'));
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = path.join(base, 'joe-data');
const savedNarration = process.env.DISABLE_NARRATION;
process.env.DISABLE_NARRATION = 'true';
const children: Array<{ kill(): void }> = [];
afterAll(async () => {
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    const { _runningServers, ProjectStopTool } = require('../modules/tools/definitions/ProjectRunTool');
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    for (const key of Array.from(_runningServers.keys()) as string[]) {
        if (String(key).startsWith('joe-r10-')) await executionFirewall.runInContext('joe-r10-stop', () => new ProjectStopTool().execute({}, { workspaceId: key })).catch(() => undefined);
    }
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    if (savedNarration === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = savedNarration;
    try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* a stopped server's file: gone at teardown */ }
});
afterEach(() => { _forgetRecoveryConfirmations(); jest.restoreAllMocks(); (executeTool as jest.Mock).mockReset(); });

const until = async (ok: () => boolean, ms = 10_000) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 50)); };
const { writeJoeProject } = require('../api/page-store');
const { previewKey } = require('../modules/tools/preview-site');
const read = (f: string) => fs.readFileSync(f, 'utf8');
const answers = (port: number) => new Promise<boolean>(res => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
const freePort = () => new Promise<number>(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });

function folder(rel: string, files: Record<string, string>): string {
    const root = path.join(base, rel);
    for (const [f, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
        fs.writeFileSync(path.join(root, f), text);
    }
    return root;
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
const turn = (sessionId: string, runId: string, ownerMessage: unknown, language = 'en') => ({ sessionId, workspaceId: 'ws-r10', language, runId, ownerMessage });
async function shop(name: string): Promise<{ root: string; F: string; today: string }> {
    const root = folder(name, { 'data/orders.json': '[{"id":1}]' });
    const F = path.join(root, 'data', 'orders.json');
    await oneRun('ws-r10', root, 'run-1', 'data/orders.json', '[{"id":1},{"id":2,"name":"Joe QA"}]');
    const today = '[{"id":1},{"id":3,"name":"today"}]';
    fs.writeFileSync(F, today);
    return { root, F, today };
}
const plan = async (sessionId: string, typed: unknown, goal: string, extra: Record<string, unknown> = {}): Promise<any> => {
    const { IntentParser } = require('../core/intelligence/IntentParser');
    const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
    return PlanningEngine.generatePlan({ intent: IntentParser.quickIntent(goal) || { goal } }, undefined, { sessionId, language: 'en', ...(typed !== undefined ? { ownerText: typed } : {}), ...extra });
};
const restores = (p: any) => (p?.steps || []).some((s: any) => s.tool === 'project_data_recovery' && s.input?.action === 'restore');
/** The real AgentOrchestrator on one typed message; its tool calls reach the real project_data_recovery, and are counted. */
async function orchestrate(sessionId: string, runId: string, typed: string, extra: Record<string, unknown> = {}) {
    const calls: Array<{ name: string; ok: boolean; error?: string; context: any }> = [];
    (executeTool as jest.Mock).mockImplementation(async (name: string, input: any, context: any) => {
        const r: any = name === 'project_data_recovery'
            ? await new ProjectDataRecoveryTool().execute(input, context)
            : { ok: false, error: 'not in this test', output: { message: 'not in this test' } };
        calls.push({ name, ok: r.ok, error: r.error, context });
        return r;
    });
    const { AgentOrchestrator } = require('../orchestration/AgentOrchestrator');
    const orchestrator: any = new AgentOrchestrator();
    orchestrator.selectOptimalAgent = jest.fn(async () => 'Dev');
    const result = await orchestrator.execute({ id: runId, runId, traceId: runId, goal: typed, context: { sessionId, workspaceId: 'ws-r10', language: 'en', ownerText: typed, userId: 'owner', isCancelled: () => false, ...extra } });
    return { calls, result };
}

describe('H1 — a refused or failed restore is final, and the answer is its own', () => {
    it('a copy gone before the restore: ONE call in the turn, the run ends ok:false with the true reason — never a second call that says «no list shown yet»', async () => {
        const { root, F, today } = await shop('gone');
        const sessionId = 'joe-r10-gone';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', SHOW_COPIES_EN));
        const id = listed.output.versions[0].id;
        //  Pruned, a full disk, a file another program holds: the copy is not there when his line comes.
        fs.rmSync(recoveryVersionDir('ws-r10', root, 'run-1', 1), { recursive: true, force: true });
        const { calls, result } = await orchestrate(sessionId, 'joe-r10-gone-turn-2', `restore copy ${id}`);
        expect(calls.map(c => [c.name, c.ok, c.error])).toEqual([['project_data_recovery', false, 'not_kept']]);
        expect(result.ok).toBe(false);
        const said = JSON.stringify(result.result);
        expect(said).toMatch(new RegExp(`copy ${id} is no longer kept`, 'u'));
        expect(said).not.toMatch(/has not shown you a list/u);
        expect(read(F)).toBe(today);
    });

    it('his server stopped for the restore and not started again: the answer says so FIRST, and how to start it', async () => {
        const { root, F, today } = await shop('down');
        const sessionId = 'joe-r10-down';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', SHOW_COPIES_EN));
        const id = listed.output.versions[0].id;
        const port = await freePort();
        const run = require('../modules/tools/definitions/ProjectRunTool');
        //  Joe stopped his server for the restore; its folder is gone, so it cannot come back; the copy cannot be written.
        jest.spyOn(run, 'stopServersServing').mockResolvedValue({ stopped: [{ pid: 1, port, cwd: path.join(base, 'no-such-folder') }], stillRunning: [] });
        const verify = require('../core/engine/verify');
        jest.spyOn(verify, 'restoreRecoveryVersion').mockResolvedValue({ ok: false, restored: [], skipped: [], keptAside: [], error: 'that version is not kept (it may have been pruned)' });
        const { calls, result } = await orchestrate(sessionId, 'joe-r10-down-turn-2', `restore copy ${id}`);
        expect(calls).toHaveLength(1);
        expect(result.ok).toBe(false);
        const out: any = result.result;
        expect(out.nonRecoverable).toBe(true);
        expect(out.serverDown).toEqual([port]);
        expect(out.message.startsWith(`⚠️ Your app's server on port ${port} is stopped now`)).toBe(true);
        expect(out.message).toMatch(/say «run the project» to start it/u);
        expect(out.message).toMatch(new RegExp(`Copy ${id} was not brought back: that version is not kept`, 'u'));
        //  …and in Arabic.
        const ar: any = await (async () => {
            await tool.execute({ action: 'list' }, turn(sessionId, 'turn-3', SHOW_COPIES_AR, 'ar'));
            const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
            return executionFirewall.runInContext('joe-r10-down-4', () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-4', `استعِد النسخة ${id}`, 'ar')));
        })();
        expect(ar.output.message.startsWith(`⚠️ خادم تطبيقك على المنفذ ${port} متوقف الآن`)).toBe(true);
        expect(ar.output.message).toMatch(/قل «شغّل المشروع» لتشغيله/u);
        expect(ar.output.message).toMatch(/لم تعد محفوظة/u);
        expect(read(F)).toBe(today);
    });

    it('every refusal of the restore path is marked final', async () => {
        const { root } = await shop('refusals');
        const sessionId = 'joe-r10-refusals';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', SHOW_COPIES_EN));
        const id = listed.output.versions[0].id;
        const nt = require('../core/quality/qa-leaves-no-trace');
        jest.spyOn(nt, 'acquireVerifyLock').mockRejectedValue(new Error('held'));
        const r: any = await tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-2', `restore copy ${id}`));
        expect([r.ok, r.error, r.output.nonRecoverable]).toEqual([false, 'check_running', true]);
        const none: any = await tool.execute({ action: 'list' }, { ...turn('joe-r10-no-project', 'turn-1', 'x') });
        expect([none.ok, none.output.nonRecoverable]).toEqual([false, true]);
    });

    it('the planner\'s restore door never opens on a repair goal, a resumed goal, or with no typed text (L4)', async () => {
        const { root } = await shop('door');
        const sessionId = 'joe-r10-door';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', SHOW_COPIES_EN));
        const line = `restore copy ${listed.output.versions[0].id}`;
        //  His fresh typed line: the door.
        expect(restores(await plan(sessionId, line, line))).toBe(true);
        //  The repair plan of the same turn carries the same context: never the door.
        const repair = `Fix and continue: إعادة نسخة من بيانات التطبيق بالسطر الذي أرسله المالك\n[THE STEP FAILED WITH THIS ERROR — read it and plan the repair around its cause]:\nCopy … was not brought back`;
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const repaired = await PlanningEngine.generatePlan({ intent: { goal: repair, complexity: 'high', riskLevel: 'medium', suggestedAgent: 'Dev', rawIntent: {} } }, undefined, { sessionId, language: 'en', ownerText: line });
        expect(restores(repaired)).toBe(false);
        //  A resumed goal that is the line, while he typed «continue».
        expect(restores(await plan(sessionId, 'continue', line))).toBe(false);
        //  No typed text passed (AgentLoopService's fallback to the goal): shut.
        expect(restores(await plan(sessionId, line, line, { ownerTyped: false }))).toBe(false);
        expect(restores(await plan(sessionId, undefined, line))).toBe(false);
        //  …and AgentLoopService says whether its words are what he typed.
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf8');
        expect(src).toMatch(/ownerTyped: typeof options\.ownerText === 'string'/u);
    });

    it('the orchestrator hands his line to the step his message planned — never to a repair node, a re-run, or without typed text', async () => {
        const seen: any[] = [];
        (executeTool as jest.Mock).mockImplementation(async (_n: string, _i: any, context: any) => { seen.push(context.ownerMessage); return { ok: true, output: { message: 'listed' } }; });
        const { AgentOrchestrator } = require('../orchestration/AgentOrchestrator');
        const line = 'restore copy 20261117-002502';
        for (const [retryCount, extra] of [[0, {}], [1, {}], [0, { ownerTyped: false }]] as Array<[number, Record<string, unknown>]>) {
            const o: any = new AgentOrchestrator();
            o.plan = jest.fn(async () => ({ id: 'p', status: 'idle', nodes: [{ id: 'project_data_recovery', agent: 'Dev', task: 't', tool: 'project_data_recovery', input: { action: 'restore', restore: '20261117-002502' }, dependencies: [], status: 'pending', retryCount }] }));
            o.selectOptimalAgent = jest.fn(async () => 'Dev');
            await o.execute({ id: `r-${retryCount}`, runId: `r-${retryCount}`, goal: line, context: { sessionId: 'joe-r10-msg', ownerText: line, isCancelled: () => false, ...extra } });
        }
        expect(seen).toEqual([line, '', '']);
    });

    it('a line used once says so when sent again — never «Joe has not shown you a list yet»', async () => {
        const { root, F } = await shop('used');
        const sessionId = 'joe-r10-used';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', SHOW_COPIES_EN));
        const id = listed.output.versions[0].id;
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const first: any = await executionFirewall.runInContext('joe-r10-used-2', () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-2', `restore copy ${id}`)));
        expect(first.ok).toBe(true);
        expect(read(F)).toBe('[{"id":1},{"id":2,"name":"Joe QA"}]');
        fs.writeFileSync(F, '[{"id":7}]');
        const again: any = await executionFirewall.runInContext('joe-r10-used-3', () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-3', `restore copy ${id}`)));
        expect(again.output.restored).toBeUndefined();
        expect(again.output.message).toMatch(new RegExp(`the line of the latest list you were shown was used already \\(for copy ${id}`, 'u'));
        expect(again.output.message).not.toMatch(/has not shown you a list/u);
        expect(read(F)).toBe('[{"id":7}]');
    });
});

describe('L3 — which list was shown survives a restart of Joe', () => {
    it('the list shown before a restart: his line after it brings the copy back; the record is a private file in Joe\'s data folder', async () => {
        const { root, F } = await shop('restart');
        const sessionId = 'joe-r10-restart';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', SHOW_COPIES_EN));
        const id = listed.output.versions[0].id;
        const home = path.join(process.env.JOE_DATA_DIR as string, 'qa-recovery-shown');
        expect(fs.readdirSync(home).filter(f => f.endsWith('.json'))).toHaveLength(1);
        expect(fs.readFileSync(path.join(home, fs.readdirSync(home)[0]), 'utf8')).not.toMatch(/orders\.json.*\[\{/u);
        //  A new Joe: the module loaded afresh, nothing in its memory.
        let Fresh: any;
        jest.isolateModules(() => { Fresh = require('../modules/tools/definitions/ProjectDataRecoveryTool').ProjectDataRecoveryTool; });
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const r: any = await executionFirewall.runInContext('joe-r10-restart-2', () => new Fresh().execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-2', `restore copy ${id}`)));
        expect([r.ok, r.output.restored?.map((x: any) => x.file)]).toEqual([true, ['data/orders.json']]);
        expect(read(F)).toBe('[{"id":1},{"id":2,"name":"Joe QA"}]');
    });
});

describe('M1 — another chat\'s project is never a root', () => {
    it('a recorded folder that is, holds, or sits inside another chat\'s project is refused; one of the project\'s own is kept', () => {
        const work = folder('m1-paths', { 'shop/data/a.json': '[]', 'shop/api/server.js': '', 'clinic/data/b.json': '[]', 'clinic/api/x.js': '', 'apps/clinic2/data/c.json': '[]', 'elsewhere/api/y.js': '' });
        const shopDir = path.join(work, 'shop');
        const others = [path.join(work, 'clinic'), path.join(work, 'apps', 'clinic2')];
        const scope = (live: string) => projectRecoveryScope({ dir: shopDir, live: { cwd: live } }, others).roots.map(r => path.relative(work, r).split(path.sep).join('/')).sort();
        expect(scope(path.join(work, 'clinic'))).toEqual(['shop', 'shop/api']);             // IS another chat's project
        expect(scope(path.join(work, 'clinic', 'api'))).toEqual(['shop', 'shop/api']);      // inside one
        expect(scope(path.join(work, 'apps'))).toEqual(['shop', 'shop/api']);               // holds one
        expect(scope(path.join(work, 'elsewhere', 'api'))).toEqual(['elsewhere/api', 'shop', 'shop/api']);
        //  A session folder that holds another chat's project: never walked into, and named for every reader.
        const holder = projectRecoveryScope({ dir: work }, others);
        expect(holder.exclude.map(e => path.relative(work, e).split(path.sep).join('/')).sort()).toEqual(['apps/clinic2', 'clinic']);
        expect(holder.roots.some(r => r.startsWith(path.join(work, 'clinic')) || r.startsWith(path.join(work, 'apps', 'clinic2')))).toBe(false);
    });

    it('a chat whose folder holds another chat\'s clinic: the clinic\'s copies are not his, its patients stay, its server keeps answering; each copy names its folder', async () => {
        const HOLDER = "require('http').createServer((q,s)=>s.end('x')).listen(Number(process.env.PORT||process.argv[2]),'127.0.0.1',()=>process.send&&process.send('up'));";
        const work = folder('m1-work', { 'shop/data/orders.json': '[{"id":1}]', 'shop/server.js': HOLDER, 'clinic/data/patients.json': '[{"id":1,"name":"old patient"}]', 'clinic/server.js': HOLDER });
        const clinic = path.join(work, 'clinic');
        const P = path.join(clinic, 'data', 'patients.json');
        //  Chat B's own check of its clinic kept a copy (by the clinic's folder); chat A's check kept one of its shop.
        await oneRun('ws-r10', clinic, 'run-b', 'data/patients.json', '[{"id":1,"name":"old patient"},{"id":9,"name":"Joe QA"}]');
        await oneRun('ws-r10', path.join(work, 'shop'), 'run-a', 'data/orders.json', '[{"id":1},{"id":2}]');
        const patientsToday = '[{"id":1,"name":"old patient"},{"id":2,"name":"Amal (today)"}]';
        fs.writeFileSync(P, patientsToday);
        const port = await freePort();
        const child = fork(path.join(clinic, 'server.js'), [String(port)], { cwd: clinic, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
        _runningServers.set('joe-r10-clinic-b', { pid: child.pid, port, cwd: clinic, command: 'node server.js', startedAt: Date.now(), sessionKey: previewKey('joe-r10-B'), sessionId: 'joe-r10-B' });
        openProject('joe-r10-B', { dir: clinic });
        openProject('joe-r10-A', { dir: work });
        const listed: any = await tool.execute({ action: 'list' }, turn('joe-r10-A', 'turn-1', SHOW_COPIES_EN));
        expect(listed.output.versions.map((v: any) => v.files)).toEqual([['data/orders.json']]);
        expect(listed.output.message).not.toMatch(/patients/u);
        expect(listed.output.message).toMatch(new RegExp(`data/orders\\.json \\(\\d+ records?\\) — in the folder «${path.basename(work)}/shop»`, 'u'));
        //  The clinic's copy, named on a forged line in chat A: nothing of the clinic.
        const { recoveryChoices } = require('../modules/tools/definitions/ProjectDataRecoveryTool');
        const clinicId = (await recoveryChoices('ws-r10', clinic))[0].id;
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const forged: any = await executionFirewall.runInContext('joe-r10-A-2', () => tool.execute({ action: 'restore', restore: clinicId }, turn('joe-r10-A', 'turn-2', `restore copy ${clinicId}`)));
        expect(forged.output.restored).toBeUndefined();
        //  His own copy comes back — and the clinic's server is not stopped for it.
        const own = listed.output.versions[0].id;
        await tool.execute({ action: 'list' }, turn('joe-r10-A', 'turn-3', SHOW_COPIES_EN));
        const r: any = await executionFirewall.runInContext('joe-r10-A-4', () => tool.execute({ action: 'restore', restore: own }, turn('joe-r10-A', 'turn-4', `restore copy ${own}`)));
        expect(r.output.restored?.map((x: any) => x.file)).toEqual(['data/orders.json']);
        expect(read(P)).toBe(patientsToday);
        expect(await answers(port)).toBe(true);
        expect(_runningServers.has('joe-r10-clinic-b')).toBe(true);
    });
});

describe('M2 — no word router reaches the tool', () => {
    const verbs = ['check', 'test', 'audit', 'inspect', 'analyze', 'review', 'scan', 'compare', 'measure', 'extract', 'summarize', 'profile'];
    const objs = ['the data recovery', 'my data recovery', 'the recovery copies', 'the data copies', 'my data copies', 'data recovery', 'the copies of my data', 'the data', 'my data', 'the records', 'the recovery', 'the copies'];
    const phrasings = verbs.flatMap(v => objs.map(o => `${v} ${o}`));
    const reviewed = ['review the project data model', 'test project data import', 'scan the project data folder', 'check the data recovery flow in my app'];

    it('the 144 phrasings and the review\'s four: never routed to it, never in the catalogue their words pick', () => {
        const { capabilityRoute, selectToolsFor, registeredToolNames } = require('../core/orchestrator/toolCatalog');
        expect(phrasings).toHaveLength(144);
        for (const m of [...phrasings, ...reviewed]) {
            expect([m, capabilityRoute(m, {})?.tool]).not.toEqual([m, 'project_data_recovery']);
            expect([m, selectToolsFor(m, 30).map((s: any) => s.name).includes('project_data_recovery')]).toEqual([m, false]);
        }
        //  Still a registered tool: its own lines plan it.
        expect(registeredToolNames()).toContain('project_data_recovery');
    });
});

describe('M3 — «اعرض نسخ بياناتي» / «show my data copies»: the one line that shows his copies', () => {
    it('is read exactly, the way the restore line is', () => {
        expect([RR().SHOW_COPIES_AR, RR().SHOW_COPIES_EN, RR().showCopiesLine(true), RR().showCopiesLine(false)]).toEqual([SHOW_COPIES_AR, SHOW_COPIES_EN, SHOW_COPIES_AR, SHOW_COPIES_EN]);
        for (const yes of [SHOW_COPIES_AR, SHOW_COPIES_EN, 'Show my data copies', 'show my data copies.', 'أعرض نسخ بياناتي', 'إعرض نسخ بياناتي !', '‏اعرض نسخ بياناتي‏', 'اعرِض نُسَخ بياناتي', 'show my  data copies']) {
            expect([yes, isShowCopiesLine(yes), isDataCopiesLine(yes)]).toEqual([yes, true, true]);
        }
        for (const no of ['اعرض نسخ بياناتي؟', '«اعرض نسخ بياناتي»', 'لا تعرض نسخ بياناتي', 'اعرض نسخ بياناتي بعدين', 'please show my data copies', 'show my data copies?', 'show my data copies..', 'ſhow my data copies', 'show my data copy', `${SHOW_COPIES_EN}\n${SHOW_COPIES_EN}`]) {
            expect([no, isShowCopiesLine(no)]).toEqual([no, false]);
        }
        expect(restoreReplyCopyId(SHOW_COPIES_EN)).toBeUndefined();
    });

    it('routes to the list with no model, in the intent, the planner and before the agent engine — and only on his typed line', async () => {
        const { root } = await shop('show');
        const sessionId = 'joe-r10-show';
        openProject(sessionId, { dir: root });
        const { IntentParser } = require('../core/intelligence/IntentParser');
        for (const line of [SHOW_COPIES_AR, SHOW_COPIES_EN]) {
            expect(IntentParser.quickIntent(line)?.requiredTools).toEqual(['project_data_recovery']);
            const ctx = IntentParser.createContext('orchestrator', 'global', [], undefined, undefined);
            expect((await IntentParser.parse(line, ctx)).requiredTools).toEqual(['project_data_recovery']);
            const p = await plan(sessionId, line, line);
            expect(p.steps.map((s: any) => [s.tool, s.input.action])).toEqual([['project_data_recovery', 'list']]);
            const { agentEngineRoute } = require('../core/engine/select');
            expect(await agentEngineRoute(line, { engine: 'agent', sessionId, runId: 'r', ownerText: line }, { JOE_ENGINE: 'agent' } as any, { ask: async () => '{"device":"none"}' })).toBeNull();
        }
        //  Not on a resumed goal, nor with no typed text.
        expect((await plan(sessionId, 'continue', SHOW_COPIES_EN)).steps.some((s: any) => s.tool === 'project_data_recovery')).toBe(false);
        //  The list it plans ends with the restore line.
        const p = await plan(sessionId, SHOW_COPIES_AR, SHOW_COPIES_AR);
        const listed: any = await tool.execute(p.steps[0].input, turn(sessionId, 'turn-1', SHOW_COPIES_AR, 'ar'));
        expect(listed.output.message.split('\n').pop()).toBe(`استعِد النسخة ${listed.output.versions[0].id}`);
    });

    it('every told line quotes it — never «ask Joe in the chat»; the certificate too', () => {
        const { qaPathLines } = require('../core/engine/verify');
        const { qaCertificateLine } = require('../core/engine/certificate');
        const q = { path: '2t' as const, blocked: 0, notTried: [], skippedProbes: [], walked: true, origin: 'http://127.0.0.1:5055', recovery: { versions: 2, bytes: 10, unexplained: ['data/orders.json'], overBudget: false, keptDays: 14 }, putBackFailed: ['data/shop.db (EBUSY)'], putBackFailedBefore: 'copies' as const };
        for (const lang of ['ar', 'en', 'es', 'fr', 'de', 'ru']) {
            const all = qaPathLines(q, lang).join('\n');
            const line = lang === 'ar' ? SHOW_COPIES_AR : SHOW_COPIES_EN;
            expect([lang, (all.match(new RegExp(`«${line}»`, 'gu')) || []).length]).toEqual([lang, 3]);
            expect(all).not.toMatch(/ask Joe|اطلب من جو|اطلبها من جو|pídele a Joe|pídesela|demandez à Joe|demandez-la à Joe|fragen Sie Joe|bitten Sie Joe|попросите Joe|попросите её у Joe/u);
        }
        expect(qaCertificateLine(q, 'en')).toMatch(/could not be put back: data\/shop\.db.*send a message that is nothing but «show my data copies»\./u);
        expect(qaCertificateLine(q, 'ar')).toContain(`«${SHOW_COPIES_AR}»`);
        expect(qaCertificateLine({ ...q, putBackFailedBefore: 'snapshot' }, 'en')).not.toMatch(/show my data copies/u);
    });
});

describe('L1 — the common spellings of his restore line, and nothing more', () => {
    const id = '20261117-002502';
    it('إستعد / أستعد / استعيد / استعِد and a space before the final «.» or «!» are his line', () => {
        for (const yes of [`إستعد النسخة ${id}`, `أستعد النسخة ${id}`, `استعيد النسخة ${id}`, `استعِد النسخة ${id}`, `restore copy ${id} .`, `استعد النسخة ${id} !`, `Restore copy ${id}.`]) {
            expect([yes, restoreReplyCopyId(yes)]).toEqual([yes, id]);
        }
    });
    it('…and no other id or text folds in', () => {
        for (const no of [`reſtore copy ${id}`, `restore copy ${id}..`, `restore copy ${id}?`, `استعد النسخة ${id}۔`, `استعدي النسخة ${id}`, `استعيدو النسخة ${id}`, `آستعد النسخة ${id}`, `please restore copy ${id}`, `restore copy ${id}-100`, `restore copy ２０２６１１１７-００２５０２`, `restore copy 20261117–002502`]) {
            expect([no, restoreReplyCopyId(no)]).toEqual([no, undefined]);
        }
        expect(restoreReplyCopyId(`restore copy ${id}-2`)).toBe(`${id}-2`);
    });
});

describe('L5 — a server started again gets the environment Joe started it with', () => {
    it('the environment rides from the running server to the stop to the start, and the server that needs it answers again', async () => {
        //  This server does not start without NEEDS=1 in its environment.
        const NEEDY = "if(process.env.NEEDS!=='1')process.exit(3);require('http').createServer((q,s)=>s.end('needy')).listen(Number(process.env.PORT||process.argv[2]),'127.0.0.1',()=>process.send&&process.send('up'));";
        const root = folder('needy', { 'needy.cjs': NEEDY, 'data/orders.json': '[]' });
        const port = await freePort();
        const child = fork(path.join(root, 'needy.cjs'), [String(port)], { cwd: root, env: { ...process.env, NEEDS: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        const run = require('../modules/tools/definitions/ProjectRunTool');
        const key = 'joe-r10-needy';
        run._runningServers.set(key, { pid: child.pid, port, cwd: root, command: 'node needy.cjs', startedAt: Date.now(), env: { NEEDS: '1', PORT: String(port) } });
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const logs: string[] = [];
        const stop = await executionFirewall.runInContext('joe-r10-needy-stop', () => run.stopServersServing([root], undefined, logs));
        expect(stop.stopped.map((s: any) => s.env)).toEqual([{ NEEDS: '1', PORT: String(port) }]);
        expect(await answers(port)).toBe(false);
        const back = await executionFirewall.runInContext('joe-r10-needy-start', () => run.startServersAgain(stop.stopped, { language: 'en', runId: 'joe-r10-needy-start' }, logs));
        expect(back.map((b: any) => [b.port, b.started])).toEqual([[port, true]]);
        expect(await answers(port)).toBe(true);
        expect(run._runningServers.get(key)?.env).toMatchObject({ NEEDS: '1', PORT: String(port) });
    });
});
