/**
 * EVERY PROVIDER IN THE MENU CONNECTS FOR REAL, OR SAYS WHY NOT.
 *
 * The owner, 2026-11-02: «لازم تجربهن واحد واحد ان مشبوكات صح… في حال مستخدم
 * اجا يختار ديب سيك لازم يكون شغال، يختار اوبن اي اي يكون شغال». The audit
 * that day, against the running server and the real vendors:
 *
 *   - DeepSeek with no key turned GREEN in 626 ms. The answer came from
 *     Pollinations' 'openai' model (gpt-oss-20b); DeepSeek itself answers
 *     401 without a key.
 *   - Six vendors were marked «free» with the placeholder 'free-mode', and a
 *     placeholder made the choice Auto: the free mesh answered under their
 *     names. No vendor in the menu serves its models without a key (all
 *     answered 401/400/403), Grok included.
 *   - With the user's OWN key, 14 of 15 checks went red «free_only» before
 *     the key was tried: the cost policy meant for the server's keys refused
 *     his.
 *   - Most default models were retired at the vendor.
 *
 * Locked here: a vendor runs on the key the user typed (or the server's own
 * where policy allows), the check is that vendor's own answer, a refusal names
 * its reason, and the lists offer the vendors' current chat models.
 */
const mockCreate = jest.fn();
const mockOpenAI = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: mockOpenAI }));
jest.mock('../core/llm/providers/registry', () => {
    const provider = () => ({ isAvailable: jest.fn(() => true), isConfigured: jest.fn(() => true), chatComplete: jest.fn(async () => 'an answer from the free mesh') });
    return Object.fromEntries(['pollinationsProvider', 'openRouterProvider', 'groqProvider', 'localProvider',
        'geminiProvider', 'deepSeekProvider', 'openAIProvider', 'cerebrasProvider', 'mistralProvider',
        'huggingfaceProvider', 'llm7Provider', 'duckAIProvider'].map(name => [name, provider()]));
});
jest.mock('../core/llm/local-brain', () => ({ isLocalBrainReady: jest.fn(() => false), pickLocalModel: () => 'test-local', localWarmupMs: () => 0 }));
jest.mock('../modules/tools/definitions/LLMCacheTool', () => ({ LLMCacheTool: { checkCache: jest.fn(), saveToCache: jest.fn() } }));
jest.mock('../api/ws', () => ({ broadcast: jest.fn(), broadcastThinkingDetail: jest.fn() }));
const mockGemini = jest.fn();
const mockGeminiClass = jest.fn();
jest.mock('../core/llm/providers/gemini', () => ({
    GeminiProvider: function (this: any, key: string) { mockGeminiClass(key); this.chatComplete = (...args: any[]) => mockGemini(...args); },
    geminiProvider: { isAvailable: () => false, chatComplete: jest.fn() },
}));

import fs from 'fs';
import path from 'path';
import { routeToModel, verifyProviderDirect, customRouteCooldownUntil } from '../core/llm/intelligent-router';
import { resetProviderContinuityForTests } from '../core/llm/provider-continuity';
import { providerModels } from '../core/engine/provider-models';
import { engineModelChoiceFor } from '../core/engine/model';
import * as registry from '../core/llm/providers/registry';

const mesh = registry as any;
const VENDORS: Array<[string, string]> = [
    ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/'], ['groq', 'https://api.groq.com/openai/v1'],
    ['cerebras', 'https://api.cerebras.ai/v1'], ['openrouter', 'https://openrouter.ai/api/v1'], ['mistral', 'https://api.mistral.ai/v1'],
    ['deepseek', 'https://api.deepseek.com'], ['openai', 'https://api.openai.com/v1'], ['grok', 'https://api.x.ai/v1'],
];
const SERVER_KEYS = ['GROQ_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'CEREBRAS_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY',
    'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY', 'AI_COST_POLICY', 'AI_FREE_PROVIDERS', 'LLM_CACHE_DISABLE'];
const saved = Object.fromEntries(SERVER_KEYS.map(name => [name, process.env[name]]));
const meshAnswered = () => Object.values(mesh).some((p: any) => p?.chatComplete?.mock?.calls?.length);

beforeEach(() => {
    jest.clearAllMocks();
    resetProviderContinuityForTests();
    customRouteCooldownUntil.clear();
    for (const name of SERVER_KEYS) delete process.env[name];
    process.env.LLM_CACHE_DISABLE = '1';
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
    mockOpenAI.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
    mesh.geminiProvider.chatComplete.mockResolvedValue('OK');
    mockGemini.mockReset();
    mockGemini.mockResolvedValue('OK');
});
afterAll(() => {
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
});

describe('Connect: the light is that vendor\'s own answer', () => {
    it.each(VENDORS)('%s with no key is red «needs a key», and nothing else is asked', async (vendor) => {
        const result = await verifyProviderDirect(vendor, { apiKey: 'free-mode' });
        expect(result).toMatchObject({ ok: false, code: 'PROVIDER_NEEDS_KEY' });
        expect(mockCreate).not.toHaveBeenCalled();
        expect(meshAnswered()).toBe(false);
    });

    it('DeepSeek with no key is not green from another model any more', async () => {
        const result = await verifyProviderDirect('deepseek', {});
        expect(result.ok).toBe(false);
        expect(mesh.deepSeekProvider.chatComplete).not.toHaveBeenCalled();
        expect(mesh.pollinationsProvider.chatComplete).not.toHaveBeenCalled();
    });

    it.each(VENDORS.filter(([v]) => v !== 'gemini'))('%s with his own key is asked at its own address, under free_only', async (vendor, base) => {
        const result = await verifyProviderDirect(vendor, { apiKey: `test-${vendor}-typed`, model: 'his-model' });
        expect(result).toMatchObject({ ok: true, detail: 'key_ok' });
        expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: base, apiKey: `test-${vendor}-typed` }));
        expect(meshAnswered()).toBe(false);
    });

    it('Gemini with his own key is asked through Gemini', async () => {
        const result = await verifyProviderDirect('gemini', { apiKey: 'test-gemini-typed', model: 'gemini-3.8-flash' });
        expect(result).toMatchObject({ ok: true, detail: 'key_ok' });
        expect(mockGeminiClass).toHaveBeenCalledWith('test-gemini-typed');
        expect(mockGemini.mock.calls[0][1]).toBe('gemini-3.8-flash');
        expect(meshAnswered()).toBe(false);
    });

    it.each([
        [401, 'Incorrect API key provided: invalid-*****robe', 'PROVIDER_AUTH'],
        [400, 'invalid-argument: Incorrect API key provided', 'PROVIDER_AUTH'],
        [403, 'Not authenticated', 'PROVIDER_AUTH'],
        [402, 'Insufficient Balance', 'PROVIDER_BILLING'],
        [429, 'Rate limit reached for model', 'PROVIDER_QUOTA'],
        [404, 'The model `old` does not exist', 'PROVIDER_MODEL'],
        [503, 'Service Unavailable', 'PROVIDER_DOWN'],
    ])('a vendor answering %i is red with its reason (%s)', async (status, message, code) => {
        mockCreate.mockRejectedValue(Object.assign(new Error(`${status} ${message}`), { status }));
        const result = await verifyProviderDirect('openai', { apiKey: 'test-openai-typed', model: 'gpt-6-luna' });
        expect(result).toMatchObject({ ok: false, code });
        expect(JSON.stringify(result)).not.toContain('test-openai-typed');
        expect(meshAnswered()).toBe(false);
    });

    it('the check on every page load lists the models and spends nothing', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, json: async () => ({ data: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }] }) } as any);
        try {
            const result = await verifyProviderDirect('deepseek', { apiKey: 'test-deepseek-typed', model: 'deepseek-flash', light: true });
            expect(result).toMatchObject({ ok: true, detail: 'listed' });
            expect(mockCreate).not.toHaveBeenCalled();
            const missing = await verifyProviderDirect('deepseek', { apiKey: 'test-deepseek-typed', model: 'deepseek-chat', light: true });
            expect(missing).toMatchObject({ ok: false, code: 'PROVIDER_MODEL' });
            fetchSpy.mockResolvedValue({ ok: false, status: 400, json: async () => ({}) } as any);
            expect(await verifyProviderDirect('gemini', { apiKey: 'test-gemini-typed', light: true })).toMatchObject({ ok: false, code: 'PROVIDER_AUTH' });
        } finally { fetchSpy.mockRestore(); }
    });

    it("the server's own key is used where the operator's policy lets the server spend it, and only there", async () => {
        process.env.GROQ_API_KEY = 'test-server-groq';
        expect(await verifyProviderDirect('groq', {})).toMatchObject({ ok: false, code: 'PROVIDER_NEEDS_KEY' });
        process.env.AI_FREE_PROVIDERS = 'groq';
        expect(await verifyProviderDirect('groq', { model: 'openai/gpt-oss-120b' })).toMatchObject({ ok: true, detail: 'server_key_ok' });
        expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-server-groq' }));
    });
});

describe('a run: a named vendor is that vendor', () => {
    const ask = [{ role: 'user', content: 'hello' }];
    const route = (modelConfig: any) => routeToModel(ask, undefined, undefined, undefined, undefined, undefined, undefined, { modelConfig });

    it.each(VENDORS)('%s chosen with no key stops with «needs a key»; the mesh does not answer under its name', async (vendor) => {
        await expect(route({ provider: vendor, apiKey: 'free-mode' })).rejects.toMatchObject({ code: 'PROVIDER_NEEDS_KEY', provider: vendor });
        await expect(route({ provider: vendor, apiKey: '' })).rejects.toMatchObject({ code: 'PROVIDER_NEEDS_KEY' });
        expect(meshAnswered()).toBe(false);
    });

    it('Auto is the free mesh, and needs no key', async () => {
        await expect(route({ provider: 'auto', apiKey: 'auto-mode' })).resolves.toBe('an answer from the free mesh');
    });

    it('the engine names the same need', () => {
        expect(engineModelChoiceFor({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'free-mode' }, process.env))
            .toMatchObject({ error: expect.stringContaining('serves its models only with a key') });
        expect(engineModelChoiceFor({ provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-typed' }, process.env))
            .toMatchObject({ provider: 'deepseek', apiKey: 'test-typed' });
    });
});

describe('the lists offer the vendors\' current chat models', () => {
    const listed = (ids: string[]) => jest.fn(async () => ({ ok: true, json: async () => ({ data: ids.map(id => ({ id })) }) })) as any;

    it('speech, images and embeddings are not offered as chat models, and the recommended come first', async () => {
        const list = await providerModels({ provider: 'groq', apiKey: 'test-groq' }, {
            fetch: listed(['whisper-large-v3', 'playai-tts', 'meta-llama/llama-guard-4-12b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']),
        });
        expect(list).toMatchObject({ source: 'live', models: ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'] });
    });

    it('OpenRouter lists its models with no key (its list is public), free ones first, and says chat needs a key', async () => {
        const fetch = listed(['openai/gpt-6-luna', 'google/gemma-4-31b-it:free', 'z/other:free']);
        const list = await providerModels({ provider: 'openrouter' }, { fetch, env: {} });
        expect(list.source).toBe('live');
        expect(list.models.slice(0, 2)).toEqual(['google/gemma-4-31b-it:free', 'z/other:free']);
        expect(list.reason?.code).toBe('needs_key');
        expect(fetch.mock.calls[0][1].headers).toEqual({});
    });

    it('Gemini reads the server key under either of its names', async () => {
        const fetch = listed(['models/gemini-3.8-flash', 'models/text-embedding-005', 'models/imagen-4']);
        const list = await providerModels({ provider: 'gemini' }, { fetch, env: { GOOGLE_API_KEY: 'test-google' } as any });
        expect(list.models).toEqual(['gemini-3.8-flash']);
    });

    it('the suggestions and the menu name no model the vendors retired', () => {
        const retired = ['grok-beta', 'moonshotai/kimi-k2:free', 'gemini-2.0-flash', "'llama-3.3-70b'", "'deepseek-chat'"];
        const sources = [
            fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'provider-models.ts'), 'utf-8').split('const SUGGESTED')[1].split('};')[0],
            fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'CommandComposer.tsx'), 'utf-8').split('const DEFAULT_PROVIDERS')[1].split('};')[0],
        ].map(source => source.replace(/\/\/.*$/gm, ''));
        for (const source of sources) for (const id of retired) expect(source).not.toContain(id);
        expect(sources[1]).not.toContain("'free-mode'");
    });
});
