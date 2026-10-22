'use strict';
// Actual catalog and initialization, with inert storage only. No React mount,
// credentials, provider network, model pull or runtime state modification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const webRoot = path.resolve(process.argv[3] || path.join(__dirname, '..'));
const ts = require(path.join(webRoot, 'node_modules/typescript'));
const target = process.argv[2] || path.join(webRoot, 'src/components/CommandComposer.tsx');
const bytes = fs.readFileSync(target);
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const source = bytes.toString('utf8');
const ast = ts.createSourceFile(target, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
let catalog, keyInfo, initialize;
(function visit(node) {
  if (ts.isVariableDeclaration(node)) {
    if (node.name.getText(ast) === 'DEFAULT_PROVIDERS') catalog = node.initializer.getText(ast);
    if (node.name.getText(ast) === 'PROVIDER_KEY_INFO') keyInfo = node.initializer.getText(ast);
    if (node.name.getText(ast) === 'initialProviderState') {
      assert(ts.isCallExpression(node.initializer));
      initialize = node.initializer.arguments[0].getText(ast);
    }
  }
  ts.forEachChild(node, visit);
})(ast);
assert(catalog && keyInfo && initialize, 'Actual catalog, key info and initialization required');
const program = ts.transpileModule(`const DEFAULT_PROVIDERS = ${catalog};
const PROVIDER_KEY_INFO = ${keyInfo};
this.defaults=DEFAULT_PROVIDERS; this.keyInfo=PROVIDER_KEY_INFO;
this.initialize=${initialize};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture(saved = {}, active = null, extend) {
  const entries = new Map([['ai_providers', JSON.stringify(saved)], ['active_provider', active]]);
  const context = { localStorage: { getItem(name) { return entries.get(name) || null; } }, console: { log() {} } };
  vm.runInNewContext(program, context, { timeout: 1000 });
  if (extend) context.defaults.future = extend;
  return { context, state: context.initialize() };
}
test('installed loopback service is selectable as a named Local provider', () => {
  const { state } = fixture();
  assert(state.providers.local, 'Local must be visible in initialized provider state');
  assert.equal(state.providers.local.name, 'Local');
  assert.equal(state.providers.local.baseUrl, 'http://127.0.0.1:11434/v1');
});
test('Local has a model field and public SDK sentinel without a secret input', () => {
  const { context, state } = fixture();
  assert.equal(state.providers.local?.model, 'qwen2.5:1.5b');
  assert.equal(state.providers.local.apiKey, 'ollama');
  assert(!['', 'dummy', 'free', 'free-mode', 'auto-mode'].includes(state.providers.local.apiKey));
  assert.equal(context.keyInfo.local, undefined, 'Local must not render the API-key form');
});
test('catalog initialization includes every registered default', () => {
  const { context, state } = fixture();
  assert.deepEqual(Object.keys(state.providers).sort(), Object.keys(context.defaults).sort());
});
test('new registered defaults cannot disappear through a duplicated initial list', () => {
  const { state } = fixture({}, null, { name: 'Future fixture', apiKey: '', isConnected: false });
  assert.equal(state.providers.future?.name, 'Future fixture');
});
test('initial state clones defaults instead of sharing mutable configurations', () => {
  const { context, state } = fixture();
  assert(state.providers.local);
  state.providers.local.model = 'fixture-changed';
  assert.equal(context.defaults.local.model, 'qwen2.5:1.5b');
});
test('adding Local preserves Auto as the initial active provider', () => {
  const { state } = fixture();
  assert.equal(state.activeProvider, 'auto');
  assert.equal(state.providers.local?.verified, false);
  assert.equal(state.providers.local?.isConnected, false);
});
test('saved Local model survives while cached connection success is discarded', () => {
  const { state } = fixture({ local: { model: 'fixture-installed-model', verified: true, isConnected: true, isVerifying: true, lastError: 'cached' } }, 'local');
  assert.equal(state.activeProvider, 'local');
  assert.equal(state.providers.local.model, 'fixture-installed-model');
  assert.equal(state.providers.local.verified, false);
  assert.equal(state.providers.local.isConnected, false);
  assert.equal(state.providers.local.isVerifying, false);
  assert.equal(state.providers.local.lastError, undefined);
});
test('saved configuration cannot replace the Local provider identity', () => {
  const { state } = fixture({ local: { name: 'Paid vendor', nameKey: 'foreign', tagKey: 'foreign' } }, 'local');
  assert.equal(state.providers.local?.name, 'Local');
  assert.equal(state.providers.local.nameKey, undefined);
  assert.equal(state.providers.local.tagKey, undefined);
});
test('unknown cached provider is neither registered nor activated', () => {
  const { state } = fixture({ unregistered: { name: 'Unknown', apiKey: 'fixture' } }, 'unregistered');
  assert.equal(state.providers.unregistered, undefined);
  assert.equal(state.activeProvider, 'auto');
});
test('existing providers keep their names and editable configurations', () => {
  const { state } = fixture({ groq: { name: 'cached label', model: 'fixture-model', apiKey: 'fixture-key' } }, 'groq');
  assert.equal(state.activeProvider, 'groq');
  assert.equal(state.providers.groq.name, 'Groq ⚡');
  assert.equal(state.providers.groq.model, 'fixture-model');
  assert.equal(state.providers.groq.apiKey, 'fixture-key');
  assert.equal(state.providers.groq.verified, false);
});
test('local catalog does not register NVIDIA or assert that its billing is free', () => {
  const { state } = fixture();
  assert.equal(state.providers.nvidia, undefined);
  assert.equal(state.providers.local?.isFree, true);
});
test.after(() => assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), hash, 'Verified source must remain unchanged'));
