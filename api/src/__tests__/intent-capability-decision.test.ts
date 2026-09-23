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

    it('prioritizes an explicit route-choice request even when it names the app it would serve', async () => {
        const intent = await IntentParser.parse('Choose the least-setup safe route for a weather dashboard. Do not change files.', {} as any);
        expect(intent.requiredTools).toEqual(['decide_capability_route']);
    });

    it('does not mistake a build request mentioning speech for a decision request', () => {
        expect(IntentParser.capabilityDecisionIntent('Build an offline speech transcription application.')).toBeNull();
        expect(IntentParser.capabilityDecisionIntent('Build a weather dashboard and choose a provider later.')).toBeNull();
    });
});
