/**
 * THE RECOVERY COPY COMES BACK FROM THE CHAT, AND IS KEPT AS LONG AS HE IS TOLD (review 7, B3 and M3).
 *
 * He is told: «Joe kept your app's data files as they were before each put-back … To bring one back, ask Joe in the
 * chat». Review 7 found no code path that could bring one back, and copies pruned after five runs while he was told
 * «14 days». Now:
 *   - his ask in the chat routes to `project_data_recovery` (no menu, button, tab or panel), which lists the copies and
 *     brings back the one he numbers — his files as they were just before are kept as a copy of their own;
 *   - every run's copy is kept for the 14 days he is told, however many runs there were; only the space caps remove a
 *     younger one, the oldest first, and the told line says exactly that;
 *   - a file the put-back could not restore keeps its version from before the checks among the copies (M3), and the
 *     line says where it really is.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listRecoveryVersions, qaPathLines } from '../core/engine/verify';
import { isDataRecoveryRequest, isUndoRequest } from '../core/engine/select';
import {
    discardSnapshot, pruneRecovery, RECOVERY_BUDGET, recoveryProjectDir, recoveryRunDir, snapshotAppData, watchAppData,
} from '../core/quality/qa-leaves-no-trace';
import { ProjectDataRecoveryTool, pickRecoveryChoice, recoveryChoices } from '../modules/tools/definitions/ProjectDataRecoveryTool';

jest.setTimeout(120_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r7-recovery-'));
const env = { JOE_DATA_DIR: path.join(base, 'joe-data') };
const savedDataDir = process.env.JOE_DATA_DIR;
beforeAll(() => { process.env.JOE_DATA_DIR = env.JOE_DATA_DIR; });
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

const until = async (ok: () => boolean, ms = 10_000) => { const t0 = Date.now(); while (!ok() && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 50)); };

async function project(name: string, files: Record<string, string>): Promise<string> {
    const root = path.join(base, 'projects', name);
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    }
    fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
    return root;
}

describe('B3 — his ask in the chat reaches the copies', () => {
    it('the words he uses route to the data copies, never to the code\'s undo or a build', () => {
        for (const ask of ['رجّع بيانات تطبيقي', 'استرجع نسخة البيانات رقم 2', 'رجّع بياناتي اللي احتفظ فيها جو', 'bring back my data copy', 'restore the records Joe kept']) {
            expect([ask, isDataRecoveryRequest(ask)]).toEqual([ask, true]);
        }
        for (const ask of ['تراجع عن آخر تعديل', 'أضف ميزة نسخة احتياطية للبيانات', 'Build a data dashboard', 'غيّر لون الزر', 'undo the last change']) {
            expect([ask, isDataRecoveryRequest(ask)]).toEqual([ask, false]);
        }
        expect(isUndoRequest('تراجع عن آخر تعديل')).toBe(true);
    });

    it('the planner answers «رجّع بيانات تطبيقي» with project_data_recovery on the session\'s project, and «… رقم 1» with the list — never a copy taken from a number (review 8)', async () => {
        const root = await project('planned', { 'data/store.json': '[]' });
        const sessionId = 'joe-r7-recovery-plan';
        const { writeJoeProject } = require('../api/page-store');
        const { previewKey } = require('../modules/tools/preview-site');
        const { IntentParser } = require('../core/intelligence/IntentParser');
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        writeJoeProject(previewKey(sessionId), { dir: root, type: 'agent', updatedAt: Date.now() }, 'run-earlier');
        try {
            const plan = async (text: string): Promise<any> => {
                const intent = IntentParser.quickIntent(text);
                expect([text, intent?.requiredTools]).toEqual([text, ['project_data_recovery']]);
                return PlanningEngine.generatePlan({ intent }, undefined, { sessionId, language: 'ar' });
            };
            const listed = await plan('رجّع بيانات تطبيقي من النسخ التي احتفظ بها جو');
            expect(listed.steps.map((s: any) => [s.tool, s.input.projectDir, s.input.list])).toEqual([['project_data_recovery', root, true]]);
            const one = await plan('رجّع نسخة البيانات رقم 1');
            expect(one.steps.map((s: any) => [s.tool, s.input.list, s.input.version, s.input.restore])).toEqual([['project_data_recovery', true, undefined, undefined]]);
        } finally {
            delete (global as any).joeProjects?.[previewKey(sessionId)];
        }
    });

    it('lists the kept versions, brings the numbered one back with the server stopped, and keeps his current files as a copy of their own', async () => {
        const root = await project('shop', { 'data/store.json': JSON.stringify({ orders: [{ id: 1 }] }) });
        const snap = await snapshotAppData(root);
        const into = recoveryRunDir('ws-r7', root, 'run-1', env);
        const watch = watchAppData(snap, { into, budget: RECOVERY_BUDGET });
        //  A customer's order lands while the checks run; then the put-back erases it from the app.
        fs.writeFileSync(path.join(root, 'data', 'store.json'), JSON.stringify({ orders: [{ id: 1 }, { id: 2, customer: 'real customer' }] }));
        await until(() => watch.versions().length > 0);
        await watch.flush('put-back');
        await watch.stop();
        fs.writeFileSync(path.join(root, 'data', 'store.json'), JSON.stringify({ orders: [{ id: 1 }] }));
        await discardSnapshot(snap);

        const choices = await recoveryChoices('ws-r7', root, env);
        expect(choices.length).toBeGreaterThan(0);
        //  A copy is named by its id, never by a number (review 8, M1).
        expect(pickRecoveryChoice(choices, 'رقم ١')).toBeUndefined();
        expect(pickRecoveryChoice(choices, choices[0].id)?.runId).toBe('run-1');
        const tool = new ProjectDataRecoveryTool();
        const { writeJoeProject } = require('../api/page-store');
        const { previewKey } = require('../modules/tools/preview-site');
        const sessionId = 'joe-r7-recovery-tool';
        writeJoeProject(previewKey(sessionId), { dir: root, type: 'agent', updatedAt: Date.now() }, 'run-earlier');
        const turn = (runId: string, ownerMessage: string) => ({ sessionId, workspaceId: 'ws-r7', language: 'ar', runId, ownerMessage });
        const listed: any = await tool.execute({ projectDir: root, list: true }, turn('t1', 'رجّع بيانات تطبيقي'));
        expect(listed.ok).toBe(true);
        expect(listed.output.message).toMatch(new RegExp(`^• ${choices[0].id} — .*data/store\.json`, 'mu'));
        expect(listed.output.message).toMatch(/«نعم، رجّع النسخة \d{8}-\d{6}»/u);
        const id = choices[0].id;
        const back: any = await tool.execute({ restore: id, confirmToken: listed.output.confirmToken }, turn('t2', `نعم، رجّع النسخة ${id}`));
        expect(back.ok).toBe(true);
        expect(JSON.parse(fs.readFileSync(path.join(root, 'data', 'store.json'), 'utf8')).orders).toContainEqual({ id: 2, customer: 'real customer' });
        expect(back.output.message).toMatch(new RegExp(`أعاد جو نسخة البيانات ${id}`, 'u'));
        //  What his file was just before is itself a copy the chat lists — going back loses nothing.
        const after = await recoveryChoices('ws-r7', root, env);
        expect(after[0].files).toEqual(['data/store.json']);
        expect(after.length).toBe(choices.length + 1);
        const relisted: any = await tool.execute({ list: true }, turn('t3', 'رجّع بياناتي'));
        const undo: any = await tool.execute({ restore: after[0].id, confirmToken: relisted.output.confirmToken }, turn('t4', `نعم، رجّع النسخة ${after[0].id}`));
        expect(undo.ok).toBe(true);
        expect(JSON.parse(fs.readFileSync(path.join(root, 'data', 'store.json'), 'utf8')).orders).toEqual([{ id: 1 }]);
        delete (global as any).joeProjects?.[previewKey(sessionId)];
    });

    it('is registered for the chat, and nowhere is a menu, button or panel added for it', () => {
        const registry = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'registry.ts'), 'utf8');
        expect(registry).toMatch(/new ProjectDataRecoveryTool\(\)/u);
        const web = path.join(__dirname, '..', '..', '..', 'web', 'src');
        if (fs.existsSync(web)) {
            const hit = (dir: string): boolean => fs.readdirSync(dir, { withFileTypes: true }).some(e => e.isDirectory() ? (e.name !== 'node_modules' && hit(path.join(dir, e.name))) : /\.(?:tsx?|jsx?)$/u.test(e.name) && /project_data_recovery/u.test(fs.readFileSync(path.join(dir, e.name), 'utf8')));
            expect(hit(web)).toBe(false);
        }
    });
});

describe('B3 — kept as long as he is told', () => {
    const DAY = 24 * 60 * 60 * 1000;
    async function fakeRun(dir: string, startedAt: number, bytes = 10): Promise<void> {
        await fs.promises.mkdir(path.join(dir, '1', 'data'), { recursive: true });
        await fs.promises.writeFile(path.join(dir, 'run.json'), JSON.stringify({ startedAt, versions: [{ n: 1, at: startedAt, files: ['data/store.json'], bytes }] }));
        await fs.promises.writeFile(path.join(dir, '1', 'data', 'store.json'), 'x'.repeat(bytes));
    }

    it('seven runs in a day are all kept; only the one older than 14 days goes', async () => {
        const penv = { JOE_DATA_DIR: path.join(base, 'prune-r7') };
        const root = await project('retain-r7', { 'data/store.json': '[]' });
        const now = Date.now();
        for (let i = 0; i < 7; i++) await fakeRun(recoveryRunDir('ws1', root, `run-${i}`, penv), now - i * 60_000);
        await fakeRun(recoveryRunDir('ws1', root, 'run-old', penv), now - 15 * DAY);
        const r = await pruneRecovery({ env: penv });
        expect(fs.readdirSync(recoveryProjectDir('ws1', root, penv)).sort()).toEqual(['run-0', 'run-1', 'run-2', 'run-3', 'run-4', 'run-5', 'run-6']);
        expect(r.removedRuns.map(d => path.basename(d))).toEqual(['run-old']);
        expect(Object.keys(RECOVERY_BUDGET).sort()).toEqual(['keepDays', 'projectBytes', 'serverBytes']);
    });

    it('the line says what pruning does: 14 days, unless the space fills first, the oldest first — and that the chat brings one back', () => {
        const q = { path: '2t' as const, blocked: 0, notTried: [], skippedProbes: [], walked: true, origin: 'http://127.0.0.1:1', recovery: { versions: 2, bytes: 10, unexplained: [], overBudget: false, keptDays: 14 } };
        const en = qaPathLines(q, 'en').join('\n');
        expect(en).toMatch(/for 14 days — unless the space Joe sets aside for these copies fills up first, when the oldest go first\. To bring one back, ask Joe in the chat\./u);
        expect(qaPathLines(q, 'ar').join('\n')).toMatch(/لمدة 14 يومًا، ما لم تمتلئ المساحة .* فتُحذف الأقدم أولًا\. لاسترجاع نسخة، اطلب ذلك من جو في المحادثة\./u);
    });
});

describe('M3 — the version from before of a file not put back is where the line says', () => {
    it('kept among the copies (a version of its own the chat lists), and said so; or, with no copy, the line names the temporary folder', async () => {
        const root = await project('failed', { 'data/store.json': JSON.stringify({ v: 'before' }) });
        const snap = await snapshotAppData(root);
        const into = recoveryRunDir('ws-r7', root, 'run-failed', env);
        const watch = watchAppData(snap, { into, budget: RECOVERY_BUDGET });
        fs.writeFileSync(path.join(root, 'data', 'store.json'), JSON.stringify({ v: 'after' }));
        const kept = snap.files.get(path.join(root, 'data', 'store.json'))!;
        expect(await watch.keep([{ rel: 'data/store.json', from: kept.copy }], 'before the checks')).toBe(true);
        await watch.stop();
        await discardSnapshot(snap);
        const runs = await listRecoveryVersions('ws-r7', root, env);
        const run = runs.find(r => r.runId === 'run-failed')!;
        expect(run.versions.map(v => v.files)).toContainEqual(['data/store.json']);
        const dirOf = (n: number) => path.join(recoveryRunDir('ws-r7', root, 'run-failed', env), String(n), 'data', 'store.json');
        expect(run.versions.some(v => fs.readFileSync(dirOf(v.n), 'utf8').includes('before'))).toBe(true);
        const q = (before: 'copies' | 'snapshot') => ({ path: 'no-write' as const, blocked: 0, notTried: [], skippedProbes: [], putBackFailed: ['data/store.json (EBUSY)'], putBackFailedBefore: before });
        expect(qaPathLines(q('copies'), 'en').join('\n')).toMatch(/their version from before the checks and their last version are among the copies Joe keeps outside your project — ask Joe in the chat/u);
        expect(qaPathLines(q('snapshot'), 'en').join('\n')).toMatch(/is in a temporary folder named in the verification log, removed after six hours/u);
        expect(qaPathLines(q('copies'), 'en').join('\n')).not.toMatch(/snapshot folder shown in the log/u);
    });
});
