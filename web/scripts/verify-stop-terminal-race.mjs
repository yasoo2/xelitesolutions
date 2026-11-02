import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Exercise the actual async handler. No live provider, store, or network access.
const sourcePath = process.argv[2] || fileURLToPath(new URL('../src/components/CommandComposer.tsx', import.meta.url));
// Hash the exact bytes parsed; optional EXPECTED_SOURCE_SHA256 pins a review.
const sourceBytes = readFileSync(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex').toUpperCase();
const expectedHash = process.env?.EXPECTED_SOURCE_SHA256;
if (expectedHash) assert.equal(sourceHash, expectedHash.toUpperCase(), 'Unexpected source pin');
console.log(`SOURCE_SHA256 ${sourceHash} ${sourcePath}`);
test.after(() => assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex').toUpperCase(), sourceHash, 'Source changed during verification'));
const source = sourceBytes.toString('utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
let messageHandler;
let scopedSubscription;
let startResponseBlock;
let presentationInitializer;
let presentationFinally;
const admissionHelpers = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'stopCurrentRun') handler = node;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleMessage') messageHandler = node.initializer;
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'SocketService.subscribe'
    && node.arguments[0]?.getText(ast).includes('handleMessage')) scopedSubscription = node.arguments[0];
  if (ts.isIfStatement(node) && node.expression.getText(ast) === "typeof data?.runId === 'string' && data.runId.trim()") startResponseBlock = node;
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'presentationRevision') presentationInitializer = node.initializer;
  if (ts.isTryStatement(node) && node.finallyBlock?.getText(ast).includes('registryAdmission.release')) presentationFinally = node.finallyBlock;
  if (ts.isFunctionDeclaration(node) && ['setActiveRunId', 'beginRunSubmission', 'adoptRunStartResponse'].includes(node.name?.text)) admissionHelpers.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert(handler, 'Actual stopCurrentRun handler must exist');
assert(messageHandler, 'Actual terminal message handler must exist');
assert.equal(admissionHelpers.length, 3, 'Actual admission helpers must exist');
assert(scopedSubscription && startResponseBlock, 'Actual subscription and HTTP admission block must exist');
const code = ts.transpileModule(`${admissionHelpers.join('\n')}\n${handler.getText(ast)}\nconst handleMessage = ${messageHandler.getText(ast)};\nthis.invokeStop = stopCurrentRun;\nthis.beginSubmission = beginRunSubmission;\nthis.beginHTTPPresentation = () => ${presentationInitializer?.getText(ast) || '0'};\nthis.endHTTPPresentation = presentationRevision => ${presentationFinally?.getText(ast) || '{}'};\nthis.adoptStart = adoptRunStartResponse;\nthis.replyStart = async (data, submissionEpoch) => { ${startResponseBlock.getText(ast)} };\nthis.deliverScoped = ${scopedSubscription.getText(ast)};\nthis.deliverEvent = message => handleMessage({ data: JSON.stringify(message) });`, {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ runId = 'run-a', confirmed = false, sessionTerminal = false, terminalIds = [], recoveredRun = '', afterRecoveredStop, beforeRecoveryReply, canStart = true, markStarted = true } = {}) {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const calls = [];
  const state = { status: 'thinking', tool: null, marks: [], presentations: [], identity: { current: runId || null }, terminal: { current: sessionTerminal }, ids: { current: new Set(terminalIds) }, revision: { current: 0 } };
  const context = {
    pendingQueue: [], localStorage: { getItem: () => null }, activeRunId: runId,
    sessionId: 'session-a', runSessionId: 'session-a', browserSessionId: '', pendingBrowserRetryRef: { current: null },
    API: 'isolated://no-network', terminalSessionRef: state.terminal, terminalRunIdsRef: state.ids,
    terminalRevisionRef: state.revision, lastLiveSeqRef: { current: 0 },
    activeRunIdentityRef: state.identity, submissionEpochRef: { current: 0 }, awaitingRunIdentityRef: { current: false },
    pendingStopEpochRef: { current: null },
    setActiveRunIdState: value => { context.activeRunId = value; },
    lastUserInputRunRef: { current: null },
    statusRef: { current: 'thinking' }, showToolUi: true,
    window: { dispatchEvent() {} }, CustomEvent: class {},
    console: { error: (...args) => { throw new Error(`Unexpected message handler error: ${String(args[1])}`); } },
    setStatus: value => { state.status = value; }, setActiveToolName: value => { state.tool = value; },
    getRunningGeneration: () => state.registryGeneration || 0,
    registryAdmission: { canStart: () => canStart, markStarted: () => {
      if (markStarted) state.marks.push({ id: 'session-a', running: true });
      return markStarted;
    }, release: () => { state.releases = (state.releases || 0) + 1; } },
    SocketService: {
      registerRunPresentation: (sid, rid, revision) => {
        state.presentationArguments = { sid, rid, revision };
        state.presentations.push({ sid, rid }); return true;
      },
      invalidateRunPresentation: sid => { state.invalidated = sid; state.presentations.length = 0; state.presentationEpoch = (state.presentationEpoch || 0) + 1; },
      beginRunPresentation: sid => { state.presentationEpoch = (state.presentationEpoch || 0) + 1; state.pendingPresentation = { sid, revision: state.presentationEpoch }; return state.presentationEpoch; },
      endRunPresentation: (sid, revision) => {
        state.endedPresentation = { sid, revision };
        if (state.pendingPresentation?.revision === revision) state.pendingPresentation = null;
      },
    },
    markRunning: (id, running) => { state.marks.push({ id, running }); },
    fetch: async url => {
      calls.push(url);
      if (url.endsWith('/runs/stop')) {
        if (calls.filter(call => call.endsWith('/runs/stop')).length > 1) {
          afterRecoveredStop?.(state);
          return { status: 200, json: async () => ({ stopped: confirmed }) };
        }
        return waiting;
      }
      if (url.endsWith('/runs/active')) return { json: async () => {
        beforeRecoveryReply?.(context, state);
        return { runs: recoveredRun ? [{ sessionId: 'session-a', runId: recoveredRun }] : [] };
      } };
      throw new Error('Unexpected isolated request');
    },
    setQueuePaused() {}, handleUnauthorized() {}, setToolVisible() {}, setIsThinking() {},
    setApproval() {}, setSecretPrompt() {}, clearToolTimers() {}, clearDraftTimer() {},
    setDraftActive() {}, setDraftText() {}, stopDraft() {}, setThinkingPhase() {},
    hideToolSoon() {}, setEvents() {},
  };
  vm.runInNewContext(code, context, { timeout: 1000 });
  return { context, state, calls, invoke: () => context.invokeStop(),
    begin: () => { const epoch = context.beginSubmission(); context.presentationRevision = context.beginHTTPPresentation(); return epoch; },
    cleanup: revision => context.endHTTPPresentation(revision === undefined ? context.presentationRevision : revision),
    adopt: (id, epoch) => context.adoptStart(id, epoch),
    reply: (id, epoch) => context.replyStart({ runId: id }, epoch), scoped: message => context.deliverScoped(message),
    deliver: message => context.deliverEvent({ sessionId: 'session-a', ...message }),
    finish: () => release({ status: 200, json: async () => ({ stopped: confirmed }) }) };
}

test('an early Stop waits for the exact original HTTP identity then cancels that run', async () => {
  const f = fixture({runId:'', confirmed:true}); const epoch=f.begin();
  const stop=f.invoke();
  assert.equal(f.calls.length,0,'Do not stop an unidentified run or a previous run in the session');
  await stop;
  assert.equal(f.state.status,'thinking','Keep the pending Stop visible until the server acknowledges');
  assert.equal(f.context.pendingStopEpochRef.current,epoch);
  const acknowledgement=f.reply('run-pending-original',epoch);
  assert.equal(f.calls.length,1); f.finish(); await acknowledgement;
  assert.equal(f.state.status,'idle'); assert.equal(f.state.terminal.current,true);
  assert.equal(f.context.pendingStopEpochRef.current,null);
});

test('a new submission cannot inherit the previous submission early Stop', async () => {
  const f=fixture({runId:''});const old=f.begin();const stop=f.invoke();assert.equal(f.calls.length,0);await stop;
  const next=f.begin();await f.reply('run-successor',next);await f.reply('run-stale-original',old);
  assert.equal(f.calls.length,0);assert.equal(f.state.identity.current,'run-successor');
  assert.equal(f.context.pendingStopEpochRef.current,null);
});

test('repeated early Stop is one cancellation intent, with no extra requests', async () => {
  const f=fixture({runId:'',confirmed:true});const epoch=f.begin();const stop=f.invoke();assert.equal(f.calls.length,0);await stop;await f.invoke();
  assert.equal(f.calls.length,0);const reply=f.reply('run-original',epoch);f.finish();await reply;
  assert.equal(f.calls.length,1);assert.equal(f.state.status,'idle');
});

test('late unconfirmed stop cannot resurrect a terminal run', async () => {
  const f = fixture(); const pending = f.invoke();
  f.deliver({ type: 'run_finished', runId: 'run-a' });
  f.finish(); await pending;
  assert.equal(f.state.status, 'idle'); assert.equal(f.state.tool, null);
  assert.equal(f.calls.length, 1, 'A finished target must not trigger active-run recovery');
});

test('unconfirmed stop on a live run preserves the live state', async () => {
  const f = fixture(); const pending = f.invoke(); f.finish(); await pending;
  assert.equal(f.state.status, 'thinking'); assert.match(f.state.tool, /Unable to confirm/);
  assert.equal(f.state.marks.length, 0);
});

test('confirmed stop without an earlier terminal event settles idle', async () => {
  const f = fixture({ confirmed: true }); const pending = f.invoke(); f.finish(); await pending;
  assert.equal(f.state.status, 'idle'); assert.equal(f.state.terminal.current, true);
  assert.deepEqual(f.state.marks, [{ id: 'session-a', running: false }]);
});

for (const confirmed of [false, true]) {
  test(`the original run user_input does not discard its stop reply confirmed=${confirmed}`, async () => {
    const f = fixture({ confirmed }); const pending = f.invoke();
    f.deliver({ type: 'user_input', runId: 'run-a' });
    f.finish(); await pending;
    assert.equal(f.state.status, confirmed ? 'idle' : 'thinking');
    assert.equal(f.calls.length, 1);
    if (!confirmed) assert.match(f.state.tool, /Unable to confirm/);
  });
  test(`a new user_input fences a late stop reply confirmed=${confirmed} without requiring an old terminal event`, async () => {
    const f = fixture({ confirmed, recoveredRun: 'run-b' }); const pending = f.invoke();
    f.deliver({ type: 'user_input', runId: 'run-b' });
    f.state.tool = 'successor-tool';
    f.finish(); await pending;
    assert.equal(f.state.status, 'thinking'); assert.equal(f.state.tool, 'successor-tool');
    assert.equal(f.state.marks.length, 0);
    assert.equal(f.calls.length, 1, 'Old Stop must not recover and cancel the successor');
  });
  test(`late stop reply confirmed=${confirmed} cannot alter a newer run`, async () => {
    const f = fixture({ confirmed, recoveredRun: 'run-b' }); const pending = f.invoke();
    f.deliver({ type: 'run_finished', runId: 'run-a' }); f.state.terminal.current = false;
    f.state.status = 'thinking'; f.state.tool = 'new-run-tool';
    f.finish(); await pending;
    assert.equal(f.state.status, 'thinking'); assert.equal(f.state.tool, 'new-run-tool');
    assert.equal(f.state.marks.length, 0); assert.equal(f.calls.length, 1);
    assert.equal(f.state.terminal.current, false);
  });
}

test('a known new run is not fenced by an older session terminal flag', async () => {
  const f = fixture({ runId: 'run-b', sessionTerminal: true, terminalIds: ['run-a'] });
  const pending = f.invoke(); f.finish(); await pending;
  assert.equal(f.state.status, 'thinking'); assert.match(f.state.tool, /Unable to confirm/);
});

test('an unconfirmed exact-run stop cannot recover and stop a different run', async () => {
  const f = fixture({ recoveredRun: 'run-b' });
  const pending = f.invoke(); f.finish(); await pending;
  assert.equal(f.calls.length, 1, 'Known target cannot be retargeted through session recovery');
  assert.equal(f.state.status, 'thinking'); assert.match(f.state.tool, /Unable to confirm/);
});

test('session-only stop preserves an observed terminal state', async () => {
  const f = fixture({ runId: '' }); const pending = f.invoke();
  f.deliver({ type: 'run_finished' });
  f.finish(); await pending;
  assert.equal(f.state.status, 'idle'); assert.equal(f.state.tool, null);
  assert.equal(f.calls.length, 1);
});

test('late recovered-target reply cannot overwrite the successor run', async () => {
  const f = fixture({ runId: '', recoveredRun: 'run-b', afterRecoveredStop: state => {
    state.ids.current.add('run-b'); state.terminal.current = false;
    state.status = 'thinking'; state.tool = 'successor-tool';
  } });
  const pending = f.invoke(); f.finish(); await pending;
  assert.equal(f.state.status, 'thinking'); assert.equal(f.state.tool, 'successor-tool');
  assert.equal(f.state.marks.length, 0); assert.equal(f.calls.length, 3);
});

test('terminal without run identity fences a pending stop with a known run identity', async () => {
  const f = fixture(); const pending = f.invoke();
  f.deliver({ type: 'run_finished' }); f.finish(); await pending;
  assert.equal(f.state.status, 'idle'); assert.equal(f.state.tool, null);
  assert.equal(f.calls.length, 1);
});

test('bounded tombstone rollover cannot forget a pending stop terminal transition', async () => {
  const f = fixture({ terminalIds: Array.from({ length: 128 }, (_, i) => `old-${i}`) });
  const pending = f.invoke(); f.deliver({ type: 'run_finished', runId: 'run-a' });
  assert.ok(f.state.ids.current.size <= 128, 'Terminal history stays bounded');
  assert.equal(f.state.ids.current.has('run-a'), true, 'Rollover retains the newest terminal');
  f.finish(); await pending;
  assert.equal(f.state.status, 'idle'); assert.equal(f.state.tool, null);
  assert.equal(f.calls.length, 1);
});

for (const type of ['run_finished', 'run_cancelled', 'run_completed', 'run_failed']) {
  test(`old ${type} cannot close an identified successor`, () => {
    const f = fixture(); f.deliver({ type: 'user_input', runId: 'run-b' });
    f.deliver({ type, runId: 'run-a' });
    assert.equal(f.state.status, 'thinking'); assert.equal(f.state.identity.current, 'run-b');
    assert.equal(f.state.terminal.current, false); assert(f.state.ids.current.has('run-a'));
    f.deliver({ type, runId: 'run-b' });
    assert.equal(f.state.status, 'idle'); assert.equal(f.state.identity.current, null);
  });
}
test('HTTP admission works with lost user_input and rejects the former run terminal', () => {
  const f = fixture(); f.deliver({ type: 'user_input', runId: 'run-a' });
  const epoch = f.begin(); f.reply('run-b', epoch);
  f.deliver({ type: 'run_finished', runId: 'run-a' });
  assert.equal(f.state.status, 'thinking'); assert.equal(f.state.identity.current, 'run-b');
  f.deliver({ type: 'run_finished', runId: 'run-b' });
  assert.equal(f.state.status, 'idle');
});
test('older HTTP start response cannot replace a newer submission', () => {
  const f = fixture(); const oldEpoch = f.begin(); const newEpoch = f.begin();
  f.reply('run-b', newEpoch); f.reply('run-a', oldEpoch);
  assert.equal(f.state.identity.current, 'run-b');
});
test('HTTP cannot reopen its terminal run observed during pending admission', () => {
  const f = fixture(); const epoch = f.begin();
  f.deliver({ type: 'run_finished', runId: 'run-a' });
  assert.equal(f.state.status, 'thinking');
  f.reply('run-a', epoch);
  assert.equal(f.state.identity.current, null); assert.equal(f.state.status, 'idle');
});
test('old terminal during unidentified submission does not end that submission', () => {
  const f = fixture(); const epoch = f.begin();
  f.deliver({ type: 'run_finished', runId: 'run-a' }); f.reply('run-b', epoch);
  assert.equal(f.state.status, 'thinking'); assert.equal(f.state.identity.current, 'run-b');
});
test('normal terminal and unidentified legacy terminal still settle idle', () => {
  for (const runId of ['run-a', undefined]) {
    const f = fixture(); f.deliver({ type: 'user_input', runId: 'run-a' });
    f.deliver({ type: 'run_finished', runId });
    assert.equal(f.state.status, 'idle'); assert.equal(f.state.identity.current, null);
  }
});
test('actual session-scoped subscription ignores another session terminal', () => {
  const f = fixture(); f.scoped({ type: 'user_input', sessionId: 'session-a', runId: 'run-b' });
  f.scoped({ type: 'run_finished', sessionId: 'session-other', runId: 'run-b' });
  assert.equal(f.state.status, 'thinking'); assert.equal(f.state.identity.current, 'run-b');
});
test('run_started outside local admission can identify a missing user_input without stale retargeting', () => {
  const f = fixture({ runId: '' }); f.deliver({ type: 'run_started', runId: 'run-b' });
  f.deliver({ type: 'run_started', runId: 'run-a' });
  assert.equal(f.state.identity.current, 'run-b');
  f.deliver({ type: 'run_finished', runId: 'run-b' }); assert.equal(f.state.status, 'idle');
});
test('HTTP-known successor also fences an older pending Stop reply', async () => {
  const f = fixture({ confirmed: true }); const pending = f.invoke();
  const epoch = f.begin(); f.reply('run-b', epoch); f.finish(); await pending;
  assert.equal(f.state.status, 'thinking'); assert.equal(f.state.identity.current, 'run-b');
  assert.deepEqual(f.state.marks, [{ id: 'session-a', running: true }], 'HTTP admits only the successor; old Stop cannot clear it');
});

test('terminal learned before HTTP also fences an older unconfirmed Stop reply', async () => {
  const f = fixture({ confirmed: false }); const pending = f.invoke();
  const epoch = f.begin(); f.deliver({ type: 'run_finished', runId: 'run-b' });
  f.reply('run-b', epoch); f.finish(); await pending;
  assert.equal(f.state.status, 'idle'); assert.equal(f.state.identity.current, null);
});

test('stale-first socket admission cannot poison the current HTTP submission', () => {
  const f = fixture(); const epoch = f.begin();
  f.deliver({ type: 'run_started', runId: 'run-a' });
  f.reply('run-b', epoch);
  assert.equal(f.state.identity.current, 'run-b');
  f.deliver({ type: 'run_finished', runId: 'run-b' });
  assert.equal(f.state.status, 'idle');
});

for (const confirmed of [false, true]) {
  test(`session-only Stop cannot retarget a later submission confirmed=${confirmed}`, async () => {
    const f = fixture({ runId: '', confirmed, recoveredRun: 'run-b' });
    const pending = f.invoke(); const epoch = f.begin(); f.reply('run-b', epoch);
    f.finish(); await pending;
    assert.equal(f.calls.length, 1); assert.equal(f.state.identity.current, 'run-b');
    assert.equal(f.state.status, 'thinking');
    assert.deepEqual(f.state.marks, [{ id: 'session-a', running: true }], 'No false registry mark from the old Stop');
  });
}

test('bounded tombstones retain a newly fenced terminal across rollover', () => {
  const f = fixture({ terminalIds: Array.from({ length: 128 }, (_, i) => `old-${i}`) });
  const epoch = f.begin(); f.deliver({ type: 'run_finished', runId: 'run-b' });
  f.reply('run-b', epoch);
  assert.equal(f.state.status, 'idle'); assert.equal(f.state.identity.current, null);
  assert.equal(f.state.ids.current.has('run-b'), true);
  assert.ok(f.state.ids.current.size <= 128);
});

test('identified same-session successor outranks an older local HTTP response', () => {
  const f = fixture(); const epoch = f.begin();
  f.scoped({ type: 'user_input', sessionId: 'session-a', runId: 'run-b' });
  f.reply('run-a', epoch);
  assert.equal(f.state.identity.current, 'run-b');
  f.deliver({ type: 'run_finished', runId: 'run-b' });
  assert.equal(f.state.status, 'idle');
});

test('session-only Stop cannot recover an identity admitted by another tab', async () => {
  const f = fixture({ runId: '', recoveredRun: 'run-b' }); const pending = f.invoke();
  f.scoped({ type: 'user_input', sessionId: 'session-a', runId: 'run-b' });
  f.finish(); await pending;
  assert.equal(f.calls.length, 1); assert.equal(f.state.identity.current, 'run-b');
  assert.equal(f.state.status, 'thinking'); assert.equal(f.state.marks.length, 0);
});

test('stale tool frame cannot admit an identity during pending HTTP start', () => {
  const f = fixture(); const epoch = f.begin();
  f.deliver({ type: 'tool_start', runId: 'run-a', data: { tool: 'old-tool' } });
  f.reply('run-b', epoch);
  assert.equal(f.state.identity.current, 'run-b');
  f.deliver({ type: 'run_finished', runId: 'run-b' });
  assert.equal(f.state.status, 'idle');
});

for (const transition of ['successor', 'terminal', 'global-only']) {
  test(`Stop recovery must recheck ${transition} before posting a second cancellation`, async () => {
    const f = fixture({ runId: '', recoveredRun: 'run-b', beforeRecoveryReply: (context, state) => {
      if (transition === 'successor') context.deliverEvent({ type: 'user_input', sessionId: 'session-a', runId: 'run-b' });
      else if (transition === 'terminal') context.deliverEvent({ type: 'run_finished', sessionId: 'session-a' });
      else state.registryGeneration = 1;
    } });
    const pending = f.invoke(); f.finish(); await pending;
    assert.equal(f.calls.filter(call => call.endsWith('/runs/stop')).length, 1, 'The recovered successor must never be cancelled');
    assert.equal(f.state.marks.length, 0);
  });
}

test('accepted HTTP identity arms exact session presentation only after registry admission succeeds', () => {
  const f = fixture(); const epoch = f.begin(); f.reply('run-b', epoch);
  assert.deepEqual(f.state.presentations, [{ sid: 'session-a', rid: 'run-b' }]);
  assert.deepEqual(f.state.marks, [{ id: 'session-a', running: true }]);
  assert.equal(f.state.identity.current, 'run-b');
});
test('registry canStart rejection cannot arm a presentation receipt', () => {
  const f = fixture({ canStart: false }); const epoch = f.begin(); f.reply('run-b', epoch);
  assert.deepEqual(f.state.presentations, []); assert.deepEqual(f.state.marks, []);
  assert.equal(f.state.identity.current, null);
});
test('registry markStarted rejection cannot arm a presentation receipt', () => {
  const f = fixture({ markStarted: false }); const epoch = f.begin(); f.reply('run-b', epoch);
  assert.deepEqual(f.state.presentations, []); assert.deepEqual(f.state.marks, []);
});
test('former submission HTTP response cannot arm stale presentation A after newer submission', () => {
  const f = fixture(); const old = f.begin(); const fresh = f.begin();
  f.reply('run-a', old); assert.deepEqual(f.state.presentations, []);
  f.reply('run-b', fresh); assert.deepEqual(f.state.presentations, [{ sid: 'session-a', rid: 'run-b' }]);
});
test('known socket successor prevents an old HTTP identity from arming presentation', () => {
  const f = fixture(); const epoch = f.begin();
  f.deliver({ type: 'user_input', runId: 'run-c' }); f.reply('run-b', epoch);
  assert.deepEqual(f.state.presentations, []); assert.equal(f.state.identity.current, 'run-c');
});
test('terminal learned during HTTP admission prevents presentation resurrection', () => {
  const f = fixture(); const epoch = f.begin();
  f.deliver({ type: 'run_finished', runId: 'run-b' }); f.reply('run-b', epoch);
  assert.deepEqual(f.state.presentations, []); assert.deepEqual(f.state.marks, []);
  assert.equal(f.state.status, 'idle');
});
test('submission invalidation uses component session scope rather than a send-local identifier', () => {
  const helper = admissionHelpers.find(text => text.includes('function beginRunSubmission'));
  const helperAst = ts.createSourceFile('helper.ts', helper, ts.ScriptTarget.Latest, true);
  let invalidation;
  (function inspect(node) {
    if (ts.isCallExpression(node) && node.expression.getText(helperAst) === 'SocketService.invalidateRunPresentation') {
      invalidation = node.arguments[0];
    }
    ts.forEachChild(node, inspect);
  })(helperAst);
  assert(invalidation, 'Actual begin helper must invalidate old presentation');
  assert(!/\brunSessionId\b/.test(invalidation.getText(helperAst)), 'runSessionId exists only inside send');
  const f = fixture(); f.begin(); assert.equal(f.state.invalidated, 'session-a');
});
test('new submission clears an older admitted HTTP presentation before its own response', () => {
  const f = fixture(); const first = f.begin(); f.reply('run-b', first);
  assert.equal(f.state.presentations.length, 1); f.begin();
  assert.deepEqual(f.state.presentations, []); assert.equal(f.state.invalidated, 'session-a');
});
test('actual HTTP preparation captures the definite session revision and forwards it to registration', () => {
  assert(presentationInitializer, 'Actual presentation initializer must exist');
  const f = fixture(); const epoch = f.begin(); const token = f.state.pendingPresentation.revision;
  f.reply('run-b', epoch);
  assert.deepEqual(f.state.presentationArguments, { sid: 'session-a', rid: 'run-b', revision: token });
});
for (const rejected of ['canStart', 'markStarted', 'old HTTP']) {
  test(`${rejected} HTTP admission cannot arm presentation and its actual finally releases capture`, () => {
    assert(presentationFinally?.getText(ast).includes('endRunPresentation'), 'Actual finally must release presentation');
    const f = fixture({ canStart: rejected !== 'canStart', markStarted: rejected !== 'markStarted' });
    const epoch = f.begin();
    if (rejected === 'old HTTP') f.context.submissionEpochRef.current += 1;
    f.reply('run-b', epoch); assert.deepEqual(f.state.presentations, []);
    f.cleanup(); assert.equal(f.state.pendingPresentation, null); assert.equal(f.state.releases, 1);
  });
}
test('older HTTP finally uses its own captured revision rather than clearing newer preparation', () => {
  const f = fixture(); f.begin(); const old = f.state.pendingPresentation.revision;
  f.begin(); const fresh = f.state.pendingPresentation.revision;
  f.cleanup(old); assert.equal(f.state.pendingPresentation.revision, fresh);
  f.cleanup(fresh); assert.equal(f.state.pendingPresentation, null);
});
test('preparation and cleanup bracket the actual outer HTTP try with the same revision identifier', () => {
  assert(presentationInitializer && presentationFinally);
  assert.equal(presentationInitializer.getText(ast), 'SocketService.beginRunPresentation(runSessionId)');
  const declaration = presentationInitializer.parent;
  assert(declaration.getStart(ast) < presentationFinally.parent.getStart(ast), 'Capture occurs before HTTP try');
  assert(presentationFinally.getText(ast).includes('SocketService.endRunPresentation(runSessionId, presentationRevision)'));
});
test('presentation revision is declared in the real run HTTP lexical scope used by admission and finally', () => {
  assert(presentationInitializer && presentationFinally && startResponseBlock);
  const enclosingFunction = node => {
    for (let scope = node.parent; scope; scope = scope.parent) if (ts.isFunctionDeclaration(scope)) return scope;
  };
  const run = enclosingFunction(presentationInitializer);
  assert.equal(run?.name?.text, 'run');
  assert.equal(enclosingFunction(startResponseBlock), run);
  assert.equal(enclosingFunction(presentationFinally), run);
  assert.equal(presentationInitializer.parent.name.getText(ast), 'presentationRevision');
  const statement = presentationInitializer.parent.parent.parent;
  assert.equal(statement.parent, run.body, 'Binding belongs directly to run, not a nested helper scope');
  assert.equal(presentationFinally.parent.parent, run.body, 'HTTP try uses that same lexical binding');
});
