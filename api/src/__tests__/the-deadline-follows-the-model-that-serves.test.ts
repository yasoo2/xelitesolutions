import { selectedLocalAnswerBudgetMs } from '../core/llm/selected-local-answer-budget';
import { servedModelConfig } from '../core/llm/served-local-selection';

/**
 * Eval L1-en-answer, 2026-10-22: the UI's default «Auto» on a server pinned to
 * local Ollama got the 45 s cloud deadline; the CPU-only model needs ~75 s just
 * to read the prompt. Named local finished in 2.3 min under the 300 s cap.
 */
const ENV = ['LOCAL_LLM_STRICT', 'LLM_PROVIDER', 'LOCAL_LLM_MODEL', 'LOCAL_LLM_BASE_URL', 'LOCAL_LLM_DISABLE'] as const;
const saved: Record<string, string | undefined> = {};
const budget = (modelConfig?: any) => selectedLocalAnswerBudgetMs(servedModelConfig({ modelConfig }));

describe('the answer deadline follows the model that serves', () => {
    beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
    afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

    const pinLocal = () => {
        process.env.LOCAL_LLM_STRICT = '1';
        process.env.LLM_PROVIDER = 'local';
        process.env.LOCAL_LLM_MODEL = 'qwen3.5:9b-joe-q4_K_M';
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1';
    };

    it('Auto on a server pinned to local gets the local deadline', () => {
        pinLocal();
        expect(budget({ provider: 'auto', model: 'auto' })).toBe(300_000);
        expect(budget(undefined)).toBe(300_000);
    });

    it('Auto with no pinned local keeps the cloud deadline', () => {
        expect(budget({ provider: 'auto', model: 'auto' })).toBe(45_000);
    });

    it('a provider he named is never overridden', () => {
        pinLocal();
        expect(budget({ provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'synthetic-key' })).toBe(45_000);
    });

    it('a disabled local brain is not a selection', () => {
        pinLocal();
        process.env.LOCAL_LLM_DISABLE = '1';
        expect(budget({ provider: 'auto' })).toBe(45_000);
    });
});
