const mockCreate = jest.fn();
const mockOpenAI = jest.fn(() => ({ chat: { completions: { create: mockCreate } } }));

jest.mock('openai', () => ({ __esModule: true, default: mockOpenAI }));
jest.mock('../shared/startup-notes', () => ({ noteMissingKey: jest.fn() }));

import { GeminiProvider } from '../core/llm/providers/gemini';
import { OpenRouterProvider } from '../core/llm/providers/openrouter';
import { CerebrasProvider } from '../core/llm/providers/cerebras';
import { MistralProvider } from '../core/llm/providers/mistral';
import { HuggingFaceProvider } from '../core/llm/providers/huggingface';
import { LLM7Provider } from '../core/llm/providers/llm7';
import { OpenAIProvider } from '../core/llm/providers/openai';
import { PollinationsProvider } from '../core/llm/providers/pollinations';
import { DeepSeekProvider } from '../core/llm/providers/deepseek';

const messages = [{ role: 'user', content: 'Continue the engineering task' }];
type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };
const modes = [
    { name: 'chat', run: (provider: GeminiProvider, options?: RequestOptions) => provider.chatComplete(messages, 'requested-model', undefined, options) },
    { name: 'tools', run: (provider: GeminiProvider, options?: RequestOptions) => provider.chatWithTools(messages, [], 'requested-model', options) },
    { name: 'stream', run: (provider: GeminiProvider, options?: RequestOptions) => provider.chatWithToolsStreaming(messages, [], () => {}, 'requested-model', options) },
];

function completionFor(mode: string): any {
    if (mode !== 'stream') return { choices: [{ message: { content: 'resumed' } }] };
    return (async function* () {
        yield { choices: [{ delta: { content: 'resumed' }, finish_reason: 'stop' }] };
    })();
}

beforeEach(() => {
    mockCreate.mockReset();
    mockOpenAI.mockClear();
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe.each(modes)('Gemini $name provider continuity', ({ name, run }) => {
    it.each([
        ['HTTP quota', { status: 429, headers: { 'retry-after': '60' } }],
        ['nested HTTP quota', { response: { status: 429 } }],
        ['quota code', { code: 'insufficient_quota' }],
        ['Google exhaustion', { error: { status: 'RESOURCE_EXHAUSTED' } }],
        ['HTTP authentication', { status: 401 }],
        ['HTTP permission', { status: 403 }],
        ['nested HTTP authentication', { response: { status: 401 } }],
        ['Google authentication', { error: { status: 'UNAUTHENTICATED' } }],
        ['Google permission', { error: { status: 'PERMISSION_DENIED' } }],
    ])('stops on %s and preserves the original error for the router', async (_label, fields) => {
        const failure = Object.assign(new Error('Provider unavailable'), fields);
        mockCreate.mockRejectedValue(failure);
        const provider = new GeminiProvider('test-key');

        await expect(run(provider)).rejects.toBe(failure);

        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    });

    it('still tries another model when the requested model does not exist', async () => {
        mockCreate.mockRejectedValueOnce(Object.assign(new Error('Model not found'), { status: 404 }));
        mockCreate.mockResolvedValueOnce(completionFor(name));
        const provider = new GeminiProvider('test-key');

        await run(provider);

        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(mockCreate.mock.calls[0][0].model).toBe('models/requested-model');
        expect(mockCreate.mock.calls[1][0].model).not.toBe('models/requested-model');
    });

    it('forwards cancellation and deadline to the SDK without trying another model', async () => {
        const controller = new AbortController();
        const failure = Object.assign(new Error('Request canceled'), { name: 'AbortError' });
        mockCreate.mockImplementationOnce(async () => {
            controller.abort(failure);
            throw failure;
        });
        const provider = new GeminiProvider('test-key');

        await expect(run(provider, { signal: controller.signal, timeoutMs: 1200 })).rejects.toBe(failure);

        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate.mock.calls[0][1]).toEqual({ signal: controller.signal, timeout: 1200 });
    });

    it('does not start an already canceled request', async () => {
        const controller = new AbortController();
        const failure = new Error('Task stopped');
        controller.abort(failure);
        const provider = new GeminiProvider('test-key');

        await expect(run(provider, { signal: controller.signal })).rejects.toBe(failure);

        expect(mockCreate).not.toHaveBeenCalled();
    });

    it('preserves SDK cancellation even without a caller signal', async () => {
        const failure = Object.assign(new Error('Request canceled'), { name: 'APIUserAbortError' });
        mockCreate.mockRejectedValue(failure);
        const provider = new GeminiProvider('test-key');

        await expect(run(provider)).rejects.toBe(failure);

        expect(mockCreate).toHaveBeenCalledTimes(1);
    });
});

describe('OpenRouter provider continuity', () => {
    it('preserves quota status and retry headers without hidden SDK retries', async () => {
        const failure = Object.assign(new Error('Quota exhausted'), {
            status: 429,
            code: 'insufficient_quota',
            headers: { 'retry-after': '120' },
        });
        mockCreate.mockRejectedValue(failure);
        const provider = new OpenRouterProvider('test-key');

        await expect(provider.chatComplete(messages)).rejects.toBe(failure);

        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    });

    it('forwards cancellation and timeout and preserves the SDK abort error', async () => {
        const controller = new AbortController();
        const failure = Object.assign(new Error('Request canceled'), { name: 'AbortError' });
        mockCreate.mockImplementationOnce(async () => {
            controller.abort(failure);
            throw failure;
        });
        const provider = new OpenRouterProvider('test-key');

        await expect(provider.chatComplete(messages, undefined, undefined, { signal: controller.signal, timeoutMs: 900 }))
            .rejects.toBe(failure);

        expect(mockCreate.mock.calls[0][1]).toEqual({ signal: controller.signal, timeout: 900 });
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('does not start an already canceled request', async () => {
        const controller = new AbortController();
        const failure = new Error('Task stopped');
        controller.abort(failure);
        const provider = new OpenRouterProvider('test-key');

        await expect(provider.chatComplete(messages, undefined, undefined, { signal: controller.signal })).rejects.toBe(failure);

        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe('SDK retry ownership', () => {
    it.each([
        ['Cerebras', () => new CerebrasProvider('test-key')],
        ['Mistral', () => new MistralProvider('test-key')],
        ['HuggingFace', () => new HuggingFaceProvider('test-key')],
        ['LLM7', () => new LLM7Provider()],
        ['OpenAI', () => new OpenAIProvider('sk-test-key')],
        ['Pollinations', () => new PollinationsProvider()],
        ['DeepSeek', () => new DeepSeekProvider('test-key')],
    ])('leaves retry decisions to the router for %s', (_name, createProvider) => {
        createProvider();

        expect(mockOpenAI).toHaveBeenCalledTimes(1);
        expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    });
});

describe.each([
    ['Cerebras', () => new CerebrasProvider('test-key')],
    ['Mistral', () => new MistralProvider('test-key')],
    ['HuggingFace', () => new HuggingFaceProvider('test-key')],
])('%s failure evidence', (_name, createProvider) => {
    it('preserves quota status and retry headers after one request', async () => {
        const failure = Object.assign(new Error('rate limit exceeded'), { status: 429, headers: { 'retry-after': '120' } });
        mockCreate.mockRejectedValue(failure);

        await expect(createProvider().chatComplete(messages)).rejects.toBe(failure);

        expect(mockCreate).toHaveBeenCalledTimes(1);
    });
});
