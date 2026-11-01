/**
 * THE AGENT ENGINE TOOL REFUSES HONESTLY, BEFORE IT SPENDS OR WRITES.
 *
 * `agent_engine` is the build node's entry into the general agent engine.
 * When its model cannot start (no model named, a paid model with no budget)
 * the run must end with that reason as its final answer:
 *  - nothing is spent and no project folder is made;
 *  - the refusal comes in the delivery shape, so the orchestrator treats it
 *    as final instead of handing the request to a recovery planner that
 *    would build it some other way.
 */
// The registry first, as the server loads it: ToolService loads the registry,
// which loads agent_engine.
import { tools } from '../modules/tools/registry';
import { AgentEngineTool } from '../modules/tools/definitions/AgentEngineTool';
import { isFinalPipelineOutcome } from '../orchestration/AgentOrchestrator';
import { workspaceService } from '../modules/services/WorkspaceService';

const KEYS = ['JOE_ENGINE_PROVIDER', 'JOE_ENGINE_MODEL', 'JOE_ENGINE_ANTHROPIC_API_KEY', 'JOE_ENGINE_ANTHROPIC_KEY_FILE', 'JOE_ENGINE_BUDGET_USD', 'LOCAL_LLM_MODEL'];
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of KEYS) { if (saved[k] == null) delete process.env[k]; else process.env[k] = saved[k]; } jest.restoreAllMocks(); });

describe('agent_engine refuses before it spends or writes', () => {
    it('is registered, so a build node can reach it', () => {
        expect(tools.find(t => t.name === 'agent_engine')).toBe(AgentEngineTool);
    });

    it('a paid model with no budget ends the run with that reason, makes no folder, and is final', async () => {
        process.env.JOE_ENGINE_PROVIDER = 'anthropic';
        process.env.JOE_ENGINE_MODEL = 'claude-haiku-5-5';
        process.env.JOE_ENGINE_ANTHROPIC_API_KEY = 'sk-test-not-real';
        const activeRoot = jest.spyOn(workspaceService, 'getActiveRoot');
        const result: any = await AgentEngineTool.execute!({ request: 'ابنِ صفحة حجز لعيادة أسنان' }, { runId: 'run-no-budget', sessionId: 's1', workspaceId: 'w1' });

        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/JOE_ENGINE_BUDGET_USD/);
        expect(activeRoot).not.toHaveBeenCalled();
        expect(result.output).toMatchObject({ pipelineFinal: true, engineStatus: 'failed', verified: false });
        expect(isFinalPipelineOutcome('react_project', result.output)).toBe(true);
        // The refusal is told in the request's language.
        expect(String(result.output.summary)).toMatch(/لم يُسلَّم المشروع/);
    });

    it('no model configured at all is the same honest, final refusal', async () => {
        const result: any = await AgentEngineTool.execute!({ request: 'Build a booking page' }, { runId: 'run-no-model', sessionId: 's1' });
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/cannot choose a model/);
        expect(isFinalPipelineOutcome('api_project', result.output)).toBe(true);
    });

    it('an empty request is refused', async () => {
        const result: any = await AgentEngineTool.execute!({ request: '   ' }, {});
        expect(result.ok).toBe(false);
    });
});
