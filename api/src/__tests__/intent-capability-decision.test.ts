import intelligentRouter from '../core/llm/intelligent-router';
import { IntentParser } from '../core/intelligence/IntentParser';

describe('capability decision intent', () => {
    it('does not spend a model call before an explicit local route decision', async () => {
        const routeToModel = jest.spyOn(intelligentRouter, 'routeToModel').mockRejectedValue(new Error('must not be called'));
        const intent = await IntentParser.parse('Choose the least-setup safe route for offline speech transcription with local-only privacy.', {} as any);
        expect(intent).toMatchObject({ suggestedAgent: 'Dev', requiredTools: ['decide_capability_route'] });
        expect(intent.rawIntent).toMatchObject({ capabilityDecision: true, deterministic: true });
        expect(routeToModel).not.toHaveBeenCalled();
        routeToModel.mockRestore();
    });

    it('does not mistake a build request mentioning speech for a decision request', () => {
        expect(IntentParser.capabilityDecisionIntent('Build an offline speech transcription application.')).toBeNull();
    });
});
