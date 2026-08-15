const mockOpenAI = jest.fn();
const mockCreate = jest.fn();

jest.mock('openai', () => ({
    __esModule: true,
    default: mockOpenAI,
}));

describe('LLM7Provider resilience', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        mockCreate.mockReset();
        mockOpenAI.mockReset();
        mockOpenAI.mockImplementation(() => ({
            chat: { completions: { create: mockCreate } },
        }));
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: 'gpt-4o-mini' }] }),
        });
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'planned' } }] });
    });

    afterAll(() => {
        global.fetch = originalFetch;
    });

    it('forwards bounded timeout, abort signal, and completion budget to the gateway', async () => {
        const { LLM7Provider } = await import('../core/llm/providers/llm7');
        const provider = new LLM7Provider();
        const controller = new AbortController();

        await expect(provider.chatComplete(
            [{ role: 'user', content: 'plan a system' }],
            undefined,
            undefined,
            { timeoutMs: 120000, signal: controller.signal, maxCompletionTokens: 12000 },
        )).resolves.toBe('planned');

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'gpt-4o-mini', max_tokens: 12000 }),
            { timeout: 120000, signal: controller.signal },
        );
    });
});

export {};
