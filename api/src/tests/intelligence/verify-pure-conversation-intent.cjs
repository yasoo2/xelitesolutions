const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const sourcePath = process.argv[2] || path.resolve(__dirname,'../../core/intelligence/IntentParser.ts');
const bytes = fs.readFileSync(sourcePath);
const sourceHash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
console.log('SOURCE_SHA256 '+sourceHash);
const ast = ts.createSourceFile(sourcePath,bytes.toString('utf8'),ts.ScriptTarget.Latest,true);
assert.equal(ast.parseDiagnostics.length,0,'Actual production source must parse');
const actualClass=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='IntentParser');
const methods=actualClass.members.filter(n=>ts.isMethodDeclaration(n)&&['parse','pureConversationKind'].includes(n.name.getText(ast)));
const code=ts.transpileModule('class IntentParser {\n'+methods.map(m=>m.getText(ast)).join('\n')+'\n}\nthis.Parser=IntentParser;', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(){
 const calls=[];const context={hasRequestedAction:()=>{calls.push('normal path');throw new Error('normal_path');}};
 vm.runInNewContext(code,context,{timeout:1000});return {Parser:context.Parser,calls};
}
const positives=[
 ['hi','greeting'],['HI!','greeting'],['hello...','greeting'],['hey','greeting'],['hola','greeting'],['yo','greeting'],
 ['مرحبا','greeting'],['مرحبًا!','greeting'],['مَرْحَبًا','greeting'],['أهلاً وسهلاً','greeting'],['السلام عليكم','greeting'],['السلام عليكم ورحمة الله وبركاته','greeting'],['صباح الخير','greeting'],['مساء الخير','greeting'],['  hi  ','greeting'],['hi   !','greeting'],
 ['who are you?','identity'],["What's your name?",'identity'],['what is your name','identity'],['من أنت؟','identity'],['ما اسمك','identity'],['عرّف عن نفسك','identity'],
 ['thanks','thanks'],['Thank you!','thanks'],['thx','thanks'],['tnx','thanks'],['شكراً','thanks'],['شكرًا','thanks'],['يعطيك العافية','thanks'],['مشكور','thanks'],['تسلم','thanks']
];
for(const [text,kind] of positives){
 test('pure '+kind+' skips deep intent analysis: '+text,async()=>{
  const f=fixture();const ctx={userId:'owner',sessionId:'session',workspaceId:'workspace'};const before=JSON.stringify(ctx);
  const intent=await f.Parser.parse(text,ctx);
  assert.equal(intent.goal,text);assert.deepEqual(Array.from(intent.requiredTools),['central_answer']);
  assert.equal(intent.rawIntent.pureSmallTalk,kind);assert.equal(intent.rawIntent.answerOnly,true);assert.equal(intent.rawIntent.deterministic,true);
  assert.equal(intent.suggestedAgent,'General');assert.equal(intent.riskLevel,'low');assert.equal(f.calls.length,0);
  assert.equal(JSON.stringify(ctx),before,'Classification cannot alter trusted identity/context');
 });
}
const mixed=[
 'hi build a page','hello, create a file','thanks, delete the project','hey deploy it',
 'hi pay the invoice','hello print my API key','مرحبا اكتب ملف','سلام افتح الموقع','شكرا واحذف المشروع',
 'hello https://example.test','hi /etc/passwd','hello\nrun npm test','hi; run',
 'thanks but why did the build fail?','who are you and read my project?',
 'من أنت وافتح المتصفح','ما اسمك واكتب ملفا','hello explain typescript',
 'hello create a speech app, do not change files','hello; process.exit()',
 'hello'+'.'.repeat(40),'hi hi hi hi hi hi hi','hello\u0000','hi 👋','hi and thanks'
];
for(const text of mixed){
 test('mixed/unknown text retains normal intent handling: '+JSON.stringify(text),async()=>{
  const f=fixture();if(f.Parser.pureConversationKind)assert.equal(f.Parser.pureConversationKind(text),null);
  await assert.rejects(f.Parser.parse(text,{}),/normal_path/);assert.equal(f.calls.length,1);
 });
}
for(const value of [null,undefined,0,{},[],['hello'],true]){
 test('malformed input cannot enter small-talk fast path: '+JSON.stringify(value),()=>{
  const f=fixture();assert.equal(typeof f.Parser.pureConversationKind,'function');assert.equal(f.Parser.pureConversationKind(value),null);
 });
}
for(const context of [{images:['picture']},{attachments:['document']},{images:['picture'],attachments:['document']}]){
 test('attached request remains in normal analysis: '+JSON.stringify(context),async()=>{
  const f=fixture();await assert.rejects(f.Parser.parse('hello',context),/normal_path/);assert.equal(f.calls.length,1);
 });
}
test('bounded classifications preserve contextual history and explicit cancellation data',async()=>{
 const f=fixture();const controller=new AbortController();controller.abort('owner_cancelled');
 const context={signal:controller.signal,history:[{role:'user',content:'Build the existing app'}],entities:new Map([['project','owned']])};
 const result=await f.Parser.parse('thanks',context);assert.equal(result.rawIntent.answerOnly,true);assert.equal(context.signal,controller.signal);assert(context.signal.aborted);assert.equal(context.entities.get('project'),'owned');assert.equal(context.history[0].content,'Build the existing app');assert.equal(f.calls.length,0);
});
test.after(()=>assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex').toUpperCase(),sourceHash,'Source must stay frozen'));

// Exercise actual production parsing, the complete planner method and the full
// answer tool together. Only the terminal model route is replaced; no API,
// ToolService permission, native effect or browser execution is claimed here.
const apiRoot=path.resolve(__dirname,'../../..');
const leafPath=process.argv[3] || path.join(apiRoot,'src/modules/tools/definitions/CentralAnswerTool.ts');
const leafBytes=fs.readFileSync(leafPath);
const leafHash=crypto.createHash('sha256').update(leafBytes).digest('hex').toUpperCase();
console.log('LEAF_SHA256 '+leafHash);
const pinnedHelpers=new Map();
const modules=new Map();
const allowedHelpers=new Set([
 'core/orchestrator/promptNormalizer.ts','core/intelligence/requested-action.ts',
 'core/design/app-blueprints.ts','core/design/page-head.ts','core/design/subject-phrase.ts',
 'core/language/arabic.ts','shared/reply-language.ts','shared/utils/language.ts'
].map(p=>path.resolve(apiRoot,'src',p)));
function pureModule(file){
 file=path.resolve(file);assert(allowedHelpers.has(file),'Only explicit pure helpers may load: '+file);
 if(modules.has(file))return modules.get(file).exports;
 const b=fs.readFileSync(file);pinnedHelpers.set(file,crypto.createHash('sha256').update(b).digest('hex'));
 const m={exports:{}};modules.set(file,m);
 const compiled=ts.transpileModule(b.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const sandbox={module:m,exports:m.exports,console:{log(){},warn(){},error(){}},require:name=>{
  if(name==='snowball-stemmers')return require(name); // Installed pure lexical library.
  assert(name.startsWith('.'),'No operational/native dependency: '+name);
  return pureModule(path.resolve(path.dirname(file),name+'.ts'));
 }};
 vm.runInNewContext(compiled,sandbox,{timeout:2000});return m.exports;
}
const normalizer=pureModule(path.join(apiRoot,'src/core/orchestrator/promptNormalizer.ts'));
const action=pureModule(path.join(apiRoot,'src/core/intelligence/requested-action.ts'));
const reply=pureModule(path.join(apiRoot,'src/shared/reply-language.ts'));
const language=pureModule(path.join(apiRoot,'src/shared/utils/language.ts'));
const plannerPath=path.join(apiRoot,'src/core/orchestrator/PlanningEngine.ts');
const plannerBytes=fs.readFileSync(plannerPath);
pinnedHelpers.set(plannerPath,crypto.createHash('sha256').update(plannerBytes).digest('hex'));
const plannerAst=ts.createSourceFile(plannerPath,plannerBytes.toString('utf8'),ts.ScriptTarget.Latest,true);
const plannerClass=plannerAst.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='PlanningEngine');
const generate=plannerClass.members.find(n=>ts.isMethodDeclaration(n)&&n.name.getText(plannerAst)==='generatePlan');
assert(generate,'Actual complete generatePlan method required');
const plannerCode=ts.transpileModule('class PlanningEngine {\n'+generate.getText(plannerAst)+'\n}\nthis.Planner=PlanningEngine;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const leafAst=ts.createSourceFile(leafPath,leafBytes.toString('utf8'),ts.ScriptTarget.Latest,true);
assert.equal(leafAst.parseDiagnostics.length,0);
const leafCode=ts.transpileModule(leafAst.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(leafAst)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function pairedFixture(){
 const calls=[];const sandbox={exports:{},console:{log(){},warn(){},error(){}},Date,AbortController,setTimeout,clearTimeout,
  ...normalizer,...action,...reply,...language,PROVIDER_FAILURE_PREFIX:'MODEL_FAILURE:',
  routeToModel:async(...args)=>{calls.push({messages:args[0],context:args[7]});return 'Model boundary reached.';}
 };
 vm.runInNewContext(code+'\n'+plannerCode+'\n'+leafCode,sandbox,{timeout:2000});
 return {Parser:sandbox.Parser,Planner:sandbox.Planner,Tool:sandbox.exports.CentralAnswerTool,calls};
}
for(const [text,kind] of positives){
 test('paired parser/planner/answer bypasses model for '+JSON.stringify(text),async()=>{
  const f=pairedFixture();const ctx={userId:'owner',sessionId:'session',workspaceId:'workspace',language:'en'};
  const before=JSON.stringify(ctx);const intent=await f.Parser.parse(text,ctx);
  const plan=await f.Planner.generatePlan({intent},'trace',ctx);
  assert.equal(plan.steps.length,1);assert.equal(plan.steps[0].tool,'central_answer');
  assert.equal(plan.steps[0].input.question,text);assert.equal(plan.metadata.answerOnly,true);
  const result=await new f.Tool().execute(plan.steps[0].input,ctx);
  assert.equal(result.ok,true);assert.equal(typeof result.output,'string');assert(result.output.length>5);
  assert(result.logs.includes('central_answer: instant fast-path (no model call)'));
  assert.equal(f.calls.length,0,'Classified spelling must not call a model');
  assert.equal(JSON.stringify(ctx),before,'Neither bridge nor answer may mutate trusted context');
  if(kind==='thanks')assert(result.output.includes("You're welcome!"));
  if(kind==='identity')assert(result.output.includes("I'm **Joe**"));
 });
}
for(const text of ['مَرْحَبًا','عَرِّف عن نفسك','شُكْرًا']){
 test('normalized Arabic answer preserves requested UI language '+text,async()=>{
  const f=pairedFixture();const intent=await f.Parser.parse(text,{language:'ar'});
  const plan=await f.Planner.generatePlan({intent});const result=await new f.Tool().execute(plan.steps[0].input,{language:'ar'});
  assert.equal(result.ok,true);assert(/[\u0600-\u06ff]/.test(result.output));assert.equal(f.calls.length,0);
 });
}
for(const text of ['hello, write a file','مَرْحَبًا اكتب ملف','hello'+'.'.repeat(40),'hi hi hi hi hi hi hi']){
 test('answer preserves model boundary for actual task or raw length limit '+JSON.stringify(text),async()=>{
  const f=pairedFixture();assert.equal(f.Parser.pureConversationKind(text),null);
  const result=await new f.Tool().execute({question:text},{language:'en',providerTimeoutMs:1000});
  assert.equal(result.ok,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].context.localReasoningEffort,'none');
  assert.equal(f.calls[0].messages.at(-1).content,text);
 });
}
test('paired answer retains cancellation and malformed-signal denial before instant/model',async()=>{
 const f=pairedFixture();const ctrl=new AbortController();ctrl.abort();const tool=new f.Tool();
 const stopped=await tool.execute({question:'hello'},{signal:ctrl.signal});assert.equal(stopped.ok,false);assert.equal(stopped.output.reason,'cancelled');
 const malformed=await tool.execute({question:'thanks'},{signal:{aborted:false}});assert.equal(malformed.ok,false);assert.equal(malformed.output.reason,'invalid_cancellation_context');
 assert.equal(f.calls.length,0);
});
test.after(()=>{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(leafPath)).digest('hex').toUpperCase(),leafHash,'Answer source frozen');
 for(const [file,hash] of pinnedHelpers)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'Pure helper/source frozen: '+file);
});
