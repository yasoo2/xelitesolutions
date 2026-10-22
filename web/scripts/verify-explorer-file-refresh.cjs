const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const webRoot = process.argv[3] ? path.resolve(process.argv[3]) : path.resolve(__dirname, '..');
const ts = createRequire(path.join(webRoot, 'package.json'))('typescript');
const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(webRoot, 'src/pages/Joe.tsx');
const bytes = fs.readFileSync(sourcePath);
const sha = b => createHash('sha256').update(b).digest('hex').toUpperCase();
const sourceHash = sha(bytes);
console.log('SOURCE_SHA256 ' + sourceHash);
test.after(() => assert.equal(sha(fs.readFileSync(sourcePath)), sourceHash, 'Source unchanged'));
const ast = ts.createSourceFile(sourcePath, bytes.toString('utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let mine, subscriber, pending;
(function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'mine') mine = node.initializer.getText(ast);
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'pendingFileRefreshRunIds') pending = node.initializer.getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'SocketService.subscribe'
      && node.arguments[0]?.getText(ast).includes('terminalRunIdsRef')) subscriber = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
})(ast);
assert(mine && subscriber, 'Actual Joe scoped subscriber required');
const code = ts.transpileModule(`const mine=${mine}; const pendingFileRefreshRunIds=${pending || 'new Set()'}; this.receive=${subscriber}; this.pending=pendingFileRefreshRunIds;`, {
  compilerOptions: {module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}
}).outputText;
function fixture(activeSessionId='s') {
  const events=[];
  const context={activeSessionId,terminalRunIdsRef:{current:new Set()},terminalSessionIdsRef:{current:new Set()},
    keepBrowserVisibleRef:{current:false},pendingEchoRef:{current:new Map()},i18n:{language:'en'},
    setHistoryRefreshTick(){},setIsConnected(){},setDepartmentStatus(){},setIsLoading(){},setMessages(){},setWorkspaceTab(){},
    setTimeout(){},CustomEvent:class {constructor(type,options){this.type=type;this.detail=options?.detail;}},
    window:{dispatchEvent:event=>events.push(event)},fetch(){throw new Error('No HTTP in closed verification');}};
  vm.runInNewContext(code,context,{timeout:1000});
  return {context,send:(type,runId='r',sessionId='s',data={},extra={})=>context.receive({type,...(runId?{runId}:{}),...(sessionId?{sessionId}:{}),data,...extra}),
    refreshes:()=>events.filter(e=>e.type==='workspace:updated'),open:(runId='r')=>context.receive({type:'user_input',sessionId:activeSessionId,runId,data:{text:''}})};
}
for(const end of ['run_finished','run_completed','run_failed','run_cancelled']) test(`A completed disk write becomes visible once after exact ${end}`,()=>{
  const f=fixture();f.send('file_stream','r','s',{file:'new.txt',chunk:'literal',done:true});
  assert.equal(f.refreshes().length,0,'Do not fetch while file is still streaming');f.send(end);
  assert.equal(f.refreshes().length,1);assert.deepEqual(JSON.parse(JSON.stringify(f.refreshes()[0].detail)),{sessionId:'s',runId:'r'});
  assert.equal('path' in f.refreshes()[0].detail,false,'Do not trust artifact paths as workspace roots');
  assert.equal('content' in f.refreshes()[0].detail,false,'Do not expose file content in global refresh event');
});
for(const payload of [{file:'new.txt',done:true},{path:'new.txt',done:true}]) test(`Both native completed file forms refresh: ${JSON.stringify(payload)}`,()=>{
  const f=fixture();f.send('file_stream','r','s',payload);f.send('run_finished');assert.equal(f.refreshes().length,1);
});
test('A completed surgical diff refreshes without forcing any preview or terminal tab',()=>{
  const f=fixture();f.send('diff','r','s',{path:'new.txt',content:''});f.send('run_finished');assert.equal(f.refreshes().length,1);
});
test('A burst of 256 files requests a single root fetch after completion',()=>{
  const f=fixture();for(let i=0;i<256;i++)f.send('file_stream','r','s',{file:`file${i}.txt`,done:true});
  assert.equal(f.refreshes().length,0);assert.equal(f.context.pending.size,1);f.send('run_finished');assert.equal(f.refreshes().length,1);
});
test('Duplicate frames and terminal receipts do not repeat refresh',()=>{
  const f=fixture();f.send('file_stream','r','s',{file:'x.txt',done:true});f.send('file_stream','r','s',{file:'x.txt',done:true});
  f.send('run_finished');f.send('run_finished');f.send('file_stream','r','s',{file:'late.txt',done:true});f.send('run_finished');assert.equal(f.refreshes().length,1);
});
for(const payload of [{file:'x.txt',done:false},{file:'x.txt',done:'true'},{file:'x.txt'},{done:true},{file:'   ',done:true},{file:7,done:true}]) test(`Partial or malformed file frame cannot request refresh: ${JSON.stringify(payload)}`,()=>{
  const f=fixture();f.send('file_stream','r','s',payload);f.send('run_finished');assert.equal(f.refreshes().length,0);
});
for(const payload of [{path:'x.txt'},{path:'',content:'x'},{path:8,content:'x'}]) test(`Malformed diff cannot request refresh: ${JSON.stringify(payload)}`,()=>{
  const f=fixture();f.send('diff','r','s',payload);f.send('run_finished');assert.equal(f.refreshes().length,0);
});
for(const [sid,rid] of [['other','r'],['','r'],['s','']]) test(`Unowned or unaddressed artifacts do not refresh current workspace: ${sid}/${rid}`,()=>{
  const f=fixture();f.send('file_stream',rid,sid,{file:'x.txt',done:true});f.send('run_finished',rid,sid);assert.equal(f.refreshes().length,0);
});
test('Suppressed presentation cannot mark workspace dirty',()=>{
  const f=fixture();f.send('file_stream','r','s',{file:'x.txt',done:true},{suppressPresentation:true});f.send('run_finished');assert.equal(f.refreshes().length,0);
});
test('A knowledge/read-only run does not refresh the file tree',()=>{
  const f=fixture();f.send('tool_done','r','s',{tool:'central_answer'});f.send('run_finished');assert.equal(f.refreshes().length,0);
});
test('An unrelated terminal cannot consume a different exact run dirty receipt',()=>{
  const f=fixture();f.send('file_stream','a','s',{file:'x.txt',done:true});f.send('run_finished','b');assert.equal(f.refreshes().length,0);
});
test('A new session subscription cannot inherit old-session dirty receipts',()=>{
  const first=fixture();first.send('file_stream','r','s',{file:'x.txt',done:true});
  const next=fixture('next');next.send('run_finished','r','next');assert.equal(next.refreshes().length,0);
});
test('A successor run can refresh after earlier completion',()=>{
  const f=fixture();f.send('file_stream','a','s',{file:'a.txt',done:true});f.send('run_finished','a');f.open('b');
  f.send('file_stream','b','s',{file:'b.txt',done:true});f.send('run_finished','b');assert.equal(f.refreshes().length,2);
});
test('Dirty receipt storage remains bounded under excessive distinct IDs',()=>{
  const f=fixture();for(let i=0;i<128;i++)f.send('file_stream',`r${i}`,'s',{file:'x.txt',done:true});assert(f.context.pending.size<=32);
});
