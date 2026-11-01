/**
 * THE PROVIDER THE USER CHOOSES IS THE PROVIDER THAT RUNS.
 *
 * Measured on 2026-11-01 in Joe's interface: the provider button said
 * «Auto (free)» while the agent engine ran on Claude, because the engine read
 * only the deployment's settings. Elsewhere in Joe, a provider chosen without
 * a key silently became whichever free provider answered.
 *
 * The owner's rule: whatever provider the user chooses, Joe runs on that
 * provider correctly, or says plainly why it cannot. Claude is paid: it runs
 * on the key the user typed, or on the server's key asked for by name, never
 * as Auto; and every Claude call, in the engine and in the rest of Joe, goes
 * through the budget guard.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../core/engine/anthropic', () => {
    const actual = jest.requireActual('../core/engine/anthropic');
    return { ...actual, serverClaudeChat: jest.fn(actual.serverClaudeChat) };
});

import { engineModelChoiceFor } from '../core/engine/model';
import * as anthropic from '../core/engine/anthropic';
import { SpendLedger } from '../core/engine/budget';
import { routeToModel } from '../core/llm/intelligent-router';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-provider-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const DEPLOY = {
    JOE_ENGINE_PROVIDER: 'anthropic', JOE_ENGINE_MODEL: 'claude-haiku-5-5',
    JOE_ENGINE_ANTHROPIC_API_KEY: 'sk-test-not-real', JOE_ENGINE_BUDGET_USD: '10',
    LOCAL_LLM_MODEL: 'qwen3.5:9b',
} as NodeJS.ProcessEnv;

describe('the engine runs on the provider the user chose', () => {
    it('Auto is the deployment\'s free model, never Claude, even where the deployment names Claude', () => {
        expect(engineModelChoiceFor({ provider: 'auto', model: 'auto', apiKey: 'auto-mode' }, DEPLOY)).toMatchObject({ provider: 'local', model: 'qwen3.5:9b' });
        expect(engineModelChoiceFor(undefined, DEPLOY)).toMatchObject({ provider: 'local', model: 'qwen3.5:9b' });
    });

    it('a chosen Claude model is the model, on the key the user typed or the server key asked for by name', () => {
        expect(engineModelChoiceFor({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'server-key' }, DEPLOY))
            .toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'server-key' });
        expect(engineModelChoiceFor({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant-users-own' }, DEPLOY)).toMatchObject({ apiKey: 'sk-ant-users-own' });
    });

    it('Claude chosen with no key is refused: it is paid, and the server key is never borrowed unasked', () => {
        for (const apiKey of ['', 'free-mode', 'auto-mode', undefined]) {
            expect(engineModelChoiceFor({ provider: 'anthropic', model: 'claude-haiku-5-5', apiKey }, DEPLOY)).toMatchObject({ error: expect.stringMatching(/without a key\. Claude is paid/) });
        }
    });

    it('a chosen local model is that model, on the managed endpoint only', () => {
        expect(engineModelChoiceFor({ provider: 'local', model: 'qwen3.5:9b', apiKey: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' }, DEPLOY))
            .toMatchObject({ provider: 'local', model: 'qwen3.5:9b' });
        expect(engineModelChoiceFor({ provider: 'local', model: 'x', baseUrl: 'http://10.0.0.5:11434/v1' }, DEPLOY)).toMatchObject({ error: expect.stringMatching(/managed Ollama/) });
    });

    it('a provider chosen without any key is refused, naming the key, never swapped for another', () => {
        const refused: any = engineModelChoiceFor({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'free-mode' }, DEPLOY);
        expect(refused.error).toMatch(/groq was chosen, but no key for it was given and the server has no GROQ_API_KEY/);
    });

    it('a provider chosen with a key, the user\'s or the server\'s, runs on that provider and model', () => {
        expect(engineModelChoiceFor({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_users_own' }, DEPLOY))
            .toMatchObject({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'gsk_users_own' });
        expect(engineModelChoiceFor({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey: 'free-mode' }, { ...DEPLOY, GROQ_API_KEY: 'gsk_server' }))
            .toMatchObject({ provider: 'groq', apiKey: 'gsk_server' });
    });
});

describe('Claude for the rest of Joe runs on the server key, behind the budget guard', () => {
    it('serverClaudeChat answers with the chosen model and charges the ledger', async () => {
        const file = path.join(root, 'spend.json');
        const sent: any[] = [];
        const client: any = {
            messages: {
                stream(params: any) {
                    sent.push(params);
                    const listeners: any[] = [];
                    return {
                        on(_e: string, fn: any) { listeners.push(fn); return this; },
                        async finalMessage() {
                            for (const fn of listeners) fn({ type: 'message_start', message: { usage: { input_tokens: 10 } } });
                            return { model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'جواب من Claude' }], usage: { input_tokens: 100, output_tokens: 20 } };
                        },
                    };
                },
            },
        };
        const answer = await anthropic.serverClaudeChat([{ role: 'system', content: 'You are Joe.' }, { role: 'user', content: 'مرحبا' }], 'claude-sonnet-5-5', 'run-chat-1', undefined,
            { ...DEPLOY, JOE_ENGINE_LEDGER: file }, client);
        expect(answer).toBe('جواب من Claude');
        expect(sent[0]).toMatchObject({ model: 'claude-sonnet-5-5', system: [{ type: 'text', text: 'You are Joe.' }] });
        expect((await new SpendLedger(file, 10, 3).spent('run-chat-1')).runUsd).toBeGreaterThan(0);
    });

    it('without a server key it refuses, and says so', async () => {
        await expect(anthropic.serverClaudeChat([{ role: 'user', content: 'hi' }], 'claude-haiku-5-5', 'r', undefined, { JOE_ENGINE_BUDGET_USD: '10' } as any))
            .rejects.toMatchObject({ code: 'MODEL_AUTH' });
    });

    it('the router sends Claude chosen with no typed key to the guarded server path', async () => {
        (anthropic.serverClaudeChat as jest.Mock).mockResolvedValueOnce('Claude answered through the guard.');
        const out = await routeToModel([{ role: 'user', content: 'مرحبا' }], undefined, undefined, undefined, undefined, undefined, undefined, {
            modelConfig: { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'server-key' }, strictProviderCheck: true, runId: 'run-router-1',
        } as any);
        expect(String(out)).toBe('Claude answered through the guard.');
        expect((anthropic.serverClaudeChat as jest.Mock).mock.calls.at(-1)?.slice(1, 3)).toEqual(['claude-haiku-5-5', 'run-router-1']);
    });

    it('a Claude key the user typed runs, under free_only too, and only through the guard with that key', async () => {
        const saved = process.env.AI_COST_POLICY;
        process.env.AI_COST_POLICY = 'free_only';
        try {
            (anthropic.serverClaudeChat as jest.Mock).mockResolvedValueOnce('Claude answered on the typed key.');
            const out = await routeToModel([{ role: 'user', content: 'hi' }], undefined, undefined, undefined, undefined, undefined, undefined, {
                modelConfig: { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'sk-ant-typed-in-browser' }, strictProviderCheck: true, runId: 'run-router-2',
            } as any);
            expect(String(out)).toBe('Claude answered on the typed key.');
            expect((anthropic.serverClaudeChat as jest.Mock).mock.calls.at(-1)?.[6]).toBe('sk-ant-typed-in-browser');
        } finally {
            if (saved === undefined) delete process.env.AI_COST_POLICY; else process.env.AI_COST_POLICY = saved;
        }
    });
});

describe('the interface reads what really runs, and can verify Claude on the server key', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const router = require('../api/routes/run').default;
    const handler = (routePath: string, method: string) => {
        const layer = router.stack.find((e: any) => e.route?.path === routePath && e.route?.methods?.[method]);
        return layer.route.stack.at(-1).handle;
    };
    const response = () => ({ statusCode: 200, body: undefined as any, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } });
    const saved: Record<string, string | undefined> = {};
    const KEYS = ['JOE_ENGINE', 'JOE_ENGINE_PROVIDER', 'JOE_ENGINE_MODEL', 'JOE_ENGINE_ANTHROPIC_API_KEY', 'JOE_ENGINE_BUDGET_USD', 'JOE_ENGINE_LEDGER', 'LOCAL_LLM_MODEL'];
    beforeEach(() => { for (const k of KEYS) saved[k] = process.env[k]; Object.assign(process.env, { ...DEPLOY, JOE_ENGINE: 'agent', JOE_ENGINE_LEDGER: path.join(root, 'route-spend.json') }); });
    afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

    it('GET /engine says Auto is the free local model, that the server key works, and never shows the key', async () => {
        const res = response();
        await handler('/engine', 'get')({ auth: { sub: 'u1' } }, res);
        expect(res.body).toMatchObject({ engine: 'agent', auto: { provider: 'local', model: 'qwen3.5:9b' }, claude: { serverKey: true, models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'] }, budget: { totalUsd: 10 } });
        expect(JSON.stringify(res.body)).not.toMatch(/sk-test-not-real/);
    });

    it('Verify on Claude with the server key is one real call through the guard', async () => {
        (anthropic.serverClaudeChat as jest.Mock).mockResolvedValueOnce('OK');
        const res = response();
        await handler('/verify', 'post')({ auth: { sub: 'u1' }, body: { provider: 'anthropic', apiKey: 'server-key', model: 'claude-haiku-5-5' } }, res);
        expect(res.body).toMatchObject({ ok: true, provider: 'anthropic' });
        expect((anthropic.serverClaudeChat as jest.Mock).mock.calls.at(-1)?.[1]).toBe('claude-haiku-5-5');
        expect((anthropic.serverClaudeChat as jest.Mock).mock.calls.at(-1)?.[6]).toBe('server-key');
    });
});

