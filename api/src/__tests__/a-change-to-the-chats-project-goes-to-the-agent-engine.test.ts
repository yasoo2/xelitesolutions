/**
 * A CHANGE TO THE CHAT'S PROJECT GOES TO THE AGENT ENGINE, IN THAT PROJECT.
 *
 * Measured on 2026-11-01 in Joe's own interface: the agent engine built a
 * to-do app, then «عدّل نفس التطبيق: اجعل زر الإضافة باللون الأخضر…» in the
 * same chat went to the first planner. It chose project_planner, found it
 * lacking input, turned the request into a question to the user, and the
 * question tool answered «Request sent. Agent loop should now pause.».
 * Nothing changed.
 *
 * With the agent engine on, the plan for a build request or for a change to
 * the chat's project is one build node, and a change carries the chat's
 * project folder. Anything else stays with the first planner.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { agentEngineRoute, chatProjectFolder } from '../core/engine/select';
import { writeJoeProject } from '../api/page-store';
import { previewKey } from '../modules/tools/preview-site';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
import { IntentParser } from '../core/intelligence/IntentParser';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-route-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const CHANGE = 'عدّل نفس التطبيق: اجعل زر الإضافة باللون الأخضر، وأضف زرّاً «احذف المنجزة» يحذف كل المهام المنجزة دفعة واحدة.';
const BUILD = 'اعمل لي تطبيق قائمة مهام بالعربي: أضيف مهمة، أعدّلها، أحذفها، وأحددها كمنجزة.';
const QUESTION = 'ما الفرق بين localStorage و sessionStorage؟';
const AGENT = { JOE_ENGINE: 'agent' } as NodeJS.ProcessEnv;

function chatWithProject(sessionId: string): string {
    const dir = path.join(root, `joe-app-${sessionId}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html lang="ar" dir="rtl"></html>');
    writeJoeProject(previewKey(sessionId), { dir, type: 'agent', updatedAt: Date.now() }, 'run-earlier');
    return dir;
}

describe('which requests the agent engine takes', () => {
    it('a change in a chat that has an engine project goes to the engine, in that folder', async () => {
        const dir = chatWithProject('chat-change');
        expect(await chatProjectFolder('chat-change')).toBe(dir);
        expect(await agentEngineRoute(CHANGE, { sessionId: 'chat-change' }, AGENT)).toEqual({ kind: 'change', path: dir });
    });

    it('a build request goes to the engine as a new project', async () => {
        expect(await agentEngineRoute(BUILD, { sessionId: 'chat-new' }, AGENT)).toEqual({ kind: 'build' });
    });

    it('a question stays with the first planner, project or not', async () => {
        chatWithProject('chat-question');
        expect(await agentEngineRoute(QUESTION, { sessionId: 'chat-question' }, AGENT)).toBeNull();
    });

    it('a project folder that is gone is not reused', async () => {
        const dir = chatWithProject('chat-gone');
        fs.rmSync(dir, { recursive: true, force: true });
        expect(await chatProjectFolder('chat-gone')).toBeNull();
        expect(await agentEngineRoute(CHANGE, { sessionId: 'chat-gone' }, AGENT)).not.toEqual(expect.objectContaining({ kind: 'change' }));
    });

    it('with the engine off nothing is taken', async () => {
        chatWithProject('chat-off');
        expect(await agentEngineRoute(CHANGE, { sessionId: 'chat-off' }, {} as NodeJS.ProcessEnv)).toBeNull();
        expect(await agentEngineRoute(BUILD, { sessionId: 'chat-off' }, {} as NodeJS.ProcessEnv)).toBeNull();
    });
});

describe('the plan for a change is one engine build in the chat\'s project', () => {
    const saved = process.env.JOE_ENGINE;
    afterEach(() => { if (saved === undefined) delete process.env.JOE_ENGINE; else process.env.JOE_ENGINE = saved; jest.restoreAllMocks(); });

    it('the first planner is not asked, and the node carries the folder and the whole request', async () => {
        process.env.JOE_ENGINE = 'agent';
        const dir = chatWithProject('chat-plan');
        const parse = jest.spyOn(IntentParser, 'parse');
        const orchestrator: any = new AgentOrchestrator();
        orchestrator.context = { sessionId: 'chat-plan' };
        const dag = await orchestrator.plan(CHANGE, undefined, 'trace-1');

        expect(parse).not.toHaveBeenCalled();
        expect(dag.nodes).toHaveLength(1);
        expect(dag.nodes[0]).toMatchObject({ id: 'agent_build', tool: 'project_pipeline', input: { request: CHANGE, path: dir } });
    });
});
