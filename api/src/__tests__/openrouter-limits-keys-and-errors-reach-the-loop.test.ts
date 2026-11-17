/**
 * OPENROUTER, END TO END, AGAINST A FAKE THAT SPEAKS ITS WIRE.
 *
 * Measured 2026-11-17 with «OpenRouter + his key» through Joe's own code
 * (providerModels, verifyProviderDirect, engineModelChoiceFor → routedModel →
 * routeToModel → the OpenAI SDK), the fake on 127.0.0.1 answering in
 * OpenRouter's documented shapes:
 *
 *  - one 429 (free-models-per-min, its reset in error.metadata.headers) ended
 *    the run: the route paused itself for the 5-minute default, and its
 *    «quota cooldown is active» refusals carried no status and no wait;
 *  - a refused key was asked three times and the run ended on the router's own
 *    «provider authentication is unavailable», not on «401 User not found.»;
 *  - a 200 with the error in its body read «Cannot read properties of
 *    undefined (reading '0')»;
 *  - a prompt over the model's window read as PROVIDER_DOWN, three times;
 *  - the check on every page load made a real completion on the user's key.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openRouterFake, routeVendorsTo, OPENROUTER_KEY, orError, type FakeServer } from './fixtures/provider-wire';
import { runEngine, type EngineDeps } from '../core/engine/loop';
import { planUpdateTool } from '../core/engine/plan';
import { finishTool, type Verifier } from '../core/engine/finish';
import { engineModelChoiceFor, routedModel } from '../core/engine/model';
import { providerModels } from '../core/engine/provider-models';
import { verifyProviderDirect, routeToModel } from '../core/llm/intelligent-router';
import type { BrowserSession, EngineRequest, ProcessRegistry, VerificationReport } from '../core/engine/types';

const BASE = 'https://openrouter.ai/api/v1';
let o: FakeServer;
let undo: () => void;
let n = 0;
/** A key of its own per test: the router's pauses and breakers are per key. */
const key = () => `${OPENROUTER_KEY}-${++n}`;
const roots: string[] = [];
let quiet: jest.SpyInstance[] = [];

beforeAll(async () => {
    o = await openRouterFake();
    undo = routeVendorsTo({ 'https://openrouter.ai': o.base });
});
afterAll(async () => {
    undo();
    await o.close();
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});
beforeEach(() => { o.hits.length = 0; quiet = (['log', 'info', 'warn', 'error'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined)); });
afterEach(() => quiet.forEach(s => s.mockRestore()));

const chats = () => o.hits.filter(h => h.path.endsWith('/chat/completions'));
const passing: Verifier = async () => ({ passed: true, checks: [{ id: 'requirements', status: 'passed', detail: 'ok' }], unproven: [], at: 0 } as VerificationReport);
function deps(model: any, wait: EngineDeps['wait'] = async () => { /* no sleep */ }): EngineDeps {
    const reg: ProcessRegistry = {
        async start(spec) { return { name: spec.name, command: spec.command, cwd: spec.cwd, running: true, startedAt: 0, output: '' }; },
        logs() { return undefined; }, async stop() { return true; }, list() { return []; }, async stopAll() { /* none */ },
    };
    const browser = (): BrowserSession => ({ async open() { throw new Error('unused'); }, async act() { throw new Error('unused'); }, async screenshot() { return ''; }, async close() { /* unused */ } });
    return { model, tools: [planUpdateTool, finishTool(passing)], processes: reg, browser, machine: { platform: 'linux', shell: 'bash' }, wait };
}
function request(): EngineRequest {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-openrouter-'));
    roots.push(dir);
    return { runId: `or-${n}`, request: 'Build a page with a booking button', language: 'en', projectDir: dir, deadlineAt: Date.now() + 10 * 60_000, signal: new AbortController().signal, emit: () => undefined, joe: {} };
}
const choose = (model: string, apiKey = key()): any => engineModelChoiceFor({ provider: 'openrouter', model, apiKey, baseUrl: BASE });
const step = (choice: any, content = 'hi') => routedModel(choice, {}).step([{ role: 'user', content }], [], { signal: new AbortController().signal, deadlineAt: Date.now() + 60_000 });

describe('the provider button: key typed, live list, pick, Connect', () => {
    it('lists the chat models, the free first, and a run delivers with tool calls answered by id', async () => {
        const list = await providerModels({ provider: 'openrouter', apiKey: key(), baseUrl: BASE });
        expect(list).toMatchObject({ source: 'live', models: ['google/gemma-4-31b-it:free', 'openai/gpt-oss-120b'] });
        const result = await runEngine(request(), deps(routedModel(choose('google/gemma-4-31b-it:free'), {})));
        expect(result).toMatchObject({ status: 'delivered' });
        const second = chats()[1].body.messages;
        const call = second.find((m: any) => m.role === 'assistant').tool_calls[0];
        expect(second.find((m: any) => m.role === 'tool').tool_call_id).toBe(call.id);
    });

    it('the check on every page load proves the key without a completion; a refused key is red', async () => {
        const out = await verifyProviderDirect('openrouter', { apiKey: key(), baseUrl: BASE, model: 'openai/gpt-oss-120b', light: true });
        expect(out).toMatchObject({ ok: true });
        expect(chats()).toHaveLength(0);
        expect(o.hits.map(h => h.path)).toContain('/api/v1/key');
        expect(await verifyProviderDirect('openrouter', { apiKey: 'sk-or-v1-not-his', baseUrl: BASE, model: 'openai/gpt-oss-120b', light: true }))
            .toMatchObject({ ok: false, code: 'PROVIDER_AUTH' });
        expect(chats()).toHaveLength(0);
        //  Connect itself still makes the one real call.
        expect(await verifyProviderDirect('openrouter', { apiKey: key(), baseUrl: BASE, model: 'openai/gpt-oss-120b' })).toMatchObject({ ok: true, detail: 'key_ok' });
        expect(chats()).toHaveLength(1);
    });
});

describe('a run waits out a limit and stops at once on a refusal', () => {
    it('a 429 whose reset is in error.metadata.headers is waited, and the run delivers', async () => {
        o.script.push(() => ({ status: 429, body: orError(429, 'Rate limit exceeded: free-models-per-min. ', { headers: { 'X-RateLimit-Limit': '20', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Date.now() + 300) } }) }));
        const waits: number[] = [];
        //  The loop's wait, scaled: it asks for ≥ 30 s; 400 ms of real time passes the 300 ms reset.
        const result = await runEngine(request(), deps(routedModel(choose('google/gemma-4-31b-it:free'), {}), async ms => { waits.push(ms); await new Promise(r => setTimeout(r, 400)); }));
        expect(result).toMatchObject({ status: 'delivered' });
        expect(waits).toHaveLength(1);
    });

    it('the reset is the pause the route keeps, and the loop is told it', async () => {
        o.script.push(() => ({ status: 429, body: orError(429, 'Rate limit exceeded: free-models-per-min. ', { headers: { 'X-RateLimit-Reset': String(Date.now() + 40_000) } }) }));
        const choice = choose('openai/gpt-oss-120b');
        const first = await step(choice).catch(e => e);
        expect(first).toMatchObject({ code: 'PROVIDER_QUOTA', status: 429 });
        expect(first.retryAfterMs).toBeGreaterThan(35_000);
        expect(first.retryAfterMs).toBeLessThanOrEqual(40_000);
        const again = await step(choice).catch(e => e);
        expect(again).toMatchObject({ code: 'PROVIDER_QUOTA', status: 429 });
        expect(again.retryAfterMs).toBeGreaterThan(35_000);
        expect(chats()).toHaveLength(1);
    });

    it('a refused key ends the run at once, in OpenRouter\'s words', async () => {
        const result = await runEngine(request(), deps(routedModel(choose('google/gemma-4-31b-it:free', 'sk-or-v1-not-his'), {})));
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(/cannot go on \(PROVIDER_AUTH\).*401 User not found\./);
        expect(chats()).toHaveLength(1);
    });

    it('an account with no credit ends the run at once', async () => {
        o.script.push(() => ({ status: 402, body: orError(402, 'Insufficient credits. Add more using https://openrouter.ai/credits') }));
        const result = await runEngine(request(), deps(routedModel(choose('openai/gpt-oss-120b'), {})));
        expect(result.reason).toMatch(/cannot go on \(PROVIDER_BILLING\)/);
        expect(chats()).toHaveLength(1);
    });
});

describe('OpenRouter\'s other answers', () => {
    it('a 200 that holds the error is read as that error, a provider\'s bad minute', async () => {
        o.script.push(() => ({ status: 200, body: { id: 'gen-x', object: 'chat.completion', created: 1, model: 'openai/gpt-oss-120b', error: { code: 502, message: 'Provider returned error', metadata: { provider_name: 'Chutes' } } } }));
        await expect(step(choose('openai/gpt-oss-120b'))).rejects.toMatchObject({ code: 'PROVIDER_DOWN', status: 502, message: expect.stringMatching(/502 Provider returned error/) });
    });

    it('a prompt over the model\'s window asks the loop to fold the conversation', async () => {
        o.script.push(() => ({ status: 400, body: orError(400, "This endpoint's maximum context length is 131072 tokens. However, you requested about 210000 tokens (209000 of text input, 1000 in the output). Please reduce the length of either one, or use the \"middle-out\" transform to compress your prompt automatically.", { provider_name: null }) }));
        await expect(step(choose('openai/gpt-oss-120b'), 'x'.repeat(5000))).rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
    });

    it('a chat streams through its «: OPENROUTER PROCESSING» comments', async () => {
        const parts: string[] = [];
        const out = await routeToModel([{ role: 'user', content: 'hi' }], undefined, undefined, d => parts.push(d), undefined, undefined, undefined,
            { modelConfig: { provider: 'openrouter', model: 'google/gemma-4-31b-it:free', apiKey: key(), baseUrl: BASE }, strictProviderCheck: true });
        expect(out).toBe('OK');
        expect(parts).toEqual(['O', 'K']);
    });
});
