import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Run the entire real registry with controlled socket, HTTP and clock boundaries.
// An optional baseline source path demonstrates the regressions before repair.
const path = process.argv[2] || fileURLToPath(new URL('../src/services/runningSessions.ts', import.meta.url));
const source = readFileSync(path, 'utf8');
const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
const body = ast.statements.filter(node => !ts.isImportDeclaration(node)
  && !(ts.isIfStatement(node) && node.expression.getText(ast) === 'import.meta.hot'))
  .map(node => node.getText(ast)).join('\n');
const code = ts.transpileModule(body, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const row = (sessionId, runId) => ({ sessionId, runId });

async function fixture() {
  const requests = []; const snapshots = []; let deliver; let poll; let delay;
  const context = { exports: {}, api: { get(url) {
    assert.equal(url, '/runs/active');
    return new Promise((resolve, reject) => requests.push({ resolve, reject }));
  } }, require(name) {
    assert.equal(name, './socket');
    return { SocketService: { subscribe(listener) { deliver = listener; return () => {}; } } };
  }, setInterval(callback, milliseconds) { poll = callback; delay = milliseconds; return 1; }, clearInterval() {} };
  vm.runInNewContext(code, context, { timeout: 1000 });
  const registry = context.exports;
  registry.subscribeRunningSessions((sessions, ids) => snapshots.push({ sessions, ids }));
  registry.startTrackingRuns(); await flush(); requests.shift().resolve({ runs: [] }); await flush();
  return { registry, snapshots, delay, start(sid = 'x', id = 'a') { deliver({ type: 'run_started', sessionId: sid, runId: id }); },
    event(type, sid = 'x', id) { deliver({ type, sessionId: sid, ...(id ? { runId: id } : {}) }); },
    poll() { poll(); return requests.at(-1); }, async reply(request, runs) { request.resolve({ runs }); await flush(); },
    assertRun(sid, id) { assert.equal(registry.isSessionRunning(sid), true); assert.equal(registry.getRunningRunId(sid), id); },
  };
}

for (const type of ['run_finished', 'run_failed', 'run_cancelled', 'run_completed']) {
  test(`R1 old ${type} preserves successor; R3 matched terminal closes once`, async () => {
    const f = await fixture(); f.start(); f.start('x', 'b'); const n = f.snapshots.length;
    f.event(type, 'x', 'a'); f.assertRun('x', 'b'); assert.equal(f.snapshots.length, n);
    f.event(type, 'x', 'b'); assert.equal(f.registry.isSessionRunning('x'), false);
    assert.equal(f.snapshots.length, n + 1); f.event(type, 'x', 'b'); assert.equal(f.snapshots.length, n + 1);
  });
}
test('R2 unidentified terminal cannot close known identity; legacy unknown closes', async () => {
  const f = await fixture(); f.start('x', 'b'); f.event('run_finished'); f.assertRun('x', 'b');
  f.start('y', ''); f.event('run_finished', 'y'); assert.equal(f.registry.isSessionRunning('y'), false);
});
test('R4 never-started terminal produces no phantom notification', async () => {
  const f = await fixture(); const n = f.snapshots.length; f.event('run_finished', 'missing', 'a');
  assert.equal(f.snapshots.length, n); assert.equal(f.registry.getRunningSessions().size, 0);
});
for (const runs of [[], [row('x', 'a')]]) {
  test(`R5/R6 stale poll ${runs.length ? 'a' : 'empty'} cannot overwrite socket successor`, async () => {
    const f = await fixture(); f.start(); const pending = f.poll(); f.start('x', 'b');
    await f.reply(pending, runs); f.assertRun('x', 'b');
  });
}
test('R7 fresh unchanged snapshot produces no notification', async () => {
  const f = await fixture(); f.start('x', 'b'); const n = f.snapshots.length;
  await f.reply(f.poll(), [row('x', 'b')]); f.assertRun('x', 'b'); assert.equal(f.snapshots.length, n);
});
test('R8 server-only session is recovered without touching newer socket session', async () => {
  const f = await fixture(); const pending = f.poll(); f.start('x', 'b');
  await f.reply(pending, [row('c', 'c1')]); f.assertRun('x', 'b'); f.assertRun('c', 'c1');
});
test('R9 out-of-order older response cannot replace newer applied response', async () => {
  const f = await fixture(); const older = f.poll(); const newer = f.poll();
  await f.reply(newer, [row('x', 'b')]); await f.reply(older, [row('x', 'a')]); f.assertRun('x', 'b');
});
for (const newerRuns of [[row('x', 'b')], []]) {
  test(`R9 older-first poll cannot fence newer ${newerRuns.length ? 'successor' : 'empty'} snapshot`, async () => {
    const f = await fixture(); const older = f.poll(); const newer = f.poll();
    await f.reply(older, [row('x', 'a')]); await f.reply(newer, newerRuns);
    if (newerRuns.length) f.assertRun('x', 'b');
    else assert.equal(f.registry.isSessionRunning('x'), false);
  });
}
test('R10 optimistic admission fences former terminal until authoritative identity', async () => {
  const f = await fixture(); f.start(); f.registry.markRunning('x', true);
  f.event('run_finished', 'x', 'a'); f.assertRun('x', '');
  f.start('x', 'b'); f.assertRun('x', 'b');
});
test('R11 confirmed Stop of a cannot close successor b', async () => {
  const f = await fixture(); f.start(); const epoch = f.registry.getRunningGeneration('x'); f.start('x', 'b');
  f.registry.markRunning('x', false, 'a', epoch); f.assertRun('x', 'b');
});
test('R11 unidentified Stop generation also fences a newer optimistic submission', async () => {
  const f = await fixture(); f.registry.markRunning('x', true); const epoch = f.registry.getRunningGeneration('x');
  f.registry.markRunning('x', true); f.registry.markRunning('x', false, '', epoch); f.assertRun('x', '');
});
test('confirmed matching Stop clears; duplicate HTTP identity leaves generation stable', async () => {
  const f = await fixture(); f.registry.markRunning('x', true, 'a'); const epoch = f.registry.getRunningGeneration('x');
  f.registry.markRunning('x', true, 'a'); assert.equal(f.registry.getRunningGeneration('x'), epoch);
  f.registry.markRunning('x', false, 'a', epoch); assert.equal(f.registry.isSessionRunning('x'), false);
});
test('R12 old x terminal and in-flight poll cannot alter newer y identity', async () => {
  const f = await fixture(); f.start(); f.start('y', 'y1'); const pending = f.poll();
  f.start('y', 'y2'); f.event('run_finished', 'x', 'a'); await f.reply(pending, [row('x', 'a'), row('y', 'y1')]);
  assert.equal(f.registry.isSessionRunning('x'), false); f.assertRun('y', 'y2');
});
test('R13 tool-only event is ignored; dropped start recovers on bounded poll', async () => {
  const f = await fixture(); assert.equal(f.delay, 15000); f.event('tool_start', 'x', 'a');
  assert.equal(f.registry.isSessionRunning('x'), false); await f.reply(f.poll(), [row('x', 'a')]); f.assertRun('x', 'a');
  await f.reply(f.poll(), []); assert.equal(f.registry.isSessionRunning('x'), false);
});
test('R14 identity-only replacement emits an atomic independent snapshot', async () => {
  const f = await fixture(); f.start(); const previous = f.snapshots.at(-1); const n = f.snapshots.length;
  f.start('x', 'b'); assert.equal(f.snapshots.length, n + 1);
  assert.equal(previous.ids.get('x'), 'a'); assert.equal(f.snapshots.at(-1).ids.get('x'), 'b');
  assert.equal(f.snapshots.at(-1).sessions.has('x'), true);
});
test('mutating one subscriber snapshots cannot corrupt registry or later subscribers', async () => {
  const f = await fixture(); f.registry.subscribeRunningSessions((sessions, ids) => { sessions.clear(); ids.clear(); });
  let seen; f.registry.subscribeRunningSessions((sessions, ids) => { seen = { sessions, ids }; });
  f.start(); f.assertRun('x', 'a'); assert.equal(seen.sessions.has('x'), true); assert.equal(seen.ids.get('x'), 'a');
});
test('terminal unseen during pending poll invalidates stale server admission', async () => {
  const f = await fixture(); const pending = f.poll(); f.event('run_finished', 'x', 'a');
  await f.reply(pending, [row('x', 'a')]); assert.equal(f.registry.isSessionRunning('x'), false);
});
test('poll failure preserves state and subsequent poll recovers', async () => {
  const f = await fixture(); f.start(); f.poll().reject(new Error('offline')); await flush(); f.assertRun('x', 'a');
  await f.reply(f.poll(), []); assert.equal(f.registry.isSessionRunning('x'), false);
});

test('unmounted HTTP caller cannot resurrect terminal observed only by global registry', async () => {
  const f = await fixture(); const caller = f.registry.captureRunningAdmission('x');
  f.start('x', 'a'); f.event('run_finished', 'x', 'a');
  assert.equal(caller.canStart('a'), false); assert.equal(caller.markStarted('a'), false);
  caller.release(); assert.equal(f.registry.isSessionRunning('x'), false);
});
test('unmounted HTTP caller cannot replace newer global successor', async () => {
  const f = await fixture(); const caller = f.registry.captureRunningAdmission('x'); f.start('x', 'b');
  assert.equal(caller.markStarted('a'), false); f.assertRun('x', 'b'); caller.release();
});
test('successor terminal retains invalidation until older HTTP admission settles', async () => {
  const f = await fixture(); const caller = f.registry.captureRunningAdmission('x');
  f.start('x', 'b'); f.event('run_finished', 'x', 'b');
  assert.equal(caller.markStarted('a'), false); caller.release();
  assert.equal(f.registry.getRunningGeneration('x'), 0);
});
test('poll-only successor and completion also fence late HTTP across unmount', async () => {
  const f = await fixture(); const caller = f.registry.captureRunningAdmission('x');
  await f.reply(f.poll(), [row('x', 'b')]); await f.reply(f.poll(), []);
  assert.equal(caller.markStarted('a'), false); caller.release();
});
test('terminal before any start frame fences same HTTP identity without phantom activity', async () => {
  const f = await fixture(); const caller = f.registry.captureRunningAdmission('x'); f.event('run_failed', 'x', 'a');
  assert.equal(caller.markStarted('a'), false); assert.equal(f.registry.isSessionRunning('x'), false); caller.release();
});
test('terminal for proposed HTTP identity fences it even while global old identity differs', async () => {
  const f = await fixture(); f.start('x', 'old'); const caller = f.registry.captureRunningAdmission('x');
  f.event('run_finished', 'x', 'new'); assert.equal(caller.markStarted('new'), false); f.assertRun('x', 'old'); caller.release();
});
test('newer HTTP submission remains authoritative after its token is released', async () => {
  const f = await fixture(); const old = f.registry.captureRunningAdmission('x'); const newer = f.registry.captureRunningAdmission('x');
  assert.equal(newer.markStarted('b'), true); newer.release();
  assert.equal(old.markStarted('a'), false); f.assertRun('x', 'b'); old.release();
});
test('normal HTTP admission and matching socket echo work with missing initial user_input', async () => {
  const f = await fixture(); const caller = f.registry.captureRunningAdmission('x');
  assert.equal(caller.canStart('a'), true); assert.equal(caller.markStarted('a'), true); f.start('x', 'a');
  assert.equal(caller.canStart('a'), true); caller.release(); caller.release(); f.assertRun('x', 'a');
});
test('unidentified terminal fails closed for pending HTTP, without clearing existing identified run', async () => {
  const f = await fixture(); f.start('x', 'a'); const caller = f.registry.captureRunningAdmission('x');
  f.event('run_finished'); assert.equal(caller.markStarted('a'), false); f.assertRun('x', 'a'); caller.release();
});

// A phase can remain in the server's active list after its user-facing terminal.
// These requests begin AFTER closure: the in-flight generation fence alone is
// insufficient. Exact closed session/run pairs must prevent false busy rebound.
for (const terminal of ['run_finished', 'run_failed', 'run_cancelled', 'run_completed']) {
  test(`fresh poll after matched ${terminal} cannot readmit the closed identity`, async () => {
    const f = await fixture(); f.start(); f.event(terminal, 'x', 'a'); const notifications = f.snapshots.length;
    await f.reply(f.poll(), [row('x', 'a')]);
    assert.equal(f.registry.isSessionRunning('x'), false);
    assert.equal(f.registry.getRunningRunId('x'), ''); assert.equal(f.snapshots.length, notifications);
  });
}
test('fresh postterminal poll stays closed even while HTTP admission retains the generation', async () => {
  const f = await fixture(); const caller = f.registry.captureRunningAdmission('x');
  f.start(); f.event('run_cancelled', 'x', 'a');
  await f.reply(f.poll(), [row('x', 'a')]); assert.equal(f.registry.isSessionRunning('x'), false);
  assert.equal(caller.markStarted('a'), false); caller.release();
});
test('fresh poll after confirmed matching Stop cannot restore the stopped identity', async () => {
  const f = await fixture(); f.start();
  f.registry.markRunning('x', false, 'a', f.registry.getRunningGeneration('x'));
  assert.equal(f.registry.isSessionRunning('x'), false);
  await f.reply(f.poll(), [row('x', 'a')]); assert.equal(f.registry.isSessionRunning('x'), false);
});
test('terminal for A while B is current remembers A without closing B', async () => {
  const f = await fixture(); f.start('x', 'b'); const notifications = f.snapshots.length;
  f.event('run_finished', 'x', 'a'); f.assertRun('x', 'b'); assert.equal(f.snapshots.length, notifications);
  await f.reply(f.poll(), [row('x', 'a'), row('x', 'b')]); f.assertRun('x', 'b');
  assert.equal(f.snapshots.length, notifications);
});
test('poll skips newest closed A row and still recovers live successor B for the same session', async () => {
  const f = await fixture(); f.event('run_cancelled', 'x', 'a');
  await f.reply(f.poll(), [row('x', 'a'), row('x', 'b')]); f.assertRun('x', 'b');
});
test('closed identity filtering is scoped to its session and preserves unrelated recovery', async () => {
  const f = await fixture(); f.start(); f.event('run_completed', 'x', 'a');
  await f.reply(f.poll(), [row('x', 'a'), row('y', 'a'), row('z', 'z1')]);
  assert.equal(f.registry.isSessionRunning('x'), false); f.assertRun('y', 'a'); f.assertRun('z', 'z1');
});
test('terminal known before any start or pending poll still fences later server admission', async () => {
  const f = await fixture(); const notifications = f.snapshots.length; f.event('run_failed', 'x', 'a');
  assert.equal(f.snapshots.length, notifications);
  await f.reply(f.poll(), [row('x', 'a')]);
  assert.equal(f.registry.isSessionRunning('x'), false); assert.equal(f.snapshots.length, notifications);
});
test('a replayed run_started cannot reopen its recorded terminal identity', async () => {
  const f = await fixture(); f.start(); f.event('run_finished', 'x', 'a'); const notifications = f.snapshots.length;
  f.start('x', 'a'); assert.equal(f.registry.isSessionRunning('x'), false);
  assert.equal(f.snapshots.length, notifications); f.start('x', 'b'); f.assertRun('x', 'b');
});
test('direct known HTTP identity cannot reopen its recorded terminal', async () => {
  const f = await fixture(); f.start(); f.event('run_finished', 'x', 'a');
  f.registry.markRunning('x', true, 'a'); assert.equal(f.registry.isSessionRunning('x'), false);
});
test('a fresh HTTP admission token cannot restore an already recorded terminal identity', async () => {
  const f = await fixture(); f.start(); f.event('run_cancelled', 'x', 'a');
  const caller = f.registry.captureRunningAdmission('x');
  assert.equal(caller.canStart('a'), false); assert.equal(caller.markStarted('a'), false);
  assert.equal(caller.markStarted('b'), true); caller.release(); f.assertRun('x', 'b');
});
test('individual session absence does not erase closed identity retention', async () => {
  const f = await fixture(); f.start(); f.event('run_finished', 'x', 'a'); f.start('y', 'y1');
  await f.reply(f.poll(), [row('y', 'y1')]);
  await f.reply(f.poll(), [row('x', 'a'), row('y', 'y1')]);
  assert.equal(f.registry.isSessionRunning('x'), false); f.assertRun('y', 'y1');
});
test('bounded closed-pair overflow fails closed until an authoritative empty snapshot but explicit B opens', async () => {
  const f = await fixture();
  for (let i = 0; i < 257; i++) f.event('run_finished', `closed-${i}`, `run-${i}`);
  await f.reply(f.poll(), [row('closed-0', 'run-0'), row('closed-256', 'run-256'), row('new', 'n1')]);
  assert.equal(f.registry.getRunningSessions().size, 0);
  f.start('x', 'b'); f.assertRun('x', 'b');
  const caller = f.registry.captureRunningAdmission('http'); assert.equal(caller.markStarted('http-b'), true); caller.release();
  f.assertRun('http', 'http-b');
  await f.reply(f.poll(), [row('x', 'b'), row('http', 'http-b'), row('new', 'n1')]);
  f.assertRun('x', 'b'); f.assertRun('http', 'http-b'); assert.equal(f.registry.isSessionRunning('new'), false);
  await f.reply(f.poll(), []); assert.equal(f.registry.getRunningSessions().size, 0);
  await f.reply(f.poll(), [row('new', 'n1')]); f.assertRun('new', 'n1');
});
test('an empty response begun before a newer terminal cannot reset the saturation fence', async () => {
  const f = await fixture();
  for (let i = 0; i < 257; i++) f.event('run_finished', `closed-${i}`, `run-${i}`);
  const pendingEmpty = f.poll(); f.event('run_cancelled', 'later', 'later-run');
  await f.reply(pendingEmpty, []);
  await f.reply(f.poll(), [row('later', 'later-run'), row('new', 'n1')]);
  assert.equal(f.registry.isSessionRunning('later'), false); assert.equal(f.registry.isSessionRunning('new'), false);
  await f.reply(f.poll(), []); await f.reply(f.poll(), [row('new', 'n1')]); f.assertRun('new', 'n1');
});
test('an empty response begun before explicit B starts cannot erase the closed A fence', async () => {
  const f = await fixture(); f.start(); f.event('run_finished', 'x', 'a');
  const pendingEmpty = f.poll(); f.start('x', 'b'); await f.reply(pendingEmpty, []); f.assertRun('x', 'b');
  await f.reply(f.poll(), [row('x', 'a'), row('x', 'b')]); f.assertRun('x', 'b');
});
test('saturation still reconciles known runs absent from a nonempty authoritative snapshot', async () => {
  const f = await fixture();
  for (let i = 0; i < 257; i++) f.event('run_finished', `closed-${i}`, `run-${i}`);
  f.start('x', 'a'); f.start('y', 'b');
  // X finished but its terminal frame was dropped; Y remains active. An
  // unknown Z row must stay fenced without preventing X's idle recovery.
  await f.reply(f.poll(), [row('y', 'b'), row('z', 'unknown')]);
  assert.equal(f.registry.isSessionRunning('x'), false); assert.equal(f.registry.getRunningRunId('x'), '');
  f.assertRun('y', 'b'); assert.equal(f.registry.isSessionRunning('z'), false);
});
