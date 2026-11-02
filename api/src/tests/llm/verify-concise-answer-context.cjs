'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {newFixture,sourceReads}=require('./closed-local-answer-fixture.cjs');
const rows=[];
async function check(name,run){try{await run();rows.push({name,status:'PASS'});}catch(e){rows.push({name,status:'FAIL',error:String(e?.message||e)});}}
async function answer(question,extra={}){
 const f=newFixture({},()=>Promise.resolve({choices:[{message:{content:'731'}}]}),['qwen3.5:4b','qwen2.5-coder:7b','qwen2.5:1.5b']);await f.localBrain.detectLocalModels();
 const ctx={purpose:'internal',language:'en',modelConfig:{provider:'auto'},signal:new AbortController().signal,userId:'fixture-user',workspaceId:'fixture-workspace',sessionId:'fixture-session',...extra};
 const result=await f.tool.execute({question},ctx);assert.equal(result.ok,true);assert.equal(f.observations.sdk.length,1);assert.equal(f.observations.violations.length,0);assert.equal(f.observations.adapterCalls.length,0);assert.equal(f.timers.size,0);
 return {f,result,ctx,system:f.observations.sdk[0].body.messages.find(m=>m.role==='system').content};
}
(async()=>{
 await check('One-word factual answer omits unrelated clock and greeting instructions',async()=>{
  const {system}=await answer('What animal barks? Reply with one English word.');assert.doesNotMatch(system,/PERSONAL TOUCH|Right now it is|Address them by name|full autonomous|Elite AI|captivates/);assert.ok(system.length<650,system.length);
 });
 await check('One-sentence explanation keeps stronger capacity with compact neutral context',async()=>{
  const {f,system}=await answer('Explain why heated metal expands. Reply with one sentence.');assert.equal(f.observations.sdk[0].body.model,'qwen3.5:4b');assert.equal(f.observations.sdk[0].body.max_tokens,128);assert.doesNotMatch(system,/PERSONAL TOUCH|Right now it is|full autonomous/);assert.match(system,/accurately|verified/);assert.ok(system.length<650,system.length);
 });
 await check('Arabic short format keeps Arabic directive and removes irrelevant clock',async()=>{
  const {f,system}=await answer('اشرح لماذا تتمدد المعادن بالحرارة؟ أجب بجملة واحدة.',{language:'ar'});assert.match(system,/اكتب ردّك/);assert.doesNotMatch(system,/Right now it is/);assert.equal(f.observations.sdk[0].body.model,'qwen3.5:4b');
 });
 await check('Short-format answer preserves bounded standing rules and memory',async()=>{
  const standing='fixture-standing-rule',memory='fixture-project-memory';const {system}=await answer('Explain this function. Reply with one sentence.',{systemInstructions:standing,memoryContext:memory});assert.ok(system.includes(standing));assert.ok(system.includes(memory));
 });
 await check('Standing rules and memory retain existing size boundaries',async()=>{
  const {system}=await answer('Explain this function. Reply with one sentence.',{systemInstructions:'S'.repeat(2000)+'excluded-standing-marker',memoryContext:'M'.repeat(800)+'excluded-memory-marker'});assert.ok(system.includes('S'.repeat(2000)));assert.ok(system.includes('M'.repeat(800)));assert.doesNotMatch(system,/excluded-standing-marker|excluded-memory-marker/);
 });
 await check('A time question retains actual clock and fabrication ban despite short format',async()=>{
  const {system}=await answer('What is the time today? Reply with one sentence.');assert.match(system,/Right now it is .*\d{4}-\d{2}-\d{2}, \d{2}:\d{2}/);assert.match(system,/ONLY clock you have|NEVER approximate, round, or invent a time/);
 });
 await check('Arabic date question retains authoritative clock context',async()=>{
  const {system}=await answer('ما تاريخ اليوم؟ أجب بجملة واحدة.',{language:'ar'});assert.match(system,/Right now it is .*\d{4}-\d{2}-\d{2}/);
 });
 await check('A personal question retains supplied name despite short format',async()=>{
  const {system}=await answer('What is my name? Reply with one word.',{userName:'FixtureName LastName'});assert.match(system,/FixtureName/);assert.doesNotMatch(system,/LastName/);
 });
 await check('Unconstrained or negated short formats retain personal/clock context',async()=>{
  for(const q of ['Explain this function.','Do not answer in one sentence. Explain this function.']){const {system}=await answer(q,{userName:'FixtureName'});assert.match(system,/Right now it is/);assert.match(system,/FixtureName/);}
 });
 await check('Explicit provider authority and trusted identity remain intact',async()=>{
  const modelConfig={provider:'local',apiKey:'synthetic-test-key',baseUrl:'http://127.0.0.1:11434/v1',model:'qwen2.5-coder:7b'};
  const {f,ctx}=await answer('Explain this function. Reply with one sentence.',{modelConfig,engineeringPipeline:true});assert.deepEqual(f.observations.routeContexts[0].modelConfig,modelConfig);assert.equal(f.observations.sdk[0].body.model,modelConfig.model);
  for(const k of ['userId','workspaceId','sessionId'])assert.equal(f.observations.routeContexts[0][k],ctx[k]);assert.equal(f.observations.sdk[0].body.tools,undefined);
 });
 await check('Instant English and Arabic identities never claim full tool capability',async()=>{
  for(const [q,language]of [['Who are you?','en'],['من أنت؟','ar']]){const f=newFixture();const result=await f.tool.execute({question:q},{language});assert.equal(result.ok,true);assert.match(result.output,/Joe/);assert.doesNotMatch(result.output,/full tools|أدوات كاملة|elite engineering AI/);assert.equal(f.observations.sdk.length,0);assert.equal(f.observations.violations.length,0);assert.equal(f.timers.size,0);}
 });
 const report={scope:'Actual current answer/router/local modules with closed transports; no real provider/browser',sourceReads,rows,passed:rows.filter(r=>r.status==='PASS').length,failed:rows.filter(r=>r.status==='FAIL').length};if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
