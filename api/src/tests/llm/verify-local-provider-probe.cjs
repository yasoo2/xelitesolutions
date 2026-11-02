'use strict';
// Complete real verification/router modules; inert SDK, metadata and clocks only.
// This is not local inference, browser acceptance or hostile-code isolation.
const assert = require('node:assert/strict');
const { newFixture, sourceReads } = require('./closed-local-answer-fixture.cjs');
const rows = [];
const selected = { model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434', apiKey: '' };
const answer = (content='OK', finish_reason='stop') => ({ choices: [{ finish_reason, message: { content } }] });
const fixture = (behavior, env={}) => newFixture(env, behavior || (()=>Promise.resolve(answer())));
const flush = async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function closed(f, calls=1) {
  assert.equal(f.observations.sdk.length,calls);
  assert.equal(f.observations.adapterCalls.length,0,'No other provider adapter');
  assert.equal(f.observations.metadata.length,0,'No discovery or global-model substitution');
  assert.deepEqual(f.observations.violations,[]);
  assert.equal(f.timers.size,0,'Owned timers cleaned up after settled transport');
}
async function check(name,body){let guard;try{await Promise.race([body(),new Promise((_,reject)=>{guard=setTimeout(()=>reject(new Error('Inert assertion exceeded1000ms')),1000);})]);rows.push({name,status:'PASS'});}catch(e){rows.push({name,status:'FAIL',detail:String(e.message||e).slice(0,600)});}finally{clearTimeout(guard);}}
(async()=>{
  for(const apiKey of ['',undefined,'free-mode','auto-mode','dummy','free','synthetic-unused-key','synthetic-عربي-key']){
    await check(`Named local probe preserves selected7B without key-class dependence: ${apiKey||'blank'}`,async()=>{
      const f=fixture(),r=await f.router.verifyProviderDirect('local',{...selected,apiKey});
      assert.equal(r.ok,true);assert.equal(r.detail,'local_ok');
      assert.equal(f.observations.sdk[0].body.model,selected.model);
      assert.equal(f.observations.sdk[0].body.max_tokens,32);
      assert.equal(f.observations.sdk[0].requestOptions.timeout,90000);
      assert.equal(f.observations.constructors[0].baseURL,'http://127.0.0.1:11434/v1');
      assert.equal(f.observations.constructors[0].apiKey,'dummy');
      assert.equal(f.observations.constructors[0].maxRetries,0);closed(f);
    });
  }
  await check('CPU cold probe can finish beyond old20s bound without unbounded timers',async()=>{
    let settle;const f=fixture(()=>new Promise(resolve=>{settle=resolve;}));
    const pending=f.router.verifyProviderDirect('local',selected);await flush();
    assert.equal(typeof settle,'function');
    assert.ok([...f.timers.values()].some(t=>t.ms===90000));
    assert.ok([...f.timers.values()].every(t=>t.ms>20000&&t.ms<=90000));
    settle(answer());assert.equal((await pending).ok,true);closed(f);
  });
  for(const baseUrl of ['http://localhost:11434/v1/','http://[::1]:11434'])await check(`Canonical named-local probe ${baseUrl}`,async()=>{
    const f=fixture(),r=await f.router.verifyProviderDirect(' LOCAL ',{...selected,baseUrl});assert.equal(r.ok,true);closed(f);
  });
  for(const model of ['qwen3.5:9b','qwen2.5-coder:7b'])await check(`Exact selected model ${model} is not replaced by startup brain`,async()=>{
    const f=fixture(),r=await f.router.verifyProviderDirect('local',{...selected,model});assert.equal(r.ok,true);assert.equal(f.observations.sdk[0].body.model,model);closed(f);
  });
  for(const baseUrl of ['http://example.com:11434','http://localhost:8080/v1','http://localhost:11434/v1?','http://127.1:11434'])await check(`Invalid endpoint denied before transport: ${baseUrl}`,async()=>{
    const f=fixture(undefined,{AI_COST_POLICY:'allow_paid'}),r=await f.router.verifyProviderDirect('local',{...selected,baseUrl,apiKey:'synthetic-unused-key'});assert.equal(r.ok,false);closed(f,0);
  });
  for(const model of ['qwen3.5:cloud','gpt-oss:120b-cloud','qwen 7b',null])await check(`Malformed/knowncloud model ${model} never dispatches`,async()=>{
    const f=fixture(undefined,{AI_COST_POLICY:'allow_paid'}),r=await f.router.verifyProviderDirect('local',{...selected,model,apiKey:'synthetic-unused-key'});assert.equal(r.ok,false);closed(f,0);
  });
  for(const [name,result] of [['empty',answer('')],['truncated',answer('OK','length')]])await check(`Unusable ${name} completion is not connected`,async()=>{
    const f=fixture(()=>Promise.resolve(result));assert.equal((await f.router.verifyProviderDirect('local',selected)).ok,false);closed(f);
  });
  await check('Transport failure remains same-model failure and redacts unused key',async()=>{
    const f=fixture(()=>Promise.reject(new Error('failed synthetic-unused-key'))),r=await f.router.verifyProviderDirect('local',{...selected,apiKey:'synthetic-unused-key'});
    assert.equal(r.ok,false);assert.doesNotMatch(r.detail,/synthetic-unused-key/);closed(f);
  });
  await check('Bounded local deadline aborts existing transport with no retry',async()=>{
    const f=fixture(e=>new Promise((_,reject)=>e.requestOptions.signal.addEventListener('abort',()=>reject(new Error('transport aborted')),{once:true})));
    const pending=f.router.verifyProviderDirect('local',selected);await flush();
    assert.equal(f.observations.sdk.length,1);
    const timers=[...f.timers];assert.ok(timers.some(([,t])=>t.ms===90000));
    for(const [id,t]of timers){if(f.timers.has(id)){f.timers.delete(id);t.cb();}}
    const r=await pending;await flush();assert.equal(r.ok,false);assert.equal(f.observations.sdk[0].requestOptions.signal.aborted,true);closed(f);
  });
  await check('Late non-cooperative SDK response cannot reverse timeout into connected',async()=>{
    let settle;const f=fixture(()=>new Promise(resolve=>{settle=resolve;}));const pending=f.router.verifyProviderDirect('local',selected);await flush();
    assert.equal(typeof settle,'function');for(const[id,t]of [...f.timers]){if(f.timers.has(id)){f.timers.delete(id);t.cb();}}
    const r=await pending;assert.equal(r.ok,false);settle(answer());await flush();assert.equal(r.ok,false);closed(f);
  });
  await check('Generic keyed cloud probe retains20s budget',async()=>{
    const f=fixture(undefined,{AI_COST_POLICY:'allow_paid'}),r=await f.router.verifyProviderDirect('groq',{apiKey:'synthetic-real-key',model:'test-model'});assert.equal(r.ok,true);assert.equal(f.observations.sdk[0].requestOptions.timeout,120000);closed(f);
    // The outer20s probe is gone after immediate completion; a held call exposes it.
    let settle;const held=fixture(()=>new Promise(resolve=>{settle=resolve;}),{AI_COST_POLICY:'allow_paid'});const pending=held.router.verifyProviderDirect('groq',{apiKey:'synthetic-real-key',model:'test-model'});await flush();assert.ok([...held.timers.values()].some(t=>t.ms===20000));settle(answer());assert.equal((await pending).ok,true);closed(held);
  });
  console.log(JSON.stringify({suite:'full-real-local-verification-router-inert-transports',passed:rows.filter(r=>r.status==='PASS').length,failed:rows.filter(r=>r.status==='FAIL').length,rows,sourceReads,limits:'No network/native/model inference/UI/OS-isolation/GitHub proof'}));
  if(rows.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(String(e.message||e));process.exitCode=1;});
