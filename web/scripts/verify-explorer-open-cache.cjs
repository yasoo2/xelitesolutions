const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = path.join(root, 'src/components/EliteFileExplorer.tsx');
const bytes = fs.readFileSync(file);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
let effect, open;
const ast = ts.createSourceFile(file, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
(function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect'
      && node.arguments[0]?.getText(ast).includes("addEventListener('preview:code_diff'")) effect = node.arguments[0].getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'openFile') open = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
})(ast);
assert(open, 'Actual cached openFile boundary required');
const code = ts.transpileModule(`this.openFile=${open}; ${effect ? `this.cleanup=(${effect})();` : ''}`, {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 }
}).outputText;
function fixture(tabs = [tab()], sessionId = 's', viewMode = 'local') {
  const listeners = new Map(), events = [];
  const c = { tabs, sessionId, viewMode, useCallback: fn => fn,
    setTabs: fn => { c.tabs = fn(c.tabs); }, setActivePath: p => { c.activePath = p; },
    loadFileContent: () => { throw new Error('No IO permitted in cached-open verification'); },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: { addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
      dispatchEvent: e => events.push(e) } };
  vm.runInNewContext(code, c, { timeout: 1000 });
  return { c, events, send: detail => listeners.get('preview:code_diff')?.({ detail }) };
}
function tab(overrides = {}) { return { node: { path: 'D:/owned/a.ts' }, content: 'draft', isLoading: false, error: null, isDirty: false, lastSavedAt: 1, ...overrides }; }
for (const content of ['ready', '', 'الحالة: جاهز', 'https://example.invalid is literal']) {
  test('A scoped completed edit survives reopening cached content: '+JSON.stringify(content), async () => {
    const f = fixture(); f.send({ sessionId: 's', path: 'D:/owned/a.ts', content });
    await f.c.openFile(f.c.tabs[0].node);
    assert.equal(f.c.tabs[0].content, content);
    assert.equal(f.events.find(e => e.type === 'preview:code_diff').detail.content, content);
    assert.equal(f.c.tabs.length, 1);
  });
}
test('Unsaved user edits remain intact', () => {
  const old = tab({ isDirty: true, content: 'unsaved' }); const f = fixture([old]);
  f.send({ sessionId:'s',path:'D:/owned/a.ts',content:'disk' }); assert.equal(f.c.tabs[0], old);
});
test('An in-progress initial read remains under the existing loader contract', () => {
  const pending=tab({isLoading:true,error:'old'}); const f = fixture([pending]);
  f.send({sessionId:'s',path:'D:/owned/a.ts',content:'ready'});
  assert.equal(f.c.tabs[0],pending);assert.equal(f.c.tabs[0].isLoading,true);
});
for (const detail of [{}, null, {sessionId:'other',path:'D:/owned/a.ts',content:'x'},
  {path:'D:/owned/a.ts',content:'x'}, {sessionId:'',path:'D:/owned/a.ts',content:'x'},
  {sessionId:'s',path:' ',content:'x'}, {sessionId:'s',path:7,content:'x'},
  {sessionId:'s',path:'D:/owned/a.ts'}, {sessionId:'s',path:'D:/owned/a.ts',content:null},
  {sessionId:'s',path:'D:/owned/a.ts',content:7}, {sessionId:'s',path:'D:/other/a.ts',content:'x'}]) {
  test('Unowned, malformed or unrelated update preserves cached content: '+JSON.stringify(detail), () => {
    const old=tab();const f=fixture([old]);f.send(detail);assert.equal(f.c.tabs[0],old);
  });
}
test('No active session means no cache update',()=>{const f=fixture(undefined,undefined);f.c.sessionId=undefined;f.send({sessionId:'s',path:'D:/owned/a.ts',content:'x'});assert.equal(f.c.tabs[0].content,'draft');});
test('A local event cannot rewrite a GitHub tab',()=>{const f=fixture(undefined,'s','github');f.send({sessionId:'s',path:'D:/owned/a.ts',content:'x'});assert.equal(f.c.tabs[0].content,'draft');});
test('Unmount removes its receiver',()=>{const f=fixture();assert.equal(typeof f.c.cleanup,'function');f.c.cleanup();f.send({sessionId:'s',path:'D:/owned/a.ts',content:'x'});assert.equal(f.c.tabs[0].content,'draft');});
for (const [name, tag] of [['JoeIDELayout','FileExplorerPanel'],['FileExplorerPanel','EliteFileExplorer']]) {
  test('Active session is wired through '+name,()=>{
    const source=fs.readFileSync(path.join(root,'src/components',name+'.tsx'),'utf8');
    const tree=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let wired=false;
    (function walk(n){if((ts.isJsxSelfClosingElement(n)||ts.isJsxOpeningElement(n))&&n.tagName.getText(tree)===tag)wired=n.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='sessionId'&&p.initializer?.getText(tree)==='{sessionId}');ts.forEachChild(n,walk);})(tree);
    assert(wired,'Actual JSX must carry sessionId to '+tag);
  });
}
test.after(()=>assert.equal(sha(fs.readFileSync(file)),sha(bytes),'Product bytes unchanged by verification'));
