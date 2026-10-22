import {
    isManagedOllamaEndpoint, managedOllamaChat,
    ManagedOllamaChatOptions, ManagedOllamaDependencies,
} from '../core/llm/providers/managed-ollama-chat';
import { RequestResourceManager } from '../core/resources/RequestResourceManager';

const base: ManagedOllamaChatOptions = {
    baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M',
    messages: [{ role: 'user', content: 'Hello' }], timeoutMs: 1000,
};
const completed = (content = 'Hello back', extra: Record<string, unknown> = {}) => ({
    done: true, done_reason: 'stop', message: { role: 'assistant', content },
    prompt_eval_count: 30, eval_count: 3, ...extra,
});
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const streamResponse = (...records: (object | string)[]) => new Response(records.map(record =>
    typeof record === 'string' ? record : JSON.stringify(record)).join('\n') + '\n');

function harness(response = jsonResponse(completed()), budget = { contextTokens: 4096, outputTokens: 512 }) {
    const fetch = jest.fn().mockResolvedValue(response);
    const gate = jest.fn(async (work: any, admission: any) => work({ ...budget, signal: admission.signal }));
    const dependencies: ManagedOllamaDependencies = { fetch, resourceManager: { withInference: gate } };
    return { fetch, gate, dependencies };
}

describe('bounded native Ollama transport', () => {
    afterEach(() => jest.useRealTimers());

    test.each([
        'http://localhost:11434', 'http://localhost:11434/', 'http://127.0.0.1:11434/v1',
        'http://[::1]:11434/v1/',
    ])('accepts canonical endpoint %s', endpoint => {
        expect(isManagedOllamaEndpoint(endpoint)).toBe(true);
    });

    test.each([
        'http://127.1:11434', 'http://2130706433:11434', 'https://localhost:11434',
        'http://localhost:5000/v1', 'http://localhost:11434/v1?api_key=secret',
        'http://secret@localhost:11434/v1', 'http://localhost:11434/v1#secret',
        'http://localhost:11434/a/../v1', 'http://localhost:11434/%76%31',
        'http://localhost:11434\\v1', ' http://localhost:11434',
        'http://localhost.:11434', 'http://example.org:11434',
    ])('rejects alternate endpoint spelling %s', endpoint => {
        expect(isManagedOllamaEndpoint(endpoint)).toBe(false);
    });

    it('dispatches once with the admitted native budget and finite retention', async () => {
        const test = harness(jsonResponse(completed()), { contextTokens: 2048, outputTokens: 120 });
        const result = await managedOllamaChat({ ...base, maxCompletionTokens: 120, reasoningEffort: 'none', temperature: 0 }, test.dependencies);
        expect(result.content).toBe('Hello back');
        expect(result.metrics).toMatchObject({ contextTokens: 2048, outputTokens: 120, prompt_eval_count: 30, eval_count: 3 });
        expect(test.fetch).toHaveBeenCalledTimes(1);
        expect(test.fetch.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
        const request = test.fetch.mock.calls[0][1];
        expect(request.redirect).toBe('error');
        expect(JSON.parse(request.body)).toMatchObject({
            stream: false, keep_alive: '5m', truncate: false, shift: false, think: false,
            options: { num_ctx: 2048, num_predict: 120, temperature: 0 },
        });
        expect(test.gate.mock.calls[0][1]).toMatchObject({ requestedContextTokens: 16384, requestedOutputTokens: 120, queueTimeoutMs: 1000, fitOutputToContext: true });
    });

    it('passes a trusted configured context ceiling and never invents no-thinking for another model', async () => {
        const test = harness();
        await managedOllamaChat({ ...base, model: 'llama3.1', reasoningEffort: 'none', maxContextTokens: 4096 }, test.dependencies);
        expect(test.gate.mock.calls[0][1].requestedContextTokens).toBe(4096);
        expect(JSON.parse(test.fetch.mock.calls[0][1].body)).not.toHaveProperty('think');
    });

    test.each(['low', 'NONE', false])('rejects unsupported direct adapter effort %p before admission or HTTP', async reasoningEffort => {
        const test = harness();
        await expect(managedOllamaChat({ ...base, reasoningEffort: reasoningEffort as any }, test.dependencies))
            .rejects.toMatchObject({ code: 'OLLAMA_UNSUPPORTED_INPUT' });
        expect(test.gate).not.toHaveBeenCalled();
        expect(test.fetch).not.toHaveBeenCalled();
    });

    it('lets a 300-second caller deadline cover a legitimate cold request ahead in the queue', async () => {
        const test = harness();
        await managedOllamaChat({ ...base, timeoutMs: 300_000 }, test.dependencies);
        expect(test.gate.mock.calls[0][1].queueTimeoutMs).toBe(300_000);
        const larger = harness();
        await managedOllamaChat({ ...base, timeoutMs: 600_000 }, larger.dependencies);
        expect(larger.gate.mock.calls[0][1].queueTimeoutMs).toBe(300_000);
    });

    it('an explicit cap bounds the window and an admitted window above the cap is refused', async () => {
        const test = harness(jsonResponse(completed()), { contextTokens: 8192, outputTokens: 512 });
        await managedOllamaChat({ ...base, maxContextTokens: 8192 }, test.dependencies);
        expect(test.gate.mock.calls[0][1].requestedContextTokens).toBe(8192);
        expect(JSON.parse(test.fetch.mock.calls[0][1].body).options.num_ctx).toBe(8192);
        const defaultCap = harness(jsonResponse(completed()), { contextTokens: 8192, outputTokens: 512 });
        await expect(managedOllamaChat({ ...base, maxContextTokens: 4096 }, defaultCap.dependencies)).rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
        expect(defaultCap.fetch).not.toHaveBeenCalled();
    });

    it('preserves developer, image, assistant calls, thinking and tool-result identity', async () => {
        const test = harness();
        const tools = [{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: {
            type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false,
        } } }];
        await managedOllamaChat({ ...base, tools, messages: [
            { role: 'developer', content: 'Follow policy' },
            { role: 'user', content: [{ type: 'text', text: 'Inspect ' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } }, { type: 'text', text: 'this' }] },
            { role: 'assistant', content: null, thinking: 'Need a file', tool_calls: [{ id: 'call_one', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } }] },
            { role: 'tool', content: 'file content', tool_call_id: 'call_one', name: 'read_file' },
        ] }, test.dependencies);
        const payload = JSON.parse(test.fetch.mock.calls[0][1].body);
        expect(payload.tools).toEqual(tools);
        expect(payload.messages).toEqual([
            { role: 'system', content: 'Follow policy' },
            { role: 'user', content: 'Inspect this', images: ['aGVsbG8='] },
            { role: 'assistant', content: '', thinking: 'Need a file', tool_calls: [{ id: 'call_one', function: { name: 'read_file', arguments: { path: 'a.ts' }, index: 0 } }] },
            { role: 'tool', content: 'file content', tool_name: 'read_file', tool_call_id: 'call_one' },
        ]);
    });

    it('returns native function calls in OpenAI shape without executing them', async () => {
        const test = harness(jsonResponse(completed('', { message: { role: 'assistant', content: '', tool_calls: [
            { id: 'native_id', function: { index: 0, name: 'read_file', arguments: { path: 'x.ts' } } },
        ] } })));
        const result = await managedOllamaChat(base, test.dependencies);
        expect(result.tool_calls).toEqual([{ id: 'native_id', type: 'function', function: { name: 'read_file', arguments: '{"path":"x.ts"}' } }]);
        expect(test.fetch).toHaveBeenCalledTimes(1);
    });

    it('streams split UTF-8 records and requires a terminal done record', async () => {
        const records = [
            { done: false, message: { role: 'assistant', content: 'مرحبا' } },
            completed(' world'),
        ].map(record => JSON.stringify(record)).join('\n') + '\n';
        const bytes = new TextEncoder().encode(records);
        const response = new Response(new ReadableStream({ start(controller) {
            for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
            controller.close();
        } }));
        const test = harness(response);
        const onDelta = jest.fn();
        const result = await managedOllamaChat({ ...base, onDelta }, test.dependencies);
        expect(result.content).toBe('مرحبا world');
        expect(onDelta.mock.calls.flat()).toEqual(['مرحبا', ' world']);
        expect(JSON.parse(test.fetch.mock.calls[0][1].body).stream).toBe(true);
    });

    test.each([
        ['no terminal', streamResponse({ done: false, message: { role: 'assistant', content: 'partial' } }), 'OLLAMA_INCOMPLETE'],
        ['empty completion', streamResponse(completed('')), 'OLLAMA_INCOMPLETE'],
        ['malformed JSON', streamResponse('SECRET_NOT_JSON'), 'OLLAMA_INVALID_RESPONSE'],
        ['length stop', streamResponse(completed('partial', { done_reason: 'length' })), 'LOCAL_COMPLETION_LIMIT'],
        ['budget reached', streamResponse(completed('partial', { eval_count: 512 })), 'LOCAL_COMPLETION_LIMIT'],
        ['actual prompt overflow', streamResponse(completed('partial', { prompt_eval_count: 4000 })), 'LOCAL_COMPLETION_LIMIT'],
        ['remote response', streamResponse(completed('cloud', { remote_host: 'secret.example' })), 'OLLAMA_REMOTE_RESPONSE'],
    ])('fails %s without a second request', async (_label, response, code) => {
        const test = harness(response as Response);
        await expect(managedOllamaChat({ ...base, onDelta: () => undefined }, test.dependencies)).rejects.toMatchObject({ code });
        expect(test.fetch).toHaveBeenCalledTimes(1);
    });

    test.each([
        [{ role: 'function', content: 'legacy' }],
        [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'secret' } }] }],
        [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://private.example/secret' } }] }],
        [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'file:///secret.png' } }] }],
        [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,bad' } }] }],
        [{ role: 'user', content: 'a', ignored_secret: 'never drop' }],
        [{ role: 'assistant', content: null, tool_calls: [{ type: 'function', function: { name: 'run', arguments: 'SECRET_MALFORMED' } }] }],
        [{ role: 'assistant', content: null, tool_calls: [{ type: 'function', function: { name: 'run', arguments: '[]' } }] }],
    ])('rejects unsupported or malformed message semantics before network', async (...messages) => {
        const test = harness();
        await expect(managedOllamaChat({ ...base, messages }, test.dependencies)).rejects.toHaveProperty('code');
        expect(test.fetch).not.toHaveBeenCalled();
    });

    test.each(['auto', 'qwen3.5:9b-cloud', 'https://private.example/model', '../model'])('rejects nonlocal model %s', async model => {
        const test = harness();
        await expect(managedOllamaChat({ ...base, model }, test.dependencies)).rejects.toMatchObject({ code: 'OLLAMA_MODEL' });
        expect(test.fetch).not.toHaveBeenCalled();
    });

    it('supports json/schema format and rejects unknown formats before admission', async () => {
        const test = harness();
        await managedOllamaChat({ ...base, format: { type: 'object', properties: { ok: { type: 'boolean' } } } }, test.dependencies);
        expect(JSON.parse(test.fetch.mock.calls[0][1].body).format.type).toBe('object');
        const invalid = harness();
        await expect(managedOllamaChat({ ...base, format: 'xml' as any }, invalid.dependencies)).rejects.toMatchObject({ code: 'OLLAMA_FORMAT_INPUT' });
        expect(invalid.fetch).not.toHaveBeenCalled();
    });

    it('rejects estimated overflow without truncating or requesting inference', async () => {
        const test = harness();
        await expect(managedOllamaChat({ ...base, messages: [{ role: 'user', content: 'x'.repeat(15000) }] }, test.dependencies)).rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
        expect(test.fetch).not.toHaveBeenCalled();
    });

    it('bounds request and NDJSON record bytes', async () => {
        const request = harness();
        await expect(managedOllamaChat({ ...base, messages: [{ role: 'user', content: 'x'.repeat(8 * 1024 * 1024 + 1) }] }, request.dependencies)).rejects.toMatchObject({ code: 'OLLAMA_INPUT_LIMIT' });
        expect(request.fetch).not.toHaveBeenCalled();
        const streamed = harness(streamResponse({ done: false, message: { role: 'assistant', content: 'x'.repeat(256 * 1024) } }));
        await expect(managedOllamaChat({ ...base, onDelta: () => undefined }, streamed.dependencies)).rejects.toMatchObject({ code: 'OLLAMA_RECORD_LIMIT' });
        expect(streamed.fetch).toHaveBeenCalledTimes(1);
    });

    it('bounds accumulated output bytes', async () => {
        const record = { done: false, message: { role: 'assistant', content: 'x'.repeat(100000) } };
        const test = harness(streamResponse(...Array(11).fill(record), completed('end')));
        await expect(managedOllamaChat({ ...base, onDelta: () => undefined }, test.dependencies)).rejects.toMatchObject({ code: 'OLLAMA_OUTPUT_LIMIT' });
    });

    it('preserves every bounded record inside a large single HTTP chunk', async () => {
        const pieces = Array.from({ length: 9 }, (_, index) => `${index}:` + 'x'.repeat(90000));
        const text = pieces.map(content => JSON.stringify({ done: false, message: { role: 'assistant', content } })).join('\n')
            + '\n' + JSON.stringify(completed('tail')) + '\n';
        const response = new Response(new ReadableStream({ start(controller) {
            controller.enqueue(new TextEncoder().encode(text)); controller.close();
        } }));
        const test = harness(response);
        const result = await managedOllamaChat({ ...base, onDelta: () => undefined }, test.dependencies);
        expect(result.content).toBe(pieces.join('') + 'tail');
        expect(test.fetch).toHaveBeenCalledTimes(1);
    });

    it('sanitizes transport and HTTP error bodies', async () => {
        const test = harness();
        test.fetch.mockRejectedValue(new Error('api_key=SECRET_FROM_FETCH private prompt'));
        await expect(managedOllamaChat(base, test.dependencies)).rejects.toMatchObject({ code: 'OLLAMA_TRANSPORT_ERROR', message: 'Local inference transport failed; no retry was started.' });
        const http = harness(jsonResponse({ error: 'SECRET_FROM_SERVER' }, 500));
        await expect(managedOllamaChat(base, http.dependencies)).rejects.toMatchObject({ code: 'OLLAMA_HTTP_ERROR', message: 'Local inference returned HTTP 500.' });
    });

    it('cancels before admission without forwarding caller secret reasons', async () => {
        const test = harness();
        const controller = new AbortController();
        controller.abort('SECRET_REASON');
        await expect(managedOllamaChat({ ...base, signal: controller.signal }, test.dependencies)).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED', message: 'Local inference was cancelled.' });
        expect(test.gate).not.toHaveBeenCalled();
        expect(test.fetch).not.toHaveBeenCalled();
    });

    it('counts queue wait toward deadline and removes the queued cancellation listener', async () => {
        jest.useFakeTimers();
        const test = harness();
        let queued = false;
        let queueSignal: AbortSignal | undefined;
        const removeListener = jest.fn();
        test.gate.mockImplementation((_work: any, admission: any) => new Promise((_resolve, reject) => {
            queued = true;
            queueSignal = admission.signal;
            const abort = () => {
                queued = false;
                admission.signal.removeEventListener('abort', abort);
                removeListener();
                reject(new Error('cancelled'));
            };
            admission.signal.addEventListener('abort', abort, { once: true });
        }));
        const result = managedOllamaChat({ ...base, timeoutMs: 100 }, test.dependencies);
        const rejected = expect(result).rejects.toMatchObject({ code: 'RESOURCE_TIMEOUT' });
        expect(queued).toBe(true);
        await jest.advanceTimersByTimeAsync(100);
        await rejected;
        expect(queueSignal?.aborted).toBe(true);
        expect(queued).toBe(false);
        expect(removeListener).toHaveBeenCalledTimes(1);
        expect(test.fetch).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('does not release the inference operation before a noncooperative fetch settles', async () => {
        const test = harness();
        const controller = new AbortController();
        let resolveFetch!: (response: Response) => void;
        test.fetch.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve; }));
        let settled = false;
        const result = managedOllamaChat({ ...base, signal: controller.signal }, test.dependencies);
        void result.then(() => { settled = true; }, () => { settled = true; });
        await Promise.resolve();
        controller.abort();
        await Promise.resolve();
        expect(settled).toBe(false);
        expect(test.fetch.mock.calls[0][1].signal.aborted).toBe(true);
        resolveFetch(jsonResponse(completed()));
        await expect(result).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(test.fetch).toHaveBeenCalledTimes(1);
    });

    it('integrates with the real lane and removes a cancelled queued request', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => ({
            totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3, availableBytes: 8 * 1024 ** 3,
        }) });
        let resolveFirst!: (response: Response) => void;
        const fetch = jest.fn().mockImplementation(() => new Promise(resolve => { resolveFirst = resolve; }));
        const dependencies: ManagedOllamaDependencies = { fetch, resourceManager: manager };
        const first = managedOllamaChat(base, dependencies);
        for (let step = 0; step < 20; step++) await Promise.resolve();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(manager.status().inference.active).toBe(1);
        const controller = new AbortController();
        const second = managedOllamaChat({ ...base, signal: controller.signal }, dependencies);
        const rejected = expect(second).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        for (let step = 0; step < 20; step++) await Promise.resolve();
        expect(manager.status().heavy.queued).toBe(1);
        controller.abort();
        await rejected;
        expect(manager.status().heavy.queued).toBe(0);
        expect(fetch).toHaveBeenCalledTimes(1);
        resolveFirst(jsonResponse(completed()));
        await expect(first).resolves.toHaveProperty('content', 'Hello back');
        expect(manager.status()).toMatchObject({ activeRequests: 0, heavy: { active: 0, queued: 0 }, inference: { active: 0, queued: 0 } });
    });

    it('cancels this request reader and detaches the caller listener after streaming abort', async () => {
        const controller = new AbortController();
        const add = jest.spyOn(controller.signal, 'addEventListener');
        const remove = jest.spyOn(controller.signal, 'removeEventListener');
        const cancel = jest.fn();
        const response = new Response(new ReadableStream({ start(stream) {
            stream.enqueue(new TextEncoder().encode(JSON.stringify({ done: false, message: { role: 'assistant', content: 'partial' } }) + '\n'));
        }, cancel }));
        const test = harness(response);
        await expect(managedOllamaChat({ ...base, signal: controller.signal, onDelta: () => controller.abort() }, test.dependencies)).rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
        expect(response.body?.locked).toBe(false);
        expect(test.fetch).toHaveBeenCalledTimes(1);
    });
});
