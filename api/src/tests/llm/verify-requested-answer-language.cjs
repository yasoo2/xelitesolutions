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
const flush=async()=>{for(let i=0;i<32;i++)await Promise.resolve();};
const labels={Arabic:'Arabic (العربية)',English:'English',French:'French (Français)',German:'German (Deutsch)',Russian:'Russian (Русский)',Spanish:'Spanish (Español)'};
// Check the final directive actually sent to the SDK, across initial/corrective calls.
// Presence of a target label elsewhere cannot admit a conflicting UI-language footer.
const transportLanguage=(f,expected)=>{
  assert.ok(f.observations.sdk.length>0);
  const label=labels[expected];assert.ok(label);
  const wanted=`Answer ONLY in ${label}. This is the language the user selected in the interface. `
    + `Every sentence you write — explanations, summaries, error messages, questions — must be in ${label}. `
    + 'Do NOT translate: code, file paths, commands, URLs, API/tool names, or identifiers. Keep those verbatim.';
  for(const call of f.observations.sdk){
    const content=call.body.messages.find(m=>m.role==='system').content,marker='[LANGUAGE] ';
    const index=content.lastIndexOf(marker);assert.ok(index>=0,'Missing effective transport language');
    assert.equal(content.slice(index+marker.length),wanted,'Transport footer must agree with the resolved answer language');
  }
};

(async()=>{
  const definitionCases=[
    ["من فضلك لايرد باللغة العربية.", "en", "This reply stays in English.", "English"],
    ["من فضلك لانرد باللغة العربية.", "en", "This reply stays in English.", "English"],
    ["من فضلك لااكتب باللغة العربية.", "en", "This reply stays in English.", "English"],
    ["اشرح لي معنى مدخلات المستخدم بالعربية بجملة واحدة.", "en", "مدخلات المستخدم بيانات يقدمها الشخص للبرنامج.", "Arabic"],
    ["اشرح أثر الإعلانات بالعربية.", "en", "الإعلانات رسائل تعرض منتجًا أو خدمة.", "Arabic"],
    ["اشرح معنى مدونة باللغة العربية.", "en", "المدونة موقع لنشر مقالات.", "Arabic"],
    ["اشرح مدخلات المستخدم لكن لا ترد بالعربية.", "en", "User input is data supplied by a person.", "English"],
    ["لاترد بالعربية.", "en", "This reply stays in English.", "English"],
    ['عرّف مشروع البرمجيات بالعربية بجملة واحدة.','en','مشروع البرمجيات مجموعة أعمال لإنشاء برنامج.','Arabic'],
    ['عرف قاعدة البيانات باللغة العربية.','en','قاعدة البيانات تحفظ معلومات منظمة.','Arabic'],
    ['عرّف المتغير باللغة الإنجليزية.','ar','A variable associates a name with a value.','English'],
    ['ماذا يعني يعرف بالعربية؟','en','The phrase describes knowledge of a language.','English'],
    ['تعريف باللغة العربية موضوع نحوي.','en','A definition is the stated meaning of a term.','English'],
    ['لا تعرّف المتغير بالعربية.','en','A variable names a value.','English'],
    ['العبارة "عرّف المتغير بالعربية" مثال.','en','The quoted phrase is an example.','English'],
  ];
  for(const [baseQuestion,language,reply,expected] of definitionCases) await check('definition locale and sentence boundary: '+baseQuestion,async()=>{
    const question=baseQuestion+' Reply with one sentence.',f=newFixture({},()=>Promise.resolve(completion(reply))),parent=ctx({language}),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);assert.equal(r.output,reply);assert.ok(system(f).includes(expected));transportLanguage(f,expected);assert.equal(f.observations.sdk[0].body.max_tokens,128);assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);assert.equal(f.observations.sdk[0].body.model,selected.model);assert.equal(f.observations.sdk[0].body.messages.find(m=>m.role==='user').content,question);const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,1);
  });
  const cases=[
    ['Is SQLite a database? Answer in Arabic. Reply with one word.','en','نعم','Arabic'],
    ['Is React a database? Answer in English. Reply with one word.','ar','No','English'],
    ['Is Python a programming language? Reply with one word.','en','Yes','English'],
    ['Is Python a programming language? Reply with one word.','ar-EG','نعم','Arabic'],
    ['Is Python a programming language? Reply with one word.','en-US','Yes','English'],
    ['The quoted phrase is "Answer in Arabic". Is Python a language? Reply with one word.','en','Yes','English'],
    ['The code is `Answer in Arabic`. Is Python a language? Reply with one word.','en','Yes','English'],
    ['Do not answer in Arabic. Is Python a language? Reply with one word.','en','Yes','English'],
    ['The answer in Arabic is longer. Is Python a language? Reply with one word.','en','Yes','English'],
    ['Answer in Arabic. Answer in English. Is Python a language? Reply with one word.','en','Yes','English'],
    ['The variable بالعربية فقط appears here. Is Python a language? Reply with one word.','en','Yes','English'],
    ['Is SQLite a database? Reply with one Arabic word.','en','نعم','Arabic'],
  ];
  for(const [question,language,reply,expected] of cases) await check('content-language boundary: '+question,async()=>{
    const f=newFixture({},()=>Promise.resolve(completion(reply))),parent=ctx({language}),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);assert.equal(r.output,reply);assert.ok(system(f).includes(expected));transportLanguage(f,expected);
    assert.equal(f.observations.sdk[0].body.messages.find(x=>x.role==='user').content,question);assert.equal(f.observations.sdk[0].body.model,selected.model);assert.equal(f.observations.sdk[0].body.max_tokens,32);assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);
    const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,1);
  });
  await check('explicit content language retains caller budget and standing rules',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('نعم'))),parent=ctx({providerTimeoutMs:14000,systemInstructions:'Keep project vocabulary exact.'});
    const r=await f.tool.execute({question:'Is SQLite a database? Answer in Arabic. Reply with one word.'},parent);assert.equal(r.ok,true);assert.ok(system(f).includes(parent.systemInstructions));assert.equal(parent.language,'en');assert.equal(f.observations.sdk[0].requestOptions.timeout,14000);transportLanguage(f,'Arabic');closed(f,1);
  });
  await check('wrong Arabic one-word output gets one correction then fails',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('Yes')));const r=await f.tool.execute({question:'Is SQLite a database? Answer in Arabic. Reply with one word.'},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_format_invalid');transportLanguage(f,'Arabic');closed(f,2);
  });
  await check('Arabic correction returns to original question and preserves identifiers',async()=>{
    const question='Explain what SQLite does. Answer in Arabic.',sequence=['An unverified English draft.','تخزن قاعدة SQLite البيانات.'];
    const f=newFixture({},()=>Promise.resolve(completion(sequence.shift())));const r=await f.tool.execute({question},ctx());assert.equal(r.ok,true);assert.equal(r.output,'تخزن قاعدة SQLite البيانات.');
    assert.ok(f.observations.sdk[1].body.messages.some(m=>m.role==='user'&&m.content===question),'Correction must answer the original question, not only translate an unverified draft');transportLanguage(f,'Arabic');closed(f,2);
  });
  for(const corrected of ['Still an English reply.','']) await check('invalid Arabic correction stops: '+JSON.stringify(corrected),async()=>{
    const sequence=['An English reply.',corrected],f=newFixture({},()=>Promise.resolve(completion(sequence.shift())));const r=await f.tool.execute({question:'Explain a variable. Answer in Arabic.'},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,corrected===''?'answer_provider_failed':'answer_language_invalid');assert.equal(r.output.nonRecoverable,true);transportLanguage(f,'Arabic');closed(f,2);
  });
  await check('implicit provider completion limit stops Arabic correction instead of keeping draft',async()=>{
    let count=0;const f=newFixture({},()=>Promise.resolve(++count===1?completion('An English draft.'):{choices:[{finish_reason:'length',message:{content:'رد مبتور'}}]}));
    const r=await f.tool.execute({question:'Explain a variable. Answer in Arabic.'},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_completion_limit');transportLanguage(f,'Arabic');closed(f,2);
  });
  await check('explicit caller completion limit remains enforced on Arabic correction',async()=>{
    let count=0;const f=newFixture({},()=>Promise.resolve(++count===1?completion('An English draft.'):{choices:[{finish_reason:'length',message:{content:'رد مبتور'}}]}));
    const r=await f.tool.execute({question:'Explain a variable. Answer in Arabic.'},ctx({maxCompletionTokens:64}));assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_completion_limit');assert.equal(f.observations.sdk[1].body.max_tokens,64);transportLanguage(f,'Arabic');closed(f,2);
  });
  for(const streaming of [false,true]) await check('selected local implicit truncation is terminal: '+(streaming?'stream':'buffer'),async()=>{
    const response=streaming?{async *[Symbol.asyncIterator](){yield {choices:[{delta:{content:'Unfinished draft.'}}]};yield {choices:[{delta:{},finish_reason:'length'}]};}}:{choices:[{finish_reason:'length',message:{content:'Unfinished draft.'}}]};
    const f=newFixture({},()=>Promise.resolve(response)),deltas=[];
    await assert.rejects(f.router.routeToModel([{role:'user',content:'Explain a variable.'}],{type:'simple_chat',complexity:'low',requiresTools:false,estimatedTokens:50,language:'en',hasImages:false},undefined,streaming?d=>deltas.push(d):undefined,undefined,undefined,undefined,ctx()),e=>e.code==='CUSTOM_COMPLETION_LIMIT');
    assert.equal(f.observations.sdk[0].body.model,selected.model);closed(f,1);
  });
  for(const streaming of [false,true]) await check('configured local adapter implicit truncation is terminal: '+(streaming?'stream':'buffer'),async()=>{
    const response=streaming?{async *[Symbol.asyncIterator](){yield {choices:[{delta:{content:'Unfinished draft.'}}]};yield {choices:[{delta:{},finish_reason:'length'}]};}}:{choices:[{finish_reason:'length',message:{content:'Unfinished draft.'}}]};
    const f=newFixture({LOCAL_LLM_BASE_URL:selected.baseUrl},()=>Promise.resolve(response));await assert.rejects(f.localProvider.chatComplete([{role:'user',content:'Explain a variable.'}],selected.model,streaming?()=>{}:undefined),e=>e.code==='LOCAL_COMPLETION_LIMIT');assert.equal(f.observations.sdk[0].body.model,selected.model);closed(f,1);
  });
  await check('Arabic correction provider failure stays failed and sanitized',async()=>{
    let count=0;const f=newFixture({},()=>++count===1?Promise.resolve(completion('An English draft.')):Promise.reject(new Error('synthetic-private-token')));
    const r=await f.tool.execute({question:'Explain a variable. Answer in Arabic.'},ctx());assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_provider_failed');assert.ok(!JSON.stringify(r).includes('synthetic-private-token'));transportLanguage(f,'Arabic');closed(f,2);
  });
  await check('owner can cancel an Arabic correction without a third request',async()=>{
    const owner=new AbortController();let count=0;const f=newFixture({},e=>++count===1?Promise.resolve(completion('An English draft.')):new Promise((_,reject)=>e.requestOptions.signal.addEventListener('abort',()=>reject(new Error('fixture cancelled')),{once:true})));
    const pending=f.tool.execute({question:'Explain a variable. Answer in Arabic.'},ctx({signal:owner.signal}));await flush();assert.equal(f.observations.sdk.length,2);owner.abort();const r=await pending;assert.equal(r.ok,false);assert.equal(r.output.reason,'cancelled');transportLanguage(f,'Arabic');closed(f,2);
  });
  await check('tighter caller deadline cancels an Arabic correction and rejects late text',async()=>{
    let count=0,resolve;const f=newFixture({},()=>++count===1?Promise.resolve(completion('An English draft.')):new Promise(r=>resolve=r));
    const pending=f.tool.execute({question:'Explain a variable. Answer in Arabic.'},ctx({providerTimeoutMs:1234}));await flush();assert.equal(f.observations.sdk.length,2);const deadline=Array.from(f.timers.values()).find(t=>t.ms===1234);assert.ok(deadline);deadline.cb();const r=await pending;assert.equal(r.ok,false);assert.equal(r.output.reason,'answer_deadline_exceeded');resolve(completion('إجابة متأخرة.'));await flush();assert.equal(r.ok,false);transportLanguage(f,'Arabic');closed(f,2);
  });
  // STRONG effective-language forwarding (preserves all 41 weak includes() cases above as failure evidence).
  // Asserts the ACTUAL SDK final [LANGUAGE] footer equals the resolved target on EVERY call,
  // routeContext forwards the effective language, and the parent language stays original.
  const CANON={ar:'Arabic (العربية)',en:'English',fr:'French (Français)',de:'German (Deutsch)',ru:'Russian (Русский)',es:'Spanish (Español)'};
  const footerOf=(f,i)=>{const s=f.observations.sdk[i].body.messages.find(x=>x.role==='system').content;const p=s.split('[LANGUAGE]');return p[p.length-1]||'';};
  const expectEffective=(f,i,code)=>{const footer=footerOf(f,i);assert.ok(footer.includes(CANON[code]),'final [LANGUAGE] footer must match resolved '+code+', got: '+footer.slice(-220));for(const [c,label] of Object.entries(CANON)){if(c!==code)assert.ok(!footer.includes(label),'contradictory footer '+label+' in resolved-'+code+' call '+i+': '+footer.slice(-220));}assert.equal(f.observations.routeContexts[i].language,code,'routeContext must forward effective '+code);};
  const expectAllFooters=(f,codes)=>{assert.equal(f.observations.sdk.length,codes.length,'sdk call count');assert.equal(f.observations.routeContexts.length,codes.length,'routeContext count');codes.forEach((c,i)=>expectEffective(f,i,c));};
  const strongCases=[
    // Explicit non-ar/en directives are not implemented by the current resolver;
    // record the documented UI fallback rather than pretending this patch extends it.
    ['Define a database. Answer in French. Reply with one sentence.','en','A database stores organized information.','en',128],
    ['Define a database. Answer in German. Reply with one sentence.','en','A database stores organized information.','en',128],
    ['Define a database. Answer in Russian. Reply with one sentence.','en','A database stores organized information.','en',128],
    ['Define a database. Answer in Spanish. Reply with one sentence.','en','A database stores organized information.','en',128],
    ['Is SQLite a database? Answer in Arabic. Reply with one word.','en','نعم','ar',32],
    ['Is React a database? Answer in English. Reply with one word.','ar','No','en',32],
    ['Define a database. Answer in French. Reply with one sentence.','fr','Une base de données stocke des informations organisées.','fr',128],
    ['Is Python a programming language? Reply with one word.','en','Yes','en',32],
    ['Is Python a programming language? Reply with one word.','ar','نعم','ar',32],
    ['Do not answer in Arabic. Is Python a language? Reply with one word.','en','Yes','en',32],
    ['The quoted phrase is "Answer in Arabic". Is Python a language? Reply with one word.','en','Yes','en',32],
    ['Explain a database. Answer in German. Reply with one sentence.','de','Eine Datenbank speichert organisierte Informationen.','de',128],
    ['Explain a database. Answer in Russian. Reply with one sentence.','ru','База данных хранит организованную информацию.','ru',128],
    ['Explain a database. Answer in Spanish. Reply with one sentence.','es','Una base de datos guarda información organizada.','es',128],
    ['Explain what `SQLite` does. Answer in French. Reply with one sentence.','fr','SQLite stocke des données organisées pour `SQLite`.','fr',128],
  ];
  for(const [question,language,reply,code,caps] of strongCases) await check('effective footer matches resolved target ['+code+'] ui='+language+': '+question,async()=>{
    const f=newFixture({},()=>Promise.resolve(completion(reply))),parent=ctx({language}),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);assert.equal(r.output,reply);
    expectAllFooters(f,[code]);
    assert.equal(f.observations.sdk[0].body.messages.find(m=>m.role==='user').content,question);
    assert.equal(f.observations.sdk[0].body.model,selected.model);
    assert.equal(f.observations.sdk[0].body.max_tokens,caps);assert.equal(f.observations.sdk[0].requestOptions.timeout,300000);
    const {providerAttempts,...after}=parent;assert.deepEqual(after,before);assert.equal(parent.language,language);closed(f,1);
  });
  await check('effective footer matches on both Arabic correction calls and preserves full question',async()=>{
    const question='Explain what SQLite does. Answer in Arabic.',sequence=['An unverified English draft.','تخزن قاعدة SQLite البيانات.'];
    const f=newFixture({},()=>Promise.resolve(completion(sequence.shift()))),parent=ctx({language:'en'}),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);expectAllFooters(f,['ar','ar']);
    assert.ok(f.observations.sdk[1].body.messages.some(m=>m.role==='user'&&m.content===question));assert.ok(r.output.includes('SQLite'));
    const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,2);
  });
  await check('effective footer matches on English correction call from Arabic UI',async()=>{
    const question='Explain what SQLite does. Answer in English.',sequence=['مسودة عربية غير موثقة.','SQLite stores organized data.'];
    const f=newFixture({},()=>Promise.resolve(completion(sequence.shift()))),parent=ctx({language:'ar'}),before=JSON.parse(JSON.stringify(parent));
    const r=await f.tool.execute({question},parent);assert.equal(r.ok,true);expectAllFooters(f,['en','en']);
    assert.ok(r.output.includes('SQLite'));const {providerAttempts,...after}=parent;assert.deepEqual(after,before);closed(f,2);
  });
  await check('effective footer respects trusted standing instructions without logging raw memory',async()=>{
    const f=newFixture({},()=>Promise.resolve(completion('Eine Datenbank speichert Daten.'))),parent=ctx({language:'de',systemInstructions:'Keep project vocabulary exact.',memoryContext:'synthetic-trusted-context'});
    const r=await f.tool.execute({question:'Explain a database. Answer in German. Reply with one sentence.'},parent);
    assert.equal(r.ok,true);expectAllFooters(f,['de']);assert.ok(system(f).includes('Keep project vocabulary exact.'));
    assert.ok(!JSON.stringify(r).includes('synthetic-trusted-context'));assert.equal(parent.language,'de');closed(f,1);
  });
  const result={atUTC:new Date().toISOString(),scope:'Current answer/router with inert transport and isolated requested-language callsite. No actual inference/browser/Main/GitHub proof.',sourceReads,rows,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length};
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));process.exitCode=result.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
