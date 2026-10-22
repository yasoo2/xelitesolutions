jest.mock('../modules/services/ToolService', () => ({
  ...jest.requireActual('../modules/services/ToolService'), executeTool: jest.fn(),
}));
import { executeTool } from '../modules/services/ToolService';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
import { PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';

const failures: Array<{ label: string; error: any; output?: any; goal?: string }> = [
  { label: 'missing user', error: 'unauthorized' },
  { label: 'missing workspace', error: 'workspace_required' },
  { label: 'wrong session owner', error: 'session_forbidden' },
  { label: 'approval gate', error: 'approval_required' },
  { label: 'invalid arguments', error: 'invalid_input' },
  { label: 'unmarked deadline', error: 'The answer could not finish within its time limit.' },
  { label: 'explicit terminal deadline', error: 'Answer deadline exceeded', output: { nonRecoverable: true, status: 'failed' } },
  { label: 'no error string', error: undefined },
  { label: 'structured private error', error: { detail: 'PRIVATE-ERROR-DETAIL' } },
  { label: 'provider outage during a build explanation', error: PROVIDER_FAILURE_PREFIX + ' unavailable',
    goal: 'Explain why developers build reports. Answer only.' },
];
function plan() { return { id: 'failure-contract', status: 'idle', nodes: [
  { id: 'answer', agent: 'General', task: 'Answering: Explain isolation.', tool: 'central_answer', input: { question: 'Explain isolation.' }, dependencies: [], status: 'pending' },
  { id: 'dependent', agent: 'Dev', task: 'Write the answer', tool: 'write_file', input: { path: 'test-only-report.txt', content: '{{FROM:answer}}' }, dependencies: ['answer'], status: 'pending' },
] }; }
describe('a failed answer is not completed content for the next node', () => {
  it.each(failures)('$label stops with failed evidence and no dependent execution', async sample => {
    const previous = process.env.DISABLE_NARRATION, wait = process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS;
    process.env.DISABLE_NARRATION = 'true'; process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS = '0';
    const mock = executeTool as jest.Mock;
    mock.mockResolvedValue({ ok: false, error: sample.error, output: sample.output, logs: [] });
    const orchestrator: any = new AgentOrchestrator(); orchestrator.plan = jest.fn(async () => plan());
    const recovery = jest.spyOn(orchestrator, 'attemptRecovery').mockResolvedValue({ recovered: false, newNodes: [] });
    try {
      const result = await orchestrator.execute({ id: 'failure-' + sample.label, goal: sample.goal || 'Explain isolation and save its answer.',
        context: { sessionId: 'failure-' + sample.label, language: 'en' } });
      expect(result.ok).toBe(false); expect(mock).toHaveBeenCalledTimes(1);
      expect(result.steps.find((s: any) => s.id === 'answer').status).toBe('failed');
      expect(result.steps.find((s: any) => s.id === 'dependent').status).toBe('pending');
      expect(recovery).not.toHaveBeenCalled(); expect(orchestrator.plan).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result)).not.toContain('PRIVATE-ERROR-DETAIL');
      if (!sample.error || typeof sample.error !== 'string') expect(result.result).toBe('The answer could not be completed.');
    } finally {
      mock.mockReset(); recovery.mockRestore();
      if (previous === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = previous;
      if (wait === undefined) delete process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS; else process.env.JOE_PROVIDER_DROUGHT_RETRY_WAIT_MS = wait;
    }
  });
  it('allows successful answer content to reach an authorized planned dependent node', async () => {
    const previous = process.env.DISABLE_NARRATION; process.env.DISABLE_NARRATION = 'true';
    const mock = executeTool as jest.Mock;
    mock.mockResolvedValueOnce({ ok: true, output: 'Useful explanation.' }).mockResolvedValueOnce({ ok: true, output: 'Test-only write receipt' });
    const orchestrator: any = new AgentOrchestrator(); orchestrator.plan = jest.fn(async () => plan());
    const recovery = jest.spyOn(orchestrator, 'attemptRecovery');
    try {
      const result = await orchestrator.execute({ id: 'successful-answer-control', goal: 'Explain isolation and save its answer.',
        context: { sessionId: 'successful-answer-control', language: 'en' } });
      expect(result.ok).toBe(true); expect(mock).toHaveBeenCalledTimes(2);
      expect(mock.mock.calls[1][0]).toBe('write_file'); expect(mock.mock.calls[1][1].content).toBe('Useful explanation.');
      expect(result.steps.every((s: any) => s.status === 'completed')).toBe(true); expect(recovery).not.toHaveBeenCalled();
    } finally {
      mock.mockReset(); recovery.mockRestore();
      if (previous === undefined) delete process.env.DISABLE_NARRATION; else process.env.DISABLE_NARRATION = previous;
    }
  });
});
