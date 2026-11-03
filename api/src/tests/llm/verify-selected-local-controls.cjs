'use strict';

// Real current router/answer/local-provider modules. SDK, metadata and clocks are
// inert closed fixtures; this is not live provider or hostile-code sandbox proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { newFixture, sourceReads } = require('./closed-local-answer-fixture.cjs');
const rows = [];
const analysis = { type: 'simple_chat', complexity: 'low', requiresTools: false, estimatedTokens: 50, language: 'en', hasImages: false };
const messages = [{ role: 'user', content: 'Explain the purpose of a function.' }];
const selected = { provider: 'local', apiKey: 'ollama', model: 'qwen3.5:4b', baseUrl: 'http://127.0.0.1:11434/v1' };
const answer = (content = 'A function performs a named reusable operation.', finish = 'stop') => ({ choices: [{ finish_reason: finish, message: { content } }] });
const stream = (content = 'A function performs a named reusable operation.') => ({ async *[Symbol.asyncIterator]() { yield { choices: [{ delta: { content }, finish_reason: 'stop' }] }; } });
const fixture = (behavior, env = {}) => newFixture(env, behavior || (() => Promise.resolve(answer())));
function invoke(f, context = {}, onPartial) {
  return f.router.routeToModel(messages, analysis, undefined, onPartial, undefined, undefined, undefined,
    { purpose: 'answer', engineeringPipeline: true, modelConfig: selected, ...context });
}
async function flush() { for (let i = 0; i < 40; i++) await Promise.resolve(); }
function closed(f, expectedCalls = 1) {
  assert.equal(f.observations.sdk.length, expectedCalls);
  assert.equal(f.observations.adapterCalls.length, 0);
  assert.equal(f.observations.metadata.length, 0);
  assert.equal(f.observations.violations.length, 0);
  assert.equal(f.timers.size, 0);
  assert.ok(f.observations.constructors.every(c => c.maxRetries === 0));
}
async function check(name, run) {
  try { await run(); rows.push({ name, status: 'PASS' }); }
  catch (error) { rows.push({ name, status: 'FAIL', error: String(error?.message || error) }); }
}
(async () => {
  for (const streaming of [false, true]) await check(`Selected local ${streaming ? 'stream' : 'buffer'} preserves the explicit non-thinking request`, async () => {
    const f = fixture(() => Promise.resolve(streaming ? stream() : answer())), owner = new AbortController(), deltas = [];
    await invoke(f, { localReasoningEffort: 'none', maxCompletionTokens: 128, signal: owner.signal, providerTimeoutMs: 9000 }, streaming ? d => deltas.push(d) : undefined);
    const { body, requestOptions } = f.observations.sdk[0];
    assert.equal(body.reasoning_effort, 'none'); assert.equal(body.max_tokens, 128);
    assert.equal(body.model, selected.model); assert.equal(requestOptions.timeout, 9000);
    assert.equal(requestOptions.signal.aborted, false); assert.equal(owner.signal.aborted, false);
    assert.equal(f.observations.constructors[0].baseURL, selected.baseUrl);
    assert.equal(deltas.length, streaming ? 1 : 0); closed(f);
  });
  for (const model of ['qwen3', 'qwen3:8b', 'qwen3.5', 'qwen3.5:4b']) await check(`Selected supported family ${model} uses the caller opt-in`, async () => {
    const f = fixture(); await invoke(f, { localReasoningEffort: 'none', modelConfig: { ...selected, model } });
    assert.equal(f.observations.sdk[0].body.model, model); assert.equal(f.observations.sdk[0].body.reasoning_effort, 'none'); closed(f);
  });
  for (const [baseUrl, expectedSdkBase] of [['http://localhost:11434', 'http://localhost:11434/v1'], ['http://localhost:11434/v1', 'http://localhost:11434/v1'], ['http://127.0.0.1:11434/', 'http://127.0.0.1:11434/v1'], ['http://127.0.0.1:11434/v1/', 'http://127.0.0.1:11434/v1'], ['http://[::1]:11434', 'http://[::1]:11434/v1'], ['http://[::1]:11434/v1', 'http://[::1]:11434/v1']]) await check(`Canonical selected endpoint ${baseUrl} retains its host and normalizes the SDK /v1 path`, async () => {
    const f = fixture(); await invoke(f, { localReasoningEffort: 'none', modelConfig: { ...selected, baseUrl } });
    assert.equal(f.observations.constructors[0].baseURL, expectedSdkBase); assert.equal(f.observations.sdk[0].body.reasoning_effort, 'none'); closed(f);
  });
  for (const effort of [undefined, 'low', 'NONE', false]) await check(`Absent or nonliteral effort ${String(effort)} does not change existing inference`, async () => {
    const f = fixture(); await invoke(f, { localReasoningEffort: effort });
    assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'reasoning_effort'), false); closed(f);
  });
  for (const model of ['qwen2.5:1.5b', 'qwen2.5-coder:7b', 'llama3.1', 'qwen3-coder:30b', 'vendor/qwen3.5:4b']) await check(`Other selected model ${model} gets no vendor field`, async () => {
    const f = fixture(); await invoke(f, { localReasoningEffort: 'none', modelConfig: { ...selected, model } });
    assert.equal(f.observations.sdk[0].body.model, model); assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'reasoning_effort'), false); closed(f);
  });
  await check('Malformed selected model qwen3.5:4b trailing gets no vendor field and cannot dispatch', async () => {
    const f = fixture(), model = 'qwen3.5:4b trailing';
    assert.equal(Object.hasOwn(f.localReasoningOptions(model, selected.baseUrl, 'none'), 'reasoning_effort'), false);
    await assert.rejects(invoke(f, { localReasoningEffort: 'none', modelConfig: { ...selected, model } }), /explicit local selection invalid/);
    assert.equal(f.observations.constructors.length, 0); closed(f, 0);
  });
  for (const baseUrl of ['http://example.invalid:11434', 'http://127.0.0.1:5000/v1', 'https://localhost:11434/v1', 'http://127.0.0.1:11434/api', 'http://localhost:11434/v1/chat/completions', 'http://user:pass@localhost:11434/v1', 'http://localhost:11434/v1?x=1', 'http://localhost:11434/v1#x', 'http://127.1:11434/v1', 'http://2130706433:11434/v1', 'http://localhost.:11434/v1', 'http://localhost:11434/%76%31', 'not-a-url']) await check(`Noncanonical endpoint ${baseUrl} receives no Ollama opt-in`, async () => {
    // Keep the original negative thinking-control assertion on the actual local
    // helper, and verify the stronger router boundary: invalid local endpoints
    // cannot construct a client even under synthetic allow_paid policy.
    const f = fixture(undefined, { AI_COST_POLICY: 'allow_paid' });
    assert.equal(Object.hasOwn(f.localReasoningOptions(selected.model, baseUrl, 'none'), 'reasoning_effort'), false);
    await assert.rejects(invoke(f, { localReasoningEffort: 'none', modelConfig: { ...selected, baseUrl } }), /explicit local selection invalid/);
    assert.equal(f.observations.constructors.length, 0); closed(f, 0);
  });
  for (const [provider, baseUrl] of [['groq', 'https://api.groq.com/openai/v1'], ['openai', 'https://api.openai.com/v1'], ['nvidia', 'https://integrate.api.nvidia.com/v1']]) await check(`Inert ${provider} never inherits local thinking controls`, async () => {
    const f = fixture(undefined, { AI_COST_POLICY: 'allow_paid' });
    await invoke(f, { localReasoningEffort: 'none', modelConfig: { ...selected, provider, baseUrl } });
    assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'reasoning_effort'), false); closed(f);
  });
  await check('Real CentralAnswer passes its explicit selected local model, reasoning and completion contract to the SDK', async () => {
    const f = fixture(); const parent = { userId: 'fixture-user', sessionId: 'fixture-session', workspaceId: 'fixture-workspace', language: 'en', modelConfig: selected, providerTimeoutMs: 5000 };
    const before = JSON.parse(JSON.stringify(parent));
    const result = await f.tool.execute({ question: 'What is a function? Reply in one English sentence.' }, parent);
    assert.equal(result.ok, true); assert.equal(result.output, answer().choices[0].message.content);
    assert.equal(f.observations.sdk[0].body.reasoning_effort, 'none'); assert.equal(f.observations.sdk[0].body.max_tokens, 128);
    // Provider-attempt telemetry is part of the existing router contract. The
    // caller's identity, selected config and deadline must remain unchanged.
    const { providerAttempts, ...after } = parent;
    assert.deepEqual(after, before); assert.deepEqual(JSON.parse(JSON.stringify(providerAttempts)), [{ provider: 'local', success: true }]);
    assert.equal(f.observations.routeContexts[0].workspaceId, parent.workspaceId); closed(f);
  });
  await check('Selected Local provider verification is one bounded non-thinking request on the exact model', async () => {
    const f = fixture(() => Promise.resolve(answer('OK')));
    const result = await f.router.verifyProviderDirect('local', { ...selected });
    assert.equal(result.ok, true); assert.equal(result.provider, 'local');
    assert.equal(f.observations.sdk[0].body.model, selected.model);
    assert.equal(f.observations.sdk[0].body.max_tokens, 32); assert.equal(f.observations.sdk[0].body.reasoning_effort, 'none');
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, false); closed(f);
  });
  await check('Probe of the nonthinking old local model is still bounded without a vendor field', async () => {
    const f = fixture(() => Promise.resolve(answer('OK')));
    assert.equal((await f.router.verifyProviderDirect('local', { ...selected, model: 'qwen2.5:1.5b' })).ok, true);
    assert.equal(f.observations.sdk[0].body.max_tokens, 32); assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'reasoning_effort'), false); closed(f);
  });
  await check('A separate inert provider check retains its existing request fields', async () => {
    const f = fixture(() => Promise.resolve(answer('OK')), { AI_FREE_PROVIDERS: 'groq' });
    assert.equal((await f.router.verifyProviderDirect('groq', { apiKey: 'synthetic-sdk-key', model: 'unchanged-model', baseUrl: 'https://api.groq.com/openai/v1' })).ok, true);
    assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'reasoning_effort'), false); assert.equal(Object.hasOwn(f.observations.sdk[0].body, 'max_tokens'), false); closed(f);
  });
  await check('Truncated Local verification cannot become green or use another route', async () => {
    const f = fixture(() => Promise.resolve(answer('private truncated probe', 'length')));
    const result = await f.router.verifyProviderDirect('local', { ...selected });
    assert.equal(result.ok, false); assert.match(result.detail, /completion limit/);
    assert.doesNotMatch(JSON.stringify(result), /private truncated probe/); closed(f);
  });
  await check('The local90s cold-start probe deadline aborts the one selected request and leaves no timer or retry', async () => {
    const f = fixture(e => new Promise((_resolve, reject) => e.requestOptions.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const pending = f.router.verifyProviderDirect('local', { ...selected }); await flush();
    assert.equal(f.observations.sdk.length, 1); const timer = [...f.timers.values()].find(t => t.ms === 90000); assert.ok(timer);
    assert.equal(f.observations.sdk[0].requestOptions.timeout, 90000);
    assert.equal(f.observations.sdk[0].body.max_tokens, 32); timer.cb();
    const result = await pending; await flush(); assert.equal(result.ok, false); assert.match(result.detail, /timeout|aborted/);
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); closed(f);
  });
  await check('One unsupported-stream fallback keeps the model, caller deadline, reasoning and output budget', async () => {
    const f = fixture(e => e.index === 0 ? Promise.reject(Object.assign(new Error('unsupported stream'), { status: 400 })) : Promise.resolve(answer()));
    await invoke(f, { localReasoningEffort: 'none', maxCompletionTokens: 17, providerTimeoutMs: 9000 }, () => {});
    assert.ok(f.observations.sdk.every(e => e.body.reasoning_effort === 'none' && e.body.max_tokens === 17 && e.body.model === selected.model && e.requestOptions.timeout === 9000));
    assert.equal(f.observations.sdk[0].requestOptions.signal, f.observations.sdk[1].requestOptions.signal); closed(f, 2);
  });
  await check('Owner cancellation during selected streaming prevents a buffered retry or different provider', async () => {
    const owner = new AbortController(), f = fixture(e => new Promise((_resolve, reject) => e.requestOptions.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const pending = invoke(f, { localReasoningEffort: 'none', signal: owner.signal }, () => {}); await flush();
    assert.equal(f.observations.sdk.length, 1); owner.abort(); await assert.rejects(pending, /cancel|abort/i); await flush();
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); closed(f);
  });
  await check('Already cancelled owner never sends the selected local request', async () => {
    const owner = new AbortController(); owner.abort(); const f = fixture();
    await assert.rejects(invoke(f, { localReasoningEffort: 'none', signal: owner.signal })); closed(f, 0);
  });
  await check('A local reasoning opt-in cannot authorize a paid selected route', async () => {
    const f = fixture(); await assert.rejects(invoke(f, { localReasoningEffort: 'none', strictProviderCheck: true, modelConfig: { provider: 'openai', model: 'o3', apiKey: 'synthetic-sdk-key' } }), /free_only/); closed(f, 0);
  });
  const report = { scope: 'Actual current source/SDK-body behavior; controlled mocks, no live provider, auth mutation, workspace writes, browser or paid request', sourceReads, rows, passed: rows.filter(r => r.status === 'PASS').length, failed: rows.filter(r => r.status === 'FAIL').length };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failures: rows.filter(r => r.status === 'FAIL') })); process.exitCode = report.failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
