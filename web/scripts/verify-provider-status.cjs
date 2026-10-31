const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

// Actual provider handlers and JSX predicates with in-memory boundaries only.
// No HTTP/provider request, credential access, React render or external write.
const sourcePath = process.argv[2] ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '../src/components/CommandComposer.tsx');
const sourceBytes = readFileSync(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex').toUpperCase();
const expectedHash = process.env?.EXPECTED_SOURCE_SHA256;
if (expectedHash) assert.equal(sourceHash, expectedHash.toUpperCase(), 'Unexpected source pin');
console.log(`SOURCE_SHA256 ${sourceHash} ${sourcePath}`);
test.after(() => assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex').toUpperCase(), sourceHash, 'Source changed during verification'));
const source = sourceBytes.toString('utf8');
const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map(); const handlers = new Map(); const verificationState = []; let reset, button, startup;
function attr(node, name) { return node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === name); }
function expression(node, name) { const value = attr(node, name)?.initializer; return value && ts.isJsxExpression(value) ? value.expression : undefined; }
(function visit(node) {
  if (ts.isVariableDeclaration(node) && ['DEFAULT_PROVIDERS', 'PROVIDER_KEY_INFO', 'OPENROUTER_MODELS'].includes(node.name.getText(ast))) declarations.set(node.name.getText(ast), node.getText(ast));
  if (ts.isVariableDeclaration(node) && ['deleteProviderKey', 'handleDisconnect', 'checkConnection'].includes(node.name.getText(ast))) handlers.set(node.name.getText(ast), node.initializer.getText(ast));
  if (ts.isVariableDeclaration(node) && ['providerVerificationRevisionRef', 'providerConfigurationRevisionRef', 'providerActivationRevisionRef', 'providersRef', 'didAutoVerifyRef'].includes(node.name.getText(ast))) verificationState.push(`const ${node.getText(ast)};`);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('const attempts = [0, 800, 2000, 4000]')) startup = node.arguments[0].getText(ast);
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'invalidateProviderVerification') verificationState.push(node.getText(ast));
  if (ts.isBinaryExpression(node) && node.left.getText(ast) === 'baseProviders[k]' && node.right.getText(ast).includes('verified: false')) reset = node.getText(ast);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'button' && node.getText(ast).includes('Verified & Active')) button = node;
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'input') {
    const value = expression(node, 'value')?.getText(ast) || ''; const change = expression(node, 'onChange');
    if (change) for (const [key, needle] of [['key', '.apiKey'], ['model', '.model'], ['endpoint', '.baseUrl']]) {
      if (value.includes(`providers[selectedProvider]${needle}`)) handlers.set(key, change.getText(ast));
    }
  }
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === 'select'
      && node.openingElement.getText(ast).includes('model-select')) handlers.set('openrouter-model', expression(node.openingElement, 'onChange').getText(ast));
  ts.forEachChild(node, visit);
})(ast);
assert(button && reset, 'Actual button and reload reset must exist');
assert(startup, 'Actual automatic verification effect must exist');
for (const key of ['DEFAULT_PROVIDERS', 'PROVIDER_KEY_INFO', 'OPENROUTER_MODELS']) assert(declarations.has(key), `Actual ${key} must exist`);
for (const key of ['deleteProviderKey', 'handleDisconnect', 'checkConnection', 'key', 'model', 'endpoint', 'openrouter-model']) assert(handlers.has(key), `Actual ${key} handler must exist`);
const style = expression(button.openingElement, 'style');
assert(ts.isObjectLiteralExpression(style));
const background = style.properties.find(p => p.name?.getText(ast) === 'background').initializer.getText(ast);
const label = button.children.find(n => ts.isJsxExpression(n) && n.expression && ts.isConditionalExpression(n.expression)).expression;
function labelCode(node) {
  if (ts.isParenthesizedExpression(node)) return labelCode(node.expression);
  if (ts.isConditionalExpression(node)) return `(${node.condition.getText(ast)} ? ${labelCode(node.whenTrue)} : ${labelCode(node.whenFalse)})`;
  const words = [];
  (function text(child) { if (ts.isJsxText(child) && child.text.trim()) words.push(child.text.trim()); ts.forEachChild(child, text); })(node);
  assert(words.length, 'Actual label branch must contain text'); return JSON.stringify(words.join(' '));
}
const code = ts.transpileModule(`${[...declarations.values()].map(d => `const ${d};`).join('\n')}
${verificationState.join('\n')}
this.defaults = DEFAULT_PROVIDERS;
this.keyInfo = PROVIDER_KEY_INFO;
this.status = () => ({ label: ${labelCode(label)}, background: ${background}, disabled: ${expression(button.openingElement, 'disabled').getText(ast)} });
this.reset = (baseProviders, k) => { ${reset}; };
this.render = () => {
 const providers = this.providers;
 const selectedProvider = this.selectedProvider;
 const activeProvider = this.activeProvider;
 ${source.includes('providersRef.current = providers') ? 'providersRef.current = providers;' : ''}
 const checkConnection = ${handlers.get('checkConnection')};
 this.checkConnection = checkConnection;
 ${[...handlers].filter(([name]) => name !== 'checkConnection').map(([name, body]) => `this[${JSON.stringify(name)}] = ${body};`).join('\n')}
 this.startup = ${startup};
};`, {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(selected = 'groq', active = selected, patch = {}) {
  const requests = []; const timers = []; const state = { active, selected, providers: {} };
  const context = { providers: {}, selectedProvider: selected, activeProvider: active, API: 'in-memory',
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); },
    confirm: () => true, useRef: value => ({ current: value }), localStorage: { getItem: () => null }, console: { error() {} },
    t: (_key, fallback) => fallback,
    setShowProviders: value => { state.panelChanges = [...(state.panelChanges || []), value]; },
    handleUnauthorized: () => { state.unauthorized = (state.unauthorized || 0) + 1; },
    setActiveProvider: key => { state.active = key; context.activeProvider = key; },
    setSelectedProvider: key => { state.selected = key; context.selectedProvider = key; },
    setProviders: fn => { state.providers = fn(state.providers); context.providers = state.providers; context.render?.(); },
    fetch: (_url, options) => new Promise((resolve, reject) => requests.push({ resolve, reject, body: options?.body ? JSON.parse(options.body) : undefined })),
  };
  vm.runInNewContext(code, context);
  state.providers = JSON.parse(JSON.stringify(context.defaults));
  state.providers[selected] = { ...state.providers[selected], ...patch }; context.providers = state.providers;
  context.render();
  context.keyOptional = ['keyless', 'optional'].includes(context.keyInfo[selected]?.need);
  const reply = async (ok, error, index = requests.length - 1) => { requests[index].resolve({ status: 200, json: async () => ({ ok, error }) }); await Promise.resolve(); await Promise.resolve(); };
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  const retry = async () => { assert(timers.length, 'Actual retry sleep must be queued'); timers.shift().callback(); await flush(); };
  return { state, context, status: () => context.status(), reply, requests, timers, flush, retry };
}
function notCertified(f) {
  assert.notEqual(f.status().label, 'Verified & Active'); assert.notEqual(f.status().background, '#22c55e');
}
for (const provider of ['auto', 'groq', 'gemini', 'cerebras', 'mistral', 'deepseek', 'openrouter']) {
  test(`unverified default ${provider} never claims successful active verification`, () => notCertified(fixture(provider)));
}
test('deleting a free provider key preserves fallback policy but cannot certify it', () => {
  const f = fixture('groq', 'auto', { verified: true }); f.context.deleteProviderKey('groq');
  assert.equal(f.state.providers.groq.apiKey, 'free-mode'); assert.equal(f.state.providers.groq.verified, false);
  assert.equal(f.state.active, 'auto'); notCertified(f);
});
test('verified inactive provider never claims it is active', () => notCertified(fixture('groq', 'auto', { verified: true, isConnected: true })));
test('current connected verified provider displays the successful active state', () => {
  const f = fixture('auto', 'auto', { verified: true, isConnected: true });
  assert.equal(f.status().label, 'Verified & Active'); assert.equal(f.status().background, '#22c55e');
});
test('disconnected verified provider cannot show success', () => notCertified(fixture('groq', 'groq', { verified: true, isConnected: false })));
test('verifying state disables the button and shows progress', () => {
  const f = fixture('groq', 'groq', { isVerifying: true, isConnected: false, verified: false });
  assert.equal(f.status().label, 'Verifying...'); assert.equal(f.status().disabled, true); notCertified(f);
});
test('failed verification displays error color without claiming success', () => {
  const f = fixture('groq', 'groq', { isConnected: false, verified: false, lastError: 'probe failed' });
  assert.equal(f.status().background, '#ef4444'); notCertified(f);
});
test('actual reload reset invalidates saved connection and verification', () => {
  const f = fixture('groq', 'groq', { verified: true, isConnected: true });
  f.context.reset(f.state.providers, 'groq'); notCertified(f);
});
test('actual key input clears verification before another probe', () => {
  const f = fixture('groq', 'groq', { verified: true, isConnected: true });
  f.context.key({ target: { value: '' } }); notCertified(f);
});
for (const [handler, provider, value] of [['model', 'groq', 'another-model'], ['endpoint', 'grok', 'https://example.invalid/v1'], ['openrouter-model', 'openrouter', 'openai/gpt-4o']]) {
  test(`actual ${handler} change cannot certify a model or endpoint which was never verified`, () => {
    const f = fixture(provider, provider, { verified: true, isConnected: true });
    f.context[handler]({ target: { value } }); notCertified(f);
  });
}
test('actual checkConnection success activates and verifies the selected provider', async () => {
  const f = fixture('groq', 'auto'); const pending = f.context.checkConnection('groq');
  notCertified(f); await f.reply(true); assert.equal(await pending, true);
  assert.equal(f.state.active, 'groq'); assert.equal(f.status().label, 'Verified & Active');
});
test('actual checkConnection failure cannot certify or activate the provider', async () => {
  const f = fixture('groq', 'auto'); const pending = f.context.checkConnection('groq');
  await f.reply(false, 'probe failed'); assert.equal(await pending, false);
  assert.equal(f.state.active, 'auto'); notCertified(f);
});
test('actual disconnect removes successful active status', async () => {
  const f = fixture('groq', 'groq', { verified: true, isConnected: true });
  const pending = f.context.handleDisconnect('groq'); notCertified(f);
  await f.reply(true); await pending; notCertified(f);
});
test('late success for the former key cannot certify the changed current configuration', async () => {
  const f = fixture('groq', 'groq', { apiKey: 'fixture-only-former-key' }); const pending = f.context.checkConnection('groq');
  f.context.key({ target: { value: '' } }); await f.reply(true); await pending;
  notCertified(f);
});
test('older provider probe cannot replace the newer explicitly verified active provider', async () => {
  const f = fixture('groq', 'auto'); const old = f.context.checkConnection('groq');
  const fresh = f.context.checkConnection('auto'); await f.reply(true, undefined, 1); await fresh;
  assert.equal(f.state.active, 'auto'); await f.reply(true, undefined, 0); await old;
  assert.equal(f.state.active, 'auto');
});
for (const [handler, provider, value] of [['model', 'groq', 'changed-model'], ['endpoint', 'grok', 'https://example.invalid/changed'], ['openrouter-model', 'openrouter', 'openai/gpt-4o']]) {
  test(`late success cannot verify ${handler} changed during the actual probe`, async () => {
    const f = fixture(provider, provider); const pending = f.context.checkConnection(provider);
    f.context[handler]({ target: { value } }); await f.reply(true); assert.equal(await pending, false); notCertified(f);
  });
}
test('deleting the key during verification rejects its late success and clears progress', async () => {
  const f = fixture('groq', 'groq'); const pending = f.context.checkConnection('groq');
  f.context.deleteProviderKey('groq'); await f.reply(true); assert.equal(await pending, false);
  assert.equal(f.state.providers.groq.isVerifying, false); notCertified(f);
});
test('disconnect during verification rejects late success without recertifying connection', async () => {
  const f = fixture('groq', 'groq'); const probe = f.context.checkConnection('groq');
  const disconnect = f.context.handleDisconnect('groq');
  await f.reply(true, undefined, 1); await disconnect; await f.reply(true, undefined, 0);
  assert.equal(await probe, false); notCertified(f);
});
test('older same-key verification failure cannot overwrite the newer verified success', async () => {
  const f = fixture('groq', 'groq'); const old = f.context.checkConnection('groq');
  const fresh = f.context.checkConnection('groq'); await f.reply(true, undefined, 1); assert.equal(await fresh, true);
  await f.reply(false, 'old failure', 0); assert.equal(await old, false);
  assert.equal(f.status().label, 'Verified & Active'); assert.equal(f.state.providers.groq.lastError, undefined);
});
test('background success verifies its own provider without changing active provider or panel selection', async () => {
  const f = fixture('groq', 'groq'); const pending = f.context.checkConnection('auto', { background: true, closeOnSuccess: true });
  await f.reply(true); assert.equal(await pending, true);
  assert.equal(f.state.providers.auto.verified, true); assert.equal(f.state.active, 'groq');
  assert.equal(f.state.selected, 'groq'); assert.deepEqual(f.state.panelChanges || [], []);
});
test('older foreground success cannot close the panel after a newer explicit probe', async () => {
  const f = fixture('groq', 'auto'); const old = f.context.checkConnection('groq', { closeOnSuccess: true });
  const fresh = f.context.checkConnection('auto', { closeOnSuccess: false });
  await f.reply(true, undefined, 1); await fresh; await f.reply(true, undefined, 0); await old;
  assert.equal(f.state.active, 'auto'); assert.deepEqual(f.state.panelChanges || [], []);
});
test('stale response failure after a key edit cannot replace the current clean configuration state', async () => {
  const f = fixture(); const pending = f.context.checkConnection('groq');
  f.context.key({ target: { value: '' } }); await f.reply(false, 'obsolete error');
  assert.equal(await pending, false); assert.equal(f.state.providers.groq.lastError, undefined); notCertified(f);
});
test('stale thrown failure after an edit cannot paint the current provider red', async () => {
  const f = fixture(); const pending = f.context.checkConnection('groq');
  f.context.model({ target: { value: 'changed-model' } }); f.requests[0].reject(new Error('obsolete rejection'));
  assert.equal(await pending, false); assert.equal(f.state.providers.groq.lastError, undefined); notCertified(f);
});
test('stale unauthorized probe response after an edit cannot log the current user out', async () => {
  const f = fixture(); const pending = f.context.checkConnection('groq');
  f.context.key({ target: { value: '' } }); f.requests[0].resolve({ status: 401 });
  assert.equal(await pending, false); assert.equal(f.state.unauthorized || 0, 0); notCertified(f);
});
test('edit while response JSON is pending also fences verification success', async () => {
  const f = fixture(); const pending = f.context.checkConnection('groq'); let finishJSON, notifyEntered;
  const entered = new Promise(resolve => { notifyEntered = resolve; });
  f.requests[0].resolve({ status: 200, json: () => new Promise(resolve => { finishJSON = resolve; notifyEntered(); }) });
  await entered; assert(finishJSON);
  f.context.model({ target: { value: 'changed-model' } }); finishJSON({ ok: true });
  assert.equal(await pending, false); notCertified(f);
});

test('startup retry cannot verify its captured former configuration after a model edit during sleep', async () => {
  const f = fixture('groq', 'groq', { model: 'former-model' }); f.context.startup();
  await f.reply(false); await f.flush();
  f.context.model({ target: { value: 'current-model' } }); await f.retry();
  assert.equal(f.requests.length, 1); notCertified(f);
});

test('last startup retry cannot steal a newer foreground provider selection or activation', async () => {
  const f = fixture(); f.context.startup();
  for (let i = 0; i < 3; i++) { await f.reply(false); await f.flush(); if (i < 2) await f.retry(); }
  const manual = f.context.checkConnection('auto', { closeOnSuccess: true });
  await f.retry(); assert.equal(f.requests.length, 4); assert.equal(f.state.selected, 'auto');
  await f.reply(true); await manual; assert.equal(f.state.active, 'auto');
});

test('an older render probe reads the latest provider configuration ref', async () => {
  const f = fixture('groq', 'groq', { model: 'former-model' }); const oldCheck = f.context.checkConnection;
  f.context.model({ target: { value: 'current-model' } }); const pending = oldCheck('groq');
  assert.equal(f.requests[0].body.model, 'current-model'); await f.reply(true); await pending;
});

test('configuration edit during startup fetch rejects success and stops retries', async () => {
  const f = fixture(); f.context.startup(); f.context.model({ target: { value: 'current-model' } });
  await f.reply(true); await f.flush(); assert.equal(f.state.providers.groq.verified, false);
  assert.equal(f.state.providers.groq.isVerifying, false); assert.equal(f.timers.length, 0);
});

test('manual other-provider probe retires the pending startup spinner without stealing activation', async () => {
  const f = fixture(); f.context.startup(); const manual = f.context.checkConnection('auto');
  await f.reply(true, undefined, 0); await f.flush();
  assert.equal(f.state.providers.groq.isVerifying, false); assert.equal(f.state.providers.groq.verified, false);
  await f.reply(true, undefined, 1); await manual; assert.equal(f.state.active, 'auto');
});

test('startup cleanup cannot clear a newer same-provider foreground spinner', async () => {
  const f = fixture(); const cleanup = f.context.startup(); const manual = f.context.checkConnection('groq');
  cleanup(); assert.equal(f.state.providers.groq.isVerifying, true);
  await f.reply(false, 'former startup error', 0); await f.flush();
  assert.equal(f.state.providers.groq.isVerifying, true);
  await f.reply(true, undefined, 1); await manual; assert.equal(f.state.providers.groq.verified, true);
});

for (const outcome of ['success', 'unauthorized', 'rejection']) {
  test(`actual startup cleanup clears only its spinner and rejects late ${outcome}`, async () => {
    const f = fixture(); const cleanup = f.context.startup(); assert.equal(f.state.providers.groq.isVerifying, true);
    cleanup(); assert.equal(f.state.providers.groq.isVerifying, false);
    if (outcome === 'success') await f.reply(true);
    if (outcome === 'unauthorized') f.requests[0].resolve({ status: 401 });
    if (outcome === 'rejection') f.requests[0].reject(new Error('late rejection'));
    await f.flush(); assert.equal(f.state.providers.groq.verified, false);
    assert.equal(f.state.providers.groq.lastError, undefined); assert.equal(f.state.unauthorized || 0, 0);
    assert.equal(f.timers.length, 0);
  });
}

test('cleanup during retry sleep prevents another automatic request', async () => {
  const f = fixture(); const cleanup = f.context.startup(); await f.reply(false); await f.flush();
  cleanup(); await f.retry(); assert.equal(f.requests.length, 1);
});

test('all startup attempts remain background and report only the final failure', async () => {
  const f = fixture('auto', 'groq'); f.context.startup();
  for (let i = 0; i < 4; i++) {
    await f.reply(false, `failure-${i}`); await f.flush();
    assert.equal(f.state.providers.groq.lastError, i === 3 ? 'failure-3' : undefined);
    if (i < 3) await f.retry();
  }
  assert.equal(f.state.selected, 'auto'); assert.equal(f.state.active, 'groq');
  assert.deepEqual(f.state.panelChanges || [], []); assert.equal(f.state.providers.groq.isVerifying, false);
});

test('successful startup claims its once guard without foreground activation', async () => {
  const f = fixture(); f.context.startup(); await f.reply(true); await f.flush();
  assert.equal(f.state.providers.groq.verified, true); assert.equal(f.context.startup(), undefined);
  assert.equal(f.requests.length, 1); assert.deepEqual(f.state.panelChanges || [], []);
});

test('cleanup after startup success preserves verified connection', async () => {
  const f = fixture(); const cleanup = f.context.startup(); await f.reply(true); await f.flush(); cleanup();
  assert.equal(f.state.providers.groq.verified, true); assert.equal(f.state.providers.groq.isConnected, true);
});

test('remount starts a new owned startup probe and old cleanup cannot retire it', async () => {
  const f = fixture(); const oldCleanup = f.context.startup(); oldCleanup(); const freshCleanup = f.context.startup();
  oldCleanup(); assert.equal(f.state.providers.groq.isVerifying, true);
  await f.reply(true, undefined, 0); await f.flush(); assert.equal(f.state.providers.groq.verified, false);
  await f.reply(true, undefined, 1); await f.flush(); assert.equal(f.state.providers.groq.verified, true); freshCleanup();
});

test('manual same-provider verification during retry sleep cancels the older startup schedule', async () => {
  const f = fixture(); f.context.startup(); await f.reply(false); await f.flush();
  const manual = f.context.checkConnection('groq'); await f.retry(); assert.equal(f.requests.length, 2);
  assert.equal(f.state.providers.groq.isVerifying, true); await f.reply(true); await manual;
  assert.equal(f.state.providers.groq.verified, true);
});

test('a retired startup owner cannot begin a probe or clear existing verification state', async () => {
  const f = fixture('groq', 'groq', { verified: true, isConnected: true });
  const pending = f.context.checkConnection('groq', { background: true, isCurrent: () => false });
  if (f.requests.length) await f.reply(true);
  assert.equal(await pending, false);
  assert.equal(f.requests.length, 0); assert.equal(f.state.providers.groq.verified, true);
});
