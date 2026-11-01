/**
 * EVERY PROVIDER OFFERS ITS MODELS TO CHOOSE FROM.
 *
 * Measured on 2026-11-01: the provider panel had one free-text «Model ID»,
 * and Claude's held claude-3-opus-20240229, retired long ago. The owner's
 * rule: each provider offers a list and the user picks the model.
 *
 * The list comes from the provider whenever it can be asked; the key stays
 * on the server; without a key or a network the answer says the list is
 * only suggestions.
 */
import { providerModels } from '../core/engine/provider-models';

function fakeFetch(routes: Record<string, { status?: number; body?: any; throws?: Error }>) {
    const seen: Array<{ url: string; auth?: string }> = [];
    const fn: any = async (url: string, init: any = {}) => {
        seen.push({ url, auth: init?.headers?.Authorization });
        const r = routes[url];
        if (!r) throw new Error(`unexpected ${url}`);
        if (r.throws) throw r.throws;
        return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body };
    };
    return { fn, seen };
}

describe('the models each provider offers', () => {
    it('Claude without a key offers the models Joe runs, and says the account\'s list needs the key', async () => {
        expect(await providerModels({ provider: 'anthropic' }, { env: {} })).toMatchObject({
            models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'], source: 'catalog', reason: { code: 'needs_key' },
        });
    });

    it('Local offers the models installed in the local model server', async () => {
        const { fn } = fakeFetch({ 'http://127.0.0.1:11434/api/tags': { body: { models: [{ name: 'qwen3.5:9b' }, { name: 'qwen2.5-coder:7b' }] } } });
        expect(await providerModels({ provider: 'local' }, { fetch: fn })).toEqual({ models: ['qwen3.5:9b', 'qwen2.5-coder:7b'], source: 'live' });
    });

    it('a provider with a key is asked for its own list, and the key stays on the server', async () => {
        const { fn, seen } = fakeFetch({ 'https://api.groq.com/openai/v1/models': { body: { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'gemma2-9b-it' }] } } });
        const out = await providerModels({ provider: 'groq', apiKey: 'gsk_typed_by_user' }, { fetch: fn, env: {} });
        expect(out).toEqual({ models: ['gemma2-9b-it', 'llama-3.3-70b-versatile'], source: 'live' });
        expect(seen[0].auth).toBe('Bearer gsk_typed_by_user');
        expect(JSON.stringify(out)).not.toMatch(/gsk_typed_by_user/);
    });

    it('the server\'s own key is used when the user typed none', async () => {
        const { fn, seen } = fakeFetch({ 'https://generativelanguage.googleapis.com/v1beta/openai/models': { body: { data: [{ id: 'models/gemini-2.5-flash' }] } } });
        const out = await providerModels({ provider: 'gemini', apiKey: 'free-mode' }, { fetch: fn, env: { GEMINI_API_KEY: 'AIza-server' } as any });
        expect(out).toEqual({ models: ['gemini-2.5-flash'], source: 'live' });
        expect(seen[0].auth).toBe('Bearer AIza-server');
    });

    it('without any key the list is only suggestions, and it says so', async () => {
        const out = await providerModels({ provider: 'groq', apiKey: 'free-mode' }, { fetch: fakeFetch({}).fn, env: {} });
        expect(out.source).toBe('catalog');
        expect(out.models).toContain('llama-3.3-70b-versatile');
        expect(out.note).toMatch(/needs its key/);
    });

    it('a refusal or a network failure falls back to suggestions, saying why', async () => {
        const refused = fakeFetch({ 'https://api.openai.com/v1/models': { status: 401, body: {} } });
        expect(await providerModels({ provider: 'openai', apiKey: 'sk-wrong' }, { fetch: refused.fn, env: {} })).toMatchObject({ source: 'catalog', note: expect.stringMatching(/refused the list \(401\)/) });
        const down = fakeFetch({ 'https://api.mistral.ai/v1/models': { throws: Object.assign(new Error('timeout'), { name: 'TimeoutError' }) } });
        expect(await providerModels({ provider: 'mistral', apiKey: 'k-real' }, { fetch: down.fn, env: {} })).toMatchObject({ source: 'catalog', note: expect.stringMatching(/could not be reached \(TimeoutError\)/) });
    });
});
