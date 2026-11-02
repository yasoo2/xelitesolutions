'use strict';
// Production run and parser with closed transport, planning and tool terminals.
// No network, daemon, account, shell, application file or real generated code.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict');
const ts=require('D:/Joe/xelitesolutions/api/node_modules/typescript');
const repo='D:/Joe/xelitesolutions';
const candidate=process.argv[2];
const file=(key,relative)=>candidate?path.join(candidate,key+'.proposed.ts'):path.join(repo,relative);
const sources={
 attended:fs.readFileSync(file('attended-run','api/src/core/session/attended-run.ts'),'utf8'),
 orchestrator:fs.readFileSync(file('AgentOrchestrator','api/src/orchestration/AgentOrchestrator.ts'),'utf8'),
 parser:fs.readFileSync(file('IntentParser','api/src/core/intelligence/IntentParser.ts'),'utf8'),
};
const emit=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const quiet={log(){},warn(){},error(){}};
function load(s,modules){
 const sandbox={exports:{},require:id=>{assert.ok(Object.hasOwn(modules,id),'unmocked effect module '+id);return modules[id];},
  AbortController,AbortSignal,URL,Map,Set,Promise,console:quiet,setTimeout,clearTimeout,setImmediate,process:{env:{DISABLE_NARRATION:'true'}},global:{}};
 vm.runInNewContext(emit(s),sandbox);return sandbox.exports;
}
const lifetime=load(sources.attended,{});
const noop=()=>{};
function fixture({stage='fast',parentSignal,cancellation,otherSignal}={}){
 const d=deferred(),calls=[],tools=[],progress=[],narrator=new AbortController();
 const route=async(_messages,_a,_b,_c,_d,_e,_f,ctx)=>{
  assert.ok(ctx && typeof ctx==='object');calls.push(ctx);
  if(ctx.signal?.aborted)throw ctx.signal.reason;
  if((stage==='intent'&&calls.length===1)||(stage==='narration'&&calls.length===2)){
   if(ctx.signal)ctx.signal.addEventListener('abort',()=>d.reject(ctx.signal.reason),{once:true});
   return d.promise;
  }
  return '{"primary":"opaque","complexity":"medium","suggestedAgent":"General"}';
 };
 const parsed=load(sources.parser,{
  '../llm/context-engine':{buildConversationContext:(userId,sessionId,history)=>({userId,sessionId,history}),analyzeContextualIntent:()=>null},
  './bounded-read-navigation':{boundedReadNavigationUnderFileConstraint:()=>false},
  '../orchestrator/workspace-overview':{isReadOnlyWorkspaceOverviewRequest:()=>false},
  '../orchestrator/buildIntent':{isBoundedTerminalDiagnosticRequest:()=>false},
  '../llm/intelligent-router':{__esModule:true,default:{routeToModel:route}},
  '../orchestrator/promptNormalizer':{normalizeIntentText:s=>s},
  '../orchestrator/file-intent':{parseExplicitAppendFileRequest:()=>null,parseExplicitFileRequest:()=>null,parseExplicitFileReadRequest:()=>null,parseExplicitFileEditRequest:()=>null,parseQuotedTextWriteRequest:()=>null},
  '../capabilities/decision-profiles':{capabilityFamilyFromRequest:()=>null},
  '../orchestrator/capability-match':{capableTools:()=>[]},
  './intent-classifier':{classifyIntent:async()=>({}),isBuildRequest:()=>({isBuild:false}),isBrowserRequest:()=>false,isKnowledgeQuestionStructural:()=>false,clearIntentCache:noop},
  './requested-action':{hasRequestedAction:()=>({isAnswerOnly:false,isNoFileChanges:false})},
 });
 const plannerCalls=[];
 const planning={generatePlan:async(_input,_trace,ctx)=>{
   plannerCalls.push(ctx);
   if(stage==='plan'){
    if(ctx.signal?.aborted)throw ctx.signal.reason;
    ctx.signal?.addEventListener('abort',()=>d.reject(ctx.signal.reason),{once:true});
    return d.promise;
   }
   return {steps:stage==='narration'?[{id:'inspect',tool:'inspect_directory',agent:'General',description:'Inspect fixture',input:{path:'.'},dependsOn:[]}]:[]};
  },fillRequiredArgs:s=>s,wireDataFlow:s=>s};
 class Memory {constructor(id){this.sessionId=id;}getHistory(){return [];}getSummary(){return '';}getAllResults(){return {};}getResults(){return {};}record(){}setContext(){} }
 class Agent {}
 const runtime=load(sources.orchestrator,{
  '../core/orchestrator/PlanningEngine':{PlanningEngine:planning},
  '../shared/reply-language':{isArabicReply:()=>false,say:(_ar,_a,b)=>b},
  '../core/orchestrator/plan-tools':{unrunnableShellStep:()=>null},
  '../core/intelligence/IntentParser':parsed,
  '../modules/services/ToolService':{executeTool:async(name,input,ctx)=>{tools.push({name,input,ctx});return {ok:true,output:{status:'completed'}};}},
  '../api/ws':{broadcastThinkingDetail:noop,broadcast:noop},
  '../core/orchestrator/phaseAnnounce':{announcePhase:noop},
  '../core/agents/narrator':{narrationEnabled:()=>stage==='narration',narrate:async(_context,callback)=>({text:await callback('narration fixture',narrator.signal)})},
  '../core/llm/intelligent-router':{__esModule:true,default:{routeToModel:route},routeToModel:route,isProviderFailure:()=>false,PROVIDER_FAILURE_PREFIX:'provider_failure:'},
  './departments':{emitDepartment:()=>progress.push('department')},
  'crypto':{randomUUID:()=> 'synthetic-dag'},
  './agents/BaseAgent':{BaseAgent:Agent},'./agents/SecurityAgent':{SecurityAgent:Agent},'./agents/BrowserAgent':{BrowserAgent:Agent},
  '../core/orchestrator/ExecutionMemory':{ExecutionMemory:Memory,compactRuntimeValue:x=>x},
  '../modules/services/TraceManager':{traceManager:{logEvent:noop,endTrace:noop}},
  './AgentExecutionFirewall':{executionFirewall:{runInContext:(_trace,work)=>work()}},
  '../shared/utils/deadline':{withDeadline:p=>p,NODE_DEADLINE_MS:30000,RUN_DEADLINE_MS:60000},
  '../core/memory/repair-memory':{repairMemory:{}},
  '../core/orchestrator/answerComposer':{},
  '../core/session/attended-run':lifetime,
  '../core/capabilities/decision-profiles':{compactCapabilityDecisionReceiptForRuntime:x=>x},
 });
 const instance=new runtime.AgentOrchestrator();
 const start=(id='synthetic-run')=>instance.execute({id,goal:'opaque-intent-token',context:{sessionId:'synthetic-session',userId:'synthetic-owner',workspaceId:'synthetic-workspace',signal:parentSignal,cancellation,
  modelConfig:{provider:'local',model:'synthetic-model'},...(otherSignal?{signal:otherSignal}:{})}});
 return {start,instance,calls,tools,plannerCalls,parser:parsed.IntentParser,d,narrator,progress};
}
const rows=[];
async function test(name,body){let timer;try{await Promise.race([body(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('bounded test did not settle in 250ms')),250);})]);rows.push({name,pass:true});}catch(error){rows.push({name,pass:false,error:String(error.message)});}finally{clearTimeout(timer);}}
(async()=>{
 await test('new signal begins pending and completion dispose does not cancel it',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const p=deferred(),b=lifetime.bindRunCancellation(p.promise);assert.equal(b.signal.aborted,false);b.dispose();p.resolve();await tick();assert.equal(b.signal.aborted,false);
 });
 for(const rejected of [false,true])await test('owner '+(rejected?'rejection':'resolution')+' aborts model transport with canonical safe reason',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const p=deferred(),b=lifetime.bindRunCancellation(p.promise);if(rejected)p.reject(Error('private owner value'));else p.resolve();await tick();assert.equal(b.signal.aborted,true);assert.equal(b.signal.reason.message,lifetime.CANCELLED);b.dispose();
 });
 await test('upstream signal abort reaches model synchronously and strips private reason',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const owner=new AbortController(),b=lifetime.bindRunCancellation(undefined,owner.signal);owner.abort(Error('private upstream'));assert.equal(b.signal.aborted,true);assert.equal(b.signal.reason.message,lifetime.CANCELLED);b.dispose();
 });
 await test('already-aborted upstream is not lost during listener installation',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const owner=new AbortController();owner.abort();const b=lifetime.bindRunCancellation(undefined,owner.signal);assert.equal(b.signal.aborted,true);b.dispose();
 });
 await test('disposed completed lifetime detaches upstream listener',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const owner=new AbortController();let adds=0,removes=0;const add=owner.signal.addEventListener.bind(owner.signal),remove=owner.signal.removeEventListener.bind(owner.signal);
  owner.signal.addEventListener=(...args)=>{adds++;return add(...args);};owner.signal.removeEventListener=(...args)=>{removes++;return remove(...args);};const b=lifetime.bindRunCancellation(undefined,owner.signal);b.dispose();owner.abort();assert.equal(b.signal.aborted,false);assert.equal(adds,1);assert.equal(removes,1);
 });
 await test('concurrent run owner cannot abort its independent sibling',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const a=deferred(),z=deferred(),aa=lifetime.bindRunCancellation(a.promise),zz=lifetime.bindRunCancellation(z.promise);a.resolve();await tick();assert.equal(aa.signal.aborted,true);assert.equal(zz.signal.aborted,false);aa.dispose();zz.dispose();
 });
 for(const invalid of [{then(){}},7,'cancel'])await test('invalid owner promise '+typeof invalid+' is rejected before upstream listener attachment',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const owner=new AbortController();let listeners=0;owner.signal.addEventListener=()=>{listeners++;};assert.throws(()=>lifetime.bindRunCancellation(invalid,owner.signal),/invalid_run_cancellation_promise/);assert.equal(listeners,0);
 });
 for(const invalid of [{aborted:false},{aborted:'no',addEventListener:noop,removeEventListener:noop}])await test('malformed upstream signal is rejected before any model work',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');assert.throws(()=>lifetime.bindRunCancellation(undefined,invalid),/invalid_run_cancellation_signal/);
 });
 await test('completion disposal is idempotent',async()=>{
  assert.equal(typeof lifetime.bindRunCancellation,'function');const owner=new AbortController();let removes=0;owner.signal.removeEventListener=()=>{removes++;};const b=lifetime.bindRunCancellation(undefined,owner.signal);b.dispose();b.dispose();assert.equal(removes,1);
 });
 await test('actual parser factory preserves model config and exact explicit signal',async()=>{
  const f=fixture(),signal=new AbortController().signal,model={provider:'local'};const ctx=f.parser.createContext('owner','session',[],model,signal);assert.equal(ctx.signal,signal);assert.equal(ctx.modelConfig,model);assert.equal(ctx.userId,'owner');assert.equal(ctx.sessionId,'session');
 });
 await test('legacy parser factory remains usable without an owner signal',async()=>{
  const f=fixture(),ctx=f.parser.createContext('owner','session',[],{provider:'local'});assert.equal(ctx.signal,undefined);assert.equal(ctx.modelConfig.provider,'local');
 });
 for(const stage of ['intent','plan'])await test('real orchestrator '+stage+' cancellation reaches pending model and prevents tool/planning continuation',async()=>{
  const owner=deferred(),f=fixture({stage,cancellation:owner.promise});const running=f.start();const outcome=running.then(v=>({value:v}),e=>({error:e}));await tick();assert.ok((stage==='intent'?f.calls:f.plannerCalls).length>0);owner.resolve();await tick();
  assert.equal((stage==='intent'?f.calls[0]:f.plannerCalls[0]).signal?.aborted,true);const end=await outcome;assert.equal(end.error?.message,lifetime.CANCELLED);assert.equal(f.tools.length,0);if(stage==='intent')assert.equal(f.plannerCalls.length,0);assert.equal(f.instance.memory.size,0);
 });
 await test('pre-aborted real orchestrator does not dispatch parser, planner or tools',async()=>{
  const owner=new AbortController();owner.abort();const f=fixture({parentSignal:owner.signal});let error;try{await f.start();}catch(e){error=e;}assert.equal(error?.message,lifetime.CANCELLED);assert.equal(f.calls.length,0);assert.equal(f.plannerCalls.length,0);assert.equal(f.tools.length,0);assert.equal(f.instance.memory.size,0);
 });
 await test('ordinary real orchestrator completion keeps exact model config and disposes owner link',async()=>{
  const owner=deferred(),f=fixture({cancellation:owner.promise});const result=await f.start();assert.equal(result.ok,true);assert.equal(f.calls[0].modelConfig.modelConfig.provider,'local');assert.equal(f.plannerCalls[0].modelConfig.provider,'local');assert.equal(f.calls[0].signal,f.plannerCalls[0].signal);assert.equal(f.calls[0].signal?.aborted,false);owner.resolve();await tick();assert.equal(f.calls[0].signal?.aborted,false);assert.equal(f.instance.memory.size,0);
 });
 await test('one stopped real run does not poison a following real run',async()=>{
  const owner=deferred(),stopped=fixture({stage:'plan',cancellation:owner.promise});const first=stopped.start().catch(e=>e);await tick();owner.resolve();await tick();assert.equal((await first).message,lifetime.CANCELLED);const next=fixture();assert.equal((await next.start('next-run')).ok,true);assert.equal(next.plannerCalls[0].signal?.aborted,false);assert.equal(next.tools.length,0);
 });
 await test('real narration combines owner cancellation with its existing timeout signal',async()=>{
  const owner=deferred(),f=fixture({stage:'narration',cancellation:owner.promise});const first=f.start().catch(e=>e);await tick();assert.ok(f.calls.length>=2);const narration=f.calls.at(-1);owner.resolve();await tick();assert.equal(narration.signal?.aborted,true);assert.equal(f.narrator.signal.aborted,false);assert.equal((await first).message,lifetime.CANCELLED);assert.equal(f.tools.length,0);
 });
 await test('real narration retains its own timeout while owner remains active',async()=>{
  const owner=deferred(),f=fixture({stage:'narration',cancellation:owner.promise});const first=f.start().catch(e=>e);await tick();assert.ok(f.calls.length>=2);const narration=f.calls.at(-1);f.narrator.abort(Error('narration_timeout'));await tick();assert.equal(narration.signal?.aborted,true);await first;assert.equal(f.plannerCalls[0].signal?.aborted,false);
 });
 const result={tests:rows,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length,scope:'Actual production run+parser with closed planner/provider/tool/effect terminals; not live inference or UAT'};process.stdout.write(JSON.stringify(result,null,2)+'\n');process.exitCode=result.failed?1:0;
})().catch(error=>{process.stderr.write(String(error.stack)+'\n');process.exitCode=2;});
