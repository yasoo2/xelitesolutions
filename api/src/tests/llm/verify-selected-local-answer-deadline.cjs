'use strict';
// Actual answer/router sources; only transport and clocks are inert. No live or hostile-code proof.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {newFixture,sourceReads}=require('./closed-local-answer-fixture.cjs');
const selected={provider:'local',model:'qwen2.5-coder:7b',baseUrl:'http://127.0.0.1:11434/v1'};
const question='Is SQLite a database? Reply with one English word.';
const answer=content=>({choices:[{finish_reason:'stop',message:{content}}]});
const rows=[];
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const context=extra=>({userId:'fixture-owner',workspaceId:'fixture-workspace',sessionId:'fixture-session',language:'en',modelConfig:{...selected},...extra});
const closed=(f,calls)=>{assert.equal(f.observations.sdk.length,calls);assert.equal(f.observations.adapterCalls.length,0);assert.equal(f.observations.metadata.length,0);assert.equal(f.observations.violations.length,0);assert.equal(f.timers.size,0);assert.ok(f.observations.constructors.every(c=>c.maxRetries===0));};
const check=async(name,run)=>{try{await run();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:String(e.message||e)});}};
(async()=>{
  await check('unbounded named local router caller gets five minutes without answer-tool injection',async()=>{
    const f=newFixture({},()=>Promise.resolve(answer('Yes')));
    const result=await f.router.routeToModel([{role:'user',content:question}],{type:'simple_chat',complexity:'low',requiresTools:false,estimatedTokens:50,language:'en',hasImages:false},undefined,undefined,undefined,undefined,undefined,context());
    assert.equal(result,'Yes');assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);assert.equal(f.observations.sdk[0].body.model,selected.model);closed(f,1);
  });
  await check('router caps only canonical local at300s and keeps ordinary cap180s',async()=>{
    const f=newFixture();
    assert.equal(f.router.requestedProviderTimeoutMs(context({providerTimeoutMs:600000})),300000);
    assert.equal(f.router.requestedProviderTimeoutMs({modelConfig:{provider:'openai',model:'fixture'},providerTimeoutMs:600000}),180000);
    assert.equal(f.router.requestedProviderTimeoutMs(context({providerTimeoutMs:14000})),14000);closed(f,0);
  });
  await check('one installed model supplies both chat and code without downloading another',async()=>{
    const f=newFixture({LOCAL_LLM_MODEL:selected.model,JOE_VISION_AUTOPULL:'0'},undefined,[selected.model]);
    await f.localBrain.detectLocalModels();
    assert.equal(f.localBrain.pickLocalModel('simple_chat','small_text'),selected.model);assert.equal(f.localBrain.pickLocalModel('code_generation'),selected.model);
    assert.deepEqual(Array.from(f.localBrain.getLocalBrainState().models),[selected.model]);assert.equal(f.observations.sdk.length,0);assert.deepEqual(f.observations.violations,[]);
  });
  for(const [name,extra,budget] of [
    ['selected local cold start receives300s',{},300000],
    ['shorter provider deadline respected',{providerTimeoutMs:13000},13000],
    ['shorter planner deadline respected',{providerTimeoutMs:22000,plannerTimeoutMs:11000},11000],
    ['longer caller cannot extend300s',{providerTimeoutMs:600000},300000],
  ])await check(name,async()=>{
    const f=newFixture({},()=>Promise.resolve(answer('Yes'))),parent=context(extra),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);
    assert.equal(r.ok,true);assert.equal(r.output,'Yes');
    const s=f.observations.sdk[0];assert.equal(s.body.model,selected.model);assert.equal(s.body.max_tokens,32);assert.equal(s.requestOptions.timeout,budget);assert.equal(s.requestOptions.signal.aborted,false);
    assert.equal(f.observations.constructors[0].baseURL,selected.baseUrl);
    const {providerAttempts,...after}=parent;assert.deepEqual(after,before);
    const route=f.observations.routeContexts[0];for(const field of ['userId','sessionId','workspaceId'])assert.equal(route[field],parent[field]);assert.equal(route.providerTimeoutMs,budget);closed(f,1);
  });
  await check('inert cloud answer retains ordinary45s',async()=>{
    const f=newFixture({AI_COST_POLICY:'allow_paid'},()=>Promise.resolve(answer('Yes')));
    const r=await f.tool.execute({question},context({modelConfig:{provider:'openai',model:'fixture-only',apiKey:'synthetic-key',baseUrl:'https://api.openai.com/v1'}}));
    assert.equal(r.ok,true);assert.equal(f.observations.sdk[0].requestOptions.timeout,45000);closed(f,1);
  });
  await check('cancelled before invocation dispatches nothing',async()=>{
    const owner=new AbortController();owner.abort();const f=newFixture();
    const r=await f.tool.execute({question},context({signal:owner.signal}));assert.equal(r.ok,false);assert.equal(r.output.reason,'cancelled');closed(f,0);
  });
  await check('owner cancellation aborts one in-flight request and cleans timers',async()=>{
    const f=newFixture({},e=>new Promise((_,reject)=>e.requestOptions.signal.addEventListener('abort',()=>reject(new Error('fixture aborted')),{once:true}))),owner=new AbortController();
    const pending=f.tool.execute({question},context({signal:owner.signal}));await flush();assert.equal(f.observations.sdk.length,1);owner.abort();const r=await pending;
    assert.equal(r.ok,false);assert.equal(r.output.reason,'cancelled');assert.equal(f.observations.sdk[0].requestOptions.signal.aborted,true);closed(f,1);
  });
  await check('selected300s deadline aborts request and rejects late completion',async()=>{
    let resolve;const f=newFixture({},()=>new Promise(r=>resolve=r));const pending=f.tool.execute({question},context());await flush();
    assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);
    const deadline=Array.from(f.timers.values()).find(t=>t.ms===300000);assert.ok(deadline);deadline.cb();const r=await pending;
    assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_deadline_exceeded');assert.equal(f.observations.sdk[0].requestOptions.signal.aborted,true);
    resolve(answer('Yes'));await flush();assert.equal(r.ok,false);closed(f,1);
  });
  await check('short upstream deadline rejects late completion at that same bound',async()=>{
    let resolve;const f=newFixture({},()=>new Promise(r=>resolve=r));const pending=f.tool.execute({question},context({providerTimeoutMs:1234}));await flush();
    const deadline=Array.from(f.timers.values()).find(t=>t.ms===1234);assert.ok(deadline);deadline.cb();const r=await pending;
    // The existing router floors the SDK transport timeout at8s. The caller's
    // tighter deadline is enforced by its own timer AND the same abort signal.
    assert.equal(r.output.reason,'answer_deadline_exceeded');assert.equal(f.observations.sdk[0].requestOptions.timeout,8000);
    assert.equal(f.observations.sdk[0].requestOptions.signal.aborted,true);resolve(answer('Yes'));await flush();assert.equal(r.ok,false);closed(f,1);
  });
  await check('completed answer does not retain cancellation listener or timer',async()=>{
    const owner=new AbortController(),f=newFixture({},()=>Promise.resolve(answer('Yes')));const r=await f.tool.execute({question},context({signal:owner.signal}));assert.equal(r.ok,true);
    owner.abort();assert.equal(f.observations.sdk[0].requestOptions.signal.aborted,false);closed(f,1);
  });
  await check('invalid cancellation context remains refused before dispatch',async()=>{
    const f=newFixture();const r=await f.tool.execute({question},context({signal:{aborted:false}}));assert.equal(r.ok,false);assert.equal(r.output.reason,'invalid_cancellation_context');closed(f,0);
  });
  await check('invalid local endpoint remains refused without a fallback request',async()=>{
    const f=newFixture();const r=await f.tool.execute({question},context({modelConfig:{...selected,baseUrl:'http://remote.invalid:11434/v1'}}));assert.equal(r.ok,false);closed(f,0);
  });
  const result={atUTC:new Date().toISOString(),scope:'Closed actual full CentralAnswer/router/SDK/cancellation boundary. No provider/UI/ToolService/hostile-code acceptance.',sourceReads,rows,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify(result));process.exitCode=result.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
