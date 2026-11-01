/**
 * THE PROVIDER THE USER CHOOSES IS THE PROVIDER THAT RUNS.
 *
 * Measured on 2026-11-01 in Joe's interface: the provider button said
 * «Auto (free)» while the agent engine ran on Claude, because the engine read
 * only the deployment's settings. Elsewhere in Joe, a provider chosen without
 * a key silently became whichever free provider answered.
 *
 * The owner's rule: whatever provider the user chooses, Joe runs on that
 * provider correctly, or says plainly why it cannot. Claude runs on the
 * server's key when the user typed none, and every Claude call, in the
 * engine and in the rest of Joe, goes through the budget guard.
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
} as NodeJS.ProcessEnv;

describe('the engine runs on the provider the user chose', () => {
    it('Auto keeps the deployment\'s own model', () => {
        expect(engineModelChoiceFor({ provider: 'auto', model: 'auto', apiKey: 'auto-mode' }, DEPLOY)).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5' });
        expect(engineModelChoiceFor(undefined, DEPLOY)).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-5-5' });
    });

    it('a chosen Claude model is the model, on the server key when none was typed', () => {
        const choice: any = engineModelChoiceFor({ provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'server-key' }, DEPLOY);
        expect(choice).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
        expect(choice.apiKey).toBeUndefined();
        expect(engineModelChoiceFor({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'sk-ant-users-own' }, DEPLOY)).toMatchObject({ apiKey: 'sk-ant-users-own' });
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

    it('a Claude key typed in the browser still obeys the free_only policy', async () => {
        const saved = process.env.AI_COST_POLICY;
        process.env.AI_COST_POLICY = 'free_only';
        try {
            await expect(routeToModel([{ role: 'user', content: 'hi' }], undefined, undefined, undefined, undefined, undefined, undefined, {
                modelConfig: { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'sk-ant-typed-in-browser' }, strictProviderCheck: true, runId: 'run-router-2',
            } as any)).rejects.toThrow(/free_only excludes/);
        } finally {
            if (saved === undefined) delete process.env.AI_COST_POLICY; else process.env.AI_COST_POLICY = saved;
        }
    });
});
