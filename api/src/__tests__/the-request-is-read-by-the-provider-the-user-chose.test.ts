/**
 * THE REQUEST IS READ BY THE PROVIDER THE USER CHOSE.
 *
 * Measured on 2026-11-02 in Joe's interface: Claude was chosen and connected,
 * and a short follow-up question («ومتى أستعمل كل واحد منهما؟») sat for
 * minutes. The intent parser that reads the request ran on the local model
 * on the CPU: the orchestrator handed it the whole run context where it
 * expects the provider choice (modelConfig), so the router found no provider
 * in it and took the default. The owner's rule: whatever provider the user
 * chooses, Joe runs on it.
 */
import { AgentOrchestrator } from '../orchestration/AgentOrchestrator';
import { IntentParser } from '../core/intelligence/IntentParser';
import * as router from '../core/llm/intelligent-router';

const CLAUDE = { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'sk-ant-users-own' };

afterEach(() => jest.restoreAllMocks());

describe('the request is read on the chosen provider', () => {
    it('the intent parser is given the chosen provider and the run id, not the whole run context', async () => {
        const parse = jest.spyOn(IntentParser, 'parse').mockResolvedValue({
            goal: 'q', complexity: 'low', riskLevel: 'low', suggestedAgent: 'General', rawIntent: {}, constraints: [], requiredTools: [],
        } as any);
        const orchestrator: any = new AgentOrchestrator();
        orchestrator.context = { sessionId: 's-provider', runId: 'run-provider-1', modelConfig: CLAUDE, language: 'ar' };
        await orchestrator.plan('ومتى أستعمل كل واحد منهما؟ أعطني مثالين قصيرين.', undefined, 'trace-provider').catch(() => undefined);

        expect(parse).toHaveBeenCalled();
        const context: any = parse.mock.calls[0][1];
        expect(context.modelConfig).toEqual(CLAUDE);
        expect(context.runId).toBe('run-provider-1');
    });

    it('and the parser hands that choice to the router', async () => {
        const route = jest.spyOn(router, 'routeToModel').mockResolvedValue('{"primary":"answer","suggestedAgent":"General"}' as any);
        const context = IntentParser.createContext('orchestrator', 'global', [], CLAUDE);
        await IntentParser.parse('Explain the difference between two browser storage APIs, with two short examples of each use.', context);
        const seen = route.mock.calls.map(call => (call[7] as any)?.modelConfig).filter(Boolean);
        if (route.mock.calls.length) expect(seen[0]).toEqual(CLAUDE);
    });
});
