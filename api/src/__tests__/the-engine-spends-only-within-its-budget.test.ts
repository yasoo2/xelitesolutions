/**
 * THE ENGINE ON A PAID MODEL SPENDS ONLY WHAT ITS BUDGET ALLOWS.
 *
 * The engine can drive Claude through the official SDK. Every step of a long
 * loop costs money, so these tests pin the guard and the connector:
 *
 *  - prices are the published ones, and a model with no checked price is refused;
 *  - no call is made unless its worst case fits the total and the run's budget,
 *    and what the API billed is what is charged;
 *  - the conversation is sent so the cache can serve it (tools + system as one
 *    cached prefix, a moving breakpoint at the end) and each turn's thinking is
 *    replayed unchanged until the history is edited;
 *  - a cut reply, a refusal, a spent budget and a refused key each end the way
 *    the loop can act on.
 *
 * A fake client stands in for the SDK. Nothing here reaches the network.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { costOf, worstCaseCost, SpendLedger, ledgerFromEnv } from '../core/engine/budget';
import {
    anthropicModel, anthropicSettings, keyFromFileText, toAnthropicRequest, thinkingFor, mapApiError,
    type AnthropicClientLike, type AnthropicSettings,
} from '../core/engine/anthropic';
import { engineModelChoice, engineBrain } from '../core/engine/model';
import { runEngine, type EngineDeps } from '../core/engine/loop';
import { planUpdateTool } from '../core/engine/plan';
import { finishTool, type Verifier } from '../core/engine/finish';
import type { ChatMessage, EngineEvent, EngineTool, ProcessRegistry, ToolSchema } from '../core/engine/types';

const roots: string[] = [];
function tempDir(prefix = 'joe-engine-spend-'): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), prefix));
    roots.push(dir);
    return dir;
}
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

const HAIKU = 'claude-haiku-5-5';

/* ───────────── a fake SDK client that plays replies and records requests ───────────── */

type Reply = { message?: any; error?: any; breakMidAnswer?: Error };

function fakeClient(replies: Reply[]) {
    const sent: any[] = [];
    let i = 0;
    const client: AnthropicClientLike = {
        messages: {
            stream(params: any) {
                sent.push(JSON.parse(JSON.stringify(params)));
                const r = replies[Math.min(i, replies.length - 1)];
                i++;
                const listeners: ((e: any) => void)[] = [];
                return {
                    on(_event: 'streamEvent', fn: (e: any) => void) { listeners.push(fn); return this; },
                    async finalMessage() {
                        if (r.error) throw r.error;
                        for (const fn of listeners) fn({ type: 'message_start' });
                        if (r.breakMidAnswer) throw r.breakMidAnswer;
                        return r.message;
                    },
                };
            },
        },
    };
    return { client, sent, calls: () => i };
}

/** A tool_use block as the SDK's stream leaves it: a parsed input and the raw text it streamed. */
function toolUse(id: string, name: string, args: unknown, raw?: string) {
    const block: any = { type: 'tool_use', id, name, input: args, caller: { type: 'direct' } };
    Object.defineProperty(block, '__json_buf', { value: raw ?? JSON.stringify(args), enumerable: false });
    return block;
}

function message(content: any[], over: { stop?: string; usage?: any; model?: string; stop_details?: any } = {}) {
    return {
        id: 'msg_1', type: 'message', role: 'assistant', model: over.model ?? HAIKU, content,
        stop_reason: over.stop ?? (content.some(b => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
        stop_details: over.stop_details ?? null,
        usage: over.usage ?? { input_tokens: 1_000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    };
}

function settings(over: Partial<AnthropicSettings> = {}): AnthropicSettings {
    return { model: HAIKU, apiKey: 'sk-test-not-real', maxTokens: 8_000, contextTokens: 90_000, thinking: true, cacheTtl: '5m', vision: true, ...over };
}

function ledger(total = 10, perRun = 3): SpendLedger {
    return new SpendLedger(path.join(tempDir(), 'engine-spend.json'), total, perRun);
}

const signal = new AbortController().signal;
const later = () => Date.now() + 60_000;
const tools: ToolSchema[] = [{ type: 'function', function: { name: 'file_write', description: 'write a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }];

/* ───────────────────────────── prices ───────────────────────────── */

describe('a call is priced at the published rates', () => {
    it('Haiku 5.5 is billed at its low rates up to 100,000 prompt tokens and at its high rates above', () => {
        expect(costOf(HAIKU, { inputTokens: 1_000, outputTokens: 200, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 })).toBeCloseTo(0.0002, 10);
        // 20k new + 90k read from cache = 110k prompt tokens: the whole request moves to the high tier.
        expect(costOf(HAIKU, { inputTokens: 20_000, outputTokens: 1_000, cacheReadTokens: 90_000, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 })).toBeCloseTo(0.017, 10);
    });

    it('cache reads and writes have their own prices, per model', () => {
        const u = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWrite5mTokens: 1_000_000, cacheWrite1hTokens: 0 };
        expect(costOf('claude-sonnet-5-5', u)).toBeCloseTo(0.10 + 2.50, 10);
        expect(costOf('claude-opus-5-5', u)).toBeCloseTo(0.20 + 5, 10);
    });

    it('a model with no checked price is refused, not guessed', async () => {
        expect(() => costOf('claude-unknown-9', { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 })).toThrow(/No price is known/);
        const s = await anthropicSettings({ JOE_ENGINE_MODEL: 'claude-unknown-9', JOE_ENGINE_ANTHROPIC_API_KEY: 'k' });
        expect('error' in s && s.error).toMatch(/No price is known/);
    });

    it('the worst case counts every prompt token at the dearest input rate and every output token', () => {
        expect(worstCaseCost(HAIKU, 10_000, 8_000)).toBeCloseTo((10_000 * 0.20 + 8_000 * 0.50) / 1e6, 10);
    });
});

/* ───────────────────────────── the ledger ───────────────────────────── */

describe('the ledger holds the budget across calls, runs and restarts', () => {
    it('charges what was billed, and a new ledger on the same file sees the total', async () => {
        const l = ledger(1, 1);
        const hold = await l.reserve('run-a', 0.05);
        await hold.charge({ at: 1, model: HAIKU, costUsd: 0.01, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 }, purpose: 'engine step' });
        expect((await l.spent('run-a')).totalUsd).toBeCloseTo(0.01, 10);
        const again = new SpendLedger(l.file, 1, 1);
        expect(await again.spent('run-a')).toMatchObject({ runUsd: 0.01, calls: 1 });
    });

    it('refuses a call whose worst case does not fit, before it is made', async () => {
        const l = ledger(0.10, 3);
        await expect(l.reserve('run-a', 0.11)).rejects.toMatchObject({ code: 'ENGINE_BUDGET_EXHAUSTED' });
    });

    it('a run stops at its own budget while other runs can still spend', async () => {
        const l = ledger(10, 0.05);
        const hold = await l.reserve('run-a', 0.04);
        await hold.charge({ at: 1, model: HAIKU, costUsd: 0.04, usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 }, purpose: 'x' });
        await expect(l.reserve('run-a', 0.02)).rejects.toMatchObject({ code: 'ENGINE_BUDGET_EXHAUSTED', message: expect.stringMatching(/This run reached its budget/) });
        await expect(l.reserve('run-b', 0.02)).resolves.toBeDefined();
    });

    it('calls in flight hold their worst case, so runs together cannot pass the total', async () => {
        const l = ledger(1, 1);
        const first = await l.reserve('run-a', 0.6);
        await expect(l.reserve('run-b', 0.6)).rejects.toMatchObject({ code: 'ENGINE_BUDGET_EXHAUSTED' });
        first.release();
        await expect(l.reserve('run-b', 0.6)).resolves.toBeDefined();
    });

    it('a ledger file that cannot be read stops spending instead of starting again from zero', async () => {
        const dir = tempDir();
        const file = path.join(dir, 'engine-spend.json');
        fs.writeFileSync(file, '{ not json');
        await expect(new SpendLedger(file, 10, 3).reserve('run-a', 0.01)).rejects.toMatchObject({ code: 'ENGINE_BUDGET_LEDGER' });
    });

    it('a paid model without a total budget is not started', async () => {
        expect(ledgerFromEnv({})).toMatchObject({ error: expect.stringMatching(/JOE_ENGINE_BUDGET_USD/) });
        const choice = engineModelChoice({ JOE_ENGINE_PROVIDER: 'anthropic', JOE_ENGINE_MODEL: HAIKU });
        expect(choice).toMatchObject({ provider: 'anthropic', model: HAIKU });
        const brain = await engineBrain(choice as any, { runId: 'r' }, signal, later(), { JOE_ENGINE_PROVIDER: 'anthropic', JOE_ENGINE_MODEL: HAIKU, JOE_ENGINE_ANTHROPIC_API_KEY: 'sk-test-not-real' });
        expect(brain).toMatchObject({ error: expect.stringMatching(/JOE_ENGINE_BUDGET_USD/) });
    });
});

/* ───────────────────────────── the key ───────────────────────────── */

describe('the key comes from the owner\'s file, and only this connector reads it', () => {
    it('reads ANTHROPIC_API_KEY=... and ignores comments, quotes, a BOM and CRLF', () => {
        expect(keyFromFileText('﻿# Joe\r\nANTHROPIC_API_KEY="sk-ant-abc"\r\n')).toBe('sk-ant-abc');
        expect(keyFromFileText('sk-ant-bare\n')).toBe('sk-ant-bare');
        expect(keyFromFileText('# nothing here\n')).toBe('');
    });

    it('a missing or empty key file is reported without any key text', async () => {
        const dir = tempDir();
        const empty = path.join(dir, 'anthropic.env');
        fs.writeFileSync(empty, '# put the key here\n');
        const s = await anthropicSettings({ JOE_ENGINE_MODEL: HAIKU, JOE_ENGINE_ANTHROPIC_KEY_FILE: empty });
        expect('error' in s && s.error).toMatch(/holds no key/);
        const gone = await anthropicSettings({ JOE_ENGINE_MODEL: HAIKU, JOE_ENGINE_ANTHROPIC_KEY_FILE: path.join(dir, 'missing.env') });
        expect('error' in gone && gone.error).toMatch(/cannot be read \(ENOENT\)/);
    });

    it('the router\'s environment key is never used: without the connector\'s own key the run does not start', async () => {
        const s = await anthropicSettings({ JOE_ENGINE_MODEL: HAIKU, ANTHROPIC_API_KEY: 'sk-ant-global' });
        expect('error' in s && s.error).toMatch(/JOE_ENGINE_ANTHROPIC_KEY_FILE/);
    });

    it('keeps Haiku under the price step: its window defaults below 100,000 tokens', async () => {
        const s = await anthropicSettings({ JOE_ENGINE_MODEL: HAIKU, JOE_ENGINE_ANTHROPIC_API_KEY: 'k' });
        expect('error' in s ? 0 : s.contextTokens).toBeLessThan(100_000);
    });
});

/* ───────────────────────────── the request ───────────────────────────── */

describe('the conversation is sent so the cache can serve it', () => {
    const history: ChatMessage[] = [
        { role: 'system', content: 'You are Joe.' },
        { role: 'user', content: 'Build a page.' },
        {
            role: 'assistant', content: 'Writing it.',
            tool_calls: [
                { id: 't1', type: 'function', function: { name: 'file_write', arguments: '{"path":"a"}' } },
                { id: 't2', type: 'function', function: { name: 'file_write', arguments: '{"path":"b"}' } },
            ],
            native: [
                { type: 'thinking', thinking: '', signature: 'sig-1' },
                { type: 'text', text: 'Writing it.' },
                { type: 'tool_use', id: 't1', name: 'file_write', input: { path: 'a' } },
                { type: 'tool_use', id: 't2', name: 'file_write', input: { path: 'b' } },
            ],
        },
        { role: 'tool', tool_call_id: 't1', content: 'wrote a' },
        { role: 'tool', tool_call_id: 't2', content: 'wrote b\n\n[Status · step 1]' },
        { role: 'user', content: [{ type: 'text', text: 'The screenshot:' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } }] },
    ];

    it('the system prompt is one cached block, and the tool results return together, before the screenshot', () => {
        const req = toAnthropicRequest(history);
        expect(req.system).toEqual([{ type: 'text', text: 'You are Joe.', cache_control: { type: 'ephemeral' } }]);
        expect(req.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
        const last = req.messages[2].content;
        expect(last.map((b: any) => b.type)).toEqual(['tool_result', 'tool_result', 'text', 'image']);
        expect(last[3]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } });
    });

    it('the assistant turn is replayed exactly as the API returned it, thinking included', () => {
        const req = toAnthropicRequest(history);
        expect(req.messages[1].content).toEqual((history[2] as any).native);
    });

    it('a turn whose thinking no longer matches its history is replayed without it', () => {
        const req = toAnthropicRequest(history, { dropThinking: () => true });
        expect(req.messages[1].content.map((b: any) => b.type)).toEqual(['text', 'tool_use', 'tool_use']);
    });

    it('the same history always gives the same bytes', () => {
        expect(JSON.stringify(toAnthropicRequest(history))).toBe(JSON.stringify(toAnthropicRequest(JSON.parse(JSON.stringify(history)))));
    });

    it('never ends on an assistant turn, which the newest models refuse as a prefill', () => {
        const req = toAnthropicRequest(history.slice(0, 3));
        expect(req.messages[req.messages.length - 1].role).toBe('user');
    });

    it('turns thinking off only the way each model accepts', () => {
        expect(thinkingFor(HAIKU, false)).toEqual({ type: 'disabled' });
        expect(thinkingFor('claude-sonnet-5-5', false)).toEqual({ type: 'between_tools' });
        expect(thinkingFor('claude-opus-5-5', false)).toEqual({ type: 'adaptive' });
        expect(thinkingFor(HAIKU, false, 'max')).toEqual({ type: 'adaptive' });
        expect(thinkingFor(HAIKU, true)).toEqual({ type: 'adaptive' });
    });
});

/* ───────────────────────────── the connector ───────────────────────────── */

describe('one engine step through the connector', () => {
    const base: ChatMessage[] = [{ role: 'system', content: 'You are Joe.' }, { role: 'user', content: 'Build a page.' }];

    it('sends tools with eager streaming and two cache breakpoints, and charges what was billed', async () => {
        const l = ledger();
        const { client, sent } = fakeClient([{ message: message([{ type: 'text', text: 'ok' }, toolUse('tu1', 'file_write', { path: 'a' })]) }]);
        const model = anthropicModel({ settings: settings(), ledger: l, runId: 'run-a', client });
        const step = await model.step(base, tools, { signal, deadlineAt: later() });

        expect(sent[0]).toMatchObject({
            model: HAIKU, max_tokens: 8_000, thinking: { type: 'adaptive' }, cache_control: { type: 'ephemeral' },
            system: [{ type: 'text', text: 'You are Joe.', cache_control: { type: 'ephemeral' } }],
            tools: [{ name: 'file_write', input_schema: tools[0].function.parameters, eager_input_streaming: true }],
        });
        expect(step.toolCalls).toEqual([{ id: 'tu1', name: 'file_write', arguments: '{"path":"a"}' }]);
        expect(step.text).toBe('ok');
        expect(step.usage?.costUsd).toBeCloseTo(0.0002, 10);
        expect(model.spentUsd).toBeCloseTo(0.0002, 10);
        expect((await l.spent('run-a')).runUsd).toBeCloseTo(0.0002, 10);
    });

    it('hands the loop the raw argument text, so a cut argument is caught instead of run half-parsed', async () => {
        const { client } = fakeClient([{ message: message([toolUse('tu1', 'file_write', { path: 'a' }, '{"path": "a", "content": "<h1>unfinished')]) }]);
        const model = anthropicModel({ settings: settings(), ledger: ledger(), runId: 'run-a', client });
        const step = await model.step(base, tools, { signal, deadlineAt: later() });
        expect(() => JSON.parse(step.toolCalls[0].arguments)).toThrow();
    });

    it('a reply cut at the output limit is charged and reported as COMPLETION_LIMIT, never run', async () => {
        const l = ledger();
        const { client } = fakeClient([{ message: message([toolUse('tu1', 'file_write', { path: 'a' })], { stop: 'max_tokens' }) }]);
        const model = anthropicModel({ settings: settings(), ledger: l, runId: 'run-a', client });
        await expect(model.step(base, tools, { signal, deadlineAt: later() })).rejects.toMatchObject({ code: 'COMPLETION_LIMIT' });
        expect((await l.spent('run-a')).runUsd).toBeGreaterThan(0);
    });

    it('a refusal is reported as MODEL_REFUSAL, with its details', async () => {
        const { client } = fakeClient([{ message: message([{ type: 'text', text: '' }], { stop: 'refusal', stop_details: { category: 'cyber' } }) }]);
        const model = anthropicModel({ settings: settings(), ledger: ledger(), runId: 'run-a', client });
        await expect(model.step(base, tools, { signal, deadlineAt: later() })).rejects.toMatchObject({ code: 'MODEL_REFUSAL', message: expect.stringMatching(/cyber/) });
    });

    it('no request leaves when the budget cannot cover its worst case', async () => {
        const { client, calls } = fakeClient([{ message: message([{ type: 'text', text: 'never' }]) }]);
        const model = anthropicModel({ settings: settings({ maxTokens: 64_000 }), ledger: ledger(0.01, 3), runId: 'run-a', client });
        await expect(model.step(base, tools, { signal, deadlineAt: later() })).rejects.toMatchObject({ code: 'ENGINE_BUDGET_EXHAUSTED' });
        expect(calls()).toBe(0);
    });

    it('a call that broke after the API began answering is charged its worst case; one refused before that costs nothing', async () => {
        const l = ledger();
        const { client } = fakeClient([{ breakMidAnswer: new Error('socket hang up') }, { error: { status: 529, message: 'Overloaded' } }]);
        const model = anthropicModel({ settings: settings(), ledger: l, runId: 'run-a', client });
        await expect(model.step(base, tools, { signal, deadlineAt: later() })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE' });
        const afterBreak = (await l.spent('run-a')).runUsd;
        expect(afterBreak).toBeGreaterThan(0);
        await expect(model.step(base, tools, { signal, deadlineAt: later() })).rejects.toMatchObject({ code: 'PROVIDER_FAILURE', status: 529 });
        expect((await l.spent('run-a')).runUsd).toBe(afterBreak);
    });

    it('maps the API\'s refusals to codes the loop acts on', () => {
        expect(mapApiError({ status: 401, message: 'invalid x-api-key' })).toMatchObject({ code: 'MODEL_AUTH' });
        expect(mapApiError({ status: 400, message: 'prompt is too long: 1000001 tokens > 1000000 maximum' })).toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
        expect(mapApiError({ status: 400, message: 'Your credit balance is too low to access the Anthropic API.' })).toMatchObject({ code: 'MODEL_BILLING' });
        expect(mapApiError({ status: 404, message: 'model: claude-x' })).toMatchObject({ code: 'MODEL_NOT_FOUND' });
    });

    it('replays each turn with its thinking while the history only grows, and drops it once the history is edited', async () => {
        const turn = (id: string, sig: string) => message([{ type: 'thinking', thinking: '', signature: sig }, toolUse(id, 'file_write', { path: id })]);
        const { client, sent } = fakeClient([{ message: turn('a', 's1') }, { message: turn('b', 's2') }, { message: turn('c', 's3') }]);
        const model = anthropicModel({ settings: settings(), ledger: ledger(), runId: 'run-a', client });
        const history: ChatMessage[] = [...base];
        const take = async () => {
            const step = await model.step([...history], tools, { signal, deadlineAt: later() });
            history.push({ role: 'assistant', content: step.text, tool_calls: step.toolCalls.map(tc => ({ id: tc.id, type: 'function' as const, function: { name: tc.name, arguments: tc.arguments } })), native: step.native });
            history.push({ role: 'tool', tool_call_id: step.toolCalls[0].id, content: 'done' });
        };
        await take();
        await take();
        // Append-only: the first turn's thinking is replayed.
        expect(sent[1].messages[1].content[0]).toEqual({ type: 'thinking', thinking: '', signature: 's1' });
        // The loop compacts: the middle is replaced by a summary.
        history.splice(2, 2, { role: 'user', content: '[Earlier work, summarised]' });
        await take();
        const third = sent[2].messages;
        const thinkingLeft = third.flatMap((m: any) => m.content).filter((b: any) => b.type === 'thinking');
        expect(thinkingLeft).toEqual([]);
        expect(third.flatMap((m: any) => m.content).filter((b: any) => b.type === 'tool_use').map((b: any) => b.id)).toEqual(['b']);
    });

    it('when the API says a thinking block belongs to another history, it asks once more without any', async () => {
        const { client, sent } = fakeClient([
            { message: message([{ type: 'thinking', thinking: '', signature: 's1' }, toolUse('a', 'file_write', { path: 'a' })]) },
            { error: { status: 400, message: 'messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation.' } },
            { message: message([{ type: 'text', text: 'fine' }]) },
        ]);
        const model = anthropicModel({ settings: settings(), ledger: ledger(), runId: 'run-a', client });
        const first = await model.step(base, tools, { signal, deadlineAt: later() });
        const history: ChatMessage[] = [...base,
            { role: 'assistant', content: '', tool_calls: [{ id: 'a', type: 'function', function: { name: 'file_write', arguments: '{"path":"a"}' } }], native: first.native },
            { role: 'tool', tool_call_id: 'a', content: 'done' }];
        const second = await model.step(history, tools, { signal, deadlineAt: later() });
        expect(second.text).toBe('fine');
        expect(sent[1].messages[1].content[0].type).toBe('thinking');
        expect(sent[2].messages[1].content.map((b: any) => b.type)).toEqual(['tool_use']);
    });
});

/* ───────────────────────────── the whole loop ───────────────────────────── */

describe('a whole run on the paid model', () => {
    const writeTool: EngineTool<{ path: string; content: string }> = {
        name: 'file_write', description: 'write a file',
        parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
        parse(a: any) { return a && typeof a.path === 'string' && typeof a.content === 'string' ? { ok: true, value: a } : { ok: false, error: 'file_write needs "path" and "content".' }; },
        async run(a, ctx) {
            fs.writeFileSync(path.join(ctx.projectDir, a.path), a.content);
            return { ok: true, output: `wrote ${a.path}`, facts: { filesChanged: [{ path: a.path, change: 'created' }] } };
        },
    };
    const verifier: Verifier = async (ctx) => {
        const ok = fs.existsSync(path.join(ctx.projectDir, 'index.html'));
        return { passed: ok, checks: [{ id: 'files', status: ok ? 'passed' : 'failed', detail: ok ? 'index.html exists' : 'no index.html' }], unproven: [], at: 0 };
    };
    const processes: ProcessRegistry = {
        async start(spec) { return { name: spec.name, command: spec.command, cwd: spec.cwd, running: true, startedAt: 0, output: '' }; },
        logs() { return undefined; }, async stop() { return true; }, list() { return []; }, async stopAll() { /* none */ },
    };
    const deps = (model: any): EngineDeps => ({
        model, tools: [planUpdateTool, writeTool, finishTool(verifier)], processes,
        browser: () => { throw new Error('not used'); }, machine: { platform: 'linux', shell: 'bash' },
    });

    it('is delivered, and its record says what it cost', async () => {
        const dir = tempDir('joe-engine-paid-run-');
        const { client } = fakeClient([
            { message: message([toolUse('a', 'file_write', { path: 'index.html', content: '<h1>Hi</h1>' })]) },
            { message: message([toolUse('b', 'task_finish', { summary: 'Done.' })]) },
        ]);
        const l = ledger();
        const model = anthropicModel({ settings: settings(), ledger: l, runId: 'run-paid', client });
        const events: EngineEvent[] = [];
        const result = await runEngine({ runId: 'run-paid', request: 'Build a page', language: 'en', projectDir: dir, deadlineAt: later(), signal, emit: e => events.push(e), joe: {} }, deps(model));
        expect(result.status).toBe('delivered');
        const record = JSON.parse(fs.readFileSync(path.join(dir, '.joe', 'result.json'), 'utf8'));
        expect(record.costUsd).toBeCloseTo(0.0004, 10);
        expect((await l.spent('run-paid')).runUsd).toBeCloseTo(0.0004, 10);
    });

    it('stops at once, and says so, when the budget runs out', async () => {
        const dir = tempDir('joe-engine-paid-run-');
        // The first call may cost up to ~$0.033 (64k output tokens) and is billed $0.025;
        // what is left of the run's $0.05 cannot cover a second call's worst case.
        const { client, calls } = fakeClient([{ message: message([toolUse('a', 'file_write', { path: 'x.txt', content: 'x' })], { usage: { input_tokens: 1_000, output_tokens: 50_000 } }) }]);
        const l = ledger(10, 0.05);
        const model = anthropicModel({ settings: settings({ maxTokens: 64_000 }), ledger: l, runId: 'run-poor', client });
        const result = await runEngine({ runId: 'run-poor', request: 'Build a page', language: 'en', projectDir: dir, deadlineAt: later(), signal, emit: () => undefined, joe: {} }, deps(model));
        expect(result.status).toBe('failed');
        expect(result.reason).toMatch(/ENGINE_BUDGET_EXHAUSTED/);
        expect(calls()).toBe(1);
    });
});
