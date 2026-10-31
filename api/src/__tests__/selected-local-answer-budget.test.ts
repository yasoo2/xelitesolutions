import { selectedLocalAnswerBudgetMs } from '../core/llm/selected-local-answer-budget';
const selected = { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' };
describe('Answer deadline on the explicitly selected canonical local route', () => {
    test.each(['http://localhost:11434', 'http://127.0.0.1:11434/', 'http://localhost:11434/v1/', 'http://[::1]:11434/v1'])('named model at %s gets a finite cold-start budget', baseUrl => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: { ...selected, baseUrl } })).toBe(300_000);
    });
    test.each(['', 'dummy', 'auto-mode', 'free-mode', 'free'])('local key class %s does not change a valid selected model', apiKey => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: { ...selected, apiKey } })).toBe(300_000);
    });
    test.each(['https://localhost:11434/v1', 'http://remote.invalid:11434/v1', 'http://127.0.0.1:5000/v1', 'http://localhost:11434/v1?x=1', 'http://user@localhost:11434/v1', 'http://localhost:11434/other/../v1'])('invalid endpoint %s never gets extra time', baseUrl => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: { ...selected, baseUrl } })).toBe(45_000);
    });
    test.each(['auto', '', 'qwen:cloud', 'qwen-cloud', 'qwen 7b'])('invalid/cloud/picker model %s never gets extra time', model => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: { ...selected, model } })).toBe(45_000);
    });
    test.each(['openai', 'nvidia', 'auto', undefined])('provider %s retains the ordinary deadline', provider => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: { ...selected, provider } })).toBe(45_000);
    });
    test('missing context retains the ordinary deadline', () => expect(selectedLocalAnswerBudgetMs()).toBe(45_000));
    test('both upstream budgets remain authoritative and are never extended', () => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: selected, providerTimeoutMs: 25_000, plannerTimeoutMs: 20_000 })).toBe(20_000);
        expect(selectedLocalAnswerBudgetMs({ providerTimeoutMs: 25_000, plannerTimeoutMs: 20_000 })).toBe(20_000);
    });
    test('longer upstream budgets cannot exceed the eligible cap', () => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: selected, providerTimeoutMs: 600_000 })).toBe(300_000);
        expect(selectedLocalAnswerBudgetMs({ providerTimeoutMs: 300_000 })).toBe(45_000);
    });
    test.each([undefined, null, 0, -1, NaN, Infinity, 'invalid'])('nonpositive/nonfinite budget %s retains the bounded cap', providerTimeoutMs => {
        expect(selectedLocalAnswerBudgetMs({ modelConfig: selected, providerTimeoutMs })).toBe(300_000);
    });
    test('numeric upstream values retain the existing conversion contract', () => expect(selectedLocalAnswerBudgetMs({ modelConfig: selected, providerTimeoutMs: '1234' })).toBe(1234));
});
