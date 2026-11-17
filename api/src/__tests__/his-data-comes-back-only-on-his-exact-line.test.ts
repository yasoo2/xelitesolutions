/**
 * HIS DATA COMES BACK ONLY ON HIS EXACT LINE (review 9: H1, M1, H2, M2, L3, M3, L1).
 *
 * Two rounds of reading his intent from words each opened a new hole. Review 9 proved that after a list, a question,
 * a quote, a «later» or an «if» that held the copy's id and «نعم»/«yes» brought an old copy back over today's records
 * (H1), and that ordinary work — «رجع البيانات مرتبة حسب التاريخ», «restore the data validation on the form» — was
 * taken for a request for his copies (M1). Now no word decides it:
 *   H1  the list ends with ONE line; only his whole typed message being exactly that line, for a copy the latest list
 *       of this session and project showed, in a later turn, within thirty minutes, once, brings it back. Every other
 *       message — the review's six among them — leaves today's records as they are.
 *   M1  ordinary messages route exactly as on main.
 *   H2  the restore's folders never climb above the project; the home folder's `.joe` is nobody's project; a restore
 *       in one chat never stops another chat's server.
 *   M2  a program answering on a port the app names that is not one of Joe's servers refuses the restore BEFORE
 *   L3  anything is stopped, and says it truthfully; a step that fails after Joe's servers were stopped starts them
 *       again and says so.
 *   M3  a store whose folder comes from the start's arguments is never covered, whatever the file sets.
 *   L1  the reply is read from what he typed — never a file's block, a picture's text or a resumed goal.
 */
import fs from 'fs';
import { fork } from 'child_process';
import net from 'net';
import os from 'os';
import path from 'path';
import { agentEngineRoute, isFollowUpChange, startsAfresh } from '../core/engine/select';
import { restoreLine, restoreReplyCopyId } from '../core/engine/restore-reply';
import { discardSnapshot, RECOVERY_BUDGET, recoveryRunDir, restoreAppData, snapshotAppData, watchAppData } from '../core/quality/qa-leaves-no-trace';
import { chooseQaPath } from '../core/quality/qa-target';
import { isHomeDriveOrAbove } from '../modules/tools/path-containment';
import {
    _forgetRecoveryConfirmations, ProjectDataRecoveryTool, projectRecoveryRoots, recoveryChoices, recoveryRoots,
} from '../modules/tools/definitions/ProjectDataRecoveryTool';

jest.setTimeout(240_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r9-line-'));
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = path.join(base, 'joe-data');
const children: Array<{ kill(): void }> = [];
afterAll(async () => {
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    const { ProjectStopTool } = require('../modules/tools/definitions/ProjectRunTool');
    for (const key of Array.from(_runningServers.keys()) as string[]) {
        if (String(key).startsWith('joe-r9-')) await executionFirewall.runInContext('joe-r9-stop', () => new ProjectStopTool().execute({}, { workspaceId: key })).catch(() => undefined);
    }
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    try { fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch { /* a stopped server's file: gone at teardown */ }
});
afterEach(() => { _forgetRecoveryConfirmations(); jest.restoreAllMocks(); });

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
    fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
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
const TODAY = JSON.stringify([{ id: 1, name: 'old patient' }, { id: 2, name: 'Amal' }, { id: 3, name: 'Khalid' }]);
/** The clinic of review 9: a copy from last week that holds a Joe QA record, and today's patients Amal and Khalid. */
async function clinic(name: string): Promise<{ root: string; F: string }> {
    const root = folder(name, { 'data/patients.json': JSON.stringify([{ id: 1, name: 'old patient' }]) });
    const F = path.join(root, 'data', 'patients.json');
    await oneRun('ws-r9', root, 'run-last-week', 'data/patients.json', JSON.stringify([{ id: 1, name: 'old patient' }, { id: 99, name: 'Joe QA test' }]));
    fs.writeFileSync(F, TODAY);
    return { root, F };
}
const tool = new ProjectDataRecoveryTool();
const turn = (sessionId: string, runId: string, ownerMessage: unknown, language = 'en') => ({ sessionId, workspaceId: 'ws-r9', language, runId, ownerMessage });
const plan = async (sessionId: string, typed: string, language = 'en', goal = typed): Promise<any> => {
    const { IntentParser } = require('../core/intelligence/IntentParser');
    const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
    return PlanningEngine.generatePlan({ intent: IntentParser.quickIntent(goal) || { goal } }, undefined, { sessionId, language, ownerText: typed });
};

/* The six messages of review 9 (question-restores.js) that brought the copy back at once. */
const SIX = [
    'can you confirm copy ID has yesterday\'s orders before you restore it?',
    'do I have to write «yes, restore copy ID» to bring it back?',
    'yes restore copy ID but wait until tonight, the shop is open now',
    'هل لازم أكتب «نعم، رجّع النسخة ID» عشان ترجع البيانات؟',
    'نعم رجّع النسخة ID بس مو الحين',
    'نعم، رجّع النسخة ID إذا فيها سجل أمل',
];

describe('H1 — only his exact line brings a copy back', () => {
    it('the six messages of review 9 leave today\'s records untouched: not routed, not planned, and refused even when a model asks the tool to restore on them', async () => {
        const { root, F } = await clinic('six');
        const sessionId = 'joe-r9-six';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'which copies of my data do you keep?'));
        const id = listed.output.versions[0].id;
        const { IntentParser } = require('../core/intelligence/IntentParser');
        for (const [i, m] of SIX.entries()) {
            const msg = m.replace('ID', id);
            expect([msg, restoreReplyCopyId(msg)]).toEqual([msg, undefined]);
            expect([msg, (IntentParser.quickIntent(msg)?.requiredTools || []).includes('project_data_recovery')]).toEqual([msg, false]);
            const r: any = await tool.execute({ action: 'restore', restore: id }, turn(sessionId, `turn-2-${i}`, msg));
            expect([msg, r.output.restored]).toEqual([msg, undefined]);
            expect(read(F)).toBe(TODAY);
        }
    });

    it('his exact line, as his whole message, brings it back — through the planner, in a later turn, once', async () => {
        const { root, F } = await clinic('line');
        const sessionId = 'joe-r9-line';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'which copies do you keep?'));
        const id = listed.output.versions[0].id;
        const msg: string = listed.output.message;
        //  The list ends with the one line, says only it restores, and that today's data is kept aside first.
        expect(msg.split('\n').pop()).toBe(`restore copy ${id}`);
        expect(msg).toMatch(/nothing but the line below/u);
        expect(msg).toMatch(/keeps today's data aside first/u);
        expect(msg).toMatch(/a question, a condition, «later», «ok», or this line inside a sentence — brings nothing back/u);
        //  No token is handed to the model.
        expect(JSON.stringify(listed.output)).not.toMatch(/token/iu);
        const line = restoreLine(id, false);
        const p = await plan(sessionId, line);
        expect(p.steps.map((s: any) => [s.tool, s.input.action, s.input.restore])).toEqual([['project_data_recovery', 'restore', id]]);
        //  In the very turn that listed: nothing.
        let r: any = await tool.execute(p.steps[0].input, turn(sessionId, 'turn-1', line));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(TODAY);
        //  The list shown again in turn 1 is the latest; his line in turn 2 brings the copy back.
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        r = await executionFirewall.runInContext('joe-r9-line-turn-2', () => tool.execute(p.steps[0].input, turn(sessionId, 'turn-2', `${line}.`)));
        expect([r.ok, r.error]).toEqual([true, undefined]);
        expect(JSON.parse(read(F))).toContainEqual({ id: 99, name: 'Joe QA test' });
        //  Once.
        const after = read(F);
        r = await tool.execute(p.steps[0].input, turn(sessionId, 'turn-3', line));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(after);
        //  …and today's data was kept aside first: it is a copy of its own.
        expect((await recoveryChoices('ws-r9', root)).some(c => c.why === 'before a restore')).toBe(true);
    });

    it('the Arabic list ends with the Arabic line, and the planner reads it the same way', async () => {
        const { root } = await clinic('line-ar');
        const sessionId = 'joe-r9-line-ar';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'وش النسخ اللي عندك؟', 'ar'));
        const id = listed.output.versions[0].id;
        expect(listed.output.message.split('\n').pop()).toBe(`استعِد النسخة ${id}`);
        expect(listed.output.message).toMatch(/ليس فيها إلا السطر التالي كما هو/u);
        expect(listed.output.message).toMatch(/يحفظ جو بياناتك الحالية جانبًا أولًا/u);
        const p = await plan(sessionId, `استعِد النسخة ${id}`, 'ar');
        expect(p.steps.map((s: any) => [s.tool, s.input.action, s.input.restore])).toEqual([['project_data_recovery', 'restore', id]]);
    });

    it('what the line forgives, and what it never does', () => {
        const id = '20261117-002502';
        const arDigits = id.replace(/\d/gu, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
        for (const ok of [`restore copy ${id}`, `Restore copy ${id}.`, `  restore copy ${id}!  `, `RESTORE COPY ${id}`, `restore  copy ${id}`,
            `استعِد النسخة ${id}`, `استعد النسخة ${id}`, `استعِد النسخه ${id}`, `restore copy ${id} .`, `إستعد النسخة ${id}`, `استعيد النسخة ${id}`, `استعِد النسخة ${arDigits}`, `‏استعِد النسخة ${id}`, `restore copy ${id}-2`]) {
            expect([ok, restoreReplyCopyId(ok)]).toEqual([ok, ok.includes(`${id}-2`) ? `${id}-2` : id]);
        }
        for (const no of [`«restore copy ${id}»`, `"restore copy ${id}"`, `'restore copy ${id}'`, `restore copy ${id}?`, `restore copy ${id}؟`,
            `yes, restore copy ${id}`, `restore copy ${id} later`, `restore copy ${id}..`, `restore copy ${id} ..`, `restore copy ${id}!!`,
            `restore copy ${id}\nrestore copy ${id}`, `restore copy`, `restore copy 1`, `restore copy #${id}`, 'تمام', 'اوكي', 'نعم', 'yes', 'ok',
            `استعِد النسخة ${id} بعدين`, `نعم، استعِد النسخة ${id}`, `«استعِد النسخة ${id}»`, `استعِد النسخة ${id} إذا فيها سجل أمل`,
            `رجّع النسخة ${id}`, `نعم، رجّع النسخة ${id}`, `restore the copy ${id}`, `please restore copy ${id}`]) {
            expect([no, restoreReplyCopyId(no)]).toEqual([no, undefined]);
        }
        expect(restoreReplyCopyId(undefined)).toBeUndefined();
        expect(restoreReplyCopyId({ toString: () => `restore copy ${id}` })).toBeUndefined();
    });

    it('a copy the latest list did not show, a list older than thirty minutes, or another project of the same chat: nothing', async () => {
        const { root, F } = await clinic('stale');
        const other = await clinic('stale-other');
        const sessionId = 'joe-r9-stale';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'my copies?'));
        const id = listed.output.versions[0].id;
        //  An id the list never showed.
        let r: any = await tool.execute({ action: 'restore', restore: '20200101-000000' }, turn(sessionId, 'turn-2', 'restore copy 20200101-000000'));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(TODAY);
        //  The list from turn-2 is the latest now; thirty-one minutes later the line is stale.
        const real = Date.now;
        jest.spyOn(Date, 'now').mockImplementation(() => real() + 31 * 60 * 1000);
        r = await tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-3', `restore copy ${id}`));
        expect(r.output.restored).toBeUndefined();
        expect(r.output.message).toMatch(/more than thirty minutes ago/u);
        jest.restoreAllMocks();
        expect(read(F)).toBe(TODAY);
        //  The chat moves to another project: A's line brings nothing back into either.
        openProject(sessionId, { dir: other.root });
        r = await tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-4', `restore copy ${id}`));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(TODAY);
        expect(read(other.F)).toBe(TODAY);
    });

    it('a list call is read-only whatever his message is, and the tool offers the model nothing but a list', async () => {
        const { root, F } = await clinic('readonly');
        const sessionId = 'joe-r9-readonly';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'copies?'));
        const id = listed.output.versions[0].id;
        const r: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-2', `restore copy ${id}`));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(TODAY);
        expect(Object.keys(tool.inputSchema.properties).sort()).toEqual(['action', 'projectDir']);
        expect(tool.inputSchema.properties.action.enum).toEqual(['list']);
        expect(tool.description).toMatch(/never restores anything/u);
    });
});

describe('M1 — ordinary work routes exactly as on main', () => {
    const SEVEN = [
        'رجع البيانات مرتبة حسب التاريخ في الصفحة الرئيسية',
        'رجّع البيانات اللي في الجدول القديم للصفحة الجديدة',
        'بعد ما تسجل الدخول رجع المستخدم لصفحة البيانات',
        'ارجع لصفحة البيانات بعد الحفظ',
        'restore records sorting on the orders page',
        'restore the data validation on the form',
        'the API should restore data from cache on startup',
    ];
    it('none of review 9\'s seven is a request for his copies, for the intent, the engine\'s route or the planner\'s first door', async () => {
        const sessionId = 'joe-r9-seven';
        openProject(sessionId, { dir: folder('seven', { 'data/orders.json': '[{"id":1}]' }) });
        const { IntentParser } = require('../core/intelligence/IntentParser');
        const { isActionableEditRequest } = require('../modules/tools/definitions/ProjectEditTool');
        for (const t of SEVEN) {
            expect([t, restoreReplyCopyId(t)]).toEqual([t, undefined]);
            expect([t, (IntentParser.quickIntent(t)?.requiredTools || []).includes('project_data_recovery')]).toEqual([t, false]);
            const route = await agentEngineRoute(t, { engine: 'agent', sessionId } as any, { ...process.env, JOE_ENGINE: 'agent' }, { ask: async () => 'none' } as any);
            //  main's next rule: a change to the chat's project when it reads as one.
            const mainWould = !startsAfresh(t) && (isActionableEditRequest(t) || isFollowUpChange(t)) ? 'change' : undefined;
            if (mainWould) expect([t, route?.kind]).toEqual([t, 'change']);
        }
    });

    it('nothing in the routers reads words for his copies any more', () => {
        const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', ...rel.split('/')), 'utf8');
        for (const rel of ['core/engine/select.ts', 'core/intelligence/IntentParser.ts', 'core/orchestrator/PlanningEngine.ts']) {
            expect([rel, /isDataRecoveryRequest|confirmsRecovery|recoveryCopyIdIn|pendingRecoveryToken/u.test(src(rel))]).toEqual([rel, false]);
        }
    });
});

describe('H2 — never above the project, never another chat\'s server', () => {
    it('the home folder\'s .joe is nobody\'s project: the roots are the project\'s own', () => {
        const home = path.join(base, 'home');
        fs.mkdirSync(path.join(home, '.joe', 'chrome-profiles'), { recursive: true });
        const shop = folder('home/Desktop/shop', { 'data/orders.json': '[]' });
        expect(recoveryRoots(shop)).toEqual([path.resolve(shop)]);
        expect(projectRecoveryRoots({ dir: shop }, [])).toEqual([path.resolve(shop)]);
        //  A drive root, the home folder and the folders above it are never a project's folder.
        expect(isHomeDriveOrAbove(os.homedir())).toBe(true);
        expect(isHomeDriveOrAbove(path.dirname(os.homedir()))).toBe(true);
        expect(isHomeDriveOrAbove(path.parse(os.homedir()).root)).toBe(true);
        expect(isHomeDriveOrAbove(path.join(os.homedir(), 'Desktop', 'shop'))).toBe(false);
        expect(recoveryRoots(os.homedir())).toEqual([]);
        expect(projectRecoveryRoots({ dir: os.homedir() })).toEqual([]);
        //  A recorded folder above the project, or holding another chat's project, is never one of its roots; its own
        //  packaged API folder beside it is.
        const api = folder('home/Desktop/shop-api', { 'data/orders.json': '[]', 'server.js': '' });
        const clinicDir = folder('home/Documents/clinic', { 'server.js': '' });
        expect(projectRecoveryRoots({ dir: shop, linkedApiDir: home }, [clinicDir])).toEqual([path.resolve(shop)]);
        expect(projectRecoveryRoots({ dir: shop, linkedApiDir: path.join(home, 'Documents') }, [clinicDir])).toEqual([path.resolve(shop)]);
        expect(projectRecoveryRoots({ dir: shop, packagedInto: api }, [clinicDir]).sort()).toEqual([path.resolve(shop), path.resolve(api)].sort());
    });

    it('a restore in chat A stops no server of chat B under the same home folder', async () => {
        const home = path.join(base, 'home2');
        fs.mkdirSync(path.join(home, '.joe', 'chrome-profiles'), { recursive: true });
        const shop = folder('home2/Desktop/shop', { 'data/orders.json': '[{"id":1}]' });
        await oneRun('ws-r9', shop, 'run-1', 'data/orders.json', '[{"id":1},{"id":2}]');
        const clinicDir = folder('home2/Documents/clinic', {
            'server.cjs': "require('http').createServer((q,s)=>s.end('clinic')).listen(Number(process.argv[2]),'127.0.0.1',()=>process.send&&process.send('up'));",
        });
        const port = await freePort();
        const child = fork(path.join(clinicDir, 'server.cjs'), [String(port)], { cwd: clinicDir, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        const { _runningServers, stopServersServing } = require('../modules/tools/definitions/ProjectRunTool');
        _runningServers.set('joe-r9-session_B_clinic', { pid: child.pid, port, cwd: clinicDir, command: 'node server.cjs', startedAt: Date.now(), sessionKey: 'session_B_clinic' });
        const sessionId = 'joe-r9-chatA';
        openProject(sessionId, { dir: shop });
        writeJoeProject('session_B_clinic', { type: 'agent', dir: clinicDir, updatedAt: Date.now() }, null);
        const roots = projectRecoveryRoots((global as any).joeProjects[previewKey(sessionId)]);
        expect(roots).toEqual([path.resolve(shop)]);
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const logs: string[] = [];
        //  Its roots stop nothing of chat B's — and handed the real home folder or a drive root, the stop keeps out of them.
        const r = await executionFirewall.runInContext('joe-r9-chatA-stop', () => stopServersServing([...roots, os.homedir(), path.parse(clinicDir).root], previewKey(sessionId), logs));
        expect(r.stopped).toEqual([]);
        //  And the restore itself.
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'copies?'));
        const id = listed.output.versions[0].id;
        const back: any = await executionFirewall.runInContext('joe-r9-chatA-turn-2', () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-2', `restore copy ${id}`)));
        expect([back.ok, back.error]).toEqual([true, undefined]);
        expect(await answers(port)).toBe(true);
        expect(_runningServers.has('joe-r9-session_B_clinic')).toBe(true);
        _runningServers.delete('joe-r9-session_B_clinic');
        delete (global as any).joeProjects.session_B_clinic;
    });
});

describe('M2 / L3 — his app is never left down untold', () => {
    /** A server that keeps its port from PORT (as project_run starts it) or its first argument. */
    const HOLDER = "require('http').createServer((q,s)=>s.end('shop')).listen(Number(process.env.PORT||process.argv[2]),'127.0.0.1',()=>process.send&&process.send('up'));";
    async function joeServes(root: string, key: string, sessionId: string): Promise<number> {
        const port = await freePort();
        const child = fork(path.join(root, 'holder.cjs'), [String(port)], { cwd: root, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
        _runningServers.set(key, { pid: child.pid, port, cwd: root, command: 'node holder.cjs', startedAt: Date.now(), sessionKey: previewKey(sessionId), sessionId });
        return port;
    }

    it('a program not Joe\'s on a port the app names: refused BEFORE anything is stopped, said truthfully, and the line works once it is gone', async () => {
        const root = folder('untold', { 'data/orders.json': '[{"id":1}]', 'holder.cjs': HOLDER });
        await oneRun('ws-r9', root, 'run-1', 'data/orders.json', '[{"id":1},{"id":2}]');
        const F = path.join(root, 'data', 'orders.json');
        const now = read(F);
        const portB = await freePort();
        fs.writeFileSync(path.join(root, '.env'), `PORT=${portB}\n`);
        const foreign = net.createServer(s => s.end()).listen(portB, '127.0.0.1');
        const sessionId = 'joe-r9-untold';
        const portA = await joeServes(root, 'joe-r9-untold-ws', sessionId);
        openProject(sessionId, { dir: root });
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
        try {
            const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'copies?'));
            const id = listed.output.versions[0].id;
            const r: any = await executionFirewall.runInContext('joe-r9-untold-2', () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-2', `restore copy ${id}`)));
            expect([r.ok, r.error]).toEqual([false, 'port_answers']);
            expect(r.output.message).toContain(`a program answers on port ${portB}`);
            expect(r.output.message).toMatch(/I can't tell whose — stop it and send the line again/u);
            expect(r.output.message).toMatch(/Joe stopped nothing/u);
            //  His app still runs, untouched; the data is as it was.
            expect(await answers(portA)).toBe(true);
            expect(_runningServers.has('joe-r9-untold-ws')).toBe(true);
            expect(read(F)).toBe(now);
            //  He stops it and sends the line again: it comes back.
            await new Promise<void>(res => foreign.close(() => res()));
            const again: any = await executionFirewall.runInContext('joe-r9-untold-3', () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-3', `restore copy ${id}`)));
            expect([again.ok, again.error]).toEqual([true, undefined]);
            expect(again.output.message).toContain(`Joe stopped your app's server on port ${portA}`);
            expect(read(F)).toBe('[{"id":1},{"id":2}]');
        } finally { foreign.close(); }
    });

    it('a step that fails after Joe stopped his app\'s server starts it again, and he is told', async () => {
        const root = folder('restart', { 'data/orders.json': '[{"id":1}]', 'holder.cjs': HOLDER });
        await oneRun('ws-r9', root, 'run-1', 'data/orders.json', '[{"id":1},{"id":2}]');
        const F = path.join(root, 'data', 'orders.json');
        const now = read(F);
        const sessionId = 'joe-r9-restart';
        const key = 'joe-r9-restart-ws';
        const port = await joeServes(root, key, sessionId);
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'copies?'));
        const id = listed.output.versions[0].id;
        //  The copy cannot be written (a disk that fills, a file another program locks).
        const verify = require('../core/engine/verify');
        jest.spyOn(verify, 'restoreRecoveryVersion').mockRejectedValue(new Error('EBUSY: the file is locked'));
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
        const r: any = await executionFirewall.runInContext('joe-r9-restart-2', () => tool.execute({ action: 'restore', restore: id }, turn(sessionId, 'turn-2', `restore copy ${id}`)));
        expect(r.ok).toBe(false);
        expect(r.output.message).toMatch(new RegExp(`Joe had stopped your app's server on port ${port} for it, and started it again`, 'u'));
        expect(r.logs.join('\n')).toMatch(/stopped pid=\d+/u);
        expect(await answers(port)).toBe(true);
        expect(_runningServers.get(key)?.port).toBe(port);
        expect(_runningServers.get(key)?.sessionKey).toBe(previewKey(sessionId));
        expect(read(F)).toBe(now);
        //  The chat's project folder was not moved by the start.
        expect((global as any).joeProjects[previewKey(sessionId)].dir).toBe(root);
    });
});

describe('M3 — a store whose folder comes from the start\'s arguments is never covered', () => {
    it('a default, a late set or an unconditional `process.argv[3] = __dirname` is still the start\'s folder: no-write', async () => {
        const variants: Record<string, string[]> = {
            'if-default': ["if (!process.argv[3]) process.argv[3] = __dirname;", "const [port, root] = process.argv.slice(2);", "const FILE = path.join(root, 'data', 'orders.json');"],
            'set after the read': ["const [port, root] = process.argv.slice(2);", "process.argv[3] = __dirname;", "const FILE = path.join(root, 'data', 'orders.json');"],
            'unconditional': ["process.argv[3] = __dirname;", "const [port, root] = process.argv.slice(2);", "const FILE = path.join(root, 'data', 'orders.json');"],
            'direct slot': ["process.argv[3] = __dirname;", "const FILE = path.join(process.argv[3], 'data', 'orders.json');"],
        };
        for (const [name, lines] of Object.entries(variants)) {
            const outside = folder(`argv-out-${name.replace(/\W/gu, '-')}`, { 'data/orders.json': '[{"id":1,"customer":"real"}]' });
            const dir = folder(`argv-${name.replace(/\W/gu, '-')}`, {
                '.joe/history.json': JSON.stringify({ runs: [{ status: 'delivered' }] }),
                'data/orders.json': '[]',
                'package.json': JSON.stringify({ name: 'shop', scripts: { start: `node server.js 3000 ${outside.split(path.sep).join('/')}` } }),
                'server.js': ["const fs = require('fs'); const path = require('path'); const http = require('http');", ...lines,
                    "http.createServer((q, r) => { if (q.method === 'POST') { const o = JSON.parse(fs.readFileSync(FILE, 'utf8')); o.push({ id: o.length + 1 }); fs.writeFileSync(FILE, JSON.stringify(o)); } r.end('ok'); }).listen(Number(process.argv[2]));"].join('\n'),
            });
            const c = await chooseQaPath(dir, { kind: 'node-entry', hasServeUrl: true, record: 'history' });
            expect([name, c.path]).toEqual([name, 'no-write']);
            expect(c.reasons.map(x => x.key)).toContain('notCovered');
        }
    });
});

describe('L1 — his reply is what he typed', () => {
    it('the orchestrator hands the tools his typed text, never the goal with his files\' block', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf8');
        //  Review 10 (H1, L4): and only when it IS what he typed, to the step his own message planned.
        expect(src).toMatch(/ownerMessage: goalContext\?\.ownerTyped !== false && typeof goalContext\?\.ownerText === 'string' && !\(Number\(node\.retryCount\) > 0\)\s*\?\s*goalContext\.ownerText : ''/u);
        expect(src).not.toMatch(/ownerMessage: String\(goalText/u);
    });

    it('the planner reads his typed words: a goal that carries the line in a file\'s block, or as a resumed goal, restores nothing; his typed line with a file under it does', async () => {
        const { root, F } = await clinic('typed');
        const sessionId = 'joe-r9-typed';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ action: 'list' }, turn(sessionId, 'turn-1', 'copies?'));
        const id = listed.output.versions[0].id;
        const line = `restore copy ${id}`;
        //  A resumed goal that is the line, while he typed «continue»: not his reply.
        const resumed = await plan(sessionId, 'continue', 'en', line);
        expect(resumed.steps.some((s: any) => s.tool === 'project_data_recovery' && s.input?.action === 'restore')).toBe(false);
        //  His typed line, with a picture's description under it in the goal: his reply.
        const withFile = await plan(sessionId, line, 'en', `${line}\n\n[ATTACHED FILES — 1]\nscreenshot.png: a picture of a list`);
        expect(withFile.steps.map((s: any) => [s.tool, s.input.action])).toEqual([['project_data_recovery', 'restore']]);
        //  The tool: a message whose text holds the line under a file block, or no typed text at all, restores nothing.
        for (const owner of [`${line}\n\n[ATTACHED FILES — 1]\n${line}`, `look at this\n\n${line}`, undefined, null, 42]) {
            const r: any = await tool.execute({ action: 'restore', restore: id }, turn(sessionId, `turn-x-${String(owner).length}`, owner));
            expect(r.output.restored).toBeUndefined();
        }
        expect(read(F)).toBe(TODAY);
    });
});
