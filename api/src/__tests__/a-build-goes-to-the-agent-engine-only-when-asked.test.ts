/**
 * A BUILD GOES TO THE AGENT ENGINE ONLY WHEN THE RUN ASKS FOR IT.
 *
 * Two engines live side by side until the new one beats the old one on the
 * exam. The switch is per run (`engine` on the run's context) or per
 * deployment (JOE_ENGINE=agent), read at call time. It moves BUILD nodes only.
 * A read-only audit also travels as project_pipeline, and it must never be
 * handed to an engine that writes code.
 *
 * Driven through the real orchestrator, with the tool gateway recording
 * what it was asked to run.
 */
jest.mock('../modules/services/ToolService', () => ({
    ...jest.requireActual('../modules/services/ToolService'), executeTool: jest.fn(),
}));
import { executeTool } from '../modules/services/ToolService';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
import { engineFor } from '../core/engine/select';

const GOAL = 'ابنِ موقعاً تعريفياً لعيادة أسنان فيه الخدمات وآراء المرضى ونموذج حجز';

describe('which engine builds the project', () => {
    const saved = { engine: process.env.JOE_ENGINE, narration: process.env.DISABLE_NARRATION };
    afterEach(() => {
        if (saved.engine === undefined) delete process.env.JOE_ENGINE; else process.env.JOE_ENGINE = saved.engine;
        if (saved.narration === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = saved.narration;
        (executeTool as jest.Mock).mockReset();
        jest.restoreAllMocks();
    });

    async function run(nodeId: string, tool: string, context: Record<string, unknown> = {}) {
        process.env.DISABLE_NARRATION = 'true';
        const called: Array<{ name: string; input: any }> = [];
        (executeTool as jest.Mock).mockImplementation(async (name: string, input: any) => {
            called.push({ name, input });
            return { ok: true, output: { status: 'completed', pipelineFinal: true, summary: 'done' }, logs: [] };
        });
        const orchestrator: any = new AgentOrchestrator();
        orchestrator.plan = jest.fn(async () => ({ id: 'plan', status: 'idle', nodes: [{
            id: nodeId, agent: 'Dev', task: 'build', tool, input: { request: 'a label, not the request' }, dependencies: [], status: 'pending',
        }] }));
        orchestrator.selectOptimalAgent = jest.fn(async () => 'Dev');
        orchestrator.attemptRecovery = jest.fn(async () => false);
        await orchestrator.execute({ id: 's1', runId: 'r1', goal: GOAL,
            context: { sessionId: 's1', userId: 'owner', workspaceId: 'w1', isCancelled: () => false, ...context } });
        return called;
    }

    it('by default the planned build tool runs, as before', async () => {
        delete process.env.JOE_ENGINE;
        const called = await run('project_pipeline', 'project_pipeline');
        expect(called.map(c => c.name)).toEqual(['project_pipeline']);
    });

    it('with JOE_ENGINE=agent the build goes to agent_engine, carrying his whole request', async () => {
        process.env.JOE_ENGINE = 'agent';
        for (const tool of ['project_pipeline', 'react_project', 'api_project']) {
            const called = await run('build', tool);
            expect(`${tool}:${called.map(c => c.name).join(',')}`).toBe(`${tool}:agent_engine`);
            expect(called[0].input.request).toBe(GOAL);
        }
    });

    it('the run can ask for it without the deployment flag', async () => {
        delete process.env.JOE_ENGINE;
        const called = await run('project_pipeline', 'project_pipeline', { engine: 'agent' });
        expect(called.map(c => c.name)).toEqual(['agent_engine']);
    });

    it('a read-only audit is never handed to the engine that writes code', async () => {
        process.env.JOE_ENGINE = 'agent';
        for (const id of ['read_only_audit', 'workspace_overview']) {
            const called = await run(id, 'project_pipeline');
            expect(`${id}:${called.map(c => c.name).join(',')}`).toBe(`${id}:project_pipeline`);
        }
    });

    it('a node that is not a build is untouched', async () => {
        process.env.JOE_ENGINE = 'agent';
        const called = await run('read', 'read_file');
        expect(called.map(c => c.name)).toEqual(['read_file']);
    });

    it('the switch reads only the word agent, and reads it at call time', () => {
        expect(engineFor({}, {})).toBe('legacy');
        expect(engineFor({}, { JOE_ENGINE: ' Agent ' })).toBe('agent');
        expect(engineFor({ engine: 'legacy' }, { JOE_ENGINE: 'agent' })).toBe('legacy');
        expect(engineFor({}, { JOE_ENGINE: 'agentic' })).toBe('legacy');
    });
});
