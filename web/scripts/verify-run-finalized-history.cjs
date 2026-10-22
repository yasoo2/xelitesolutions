const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

// Execute the actual Joe subscriber and history effect without React, HTTP,
// sockets, or external writes. Optional source argument proves baseline reds.
const sourcePath = process.argv[2] ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '../src/pages/Joe.tsx');
// Hash the exact bytes parsed; optional EXPECTED_SOURCE_SHA256 pins a review.
const sourceBytes = readFileSync(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex').toUpperCase();
const expectedHash = process.env?.EXPECTED_SOURCE_SHA256;
if (expectedHash) assert.equal(sourceHash, expectedHash.toUpperCase(), 'Unexpected source pin');
console.log(`SOURCE_SHA256 ${sourceHash} ${sourcePath}`);
test.after(() => assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex').toUpperCase(), sourceHash, 'Source changed during verification'));
const source = sourceBytes.toString('utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let mine, subscriber, historyEffect, pendingFileRefresh;
(function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'mine') mine = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'pendingFileRefreshRunIds') pendingFileRefresh = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'SocketService.subscribe'
      && node.arguments[0]?.getText(ast).includes('terminalRunIdsRef')) subscriber = node.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes('loadedHistorySessionRef')
      && node.arguments[1]?.getText(ast).includes('historyRefreshTick')) historyEffect = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
})(ast);
assert(mine && subscriber && historyEffect, 'Actual scoped subscriber and history effect must exist');
const compile = code => ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022,
} }).outputText;
const subscriberCode = compile(`const mine = ${mine}; const pendingFileRefreshRunIds = ${pendingFileRefresh || 'new Set()'}; this.receive = ${subscriber};`);
const historyCode = compile(`this.effect = ${historyEffect};`);

function consumer() {
  const calls = [];
  const context = { activeSessionId: 's',
    terminalRunIdsRef: { current: new Set(['a']) },
    terminalSessionIdsRef: { current: new Set(['s']) },
    setHistoryRefreshTick: fn => calls.push(['history', fn(10)]),
    setIsConnected: value => calls.push(['connected', value]),
    setDepartmentStatus: value => calls.push(['department', value]),
    setIsLoading: value => calls.push(['loading', value]),
    setWorkspaceTab: value => calls.push(['workspace', value]),
    keepBrowserVisibleRef: { current: false },
    window: { dispatchEvent: () => calls.push(['dispatch']) }, CustomEvent: class {}, setTimeout() {},
  };
  vm.runInNewContext(subscriberCode, context);
  return { context, calls, send: event => context.receive(event) };
}
test('Joe refreshes persisted history after a scoped finalized receipt, bypassing closed-run tombstones only for presentation', () => {
  const f = consumer();
  f.send({ type: 'run_finalized', sessionId: 's', runId: 'a' });
  assert.deepEqual(f.calls, [['history', 11]]);
  assert.deepEqual([...f.context.terminalRunIdsRef.current], ['a']);
  assert.deepEqual([...f.context.terminalSessionIdsRef.current], ['s']);
});
for (const event of [
  { type: 'run_finalized', sessionId: 'other', runId: 'a' },
  { type: 'run_finalized', runId: 'a' },
  { type: 'text', sessionId: 's', runId: 'a', data: { text: 'late' } },
]) test(`Joe ignores ${JSON.stringify(event)} without changing lifecycle or panels`, () => {
  const f = consumer(); f.send(event); assert.deepEqual(f.calls, []);
});

function history(switched = false) {
  const initial = [{ id: 'prompt', role: 'user', content: 'stop me' }];
  let messages = initial;
  const pending = [];
  const context = { activeSessionId: 's',
    loadedHistorySessionRef: { current: switched ? 'old' : 's' },
    messagesRef: { current: initial },
    visiblePipelineReportsRef: { current: new Set() },
    setMessages: value => { messages = typeof value === 'function' ? value(messages) : value; },
    setIsLoading() {}, setDepartmentStatus() {},
    api: { get: url => new Promise((resolve, reject) => pending.push({ url, resolve, reject })) },
    i18n: { language: 'en' }, isEngineeringReport: () => false,
    summarizeEngineeringReport: text => text, Date,
  };
  vm.runInNewContext(historyCode, context);
  const cleanup = context.effect();
  const reply = async () => {
    assert.equal(pending[0].url, '/sessions/s/messages');
    pending[0].resolve({ events: [
      { type: 'user_input', id: 'persisted-user', data: { text: 'stop me' }, ts: 1000 },
      { type: 'text', id: 'stopped', data: { text: 'Stopped at your request.' }, ts: 2000 },
    ] });
    await Promise.resolve(); await Promise.resolve();
  };
  return { context, cleanup, reply, messages: () => messages,
    append: message => { messages = [...messages, message]; context.messagesRef.current = messages; } };
}
for (const switched of [false, true]) {
  test(`${switched ? 'Session switch' : 'Same-session receipt'} loads persisted stopped answer when messages stay unchanged`, async () => {
    const f = history(switched); await f.reply();
    assert.deepEqual(Array.from(f.messages(), message => message.id), ['persisted-user', 'stopped']);
  });
  for (const role of ['user', 'assistant']) test(`${switched ? 'Session switch' : 'Same-session receipt'} cannot overwrite a newer ${role} message`, async () => {
    const f = history(switched);
    f.append({ id: 'newer', role, content: 'new activity' });
    const before = f.messages(); await f.reply(); assert.equal(f.messages(), before);
    assert.equal(f.messages().at(-1).id, 'newer');
  });
  test(`${switched ? 'Session switch' : 'Same-session receipt'} cleanup rejects a late history response`, async () => {
    const f = history(switched); const before = f.messages(); f.cleanup();
    await f.reply(); assert.equal(f.messages(), before);
  });
}
test('Overlapping history effects discard the older response after cleanup', async () => {
  const f = history(); f.cleanup();
  f.append({ id: 'successor', role: 'user', content: 'next' });
  const before = f.messages(); await f.reply(); assert.equal(f.messages(), before);
});
for (const type of ['run_finished', 'run_cancelled', 'run_failed', 'run_completed', 'run_finalized']) {
  test(`Joe ignores superseded ${type} presentation without history, lifecycle or tombstone mutations`, () => {
    const f = consumer();
    f.send({ type, sessionId: 's', runId: 'b', suppressPresentation: true });
    assert.deepEqual(f.calls, []);
    assert.deepEqual([...f.context.terminalRunIdsRef.current], ['a']);
    assert.deepEqual([...f.context.terminalSessionIdsRef.current], ['s']);
  });
}
test('normalized trusted completion replay refreshes history once and settles presentation loading', () => {
  const f = consumer(); f.send({ type: 'run_finished', sessionId: 's', runId: 'b' });
  assert.equal(f.calls.filter(call => call[0] === 'history').length, 1);
  assert.equal(f.calls.some(call => call[0] === 'loading' && call[1] === false), true);
  assert.equal(f.context.terminalRunIdsRef.current.has('b'), true);
});


// React StrictMode replays effects before queued state clears necessarily render.
// Run the actual effect twice with its first cleanup; keep the render ref stale
// until explicit new activity. No React internals, HTTP or product writes.
function replayedEmptyHistory() {
  const initial = [];
  let messages = initial;
  const pending = [];
  const context = { activeSessionId: 's', loadedHistorySessionRef: { current: undefined },
    messagesRef: { current: initial }, visiblePipelineReportsRef: { current: new Set() },
    setMessages: value => { messages = typeof value === 'function' ? value(messages) : value; },
    setIsLoading() {}, setDepartmentStatus() {}, i18n: { language: 'en' }, Date,
    isEngineeringReport: () => false, summarizeEngineeringReport: text => text,
    api: { get: url => new Promise((resolve, reject) => pending.push({ url, resolve, reject })) },
  };
  vm.runInNewContext(historyCode, context);
  const firstCleanup = context.effect();
  firstCleanup();
  const secondCleanup = context.effect();
  assert.equal(pending.length, 2);
  const reply = async index => {
    assert.equal(pending[index].url, '/sessions/s/messages');
    pending[index].resolve({ events: [
      { type: 'user_input', id: 'restored-user', data: { text: 'my old request' }, ts: 1000 },
      { type: 'text', id: 'restored-answer', data: { text: 'my saved answer' }, ts: 2000 },
    ] });
    await Promise.resolve(); await Promise.resolve();
  };
  return {context,reply,secondCleanup,messages:()=>messages,
    replaceEmpty:()=>{messages=[];},
    append:message=>{messages=[...messages,message];context.messagesRef.current=messages;}};
}
test('StrictMode empty-session effect replay restores persisted conversation without a manual reload',async()=>{
  const f=replayedEmptyHistory();await f.reply(1);
  assert.deepEqual(Array.from(f.messages(),m=>m.id),['restored-user','restored-answer']);
});
test('Replayed cancelled first history response is ignored, then current response restores history',async()=>{
  const f=replayedEmptyHistory();await f.reply(0);assert.equal(f.messages().length,0);await f.reply(1);
  assert.deepEqual(Array.from(f.messages(),m=>m.id),['restored-user','restored-answer']);
});
test('Equivalent empty state identities are not mistaken for a newer local message',async()=>{
  const f=replayedEmptyHistory();f.replaceEmpty();await f.reply(1);
  assert.deepEqual(Array.from(f.messages(),m=>m.id),['restored-user','restored-answer']);
});
for(const role of ['user','assistant'])test(`Effect replay still cannot overwrite a newer local ${role}`,async()=>{
  const f=replayedEmptyHistory();f.append({id:'new',role,content:'new activity'});const before=f.messages();
  await f.reply(1);assert.equal(f.messages(),before);assert.equal(f.messages().at(-1).id,'new');
});
test('Replayed current history cleanup rejects its late response',async()=>{
  const f=replayedEmptyHistory();f.secondCleanup();const before=f.messages();await f.reply(1);assert.equal(f.messages(),before);
});
test('An explicit clear of a nonempty base still cannot be overwritten by a pending same-session response',async()=>{
  const f=history();f.context.setMessages([]);
  const before=f.messages();await f.reply();assert.equal(f.messages(),before);
});
