import * as ToolService from '../modules/services/ToolService';
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';

type SeenContext = { runId?: string; sessionId?: string };

const dagFor = () => ({
    id: 'run-identity-plan',
    status: 'idle' as const,
    nodes: [{
        id: 'answer',
        agent: 'General' as const,
        task: 'answer the request',
        tool: 'central_answer',
        input: { question: 'ok' },
        dependencies: [],
        status: 'pending' as const,
    }],
});

describe('orchestrator canonical run identity reaches the tool boundary', () => {
    it('uses a distinct execution runId for two runs in one chat session', async () => {
        const seen: SeenContext[] = [];
        const executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockImplementation(
            async (_name: string, _input: any, context?: any) => {
                seen.push({ runId: context?.runId, sessionId: context?.sessionId });
                return { ok: true, output: 'ok', logs: [] } as any;
            },
        );
        const orchestrator: any = new AgentOrchestrator();
        orchestrator.plan = jest.fn(async () => dagFor());
        const sessionId = 'run-identity-chat';
        const stalePlannerContext = {
            sessionId,
            runId: 'stale-session-identity',
            workspaceId: 'run-identity-workspace',
        };

        try {
            const first = await orchestrator.execute({
                id: sessionId,
                traceId: 'run-identity-first',
                goal: 'first run',
                context: stalePlannerContext,
            });
            const second = await orchestrator.execute({
                id: sessionId,
                traceId: 'run-identity-second',
                goal: 'second run',
                context: stalePlannerContext,
            });

            expect(first.ok).toBe(true);
            expect(second.ok).toBe(true);
            expect(seen.map(x => x.runId)).toEqual([
                'run-identity-first',
                'run-identity-second',
            ]);
            expect(seen[0].runId).not.toBe(seen[1].runId);
            expect(seen.every(x => x.sessionId === sessionId)).toBe(true);
        } finally {
            executeToolSpy.mockRestore();
        }
    });
});
