const mockCreate = jest.fn();
const mockOpenAI = jest.fn();

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

    beforeEach(() => {
        mockCreate.mockReset();
        mockOpenAI.mockReset();
        mockOpenAI.mockImplementation(() => ({
            chat: { completions: { create: mockCreate } },
        }));
    });

    afterEach(() => {
        if (originalBase === undefined) delete process.env.OPENAI_API_BASE;
        else process.env.OPENAI_API_BASE = originalBase;
    });

    it('uses an explicitly configured compatible API base', () => {
        process.env.OPENAI_API_BASE = 'http://127.0.0.1:11434/v1';
        new OpenAIProvider('sk-local-test');

        expect(mockOpenAI).toHaveBeenCalledWith({
            apiKey: 'sk-local-test',
            baseURL: 'http://127.0.0.1:11434/v1',
        });
    });

    it('rejects an empty completion with a diagnostic error instead of dereferencing choices[0]', async () => {
        mockCreate.mockResolvedValue({});
        const provider = new OpenAIProvider('sk-local-test');

        await expect(provider.chatComplete([{ role: 'user', content: 'hello' }]))
            .rejects.toThrow('OpenAI returned no assistant message (missing choices)');
    });
});
