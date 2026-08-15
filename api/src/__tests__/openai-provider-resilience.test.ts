const mockCreate = jest.fn();
const mockOpenAI = jest.fn();
const mockListModels = jest.fn();

jest.mock('openai', () => ({
    __esModule: true,
    default: mockOpenAI,
}));

jest.mock('../shared/startup-notes', () => ({
    noteMissingKey: jest.fn(),
}));

import { OpenAIProvider } from '../core/llm/providers/openai';

describe('OpenAIProvider resilience', () => {
    const originalBase = process.env.OPENAI_API_BASE;
    const originalModel = process.env.OPENAI_MODEL;

    beforeEach(() => {
        mockCreate.mockReset();
        mockListModels.mockReset();
        mockListModels.mockResolvedValue({ data: [] });
        mockOpenAI.mockReset();
        mockOpenAI.mockImplementation(() => ({
            chat: { completions: { create: mockCreate } },
            models: { list: mockListModels },
        }));
    });

    afterEach(() => {
        if (originalBase === undefined) delete process.env.OPENAI_API_BASE;
        else process.env.OPENAI_API_BASE = originalBase;
        if (originalModel === undefined) delete process.env.OPENAI_MODEL;
        else process.env.OPENAI_MODEL = originalModel;
    });

    it('uses an explicitly configured compatible API base', () => {
        process.env.OPENAI_API_BASE = 'http://127.0.0.1:11434/v1';
        new OpenAIProvider('sk-local-test');

        expect(mockOpenAI).toHaveBeenCalledWith({
            apiKey: 'sk-local-test',
            baseURL: 'http://127.0.0.1:11434/v1',
        });
    });

    it('accepts a non-standard credential only through an explicitly configured compatible API base', () => {
        process.env.OPENAI_API_BASE = 'https://managed.example.test/v1';
        const provider = new OpenAIProvider('managed-gateway-token');

        expect(provider.isAvailable()).toBe(true);
        expect(mockOpenAI).toHaveBeenCalledWith({
            apiKey: 'managed-gateway-token',
            baseURL: 'https://managed.example.test/v1',
        });
    });

    it('rejects a non-standard credential without an explicitly configured compatible API base', () => {
        delete process.env.OPENAI_API_BASE;
        const provider = new OpenAIProvider('managed-gateway-token');

        expect(provider.isAvailable()).toBe(false);
        expect(mockOpenAI).not.toHaveBeenCalled();
    });

    it('discovers a supported compatible-gateway model once when the historic default is absent', async () => {
        process.env.OPENAI_API_BASE = 'https://managed.example.test/v1';
        mockListModels.mockResolvedValue({ data: [{ id: 'gpt-5-mini' }, { id: 'gpt-5' }] });
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
        const provider = new OpenAIProvider('managed-gateway-token');

        await expect(provider.chatComplete([{ role: 'user', content: 'hello' }], 'gpt-4o')).resolves.toBe('OK');
        await expect(provider.chatComplete([{ role: 'user', content: 'again' }], 'gpt-4o')).resolves.toBe('OK');

        expect(mockListModels).toHaveBeenCalledTimes(1);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5-mini' }));
    });

    it('honours the explicit operator model instead of listing a compatible gateway catalogue', async () => {
        process.env.OPENAI_API_BASE = 'https://managed.example.test/v1';
        process.env.OPENAI_MODEL = 'claude-haiku-4-5';
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
        const provider = new OpenAIProvider('managed-gateway-token');

        await expect(provider.chatComplete([{ role: 'user', content: 'hello' }], 'gpt-4o')).resolves.toBe('OK');
        expect(mockListModels).not.toHaveBeenCalled();
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-haiku-4-5' }));
    });

    it('surfaces a compatible gateway error body instead of mislabelling it as missing choices', async () => {
        process.env.OPENAI_API_BASE = 'https://managed.example.test/v1';
        mockCreate.mockResolvedValue({ error: { message: 'Unsupported model' } });
        const provider = new OpenAIProvider('managed-gateway-token');

        await expect(provider.chatComplete([{ role: 'user', content: 'hello' }]))
            .rejects.toThrow('OpenAI compatible gateway error: Unsupported model');
    });

    it('rejects an empty completion with a diagnostic error instead of dereferencing choices[0]', async () => {
        mockCreate.mockResolvedValue({});
        const provider = new OpenAIProvider('sk-local-test');

        await expect(provider.chatComplete([{ role: 'user', content: 'hello' }]))
            .rejects.toThrow('OpenAI returned no assistant message (missing choices)');
    });

    it('omits timeout when no bounded deadline is requested', async () => {
        process.env.OPENAI_API_BASE = 'https://managed.example.test/v1';
        process.env.OPENAI_MODEL = 'gpt-5-mini';
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
        const provider = new OpenAIProvider('managed-gateway-token');

        await expect(provider.chatComplete([{ role: 'user', content: 'hello' }])).resolves.toBe('OK');

        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5-mini' }));
        expect(mockCreate.mock.calls[0]).toHaveLength(1);
    });

    it('propagates the same abort signal and bounded timeout to discovery and completion', async () => {
        process.env.OPENAI_API_BASE = 'https://managed.example.test/v1';
        mockListModels.mockResolvedValue({ data: [{ id: 'gpt-5-mini' }] });
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
        const provider = new OpenAIProvider('managed-gateway-token');
        const controller = new AbortController();

        await expect(provider.chatComplete(
            [{ role: 'user', content: 'hello' }],
            'gpt-4o',
            undefined,
            { signal: controller.signal, timeoutMs: 1234 },
        )).resolves.toBe('OK');

        expect(mockListModels).toHaveBeenCalledWith({ signal: controller.signal, timeout: 1234 });
        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'gpt-5-mini' }),
            { signal: controller.signal, timeout: 1234 },
        );
    });
});
