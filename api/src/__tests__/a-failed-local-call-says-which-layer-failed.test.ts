import { managedOllamaChat, serverErrorClass } from '../core/llm/providers/managed-ollama-chat';
import { RequestResourceManager, ResourceEvent } from '../core/resources/RequestResourceManager';

/**
 * Eval round 6, 2026-10-23: five compact plans failed at 311-414 s and every
 * trace said only RESOURCE_OPERATION_FAILED; Ollama logged a bare 500. The
 * cause could only be guessed (a 300 s transport cut was guessed — and
 * disproved). A failed local call now names the layer that failed and the
 * class of the server's reason, never the server's text.
 */
const GiB = 1024 ** 3;
const base = { baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M', messages: [{ role: 'user' as const, content: 'hi' }], timeoutMs: 5000 };

describe('a failed local call says which layer failed', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    it('the resource event carries the operation\'s own error code', async () => {
        const events: ResourceEvent[] = [];
        const manager = new RequestResourceManager({ sampleMemory: () => ({ totalBytes: 16 * GiB, freeBytes: 8 * GiB, availableBytes: 8 * GiB, rssBytes: 1 }), sampleResidentInference: async () => 0 });
        const fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'SECRET prompt text: model runner has unexpectedly stopped' }), { status: 500 }));
        await expect(manager.run({ requestId: 'r1', notify: (e: ResourceEvent) => events.push(e) } as any,
            () => managedOllamaChat(base, { fetch, resourceManager: manager }))).rejects.toMatchObject({ code: 'OLLAMA_HTTP_ERROR' });
        const failed = events.find(e => e.state === 'failed' && e.code === 'RESOURCE_OPERATION_FAILED');
        expect(failed?.details).toEqual({ cause: 'OLLAMA_HTTP_ERROR' });
        const logged = warn.mock.calls.map(c => c.join(' ')).join('\n');
        expect(logged).toContain('"status":500');
        expect(logged).toContain('"reason":"runner"');
        expect(logged).not.toContain('SECRET');
    });

    it('the server reason is reduced to a closed vocabulary', () => {
        expect(serverErrorClass('')).toBe('empty');
        expect(serverErrorClass('{"error":"model requires more system memory (9.1 GiB) than is available"}')).toBe('memory');
        expect(serverErrorClass('{"error":"input length exceeds the context length"}')).toBe('context');
        expect(serverErrorClass('{"error":"context canceled"}')).toBe('cancelled');
        expect(serverErrorClass('{"error":"timed out waiting for llama runner to start"}')).toBe('timeout');
        expect(serverErrorClass('{"error":"llama-server process has terminated: exit status 2"}')).toBe('runner');
        expect(serverErrorClass('{"error":"api_key=XYZ something odd"}')).toBe('unclassified');
    });
});
