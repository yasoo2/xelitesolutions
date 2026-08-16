const mockOpenAI = jest.fn();
const mockCreate = jest.fn();

jest.mock('openai', () => ({
    __esModule: true,
    default: mockOpenAI,
}));

describe('LLM7Provider resilience', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        delete process.env.LLM7_MODEL;
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
        delete process.env.LLM7_MODEL;
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
            expect.objectContaining({ model: 'deepseek-v4-flash:0731' }),
            expect.objectContaining({ timeout: 5000 }),
        );
        expect((global as any).fetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/models$/),
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('selects a live free tool-capable model when a stale forced model is absent', async () => {
        process.env.LLM7_MODEL = 'gpt-4.1-mini';
        (global as any).fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: [
                    { id: 'deepseek-v4-flash:0731', model_type: 'chat', usage_based_only: false, tools_calling: true },
                    { id: 'text-embedding-3-small', model_type: 'embedding', usage_based_only: false },
                ],
            }),
        });
        const { LLM7Provider } = await import('../core/llm/providers/llm7');
        const provider = new LLM7Provider();

        await expect(provider.chatComplete(
            [{ role: 'user', content: 'choose a live engineering model' }],
            undefined,
            undefined,
            { timeoutMs: 5000 },
        )).resolves.toBe('planned');

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'deepseek-v4-flash:0731' }),
            expect.objectContaining({ timeout: 5000 }),
        );
        delete process.env.LLM7_MODEL;
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

    /**
     * A REFUSAL FILE THAT COVERS EVERYTHING MUST NOT SILENCE THE PROVIDER.
     *
     * The blocklist is per-model and lasts a week. One bad hour at the gateway
     * — expired anonymous quota, a proxy in the way — writes every candidate
     * into it, and a provider that obeys it without exception then builds an
     * EMPTY candidate list: no request is made, so no attempt can ever clear
     * the memory, and the provider is dead until the week runs out.
     *
     * Measured on the machine this was written on, whose real
     * data/llm7-blocked.json holds every model of a previous preferred list.
     * The memory advises; it does not veto.
     */
    it('still tries a model when the week-long refusal memory has covered every candidate', async () => {
        const os = require('os'), fsx = require('fs'), p = require('path');
        const dir = fsx.mkdtempSync(p.join(os.tmpdir(), 'joe-blocked-'));
        const previous = process.env.JOE_DATA_DIR;
        process.env.JOE_DATA_DIR = dir;
        try {
            const { PREFERRED_MODELS_FOR_TEST } = await import('../core/llm/providers/llm7');
            fsx.writeFileSync(p.join(dir, 'llm7-blocked.json'),
                JSON.stringify({ at: Date.now(), models: PREFERRED_MODELS_FOR_TEST }));
            // Discovery unavailable — the same shape as no network at all.
            (global as any).fetch = jest.fn().mockRejectedValue(new Error('no gateway'));
            jest.resetModules();
            const { LLM7Provider } = await import('../core/llm/providers/llm7');
            const provider: any = new LLM7Provider();

            const candidates = await provider.buildCandidates(undefined, 200, undefined);
            expect(candidates.length).toBeGreaterThan(0);
        } finally {
            if (previous === undefined) delete process.env.JOE_DATA_DIR;
            else process.env.JOE_DATA_DIR = previous;
            fsx.rmSync(dir, { recursive: true, force: true });
        }
    });
});

export {};
