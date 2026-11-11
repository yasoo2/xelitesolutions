import { verifyProviderDirect } from '../core/llm/intelligent-router';
import { localProvider } from '../core/llm/providers/registry';

/**
 * 2026-11-06: the test Joe died three times with no word in its log, the last
 * one recorded by its supervisor as 0xC0000409 (a native abort), each time
 * just after Ollama's llama-server crashed out of memory on this 16 GB laptop.
 * The runs were on Claude. What loaded the local model was Joe's own page: on
 * every load it checks its provider (Auto) with `light: true`, and for Auto and
 * for a named local model that check was a real generation — 22 page loads
 * and 54 checks in one morning, each loading a 7B model next to the build.
 * The check a page load makes must spend nothing: the server's own list of
 * installed models, as the light Claude check reads Anthropic's model list.
 * Connect still makes the one real call. An abandoned check (the page closed)
 * stops instead of waiting up to 90 s for the model.
 */
const BASE = 'http://127.0.0.1:11434/v1';
const MODEL = 'qwen2.5-coder:7b';

describe('a page load never loads the local model', () => {
    const originalFetch = global.fetch;
    const env = { ...process.env };
    let chat: jest.SpyInstance;
    let urls: string[];

    beforeEach(() => {
        process.env.LOCAL_LLM_BASE_URL = BASE;
        process.env.LOCAL_LLM_MODEL = MODEL;
        process.env.LOCAL_LLM_STRICT = '1';
        process.env.AI_COST_POLICY = 'free_only';
        process.env.OFFLINE_MODE = 'true';
        urls = [];
        chat = jest.spyOn(localProvider, 'chatComplete').mockImplementation(async () => {
            throw new Error('the local model was asked to generate');
        });
    });
    afterEach(() => {
        chat.mockRestore();
        (global as any).fetch = originalFetch;
        process.env = { ...env };
    });

    const tags = (names: string[] | null) => {
        (global as any).fetch = jest.fn(async (url: string) => {
            urls.push(String(url));
            if (names === null) throw new Error('connect ECONNREFUSED 127.0.0.1:11434');
            if (String(url).endsWith('/api/tags')) return new Response(JSON.stringify({ models: names.map(name => ({ name })) }));
            throw new Error(`unexpected request ${url}`);
        });
    };

    it('Auto, light (every page load): the installed model is enough, and nothing generates', async () => {
        tags([MODEL, 'qwen3.5:9b-joe-q4_K_M']);
        const result = await verifyProviderDirect('auto', { apiKey: 'auto-mode', light: true });
        expect(result).toMatchObject({ ok: true, detail: 'local_listed' });
        expect(chat).not.toHaveBeenCalled();
        expect(urls).toEqual(['http://127.0.0.1:11434/api/tags']);
    });

    it('Auto, light, the model is not installed: red, and says which model', async () => {
        tags(['qwen3.5:9b-joe-q4_K_M']);
        const result = await verifyProviderDirect('auto', { apiKey: 'auto-mode', light: true });
        expect(result.ok).toBe(false);
        expect(result.detail).toBe(`local_model_not_installed: ${MODEL}`);
        expect(chat).not.toHaveBeenCalled();
    });

    it('Auto, light, Ollama not answering: red, without a generation', async () => {
        tags(null);
        const result = await verifyProviderDirect('auto', { apiKey: 'auto-mode', light: true });
        expect(result.ok).toBe(false);
        expect(result.detail).toMatch(/^local_unreachable/);
        expect(chat).not.toHaveBeenCalled();
    });

    it('a named local model, light: the list answers, nothing generates', async () => {
        tags([MODEL]);
        const result = await verifyProviderDirect('local', { baseUrl: BASE, model: MODEL, light: true });
        expect(result).toMatchObject({ ok: true, detail: 'local_listed' });
        expect(urls).toEqual(['http://127.0.0.1:11434/api/tags']);
    });

    it('Connect (not light) still makes the one real call', async () => {
        tags([MODEL]);
        chat.mockImplementation(async () => 'OK' as any);
        const result = await verifyProviderDirect('auto', { apiKey: 'auto-mode' });
        expect(chat).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ ok: true, detail: 'local_ok' });
    });

    it('a check whose page went away stops, instead of waiting for the model', async () => {
        tags([MODEL]);
        let seen: AbortSignal | undefined;
        chat.mockImplementation((_m: any, _model: any, _d: any, signal?: AbortSignal) => new Promise((_, reject) => {
            seen = signal;
            signal?.addEventListener('abort', () => reject(new Error('aborted: the client went away')));
        }) as any);
        const gone = new AbortController();
        const started = Date.now();
        setTimeout(() => gone.abort(), 50);
        const result = await verifyProviderDirect('auto', { apiKey: 'auto-mode', signal: gone.signal } as any);
        expect(result.ok).toBe(false);
        expect(seen?.aborted).toBe(true);
        expect(Date.now() - started).toBeLessThan(3000);
    });
});

describe('the boot warm-up can be turned off', () => {
    const originalFetch = global.fetch;
    const env = { ...process.env };
    afterEach(() => { (global as any).fetch = originalFetch; process.env = { ...env }; });

    async function bootWith(value: string | undefined): Promise<{ urls: string[]; summary: string }> {
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1';
        if (value === undefined) delete process.env.JOE_LOCAL_WARMUP; else process.env.JOE_LOCAL_WARMUP = value;
        const urls: string[] = [];
        (global as any).fetch = jest.fn(async (url: string) => {
            urls.push(String(url));
            if (String(url).endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }] }));
            if (String(url).endsWith('/api/generate')) return new Response(JSON.stringify({ response: 'h' }));
            return new Response(JSON.stringify({}));
        });
        let summary = '';
        await jest.isolateModulesAsync(async () => {
            const brain = require('../core/llm/local-brain');
            summary = await brain.initLocalBrain();
            await new Promise(r => setTimeout(r, 300));
        });
        return { urls, summary };
    }

    it('JOE_LOCAL_WARMUP=0: no generation at boot, and the log says so', async () => {
        const { urls, summary } = await bootWith('0');
        expect(urls.some(u => u.endsWith('/api/generate'))).toBe(false);
        expect(summary).toMatch(/Boot warm-up off/);
    });

    it('unset: the warm-up still runs (the GPU server keeps its fast first answer)', async () => {
        const { urls, summary } = await bootWith(undefined);
        expect(urls.some(u => u.endsWith('/api/generate'))).toBe(true);
        expect(summary).toMatch(/Warming up in background/);
    });
});
