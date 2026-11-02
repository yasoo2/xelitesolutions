'use strict';

// Execute the complete current router, local provider, local-brain and circuit
// modules. Only SDK/registry/cache transports, metadata and clocks are inert.
// This proves routing boundaries; it is not live inference or an OS sandbox.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { newFixture, sourceReads } = require('./closed-local-answer-fixture.cjs');
const rows = [];
const analysis = { type: 'simple_chat', complexity: 'low', requiresTools: false, estimatedTokens: 50, language: 'en', hasImages: false };
const messages = [{ role: 'user', content: 'Explain the purpose of a function.' }];
const selected = { provider: 'local', model: 'qwen2.5:1.5b', apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1' };
const answer = (content = 'A function groups reusable instructions.', finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content } }] });
const fixture = (behavior = () => Promise.resolve(answer()), env = {}) => newFixture(env, behavior, ['qwen3.5:4b', selected.model]);
const context = (extra = {}) => ({ userId: 'fixture-user', workspaceId: 'fixture-workspace', sessionId: 'fixture-session', modelConfig: { ...selected }, ...extra });
const invoke = (f, extra = {}, onPartial) => f.router.routeToModel(messages, analysis, undefined, onPartial, undefined, undefined, undefined, context(extra));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function closed(f, calls = 1) {
  assert.equal(f.observations.sdk.length, calls);
  assert.equal(f.observations.adapterCalls.length, 0, 'No other provider adapter may be tried');
  assert.deepEqual(f.observations.violations, []);
  assert.equal(f.observations.metadata.length, 0, 'Selected route does not discover/swap the global model');
  assert.equal(f.timers.size, 0, 'All owned timers must be removed');
}
async function check(name, body) {
  let deadline;
  try {
    await Promise.race([body(), new Promise((_resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('Inert routing assertion did not settle within 1000ms')), 1000);
    })]);
    rows.push({ name, status: 'PASS' });
  }
  catch (error) { rows.push({ name, status: 'FAIL', detail: String(error.message || error).slice(0, 800) }); }
  finally { clearTimeout(deadline); }
}
(async () => {
  for (const apiKey of ['', 'auto-mode', 'free-mode', 'free', 'dummy', 'synthetic-leftover-cloud-key', 'synthetic-عربي-key', 17, { accidental: 'object' }]) {
    await check(`Selected local key class ${typeof apiKey === 'string' ? apiKey || 'blank' : typeof apiKey} never erases model or reaches header`, async () => {
      const f = fixture(), c = context({ modelConfig: { ...selected, apiKey }, maxCompletionTokens: 19, providerTimeoutMs: 8000 });
      const result = await f.router.routeToModel(messages, analysis, undefined, undefined, undefined, undefined, undefined, c);
      assert.equal(result, 'A function groups reusable instructions.');
      assert.equal(f.observations.constructors[0].apiKey, 'dummy');
      assert.equal(f.observations.constructors[0].maxRetries, 0);
      assert.equal(f.observations.sdk[0].body.model, selected.model);
      assert.equal(f.observations.sdk[0].body.max_tokens, 19);
      assert.equal(f.observations.sdk[0].requestOptions.timeout, 8000);
      assert.equal(c.providerAttempts.length, 1); assert.equal(c.providerAttempts[0].provider, 'local');
      assert.equal(c.providerAttempts[0].success, true); closed(f);
    });
  }
  await check('Trimmed local model and root endpoint reach normalized SDK base', async () => {
    const f = fixture(); await invoke(f, { modelConfig: { ...selected, model: '  qwen2.5:1.5b  ', baseUrl: 'http://LOCALHOST:11434/' } });
    assert.equal(f.observations.constructors[0].baseURL, 'http://localhost:11434/v1');
    assert.equal(f.observations.sdk[0].body.model, selected.model); closed(f);
  });
  await check('IPv6 loopback selected route retains selected model', async () => {
    const f = fixture(); await invoke(f, { modelConfig: { ...selected, baseUrl: 'http://[::1]:11434' } });
    assert.equal(f.observations.constructors[0].baseURL, 'http://[::1]:11434/v1');
    assert.equal(f.observations.sdk[0].body.model, selected.model); closed(f);
  });
  for (const engineeringPipeline of [false, true]) {
    await check(`Internal selected local model stays authoritative (engineering=${engineeringPipeline})`, async () => {
      const f = fixture(); await f.localBrain.detectLocalModels(10); f.observations.metadata.length = 0;
      await invoke(f, { purpose: 'internal', engineeringPipeline });
      assert.equal(f.observations.sdk[0].body.model, selected.model); closed(f);
    });
  }
  for (const baseUrl of ['http://127.1:11434/v1', 'http://2130706433:11434/v1', 'http://0x7f000001:11434/v1', 'http://localhost:11434/other/../v1', 'http://localhost:11434/v1?', 'http://localhost:11434/v1#', 'http://@localhost:11434/v1', 'http://example.com:11434/v1', 'http://localhost:8080/v1', 'https://localhost:11434/v1', undefined]) {
    await check(`Invalid explicit endpoint ${baseUrl} cannot dispatch or fall back even with allow_paid`, async () => {
      const f = fixture(undefined, { AI_COST_POLICY: 'allow_paid' });
      await assert.rejects(invoke(f, { modelConfig: { ...selected, baseUrl, apiKey: 'synthetic-leftover-cloud-key' } }), /explicit.*local.*invalid|invalid.*local/i);
      closed(f, 0);
    });
  }
  for (const model of ['gpt-oss:120b-cloud', 'kimi-k2.5:cloud', 'KIMI-K2.5:CLOUD', 'qwen 2.5', 17, null]) {
    await check(`Invalid or known cloud model ${model} fails before dispatch`, async () => {
      const f = fixture(undefined, { AI_COST_POLICY: 'allow_paid' });
      await assert.rejects(invoke(f, { modelConfig: { ...selected, model } }), /explicit.*local/i); closed(f, 0);
    });
  }
  for (const [name, error] of [['unavailable', Object.assign(new Error('ECONNREFUSED'), { status: 503 })], ['quota', Object.assign(new Error('quota exhausted'), { status: 429 })], ['authentication', Object.assign(new Error('invalid api key synthetic-leftover-cloud-key'), { status: 401 })], ['bad model', Object.assign(new Error('model missing'), { status: 404 })]]) {
    await check(`Selected local ${name} error rejects without a mesh retry or secret echo`, async () => {
      const f = fixture(() => Promise.reject(error));
      await assert.rejects(invoke(f, { modelConfig: { ...selected, apiKey: 'synthetic-leftover-cloud-key' } }), err => {
        assert.match(err.message, /direct_provider_check_failed/);
        assert.doesNotMatch(err.message, /synthetic-leftover-cloud-key/); return true;
      }); closed(f);
      if (name === 'quota' || name === 'authentication') {
        await assert.rejects(invoke(f, { modelConfig: { ...selected, apiKey: 'synthetic-leftover-cloud-key' } }), /direct_provider_check_failed/); closed(f);
      }
    });
  }
  await check('Already occupied selected circuit fails closed without an SDK or mesh request', async () => {
    // Drive the real circuit into cooldown through the first selected request.
    const first = fixture(() => Promise.reject(Object.assign(new Error('temporarily unavailable'), { status: 503 })));
    await assert.rejects(invoke(first), /direct_provider_check_failed/);
    await assert.rejects(invoke(first), /direct_provider_check_failed/); closed(first);
  });
  await check('Changing unused local key cannot evade cooldown, while a different workspace remains isolated', async () => {
    const f = fixture(e => e.index === 0 ? Promise.reject(Object.assign(new Error('temporarily unavailable'), { status: 503 })) : Promise.resolve(answer()));
    await assert.rejects(invoke(f, { modelConfig: { ...selected, apiKey: 'synthetic-first-key' } }), /direct_provider_check_failed/);
    await assert.rejects(invoke(f, { modelConfig: { ...selected, apiKey: 'synthetic-second-key' } }), /direct_provider_check_failed/); closed(f);
    await invoke(f, { workspaceId: 'fixture-different-workspace', modelConfig: { ...selected, apiKey: 'synthetic-second-key' } }); closed(f, 2);
  });
  await check('Completion truncation cannot become accepted output or a mesh request', async () => {
    const f = fixture(() => Promise.resolve(answer('partial output', 'length')));
    await assert.rejects(invoke(f, { maxCompletionTokens: 7 }), /completion limit/); closed(f);
  });
  await check('Pre-entry owner cancellation performs no selected SDK or alternative request', async () => {
    const owner = new AbortController(); owner.abort(new Error('fixture_owner_cancelled'));
    const f = fixture(); await assert.rejects(invoke(f, { signal: owner.signal }), /fixture_owner_cancelled/); closed(f, 0);
  });
  await check('Owner cancellation during streaming aborts the one selected SDK and prevents buffered/mesh retry', async () => {
    const owner = new AbortController(), f = fixture(e => new Promise((_resolve, reject) => e.requestOptions.signal.addEventListener('abort', () => reject(new Error('transport aborted')), { once: true })));
    const pending = invoke(f, { signal: owner.signal }, () => {}); await flush();
    assert.equal(f.observations.sdk.length, 1); owner.abort(new Error('fixture_owner_cancelled'));
    await assert.rejects(pending, /fixture_owner_cancelled/); await flush();
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); closed(f);
  });
  await check('Selected SDK deadline aborts the existing transport without another provider', async () => {
    const f = fixture(e => new Promise((_resolve, reject) => e.requestOptions.signal.addEventListener('abort', () => reject(new Error('transport timeout')), { once: true })));
    const pending = invoke(f, { providerTimeoutMs: 8000 }, () => {}); await flush();
    const timer = [...f.timers.values()].find(t => t.ms === 8000); assert.ok(timer); timer.cb();
    await assert.rejects(pending, /direct_provider_check_failed/); await flush();
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); closed(f);
  });
  for (const stop of ['owner cancellation', 'provider deadline']) {
    await check(`Late buffered success from a non-cooperative SDK cannot defeat ${stop}`, async () => {
      let settle;
      const owner = new AbortController(), f = fixture(() => new Promise(resolve => { settle = resolve; }));
      const pending = invoke(f, { providerTimeoutMs: 8000, signal: owner.signal }); await flush();
      assert.equal(typeof settle, 'function');
      if (stop === 'owner cancellation') owner.abort(new Error('fixture_owner_cancelled'));
      else [...f.timers.values()].find(t => t.ms === 8000).cb();
      settle(answer('late content must not be accepted'));
      await assert.rejects(pending, /fixture_owner_cancelled|direct_provider_check_failed/);
      assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); closed(f);
    });
  }
  await check('Unsupported streaming retains selected model and original deadline on one buffered retry', async () => {
    const f = fixture(e => e.index === 0 ? Promise.reject(Object.assign(new Error('unsupported stream'), { status: 400 })) : Promise.resolve(answer()));
    await invoke(f, { providerTimeoutMs: 8000 }, () => {});
    assert.ok(f.observations.sdk.every(e => e.body.model === selected.model && e.requestOptions.timeout === 8000));
    assert.equal(f.observations.sdk[0].requestOptions.signal, f.observations.sdk[1].requestOptions.signal); closed(f, 2);
  });
  await check('Auto provider still uses discovered global local model rather than the explicit direct route', async () => {
    const f = fixture(); await f.localBrain.detectLocalModels(10); f.observations.metadata.length = 0;
    await invoke(f, { modelConfig: { provider: 'auto', model: 'auto', apiKey: 'auto-mode' } });
    assert.equal(f.observations.sdk[0].body.model, 'qwen3.5:4b'); closed(f);
  });
  for (const model of [undefined, '', 'auto', 'FREE']) {
    await check(`Local model picker ${model} keeps existing Auto behavior`, async () => {
      const f = fixture(); await f.localBrain.detectLocalModels(10); f.observations.metadata.length = 0;
      await invoke(f, { modelConfig: { ...selected, model } });
      assert.equal(f.observations.sdk[0].body.model, 'qwen3.5:4b'); closed(f);
    });
  }
  await check('Local Auto picker ignores an unused real key and preserves global model discovery', async () => {
    const f = fixture(); await f.localBrain.detectLocalModels(10); f.observations.metadata.length = 0;
    await invoke(f, { modelConfig: { ...selected, model: 'auto', apiKey: 'synthetic-leftover-cloud-key' } });
    assert.equal(f.observations.sdk[0].body.model, 'qwen3.5:4b'); closed(f);
  });
  await check('Canonical local provider case/outer whitespace reaches the same exact route', async () => {
    const f = fixture(); await invoke(f, { modelConfig: { ...selected, provider: ' LOCAL ' } });
    assert.equal(f.observations.sdk[0].body.model, selected.model); closed(f);
  });
  await check('An independently allowed vendor keeps its key/model/base and original budget fields', async () => {
    const f = fixture(undefined, { AI_FREE_PROVIDERS: 'groq' });
    await invoke(f, { modelConfig: { provider: 'groq', model: 'vendor-model', apiKey: 'synthetic-vendor-key', baseUrl: 'https://api.groq.com/openai/v1' }, maxCompletionTokens: 23, providerTimeoutMs: 9000 });
    assert.equal(f.observations.constructors[0].apiKey, 'synthetic-vendor-key');
    assert.equal(f.observations.sdk[0].body.model, 'vendor-model');
    assert.equal(f.observations.sdk[0].body.max_tokens, 23); closed(f);
  });
  await check('Ordinary internal vendor calls still conserve quota through the existing global local route', async () => {
    const f = fixture(undefined, { AI_FREE_PROVIDERS: 'groq' }); await f.localBrain.detectLocalModels(10); f.observations.metadata.length = 0;
    await invoke(f, { purpose: 'internal', modelConfig: { provider: 'groq', model: 'vendor-model', apiKey: 'synthetic-vendor-key', baseUrl: 'https://api.groq.com/openai/v1' } });
    assert.equal(f.observations.sdk[0].body.model, 'qwen3.5:4b'); closed(f);
  });
  await check('A paid vendor is still rejected under the existing free_only policy', async () => {
    const f = fixture(); await assert.rejects(invoke(f, { strictProviderCheck: true, modelConfig: { provider: 'openai', model: 'o3', apiKey: 'synthetic-key' } }), /free_only/); closed(f, 0);
  });
  const report = { atUTC: new Date().toISOString(), scope: 'Full real source routing with closed inert SDK/metadata/clock leaves; no provider inference, ambient credentials, native actions, runtime changes or real UI acceptance', sourceReads, rows, passed: rows.filter(r => r.status === 'PASS').length, failed: rows.filter(r => r.status === 'FAIL').length };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed, failures: rows.filter(r => r.status === 'FAIL') }));
  process.exitCode = report.failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
