const mockCreate = jest.fn();
const mockOpenAI = jest.fn();

jest.mock('openai', () => ({
    __esModule: true,
    default: mockOpenAI,
}));

import { LocalProvider } from '../core/llm/providers/local';

describe('LocalProvider cancellation', () => {
    const originalBase = process.env.LOCAL_LLM_BASE_URL;
    const originalTimeout = process.env.LOCAL_LLM_TIMEOUT;

    beforeEach(() => {
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434';
        process.env.LOCAL_LLM_TIMEOUT = '1234';
        mockCreate.mockReset();
        mockOpenAI.mockReset();
        mockOpenAI.mockImplementation(() => ({
            chat: { completions: { create: mockCreate } },
        }));
    });

    afterEach(() => {
        if (originalBase === undefined) delete process.env.LOCAL_LLM_BASE_URL;
        else process.env.LOCAL_LLM_BASE_URL = originalBase;
        if (originalTimeout === undefined) delete process.env.LOCAL_LLM_TIMEOUT;
        else process.env.LOCAL_LLM_TIMEOUT = originalTimeout;
    });

    it('passes the router abort signal to a blocking Ollama request', async () => {
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
        const signal = new AbortController().signal;

        await expect(new LocalProvider().chatComplete(
            [{ role: 'user', content: 'hello' }],
            'qwen2.5-coder:7b',
            undefined,
            signal,
        )).resolves.toBe('OK');

        expect(mockCreate).toHaveBeenCalledWith(
            expect.objectContaining({ model: 'qwen2.5-coder:7b' }),
            { timeout: 1234, signal },
        );
    });

    it('does not issue a second blocking request after a streamed call is aborted', async () => {
        const controller = new AbortController();
        const abortError = new Error('aborted');
        mockCreate.mockImplementation(async (request: any) => {
            if (request.stream) {
                controller.abort();
                throw abortError;
            }
            return { choices: [{ message: { content: 'SHOULD NOT HAPPEN' } }] };
        });

        await expect(new LocalProvider().chatComplete(
            [{ role: 'user', content: 'hello' }],
            'qwen2.5-coder:7b',
            () => undefined,
            controller.signal,
        )).rejects.toBe(abortError);

        expect(mockCreate).toHaveBeenCalledTimes(1);
    });
});
