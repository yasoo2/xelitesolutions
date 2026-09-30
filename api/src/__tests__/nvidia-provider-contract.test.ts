/**
 * Contract for the standalone NVIDIA NIM provider transport.
 *
 * This module is the transport seam (OpenAI-compatible chat completions over
 * fetch with AbortSignal, retry-after evidence and a tool_calls envelope). It
 * is intentionally NOT wired into provider selection here: selection/router
 * policy is owned elsewhere (Codex c8524f01 on the codex branches covers the
 * selection side). These tests pin the transport contract with a mocked
 * fetch so the preserved module cannot rot silently. No network is used.
 */
import {
    NVIDIA_NIM_BASE_URL,
    NVIDIA_NEMOTRON_DEFAULT_MODEL,
    NvidiaProvider,
} from '../core/llm/providers/nvidia';

const realFetch = global.fetch;

function mockResponse(o: {
    ok: boolean;
    status?: number;
    retryAfter?: string | null;
    body?: any;
}) {
    return {
        ok: o.ok,
        status: o.status ?? (o.ok ? 200 : 500),
        headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? (o.retryAfter ?? null) : null) },
        json: async () => o.body ?? {},
    };
}

describe('nvidia NIM provider transport', () => {
    const OLD_KEY = process.env.NVIDIA_API_KEY;

    beforeEach(() => {
        global.fetch = jest.fn() as any;
        delete process.env.NVIDIA_API_KEY;
    });

    afterEach(() => {
        global.fetch = realFetch;
        if (OLD_KEY === undefined) delete process.env.NVIDIA_API_KEY;
        else process.env.NVIDIA_API_KEY = OLD_KEY;
    });

    test('is unavailable without a key and refuses placeholder keys', () => {
        expect(new NvidiaProvider().isAvailable()).toBe(false);
        expect(new NvidiaProvider('dummy').isAvailable()).toBe(false);
        expect(new NvidiaProvider('  ').isAvailable()).toBe(false);
        expect(new NvidiaProvider('nv-test').isAvailable()).toBe(true);
    });

    test('refuses to call without a key and never touches fetch', async () => {
        await expect(new NvidiaProvider().chatComplete([{ role: 'user', content: 'hi' }]))
            .rejects.toThrow('NVIDIA_API_KEY not configured');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('posts an OpenAI-compatible body with bearer auth and default model', async () => {
        (global.fetch as any).mockResolvedValue(mockResponse({
            ok: true, body: { choices: [{ message: { content: 'hello' } }] },
        }));
        const answer = await new NvidiaProvider('nv-test').chatComplete([{ role: 'user', content: 'hi' }]);
        expect(answer).toBe('hello');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = (global.fetch as any).mock.calls[0];
        expect(url).toBe(NVIDIA_NIM_BASE_URL);
        expect(init.method).toBe('POST');
        expect(init.headers.Authorization).toBe('Bearer nv-test');
        const body = JSON.parse(init.body);
        expect(body.model).toBe(NVIDIA_NEMOTRON_DEFAULT_MODEL);
        expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
        expect(body.max_tokens).toBe(4096);
        expect(body.tool_choice).toBeUndefined();
    });

    test('maps tools to function tools with auto choice', async () => {
        (global.fetch as any).mockResolvedValue(mockResponse({
            ok: true, body: { choices: [{ message: { content: '' } }] },
        }));
        await new NvidiaProvider('nv-test').chatComplete(
            [{ role: 'user', content: 'hi' }],
            'custom-model',
            [{ name: 'read_file', description: 'read', inputSchema: { type: 'object', properties: {} } }],
        );
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(body.model).toBe('custom-model');
        expect(body.tool_choice).toBe('auto');
        expect(body.tools).toEqual([{
            type: 'function',
            function: { name: 'read_file', description: 'read', parameters: { type: 'object', properties: {} } },
        }]);
    });

    test('returns the tool_calls envelope when the model calls tools', async () => {
        const toolCalls = [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{}' } }];
        (global.fetch as any).mockResolvedValue(mockResponse({
            ok: true, body: { choices: [{ message: { content: '', tool_calls: toolCalls } }] },
        }));
        const answer = await new NvidiaProvider('nv-test').chatComplete([{ role: 'user', content: 'hi' }]);
        expect(JSON.parse(answer)).toEqual({ type: 'tool_calls', tool_calls: toolCalls });
    });

    test('returns an empty string when the model answers nothing', async () => {
        (global.fetch as any).mockResolvedValue(mockResponse({ ok: true, body: { choices: [{}] } }));
        await expect(new NvidiaProvider('nv-test').chatComplete([{ role: 'user', content: 'hi' }])).resolves.toBe('');
    });

    test('keeps status plus retry-after evidence on provider errors', async () => {
        (global.fetch as any).mockResolvedValue(mockResponse({ ok: false, status: 429, retryAfter: '120' }));
        await expect(new NvidiaProvider('nv-test').chatComplete([{ role: 'user', content: 'hi' }]))
            .rejects.toThrow('NVIDIA NIM API Error (429); retry-after: 120 seconds');
    });

    test('parses HTTP-date retry-after headers into seconds', async () => {
        const future = new Date(Date.now() + 65_000).toUTCString();
        (global.fetch as any).mockResolvedValue(mockResponse({ ok: false, status: 503, retryAfter: future }));
        await expect(new NvidiaProvider('nv-test').chatComplete([{ role: 'user', content: 'hi' }]))
            .rejects.toThrow(/^NVIDIA NIM API Error \(503\); retry-after: \d+ seconds$/);
    });

    test('omits the retry note when the header is absent or unparsable', async () => {
        (global.fetch as any).mockResolvedValue(mockResponse({ ok: false, status: 500, retryAfter: null }));
        await expect(new NvidiaProvider('nv-test').chatComplete([{ role: 'user', content: 'hi' }]))
            .rejects.toThrow('NVIDIA NIM API Error (500)');
        (global.fetch as any).mockResolvedValue(mockResponse({ ok: false, status: 500, retryAfter: 'soon' }));
        await expect(new NvidiaProvider('nv-test').chatComplete([{ role: 'user', content: 'hi' }]))
            .rejects.toThrow('NVIDIA NIM API Error (500)');
    });

    test('threads the abort signal through to fetch', async () => {
        (global.fetch as any).mockResolvedValue(mockResponse({
            ok: true, body: { choices: [{ message: { content: 'ok' } }] },
        }));
        const controller = new AbortController();
        await new NvidiaProvider('nv-test').chatComplete(
            [{ role: 'user', content: 'hi' }], undefined, undefined, controller.signal,
        );
        expect((global.fetch as any).mock.calls[0][1].signal).toBe(controller.signal);
    });

    test('health check passes on any non-empty answer', async () => {
        (global.fetch as any).mockResolvedValue(mockResponse({
            ok: true, body: { choices: [{ message: { content: 'OK' } }] },
        }));
        await expect(new NvidiaProvider('nv-test').healthCheck()).resolves.toBe(true);
        const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
        expect(body.max_tokens).toBe(8);
    });
});
