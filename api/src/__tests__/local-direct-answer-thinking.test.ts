/** Actual leaf bodies and answer-context boundary; every provider transport is inert. */
export {};

const QUESTION = 'Explain how isolated tests exercise a boundary.';
const MESSAGES = [{ role: 'user', content: QUESTION }];
const BLOCK = { choices: [{ message: { content: 'A bounded answer.' } }] };
async function* chunks() { yield { choices: [{ delta: { content: 'A bounded answer.' } }] }; }
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function nativeResponse(stream: boolean, content = 'A bounded answer.'): Response {
    const record = { done: true, done_reason: 'stop', prompt_eval_count: 30, eval_count: 3,
        message: { role: 'assistant', content } };
    return new Response(JSON.stringify(record) + (stream ? '\n' : ''));
}

const originalEnv = process.env;
const originalFetch = global.fetch;
afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.resetModules();
});

function localFixture(base = 'http://127.0.0.1:11434', configuredModel = 'qwen3.5:4b') {
    jest.resetModules();
    process.env = { NODE_ENV: 'test', LOCAL_LLM_BASE_URL: base, LOCAL_LLM_MODEL: configuredModel,
        LOCAL_LLM_TIMEOUT: '1234', AI_COST_POLICY: 'free_only' };
    const create = jest.fn(async (request: any, _options?: any) => request.stream ? chunks() : BLOCK);
    const construct = jest.fn(() => ({ chat: { completions: { create } } }));
    const nativeFetch = jest.fn(async (_url: any, request: any) => nativeResponse(JSON.parse(request.body).stream));
    global.fetch = nativeFetch;
    jest.doMock('openai', () => ({ __esModule: true, default: construct }));
    jest.doMock('../core/resources/RequestResourceManager', () => ({ ...jest.requireActual('../core/resources/RequestResourceManager'), requestResourceManager: {
        withInference: async (work: any, admission: any) => work({ signal: admission.signal, contextTokens: 4096, outputTokens: Math.min(admission.requestedOutputTokens, 4096 - admission.promptEstimatedTokens - 1) }),
        withHeavy: async (work: any) => work(),
        currentSignal: () => undefined,
    } }));
    const { LocalProvider } = require('../core/llm/providers/local');
    return { provider: new LocalProvider(), create, construct, nativeFetch };
}

function answerFixture() {
    jest.resetModules();
    jest.useFakeTimers();
    process.env = { NODE_ENV: 'test', AI_COST_POLICY: 'free_only' };
    const route = jest.fn();
    jest.doMock('../core/llm/intelligent-router', () => ({ ...jest.requireActual('../core/llm/intelligent-router'), routeToModel: route, PROVIDER_FAILURE_PREFIX: 'provider_failed:' }));
    const { CentralAnswerTool } = require('../modules/tools/definitions/CentralAnswerTool');
    return { answer: new CentralAnswerTool(), route };
}

describe('explicit local direct-answer reasoning request', () => {
    test.each([false, true])('adds native opt-in to stream=%s with bounded model, tokens and owned signal', async stream => {
        const f = localFixture();
        const owner = new AbortController();
        const partial = jest.fn();
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', stream ? partial : undefined, owner.signal,
            { reasoningEffort: 'none', maxCompletionTokens: 17 })).resolves.toBe('A bounded answer.');
        expect(f.nativeFetch).toHaveBeenCalledTimes(1);
        expect(f.nativeFetch.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
        expect(JSON.parse(f.nativeFetch.mock.calls[0][1].body)).toEqual({ model: 'qwen3.5:4b', messages: MESSAGES,
            keep_alive: '5m', truncate: false, shift: false, think: false, stream,
            options: { num_ctx: 4096, num_predict: 17 } });
        expect(f.nativeFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        expect(f.construct).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
        expect(partial).toHaveBeenCalledTimes(stream ? 1 : 0);
        expect(process.env.AI_COST_POLICY).toBe('free_only');
    });

    test.each(['qwen3', 'qwen3:8b', 'qwen3.5', 'qwen3.5:4b'])('recognizes only the bounded model family %s', async model => {
        const f = localFixture();
        await f.provider.chatComplete(MESSAGES, model, undefined, undefined, { reasoningEffort: 'none' });
        expect(JSON.parse(f.nativeFetch.mock.calls[0][1].body)).toMatchObject({ model, think: false });
    });

    test.each(['http://localhost:11434', 'http://localhost:11434/v1', 'http://127.0.0.1:11434/',
        'http://127.0.0.1:11434/v1/', 'http://[::1]:11434', 'http://[::1]:11434/v1'])
    ('admits the canonical local Ollama base %s', async base => {
        const f = localFixture(base);
        await f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', undefined, undefined, { reasoningEffort: 'none' });
        expect(JSON.parse(f.nativeFetch.mock.calls[0][1].body)).toHaveProperty('think', false);
        expect(f.nativeFetch.mock.calls[0][0]).toMatch(/\/api\/chat$/);
        expect(f.create).not.toHaveBeenCalled();
    });

    test.each(['http://example.invalid:11434', 'http://127.0.0.1:5000/v1', 'https://localhost:11434/v1',
        'http://127.0.0.1:11434/api', 'http://localhost:11434/v1/chat/completions',
        'http://user:pass@localhost:11434/v1', 'http://localhost:11434/v1?x=1', 'http://localhost:11434/v1#x',
        'http://127.1:11434/v1', 'http://2130706433:11434/v1', 'http://localhost.:11434/v1',
        'http://localhost:11434/%76%31', 'not-a-url'])
    ('does not add Ollama fields to a different or invalid endpoint %s', async base => {
        const f = localFixture(base);
        await f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', undefined, undefined, { reasoningEffort: 'none' });
        await f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, undefined, { reasoningEffort: 'none' });
        expect(f.create).toHaveBeenCalledTimes(2); expect(f.nativeFetch).not.toHaveBeenCalled();
        for (const [body] of f.create.mock.calls) {
            for (const key of ['reasoning_effort', 'think', 'options', 'keep_alive', 'truncate', 'shift']) expect(body).not.toHaveProperty(key);
        }
    });

    test.each(['llama3.1', 'qwen2.5-coder:7b', 'qwen3-coder:30b', 'vendor/qwen3.5:4b'])
    ('preserves another valid local model %s without changing its thinking setting', async model => {
        const f = localFixture();
        await f.provider.chatComplete(MESSAGES, model, undefined, undefined, { reasoningEffort: 'none' });
        await f.provider.chatComplete(MESSAGES, model, () => {}, undefined, { reasoningEffort: 'none' });
        for (const [, request] of f.nativeFetch.mock.calls) {
            const body = JSON.parse(request.body);
            expect(body.model).toBe(model); expect(body).not.toHaveProperty('think');
        }
    });

    test.each(['qwen3.5:4b trailing', 'auto', 'qwen3.5:9b-cloud'])('rejects malformed or nonlocal model %s before transport', async model => {
        const f = localFixture();
        await expect(f.provider.chatComplete(MESSAGES, model, undefined, undefined, { reasoningEffort: 'none' })).rejects.toMatchObject({ code: 'OLLAMA_MODEL' });
        expect(f.nativeFetch).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled();
    });

    test.each([undefined, {}])('keeps native think absent without literal explicit none %p', async options => {
        const f = localFixture();
        await f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', undefined, undefined, options);
        await f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, undefined, options);
        for (const [, request] of f.nativeFetch.mock.calls) expect(JSON.parse(request.body)).not.toHaveProperty('think');
    });

    test.each([{ reasoningEffort: 'low' }, { reasoningEffort: 'NONE' }, { reasoningEffort: false }])
    ('keeps the public literal-none-only opt-in absent for unsupported effort %p', async options => {
        const f = localFixture();
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', undefined, undefined, options)).resolves.toBe('A bounded answer.');
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, undefined, options)).resolves.toBe('A bounded answer.');
        expect(f.nativeFetch).toHaveBeenCalledTimes(2);
        for (const [, request] of f.nativeFetch.mock.calls) {
            const body = JSON.parse(request.body);
            expect(body).not.toHaveProperty('think');
            expect(body).not.toHaveProperty('reasoning_effort');
            // No cap: the answer gets the room the window leaves, not 512 (eval round 7).
            expect(body.options.num_ctx).toBe(4096);
            expect(body.options.num_predict).toBeGreaterThan(512);
        }
        expect(f.create).not.toHaveBeenCalled();
        const compatible = localFixture('http://127.0.0.1:5000/v1');
        await compatible.provider.chatComplete(MESSAGES, 'qwen3.5:4b', undefined, undefined, options);
        expect(compatible.create.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
    });

    test('retains configured-model selection when the caller omits the model', async () => {
        const f = localFixture();
        await f.provider.chatComplete(MESSAGES, undefined, undefined, undefined, { reasoningEffort: 'none' });
        expect(JSON.parse(f.nativeFetch.mock.calls[0][1].body)).toMatchObject({ model: 'qwen3.5:4b', think: false });
    });

    test('a failed native stream stops without a second buffered request', async () => {
        const f = localFixture();
        f.nativeFetch.mockRejectedValueOnce(new Error('synthetic unsupported streaming'));
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, undefined, { reasoningEffort: 'none' }))
            .rejects.toMatchObject({ code: 'OLLAMA_TRANSPORT_ERROR' });
        expect(f.nativeFetch).toHaveBeenCalledTimes(1); expect(f.create).not.toHaveBeenCalled();
        expect(JSON.parse(f.nativeFetch.mock.calls[0][1].body)).toMatchObject({ stream: true, think: false });
    });

    test('an empty native stream stops without a second request', async () => {
        const f = localFixture();
        f.nativeFetch.mockResolvedValueOnce(nativeResponse(true, ''));
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, undefined, { reasoningEffort: 'none' }))
            .rejects.toMatchObject({ code: 'OLLAMA_INCOMPLETE' });
        expect(f.nativeFetch).toHaveBeenCalledTimes(1); expect(f.create).not.toHaveBeenCalled();
    });

    test('generic compatible unsupported and empty streams retain their existing buffered behavior', async () => {
        const f = localFixture('http://127.0.0.1:5000/v1');
        f.create.mockRejectedValueOnce(new Error('unsupported')).mockResolvedValueOnce(BLOCK);
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, undefined, { reasoningEffort: 'none' })).resolves.toBe('A bounded answer.');
        expect(f.create).toHaveBeenCalledTimes(2);
        async function* empty() {}
        f.create.mockClear(); f.create.mockResolvedValueOnce(empty()).mockResolvedValueOnce(BLOCK);
        await f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, undefined, { reasoningEffort: 'none' });
        expect(f.create).toHaveBeenCalledTimes(2); expect(f.nativeFetch).not.toHaveBeenCalled();
        for (const [body] of f.create.mock.calls) expect(body).not.toHaveProperty('think');
    });

    test('owner abort after native stream failure prevents a second request', async () => {
        const f = localFixture();
        const owner = new AbortController();
        f.nativeFetch.mockImplementationOnce(async (_url: any, request: any) => { owner.abort(); expect(request.signal.aborted).toBe(true); throw new Error('private owner cancellation'); });
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', () => {}, owner.signal, { reasoningEffort: 'none' }))
            .rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(f.nativeFetch).toHaveBeenCalledTimes(1); expect(f.create).not.toHaveBeenCalled();
        expect(JSON.parse(f.nativeFetch.mock.calls[0][1].body)).toHaveProperty('think', false);
    });

    test('rejects an oversized native output reserve and retains the compatible token clamp', async () => {
        const f = localFixture();
        await expect(f.provider.chatComplete(MESSAGES, 'qwen3.5:4b', undefined, undefined,
            { reasoningEffort: 'none', maxCompletionTokens: 13000.9 })).rejects.toMatchObject({ code: 'OLLAMA_OUTPUT_INPUT' });
        expect(f.nativeFetch).not.toHaveBeenCalled();
        const compatible = localFixture('http://127.0.0.1:5000/v1');
        await compatible.provider.chatComplete(MESSAGES, 'qwen3.5:4b', undefined, undefined,
            { reasoningEffort: 'none', maxCompletionTokens: 13000.9 });
        expect(compatible.create.mock.calls[0][0]).toMatchObject({ max_tokens: 12000 });
    });
});

describe('direct-answer-owned route context', () => {
    test('opts in without changing trusted context, selected route or parent input', async () => {
        const f = answerFixture();
        f.route.mockResolvedValue('A bounded answer.');
        const parent = { language: 'en', sessionId: 'saved-session', workspaceId: 'saved-workspace', userId: 'synthetic-owner',
            modelConfig: { provider: 'auto', model: 'unchanged-selected-model' }, providerTimeoutMs: 3000, localReasoningEffort: 'other' };
        const before = JSON.stringify(parent);
        expect(await f.answer.execute({ question: QUESTION }, parent)).toMatchObject({ ok: true, output: 'A bounded answer.' });
        expect(f.route).toHaveBeenCalledTimes(1);
        expect(f.route.mock.calls[0][1]).toMatchObject({ type: 'complex_reasoning', requiresTools: false });
        expect(f.route.mock.calls[0].slice(2, 7)).toEqual([undefined, undefined, undefined, undefined, undefined]);
        expect(f.route.mock.calls[0][7]).toMatchObject({ sessionId: parent.sessionId, userId: parent.userId,
            workspaceId: parent.workspaceId, modelConfig: parent.modelConfig, localReasoningEffort: 'none', providerTimeoutMs: 3000 });
        expect(f.route.mock.calls[0][7].signal).toBeInstanceOf(AbortSignal);
        expect(JSON.stringify(parent)).toBe(before);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('a language rewrite shares the same bounded opt-in and abort signal', async () => {
        const f = answerFixture();
        f.route.mockResolvedValueOnce('A clear English explanation.').mockResolvedValueOnce('هذه إجابة عربية واضحة ومحدودة تشرح أهمية الاختبارات.');
        expect((await f.answer.execute({ question: 'اشرح أهمية الاختبارات.' }, { language: 'ar' })).ok).toBe(true);
        expect(f.route).toHaveBeenCalledTimes(2);
        expect(f.route.mock.calls[0][7]).toBe(f.route.mock.calls[1][7]);
        expect(f.route.mock.calls[1][7].localReasoningEffort).toBe('none');
        expect(jest.getTimerCount()).toBe(0);
    });

    test('the tighter original caller deadline still aborts an uncooperative provider', async () => {
        const f = answerFixture();
        f.route.mockImplementation(() => new Promise(() => {}));
        const pending = f.answer.execute({ question: QUESTION }, { language: 'en', providerTimeoutMs: 3000, plannerTimeoutMs: 1000 });
        await flush();
        await jest.advanceTimersByTimeAsync(1000);
        expect(await pending).toMatchObject({ ok: false, output: { nonRecoverable: true, reason: 'answer_deadline_exceeded' } });
        expect(f.route).toHaveBeenCalledTimes(1);
        expect(f.route.mock.calls[0][7]).toMatchObject({ localReasoningEffort: 'none', providerTimeoutMs: 1000 });
        expect(f.route.mock.calls[0][7].signal.aborted).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('owner cancellation retains privacy and causes no second answer request', async () => {
        const f = answerFixture();
        f.route.mockImplementation(() => new Promise(() => {}));
        const owner = new AbortController();
        const pending = f.answer.execute({ question: QUESTION }, { language: 'en', signal: owner.signal });
        await flush();
        owner.abort(new Error('PRIVATE_OWNER_DIAGNOSTIC'));
        const result = await pending;
        expect(result).toMatchObject({ ok: false, output: { reason: 'cancelled' } });
        expect(JSON.stringify(result)).not.toContain('PRIVATE_OWNER_DIAGNOSTIC');
        expect(f.route).toHaveBeenCalledTimes(1);
        expect(f.route.mock.calls[0][7].signal.aborted).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('pre-cancellation still wins over an instant answer without a provider', async () => {
        const f = answerFixture();
        expect(await f.answer.execute({ question: 'hello' }, { language: 'en', isCancelled: () => true }))
            .toMatchObject({ ok: false, output: { reason: 'cancelled' } });
        expect(f.route).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    test('a private provider exception remains an honest public failure', async () => {
        const f = answerFixture();
        f.route.mockRejectedValue(new Error('PRIVATE_PROVIDER_DIAGNOSTIC'));
        const result = await f.answer.execute({ question: QUESTION }, { language: 'en' });
        expect(result).toMatchObject({ ok: false, output: { nonRecoverable: true, reason: 'answer_provider_failed' } });
        expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_DIAGNOSTIC');
        expect(f.route).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
    });
});
