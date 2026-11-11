import { verifyProviderDirect } from '../core/llm/intelligent-router';
import { requestResourceManager } from '../core/resources/RequestResourceManager';

/**
 * Owner, 2026-10-23: the Local provider's dot went red while the model was
 * answering every build. The verify probe is a real generation and local
 * inference is one lane, so during a 40-minute plan the probe waited behind it
 * and timed out. While the lane is busy, the honest check is the server's own
 * word: reachable, and this exact model installed.
 */
const base = { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M' };

describe('a busy local model is not a dead one', () => {
    const originalFetch = global.fetch;
    let status: jest.SpyInstance;
    beforeEach(() => {
        status = jest.spyOn(requestResourceManager, 'status').mockReturnValue({
            activeRequests: 1, heavy: { active: 1, queued: 0 }, inference: { active: 1, queued: 0 },
        } as any);
    });
    afterEach(() => { status.mockRestore(); (global as any).fetch = originalFetch; });

    const tags = (names: string[]) => {
        (global as any).fetch = jest.fn(async (url: string) => {
            expect(String(url)).toBe('http://127.0.0.1:11434/api/tags');
            return new Response(JSON.stringify({ models: names.map(name => ({ name })) }));
        });
    };

    it('busy and installed: connected, without queueing a generation behind the busy lane', async () => {
        tags(['qwen3.5:9b-joe-q4_K_M', 'qwen2.5-coder:7b']);
        const result = await verifyProviderDirect('local', base);
        expect(result).toMatchObject({ ok: true });
        expect(result.detail).toMatch(/^local_ok_busy/);
        expect((global as any).fetch).toHaveBeenCalledTimes(1);
    });

    it('busy and not installed: says which model is missing', async () => {
        tags(['qwen2.5-coder:7b']);
        const result = await verifyProviderDirect('local', { ...base, model: 'qwen2.5:1.5b' });
        expect(result.ok).toBe(false);
        expect(result.detail).toBe('local_model_not_installed: qwen2.5:1.5b');
    });
});
