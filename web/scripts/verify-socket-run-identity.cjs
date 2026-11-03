const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

// Permanent C1-C6 / S1-S14 regressions derived from Muse's independent probe.
// Exercise the actual socket handler and helpers, without connecting a socket
// or writing trace artifacts. An optional source argument proves baseline reds.
const sourcePath = process.argv[2] ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '../src/services/socket.ts');
// Hash the exact bytes parsed; optional EXPECTED_SOURCE_SHA256 pins a review.
const sourceBytes = readFileSync(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex').toUpperCase();
const expectedHash = process.env?.EXPECTED_SOURCE_SHA256;
if (expectedHash) assert.equal(sourceHash, expectedHash.toUpperCase(), 'Unexpected source pin');
console.log(`SOURCE_SHA256 ${sourceHash} ${sourcePath}`);
test.after(() => assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex').toUpperCase(), sourceHash, 'Source changed during verification'));
const source = sourceBytes.toString('utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const variables = new Set([
  'seenMessageIds', 'MAX_SEEN_IDS', 'DEFAULT_SCOPE', 'sessionRuntime',
  'TERMINAL_HISTORY_CAP', 'listeners', 'thinkingPhaseListeners',
  'thinkingDetailsListeners', 'thinkingStepsListeners',
  'thinkingStatusListeners', 'taskTrackerListeners', 'traceSealedListeners',
]);
const functions = new Set([
  'normalizeSessionId', 'eventSessionId', 'msgTypeIsLive',
  'getSessionRuntime', 'forSession', 'pushStep', 'sealTrace', 'registerRunPresentation', 'invalidateRunPresentation',
  'beginRunPresentation', 'endRunPresentation',
]);
const found = new Set();
const parts = [];
for (const statement of ast.statements) {
  if (ts.isVariableStatement(statement)) {
    const names = statement.declarationList.declarations.map(node => node.name.getText(ast));
    if (names.some(name => variables.has(name))) {
      parts.push(statement.getText(ast));
      names.forEach(name => found.add(name));
    }
  }
  if (ts.isFunctionDeclaration(statement) && functions.has(statement.name?.text)) {
    parts.push(statement.getText(ast).replace(/^export\s+/, ''));
    found.add(statement.name.text);
  }
}
for (const name of [...variables, ...functions]) {
  if (!['registerRunPresentation', 'invalidateRunPresentation', 'beginRunPresentation', 'endRunPresentation'].includes(name)) assert(found.has(name), `Actual ${name} must exist`);
}
let handler;
(function visit(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && node.left.getText(ast) === 'socket.onmessage') handler = node.right.getText(ast);
  ts.forEachChild(node, visit);
})(ast);
assert(handler, 'Actual socket.onmessage must exist');
const harness = `${parts.join('\n')}
const saveTrace = trace => this.savedTraces.push(trace);
const AutoOpenManager = { processStepEvent() {} };
const window = { dispatchEvent() {}, setTimeout() { return 0; }, clearTimeout() {} };
const originalSealTrace = sealTrace;
sealTrace = sid => { this.sealCalls.push(sid); originalSealTrace(sid); };
this.deliver = ${handler};
this.state = sid => getSessionRuntime(sid);
this.registerPresentation = typeof registerRunPresentation === 'function' ? registerRunPresentation : () => false;
this.invalidatePresentation = typeof invalidateRunPresentation === 'function' ? invalidateRunPresentation : () => {};
this.beginPresentation = typeof beginRunPresentation === 'function' ? beginRunPresentation : () => 0;
this.endPresentation = typeof endRunPresentation === 'function' ? endRunPresentation : () => {};
this.listenActual = (sid, cb) => listeners.add({ sessionId: sid, cb });
this.observe = sid => {
  const signals = { phases: [], statuses: [], steps: [], sealed: [], messages: [] };
  thinkingPhaseListeners.add({ sessionId: sid || undefined, cb: phase => signals.phases.push(phase) });
  thinkingStatusListeners.add({ sessionId: sid || undefined, cb: status => signals.statuses.push(status) });
  thinkingStepsListeners.add({ sessionId: sid || undefined, cb: steps => signals.steps.push(steps) });
  traceSealedListeners.add({ sessionId: sid || undefined, cb: trace => signals.sealed.push(trace) });
  listeners.add({ sessionId: sid || undefined, cb: message => signals.messages.push(message) });
  return signals;
};`;
const code = ts.transpileModule(harness, { compilerOptions: {
  module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022,
} }).outputText;

function fixture() {
  let tick = 1000;
  const context = { savedTraces: [], sealCalls: [], Date: { now: () => ++tick },
    CustomEvent: class {}, console };
  vm.runInNewContext(code, context, { timeout: 1000 });
  const signals = context.observe('s');
  return { context, signals, state: sid => context.state(sid === undefined ? 's' : sid),
    send(message) { context.deliver({ data: JSON.stringify(message) }); },
    event(type, runId, sessionId = 's', data) {
      this.send({ type, ...(sessionId ? { sessionId } : {}), ...(runId ? { runId } : {}), ...(data !== undefined ? { data } : {}) });
    },
    start(runId = 'b', sid = 's') { this.event('run_started', runId, sid); },
    detail(runId = 'b', sid = 's') { this.event('thinking_detail', runId, sid, { detail: 'Working on the requested change' }); },
    assertLive(runId = 'b', sid = 's') {
      const state = this.state(sid);
      assert.equal(state.activeRunId, runId);
      assert.equal(state.closedAt, 0);
      assert(state.runStartedAt > 0);
      assert.notEqual(state.thinkingPhase, 'idle');
    },
  };
}
const terminalTypes = ['run_finished', 'run_failed', 'run_cancelled', 'run_completed'];
const idleCount = signals => signals.phases.filter(phase => phase === 'idle').length;
const copy = value => JSON.parse(JSON.stringify(value));
function unchangedAfter(f, action, sid = 's') {
  const before = copy({ state: f.state(sid), signals: f.signals,
    saved: f.context.savedTraces, sealCalls: f.context.sealCalls });
  action();
  assert.deepEqual(copy({ state: f.state(sid), signals: f.signals,
    saved: f.context.savedTraces, sealCalls: f.context.sealCalls }), before);
}

for (const terminal of terminalTypes) {
  test(`S1 stale ${terminal} cannot close successor or emit idle/seal`, () => {
    const f = fixture(); f.start('a'); f.start('b'); f.detail();
    unchangedAfter(f, () => f.event(terminal, 'a'));
    f.event('tool_started', 'b', 's', {}); f.assertLive();
    assert.equal(f.signals.messages.at(-1).type, 'tool_started');
  });
}
for (const id of ['', 'a']) {
  test(`S2 interim text ${id || 'without identity'} preserves B and content delivery`, () => {
    const f = fixture(); f.start(); f.detail(); const state = copy(f.state());
    const seals = f.context.sealCalls.length;
    f.event('text', id, 's', 'Interim output must remain visible');
    assert.deepEqual(copy(f.state()), state); f.assertLive();
    assert.equal(idleCount(f.signals), 0); assert.equal(f.context.sealCalls.length, seals);
    assert.equal(f.signals.messages.at(-1).data, 'Interim output must remain visible');
  });
}
test('S3 interim B text then B terminal closes once with one idle and one trace seal', () => {
  const f = fixture(); f.start(); f.detail(); const seals = f.context.sealCalls.length;
  f.event('text', 'b', 's', 'Partial answer'); f.assertLive();
  f.event('run_finished', 'b');
  assert.equal(f.state().activeRunId, ''); assert(f.state().closedAt > 0);
  assert.equal(idleCount(f.signals), 1); assert.equal(f.context.sealCalls.length, seals + 1);
  assert.equal(f.context.savedTraces.length, 1); assert.equal(f.signals.sealed.length, 1);
  unchangedAfter(f, () => f.event('run_finished', 'b'));
});
for (const terminal of terminalTypes) {
  test(`S4 matching ${terminal} closes an identified active run`, () => {
    const f = fixture(); f.start(); f.detail(); f.event(terminal, 'b');
    assert.equal(f.state().activeRunId, ''); assert(f.state().closedAt > 0);
    assert.equal(f.state().runStartedAt, 0); assert.equal(f.state().thinkingPhase, 'idle');
    assert.equal(idleCount(f.signals), 1); assert.equal(f.signals.sealed.length, 1);
  });
  test(`S5 never-started ${terminal} is a no-op without any notification`, () => {
    const f = fixture(); unchangedAfter(f, () => f.event(terminal, 'never'));
    assert.equal(f.state().runStartedAt, 0); assert.equal(f.state().closedAt, 0);
  });
}
for (const type of ['tool_started', 'step_started', 'step_progress', 'step_done', 'step_failed']) {
  test(`S6 stale ${type} A cannot retarget B or mutate its trace`, () => {
    const f = fixture(); f.start(); f.detail();
    unchangedAfter(f, () => f.event(type, 'a', 's', {})); f.assertLive();
  });
}
test('S7 a live event adopts an identity when none is known', () => {
  const f = fixture(); f.start(''); f.event('tool_started', 'b', 's', {}); f.assertLive();
  assert.equal(f.signals.messages.at(-1).type, 'tool_started');
});
for (const opener of ['user_input', 'run_started']) {
  test(`S8 ${opener} explicitly opens B while A is live`, () => {
    const f = fixture(); f.start('a'); f.event(opener, 'b'); f.assertLive();
  });
  test(`S8/S12 ${opener} explicitly reopens B after A closes`, () => {
    const f = fixture(); f.start('a'); f.event('run_finished', 'a'); f.event(opener, 'b');
    assert.equal(f.state().activeRunId, 'b'); assert.equal(f.state().closedAt, 0);
    assert.notEqual(f.state().thinkingPhase, 'idle');
    f.event('tool_started', 'b', 's', {});
    assert.equal(f.signals.messages.at(-1).type, 'tool_started');
  });
}
test('S9 unknown-identity legacy text still completes and seals its trace', () => {
  const f = fixture(); f.start(''); f.detail(''); f.event('text', '', 's', 'Legacy final answer');
  assert(f.state().closedAt > 0); assert.equal(f.state().thinkingPhase, 'idle');
  assert.equal(idleCount(f.signals), 1); assert.equal(f.signals.sealed.length, 1);
  assert.equal(f.signals.messages.at(-1).data, 'Legacy final answer');
});
test('S10 unknown-identity legacy terminal still completes', () => {
  const f = fixture(); f.start(''); f.detail(''); f.event('run_finished', '');
  assert(f.state().closedAt > 0); assert.equal(f.state().thinkingPhase, 'idle');
  assert.equal(idleCount(f.signals), 1); assert.equal(f.signals.sealed.length, 1);
});
test('S10 thinking_phase-only legacy activity closes without an initial start or trace step', () => {
  const f = fixture(); f.event('thinking_phase', '', 's', { phase: 'analyzing' });
  assert.equal(f.state().runStartedAt, 0); assert.equal(f.state().activeRunId, '');
  assert.equal(f.state().thinkingPhase, 'analyzing');
  f.event('run_finished', '');
  assert(f.state().closedAt > 0); assert.equal(f.state().thinkingPhase, 'idle');
  assert.equal(idleCount(f.signals), 1); assert.equal(f.context.sealCalls.length, 1);
  assert.equal(f.signals.sealed.length, 0);
  unchangedAfter(f, () => f.event('run_finished', ''));
});
for (const terminal of terminalTypes) {
  test(`S11 unidentified ${terminal} cannot close known B`, () => {
    const f = fixture(); f.start(); f.detail(); unchangedAfter(f, () => f.event(terminal, '')); f.assertLive();
  });
}
test('S12 duplicate terminal and late live/text lines cannot reseal or resurrect a closed run', () => {
  const f = fixture(); f.start(); f.detail(); f.event('run_finished', 'b');
  unchangedAfter(f, () => {
    for (const terminal of terminalTypes) f.event(terminal, 'b');
    for (const type of ['tool_started', 'step_started', 'step_done', 'thinking_detail', 'text']) {
      f.event(type, 'b', 's', { detail: 'Late output' });
    }
  });
  assert.equal(idleCount(f.signals), 1); assert.equal(f.signals.sealed.length, 1);
});
test('S12 identical transport messages are delivered only once', () => {
  const f = fixture(); const message = { id: 'unique-start', type: 'run_started', sessionId: 's', runId: 'b' };
  f.send(message); f.detail(); unchangedAfter(f, () => f.send(message)); f.assertLive();
});
for (const envelope of ['top', 'nested', 'deep']) {
  test(`S13 ${envelope} session X terminal/text/live cannot affect Y or its listeners`, () => {
    const f = fixture(); f.start('b', 's'); f.detail(); const y = copy(f.state());
    const signals = copy(f.signals);
    const sendX = (type, runId, content) => {
      const message = { type, ...(runId ? { runId } : {}), data: content || {} };
      if (envelope === 'top') message.sessionId = 'x';
      else if (envelope === 'nested') message.data = { sessionId: 'x', content };
      else message.data = { data: { sessionId: 'x' }, content };
      f.send(message);
    };
    sendX('run_started', 'x1'); sendX('thinking_detail', 'x1', { detail: 'X work' });
    sendX('text', 'x1', 'X output'); sendX('tool_started', 'x1'); sendX('run_finished', 'x1');
    assert.deepEqual(copy(f.state()), y); assert.deepEqual(copy(f.signals), signals); f.assertLive();
    assert.equal(f.state('x').activeRunId, ''); assert(f.state('x').closedAt > 0);
  });
}
test('S14 unscoped terminal stays in legacy bucket and cannot close a named session', () => {
  const f = fixture(); f.start(); f.detail(); const named = copy(f.state()); const signals = copy(f.signals);
  f.event('run_started', 'legacy', '');
  f.event('run_finished', 'legacy', '', { data: {} });
  assert.deepEqual(copy(f.state()), named); assert.deepEqual(copy(f.signals), signals); f.assertLive();
  assert.equal(f.state('').activeRunId, ''); assert(f.state('').closedAt > 0);
});
test('S1/S4/S13 nested run and session identities obey the same close fence', () => {
  const f = fixture(); f.send({ type: 'run_started', data: { sessionId: 's', runId: 'b' } });
  f.detail(); f.assertLive();
  unchangedAfter(f, () => f.send({ type: 'run_finished', data: { sessionId: 's', runId: 'a' } }));
  f.send({ type: 'run_finished', data: { sessionId: 's', runId: 'b' } });
  assert.equal(f.state().activeRunId, ''); assert(f.state().closedAt > 0);
  assert.equal(idleCount(f.signals), 1); assert.equal(f.signals.sealed.length, 1);
});

// A final run_finished after an earlier terminal is a persistence receipt,
// not another live transition and not permission to deliver late output.
for (const terminal of ['run_cancelled', 'run_failed', 'run_completed']) {
  test(`finalization receipt after ${terminal} is scoped, one-shot and presentation-only`, () => {
    const f = fixture(); f.start(); f.detail(); f.event(terminal, 'b');
    const before = copy({ state: f.state(), signals: f.signals,
      seals: f.context.sealCalls, saved: f.context.savedTraces });
    f.event('run_finished', 'b');
    assert.deepEqual(copy(f.signals.messages.at(-1)), { type: 'run_finalized', sessionId: 's', runId: 'b' });
    assert.equal(f.signals.messages.length, before.signals.messages.length + 1);
    assert.equal(f.signals.messages.some(message => message.type === 'run_finished'), false);
    // Only receipt bookkeeping may change; no live runtime or trace transition.
    const after = copy(f.state());
    for (const field of ['pendingFinalRunId', 'presentedRunId', 'lastFinalizedRunId']) {
      delete after[field]; delete before.state[field];
    }
    assert.deepEqual(after, before.state);
    for (const signal of ['phases', 'statuses', 'steps', 'sealed']) {
      assert.deepEqual(copy(f.signals[signal]), before.signals[signal]);
    }
    assert.deepEqual(copy(f.context.sealCalls), before.seals);
    assert.deepEqual(copy(f.context.savedTraces), before.saved);
    unchangedAfter(f, () => {
      f.event('run_finished', 'b');
      f.send({ id: 'distinct-duplicate-finished', type: 'run_finished', sessionId: 's', runId: 'b' });
    });
  });
}
test('a successor opener invalidates the old pending presentation receipt', () => {
  const f = fixture(); f.start('a'); f.event('run_cancelled', 'a'); f.start('b');
  unchangedAfter(f, () => f.event('run_finished', 'a')); f.assertLive();
  assert.equal(f.signals.messages.some(message => message.type === 'run_finalized'), false);
});
test('user_input alone invalidates the old pending receipt without requiring run_started', () => {
  const f = fixture(); f.start('a'); f.event('run_failed', 'a'); f.event('user_input', 'b');
  unchangedAfter(f, () => f.event('run_finished', 'a'));
  assert.equal(f.state().activeRunId, 'b'); assert.equal(f.state().closedAt, 0);
});
test('closing successor B does not let A consume the newer pending receipt', () => {
  const f = fixture(); f.start('a'); f.event('run_cancelled', 'a'); f.start('b'); f.event('run_completed', 'b');
  unchangedAfter(f, () => f.event('run_finished', 'a'));
  f.event('run_finished', 'b'); assert.equal(f.signals.messages.at(-1).type, 'run_finalized');
  assert.equal(f.signals.messages.at(-1).runId, 'b');
});
test('another session final cannot consume the named session pending receipt', () => {
  const f = fixture(); f.start(); f.event('run_cancelled', 'b');
  unchangedAfter(f, () => f.event('run_finished', 'b', 'x'));
  f.event('run_finished', 'b'); assert.equal(f.signals.messages.at(-1).type, 'run_finalized');
  assert.equal(f.signals.messages.at(-1).sessionId, 's');
});
test('unidentified completion cannot consume an identified pending receipt', () => {
  const f = fixture(); f.start(); f.event('run_cancelled', 'b');
  unchangedAfter(f, () => f.event('run_finished', ''));
  f.event('run_finished', 'b'); assert.equal(f.signals.messages.at(-1).type, 'run_finalized');
});
test('unknown-identity early close cannot generate a later identified receipt', () => {
  const f = fixture(); f.start(''); f.event('run_cancelled', '');
  unchangedAfter(f, () => f.event('run_finished', 'b'));
});
test('never-started terminals cannot fabricate a finalization receipt', () => {
  const f = fixture(); unchangedAfter(f, () => { f.event('run_cancelled', 'b'); f.event('run_finished', 'b'); });
});
test('unscoped early close remains unscoped and cannot emit a presentation receipt', () => {
  const f = fixture(); const all = f.context.observe(''); f.start('b', ''); f.event('run_cancelled', 'b', '');
  const messages = all.messages.length;
  f.event('run_finished', 'b', ''); assert.equal(all.messages.length, messages);
  assert.equal(all.messages.some(message => message.type === 'run_finalized'), false);
});
test('late text and tool events remain dropped without consuming the pending receipt', () => {
  const f = fixture(); f.start(); f.detail(); f.event('run_cancelled', 'b');
  unchangedAfter(f, () => {
    f.event('text', 'b', 's', { text: 'Stopped at your request' });
    f.event('tool_started', 'b', 's', {}); f.event('step_done', 'b', 's', {});
  });
  f.event('run_finished', 'b'); assert.equal(f.signals.messages.at(-1).type, 'run_finalized');
});
for (const envelope of ['nested', 'deep']) {
  test(`${envelope} native envelope normalizes receipt ownership into top-level session and run IDs`, () => {
    const f = fixture(); f.start(); f.event('run_failed', 'b');
    f.send({ type: 'run_finished', data: envelope === 'nested'
      ? { sessionId: 's', runId: 'b' } : { runId: 'b', data: { sessionId: 's' } } });
    assert.deepEqual(copy(f.signals.messages.at(-1)), { type: 'run_finalized', sessionId: 's', runId: 'b' });
  });
}

const present = (f, rid = 'b', sid = 's', revision) => f.context.registerPresentation(sid, rid, revision);
const receipts = f => f.signals.messages.filter(message => message.type === 'run_finalized');
function closedA() { const f = fixture(); f.start('a'); f.event('run_finished', 'a'); return f; }
test('HTTP-only presentation B after closed A recovers native early-stop completion without reopening runtime', () => {
  const f = closedA(); assert.equal(present(f), true);
  const before = copy({ state: f.state(), phases: f.signals.phases, statuses: f.signals.statuses,
    steps: f.signals.steps, sealed: f.signals.sealed, saves: f.context.savedTraces, seals: f.context.sealCalls });
  f.event('text', 'b', 's', { text: 'Stopped before any new step was executed.' });
  f.send({ type: 'run_finished', runId: 'b', data: { runId: 'b', sessionId: 's', ok: false } });
  assert.deepEqual(copy(receipts(f)), [{ type: 'run_finalized', sessionId: 's', runId: 'b' }]);
  const after = copy({ state: f.state(), phases: f.signals.phases, statuses: f.signals.statuses,
    steps: f.signals.steps, sealed: f.signals.sealed, saves: f.context.savedTraces, seals: f.context.sealCalls });
  delete before.state.presentedRunId; delete before.state.lastFinalizedRunId;
  delete after.state.presentedRunId; delete after.state.lastFinalizedRunId;
  assert.deepEqual(after, before);
  f.event('run_finished', 'b'); assert.equal(receipts(f).length, 1);
  assert.equal(present(f), false, 'Finalized identity cannot be re-armed');
});
test('presentation registration cannot retarget a known live successor', () => {
  const f = fixture(); f.start('c');
  unchangedAfter(f, () => assert.equal(present(f), false)); f.assertLive('c');
});
test('presentation registration requires both session and run identity', () => {
  const f = closedA();
  for (const [sid, rid] of [['', 'b'], ['s', ''], [' ', 'b'], ['s', ' ']]) {
    unchangedAfter(f, () => assert.equal(present(f, rid, sid), false));
  }
});
for (const opener of ['run_started', 'user_input']) {
  test(`different ${opener} invalidates B presentation and preserves C liveness`, () => {
    const f = closedA(); assert.equal(present(f), true); f.event(opener, 'c');
    f.event('run_finished', 'b'); assert.equal(receipts(f).length, 0);
    assert.equal(f.state().activeRunId, 'c'); assert.equal(f.state().closedAt, 0);
  });
  test(`matching ${opener} echo consumes presentation only on ordinary live completion`, () => {
    const f = closedA(); assert.equal(present(f), true); f.event(opener, 'b');
    assert.equal(f.state().presentedRunId, 'b'); f.event('run_finished', 'b');
    assert.equal(receipts(f).length, 0, 'Ordinary finished already reaches history consumer');
    assert.equal(f.state().presentedRunId, ''); assert.equal(present(f), false);
    unchangedAfter(f, () => f.event('run_finished', 'b'));
  });
  test(`unidentified ${opener} invalidates an older identified presentation`, () => {
    const f = closedA(); assert.equal(present(f), true); f.event(opener, '');
    assert.equal(f.state().presentedRunId, ''); f.event('run_finished', 'b');
    assert.equal(receipts(f).length, 0);
  });
}
test('wrong session, wrong ID and unidentified final cannot consume HTTP presentation B', () => {
  const f = closedA(); assert.equal(present(f), true);
  f.event('run_finished', 'b', 'other'); f.event('run_finished', 'a'); f.event('run_finished', '');
  assert.equal(receipts(f).length, 0); assert.equal(f.state().presentedRunId, 'b');
  f.event('run_finished', 'b'); assert.equal(receipts(f).length, 1);
});
test('a newer presentation replaces B without allowing its late final to consume C', () => {
  const f = closedA(); assert.equal(present(f), true); assert.equal(present(f, 'c'), true);
  f.event('run_finished', 'b'); assert.equal(receipts(f).length, 0);
  f.event('run_finished', 'c'); assert.equal(receipts(f)[0].runId, 'c');
});
test('late tools and text remain fenced while HTTP presentation capability is armed', () => {
  const f = closedA(); assert.equal(present(f), true);
  for (const type of ['text', 'tool_started', 'thinking_detail', 'terminal_output']) {
    unchangedAfter(f, () => f.event(type, 'b', 's', type === 'text' ? { text: 'late' } : 'late'));
  }
  f.event('run_finished', 'b'); assert.equal(receipts(f).length, 1);
});
test('same presentation registration is idempotent and emits no listener notification', () => {
  const f = closedA(); assert.equal(present(f), true);
  unchangedAfter(f, () => assert.equal(present(f), true));
});
test('finished before HTTP admission remains a documented non-replayed receipt gap', () => {
  const f = closedA(); f.event('run_finished', 'b'); assert.equal(receipts(f).length, 0);
  assert.equal(present(f), true); assert.equal(receipts(f).length, 0);
});
test('a new submission invalidates both an older capability and pending early-terminal receipt', () => {
  const f = closedA(); assert.equal(present(f), true);
  f.context.invalidatePresentation('s'); assert.equal(f.state().presentedRunId, '');
  f.event('run_finished', 'b'); assert.equal(receipts(f).length, 0);
  f.start('b'); f.event('run_cancelled', 'b');
  f.context.invalidatePresentation('s'); f.event('run_finished', 'b');
  assert.equal(receipts(f).length, 0);
});
test('old early-terminal arriving during a newer pending submission cannot re-arm its final history receipt', () => {
  const f = fixture(); f.start('b'); assert.equal(present(f), true);
  f.context.invalidatePresentation('s');
  f.event('run_cancelled', 'b'); f.event('run_finished', 'b');
  assert.equal(receipts(f).length, 0, 'C has been submitted; old B completion cannot start a history refresh');
});
for (const opener of ['run_started', 'user_input']) {
  test(`blocked old B ${opener} cannot release receipt suppression during C submission`, () => {
    const f = fixture(); f.start('b'); assert.equal(present(f), true);
    f.context.invalidatePresentation('s'); f.event(opener, 'b');
    assert.equal(f.state().presentationSuppressed, true);
    assert.equal(present(f), false); f.event('run_cancelled', 'b'); f.event('run_finished', 'b');
    assert.equal(receipts(f).length, 0);
  });
  test(`unknown ${opener} cannot release old B receipt suppression`, () => {
    const f = fixture(); f.start('b'); f.context.invalidatePresentation('s'); f.event(opener, '');
    assert.equal(f.state().presentationSuppressed, true);
    f.event('run_cancelled', 'b'); f.event('run_finished', 'b'); assert.equal(receipts(f).length, 0);
  });
  test(`fresh identified C ${opener} releases suppression for its own completion only`, () => {
    const f = fixture(); f.start('b'); f.context.invalidatePresentation('s'); f.event(opener, 'c');
    assert.equal(f.state().presentationSuppressed, false);
    f.event('run_cancelled', 'b'); f.event('run_finished', 'b'); assert.equal(receipts(f).length, 0);
    f.event('run_cancelled', 'c'); f.event('run_finished', 'c');
    assert.deepEqual(copy(receipts(f)), [{ type: 'run_finalized', sessionId: 's', runId: 'c' }]);
  });
}
test('fresh HTTP C releases suppression after B has closed without admitting old B again', () => {
  const f = fixture(); f.start('b'); f.context.invalidatePresentation('s'); f.event('run_cancelled', 'b');
  assert.equal(present(f), false); assert.equal(present(f, 'c'), true);
  assert.equal(f.state().presentationSuppressed, false);
  f.event('run_finished', 'b'); assert.equal(receipts(f).length, 0);
  f.event('run_finished', 'c'); assert.equal(receipts(f)[0].runId, 'c');
});
test('delayed blocked B opener and direct finish cannot trigger raw history refresh while C is pending', () => {
  const f = closedA(); assert.equal(present(f), true); f.context.invalidatePresentation('s');
  const count = f.signals.messages.length;
  f.start('b'); f.event('run_finished', 'b');
  const late = f.signals.messages.slice(count);
  assert.equal(late.some(message => message.type === 'run_finalized'), false);
  assert(late.filter(message => message.type === 'run_finished').every(message => message.suppressPresentation === true),
    'Old terminal identity reaches lifecycle subscribers with presentation explicitly suppressed');
});
test('blocked live B direct finish cannot refresh history after C was submitted', () => {
  const f = fixture(); f.start('b'); f.context.invalidatePresentation('s');
  const count = f.signals.messages.length; f.event('run_finished', 'b');
  const terminal = f.signals.messages.slice(count).find(message => message.type === 'run_finished');
  assert(terminal, 'Preserve terminal evidence for registry subscribers');
  assert.equal(terminal.suppressPresentation, true); assert.equal(f.state().activeRunId, '');
  assert.equal(receipts(f).length, 0);
});
test('blocked old terminal still reaches the actual registry and prevents resurrection while preserving pending successor', () => {
  const registryPath = path.resolve(__dirname, '../src/services/runningSessions.ts');
  const registrySource = readFileSync(registryPath, 'utf8');
  const registryAst = ts.createSourceFile(registryPath, registrySource, ts.ScriptTarget.Latest, true);
  const body = registryAst.statements.filter(node => !ts.isImportDeclaration(node)
    && !(ts.isIfStatement(node) && node.expression.getText(registryAst) === 'import.meta.hot'))
    .map(node => node.getText(registryAst)).join('\n');
  const registryCode = ts.transpileModule(`${body}\nthis.noteActual = note;`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const context = { exports: {} }; vm.runInNewContext(registryCode, context);
  const registry = context.exports;
  const f = fixture(); f.start('b'); f.context.invalidatePresentation('s');
  registry.markRunning('s', true, ''); // C is submitted and awaiting its identity.
  f.event('run_cancelled', 'b');
  const terminal = f.signals.messages.at(-1);
  assert.equal(terminal.type, 'run_cancelled'); assert.equal(terminal.suppressPresentation, true);
  context.noteActual(terminal);
  assert.equal(registry.isSessionRunning('s'), true, 'Old B terminal must not close pending C');
  registry.markRunning('s', true, 'b');
  assert.equal(registry.getRunningRunId('s'), '', 'Retained B tombstone rejects stale B admission');
  registry.markRunning('s', true, 'c'); assert.equal(registry.getRunningRunId('s'), 'c');
  assert.equal(present(f, 'c'), true); f.event('run_finished', 'c'); assert.equal(receipts(f)[0].runId, 'c');
});
test('repeated submissions retain the displaced B fence while no fresh identity has arrived', () => {
  const f = closedA(); assert.equal(present(f), true);
  f.context.invalidatePresentation('s'); f.context.invalidatePresentation('s');
  assert.equal(f.state().blockedPresentationRunId, 'b');
  const count = f.signals.messages.length; f.start('b'); f.event('run_finished', 'b');
  assert.equal(f.signals.messages.slice(count).some(message => message.type === 'run_finalized'
    || (message.type === 'run_finished' && message.suppressPresentation !== true)), false);
});

const beginPending = (f, sid = 's') => f.context.beginPresentation(sid);
const replayed = f => f.signals.messages.filter(message => message.type === 'run_finished' && message.runId === 'b');
for (const bootstrap of [false, true]) {
  test(`${bootstrap ? 'First SID' : 'Closed previous run'} exact completion before HTTP is released once after token admission`, () => {
    const f = bootstrap ? fixture() : closedA(); const revision = beginPending(f);
    const before = f.signals.messages.length; f.event('run_finished', 'b');
    assert.equal(f.signals.messages.length, before); assert.equal(f.state().earlyFinalRunIds.includes('b'), true);
    assert.equal(present(f, 'b', 's', revision), true);
    assert.deepEqual(copy(f.signals.messages.at(-1)), { type: 'run_finished', sessionId: 's', runId: 'b' });
    assert.equal(f.state().awaitingPresentation, false); assert.deepEqual(copy(f.state().earlyFinalRunIds), []);
    assert.equal(f.state().activeRunId, ''); assert.equal(f.state().thinkingPhase, 'idle');
    const count = f.signals.messages.length; f.event('run_finished', 'b');
    assert.equal(present(f, 'b', 's', revision), false); assert.equal(f.signals.messages.length, count);
  });
}
test('candidate replay changes no live phase, trace, terminal history or existing closure time', () => {
  const f = closedA(); const revision = beginPending(f);
  const before = copy({ phase: f.state().thinkingPhase, closed: f.state().closedAt,
    history: f.state().terminalHistory, steps: f.state().thinkingSteps, signals: f.signals,
    saves: f.context.savedTraces, seals: f.context.sealCalls });
  f.event('run_finished', 'b'); assert.equal(present(f, 'b', 's', revision), true);
  assert.equal(f.state().closedAt, before.closed); assert.equal(f.state().thinkingPhase, before.phase);
  assert.equal(f.state().terminalHistory, before.history); assert.deepEqual(copy(f.state().thinkingSteps), before.steps);
  for (const key of ['phases', 'statuses', 'steps', 'sealed']) assert.deepEqual(copy(f.signals[key]), before.signals[key]);
  assert.deepEqual(copy(f.context.savedTraces), before.saves); assert.deepEqual(copy(f.context.sealCalls), before.seals);
});
test('unknown, foreign, blocked and previously finalized completion cannot become this SID candidate', () => {
  const f = closedA(); beginPending(f);
  f.event('run_finished', ''); f.event('run_finished', 'b', 'other'); f.event('run_finished', 'a');
  assert.deepEqual(copy(f.state().earlyFinalRunIds), []);
});
test('candidate requires an explicit current token; optional legacy registration cannot replay it', () => {
  const f = closedA(); beginPending(f); f.event('run_finished', 'b');
  const before = f.signals.messages.length; assert.equal(present(f), true);
  assert.equal(f.signals.messages.length, before);
});
test('different admitted HTTP ID drops the candidate without replaying the wrong execution', () => {
  const f = closedA(); const revision = beginPending(f); f.event('run_finished', 'b');
  const before = f.signals.messages.length; assert.equal(present(f, 'c', 's', revision), true);
  assert.equal(f.signals.messages.length, before); assert.deepEqual(copy(f.state().earlyFinalRunIds), []);
});
for (const reset of ['new submission', 'identified opener']) {
  test(`${reset} invalidates the older completion candidate before HTTP admission`, () => {
    const f = closedA(); const revision = beginPending(f); f.event('run_finished', 'b');
    if (reset === 'new submission') beginPending(f); else f.start('c');
    const before = f.signals.messages.length; assert.equal(present(f, 'b', 's', revision), false);
    assert.equal(f.signals.messages.length, before); assert.equal(replayed(f).length, 0);
  });
}
test('unknown opener retains candidate capture but cannot fabricate candidate ownership', () => {
  const f = closedA(); beginPending(f); f.event('run_started', '');
  assert.equal(f.state().awaitingPresentation, true); assert.deepEqual(copy(f.state().earlyFinalRunIds), []);
});
test('failed or rejected HTTP cleanup ends only its own candidate capture', () => {
  const f = closedA(); const revision = beginPending(f); f.event('run_finished', 'b');
  f.context.endPresentation('s', revision);
  assert.equal(f.state().awaitingPresentation, false); assert.deepEqual(copy(f.state().earlyFinalRunIds), []);
  const before = f.signals.messages.length; present(f, 'b', 's', revision);
  assert.equal(f.signals.messages.length, before);
});
test('old finally cleanup and remounted old token cannot erase or consume a newer candidate', () => {
  const f = closedA(); const old = beginPending(f); const fresh = beginPending(f);
  f.event('run_finished', 'c'); f.context.endPresentation('s', old);
  assert.equal(f.state().awaitingPresentation, true); assert.deepEqual(copy(f.state().earlyFinalRunIds), ['c']);
  assert.equal(present(f, 'c', 's', old), false); assert.equal(present(f, 'c', 's', fresh), true);
  assert.equal(f.signals.messages.at(-1).runId, 'c');
});
test('up to four different exact candidates retain B despite foreign ID contamination; overflow is bounded', () => {
  const f = closedA(); const revision = beginPending(f);
  for (const id of ['d', 'b', 'e', 'f', 'overflow']) f.event('run_finished', id);
  assert.equal(f.state().earlyFinalRunIds.length, 4); assert.equal(f.state().earlyFinalRunIds.includes('overflow'), false);
  assert.equal(present(f, 'b', 's', revision), true); assert.equal(replayed(f).length, 1);
});
test('a legitimate fifth candidate remains a documented fail-closed bounded recovery limit', () => {
  const f = closedA(); const revision = beginPending(f);
  for (const id of ['d', 'e', 'f', 'g', 'b']) f.event('run_finished', id);
  const before = f.signals.messages.length; assert.equal(present(f, 'b', 's', revision), true);
  assert.equal(f.signals.messages.length, before); assert.equal(replayed(f).length, 0);
});
test('duplicate native transport frames occupy one candidate slot and replay once', () => {
  const f = closedA(); const revision = beginPending(f);
  f.event('run_finished', 'b'); f.send({ id: 'duplicate-distinct', type: 'run_finished', sessionId: 's', runId: 'b' });
  assert.deepEqual(copy(f.state().earlyFinalRunIds), ['b']); assert.equal(present(f, 'b', 's', revision), true);
  assert.equal(replayed(f).length, 1);
});
test('normally delivered completion is not replayed by its later HTTP registration', () => {
  const f = fixture(); const revision = beginPending(f); f.start('b'); f.event('run_finished', 'b');
  const count = f.signals.messages.length; assert.equal(present(f, 'b', 's', revision), false);
  assert.equal(f.signals.messages.length, count);
});

test('trusted HTTP replay integrates actual Composer admission, registry terminal retention and Joe history refresh', () => {
  const f = closedA();
  const registryPath = path.resolve(__dirname, '../src/services/runningSessions.ts');
  const registrySource = readFileSync(registryPath, 'utf8');
  const registryAst = ts.createSourceFile(registryPath, registrySource, ts.ScriptTarget.Latest, true);
  const body = registryAst.statements.filter(node => !ts.isImportDeclaration(node)
    && !(ts.isIfStatement(node) && node.expression.getText(registryAst) === 'import.meta.hot'))
    .map(node => node.getText(registryAst)).join('\n');
  const registryContext = { exports: {} };
  vm.runInNewContext(ts.transpileModule(`${body}\nthis.noteActual = note;`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, registryContext);
  const registry = registryContext.exports;
  const composerFile = path.resolve(__dirname, 'verify-stop-terminal-race.mjs');
  const composerPrefix = readFileSync(composerFile, 'utf8').split("test('late unconfirmed stop")[0]
    .replace(/^const sourcePath = .*;$/m, 'const sourcePath = this.sourcePath;');
  const composerContext = { require, exports: {}, console, process: { argv: [], env: {} },
    sourcePath: path.resolve(__dirname, '../src/components/CommandComposer.tsx') };
  vm.runInNewContext(ts.transpileModule(`${composerPrefix}\nthis.actualFixture = fixture();`, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText, composerContext);
  const composer = composerContext.actualFixture;
  composer.context.sessionId = 's'; composer.context.runSessionId = 's';
  composer.context.registryAdmission = registry.captureRunningAdmission('s');
  composer.context.SocketService = {
    invalidateRunPresentation: sid => f.context.invalidatePresentation(sid),
    beginRunPresentation: sid => f.context.beginPresentation(sid),
    endRunPresentation: (sid, revision) => f.context.endPresentation(sid, revision),
    registerRunPresentation: (sid, rid, revision) => f.context.registerPresentation(sid, rid, revision),
  };
  const consumerFile = path.resolve(__dirname, 'verify-run-finalized-history.cjs');
  const consumerPrefix = readFileSync(consumerFile, 'utf8').split("test('Joe refreshes persisted history")[0];
  const consumerContext = { require, __dirname, process: { argv: [] }, console };
  vm.runInNewContext(`${consumerPrefix}\nthis.actualFixture = consumer();`, consumerContext);
  const joe = consumerContext.actualFixture;
  f.context.listenActual('s', event => registryContext.noteActual(event));
  f.context.listenActual('s', event => composer.scoped(event));
  f.context.listenActual('s', event => joe.send(event));
  const epoch = composer.begin(); f.event('run_finished', 'b');
  assert.equal(joe.calls.length, 0); composer.reply('b', epoch);
  assert.equal(composer.state.status, 'idle'); assert.equal(composer.state.identity.current, null);
  assert.equal(registry.isSessionRunning('s'), false);
  registry.markRunning('s', true, 'b'); assert.equal(registry.isSessionRunning('s'), false, 'Completion tombstone survives replay');
  assert.equal(joe.calls.filter(call => call[0] === 'history').length, 1);
  assert.equal(f.state().thinkingPhase, 'idle'); assert.equal(f.state().activeRunId, '');
  composer.cleanup();
});

// API restarts reuse counters. These controls retain one fixture/cache across
// successive runs, while exercising the actual socket handler above.
const restartMarkers = [{seq: 37}, {id: 'thinking-1'}, {id: 37}, {ts: 37}];
for (const marker of restartMarkers) {
  test(`D1 a new run receives text after API counter reuse ${JSON.stringify(marker)}`, () => {
    const f = fixture(); f.start('old'); f.detail('old');
    f.send({type: 'text', sessionId: 's', runId: 'old', data: 'old result', ...marker});
    f.event('run_finished', 'old'); f.start('new'); f.detail('new');
    f.send({type: 'text', sessionId: 's', runId: 'new', data: 'new result', ...marker});
    assert.equal(f.signals.messages.at(-1).data, 'new result');
    f.event('run_finished', 'new');
    assert.equal(f.state().activeRunId, '');
    assert.equal(f.signals.sealed.length, 2);
  });
  test(`D2 sessions cannot consume each other's receipt ${JSON.stringify(marker)}`, () => {
    const f = fixture(); const other = f.context.observe('other');
    f.start('same', 's'); f.start('same', 'other');
    f.send({type: 'text', sessionId: 's', runId: 'same', data: 'first session', ...marker});
    f.send({type: 'text', sessionId: 'other', runId: 'same', data: 'second session', ...marker});
    assert.equal(f.signals.messages.at(-1).data, 'first session');
    assert.equal(other.messages.at(-1).data, 'second session');
  });
  test(`D3 exact same-run duplicate is delivered once ${JSON.stringify(marker)}`, () => {
    const f = fixture(); f.start('active');
    const event = {type: 'text', sessionId: 's', runId: 'active', data: 'one result', ...marker};
    const before = f.signals.messages.length; f.send(event); f.send(event);
    assert.equal(f.signals.messages.length - before, 1);
    f.assertLive('active');
  });
}
for (const marker of [{seq: 13}, {id: 'shared-13'}]) {
  test(`D4 different event kinds retain their own receipt ${JSON.stringify(marker)}`, () => {
    const f = fixture(); f.start('active'); f.detail('active'); const before = f.signals.messages.length;
    f.send({type: 'text', sessionId: 's', runId: 'active', data: 'visible answer', ...marker});
    f.send({type: 'run_finished', sessionId: 's', runId: 'active', ...marker});
    assert.equal(f.state().activeRunId, '');
    assert.equal(f.signals.sealed.length, 1);
    assert(f.signals.messages.slice(before).some(event => event.type === 'run_finished'));
  });
}
for (const pair of [[{id: 9}, {seq: 9}], [{id: 9}, {ts: 9}], [{seq: 9}, {ts: 9}],
  [{id: 9}, {id: '9'}], [{seq: 9}, {seq: '9'}], [{ts: 9}, {ts: '9'}]]) {
  test(`D5 distinct transport discriminators do not collide ${JSON.stringify(pair)}`, () => {
    const f = fixture(); f.start('active'); const before = f.signals.messages.length;
    pair.forEach((marker, index) => f.send({type: 'text', sessionId: 's', runId: 'active', data: `part ${index}`, ...marker}));
    assert.equal(f.signals.messages.length - before, 2);
  });
}
test('D6 sequence zero is a valid duplicate receipt', () => {
  const f = fixture(); f.start('active'); const before = f.signals.messages.length;
  const event = {type: 'text', sessionId: 's', runId: 'active', seq: 0, data: 'one result'};
  f.send(event); f.send(event); assert.equal(f.signals.messages.length - before, 1);
});
test('D7 terminal chunks continue flowing with the same terminal id and sequence', () => {
  const f = fixture(); f.start('active'); const before = f.signals.messages.length;
  for (const data of ['first chunk', 'second chunk']) f.send({type: 'terminal_output', sessionId: 's', runId: 'active', id: 'terminal', seq: 8, data});
  assert.equal(f.signals.messages.length - before, 2);
});
test('D8 frames without a transport identifier remain deliverable', () => {
  const f = fixture(); f.start('active'); const before = f.signals.messages.length;
  for (const data of ['first part', 'second part']) f.send({type: 'text', sessionId: 's', runId: 'active', data});
  assert.equal(f.signals.messages.length - before, 2);
});
test('D9 malformed object identifiers cannot erase distinct text frames', () => {
  const f = fixture(); f.start('active'); const before = f.signals.messages.length;
  for (const data of ['first part', 'second part']) f.send({type: 'text', sessionId: 's', runId: 'active', id: {}, data});
  assert.equal(f.signals.messages.length - before, 2);
});
test('D10 nested session/run identity participates in counter-reuse recovery', () => {
  const f = fixture(); f.start('old');
  f.send({type: 'text', sessionId: 's', runId: 'old', seq: 12, data: 'old answer'});
  f.event('run_finished', 'old'); f.start('new');
  f.send({type: 'text', seq: 12, data: {sessionId: 's', runId: 'new', text: 'new answer'}});
  assert.equal(f.signals.messages.at(-1).data.text, 'new answer');
});
test('D11 delimiter-bearing identities retain distinct session/run tuples', () => {
  const f = fixture(); const other = f.context.observe('s|a');
  f.start('a|b', 's'); f.start('b', 's|a');
  f.send({type: 'text', sessionId: 's', runId: 'a|b', seq: 12, data: 'first tuple'});
  f.send({type: 'text', sessionId: 's|a', runId: 'b', seq: 12, data: 'second tuple'});
  assert.equal(f.signals.messages.at(-1).data, 'first tuple');
  assert.equal(other.messages.at(-1).data, 'second tuple');
});
