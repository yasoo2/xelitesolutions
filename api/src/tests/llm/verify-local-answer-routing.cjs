'use strict';

// Full-module integration, with transports closed by closed-local-answer-fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { newFixture, sourceReads } = require('./closed-local-answer-fixture.cjs');
const results = [];
const response = content => ({ choices: [{ message: { content } }] });
const ownerContext = signal => ({
  purpose: 'internal', modelConfig: { provider: 'auto' },
  userId: 'fixture-owner', workspaceId: 'fixture-workspace', sessionId: 'fixture-session',
  signal,
});
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Closed fixture did not settle within 1000ms')), 1000);
    })]);
  } finally { clearTimeout(timer); }
}
async function test(name, run) {
  try { await run(); results.push({ name, status: 'PASS' }); }
  catch (error) { results.push({ name, status: 'FAIL', error: String(error?.message || error) }); }
}
async function boot(f) { await f.localBrain.detectLocalModels(); }
function safeContext(f, context) {
  assert.equal(f.observations.violations.length, 0);
  assert.equal(f.observations.adapterCalls.length, 0);
  assert.equal(f.timers.size, 0);
  for (const routed of f.observations.routeContexts) {
    assert.equal(routed.purpose, context.purpose);
    assert.equal(routed.userId, context.userId);
    assert.equal(routed.workspaceId, context.workspaceId);
    assert.equal(routed.sessionId, context.sessionId);
    assert.deepEqual(routed.modelConfig, context.modelConfig);
    assert.equal(routed.localReasoningEffort, 'none');
    assert.ok(routed.signal instanceof AbortSignal);
    assert.notEqual(routed.signal, context.signal);
  }
  for (const analysis of f.observations.routeAnalyses) assert.equal(analysis?.requiresTools, false);
  for (const call of f.observations.sdk) {
    assert.equal(call.body.tools, undefined);
    assert.ok(call.requestOptions.signal instanceof AbortSignal);
  }
}
(async () => {
  for (const [name, question, expected, answer] of [
    ['short factual English', 'What is the opposite of heavy?', 'qwen3.5:4b', 'Light.'],
    ['short factual Arabic', 'ما الفرق بين الشمس والقمر؟', 'qwen3.5:4b', 'الشمس نجم والقمر تابع للأرض.'],
    ['ordinary internal question', 'Describe a pebble in one sentence.', 'qwen3.5:4b', 'A pebble is a small smooth stone.'],
    ['creative writing', 'Write a story about a sparrow.', 'qwen3.5:4b', 'A sparrow found its way home.'],
    ['reasoning', 'Explain why ice melts.', 'qwen3.5:4b', 'Heat changes ice into liquid water.'],
    ['code explanation', 'Explain this JavaScript function in words.', 'qwen2.5-coder:7b', 'The function returns a value.'],
    ['data question', 'Analyze this data: 2, 4, 6.', 'qwen2.5-coder:7b', 'The mean is four.'],
    ['answer-only system request', 'Explain how to run a command without running it.', 'qwen2.5-coder:7b', 'Read the command documentation first.'],
  ]) await test(name, async () => {
    const f = newFixture({}, () => Promise.resolve(response(answer))); await boot(f);
    const context = ownerContext(new AbortController().signal);
    const result = await bounded(f.tool.execute({ question }, context));
    assert.equal(result.ok, true); assert.equal(result.output, answer);
    assert.equal(f.observations.sdk.length, 1);
    assert.equal(f.observations.sdk[0].body.model, expected);
    safeContext(f, context);
    if (expected === 'qwen3.5:4b') assert.equal(f.observations.sdk[0].body.reasoning_effort, 'none');
  });
  await test('explicit local model remains explicit', async () => {
    const f = newFixture({}, () => Promise.resolve(response('Light.'))); await boot(f);
    const context = { ...ownerContext(new AbortController().signal), engineeringPipeline: true,
      modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: 'synthetic-fixture-key' } };
    const result = await bounded(f.tool.execute({ question: 'What is the opposite of heavy?' }, context));
    assert.equal(result.ok, true); assert.equal(f.observations.sdk[0].body.model, 'qwen2.5-coder:7b');
    assert.equal(f.observations.sdk.length, 1); safeContext(f, context);
  });
  await test('language rewrite preserves original question route and one budget', async () => {
    const f = newFixture({}, event => Promise.resolve(response(event.index === 0 ? 'The sun is a star.' : 'الشمس نجم يضيء الأرض.'))); await boot(f);
    const context = { ...ownerContext(new AbortController().signal), providerTimeoutMs: 3000 };
    const result = await bounded(f.tool.execute({ question: 'ما الفرق بين الشمس والقمر؟' }, context));
    assert.equal(result.ok, true); assert.equal(result.output, 'الشمس نجم يضيء الأرض.');
    assert.equal(f.observations.sdk.length, 2);
    assert.ok(f.observations.sdk.every(call => call.body.model === 'qwen3.5:4b'));
    assert.equal(f.observations.routeContexts[0].signal, f.observations.routeContexts[1].signal);
    assert.equal(f.observations.routeAnalyses[0], f.observations.routeAnalyses[1]);
    assert.ok(f.observations.routeContexts.every(route => route.providerTimeoutMs === 3000));
    safeContext(f, context);
  });
  await test('pre-cancelled owner sends no generation', async () => {
    const f = newFixture(); await boot(f); const owner = new AbortController(); owner.abort();
    const result = await bounded(f.tool.execute({ question: 'What is the opposite of heavy?' }, ownerContext(owner.signal)));
    assert.equal(result.ok, false); assert.equal(result.output.reason, 'cancelled');
    assert.equal(f.observations.sdk.length, 0); assert.equal(f.observations.violations.length, 0); assert.equal(f.timers.size, 0);
  });
  await test('in-flight owner cancellation reaches selected model', async () => {
    const f = newFixture({}, () => new Promise(() => {})); await boot(f); const owner = new AbortController();
    const context = ownerContext(owner.signal);
    const pending = f.tool.execute({ question: 'What is the opposite of heavy?' }, context);
    for (let i = 0; i < 20 && !f.observations.sdk.length; i++) await Promise.resolve();
    assert.equal(f.observations.sdk.length, 1); owner.abort();
    const result = await bounded(pending);
    assert.equal(result.ok, false); assert.equal(result.output.reason, 'cancelled');
    assert.equal(f.observations.sdk[0].body.model, 'qwen3.5:4b');
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); safeContext(f, context);
  });
  const report = { kind: 'closed-full-module-integration', network: 'inert transports only', sourceReads, results,
    passed: results.filter(row => row.status === 'PASS').length, failed: results.filter(row => row.status === 'FAIL').length };
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(report)); process.exitCode = report.failed ? 1 : 0;
})().catch(error => { console.error(String(error?.stack || error)); process.exitCode = 1; });
