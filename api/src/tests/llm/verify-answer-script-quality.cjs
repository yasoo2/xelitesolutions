'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs');
const {newFixture,sourceReads}=require('./closed-local-answer-fixture.cjs');
const selected={provider:'local',model:'qwen2.5-coder:7b',baseUrl:'http://127.0.0.1:11434/v1'};
const ctx=extra=>({userId:'fixture-owner',workspaceId:'fixture-workspace',sessionId:'fixture-session',language:'en',modelConfig:{...selected},...extra});
const completion=content=>({choices:[{finish_reason:'stop',message:{content}}]});
const rows=[];
const check=async(name,run)=>{try{await run();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:String(e.message||e)});}};
const closed=(f,count)=>{assert.equal(f.observations.sdk.length,count);assert.equal(f.observations.adapterCalls.length,0);assert.equal(f.observations.metadata.length,0);assert.equal(f.observations.violations.length,0);assert.equal(f.timers.size,0);assert.ok(f.observations.constructors.every(x=>x.maxRetries===0));assert.ok(f.observations.sdk.every(x=>x.body.model===selected.model));};
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
const arClean='\u062a\u062d\u0645\u064a \u0627\u0644\u0627\u0633\u062a\u0639\u0644\u0627\u0645\u0627\u062a SQL \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a.';
const arBad='\u062a\u062d\u0645\u064a \u0627\u0644\u0627\u0633\u062a\u0639\u0644\u0627\u0645\u0627\u062a SQL \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a\u5f97\u591a.';
const question='Explain why parameterized queries protect data. Answer in Arabic. Reply with one sentence.';
(async()=>{
  for(const [name,q,bad,good] of [
    ['Arabic Han prose',question,arBad,arClean],
    ['different English Cyrillic prose','Explain what a variable is. Answer in English. Reply with one sentence.','A variable stores \u0434\u0430\u043d\u043d\u044b\u0435.','A variable stores a value.'],
  ]) await check(name+' requests one grounded correction',async()=>{
    const sequence=[bad,good],f=newFixture({},()=>Promise.resolve(completion(sequence.shift()))),parent=ctx({systemInstructions:'Keep domain names exact.'}),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question:q},parent);assert.equal(r.ok,true);assert.equal(r.output,good);
    const messages=f.observations.sdk[1].body.messages;assert.ok(messages.some(m=>m.role==='user'&&m.content===q));assert.ok(messages.some(m=>m.role==='assistant'&&m.content.includes(bad)));assert.ok(messages.some(m=>m.role==='system'&&/UNVERIFIED|\u0645\u0633\u0648\u062f\u0629/i.test(m.content)));
    assert.ok(messages.some(m=>m.role==='system'&&m.content.includes(parent.systemInstructions)));assert.ok(f.observations.sdk.every(x=>x.body.max_tokens===128));assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);
    const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,2);
  });
  await check('clean prose does not spend another inference',async()=>{const f=newFixture({},()=>Promise.resolve(completion(arClean)));const r=await f.tool.execute({question},ctx());assert.equal(r.ok,true);assert.equal(r.output,arClean);closed(f,1);});
  await check('exact user literal and code remain unchanged without extra inference',async()=>{const q='Explain the term "\u4f60\u597d". Answer in Arabic.',answer='\u0627\u0644\u0645\u0635\u0637\u0644\u062d "\u4f60\u597d" \u062a\u062d\u064a\u0629 \u0648 `const \u540d\u79f0 = 1;` \u0645\u062b\u0627\u0644.';const f=newFixture({},()=>Promise.resolve(completion(answer)));const r=await f.tool.execute({question:q},ctx());assert.equal(r.ok,true);assert.equal(r.output,answer);closed(f,1);});
  await check('persistently contaminated correction is refused and content-free',async()=>{const f=newFixture({},()=>Promise.resolve(completion(arBad)));const r=await f.tool.execute({question},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_language_invalid');assert.equal(r.output.nonRecoverable,true);assert.ok(!JSON.stringify(r).includes(arBad));assert.ok(r.output.correctionFailure);closed(f,2);});
  await check('different contaminated correction is refused too',async()=>{const sequence=[arBad,arClean+' \u041f\u0440\u0438\u0432\u0435\u0442'],f=newFixture({},()=>Promise.resolve(completion(sequence.shift())));const r=await f.tool.execute({question},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_language_invalid');closed(f,2);});
  for(const bad of ['\u0646\u0639\u0645\u4f60\u597d','`\u0646\u0639\u0645\u4f60\u597d`']) await check('contaminated single word is corrected: '+JSON.stringify(bad),async()=>{const sequence=[bad,'\u0646\u0639\u0645'],f=newFixture({},()=>Promise.resolve(completion(sequence.shift())));const r=await f.tool.execute({question:'Is SQLite a database? Answer in Arabic. Reply with one word.'},ctx());assert.equal(r.ok,true);assert.equal(r.output,'\u0646\u0639\u0645');assert.ok(f.observations.sdk.every(x=>x.body.max_tokens===32));closed(f,2);});
  await check('truncated correction is terminal',async()=>{let count=0;const f=newFixture({},()=>Promise.resolve(++count===1?completion(arBad):{choices:[{finish_reason:'length',message:{content:arClean}}]}));const r=await f.tool.execute({question},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_completion_limit');closed(f,2);});
  await check('provider failure does not expose draft or private failure',async()=>{let count=0;const f=newFixture({},()=>++count===1?Promise.resolve(completion(arBad)):Promise.reject(new Error('fixture-private-token')));const r=await f.tool.execute({question},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_provider_failed');assert.ok(!JSON.stringify(r).includes('fixture-private-token'));assert.ok(!JSON.stringify(r).includes(arBad));closed(f,2);});
  await check('pre-aborted owner creates zero model calls',async()=>{const owner=new AbortController();owner.abort();const f=newFixture();const r=await f.tool.execute({question},ctx({signal:owner.signal}));assert.equal(r.ok,false);assert.equal(r.output.reason,'cancelled');closed(f,0);});
  await check('owner cancellation ends the only correction',async()=>{const owner=new AbortController();let count=0;const f=newFixture({},e=>++count===1?Promise.resolve(completion(arBad)):new Promise((_,reject)=>e.requestOptions.signal.addEventListener('abort',()=>reject(new Error('fixture cancelled')),{once:true})));const pending=f.tool.execute({question},ctx({signal:owner.signal}));await flush();assert.equal(f.observations.sdk.length,2);owner.abort();const r=await pending;assert.equal(r.ok,false);assert.equal(r.output.reason,'cancelled');closed(f,2);});
  await check('tighter shared deadline rejects late correction and no third request',async()=>{let count=0,resolve;const f=newFixture({},()=>++count===1?Promise.resolve(completion(arBad)):new Promise(r=>resolve=r));const pending=f.tool.execute({question},ctx({providerTimeoutMs:1234}));await flush();assert.equal(f.observations.sdk.length,2);assert.ok(f.observations.routeContexts.every(c=>c.providerTimeoutMs===1234));const timer=Array.from(f.timers.values()).find(t=>t.ms===1234);assert.ok(timer);timer.cb();const r=await pending;assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_deadline_exceeded');resolve(completion(arClean));await flush();assert.equal(r.ok,false);closed(f,2);});
  await check('persistently contaminated word is refused after the only correction',async()=>{const bad='\u0646\u0639\u0645\u4f60\u597d',f=newFixture({},()=>Promise.resolve(completion(bad)));const r=await f.tool.execute({question:'Is SQLite a database? Answer in Arabic. Reply with one word.'},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_format_invalid');assert.ok(!JSON.stringify(r).includes(bad));closed(f,2);});

  for(const [name,q,value,issue] of [
    ['Arabic foreign correction diagnosis',question,arBad,'unrequested_letter'],
    ['English foreign correction diagnosis','Explain a variable. Answer in English.','A variable stores \u0434\u0430\u043d\u043d\u044b\u0435.','unrequested_letter'],
    ['Arabic ratio-only correction diagnosis',question,'A database stores records.','none'],
    ['answer character boundary diagnosis','Explain a variable. Answer in English.','a'.repeat(20001),'answer_length_limit'],
    ['answer token boundary diagnosis','Explain a variable. Answer in English.','a '.repeat(3001),'answer_token_limit'],
  ]) await check(name,async()=>{
    const f=newFixture({},()=>Promise.resolve(completion(value))),r=await f.tool.execute({question:q},ctx());
    assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_language_invalid');assert.equal(r.output.nonRecoverable,true);
    assert.ok(r.logs.some(line=>line.endsWith('; script_issue='+issue)));assert.ok(!JSON.stringify(r).includes(value));closed(f,2);
  });
  await check('empty provider correction stays provider failure with no invented script issue',async()=>{
    const values=[arBad,''],f=newFixture({},()=>Promise.resolve(completion(values.shift()))),r=await f.tool.execute({question},ctx());
    assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_provider_failed');assert.equal(r.output.nonRecoverable,true);
    assert.ok(!r.logs.some(line=>line.includes('script_issue=')));assert.ok(!JSON.stringify(r).includes(arBad));closed(f,2);
  });
  const result={atUTC:new Date().toISOString(),scope:'Full current tool/router/local provider, inert transport only; no actual inference or browser proof.',sourceReads,rows,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));process.exitCode=result.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
