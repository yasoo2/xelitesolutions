jest.mock('../modules/services/ToolService', () => ({
    ...jest.requireActual('../modules/services/ToolService'), executeTool: jest.fn(),
}));

import { executeTool } from '../modules/services/ToolService';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
import { PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';

describe('terminal engineering evidence outranks provider retry', () => {
    it.each([
        ['project_pipeline', { pipelineFinal: true, completedPhases: ['backend'], status: 'failed' }, 1],
        ['project_edit', { verificationFailed: true }, 1],
        ['react_project', { nonRecoverable: true }, 1],
        ['react_project', {}, 2],
    ])('%s keeps terminal evidence and bounds nonterminal retry', async (tool, output, calls) => {
        const previousNarration = process.env.DISABLE_NARRATION;
        const previousWait = process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS;
        process.env.DISABLE_NARRATION = 'true';
        process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS = '0';
        const mock = executeTool as jest.Mock;
        mock.mockResolvedValue({ ok: false, error: PROVIDER_FAILURE_PREFIX + ' unavailable', output, logs: [] });
        const orchestrator: any = new AgentOrchestrator();
        orchestrator.plan = jest.fn(async () => ({ id: 'provider-test', status: 'idle', nodes: [{
            id: 'build', agent: 'General', task: 'build the application', tool, input: {}, dependencies: [], status: 'pending',
        }] }));
        const recovery = jest.spyOn(orchestrator, 'attemptRecovery');
        try {
            const result = await orchestrator.execute({ id: 'terminal-provider-test', goal: 'Build an application',
                context: { sessionId: 'terminal-provider-test', workspaceId: 'terminal-provider-workspace', engineeringPipeline: true } });
            expect(result.ok).toBe(false);
            expect(result.result).toEqual(output);
            expect(mock).toHaveBeenCalledTimes(calls as number);
            expect(recovery).not.toHaveBeenCalled();
            expect(orchestrator.plan).toHaveBeenCalledTimes(1);
        } finally {
            mock.mockReset(); recovery.mockRestore();
            if (previousNarration === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = previousNarration;
            if (previousWait === undefined) delete process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS; else process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS = previousWait;
        }
    });
});
