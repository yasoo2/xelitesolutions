/**
 * THE PROVIDER THE USER CHOSE IS THE BRAIN OF THE WHOLE RUN.
 *
 * The owner, 2026-11-02: «لما يشبك المفروض انه جميع جو ادوات جو… جو لازم
 * يشتغل على النموذج اللي اختاره المستخدم». Measured the same day: Claude was
 * chosen and connected, and the step that reads the request ran on the local
 * model on the CPU for minutes. Three things carried the brain away from his
 * choice: a helper that builds its own context lost it; the «intelligence
 * economy» sent hidden helpers to the local model while a provider was chosen;
 * and any failure of the chosen provider fell to the free mesh in silence.
 *
 * Locked here, by behaviour: the choice travels with the run to every model
 * call that names none; two runs at once keep their own; a failure is waited
 * out briefly on the same provider or said in his session, and nothing else
 * answers under his provider's name.
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
//  The local brain is up: the old rule sent hidden helpers to it.
jest.mock('../core/llm/local-brain', () => ({ isLocalBrainReady: jest.fn(() => true), pickLocalModel: () => 'test-local', localWarmupMs: () => 0 }));
jest.mock('../modules/tools/definitions/LLMCacheTool', () => ({ LLMCacheTool: { checkCache: jest.fn(), saveToCache: jest.fn() } }));
jest.mock('../api/ws', () => ({ broadcast: jest.fn(), broadcastThinkingDetail: jest.fn() }));

import fs from 'fs';
import path from 'path';
import { routeToModel, customRouteCooldownUntil } from '../core/llm/intelligent-router';
import { withRunModelChoice, runModelChoice, modelConfigFor } from '../core/llm/run-model-choice';
import { resetProviderContinuityForTests } from '../core/llm/provider-continuity';
import * as registry from '../core/llm/providers/registry';
import * as ws from '../api/ws';
import * as anthropic from '../core/engine/anthropic';

const mesh = registry as any;
const wire = ws as any;
const ask = [{ role: 'user', content: 'What does the user want?' }];
const DEEPSEEK = { provider: 'deepseek', model: 'deepseek-chat', apiKey: 'test-deepseek-typed-key' };
const route = (context?: any) => routeToModel(ask, undefined, undefined, undefined, undefined, undefined, undefined, context);
const saved = { policy: process.env.AI_COST_POLICY, cache: process.env.LLM_CACHE_DISABLE };

beforeEach(() => {
    jest.clearAllMocks();
    resetProviderContinuityForTests();
    customRouteCooldownUntil.clear();
    delete process.env.AI_COST_POLICY;
    process.env.LLM_CACHE_DISABLE = '1';
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'an answer from the chosen provider' } }] });
    mockOpenAI.mockImplementation((options: any) => ({ options, chat: { completions: { create: mockCreate } } }));
});
afterAll(() => {
    if (saved.policy === undefined) delete process.env.AI_COST_POLICY; else process.env.AI_COST_POLICY = saved.policy;
    if (saved.cache === undefined) delete process.env.LLM_CACHE_DISABLE; else process.env.LLM_CACHE_DISABLE = saved.cache;
});

const meshAnswered = () => Object.values(mesh).some((p: any) => p?.chatComplete?.mock?.calls?.length);
const addressesAsked = () => mockOpenAI.mock.calls.map(call => call[0]?.baseURL);

describe('the choice travels with the run', () => {
    it('a hidden helper that names no provider runs on the one the user chose, not the local model', async () => {
        const answer = await withRunModelChoice(DEEPSEEK, () => route({ purpose: 'internal' }));
        expect(answer).toBe('an answer from the chosen provider');
        expect(addressesAsked()).toEqual(['https://api.deepseek.com']);
        expect(mockCreate.mock.calls[0][0].model).toBe('deepseek-chat');
        expect(meshAnswered()).toBe(false);
    });

    it('a helper that asks for Auto inside his run runs on his choice too', async () => {
        await withRunModelChoice(DEEPSEEK, () => route({ modelConfig: { provider: 'auto', apiKey: 'auto-mode' }, purpose: 'internal' }));
        expect(addressesAsked()).toEqual(['https://api.deepseek.com']);
        expect(meshAnswered()).toBe(false);
    });

    it('a call that names its own provider keeps it', async () => {
        await withRunModelChoice(DEEPSEEK, () => route({ modelConfig: { provider: 'mistral', apiKey: 'test-mistral-typed-key' } }));
        expect(addressesAsked()).toEqual(['https://api.mistral.ai/v1']);
    });

    it("the caller's own context is not written with the choice, and the attempts still come back", async () => {
        const context: any = { purpose: 'internal' };
        await withRunModelChoice(DEEPSEEK, () => route(context));
        expect(context.modelConfig).toBeUndefined();
        expect(context.providerAttempts).toEqual([expect.objectContaining({ provider: 'deepseek', success: true })]);
    });

    it('outside a run nothing is chosen, and Auto stays the free mesh', async () => {
        expect(runModelChoice()).toBeUndefined();
        expect(modelConfigFor({ modelConfig: { provider: 'auto' } })).toEqual({ provider: 'auto' });
        await withRunModelChoice({ provider: 'auto', apiKey: 'auto-mode' }, () => route({ purpose: 'internal' }));
        expect(mockOpenAI).not.toHaveBeenCalled();
    });

    it('two users at once each keep their own provider', async () => {
        mockCreate.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 20));
            return { choices: [{ message: { content: 'answered' } }] };
        });
        const one = withRunModelChoice(DEEPSEEK, async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            await route({ purpose: 'internal' });
            return runModelChoice()?.provider;
        });
        const two = withRunModelChoice({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'test-openai-typed-key' }, async () => {
            await route({ purpose: 'internal' });
            await new Promise(resolve => setTimeout(resolve, 5));
            return runModelChoice()?.provider;
        });
        expect(await Promise.all([one, two])).toEqual(['deepseek', 'openai']);
        const asked = mockOpenAI.mock.calls.map(call => `${call[0].baseURL}|${call[0].apiKey}`).sort();
        expect(asked).toEqual(['https://api.deepseek.com|test-deepseek-typed-key', 'https://api.openai.com/v1|test-openai-typed-key']);
    });

    it('a hidden helper in a Claude run goes to Claude, on the key he typed, behind the budget guard', async () => {
        const claude = jest.spyOn(anthropic, 'serverClaudeChat').mockResolvedValue('{"primary":"answer"}' as any);
        try {
            await withRunModelChoice({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'sk-ant-test-typed' },
                () => route({ purpose: 'internal', runId: 'run-claude-helper' }));
            expect(claude).toHaveBeenCalledTimes(1);
            expect(claude.mock.calls[0][1]).toBe('claude-haiku-5-5');
            expect(claude.mock.calls[0][6]).toBe('sk-ant-test-typed');
            expect(meshAnswered()).toBe(false);
        } finally { claude.mockRestore(); }
    });
});

describe('when the chosen provider cannot answer, it is said, never swapped', () => {
    it('a refused key stops the call, the light in his session turns red, and the mesh stays silent', async () => {
        mockCreate.mockRejectedValue(Object.assign(new Error('401 Authentication Fails, invalid api key'), { status: 401 }));
        const failure = await withRunModelChoice(DEEPSEEK, () => route({ purpose: 'internal' }), { sessionId: 's-red', runId: 'run-red' }).catch(e => e);
        expect(failure).toMatchObject({ code: 'PROVIDER_AUTH', provider: 'deepseek' });
        expect(String(failure.message)).not.toContain('test-deepseek-typed-key');
        expect(meshAnswered()).toBe(false);
        expect(wire.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'provider_status', sessionId: 's-red', runId: 'run-red',
            data: expect.objectContaining({ provider: 'deepseek', ok: false, code: 'PROVIDER_AUTH' }),
        }));
    });

    it('no event without a session: one user\'s failure never reaches everyone', async () => {
        mockCreate.mockRejectedValue(Object.assign(new Error('401 invalid api key'), { status: 401 }));
        await withRunModelChoice(DEEPSEEK, () => route({ purpose: 'internal' })).catch(() => undefined);
        expect(wire.broadcast).not.toHaveBeenCalled();
    });

    it('a short rate limit is waited out on the same provider, and said while it waits', async () => {
        mockCreate
            .mockRejectedValueOnce(Object.assign(new Error('429 Rate limit reached'), { status: 429, headers: { 'retry-after': '1' } }))
            .mockResolvedValueOnce({ choices: [{ message: { content: 'answered after the wait' } }] });
        const answer = await withRunModelChoice(DEEPSEEK, () => route({ purpose: 'internal' }), { sessionId: 's-wait', language: 'ar' });
        expect(answer).toBe('answered after the wait');
        expect(mockCreate).toHaveBeenCalledTimes(2);
        expect(new Set(addressesAsked())).toEqual(new Set(['https://api.deepseek.com']));
        expect(wire.broadcastThinkingDetail).toHaveBeenCalledWith('s-wait', expect.stringContaining('deepseek'));
        expect(meshAnswered()).toBe(false);
    });

    it('a daily limit is not waited for: it is said with the time it comes back', async () => {
        mockCreate.mockRejectedValue(Object.assign(new Error('429 tokens per day exceeded'), { status: 429, headers: { 'retry-after': '3600' } }));
        const failure = await withRunModelChoice(DEEPSEEK, () => route({ purpose: 'internal' }), { sessionId: 's-day' }).catch(e => e);
        expect(failure).toMatchObject({ code: 'PROVIDER_QUOTA' });
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(wire.broadcast).toHaveBeenCalledWith(expect.objectContaining({
            type: 'provider_status', data: expect.objectContaining({ code: 'PROVIDER_QUOTA', minutes: 60 }),
        }));
    });

    it('an account with no credit is named as such', async () => {
        mockCreate.mockRejectedValue(Object.assign(new Error('402 Insufficient Balance'), { status: 402 }));
        await expect(withRunModelChoice(DEEPSEEK, () => route({}))).rejects.toMatchObject({ code: 'PROVIDER_BILLING' });
        expect(meshAnswered()).toBe(false);
    });

    it('a model the provider does not serve is named as such', async () => {
        mockCreate.mockRejectedValue(Object.assign(new Error('404 The model `deepseek-old` does not exist'), { status: 404 }));
        await expect(withRunModelChoice({ ...DEEPSEEK, model: 'deepseek-old' }, () => route({}))).rejects.toMatchObject({ code: 'PROVIDER_MODEL' });
        expect(meshAnswered()).toBe(false);
    });
});

describe('the wiring that carries it', () => {
    const SRC = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

    it('every run starts inside its choice, with its session for the light', () => {
        expect(SRC('modules', 'services', 'AgentLoopService.ts'))
            .toMatch(/withRunModelChoice\(options\.modelConfig, \(\) => AgentLoopService\.executeScoped\([\s\S]*?\{ sessionId, runId, language \}\)/);
    });

    it('the custom route no longer sends hidden helpers to the local model', () => {
        const router = SRC('core', 'llm', 'intelligent-router.ts');
        expect(router).not.toContain('ordinary internal reasoning → local brain first');
        expect(router).not.toContain('Falling back to default routing');
    });
});
