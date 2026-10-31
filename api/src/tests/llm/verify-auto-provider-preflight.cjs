'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const { newFixture, sourceReads } = require('./closed-local-answer-fixture.cjs');
const rows = [], models = ['qwen3.5:4b', 'qwen2.5-coder:7b', 'qwen2.5:1.5b'];
async function check(name, run) { try { await run(); rows.push({ name, status: 'PASS' }); } catch (e) { rows.push({ name, status: 'FAIL', error: String(e?.message || e) }); } }
async function make(reply, catalog = models, env = {}) { const f = newFixture(env, reply, catalog); await f.localBrain.detectLocalModels(); return f; }
function closed(f) { assert.equal(f.observations.violations.length, 0); assert.equal(f.observations.adapterCalls.length, 0); assert.equal(f.timers.size, 0); }
(async () => {
 await check('Auto connection check uses installed small text capacity and bounded output', async () => {
  const f = await make(() => Promise.resolve({ choices: [{ message: { content: 'OK' } }] }));
  const r = await f.router.verifyProviderDirect('auto'); assert.equal(r.ok, true); assert.equal(r.detail, 'local_ok');
  assert.equal(f.observations.sdk.length, 1); const call = f.observations.sdk[0];
  assert.equal(call.body.model, 'qwen2.5:1.5b'); assert.equal(call.body.max_tokens, 32); assert.equal(call.body.tools, undefined); closed(f);
 });
 await check('Without a small model probe preserves general chat, never coder', async () => {
  const f = await make(() => Promise.resolve({ choices: [{ message: { content: 'OK' } }] }), models.slice(0, 2));
  assert.equal((await f.router.verifyProviderDirect('auto')).ok, true);
  assert.equal(f.observations.sdk[0].body.model, 'qwen3.5:4b'); assert.equal(f.observations.sdk[0].body.reasoning_effort, 'none'); closed(f);
 });
 await check('Offline empty probe is honest failure with no mesh duplicate', async () => {
  const f = await make(() => Promise.resolve({ choices: [{ message: { content: '' } }] }));
  assert.equal((await f.router.verifyProviderDirect('auto')).ok, false); assert.equal(f.observations.sdk.length, 1); closed(f);
 });
 await check('Offline transport failure does not enqueue another local request', async () => {
  const f = await make(() => Promise.reject(new Error('transport_unavailable')));
  const r = await f.router.verifyProviderDirect('auto'); assert.equal(r.ok, false); assert.equal(f.observations.sdk.length, 1); closed(f);
 });
 await check('Offline probe timeout aborts exactly one request at 15 seconds', async () => {
  const f = await make(() => new Promise(() => {})); const pending = f.router.verifyProviderDirect('auto');
  for (let i = 0; i < 12 && !f.observations.sdk.length; i++) await Promise.resolve();
  assert.equal(f.observations.sdk.length, 1); const timer = [...f.timers.values()].find(t => t.ms === 15000); assert.ok(timer); timer.cb();
  assert.equal((await pending).ok, false); assert.equal(f.observations.sdk[0].requestOptions.signal.aborted, true); assert.equal(f.observations.sdk.length, 1); closed(f);
 });
 await check('Truncated health response cannot paint the provider healthy', async () => {
  const f = await make(() => Promise.resolve({ choices: [{ finish_reason: 'length', message: { content: 'O' } }] }));
  assert.equal((await f.router.verifyProviderDirect('auto')).ok, false); assert.equal(f.observations.sdk.length, 1); closed(f);
 });
 await check('Explicit paid provider verification remains blocked by free-only policy', async () => {
  const f = await make(); const r = await f.router.verifyProviderDirect('openai', { apiKey: 'synthetic-test-key' });
  assert.equal(r.ok, false); assert.match(r.detail, /free_only/); assert.equal(f.observations.sdk.length, 0); closed(f);
 });
 await check('Online mesh fallback keeps tiny-task capacity and fresh cancellation boundary', async () => {
  const f = await make(event => event.index === 0 ? Promise.reject(new Error('transport_unavailable')) : Promise.resolve({ choices: [{ message: { content: 'OK' } }] }), models, { OFFLINE_MODE: 'false' });
  const r = await f.router.verifyProviderDirect('auto'); assert.equal(r.ok, true); assert.equal(r.detail, 'mesh_ok');
  assert.equal(f.observations.sdk.length, 2);
  for (const call of f.observations.sdk) { assert.equal(call.body.model, 'qwen2.5:1.5b'); assert.equal(call.body.max_tokens, 32); }
  assert.notEqual(f.observations.sdk[0].requestOptions.signal, f.observations.sdk[1].requestOptions.signal);
  assert.equal(JSON.parse(f.observations.logs.find(l => l.args[0] === '[LocalCall] start').args[1]).purpose, 'health_probe'); closed(f);
 });
 await check('Local scheduling telemetry records counts and timing, never content or identity', async () => {
  const f = await make(); const marker = 'private-content-marker synthetic-secret-marker';
  await f.router.routeToModel([{ role: 'user', content: marker }], { ...f.router.analyzeTask('Hello'), requiresTools: false }, undefined, undefined, undefined, undefined, undefined,
   { purpose: 'internal', userId: 'private-user-marker', workspaceId: 'private-workspace-marker', sessionId: 'private-session-marker', modelConfig: { provider: 'auto' }, maxCompletionTokens: 32, localAnswerProfile: 'small_text', localReasoningEffort: 'none' });
  const localLogs = f.observations.logs.filter(l => String(l.args[0]).startsWith('[LocalCall]'));
  assert.equal(localLogs.length, 2); const start = JSON.parse(localLogs[0].args[1]), finish = JSON.parse(localLogs[1].args[1]);
  assert.equal(start.inputChars, marker.length); assert.equal(start.messages, 1); assert.equal(start.maxCompletionTokens, 32); assert.equal(start.reasoningEffort, 'none');
  assert.match(start.modelFingerprint, /^[a-f0-9]{12}$/); assert.equal(finish.modelFingerprint, start.modelFingerprint); assert.ok(finish.elapsedMs >= 0); assert.equal(finish.aborted, false);
  assert.doesNotMatch(JSON.stringify(localLogs), /private-|synthetic-secret|qwen|1\.5b/); closed(f);
 });
 const report = { scope: 'Actual current router/local modules, closed transports; no real provider or browser', sourceReads, rows, passed: rows.filter(r => r.status === 'PASS').length, failed: rows.filter(r => r.status === 'FAIL').length };
 if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(report, null, 2), { flag: 'wx' });
 console.log(JSON.stringify(report)); process.exitCode = report.failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
