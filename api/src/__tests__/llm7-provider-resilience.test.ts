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
        delete process.env.LLM7_MODELS_TIMEOUT_MS;
    });

    it('bounds a hanging model-discovery request and falls back to preferred models', async () => {
        process.env.LLM7_MODELS_TIMEOUT_MS = '50';
        (global as any).fetch = jest.fn((_url: string, init: any) => new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (signal?.aborted) {
                reject(new Error('aborted'));
                return;
            }
            signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }));
        const { LLM7Provider } = await import('../core/llm/providers/llm7');
        const provider = new LLM7Provider();

        await expect(provider.chatComplete(
            [{ role: 'user', content: 'plan a system' }],
            undefined,
            undefined,
            { timeoutMs: 5000 },
        )).resolves.toBe('planned');

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'gpt-4.1-mini' }),
            expect.objectContaining({ timeout: 5000 }),
        );
        expect((global as any).fetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/models$/),
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('serializes concurrent chat completions across provider instances', async () => {
        let resolveFirst!: (value: any) => void;
        const firstCompletion = new Promise<any>(resolve => {
            resolveFirst = resolve;
        });
        mockCreate.mockImplementationOnce(() => firstCompletion);
        const { LLM7Provider } = await import('../core/llm/providers/llm7');
        const firstProvider = new LLM7Provider();
        const secondProvider = new LLM7Provider();

        const first = firstProvider.chatComplete([{ role: 'user', content: 'first' }]);
        await new Promise(resolve => setImmediate(resolve));
        const second = secondProvider.chatComplete([{ role: 'user', content: 'second' }]);
        await new Promise(resolve => setImmediate(resolve));

        expect(mockCreate).toHaveBeenCalledTimes(1);
        // Resolve the first gateway call explicitly; only then may the queued
        // second call reach the OpenAI-compatible gateway.
        resolveFirst({ choices: [{ message: { content: 'first result' } }] });
        await expect(first).resolves.toBe('first result');
        await expect(second).resolves.toBe('planned');
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('stops the candidate loop when the router aborts the in-flight request', async () => {
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ data: [{ id: 'first-model' }, { id: 'second-model' }] }),
        });
        const { LLM7Provider } = await import('../core/llm/providers/llm7');
        const provider = new LLM7Provider();
        const controller = new AbortController();
        mockCreate.mockImplementationOnce(async (_body: any, options: any) => {
            controller.abort(new Error('provider deadline exceeded'));
            if (options.signal.aborted) throw new Error('aborted');
            await new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
            });
        });

        await expect(provider.chatComplete(
            [{ role: 'user', content: 'abort after first candidate' }],
            undefined,
            undefined,
            { timeoutMs: 5000, signal: controller.signal },
        )).rejects.toThrow('aborted');
        expect(mockCreate).toHaveBeenCalledTimes(1);
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
