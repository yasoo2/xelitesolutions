const mockCreate = jest.fn();
const mockOpenAI = jest.fn();

jest.mock('openai', () => ({ __esModule: true, default: mockOpenAI }));
jest.mock('../core/resources/RequestResourceManager', () => ({ requestResourceManager: {
    withInference: async (work: any, admission: any) => work({ signal: admission.signal, contextTokens: 4096, outputTokens: admission.requestedOutputTokens }),
    withHeavy: async (work: any) => work(),
    currentSignal: () => undefined,
} }));

import { LocalProvider } from '../core/llm/providers/local';

describe('LocalProvider cancellation', () => {
    const originalBase = process.env.LOCAL_LLM_BASE_URL;
    const originalTimeout = process.env.LOCAL_LLM_TIMEOUT;
    const originalFetch = global.fetch;
    let nativeFetch: jest.Mock;

    beforeEach(() => {
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434';
        process.env.LOCAL_LLM_TIMEOUT = '1234';
        nativeFetch = jest.fn();
        global.fetch = nativeFetch;
        mockCreate.mockReset();
        mockOpenAI.mockReset();
        mockOpenAI.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
    });

    afterEach(() => {
        global.fetch = originalFetch;
        if (originalBase === undefined) delete process.env.LOCAL_LLM_BASE_URL;
        else process.env.LOCAL_LLM_BASE_URL = originalBase;
        if (originalTimeout === undefined) delete process.env.LOCAL_LLM_TIMEOUT;
        else process.env.LOCAL_LLM_TIMEOUT = originalTimeout;
    });

    it('passes caller cancellation through the owned signal to a native Ollama request', async () => {
        nativeFetch.mockResolvedValue(new Response(JSON.stringify({ done: true, done_reason: 'stop', eval_count: 1,
            message: { role: 'assistant', content: 'OK' } })));
        const controller = new AbortController();
        await expect(new LocalProvider().chatComplete([{ role: 'user', content: 'hello' }], 'qwen2.5-coder:7b', undefined, controller.signal)).resolves.toBe('OK');
        expect(nativeFetch).toHaveBeenCalledTimes(1);
        expect(nativeFetch.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
        expect(nativeFetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        expect(JSON.parse(nativeFetch.mock.calls[0][1].body)).toMatchObject({ model: 'qwen2.5-coder:7b', options: { num_ctx: 4096, num_predict: 512 } });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('does not issue a second request after a streamed native call is aborted', async () => {
        const controller = new AbortController();
        nativeFetch.mockImplementation(async (_url, request) => {
            controller.abort();
            expect(request.signal.aborted).toBe(true);
            throw new Error('private transport cancellation');
        });
        await expect(new LocalProvider().chatComplete([{ role: 'user', content: 'hello' }], 'qwen2.5-coder:7b', () => undefined, controller.signal))
            .rejects.toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(nativeFetch).toHaveBeenCalledTimes(1);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('preserves SDK signal forwarding for a generic compatible server', async () => {
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:5000/v1';
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
        const signal = new AbortController().signal;
        await expect(new LocalProvider().chatComplete([{ role: 'user', content: 'hello' }], 'local-model', undefined, signal)).resolves.toBe('OK');
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'local-model' }), { timeout: 1234, signal });
        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('keep_alive');
        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('options');
        expect(nativeFetch).not.toHaveBeenCalled();
    });
});
