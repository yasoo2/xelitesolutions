'use strict';
// Verify the actual run selection/payload statements without network or React side effects.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

const file = process.argv[2] || path.join(__dirname, '../src/components/CommandComposer.tsx');
const source = fs.readFileSync(file, 'utf8');
const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0, 'Composer must parse before behavior is tested');
let run;
(function find(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.getText(ast) === 'run') run = node;
  ts.forEachChild(node, find);
})(ast);
assert.ok(run?.body, 'Actual run handler is required');
let statements;
let payload;
(function find(node) {
  if (ts.isBlock(node)) {
    const index = node.statements.findIndex(s => ts.isVariableStatement(s)
      && s.declarationList.declarations.some(d => d.name.getText(ast) === 'payload'));
    if (index >= 0) {
      const start = node.statements.findIndex(s => ts.isVariableStatement(s)
        && s.declarationList.declarations.some(d => ['pickFirstValidProvider', 'providerToSend'].includes(d.name.getText(ast))));
      if (start >= 0 && start < index) {
        assert.equal(statements, undefined, 'Submission block must be unique');
        statements = node.statements.slice(start, index);
        payload = node.statements[index];
      }
    }
  }
  ts.forEachChild(node, find);
})(run.body);
assert.ok(statements && payload, 'Actual contiguous selection and payload are required');
const extracted = statements.map(s => s.getText(ast)).join('\n') + '\n' + payload.getText(ast);
const program = ts.transpileModule('this.submit=()=>{' + extracted + '\nreturn payload;};', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const config = (patch = {}) => ({ isFree: false, apiKey: '', model: 'fixture-model', baseUrl: 'https://fixture.invalid/v1', isConnected: false, ...patch });
function submit(activeProvider, providers, selectedProvider = 'gemini') {
  const context = {
    activeProvider, providers, selectedProvider,
    inputText: 'Create a calculator', runSessionId: 'fixture-session', effectiveBrowserSessionId: null,
    filesForRun: [], workspaceId: 'fixture-workspace', console: { log() {} },
    document: { documentElement: { lang: 'en' } }, i18next: { language: 'ar' }, resolveIdentity: () => ({ name: 'fixture' }),
  };
  vm.runInNewContext(program, context, { timeout: 1000 });
  return context.submit();
}
const other = config({ isFree: true, apiKey: 'fixture-other-key', isConnected: true });
test('missing selected key never selects another connected vendor', () => assert.equal(submit('grok', { grok: config(), groq: other }).provider, 'grok'));
test('disconnected selected provider keeps its own credential', () => assert.equal(submit('grok', { grok: config({ apiKey: 'fixture-selected-key' }), groq: other }).apiKey, 'fixture-selected-key'));
test('unavailable credential never defaults to OpenAI', () => assert.equal(submit('grok', { grok: config(), openai: config() }).provider, 'grok'));
test('explicit Auto stays Auto', () => assert.equal(submit('auto', { auto: config({ isFree: true, apiKey: 'free-mode' }), grok: other }).provider, 'auto'));
test('keyless named Groq keeps its identity and server-key resolution placeholder', () => {
  const result = submit('groq', { groq: config({ isFree: true, apiKey: 'free-mode' }), auto: other });
  assert.equal(result.provider, 'groq'); assert.equal(result.apiKey, 'free-mode');
});
test('inactive panel selection cannot replace active provider', () => assert.equal(submit('groq', { groq: config({ isFree: true, apiKey: 'fixture-active-key' }), gemini: other }, 'gemini').provider, 'groq'));
test('unverified OpenAI does not select Groq', () => assert.equal(submit('openai', { openai: config({ apiKey: 'fixture-selected-key' }), groq: other }).provider, 'openai'));
test('selected model credential endpoint and workspace are preserved together', () => {
  const result = submit('grok', { grok: config({ apiKey: 'fixture-selected-key', model: 'fixture-selected-model', baseUrl: 'https://selected.invalid/v1' }), groq: other });
  assert.equal(result.provider, 'grok'); assert.equal(result.apiKey, 'fixture-selected-key'); assert.equal(result.model, 'fixture-selected-model');
  assert.equal(result.baseUrl, 'https://selected.invalid/v1'); assert.equal(result.workspaceId, 'fixture-workspace');
});
test('named NVIDIA configuration cannot become another vendor', () => assert.equal(submit('nvidia', { nvidia: config({ apiKey: 'fixture-nvidia-key' }), groq: other }).provider, 'nvidia'));
test('removed configuration produces a clear unavailable error', () => assert.throws(() => submit('removed', { groq: other }), /Selected provider is unavailable/));
test.after(() => assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8')).digest('hex'), sourceHash, 'Source must remain unchanged during verification'));
