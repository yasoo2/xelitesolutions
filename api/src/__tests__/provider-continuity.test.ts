const mockCreate = jest.fn();
const mockOpenAI = jest.fn();
jest.mock('openai', () => ({ __esModule: true, default: mockOpenAI }));
jest.mock('../core/llm/providers/registry', () => {
    const provider = () => ({ isAvailable: jest.fn(() => false), isConfigured: jest.fn(() => false), chatComplete: jest.fn() });
    return Object.fromEntries(['pollinationsProvider', 'openRouterProvider', 'groqProvider', 'localProvider',
        'geminiProvider', 'deepSeekProvider', 'openAIProvider', 'cerebrasProvider', 'mistralProvider',
        'huggingfaceProvider', 'llm7Provider', 'duckAIProvider'].map(name => [name, provider()]));
});
jest.mock('../core/llm/local-brain', () => ({ isLocalBrainReady: jest.fn(() => false), pickLocalModel: () => 'test-local', localWarmupMs: () => 0 }));
jest.mock('../modules/tools/definitions/LLMCacheTool', () => ({ LLMCacheTool: { checkCache: jest.fn(), saveToCache: jest.fn() } }));
import { routeToModel, verifyProviderDirect, customRouteCooldownUntil, markProviderOk } from '../core/llm/intelligent-router';
import * as providers from '../core/llm/providers/registry';
import * as localBrain from '../core/llm/local-brain';
import {
    aiCostPolicy, claimProviderCircuit, markProviderCircuitHealthy, providerAllowedByCost,
    providerCircuitKey, providerCircuitStatus, providerRetryAfterMs, recordProviderCircuitFailure,
    releaseProviderCircuitProbe, resetProviderContinuityForTests,
} from '../core/llm/provider-continuity';

const registry = providers as any;
const envNames = ['AI_COST_POLICY', 'AI_FREE_PROVIDERS', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'LLM_CACHE_DISABLE',
    'OFFLINE_MODE', 'LOCAL_LLM_DISABLE', 'MOCK_LLM', 'LLM7_DISABLE', 'LLM7_API_KEY', 'LLM7_BASE_URL', 'LLM_PROVIDER', 'LOCAL_LLM_BASE_URL', 'DEEPSEEK_API_KEY'];
const savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;
const messages = [{ role: 'system', content: 'Preserve the accepted plan.' }, { role: 'user', content: 'Continue the same project.' }];
const tools = [{ name: 'read_file', inputSchema: { type: 'object', properties: {} } }];
const route = (context: any = {}) => routeToModel(messages, undefined, undefined, undefined, undefined, undefined, tools,
    { modelConfig: { provider: 'auto' }, runId: 'continuity-test', ...context });

beforeEach(() => {
    jest.clearAllMocks();
    (localBrain.isLocalBrainReady as jest.Mock).mockReturnValue(false);
    resetProviderContinuityForTests();
    customRouteCooldownUntil.clear();
    for (const name of envNames) delete process.env[name];
    process.env.AI_FREE_PROVIDERS = 'groq,cerebras';
    process.env.LLM_CACHE_DISABLE = '1';
    process.env.LOCAL_LLM_DISABLE = '1';
    for (const provider of Object.values(registry) as any[]) {
        if (!provider?.isAvailable) continue;
        provider.isAvailable.mockReturnValue(false);
        provider.isConfigured.mockReturnValue(false);
        provider.chatComplete.mockReset();
    }
    for (const name of ['Groq (Free)', 'LLM7 (Keyless)', 'Cerebras (Free)', 'OpenAI (Direct)', 'DeepSeek (Pollinations)', 'Pollinations (Backup)']) markProviderOk(name);
    registry.llm7Provider.isAvailable.mockReturnValue(true);
    registry.llm7Provider.chatComplete.mockResolvedValue('Continued the same accepted plan.');
    registry.openAIProvider.isAvailable.mockReturnValue(true);
    mockCreate.mockReset();
    mockOpenAI.mockImplementation(() => ({ chat: { completions: { create: mockCreate } } }));
    global.fetch = jest.fn().mockRejectedValue(new Error('Unexpected network access')) as any;
});
afterAll(() => {
    for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    global.fetch = originalFetch;
    resetProviderContinuityForTests();
});

describe('free-only provider continuity through routeToModel', () => {
    it('recovers an authenticated custom route with only one probe after its auth cooldown', async () => {
        let now = Date.now();
        const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
        try {
            const context = { workspaceId: 'auth-recovery', modelConfig: { provider: 'groq', apiKey: 'test-auth-recovery-key' } };
            mockCreate.mockRejectedValueOnce(Object.assign(new Error('401 invalid api key'), { status: 401 }));
            await route(context);
            await route(context);
            expect(mockCreate).toHaveBeenCalledTimes(1);
            now += 5 * 60_000 + 1;
            let resolveProbe!: (value: any) => void;
            mockCreate.mockImplementationOnce(() => new Promise(resolve => { resolveProbe = resolve; }));
            const pendingProbe = route(context);
            await expect(route(context)).resolves.toBe('Continued the same accepted plan.');
            expect(mockCreate).toHaveBeenCalledTimes(2);
            resolveProbe({ choices: [{ message: { content: 'Provider recovered.' } }] });
            await expect(pendingProbe).resolves.toBe('Provider recovered.');
        } finally { clock.mockRestore(); }
    });

    it('reaches a free fallback after the Auto local preflight times out', async () => {
        jest.useFakeTimers();
        try {
            process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1';
            (localBrain.isLocalBrainReady as jest.Mock).mockReturnValue(true);
            registry.localProvider.isConfigured.mockReturnValue(true);
            registry.localProvider.chatComplete.mockImplementationOnce((_messages: any, _model: any, _partial: any, signal: AbortSignal) =>
                new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('local timeout')), { once: true })));
            registry.llm7Provider.chatComplete.mockResolvedValue('OK');
            const pending = verifyProviderDirect('auto');
            await jest.advanceTimersByTimeAsync(30_001);
            expect(await pending).toMatchObject({ ok: true, detail: 'mesh_ok' });
            expect(registry.llm7Provider.chatComplete).toHaveBeenCalledTimes(1);
            expect(registry.llm7Provider.chatComplete.mock.calls[0][3].signal.aborted).toBe(false);
        } finally { jest.useRealTimers(); }
    });

    it('does not clear an environment circuit when a different custom credential verifies successfully', async () => {
        process.env.GROQ_API_KEY = 'test-environment-for-probe';
        const envCircuit = providerCircuitKey('groq');
        recordProviderCircuitFailure(envCircuit, { status: 429, headers: { 'retry-after': '1' } }, Date.now() - 2_000);
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'OK' } }] });
        expect((await verifyProviderDirect('groq', { apiKey: 'test-unrelated-custom-key' })).ok).toBe(true);
        expect(claimProviderCircuit(envCircuit)).toMatchObject({ allowed: true, probe: true });
    });

    it('blocks paid and cooling environment-key preflight instead of making another request', async () => {
        process.env.OPENROUTER_API_KEY = 'test-openrouter';
        expect((await verifyProviderDirect('openrouter', { model: 'openai/gpt-4o' })).ok).toBe(false);
        expect(registry.openRouterProvider.chatComplete).not.toHaveBeenCalled();
        process.env.GROQ_API_KEY = 'test-env-groq';
        recordProviderCircuitFailure(providerCircuitKey('groq'), { status: 429, headers: { 'retry-after': '600' } });
        expect(await verifyProviderDirect('groq')).toMatchObject({ ok: false, detail: expect.stringContaining('provider_cooldown') });
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('never sends an unsupported custom provider credential to the SDK default endpoint', async () => {
        await route({ modelConfig: { provider: 'local', apiKey: 'test-local-key' } });
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockOpenAI).not.toHaveBeenCalled();
    });

    it('does not certify a selected provider using a fallback answer', async () => {
        mockCreate.mockRejectedValue(Object.assign(new Error('429 rate limit'), { status: 429 }));
        const result = await verifyProviderDirect('groq', { apiKey: 'test-verification-key', model: 'test-model' });
        expect(result.ok).toBe(false);
        expect(registry.llm7Provider.chatComplete).not.toHaveBeenCalled();
    });

    it('continues to a second free provider after a mesh quota failure and skips the exhausted one on the next call', async () => {
        registry.llm7Provider.chatComplete.mockRejectedValue(Object.assign(new Error('429 quota exhausted'), { status: 429 }));
        registry.duckAIProvider.isAvailable.mockReturnValue(true);
        registry.duckAIProvider.chatComplete.mockResolvedValue('Alternate free provider continued.');
        await expect(route()).resolves.toBe('Alternate free provider continued.');
        await expect(route()).resolves.toBe('Alternate free provider continued.');
        expect(registry.llm7Provider.chatComplete).toHaveBeenCalledTimes(1);
        expect(registry.duckAIProvider.chatComplete).toHaveBeenCalledTimes(2);
        expect(registry.duckAIProvider.chatComplete.mock.calls[0][0]).toEqual(expect.arrayContaining(messages));
    });

    it('does not expose a credential echoed in a provider failure receipt', async () => {
        const key = 'test-private-key-never-in-evidence';
        mockCreate.mockRejectedValue(Object.assign(new Error('429 rate limit for ' + key), { status: 429 }));
        const context: any = { modelConfig: { provider: 'groq', apiKey: key }, workspaceId: 'redaction' };
        await routeToModel(messages, undefined, undefined, undefined, undefined, undefined, tools, context);
        expect(JSON.stringify(context.providerAttempts)).not.toContain(key);
        expect(context.providerAttempts).toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'groq', success: false })]));
    });

    it('fails over a custom 429 without reusing the same environment credential via another model or mesh', async () => {
        process.env.GROQ_API_KEY = 'test-shared-environment-key';
        mockCreate.mockRejectedValue(Object.assign(new Error('429 tokens per day; retry-after: 600 seconds'), { status: 429 }));
        const context = { userId: 'owner', workspaceId: 'project', sessionId: 'first',
            modelConfig: { provider: 'groq', model: 'first-model', apiKey: process.env.GROQ_API_KEY } };
        await expect(route(context)).resolves.toBe('Continued the same accepted plan.');
        await expect(route({ ...context, sessionId: 'second', modelConfig: { ...context.modelConfig, model: 'other-model' } }))
            .resolves.toBe('Continued the same accepted plan.');
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(registry.openAIProvider.chatComplete).not.toHaveBeenCalled();
        expect(registry.llm7Provider.chatComplete).toHaveBeenCalledTimes(2);
        expect(registry.llm7Provider.chatComplete.mock.calls[0][0]).toEqual(expect.arrayContaining(messages));
        expect(registry.llm7Provider.chatComplete.mock.calls[0][2]).toBe(tools);
        expect(mockOpenAI).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    });

    it('does not send a paid custom selection or automatic paid fallback under the default policy', async () => {
        await expect(route({ modelConfig: { provider: 'openai', model: 'gpt-4o', apiKey: 'test-paid-key' } }))
            .resolves.toBe('Continued the same accepted plan.');
        expect(mockCreate).not.toHaveBeenCalled();
        expect(registry.openAIProvider.chatComplete).not.toHaveBeenCalled();
        expect(aiCostPolicy()).toBe('free_only');
        expect(providerAllowedByCost('openrouter', 'paid-model')).toBe(false);
        expect(providerAllowedByCost('groq', 'model', 'https://unknown.example/v1')).toBe(false);
        delete process.env.AI_FREE_PROVIDERS;
        expect(providerAllowedByCost('groq')).toBe(false);
        expect(providerAllowedByCost('openrouter', 'vendor/model:free')).toBe(true);
    });

    it('only operator allow_paid enables the explicitly configured paid route', async () => {
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'Paid route explicitly approved.' } }] });
        await route({ aiCostPolicy: 'allow_paid', modelConfig: { provider: 'openai', apiKey: 'test-paid-key' } });
        expect(mockCreate).not.toHaveBeenCalled();
        process.env.AI_COST_POLICY = 'allow_paid';
        await expect(route({ modelConfig: { provider: 'openai', apiKey: 'test-paid-key' } }))
            .resolves.toBe('Paid route explicitly approved.');
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('isolates custom credentials between workspaces while preserving cooldown across sessions in one workspace', async () => {
        mockCreate.mockRejectedValueOnce(Object.assign(new Error('429 rate limited'), { status: 429 }));
        mockCreate.mockResolvedValue({ choices: [{ message: { content: 'Independent workspace answered.' } }] });
        const config = { provider: 'groq', model: 'test-model', apiKey: 'test-private-key' };
        await route({ workspaceId: 'A', userId: 'owner', sessionId: 'one', modelConfig: config });
        await route({ workspaceId: 'A', userId: 'owner', sessionId: 'two', modelConfig: config });
        await expect(route({ workspaceId: 'B', userId: 'owner', sessionId: 'one', modelConfig: config }))
            .resolves.toBe('Independent workspace answered.');
        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(providerCircuitKey('groq', { apiKey: config.apiKey, workspaceId: 'A' })).toMatch(/^[a-f0-9]{64}$/);
        expect(providerCircuitKey('groq', { apiKey: config.apiKey, workspaceId: 'A' })).not.toContain(config.apiKey);
    });

    it('honors an already-cancelled caller before any provider request', async () => {
        const controller = new AbortController();
        controller.abort(new Error('run_cancelled_by_owner'));
        await expect(route({ signal: controller.signal })).rejects.toThrow('run_cancelled_by_owner');
        expect(mockCreate).not.toHaveBeenCalled();
        expect(registry.llm7Provider.chatComplete).not.toHaveBeenCalled();
    });
});

describe('provider reset and bounded half-open probe', () => {
    it.each([
        { message: 'request failed', response: { status: 429 } },
        { message: 'request failed', code: 'insufficient_quota' },
        { message: 'request failed', error: { status: 'RESOURCE_EXHAUSTED' } },
    ])('preserves adapter quota evidence for nested error %p', error => {
        recordProviderCircuitFailure('nested-error', error, 1000);
        expect(providerCircuitStatus('nested-error', 1001).blocked).toBe(true);
    });

    it('does not shorten a newer quota window or erase it with an earlier in-flight success', () => {
        const now = 1000;
        recordProviderCircuitFailure('shared', { status: 429, headers: { 'retry-after': '1800' } }, now);
        recordProviderCircuitFailure('shared', { status: 503 }, now + 1);
        markProviderCircuitHealthy('shared', undefined, now + 2);
        expect(providerCircuitStatus('shared', now + 60_002)).toMatchObject({ blocked: true, state: 'RATE_LIMITED', retryAt: now + 1_800_000 });
    });

    it('requires probe ownership and does not open a second probe while the first transport is unresolved', () => {
        recordProviderCircuitFailure('shared', { status: 429, headers: { 'retry-after': '1' } }, 1000);
        const claim = claimProviderCircuit('shared', 2001);
        releaseProviderCircuitProbe('shared');
        releaseProviderCircuitProbe('shared', (claim.lease || 0) + 1);
        expect(claimProviderCircuit('shared', 50_000).allowed).toBe(false);
        releaseProviderCircuitProbe('shared', claim.lease);
        expect(claimProviderCircuit('shared', 50_000).allowed).toBe(true);
    });

    it('does not treat paid or remote singleton aliases as free', () => {
        process.env.LOCAL_LLM_BASE_URL = 'https://billed.example/v1';
        expect(providerAllowedByCost('Local (Auto)')).toBe(false);
        process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1';
        expect(providerAllowedByCost('Local (Auto)')).toBe(true);
        process.env.DEEPSEEK_API_KEY = 'test-paid-key';
        expect(providerAllowedByCost('DeepSeek (Pollinations)')).toBe(false);
        process.env.LLM7_API_KEY = 'test-keyed-gateway';
        expect(providerAllowedByCost('LLM7 (Keyless)')).toBe(false);
        delete process.env.LLM7_API_KEY;
        process.env.LLM7_BASE_URL = 'https://billed.example/v1';
        expect(providerAllowedByCost('LLM7 (Keyless)')).toBe(false);
    });

    it('honors Retry-After beyond one day and allows only one post-reset probe', () => {
        const now = 1_000;
        const error = { status: 429, message: 'quota exhausted', headers: { 'retry-after': '172800' } };
        expect(providerRetryAfterMs(error, now)).toBe(172_800_000);
        recordProviderCircuitFailure('key', error, now);
        expect(claimProviderCircuit('key', now + 86_400_000).allowed).toBe(false);
        const reset = now + 172_800_001;
        const claim = claimProviderCircuit('key', reset);
        expect(claim).toMatchObject({ allowed: true, probe: true });
        expect(claimProviderCircuit('key', reset).allowed).toBe(false);
        releaseProviderCircuitProbe('key', claim.lease);
        const second = claimProviderCircuit('key', reset);
        expect(second.allowed).toBe(true);
        markProviderCircuitHealthy('key', second.lease, reset);
        expect(providerCircuitStatus('key', reset)).toEqual({ blocked: false });
    });

    it('keeps active quota memory when the bounded circuit store fills', () => {
        for (let index = 0; index < 520; index++) recordProviderCircuitFailure('key-' + index, { status: 429, headers: { 'retry-after': '120' } }, 1_000);
        expect(claimProviderCircuit('key-0', 2_000).allowed).toBe(false);
        expect(claimProviderCircuit('key-519', 2_000).allowed).toBe(false);
        expect(claimProviderCircuit('new-key', 2_000).allowed).toBe(false);
        expect(claimProviderCircuit('new-key', 122_000).allowed).toBe(true);
    });
});
