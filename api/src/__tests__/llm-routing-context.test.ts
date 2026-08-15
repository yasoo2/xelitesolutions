const mockRouteToModel = jest.fn();

jest.mock('../core/llm/intelligent-router', () => ({
    __esModule: true,
    default: {
        routeToModel: mockRouteToModel,
        advancedAnalyzeTask: jest.fn(),
        selectBestModel: jest.fn(),
    },
}));

import { planNextStep } from '../core/llm';

describe('LLM routing context contract', () => {
    beforeEach(() => {
        mockRouteToModel.mockReset();
        mockRouteToModel.mockResolvedValue('{"ok":true}');
    });

    it('passes planner options to routeToModel context, not the analysis slot', async () => {
        const opts = {
            providerTimeoutMs: 120000,
            modelConfig: { provider: 'openai', model: 'gpt-5-mini' },
            purpose: 'planning',
        };

        await expect(planNextStep('plan the API slice', opts)).resolves.toEqual({ ok: true });

        expect(mockRouteToModel).toHaveBeenCalledTimes(1);
        const call = mockRouteToModel.mock.calls[0];
        expect(call[1]).toBeUndefined();
        expect(call[7]).toEqual(opts);
    });
});
