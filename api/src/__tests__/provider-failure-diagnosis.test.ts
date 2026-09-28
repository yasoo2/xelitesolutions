import * as localBrain from '../core/llm/local-brain';
import { localProvider } from '../core/llm/providers/registry';
import {
    isProviderFailure,
    isLocalTimeoutError,
    localBrainFailureAdvice,
    localBrainState,
    resetLocalBrainBreaker,
    routeToModel,
} from '../core/llm/intelligent-router';

describe('provider failure diagnosis', () => {
    it('recognizes the local provider timeout wording seen in the real UI', () => {
        expect(isLocalTimeoutError('TIMEOUT')).toBe(true);
        expect(isLocalTimeoutError('Request timed out.')).toBe(true);
        expect(isLocalTimeoutError('ETIMEDOUT')).toBe(true);
        expect(isLocalTimeoutError('connection refused')).toBe(false);
        expect(isLocalTimeoutError('quota exceeded')).toBe(false);
    });

    it('distinguishes a detected but slow Ollama from an absent local model', () => {
        expect(localBrainFailureAdvice(true, true)).toContain('تجاوز المهلة');
        expect(localBrainFailureAdvice(true, true)).not.toContain('شغّل Ollama');
        expect(localBrainFailureAdvice(true, false)).toContain('لم يحصل على رد صالح');
        expect(localBrainFailureAdvice(false, false)).toContain('شغّل Ollama');
    });

    it('reports the observed local timeout from the router without claiming Ollama is stopped', async () => {
        const saved = {
            OFFLINE_MODE: process.env.OFFLINE_MODE,
            LOCAL_LLM_STRICT: process.env.LOCAL_LLM_STRICT,
            LOCAL_LLM_BASE_URL: process.env.LOCAL_LLM_BASE_URL,
            LLM_CACHE_DISABLE: process.env.LLM_CACHE_DISABLE,
            MOCK_LLM: process.env.MOCK_LLM,
        };
        process.env.OFFLINE_MODE = 'true';
        process.env.LOCAL_LLM_STRICT = '1';
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:1/v1';
        process.env.LLM_CACHE_DISABLE = '1';
        delete process.env.MOCK_LLM;
        const ready = jest.spyOn(localBrain, 'isLocalBrainReady').mockReturnValue(true);
        const configured = jest.spyOn(localProvider, 'isConfigured').mockReturnValue(true);
        const completion = jest.spyOn(localProvider, 'chatComplete').mockRejectedValue(new Error('Request timed out.'));
        resetLocalBrainBreaker();
        try {
            const context: any = { purpose: 'internal', workspaceId: 'diagnosis-timeout', providerTimeoutMs: 10_000 };
            const answer = await routeToModel(
                [{ role: 'user', content: 'Plan a small task' }],
                { type: 'code_generation', complexity: 'low' } as any,
                undefined, undefined, undefined, undefined, undefined, context,
            );
            expect(completion).toHaveBeenCalled();
            expect(localBrainState().consecutiveTimeouts).toBeGreaterThanOrEqual(1);
            expect(context.providerAttempts).toEqual(expect.arrayContaining([
                expect.objectContaining({ provider: 'Local (Auto)', success: false, error: 'Request timed out.' }),
            ]));
            expect(isProviderFailure(answer)).toBe(true);
            expect(answer).toContain('تجاوز المهلة');
            expect(answer).not.toContain('شغّل Ollama');
        } finally {
            completion.mockRestore();
            configured.mockRestore();
            ready.mockRestore();
            resetLocalBrainBreaker();
            for (const [key, value] of Object.entries(saved)) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
    });
});
