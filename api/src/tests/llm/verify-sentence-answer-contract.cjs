'use strict';
// Behavior contract driver for the generic one-sentence concise path.
// Uses the CURRENT closed-local-answer-fixture.cjs only; behavior tests,
// not proof of semantic or inference speed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { newFixture, sourceReads } = require('./closed-local-answer-fixture.cjs');

const selected = { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' };
const ctx = (extra) => ({ userId: 'fixture-owner', workspaceId: 'fixture-workspace', sessionId: 'fixture-session', language: 'en', modelConfig: { ...selected }, ...extra });
const completion = (content) => ({ choices: [{ finish_reason: 'stop', message: { content } }] });
const rows = [];
const check = async (name, run) => { try { await run(); rows.push({ name, pass: true }); } catch (e) { rows.push({ name, pass: false, error: String((e && e.message) || e) }); } };
const closed = (f, count) => { assert.equal(f.observations.sdk.length, count); assert.equal(f.observations.adapterCalls.length, 0); assert.equal(f.observations.metadata.length, 0); assert.equal(f.observations.violations.length, 0); assert.equal(f.timers.size, 0); assert.ok(f.observations.constructors.every((x) => x.maxRetries === 0)); };
const system = (f) => f.observations.sdk[0].body.messages.find((x) => x.role === 'system').content;

(async () => {
  await check('valid English one-sentence mock response keeps capacity and budget', async () => {
    const question = 'Explain why a primary key must be unique. Answer in English. Reply with one sentence.';
    const f = newFixture({}, () => Promise.resolve(completion('A primary key must be unique so each row stays identifiable.')));
    const parent = ctx(); const before = JSON.parse(JSON.stringify(parent));
    const r = await f.tool.execute({ question }, parent);
    assert.equal(r.ok, true);
    assert.ok(system(f).includes('exactly one sentence'));
    assert.ok(system(f).includes('English'));
    assert.equal(f.observations.sdk[0].body.messages.find((x) => x.role === 'user').content, question);
    assert.equal(f.observations.sdk[0].body.model, selected.model);
    assert.equal(f.observations.sdk[0].body.max_tokens, 128);
    assert.equal(f.observations.sdk[0].requestOptions.timeout, 300000);
    const { providerAttempts, ...after } = parent; assert.deepEqual(after, before); closed(f, 1);
  });
  await check('valid Arabic one-sentence mock response retains language', async () => {
    const question = 'Explain why a primary key must be unique. Answer in Arabic. Reply with one sentence.';
    const f = newFixture({}, () => Promise.resolve(completion('يجب أن يكون المفتاح الأساسي فريدا لتحديد كل سجل بدقة.')));
    const r = await f.tool.execute({ question }, ctx({ language: 'ar' }));
    assert.equal(r.ok, true);
    assert.ok(system(f).includes('بجملة واحدة فقط'));
    assert.ok(system(f).includes('العربية'));
    assert.ok(system(f).includes('Arabic'));
    assert.ok(system(f).includes('حرفيا'));
    assert.ok(!system(f).includes('exactly one sentence'));
    assert.equal(f.observations.sdk[0].body.max_tokens, 128);
    closed(f, 1);
  });
  await check('negative brevity keeps the full ordinary prompt', async () => {
    const f = newFixture({}, () => Promise.resolve(completion('A database stores organized information.')));
    const r = await f.tool.execute({ question: 'Do not reply with one sentence. Explain what a database does.' }, ctx());
    assert.equal(r.ok, true);
    assert.ok(system(f).startsWith('You are Joe,'));
    assert.ok(!system(f).includes('exactly one sentence'));
    closed(f, 1);
  });
  await check('negative language clause is an independent clause, not a format opt-out', async () => {
    const question = 'Is Python a database? Do not answer in Arabic. Reply with one word.';
    const f = newFixture({}, () => Promise.resolve(completion('No')));
    const r = await f.tool.execute({ question }, ctx());
    assert.equal(r.ok, true); assert.equal(r.output, 'No');
    assert.ok(system(f).includes('exactly one word or number'));
    closed(f, 1);
  });
  await check('original question and standing rules survive the sentence prefill', async () => {
    const rules = 'Use project vocabulary and do not invent a test result. '.repeat(10);
    const question = 'Define a database. Reply in one English sentence.';
    const f = newFixture({}, () => Promise.resolve(completion('A database stores organized information.')));
    const r = await f.tool.execute({ question }, ctx({ systemInstructions: rules }));
    assert.equal(r.ok, true);
    assert.ok(system(f).includes(rules.trim()));
    assert.equal(f.observations.sdk[0].body.messages.find((x) => x.role === 'user').content, question);
    closed(f, 1);
  });
  await check('tighter caller timeout reaches the route unchanged', async () => {
    const f = newFixture({}, () => Promise.resolve(completion('A database stores organized information.')));
    const r = await f.tool.execute({ question: 'Define a database. Reply in one English sentence.' }, ctx({ providerTimeoutMs: 14000 }));
    assert.equal(r.ok, true);
    assert.equal(f.observations.sdk[0].requestOptions.timeout, 14000);
    assert.equal(f.observations.sdk[0].body.max_tokens, 128);
    closed(f, 1);
  });
  await check('truncated terminal completion refuses honestly', async () => {
    const f = newFixture({}, () => Promise.resolve({ choices: [{ finish_reason: 'length', message: { content: 'A database stores' } }] }));
    const r = await f.tool.execute({ question: 'Define a database. Reply in one English sentence.' }, ctx());
    assert.equal(r.ok, false);
    assert.equal(r.output.reason, 'answer_completion_limit');
    closed(f, 1);
  });
  await check('pre-aborted owner cancels before routing, with no timer or fallback', async () => {
    const f = newFixture({}, () => new Promise(() => {}));
    const c = new AbortController(); c.abort();
    const r = await f.tool.execute({ question: 'Define a database. Reply in one English sentence.' }, ctx({ signal: c.signal }));
    assert.equal(r.ok, false);
    assert.equal(r.output.reason, 'cancelled');
    assert.equal(f.observations.sdk.length, 0);
    assert.equal(f.timers.size, 0);
  });
  await check('strict route keeps the selected model with no fallback', async () => {
    const f = newFixture({}, () => Promise.resolve(completion('A database stores organized information.')));
    const r = await f.tool.execute({ question: 'Define a database. Reply in one English sentence.' }, ctx());
    assert.equal(r.ok, true);
    for (const e of f.observations.sdk) assert.equal(e.body.model, selected.model);
    closed(f, 1);
  });
  await check('referenced sentence request cannot conflict with active word validator and cap', async () => {
    const question = "For context I previously asked 'Reply with one sentence'; now reply with one word: is SQLite a database?";
    const f = newFixture({}, () => Promise.resolve(completion('Yes')));
    const r = await f.tool.execute({ question }, ctx());
    assert.equal(r.ok, true); assert.equal(r.output, 'Yes');
    assert.ok(system(f).includes('exactly one word or number'));
    assert.ok(!system(f).includes('exactly one sentence'));
    assert.equal(f.observations.sdk[0].body.max_tokens, 32);
    assert.equal(f.observations.sdk[0].body.model, selected.model);
    assert.equal(f.observations.sdk[0].requestOptions.timeout, 300000);
    closed(f, 1);
  });
  const result = { atUTC: new Date().toISOString(), scope: 'Sentence answer contract with closed inert transport. Behavior tests only; no semantic or inference-speed proof.', sourceReads, rows, passed: rows.filter((x) => x.pass).length, failed: rows.filter((x) => !x.pass).length };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result)); process.exitCode = result.failed ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
