'use strict';

// Actual current router and answer modules; SDK/clock are inert and no ambient
// environment or provider network is admitted by the closed fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { newFixture, sourceReads } = require('./closed-local-answer-fixture.cjs');
const rows = [];
const analysis = { type: 'simple_chat', complexity: 'low', requiresTools: false, estimatedTokens: 50, language: 'en', hasImages: false };
const selected = { provider: 'groq', apiKey: 'synthetic-sdk-key', model: 'selected-model', baseUrl: 'https://api.groq.com/openai/v1' };
const answer = content => ({ choices: [{ finish_reason: 'stop', message: { content } }] });
const stream = (content, finish = 'stop') => ({ async *[Symbol.asyncIterator]() {
  yield { choices: [{ delta: { content }, finish_reason: null }] };
  yield { choices: [{ delta: {}, finish_reason: finish }] };
} });
function fixture(behavior, env = {}) { return newFixture({ AI_FREE_PROVIDERS: 'groq', ...env }, behavior); }
function invoke(f, options = {}) {
  return f.router.routeToModel([{ role: 'user', content: 'Give a concise explanation of gravity.' }], analysis,
    undefined, options.onPartial, undefined, undefined, options.tools,
    { purpose: 'answer', engineeringPipeline: true, modelConfig: selected, ...options.context });
}
function closed(f) {
  assert.equal(f.observations.violations.length, 0);
  assert.equal(f.observations.adapterCalls.length, 0);
  assert.equal(f.observations.metadata.length, 0);
  assert.equal(f.timers.size, 0);
  assert.ok(f.observations.constructors.every(c => c.maxRetries === 0));
}
async function check(name, run) {
  try { await run(); rows.push({ name, status: 'PASS' }); }
  catch (error) { rows.push({ name, status: 'FAIL', error: String(error?.message || error) }); }
}
(async () => {
  await check('Buffered selected free provider receives the caller output budget', async () => {
    const f = fixture(() => Promise.resolve(answer('Gravity attracts masses.')));
    assert.equal(await invoke(f, { context: { maxCompletionTokens: 128 } }), 'Gravity attracts masses.');
    assert.equal(f.observations.sdk.length, 1);
    assert.equal(f.observations.sdk[0].body.max_tokens, 128);
    assert.equal(f.observations.sdk[0].body.max_completion_tokens, undefined);
    assert.equal(f.observations.sdk[0].body.model, selected.model);
    assert.equal(f.observations.constructors[0].baseURL, selected.baseUrl); closed(f);
  });
  await check('Streaming selected provider uses the same budget and forwards actual deltas', async () => {
    const f = fixture(() => Promise.resolve(stream('Gravity attracts masses.'))), deltas = [];
    assert.equal(await invoke(f, { context: { maxCompletionTokens: 32 }, onPartial: d => deltas.push(d) }), 'Gravity attracts masses.');
    assert.deepEqual(deltas, ['Gravity attracts masses.']);
    assert.equal(f.observations.sdk.length, 1); assert.equal(f.observations.sdk[0].body.stream, true);
    assert.equal(f.observations.sdk[0].body.max_tokens, 32); closed(f);
  });
  await check('Unsupported stream keeps budget, controller and deadline on its one buffered retry', async () => {
    const f = fixture(e => e.index === 0 ? Promise.reject(Object.assign(new Error('stream unsupported'), { status: 400 })) : Promise.resolve(answer('Complete.')));
    assert.equal(await invoke(f, { context: { maxCompletionTokens: 16, providerTimeoutMs: 9000 }, onPartial: () => {} }), 'Complete.');
    assert.equal(f.observations.sdk.length, 2);
    assert.ok(f.observations.sdk.every(c => c.body.max_tokens === 16 && c.requestOptions.timeout === 9000));
    assert.equal(f.observations.sdk[0].requestOptions.signal, f.observations.sdk[1].requestOptions.signal); closed(f);
  });
  for (const [value, expected] of [[0.5, 1], [31.9, 31], [100000, 12000], ['8', 8]]) {
    await check(`Positive budget ${JSON.stringify(value)} is an integer bounded to ${expected}`, async () => {
      const f = fixture(); await invoke(f, { context: { maxCompletionTokens: value } });
      assert.equal(f.observations.sdk[0].body.max_tokens, expected); closed(f);
    });
  }
  for (const value of [undefined, null, 0, -1, NaN, Infinity, 'invalid']) {
    await check(`Invalid or missing budget ${String(value)} preserves existing uncapped behavior`, async () => {
      const f = fixture(); await invoke(f, { context: { maxCompletionTokens: value } });
      assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'max_tokens'), false);
      assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'max_completion_tokens'), false); closed(f);
    });
  }
  await check('Official OpenAI uses max_completion_tokens for an o-series model', async () => {
    const f = fixture(undefined, { AI_COST_POLICY: 'allow_paid' }); // Inert SDK only, never a paid request.
    await invoke(f, { context: { modelConfig: { provider: 'openai', model: 'o3', apiKey: 'synthetic-sdk-key' }, maxCompletionTokens: 128 } });
    assert.equal(f.observations.sdk.length, 1); assert.equal(f.observations.sdk[0].body.max_completion_tokens, 128);
    assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'max_tokens'), false); closed(f);
  });
  await check('OpenAI alias at a different compatible endpoint keeps max_tokens', async () => {
    const f = fixture(undefined, { AI_COST_POLICY: 'allow_paid' });
    await invoke(f, { context: { modelConfig: { provider: 'openai', model: 'vendor-model', apiKey: 'synthetic-sdk-key', baseUrl: 'https://integrate.api.nvidia.com/v1' }, maxCompletionTokens: 64 } });
    assert.equal(f.observations.sdk[0].body.max_tokens, 64);
    assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'max_completion_tokens'), false); closed(f);
  });
  await check('Tool calling keeps its schema, one buffered request and bounded output', async () => {
    const tools = [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }];
    const calls = [{ id: 'fixture-call', type: 'function', function: { name: 'read_file', arguments: '{"path":"notes.txt"}' } }];
    const f = fixture(() => Promise.resolve({ choices: [{ finish_reason: 'tool_calls', message: { tool_calls: calls } }] }));
    const result = JSON.parse(await invoke(f, { context: { maxCompletionTokens: 256 }, tools, onPartial: () => {} }));
    assert.deepEqual(result, { type: 'tool_calls', tool_calls: calls });
    assert.equal(f.observations.sdk.length, 1); assert.equal(f.observations.sdk[0].body.tools, tools);
    assert.equal(f.observations.sdk[0].body.tool_choice, 'auto'); assert.equal(f.observations.sdk[0].body.max_tokens, 256); closed(f);
  });
  await check('Capped truncated buffered text fails instead of claiming complete or falling back', async () => {
    const f = fixture(() => Promise.resolve({ choices: [{ finish_reason: 'length', message: { content: 'Incomplete explanation' } }] }));
    const result = await invoke(f, { context: { maxCompletionTokens: 4 } });
    assert.ok(result.startsWith(f.router.PROVIDER_FAILURE_PREFIX)); assert.match(result, /completion_limit/);
    assert.equal(f.observations.sdk.length, 1); assert.doesNotMatch(result, /Incomplete explanation/); closed(f);
  });
  await check('Capped truncated stream fails with no buffered request or provider fallback', async () => {
    const f = fixture(() => Promise.resolve(stream('Incomplete', 'length'))), deltas = [];
    const result = await invoke(f, { context: { maxCompletionTokens: 4 }, onPartial: d => deltas.push(d) });
    assert.ok(result.startsWith(f.router.PROVIDER_FAILURE_PREFIX)); assert.match(result, /completion_limit/);
    assert.deepEqual(deltas, ['Incomplete']); assert.equal(f.observations.sdk.length, 1); closed(f);
  });
  await check('Truncated tool arguments never become executable tool-call output', async () => {
    const f = fixture(() => Promise.resolve({ choices: [{ finish_reason: 'length', message: { tool_calls: [{ function: { name: 'read_file', arguments: '{' } }] } }] }));
    const result = await invoke(f, { context: { maxCompletionTokens: 4 }, tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }] });
    assert.ok(result.startsWith(f.router.PROVIDER_FAILURE_PREFIX)); assert.doesNotMatch(result, /tool_calls/);
    assert.equal(f.observations.sdk.length, 1); closed(f);
  });
  await check('Strict connection check reports truncation honestly and releases its timer', async () => {
    const f = fixture(() => Promise.resolve({ choices: [{ finish_reason: 'length', message: { content: 'O' } }] }));
    await assert.rejects(invoke(f, { context: { maxCompletionTokens: 1, strictProviderCheck: true } }), /direct_provider_check_failed: completion limit reached/);
    assert.equal(f.observations.sdk.length, 1); closed(f);
  });
  await check('Pre-aborted owner cannot dispatch a custom request', async () => {
    const owner = new AbortController(); owner.abort(new Error('private owner reason')); const f = fixture();
    await assert.rejects(invoke(f, { context: { maxCompletionTokens: 16, signal: owner.signal } }), /private owner reason/);
    assert.equal(f.observations.sdk.length, 0); closed(f);
  });
  await check('Caller cancellation of a stream cannot start a buffered retry', async () => {
    const owner = new AbortController();
    const f = fixture(event => new Promise((_, reject) => event.requestOptions.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const pending = invoke(f, { context: { maxCompletionTokens: 16, signal: owner.signal }, onPartial: () => {} });
    for (let i = 0; i < 20 && !f.observations.sdk.length; i++) await Promise.resolve();
    assert.equal(f.observations.sdk.length, 1); owner.abort(); await assert.rejects(pending, /abort|cancel/i);
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); assert.equal(f.observations.sdk.length, 1); closed(f);
  });
  await check('A cap does not change free-only authorization for an explicit paid provider', async () => {
    const f = fixture();
    await assert.rejects(invoke(f, { context: { maxCompletionTokens: 16, modelConfig: { provider: 'openai', model: 'o3', apiKey: 'synthetic-sdk-key' }, strictProviderCheck: true } }), /free_only/);
    assert.equal(f.observations.sdk.length, 0); closed(f);
  });
  await check('Completion-limit failure does not leak synthetic credential or content', async () => {
    const f = fixture(() => Promise.resolve({ choices: [{ finish_reason: 'length', message: { content: 'private-test-content' } }] }));
    const result = await invoke(f, { context: { maxCompletionTokens: 1 } });
    assert.doesNotMatch(result + JSON.stringify(f.observations.logs), /synthetic-sdk-key|private-test-content/); closed(f);
  });
  await check('Actual CentralAnswer passes its one-sentence budget to the selected SDK route', async () => {
    const f = fixture(() => Promise.resolve(answer('Gravity attracts objects with mass.')));
    const result = await f.tool.execute({ question: 'Explain gravity. Reply with one sentence.' },
      { userId: 'fixture-user', workspaceId: 'fixture-workspace', sessionId: 'fixture-session', modelConfig: selected, engineeringPipeline: true });
    assert.equal(result.ok, true); assert.equal(result.output, 'Gravity attracts objects with mass.');
    assert.equal(f.observations.sdk.length, 1); assert.equal(f.observations.sdk[0].body.max_tokens, 128);
    assert.equal(f.observations.routeContexts[0].maxCompletionTokens, 128); closed(f);
  });
  await check('Provider deadline aborts a capped stream without a buffered retry', async () => {
    const f = fixture(event => new Promise((_, reject) => event.requestOptions.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const pending = invoke(f, { context: { maxCompletionTokens: 16, providerTimeoutMs: 9000, strictProviderCheck: true }, onPartial: () => {} });
    for (let i = 0; i < 20 && !f.observations.sdk.length; i++) await Promise.resolve();
    assert.equal(f.observations.sdk.length, 1);
    const timer = [...f.timers.values()].find(t => t.ms === 9000); assert.ok(timer); timer.cb();
    await assert.rejects(pending, /direct_provider_check_failed/);
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true);
    assert.equal(f.observations.sdk.length, 1); closed(f);
  });
  const report = { scope: 'Actual current full router + closed inert SDK; no provider network, actual UI or paid use', sourceReads, rows, passed: rows.filter(r => r.status === 'PASS').length, failed: rows.filter(r => r.status === 'FAIL').length };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report)); process.exitCode = report.failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
