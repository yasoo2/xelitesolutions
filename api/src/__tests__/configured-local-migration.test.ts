import fs from 'fs';
import os from 'os';
import path from 'path';
import { exactEngineeringModel, engineeringScope, issueEngineeringContext } from '../modules/services/AutonomousEngineeringPolicy';
import { localReasoningOptions } from '../core/llm/providers/local';
import { describeImageAttachments } from '../shared/vision';

jest.mock('../shared/ocr', () => ({ extractImageText: jest.fn(async () => '') }));
jest.mock('../core/resources/RequestResourceManager', () => ({ requestResourceManager: {
    withInference: async (work: any, admission: any) => work({ signal: admission.signal, contextTokens: 4096, outputTokens: admission.requestedOutputTokens }),
    withHeavy: async (work: any) => work(),
    withLocalModelCall: async (work: any) => work(),
    currentSignal: () => undefined,
} }));
const model = 'qwen3.5:9b-joe-q4_K_M';
const endpoint = 'http://127.0.0.1:11434/v1';
const keys = ['LOCAL_LLM_MODEL', 'LOCAL_LLM_STRICT', 'LOCAL_LLM_REASONING_EFFORT', 'LOCAL_LLM_BASE_URL', 'JOE_VISION_BASE_URL', 'JOE_VISION_MODEL'];
let saved: Record<string, string | undefined>;
const originalFetch = global.fetch;
beforeEach(() => { saved = Object.fromEntries(keys.map(k => [k, process.env[k]])); keys.forEach(k => delete process.env[k]); });
afterEach(() => { global.fetch = originalFetch; keys.forEach(k => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

test('all strict internal task types retain the selected primary instead of an older installed coder', async () => {
    process.env.LOCAL_LLM_MODEL = model; process.env.LOCAL_LLM_STRICT = '1'; process.env.LOCAL_LLM_BASE_URL = endpoint;
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ models: [{ name: 'qwen2.5-coder:7b' }, { name: model }] }) })) as any;
    const brain = await import('../core/llm/local-brain'); await brain.detectLocalModels();
    for (const type of ['chat', 'code_generation', 'data_analysis', undefined]) expect(brain.pickLocalModel(type, 'small_text')).toBe(model);
    process.env.LOCAL_LLM_MODEL = 'missing-local:9b';
    expect(brain.pickLocalModel('code_generation')).toBe('missing-local:9b'); // fail at the configured endpoint, never downgrade
});

test('migration scope admits only the exact configured local model and binds its identity to the issued token', () => {
    process.env.LOCAL_LLM_MODEL = model;
    const context = { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', modelConfig: { provider: 'local', model, baseUrl: endpoint } };
    expect(exactEngineeringModel(context.modelConfig)).toBe(true);
    expect(exactEngineeringModel({ ...context.modelConfig, model: 'qwen2.5-coder:7b' })).toBe(false);
    const issued = issueEngineeringContext(context, { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root: path.resolve('owned-fixture'), request: 'Build a task agent' }, () => false, 1000);
    expect(engineeringScope(issued, 1000)?.model).toBe(model);
    process.env.LOCAL_LLM_MODEL = 'another-local:9b';
    expect(engineeringScope(issued, 1000)?.model).toBe(model);
    expect(engineeringScope({ ...issued, modelConfig: { ...issued.modelConfig, model: 'another-local:9b' } }, 1000)).toBeNull();
});

test.each(['qwen3.5:9b-cloud', 'auto', 'bad model'])('unsupported configured model %s never receives engineering authority', configured => {
    process.env.LOCAL_LLM_MODEL = configured;
    expect(exactEngineeringModel({ provider: 'local', model: configured, baseUrl: endpoint })).toBe(false);
});

test('migration never expands model authority to remote, paid, Auto, inherited or accessor configurations', () => {
    process.env.LOCAL_LLM_MODEL = model;
    for (const value of [{ provider: 'auto', model, baseUrl: endpoint }, { provider: 'nvidia', model, baseUrl: endpoint }, { provider: 'local', model, baseUrl: 'https://remote.invalid/v1' }, Object.create({ provider: 'local', model, baseUrl: endpoint })]) expect(exactEngineeringModel(value)).toBe(false);
    const getter = jest.fn(); expect(exactEngineeringModel(Object.defineProperty({ provider: 'local', baseUrl: endpoint }, 'model', { get: getter }))).toBe(false); expect(getter).not.toHaveBeenCalled();
});

test('the configured no-thinking profile stays limited to local Qwen3 and never leaks to another endpoint', () => {
    process.env.LOCAL_LLM_REASONING_EFFORT = 'none';
    expect(localReasoningOptions(model, endpoint)).toEqual({ reasoning_effort: 'none' });
    for (const base of ['https://remote.invalid/v1', 'http://127.0.0.1:5000/v1', endpoint + '?x=1']) expect(localReasoningOptions(model, base)).toEqual({});
    expect(localReasoningOptions('qwen2.5-coder:7b', endpoint)).toEqual({});
    expect(localReasoningOptions(model, endpoint, 'high' as any)).toEqual({});
    expect(localReasoningOptions(model, endpoint, 'medium' as any)).toEqual({});
});

test.each([true, false])('strict local screenshots preserve pixels and never try cloud fallback after local success=%s', async succeeds => {
    process.env.LOCAL_LLM_MODEL = model; process.env.LOCAL_LLM_STRICT = '1'; process.env.LOCAL_LLM_BASE_URL = endpoint;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-model-migration-'));
    const image = path.join(directory, 'screen.png'); const bytes = Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'); fs.writeFileSync(image, bytes);
    const calls: any[] = [];
    global.fetch = jest.fn(async (url: any, init: any) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return new Response(JSON.stringify({
        done: true, done_reason: 'stop', prompt_eval_count: 1200, eval_count: 12,
        message: { role: 'assistant', content: 'A green square on a small screen.' },
    }), { status: succeeds ? 200 : 500 }); }) as any;
    const attachment = { name: 'screen.png', mimeType: 'image/png', path: image, size: bytes.length, content: '' };
    const result = await describeImageAttachments([attachment], { language: 'en', groqApiKey: 'test-only-not-a-real-key' });
    expect(result.described).toBe(succeeds ? 1 : 0); expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://127.0.0.1:11434/api/chat'); expect(calls[0].body.model).toBe(model);
    expect(calls[0].body.think).toBe(false);
    expect(calls[0].body.keep_alive).toBe('5m');
    expect(calls[0].body.options.num_ctx).toBeGreaterThanOrEqual(2048);
    expect(calls[0].body.options.num_ctx).toBeLessThanOrEqual(8192);
    expect(calls[0].body.options.num_predict).toBeGreaterThan(0);
    expect(calls[0].body.truncate).toBe(false); expect(calls[0].body.shift).toBe(false);
    expect(calls[0].body.messages[0].images[0]).toBe(bytes.toString('base64'));
    // Retain the small owned fixture as test evidence; never remove shared cache data.
});

test('strict local image mode rejects a remote override before sending any pixels', async () => {
    process.env.LOCAL_LLM_STRICT = '1'; process.env.JOE_VISION_BASE_URL = 'https://remote.invalid/v1'; process.env.JOE_VISION_MODEL = model;
    global.fetch = jest.fn() as any;
    const result = await describeImageAttachments([{ name: 'screen.png', mimeType: 'image/png', path: 'missing-fixture.png', size: 1, content: '' }]);
    expect(result.described).toBe(0); expect(global.fetch).not.toHaveBeenCalled();
});
