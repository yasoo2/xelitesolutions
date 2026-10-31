const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const file = path.resolve(process.argv[2] || path.join(__dirname, '../src/lib/panel-event-ownership.ts'));
const bytes = fs.readFileSync(file);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const sourceHash = hash(bytes);
const testedExports = {};
const code = ts.transpileModule(bytes.toString('utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
vm.runInNewContext(code, { exports: testedExports }, { timeout: 1000 });
const event = (runId, extra = {}) => ({ sessionId: 's', runId, type: 'log', seq: 1, ...extra });
test.after(() => assert.equal(hash(fs.readFileSync(file)), sourceHash));
test('a restarted counter in a new run remains visible', () => {
  const seen = new Map();
  assert(testedExports.acceptPanelEventOnce(event('first'), seen));
  assert(testedExports.acceptPanelEventOnce(event('second'), seen));
});
for (const key of ['eventId', 'messageId', 'actionId', 'seq', 'ts']) {
  test(`${key}: suppress one duplicate but retain the same receipt in a successor`, () => {
    const seen = new Map();
    const a = event('first', { seq: undefined, [key]: 7 });
    assert(testedExports.acceptPanelEventOnce(a, seen));
    assert.equal(testedExports.acceptPanelEventOnce(a, seen), false);
    assert(testedExports.acceptPanelEventOnce({ ...a, runId: 'second' }, seen));
  });
}
for (const nested of [false, true]) {
  test(`equivalent top-level and ${nested ? 'double' : 'single'} nested run envelopes deduplicate`, () => {
    const seen = new Map();
    const top = { sessionId: 's', runId: 'first', type: 'log', seq: 1 };
    const payload = { sessionId: 's', runId: 'first', seq: 1 };
    const wrapped = { type: 'log', data: nested ? { data: payload } : payload };
    assert(testedExports.acceptPanelEventOnce(top, seen));
    assert.equal(testedExports.acceptPanelEventOnce(wrapped, seen), false);
    const successor = { ...payload, runId: 'second' };
    assert(testedExports.acceptPanelEventOnce({ type: 'log', data: nested ? { data: successor } : successor }, seen));
  });
}
test('session ownership keeps equivalent receipts separate', () => {
  const seen = new Map();
  assert(testedExports.acceptPanelEventOnce(event('first'), seen));
  assert(testedExports.acceptPanelEventOnce(event('first', { sessionId: 'other' }), seen));
  assert.equal(testedExports.panelEventSessionId(event('first', { sessionId: 'other' })), 'other');
});
test('different event types cannot swallow each other', () => {
  const seen = new Map();
  assert(testedExports.acceptPanelEventOnce(event('first'), seen));
  assert(testedExports.acceptPanelEventOnce(event('first', { type: 'run_finished' }), seen));
});
test('legacy runless receipts continue deduplicating', () => {
  const seen = new Map();
  assert(testedExports.acceptPanelEventOnce(event(undefined), seen));
  assert.equal(testedExports.acceptPanelEventOnce(event(undefined), seen), false);
});
test('unidentified stream chunks remain admissible', () => {
  const seen = new Map();
  const e = { sessionId: 's', runId: 'first', type: 'terminal_output', id: 'panel-terminal', data: { line: 'same text' } };
  assert(testedExports.acceptPanelEventOnce(e, seen));
  assert(testedExports.acceptPanelEventOnce(e, seen));
});
test('the bounded receipt window evicts only its oldest receipt', () => {
  const seen = new Map();
  for (let seq = 1; seq <= 4; seq++) assert(testedExports.acceptPanelEventOnce(event('first', { seq }), seen, 3));
  assert.equal(seen.get('s').size, 3);
  assert.equal(testedExports.acceptPanelEventOnce(event('first', { seq: 4 }), seen, 3), false);
  assert(testedExports.acceptPanelEventOnce(event('first', { seq: 1 }), seen, 3));
});

