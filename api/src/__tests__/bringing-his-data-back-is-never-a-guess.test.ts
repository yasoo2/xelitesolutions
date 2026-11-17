/**
 * BRINGING HIS DATA BACK IS NEVER A GUESS (review 8: B1, H1, H2, M1, M3).
 *
 * Review 8 proved that «الخطأ رقم 1 في قاعدة البيانات، صلحه» («fix error number 1 in the database») stopped the clinic's
 * server and replaced today's three patients with an old copy holding a Joe QA record: the keyword reader sent any data
 * word plus any «recover» letters to project_data_recovery, and the planner took the «1» as the copy to restore. Now:
 *   B1  only an unmistakable ask for his data back reaches the copies; every other message (the review's twenty) goes
 *       on exactly as on main. A restore takes two turns: a list (stable ids, local time, records, Joe's marked
 *       records) issues a token; only a LATER message of his naming that id and confirming brings it back, once.
 *   H1  the restore holds the project's verify lock, stops every server of Joe's serving the project, and refuses while
 *       any port the app uses still answers.
 *   H2  copies kept by the packaged API folder or a server folder below the project are found from the chat.
 *   M3  a folder that is not the session's project is refused.
 */
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { fork, type ChildProcess } from 'child_process';
import { agentEngineRoute, isDataRecoveryRequest } from '../core/engine/select';
import {
    acquireVerifyLock, discardSnapshot, RECOVERY_BUDGET, recoveryRunDir, restoreAppData, snapshotAppData, watchAppData,
} from '../core/quality/qa-leaves-no-trace';
import {
    _forgetRecoveryConfirmations, ProjectDataRecoveryTool, recoveryChoices, recoveryCopyId,
} from '../modules/tools/definitions/ProjectDataRecoveryTool';

jest.setTimeout(180_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r8-restore-'));
const savedDataDir = process.env.JOE_DATA_DIR;
process.env.JOE_DATA_DIR = path.join(base, 'joe-data');
const children: ChildProcess[] = [];
afterAll(() => {
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});
afterEach(() => _forgetRecoveryConfirmations());

const until = async (ok: () => boolean, ms = 10_000) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 50)); };
const { writeJoeProject } = require('../api/page-store');
const { previewKey } = require('../modules/tools/preview-site');

function folder(name: string, files: Record<string, string>): string {
    const root = path.join(base, name);
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
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
const read = (f: string) => fs.readFileSync(f, 'utf8');
const freePort = () => new Promise<number>(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });

/* Every message review 8 proved went to the copies (routing.js, engine-route.js, hijack-e2e.js), and the ones it named. */
const ORDINARY = [
    'صلح خطأ الاتصال بقاعدة البيانات',
    'الخطأ رقم 1 في قاعدة البيانات، صلحه',
    'غير اسم الجدول في قاعدة البيانات',
    'الصفحة ترجع بيانات خاطئة، صلحها',
    'لماذا لا يرجع الخادم بيانات المستخدم؟',
    'اجعل نسخة الجوال تعرض البيانات بشكل أفضل',
    'انسخ بيانات الطلب إلى صفحة الفاتورة',
    'اعرض البيانات في جدول مرتب حسب التاريخ',
    'the data on the dashboard is wrong, fix the copy text',
    'I cannot get back to the records page after login, fix it',
    'fix the bug where records are not restored after refresh',
    'Fix bug #2: the data table copy is cut off',
    'add a backup feature to my app',
    'restore the old design',
    'recover my password page',
    'أريد صفحة لاستعادة كلمة المرور',
    'ارجع التصميم القديم',
    'استعد الشعار القديم',
    'حسّن استعلام قاعدة البيانات',
    'تراجع عن آخر تعديل',
    'رجّع النسخة السابقة',
];

describe('B1 — ordinary work never reaches his data copies', () => {
    it('none of the review\'s messages is a request for his data back, for the reader, the intent or the planner', () => {
        const sessionId = 'joe-r8-route';
        openProject(sessionId, { dir: folder('route', { 'data/store.json': '[{"id":1}]' }) });
        const { IntentParser } = require('../core/intelligence/IntentParser');
        for (const text of ORDINARY) {
            expect([text, isDataRecoveryRequest(text)]).toEqual([text, false]);
            const intent = IntentParser.quickIntent(text);
            expect([text, (intent?.requiredTools || []).includes('project_data_recovery')]).toEqual([text, false]);
        }
        for (const ask of ['رجّع بيانات تطبيقي', 'استرجع نسخة البيانات رقم 2', 'bring back my data copy', 'restore the records Joe kept', 'نعم، رجّع النسخة 20261117-020212']) {
            expect([ask, isDataRecoveryRequest(ask)]).toEqual([ask, true]);
        }
    });

    it('with the agent engine on, the fixes the review named are changes the engine makes, as on main', async () => {
        const sessionId = 'joe-r8-engine';
        openProject(sessionId, { dir: folder('engine', { 'data/store.json': '[]' }) });
        for (const text of ['صلح خطأ الاتصال بقاعدة البيانات', 'غير اسم الجدول في قاعدة البيانات', 'Fix bug #2: the data table copy is cut off', 'fix the bug where records are not restored after refresh']) {
            const route = await agentEngineRoute(text, { engine: 'agent', sessionId } as any, { ...process.env, JOE_ENGINE: 'agent' }, { ask: async () => 'none' } as any);
            expect([text, route?.kind]).toEqual([text, 'change']);
        }
    });

    it('«الخطأ رقم 1 في قاعدة البيانات، صلحه» planned and run end to end leaves today\'s records as they are', async () => {
        const root = folder('clinic', { 'data/patients.json': JSON.stringify([{ id: 1, name: 'old patient' }]) });
        const F = path.join(root, 'data', 'patients.json');
        await oneRun('ws-r8', root, 'run-last-week', 'data/patients.json', JSON.stringify([{ id: 1, name: 'old patient' }, { id: 99, name: 'Joe QA test' }]));
        const today = JSON.stringify([{ id: 1, name: 'old patient' }, { id: 2, name: 'Amal' }, { id: 3, name: 'Khalid' }, { id: 4, name: 'Sara' }]);
        fs.writeFileSync(F, today);
        const sessionId = 'joe-r8-clinic';
        openProject(sessionId, { dir: root });
        const { IntentParser } = require('../core/intelligence/IntentParser');
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        for (const text of ['الخطأ رقم 1 في قاعدة البيانات، صلحه', 'استرجع نسخة البيانات رقم 1']) {
            const plan = await PlanningEngine.generatePlan({ intent: IntentParser.quickIntent(text) || { goal: text } }, undefined, { sessionId, language: 'ar' });
            for (const step of plan.steps || []) {
                expect([text, step.tool === 'project_data_recovery' && !!(step.input?.restore || step.input?.version)]).toEqual([text, false]);
                if (step.tool === 'project_data_recovery') {
                    await new ProjectDataRecoveryTool().execute(step.input, { sessionId, workspaceId: 'ws-r8', language: 'ar', runId: 'turn-1', ownerMessage: text });
                }
            }
            expect(read(F)).toBe(today);
        }
        //  A copy number from anywhere in a message, handed to the tool, restores nothing.
        const out: any = await new ProjectDataRecoveryTool().execute({ version: '1' }, { sessionId, workspaceId: 'ws-r8', language: 'ar', runId: 'turn-2', ownerMessage: 'الخطأ رقم 1 في قاعدة البيانات، صلحه' });
        expect(out.output.restored).toBeUndefined();
        expect(read(F)).toBe(today);
    });
});

describe('B1 / M1 — two steps, two turns, one copy he named', () => {
    async function shop(name: string) {
        const root = folder(name, { 'data/store.json': JSON.stringify({ orders: [{ id: 1 }] }) });
        await oneRun('ws-r8', root, 'run-A', 'data/store.json', JSON.stringify({ orders: [{ id: 1 }, { id: 2, customer: 'Huda' }] }));
        await oneRun('ws-r8', root, 'run-B', 'data/store.json', JSON.stringify({ orders: [{ id: 1 }, { id: 3, customer: 'Joe QA 7f3a' }] }));
        fs.writeFileSync(path.join(root, 'data', 'store.json'), JSON.stringify({ orders: [{ id: 1 }, { id: 4, customer: 'today' }] }));
        return root;
    }
    const tool = new ProjectDataRecoveryTool();
    const turn = (sessionId: string, runId: string, ownerMessage: string, language = 'en') => ({ sessionId, workspaceId: 'ws-r8', language, runId, ownerMessage });

    it('the list shows stable ids, the local time with its offset, the records in each file and the copies holding Joe\'s marked records', async () => {
        const root = await shop('listed');
        const sessionId = 'joe-r8-list';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ list: true }, turn(sessionId, 'turn-1', 'restore my data'));
        const choices = await recoveryChoices('ws-r8', root);
        expect(choices.map(c => c.id)).toEqual(choices.map(c => recoveryCopyId(c.at)));
        const msg: string = listed.output.message;
        for (const c of choices) expect(msg).toContain(c.id);
        expect(msg).toMatch(/\(UTC[+-]\d\d:\d\d\)/u);
        expect(msg).toMatch(/data\/store\.json \(2 records\)/u);
        const bLine = msg.split('\n').find(l => l.includes(choices.find(c => c.runId === 'run-B')!.id))!;
        expect(bLine).toMatch(/records Joe's checks marked/u);
        const aLine = msg.split('\n').find(l => l.includes(choices.find(c => c.runId === 'run-A')!.id))!;
        expect(aLine).not.toMatch(/marked/u);
        expect(typeof listed.output.confirmToken).toBe('string');
        expect(msg).toMatch(/send in a new message: «yes, restore copy \d{8}-\d{6}»/u);
        expect(msg).not.toMatch(/number 1/u);
    });

    it('brings back nothing in the same turn, without his confirmation, with another token, or for a copy he did not name; then exactly once', async () => {
        const root = await shop('confirmed');
        const F = path.join(root, 'data', 'store.json');
        const now = read(F);
        const sessionId = 'joe-r8-confirm';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ list: true }, turn(sessionId, 'turn-1', 'restore my data'));
        const token = listed.output.confirmToken;
        const a = (await recoveryChoices('ws-r8', root)).find(c => c.runId === 'run-A')!;
        const b = (await recoveryChoices('ws-r8', root)).find(c => c.runId === 'run-B')!;
        //  The model restores in the very turn that listed: refused.
        let r: any = await tool.execute({ restore: a.id, confirmToken: token }, turn(sessionId, 'turn-1', `yes, restore copy ${a.id}`));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(now);
        //  The same-turn refusal showed the list again: its token is the one a later turn may use.
        const t2 = r.output.confirmToken;
        //  His later message names it without confirming.
        r = await tool.execute({ restore: a.id, confirmToken: t2 }, turn(sessionId, 'turn-2', `restore copy ${a.id}`));
        expect(r.ok).toBe(false);
        expect(read(F)).toBe(now);
        //  Another token.
        r = await tool.execute({ restore: a.id, confirmToken: token }, turn(sessionId, 'turn-2', `yes, restore copy ${a.id}`));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(now);
        const t3 = r.output.confirmToken;
        //  The model asks for B while he confirmed A.
        r = await tool.execute({ restore: b.id, confirmToken: t3 }, turn(sessionId, 'turn-3', `yes, restore copy ${a.id}`));
        expect(r.ok).toBe(false);
        expect(read(F)).toBe(now);
        //  He confirms A in a later turn, with the token of the list he saw: A comes back.
        r = await tool.execute({ restore: a.id, confirmToken: t3 }, turn(sessionId, 'turn-4', `yes, restore copy ${a.id}`));
        expect(r.ok).toBe(true);
        expect(JSON.parse(read(F)).orders).toContainEqual({ id: 2, customer: 'Huda' });
        //  Used once.
        const after = read(F);
        r = await tool.execute({ restore: b.id, confirmToken: t3 }, turn(sessionId, 'turn-5', `yes, restore copy ${b.id}`));
        expect(r.output.restored).toBeUndefined();
        expect(read(F)).toBe(after);
        //  The ids did not move: A and B are named as before, and the files as they were just before are a copy of their own.
        const again = await recoveryChoices('ws-r8', root);
        expect(again.find(c => c.id === a.id)?.runId).toBe('run-A');
        expect(again.find(c => c.id === b.id)?.runId).toBe('run-B');
        expect(again.length).toBe(3);
    });

    it('a token older than thirty minutes brings back nothing', async () => {
        const root = await shop('expired');
        const F = path.join(root, 'data', 'store.json');
        const now = read(F);
        const sessionId = 'joe-r8-expired';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ list: true }, turn(sessionId, 'turn-1', 'restore my data'));
        const a = (await recoveryChoices('ws-r8', root)).find(c => c.runId === 'run-A')!;
        const real = Date.now;
        const spy = jest.spyOn(Date, 'now').mockImplementation(() => real() + 31 * 60 * 1000);
        try {
            const r: any = await tool.execute({ restore: a.id, confirmToken: listed.output.confirmToken }, turn(sessionId, 'turn-2', `yes, restore copy ${a.id}`));
            expect(r.output.restored).toBeUndefined();
        } finally { spy.mockRestore(); }
        expect(read(F)).toBe(now);
    });

    it('the planner lists first, and asks for the copy only on his later confirmation naming its id, with the list\'s token', async () => {
        const root = await shop('planned');
        const F = path.join(root, 'data', 'store.json');
        const sessionId = 'joe-r8-planned';
        openProject(sessionId, { dir: root });
        const { IntentParser } = require('../core/intelligence/IntentParser');
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const plan = (text: string) => PlanningEngine.generatePlan({ intent: IntentParser.quickIntent(text) }, undefined, { sessionId, language: 'ar' });
        const first = await plan('رجّع بيانات تطبيقي');
        expect(first.steps.map((s: any) => [s.tool, s.input.list, s.input.restore])).toEqual([['project_data_recovery', true, undefined]]);
        const listed: any = await tool.execute(first.steps[0].input, turn(sessionId, 'turn-1', 'رجّع بيانات تطبيقي', 'ar'));
        expect(listed.output.message).toMatch(/أرسل في رسالة جديدة: «نعم، رجّع النسخة \d{8}-\d{6}»/u);
        const a = (await recoveryChoices('ws-r8', root)).find(c => c.runId === 'run-A')!;
        const ask = `نعم، رجّع النسخة ${a.id}`;
        const second = await plan(ask);
        expect(second.steps.map((s: any) => [s.tool, s.input.restore, s.input.confirmToken])).toEqual([['project_data_recovery', a.id, listed.output.confirmToken]]);
        const r: any = await tool.execute(second.steps[0].input, turn(sessionId, 'turn-2', ask, 'ar'));
        expect(r.ok).toBe(true);
        expect(r.output.message).toContain(`أعاد جو نسخة البيانات ${a.id}`);
        expect(JSON.parse(read(F)).orders).toContainEqual({ id: 2, customer: 'Huda' });
    });
});

describe('H1 — never under a running server, never during a check', () => {
    const tool = new ProjectDataRecoveryTool();

    it('a check of the app holding its verify lock: nothing is brought back', async () => {
        const root = folder('locked', { 'data/store.json': '{"v":"owner-now"}' });
        await oneRun('ws-r8', root, 'run-L', 'data/store.json', '{"v":"customer-order"}');
        const sessionId = 'joe-r8-locked';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ list: true }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-1', ownerMessage: 'restore my data' });
        const id = (await recoveryChoices('ws-r8', root))[0].id;
        const lock = await acquireVerifyLock('ws-r8', root, 'a-running-check', { waitMs: 0 });
        expect(lock).not.toBeNull();
        try {
            const r: any = await tool.execute({ restore: id, confirmToken: listed.output.confirmToken }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-2', ownerMessage: `yes, restore copy ${id}` });
            expect(r.ok).toBe(false);
            expect(r.error).toBe('check_running');
        } finally { await lock!.release(); }
        expect(read(path.join(root, 'data', 'store.json'))).toBe('{"v":"owner-now"}');
    });

    it('a server Joe did not start answering on the port the app names: nothing is brought back, and he is told which port', async () => {
        const port = await freePort();
        const root = folder('foreign', { 'data/store.json': '{"v":"owner-now"}', '.env': `PORT=${port}\n`, 'server.js': '' });
        await oneRun('ws-r8', root, 'run-F', 'data/store.json', '{"v":"customer-order"}');
        let memory = JSON.parse(read(path.join(root, 'data', 'store.json')));
        const srv = http.createServer((q, r) => { memory.hits = (memory.hits || 0) + 1; fs.writeFileSync(path.join(root, 'data', 'store.json'), JSON.stringify(memory)); r.end('ok'); });
        await new Promise<void>(r => srv.listen(port, '127.0.0.1', () => r()));
        const sessionId = 'joe-r8-foreign';
        openProject(sessionId, { dir: root });
        try {
            const listed: any = await tool.execute({ list: true }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-1', ownerMessage: 'restore my data' });
            const id = (await recoveryChoices('ws-r8', root))[0].id;
            const r: any = await tool.execute({ restore: id, confirmToken: listed.output.confirmToken }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-2', ownerMessage: `yes, restore copy ${id}` });
            expect(r.ok).toBe(false);
            expect(r.error).toBe('port_still_answering');
            expect(r.output.message).toContain(String(port));
            expect(read(path.join(root, 'data', 'store.json'))).toBe('{"v":"owner-now"}');
        } finally { await new Promise<void>(r => srv.close(() => r())); }
    });

    it('a server of Joe\'s serving the project is stopped first; the copy is in the file and nothing writes over it', async () => {
        const port = await freePort();
        const root = folder('joes', { 'data/store.json': '{"v":"owner-now"}' });
        await oneRun('ws-r8', root, 'run-J', 'data/store.json', '{"v":"customer-order"}');
        //  A server that holds the store in memory and writes it back on every request, as review 8's P3 server did.
        fs.writeFileSync(path.join(root, 'holder.cjs'), [
            "const fs = require('fs'), path = require('path'), http = require('http');",
            "const F = path.join(__dirname, 'data', 'store.json'); let memory = JSON.parse(fs.readFileSync(F, 'utf8'));",
            "http.createServer((q, r) => { memory.hits = (memory.hits || 0) + 1; fs.writeFileSync(F, JSON.stringify(memory)); r.end('ok'); }).listen(Number(process.argv[2]), '127.0.0.1', () => process.send && process.send('up'));",
        ].join('\n'));
        const child = fork(path.join(root, 'holder.cjs'), [String(port)], { cwd: root, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
        children.push(child);
        await new Promise<void>(r => child.once('message', () => r()));
        const { _runningServers } = require('../modules/tools/definitions/ProjectRunTool');
        _runningServers.set('joe-r8-joes-ws', { pid: child.pid, port, cwd: root, command: 'node holder.cjs', startedAt: Date.now() });
        const sessionId = 'joe-r8-joes';
        openProject(sessionId, { dir: root });
        const listed: any = await tool.execute({ list: true }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-1', ownerMessage: 'restore my data' });
        const id = (await recoveryChoices('ws-r8', root))[0].id;
        //  As every tool runs in a run: inside the execution firewall's context (Joe's own process tools need it).
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const r: any = await executionFirewall.runInContext('joe-r8-joes-turn-2', () => tool.execute({ restore: id, confirmToken: listed.output.confirmToken }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-2', ownerMessage: `yes, restore copy ${id}` }));
        expect([r.ok, r.error]).toEqual([true, undefined]);
        expect(r.output.message).toMatch(/Joe stopped your app's server for it/u);
        expect(read(path.join(root, 'data', 'store.json'))).toBe('{"v":"customer-order"}');
        expect(_runningServers.has('joe-r8-joes-ws')).toBe(false);
        const answers = await new Promise<boolean>(res => { const s = net.connect({ host: '127.0.0.1', port }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
        expect(answers).toBe(false);
    });
});

describe('H2 / M3 — every folder of his project, and only his project', () => {
    const tool = new ProjectDataRecoveryTool();

    it('copies kept by the packaged API folder and by a server folder below the project are listed from the chat', async () => {
        const web = folder('shop-web', { 'src/App.jsx': 'x', 'package.json': '{}' });
        const api = folder('shop-api', { 'data/orders.json': '[{"id":1}]', 'server.js': '' });
        await oneRun('ws-r8', api, 'react-s1', 'data/orders.json', '[{"id":1},{"id":2,"customer":"real"}]');
        const server = path.join(web, 'server');
        fs.mkdirSync(path.join(server, 'data'), { recursive: true });
        fs.writeFileSync(path.join(server, 'package.json'), '{}');
        fs.writeFileSync(path.join(server, 'data', 'tasks.json'), '[]');
        await oneRun('ws-r8', server, 'pipeline-s1', 'data/tasks.json', '[{"id":5}]');
        const sessionId = 'joe-r8-packaged';
        openProject(sessionId, { dir: web, type: 'react', packagedInto: api, linkedApiDir: api });
        const out: any = await tool.execute({ list: true }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-1', ownerMessage: 'restore my data' });
        expect(out.output.versions.map((v: any) => v.files[0]).sort()).toEqual(['data/orders.json', 'data/tasks.json']);
        expect(out.output.message).not.toMatch(/keeps no copy/u);
    });

    it('a folder that is not the session\'s project is refused, and its copies are neither listed nor brought back', async () => {
        const mine = folder('mine', { 'data/store.json': '[]' });
        const theirs = folder('theirs', { 'data/store.json': '{"v":"theirs-now"}' });
        await oneRun('ws-r8', theirs, 'run-T', 'data/store.json', '{"v":"theirs-old"}');
        const sessionId = 'joe-r8-mine';
        openProject(sessionId, { dir: mine });
        const listed: any = await tool.execute({ projectDir: theirs, list: true }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-1', ownerMessage: 'restore my data' });
        expect(listed.ok).toBe(false);
        expect(listed.error).toBe('outside_project');
        expect(listed.output.versions).toBeUndefined();
        const r: any = await tool.execute({ projectDir: theirs, version: '1' }, { sessionId, workspaceId: 'ws-r8', language: 'en', runId: 'turn-2', ownerMessage: 'yes' });
        expect(r.ok).toBe(false);
        expect(read(path.join(theirs, 'data', 'store.json'))).toBe('{"v":"theirs-now"}');
    });
});
