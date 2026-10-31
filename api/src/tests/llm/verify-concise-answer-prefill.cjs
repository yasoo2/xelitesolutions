'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {newFixture,sourceReads}=require('./closed-local-answer-fixture.cjs');
const selected={provider:'local',model:'qwen2.5-coder:7b',baseUrl:'http://127.0.0.1:11434/v1'};
const ctx=extra=>({userId:'fixture-owner',workspaceId:'fixture-workspace',sessionId:'fixture-session',language:'en',modelConfig:{...selected},...extra});
const completion=content=>({choices:[{finish_reason:'stop',message:{content}}]});
const rows=[];
const check=async(name,run)=>{try{await run();rows.push({name,pass:true});}catch(e){rows.push({name,pass:false,error:String(e.message||e)});}};
const closed=(f,count)=>{assert.equal(f.observations.sdk.length,count);assert.equal(f.observations.adapterCalls.length,0);assert.equal(f.observations.metadata.length,0);assert.equal(f.observations.violations.length,0);assert.equal(f.timers.size,0);assert.ok(f.observations.constructors.every(x=>x.maxRetries===0));};
const system=f=>f.observations.sdk[0].body.messages.find(x=>x.role==='system').content;
(async()=>{
  for(const [question,reply] of [
    ['Is SQLite a database? Reply with one English word.','Yes'],
    ['Is React a database? Reply with one English word.','No'],
    ['What is six multiplied by seven? Answer with one word.','42'],
  ])await check('bounded generic concise prefill: '+question,async()=>{
    const f=newFixture({},()=>Promise.resolve(completion(reply))),parent=ctx(),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);assert.equal(r.output,reply);
    assert.ok(system(f).length<850,'Plain concise request should not carry duplicate verbose prefill');
    assert.ok(system(f).includes('uncertain'));assert.ok(system(f).includes('unverified actions or results'));assert.ok(system(f).includes('English'));assert.ok(system(f).includes('exactly one word or number'));
    assert.equal(f.observations.sdk[0].body.messages.find(x=>x.role==='user').content,question);
    assert.equal(f.observations.sdk[0].body.model,selected.model);assert.equal(f.observations.sdk[0].body.max_tokens,32);assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);
    const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,1);
  });
  await check('requested one-sentence output keeps capacity and caller budget',async()=>{
    const question='Define a database. Reply in one English sentence.',f=newFixture({},()=>Promise.resolve(completion('A database stores organized information.')));
    const r=await f.tool.execute({question},ctx({providerTimeoutMs:14000}));assert.equal(r.ok,true);assert.ok(system(f).length<850);assert.equal(f.observations.sdk[0].body.max_tokens,128);assert.equal(f.observations.sdk[0].requestOptions.timeout,14000);closed(f,1);
  });
  await check('Arabic concise output retains language and code preservation',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('نعم')));const r=await f.tool.execute({question:'Is SQLite a database? Reply with one Arabic word.'},ctx({language:'ar'}));assert.equal(r.ok,true);assert.equal(r.output,'نعم');assert.ok(system(f).includes('العربية'));assert.ok(system(f).includes('Arabic'));assert.ok(system(f).includes('حرفيا'));assert.ok(system(f).includes('الشفرة'));assert.ok(system(f).includes('المسارات'));assert.ok(system(f).includes('المعرفات'));assert.ok(!system(f).includes('Keep code, paths and identifiers verbatim'));closed(f,1);
  });
  await check('standing rules survive compact prefill unchanged',async()=>{
    const rules='Use project vocabulary and do not invent a test result. '.repeat(30),f=newFixture({},()=>Promise.resolve(completion('Yes')));
    const r=await f.tool.execute({question:'Is a byte eight bits? Reply with one word.'},ctx({systemInstructions:rules}));assert.equal(r.ok,true);assert.ok(system(f).includes(rules.trim()));closed(f,1);
  });
  await check('relevant personal memory is retained without context mutation',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('Atlas'))),parent=ctx({userName:'Alex',memoryContext:'The current project is Atlas.',systemInstructions:'Preserve exact project names.'});
    const r=await f.tool.execute({question:'What is my project name? Answer with one word.'},parent);assert.equal(r.ok,true);assert.ok(system(f).includes('Alex'));assert.ok(system(f).includes('The current project is Atlas.'));assert.equal(parent.userName,'Alex');assert.equal(parent.memoryContext,'The current project is Atlas.');closed(f,1);
  });
  await check('time fact remains present when requested in a short format',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('Sunday')));const r=await f.tool.execute({question:'What weekday is today? Reply with one word.'},ctx());assert.equal(r.ok,true);assert.ok(system(f).includes('ONLY clock'));assert.ok(system(f).includes('NEVER approximate'));closed(f,1);
  });
  await check('ordinary answer preserves full prompt and requested rules',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('A database stores information.')));const r=await f.tool.execute({question:'Explain how a database organizes information.'},ctx({systemInstructions:'Use accurate terminology.'}));assert.equal(r.ok,true);assert.ok(system(f).startsWith('You are Joe, a software engineering assistant by XElite Solutions.'));assert.ok(system(f).includes('Use accurate terminology.'));assert.ok(system(f).includes('PERSONAL TOUCH'));closed(f,1);
  });
  await check('negated brevity does not select the compact word contract',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('A database stores organized information.')));const r=await f.tool.execute({question:'Do not reply with one word. Explain what a database does.'},ctx());assert.equal(r.ok,true);assert.ok(system(f).startsWith('You are Joe,'));assert.ok(!system(f).includes('OUTPUT CONTRACT: Return exactly one word'));closed(f,1);
  });
  await check('invalid short answer receives one correction and still fails if invalid',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('This is a sentence.')));const r=await f.tool.execute({question:'Is SQLite a database? Reply with one word.'},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_format_invalid');assert.equal(f.observations.sdk.length,2);for(const e of f.observations.sdk){assert.equal(e.body.model,selected.model);assert.equal(e.body.max_tokens,32);assert.equal(e.requestOptions.timeout,300000);}closed(f,2);
  });
  for(const [question,reply] of [
    ['Explain why parameterized SQL queries are safer than concatenating user input. Answer in Arabic. Reply with one sentence.','تفصل الاستعلامات ذات المعاملات بين الكود والبيانات.'],
    ['Define a user interface. Reply in one English sentence.','A user interface lets a person interact with software.'],
    ['Explain why project references matter. Reply in one English sentence.','Project references express dependencies between projects.'],
    ['Explain how to name a variable. Reply in one English sentence.','A descriptive variable name clarifies its purpose.'],
    ['Tell me why validation matters. Reply in one English sentence.','Validation rejects inputs that violate the required contract.'],
    ['Explain what the identifier `my` means in code. Reply in one English sentence.','The identifier `my` is a name chosen by the programmer.'],
    ['Explain the phrase "my project" as a grammar example. Reply in one English sentence.','The phrase uses a possessive determiner.'],
    ['عرّف مشروع البرمجيات بالعربية بجملة واحدة.','مشروع البرمجيات مجموعة أعمال لإنشاء برنامج.'],
    ['اشرح لي معنى مدخلات المستخدم بالعربية بجملة واحدة.','مدخلات المستخدم بيانات يقدمها الشخص للبرنامج.'],
    ['Define a mine. Reply in one English sentence.','A mine is a place where minerals are extracted.'],
  ])await check('technical or quoted terms omit unrelated personal context: '+question,async()=>{
    const f=newFixture({},()=>Promise.resolve(completion(reply))),parent=ctx({userName:'FAKE_PRIVATE_NAME',memoryContext:'FAKE_PRIVATE_MEMORY',systemInstructions:'Preserve supplied identifiers.'}),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);assert.equal(r.output,reply);assert.ok(!system(f).includes('FAKE_PRIVATE_NAME'));assert.ok(!system(f).includes('FAKE_PRIVATE_MEMORY'));assert.ok(system(f).includes(parent.systemInstructions));assert.equal(f.observations.sdk[0].body.messages.find(m=>m.role==='user').content,question);assert.equal(f.observations.sdk[0].body.max_tokens,128);assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);assert.equal(f.observations.sdk[0].body.model,selected.model);const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,1);
  });
  for(const [question,reply,language='en'] of [
    ['What is my project name? Reply with one word.','Atlas'],
    ['What is our preferred language? Reply with one word.','English'],
    ['What do you remember about me? Reply in one English sentence.','You prefer clear code.'],
    ['Who am I? Reply with one word.','Alex'],
    ['ما اسم مشروعي؟ أجب بكلمة واحدة.','أطلس','ar'],
    ['ماذا تعرف عنّي؟ أجب بجملة واحدة.','تفضّل شفرة واضحة.','ar'],
    ['What is the project name that is mine? Reply with one word.','Atlas'],
    ['ما اللغة المناسبة لي؟ أجب بكلمة واحدة.','العربية','ar'],
    ['ما اسم المشروع الخاص بي؟ أجب بكلمة واحدة.','أطلس','ar'],
  ])await check('explicit personal facts keep relevant context: '+question,async()=>{
    const f=newFixture({},()=>Promise.resolve(completion(reply))),parent=ctx({language,userName:'FAKE_PRIVATE_NAME',memoryContext:'FAKE_PRIVATE_MEMORY'}),before=JSON.parse(JSON.stringify(parent));const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);assert.equal(r.output,reply);assert.ok(system(f).includes('FAKE_PRIVATE_NAME'));assert.ok(system(f).includes('FAKE_PRIVATE_MEMORY'));const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,1);
  });
  await check('late personal request is found in the whole long input',async()=>{
    const question='Explain user input. '+('technical context '.repeat(5000))+' What is my project name? Reply with one word.',f=newFixture({},()=>Promise.resolve(completion('Atlas'))),parent=ctx({userName:'FAKE_PRIVATE_NAME',memoryContext:'FAKE_PRIVATE_MEMORY'});const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);assert.ok(system(f).includes('FAKE_PRIVATE_MEMORY'));assert.equal(f.observations.sdk[0].body.messages.find(m=>m.role==='user').content,question);closed(f,1);
  });
  const result={atUTC:new Date().toISOString(),scope:'Actual current CentralAnswer/router/SDK with closed inert transport. No real inference performance, browser, ToolService admission or full-goal proof.',sourceReads,rows,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify(result));process.exitCode=result.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
