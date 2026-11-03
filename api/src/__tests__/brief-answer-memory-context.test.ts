jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(),
    analyzeTask: jest.fn(() => ({ type: 'simple_chat', complexity: 0.1, requiresTools: false })),
    PROVIDER_FAILURE_PREFIX: 'provider_failed:',
}));
import { routeToModel } from '../core/llm/intelligent-router';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';

const router = routeToModel as jest.Mock;
const memoryContext = 'UNRELATED_PROJECT_MEMORY: A previous unverified reply called backups optional data; the user prefers TypeScript.';
const context = {
    language: 'en', userName: 'Alex', memoryContext,
    sessionId: 'memory-contract-session', workspaceId: 'memory-contract-workspace', userId: 'memory-contract-owner',
    modelConfig: { provider: 'local', model: 'existing-local-model' }, providerTimeoutMs: 5000,
};
beforeEach(() => router.mockReset());

it.each([
    'ما فائدة النسخة الاحتياطية للملفات؟ أجب بجملة واحدة.',
    'What is a cache used for in software? Reply in one English sentence.',
    'Compare RAM and disk storage. Reply in one sentence.',
    'Why are backups useful? Answer in a single sentence.',
    'ما الفرق بين الذاكرة والتخزين؟ أجب بجملة واحدة.',
    'What is version control? Reply in one word.',
])('keeps a standalone short factual answer independent of project memories: %s', async question => {
    const answer = /one word/.test(question) ? 'Tracking' : 'A complete factual response.';
    router.mockResolvedValue(answer);
    const result = await new CentralAnswerTool().execute({ question }, context);
    expect(result).toMatchObject({ ok: true, output: answer });
    expect(router).toHaveBeenCalledTimes(1);
    const messages = router.mock.calls[0][0];
    expect(messages[0].content).not.toContain('UNRELATED_PROJECT_MEMORY');
    expect(messages[0].content).not.toContain('WHAT YOU ALREADY KNOW ABOUT THIS USER/PROJECT');
    expect(messages[1]).toEqual({ role: 'user', content: question });
    expect(router.mock.calls[0][7]).toMatchObject({ sessionId: context.sessionId, workspaceId: context.workspaceId, userId: context.userId, modelConfig: context.modelConfig, maxCompletionTokens: /one word/.test(question) ? 32 : 128 });
});

it.each([
    'Which language should my project use? Reply in one sentence.',
    'What is my name? Reply in one word.',
    'What stack do I prefer? Tell me in one sentence.',
    'ما لغة مشروعي المفضلة؟ أجب بجملة واحدة.',
])('retains explicitly requested personal/project memory: %s', async question => {
    router.mockResolvedValue(/one word/.test(question) ? 'Alex' : 'Your project prefers TypeScript.');
    const result = await new CentralAnswerTool().execute({ question }, context);
    expect(result.ok).toBe(true);
    expect(router).toHaveBeenCalledTimes(1);
    expect(router.mock.calls[0][0][0].content).toContain(memoryContext);
});

it.each(['Explain software caching.', 'Describe project workspace isolation in detail.'])('retains existing context behavior for unconstrained answers: %s', async question => {
    router.mockResolvedValue('A complete response.');
    expect((await new CentralAnswerTool().execute({ question }, context)).ok).toBe(true);
    expect(router.mock.calls[0][0][0].content).toContain(memoryContext);
});

it.each(['Reply in one English sentence: why is isolation useful?', 'What is a cache? Reply in one sentence.'])('does not drop standing user instructions while omitting unrelated memory: %s', async question => {
    router.mockResolvedValue('A complete response.');
    const systemInstructions = 'Respect the requested concise format and admit uncertainty.';
    expect((await new CentralAnswerTool().execute({ question }, { ...context, systemInstructions })).ok).toBe(true);
    const system = router.mock.calls[0][0][0].content;
    expect(system).toContain(systemInstructions);
    expect(system).not.toContain(memoryContext);
});

it('retains real clock context for a brief date question without project memory', async () => {
    router.mockResolvedValue('Today has a specific calendar date.');
    expect((await new CentralAnswerTool().execute({ question: 'What is the date today? Reply in one sentence.' }, context)).ok).toBe(true);
    const system = router.mock.calls[0][0][0].content;
    expect(system).toContain('This is the ONLY clock you have');
    expect(system).not.toContain(memoryContext);
});
