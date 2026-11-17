/**
 * LOCAL (OLLAMA), END TO END, AGAINST A FAKE THAT SPEAKS ITS WIRE.
 *
 * The laptop's Ollama (0.40.16) holds one model the owner may pick, moondream,
 * and it cannot call tools. Measured 2026-11-17: Connect went green (a chat
 * needs no tools), and every run on it ended «the model call failed 3 times in
 * a row: Local inference returned HTTP 400.» — Ollama's «does not support
 * tools» was classified for the log and the run never said it. A model that
 * can call tools runs the same engine to delivery over the same transport.
 *
 * The fake stands in for 127.0.0.1:11434 (the real server is not touched): the
 * managed transport's loopback fetch is pointed at it, and nothing else in the
 * chain is replaced.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ollamaFake, routeVendorsTo, type FakeServer } from './fixtures/provider-wire';

let mockOllamaBase = '';
jest.mock('../core/llm/providers/loopback-fetch', () => {
    const actual = jest.requireActual('../core/llm/providers/loopback-fetch');
    return { ...actual, localInferenceFetch: () => (url: string, init: any) => actual.loopbackFetch(String(url).replace('http://127.0.0.1:11434', mockOllamaBase), init) };
});

import { runEngine, type EngineDeps } from '../core/engine/loop';
import { planUpdateTool } from '../core/engine/plan';
import { finishTool, type Verifier } from '../core/engine/finish';
import { engineModelChoiceFor, engineBrain, managedModel } from '../core/engine/model';
import { providerModels } from '../core/engine/provider-models';
import { verifyProviderDirect } from '../core/llm/intelligent-router';
import type { BrowserSession, EngineRequest, ProcessRegistry, VerificationReport } from '../core/engine/types';

let l: FakeServer;
let undo: () => void;
const roots: string[] = [];
let quiet: jest.SpyInstance[] = [];
const window = process.env.LOCAL_WINDOW_BYTES_PER_TOKEN;

beforeAll(async () => {
    l = await ollamaFake();
    mockOllamaBase = l.base;
    undo = routeVendorsTo({ 'http://127.0.0.1:11434': l.base });
    //  The context window follows free memory; a server-sized window, whatever this machine has free.
    process.env.LOCAL_WINDOW_BYTES_PER_TOKEN = '4096';
});
afterAll(async () => {
    undo();
    await l.close();
    if (window === undefined) delete process.env.LOCAL_WINDOW_BYTES_PER_TOKEN; else process.env.LOCAL_WINDOW_BYTES_PER_TOKEN = window;
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});
beforeEach(() => { l.hits.length = 0; quiet = (['log', 'info', 'warn', 'error'] as const).map(m => jest.spyOn(console, m).mockImplementation(() => undefined)); });
afterEach(() => quiet.forEach(s => s.mockRestore()));

const chats = () => l.hits.filter(h => h.path === '/api/chat');
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
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-local-'));
    roots.push(dir);
    return { runId: 'local-run', request: 'Build a page with a booking button', language: 'en', projectDir: dir, deadlineAt: Date.now() + 10 * 60_000, signal: new AbortController().signal, emit: () => undefined, joe: {} };
}
const choose = (model: string): any => engineModelChoiceFor({ provider: 'local', model, apiKey: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' });

it('the panel lists the installed models, and the light check finds the chosen one', async () => {
    expect(await providerModels({ provider: 'local' })).toMatchObject({ source: 'live', models: ['moondream:latest', 'toolful:latest'] });
    expect(await verifyProviderDirect('local', { apiKey: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'moondream:latest', light: true })).toMatchObject({ ok: true });
});

it('a run on a model that cannot call tools ends at once and says so', async () => {
    const brain: any = await engineBrain(choose('moondream:latest'), {}, new AbortController().signal, Date.now() + 60_000);
    const result = await runEngine(request(), deps(brain.model));
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/cannot go on \(OLLAMA_MODEL_NO_TOOLS\): The local model moondream:latest cannot call tools/);
    expect(chats()).toHaveLength(1);
    //  The server's own text stays out of what Joe says.
    expect(result.reason).not.toMatch(/registry\.ollama\.ai/);
});

it('a model that is not installed is said at once too', async () => {
    const result = await runEngine(request(), deps(managedModel(choose('gone:latest'), false)));
    expect(result.reason).toMatch(/cannot go on \(OLLAMA_MODEL_MISSING\): The local model gone:latest is not installed/);
    expect(chats()).toHaveLength(1);
});

it('a model with tools runs the engine to delivery: native tool calls, results answered by id', async () => {
    const result = await runEngine(request(), deps(managedModel(choose('toolful:latest'), false)));
    expect(result).toMatchObject({ status: 'delivered' });
    const second = chats()[1].body;
    expect(second.tools.map((t: any) => t.function.name)).toEqual(expect.arrayContaining(['plan_update', 'task_finish']));
    const call = second.messages.find((m: any) => m.role === 'assistant').tool_calls[0];
    expect(call.function.arguments).toEqual({ steps: [{ title: 'build it', status: 'in_progress' }] });
    expect(second.messages.find((m: any) => m.role === 'tool').tool_call_id).toBe(call.id);
});
