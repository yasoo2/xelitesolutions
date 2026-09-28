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

    it('does not repeat a streamed request after a provider quota response', async () => {
        const quotaError = Object.assign(new Error('Retry after 2m'), { status: 429 });
        mockCreate.mockRejectedValue(quotaError);

        await expect(new LocalProvider().chatComplete(
            [{ role: 'user', content: 'hello' }],
            'qwen2.5-coder:7b',
            () => undefined,
        )).rejects.toBe(quotaError);

        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate.mock.calls[0][0]).toEqual(expect.objectContaining({ stream: true }));
    });

    it('falls back once when the endpoint explicitly rejects streaming', async () => {
        const unsupported = Object.assign(new Error('streaming is not supported'), { status: 400 });
        mockCreate.mockRejectedValueOnce(unsupported)
            .mockResolvedValueOnce({ choices: [{ message: { content: 'OK' } }] });

        await expect(new LocalProvider().chatComplete(
            [{ role: 'user', content: 'hello' }],
            'qwen2.5-coder:7b',
            () => undefined,
        )).resolves.toBe('OK');

        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(mockCreate.mock.calls[1][0]).not.toHaveProperty('stream');
    });

    it('does not replay a partially streamed answer after its connection fails', async () => {
        const connectionError = new Error('connection reset');
        mockCreate.mockResolvedValueOnce((async function* () {
            yield { choices: [{ delta: { content: 'partial' } }] };
            throw connectionError;
        })());
        const deltas: string[] = [];

        await expect(new LocalProvider().chatComplete(
            [{ role: 'user', content: 'hello' }],
            'qwen2.5-coder:7b',
            delta => { deltas.push(delta); },
        )).rejects.toBe(connectionError);

        expect(deltas).toEqual(['partial']);
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });
});
