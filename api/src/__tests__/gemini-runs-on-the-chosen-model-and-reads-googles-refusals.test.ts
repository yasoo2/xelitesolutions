/**
 * GEMINI, END TO END, AGAINST A FAKE THAT SPEAKS GOOGLE'S WIRE.
 *
 * Measured 2026-11-17 with the owner's choice «Google Gemini + his key»
 * driven through Joe's own code (providerModels, verifyProviderDirect,
 * engineModelChoiceFor → routedModel → routeToModel → GeminiProvider → the
 * OpenAI SDK), the fake on 127.0.0.1 answering as Google documents:
 *
 *  - a run on Gemini 3 failed at its second step: the call's
 *    thought_signature (tool_calls[].extra_content.google) was dropped, and
 *    Google refuses the next request without it;
 *  - a failure on the chosen model was answered by three other models
 *    (gemini-flash-latest, gemini-2.0-flash-exp, gemini-pro-latest), and the
 *    run reported the last one's 404;
 *  - Google's refusals are a JSON array, so the SDK read «400 status code (no
 *    body)», and a 429's RetryInfo was lost: a 17 s limit paused Gemini for 5 min;
 *  - a chat with Gemini never streamed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { geminiFake, routeVendorsTo, GEMINI_KEY, geminiQuota, GEMINI_OVERLOADED, type GeminiFake } from './fixtures/provider-wire';
import { runEngine, type EngineDeps } from '../core/engine/loop';
import { planUpdateTool } from '../core/engine/plan';
import { finishTool, type Verifier } from '../core/engine/finish';
import { engineModelChoiceFor, routedModel } from '../core/engine/model';
import { providerModels } from '../core/engine/provider-models';
import { verifyProviderDirect, routeToModel } from '../core/llm/intelligent-router';
import type { BrowserSession, EngineRequest, ProcessRegistry, VerificationReport } from '../core/engine/types';

let g: GeminiFake;
let undo: () => void;
let n = 0;
/** A key of its own per test: the router's pauses and breakers are per key. */
const key = () => `${GEMINI_KEY}-${++n}`;
const roots: string[] = [];
let quiet: jest.SpyInstance[] = [];

beforeAll(async () => {
    g = await geminiFake();
    undo = routeVendorsTo({ 'https://generativelanguage.googleapis.com': g.base });
});
afterAll(async () => {
    undo();
    await g.close();
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});
beforeEach(() => { g.hits.length = 0; quiet = (['log', 'info', 'warn', 'error'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined)); });
afterEach(() => quiet.forEach(s => s.mockRestore()));

const chats = () => g.hits.filter(h => h.path.endsWith('/chat/completions'));
const passing: Verifier = async () => ({ passed: true, checks: [{ id: 'requirements', status: 'passed', detail: 'ok' }], unproven: [], at: 0 } as VerificationReport);
function deps(model: any): EngineDeps {
    const reg: ProcessRegistry = {
        async start(spec) { return { name: spec.name, command: spec.command, cwd: spec.cwd, running: true, startedAt: 0, output: '' }; },
        logs() { return undefined; }, async stop() { return true; }, list() { return []; }, async stopAll() { /* none */ },
    };
    const browser = (): BrowserSession => ({ async open() { throw new Error('unused'); }, async act() { throw new Error('unused'); }, async screenshot() { return ''; }, async close() { /* unused */ } });
    return { model, tools: [planUpdateTool, finishTool(passing)], processes: reg, browser, machine: { platform: 'linux', shell: 'bash' }, wait: async () => { /* no sleep */ } };
}
function request(): EngineRequest {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-gemini-'));
    roots.push(dir);
    return { runId: `gemini-${n}`, request: 'Build a page with a booking button', language: 'en', projectDir: dir, deadlineAt: Date.now() + 10 * 60_000, signal: new AbortController().signal, emit: () => undefined, joe: {} };
}
const step = (choice: any) => routedModel(choice, {}).step([{ role: 'user', content: 'hi' }], [], { signal: new AbortController().signal, deadlineAt: Date.now() + 60_000 });

describe('the provider button: key typed, live list, pick, Connect', () => {
    it('lists the chat models Google offers the key, and Connect makes one real call on the chosen model', async () => {
        const k = key();
        const list = await providerModels({ provider: 'gemini', apiKey: k });
        expect(list).toMatchObject({ source: 'live', models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'] });
        expect(await verifyProviderDirect('gemini', { apiKey: k, model: 'gemini-3.8-flash', light: true })).toMatchObject({ ok: true, detail: 'listed' });
        expect(chats()).toHaveLength(0);
        expect(await verifyProviderDirect('gemini', { apiKey: k, model: 'gemini-3.8-flash' })).toMatchObject({ ok: true, detail: 'key_ok' });
        expect(chats().map(h => h.body.model)).toEqual(['models/gemini-3.8-flash']);
        expect(chats()[0].headers.authorization).toBe(`Bearer ${k}`);
    });

    it('a refused key is red with Google\'s own words, after one request', async () => {
        const out = await verifyProviderDirect('gemini', { apiKey: 'AIzaNOT-THE-KEY', model: 'gemini-3.8-flash' });
        expect(out).toMatchObject({ ok: false, code: 'PROVIDER_AUTH' });
        expect(out.detail).toMatch(/API key not valid/);
        expect(chats()).toHaveLength(1);
    });
});

describe('a run on the model the user chose', () => {
    it('Gemini 3\'s thought_signature goes back with its call, and the run delivers', async () => {
        const choice: any = engineModelChoiceFor({ provider: 'gemini', model: 'gemini-3.8-flash', apiKey: key() });
        const result = await runEngine(request(), deps(routedModel(choice, {})));
        expect(result).toMatchObject({ status: 'delivered' });
        const second = chats()[1].body.messages.find((m: any) => m.role === 'assistant' && m.tool_calls);
        expect(second.tool_calls[0].extra_content).toEqual({ google: { thought_signature: g.signatures.get(second.tool_calls[0].id) } });
        expect(chats().every(h => h.body.model === 'models/gemini-3.8-flash')).toBe(true);
    });

    it('a 503 on the chosen model is that model\'s failure: no other model is asked', async () => {
        const choice: any = engineModelChoiceFor({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: key() });
        g.script.push(() => ({ status: 503, body: GEMINI_OVERLOADED }));
        await expect(step(choice)).rejects.toMatchObject({ code: 'PROVIDER_DOWN', status: 503, message: expect.stringMatching(/The model is overloaded/) });
        expect(chats().map(h => h.body.model)).toEqual(['models/gemini-3.5-flash-lite']);
    });

    it('a 429 is a limit with Google\'s own delay, and the loop is told to wait it', async () => {
        const choice: any = engineModelChoiceFor({ provider: 'gemini', model: 'gemini-3.6-flash', apiKey: key() });
        g.script.push(() => ({ status: 429, body: geminiQuota('17s') }));
        const first = await step(choice).catch(e => e);
        expect(first).toMatchObject({ code: 'PROVIDER_QUOTA', status: 429 });
        expect(first.retryAfterMs).toBeGreaterThan(15_000);
        expect(first.retryAfterMs).toBeLessThanOrEqual(17_000);
        //  The route's own pause, asked again at once, still says how long it holds.
        const again = await step(choice).catch(e => e);
        expect(again).toMatchObject({ code: 'PROVIDER_QUOTA', status: 429 });
        expect(again.retryAfterMs).toBeLessThanOrEqual(17_000);
        expect(chats()).toHaveLength(1);
    });
});

describe('chat', () => {
    it('a chat with no tools streams its tokens as they arrive', async () => {
        const parts: string[] = [];
        const out = await routeToModel([{ role: 'user', content: 'hi' }], undefined, undefined, d => parts.push(d), undefined, undefined, undefined,
            { modelConfig: { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: key() }, strictProviderCheck: true });
        expect(out).toBe('OK');
        expect(parts).toEqual(['O', 'K']);
        expect(chats()[0].body.stream).toBe(true);
    });
});
