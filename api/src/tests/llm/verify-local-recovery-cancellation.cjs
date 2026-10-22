'use strict';

// Actual source functions + actual LocalProvider, with only SDK, clock and daemon
// readiness replaced. This proves cancellation at the SDK boundary, not live inference.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const routerFile = process.argv[2] || path.join(root, 'core/llm/intelligent-router.ts');
const source = fs.readFileSync(routerFile, 'utf8');
const providerFile = path.join(root, 'core/llm/providers/local.ts');
const providerSource = fs.readFileSync(providerFile, 'utf8');
const ast = ts.createSourceFile(routerFile, source, ts.ScriptTarget.Latest, true);
function extract(name) {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node, `actual function missing: ${name}`);
    return node.getText(ast).replace(/^export /, '');
}
const emit = text => ts.transpileModule(text, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
function fixture({ready=true, configured=true, value='OK', pending=false, throws=false, owner}={}) {
    const timers = new Map(), sdk = [], constructors = [], d = deferred();
    let next=1, now=1_000_000, successes=0, lastProbe=0;
    class SDK {
        constructor(options) {
            constructors.push(options);
            this.chat={completions:{create:(body,options) => {
                sdk.push({body,options});
                if (throws) throw Error('synthetic SDK refusal');
                return pending ? d.promise : Promise.resolve({choices:[{message:{content:value}}]});
            }}};
        }
    }
    const fakeDate = class extends Date { static now(){return now;} };
    const base = {AbortController,AbortSignal,URL,Date:fakeDate,
        setTimeout:(cb,ms)=>{const id=next++;timers.set(id,{cb,ms});return id;},
        clearTimeout:id=>timers.delete(id),
        process:{env:{LOCAL_LLM_BASE_URL:configured?'http://127.0.0.1:11434':'',LOCAL_LLM_MODEL:'selected-model',LOCAL_LLM_TIMEOUT:'180000'}},
        exports:{},require:id=>{assert.equal(id,'openai');return {__esModule:true,default:SDK};}};
    vm.runInNewContext(emit(providerSource),base);
    const provider = new base.exports.LocalProvider();
    const context = vm.createContext({...base,localProvider:provider,
        isLocalBrainReady:()=>ready,pickLocalModel:()=> 'selected-model',
        noteLocalBrainOk:()=>{successes++;},LOCAL_RECOVERY_PROBE_TIMEOUT_MS:30_000,
        LOCAL_RECOVERY_PROBE_WINDOW_MS:30_000,localRecoveryProbeAt:0});
    vm.runInContext(emit([extract('isUsableAnswer'),extract('shouldProbeLocalBrain'),extract('probeLocalBrainForRecovery')].join('\n')),context);
    return {call:()=>context.probeLocalBrainForRecovery(owner?.signal),sdk,constructors,timers,d,
        success:()=>successes,claimed:()=>context.localRecoveryProbeAt,
        fire:()=>{const first=timers.entries().next().value;assert.ok(first);timers.delete(first[0]);first[1].cb();},
        advance:ms=>{now+=ms;},context};
}
const rows=[];
async function test(name, run) {
    let deadline;
    try {
        await Promise.race([run(),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('test did not settle within 200ms')),200);})]);
        rows.push({name,pass:true});
    } catch(error) {rows.push({name,pass:false,error:String(error.message)});}
    finally {clearTimeout(deadline);}
}
(async()=>{
    await test('pre-aborted owner never dispatches or consumes the shared probe window',async()=>{
        const owner=new AbortController();owner.abort(Error('private owner reason'));
        const f=fixture({owner});assert.equal(await f.call(),false);assert.equal(f.sdk.length,0);assert.equal(f.claimed(),0);
    });
    for(const opts of [{ready:false},{configured:false}]) await test(`unavailable probe ${JSON.stringify(opts)} does not dispatch`,async()=>{
        const f=fixture(opts);assert.equal(await f.call(),false);assert.equal(f.sdk.length,0);assert.equal(f.claimed(),0);
    });
    await test('success keeps selected model, single token, nonstreaming and no SDK retries',async()=>{
        const f=fixture();assert.equal(await f.call(),true);assert.equal(f.success(),1);assert.equal(f.sdk.length,1);
        assert.equal(f.sdk[0].body.model,'selected-model');assert.equal(f.sdk[0].body.max_tokens,1);
        assert.equal(f.sdk[0].body.stream,undefined);assert.equal(f.sdk[0].body.reasoning_effort,undefined);
        assert.equal(f.sdk[0].body.messages[0].content,'Reply with the single word: OK');
        assert.equal(f.constructors[0].maxRetries,0);assert.equal(f.sdk[0].options.timeout,180000);
    });
    await test('successful probe has a private live SDK signal and clears its timer',async()=>{
        const owner=new AbortController(),f=fixture({owner});assert.equal(await f.call(),true);
        assert.ok(f.sdk[0].options.signal instanceof AbortSignal);assert.notEqual(f.sdk[0].options.signal,owner.signal);
        assert.equal(f.sdk[0].options.signal.aborted,false);assert.equal(f.timers.size,0);
        owner.abort();assert.equal(f.sdk[0].options.signal.aborted,false);
    });
    for(const value of ['', '   ', '...']) await test(`unusable response ${JSON.stringify(value)} preserves the breaker`,async()=>{
        const f=fixture({value});assert.equal(await f.call(),false);assert.equal(f.success(),0);assert.equal(f.timers.size,0);
    });
    await test('SDK synchronous failure remains false and clears timeout/listener',async()=>{
        const owner=new AbortController(),f=fixture({owner,throws:true});assert.equal(await f.call(),false);
        assert.equal(f.success(),0);assert.equal(f.timers.size,0);
        owner.abort();assert.equal(f.sdk[0].options.signal?.aborted,false);
    });
    await test('deadline aborts the actual SDK request even when the SDK ignores abort',async()=>{
        const f=fixture({pending:true});let settled=false;const result=f.call().then(x=>{settled=true;return x;});
        assert.equal(f.sdk.length,1);assert.equal([...f.timers.values()][0].ms,30_000);
        f.fire();await flush();assert.equal(settled,true);assert.equal(await result,false);
        assert.equal(f.sdk[0].options.signal?.aborted,true);assert.equal(f.success(),0);assert.equal(f.timers.size,0);
        f.d.resolve({choices:[{message:{content:'OK'}}]});await flush();assert.equal(f.success(),0);
    });
    await test('owner abort settles without waiting for the probe deadline',async()=>{
        const owner=new AbortController(),f=fixture({owner,pending:true});let settled=false;
        const result=f.call().then(x=>{settled=true;return x;});owner.abort(Error('owner-private-reason'));
        await flush();assert.equal(settled,true);assert.equal(await result,false);
        assert.equal(f.sdk[0].options.signal?.aborted,true);assert.equal(f.timers.size,0);assert.equal(f.success(),0);
        assert.equal(f.sdk[0].options.signal.reason.message,'local recovery probe cancelled');
        f.d.reject(Error('late SDK cancellation'));await flush();assert.equal(f.sdk.length,1);
    });
    await test('cancelled late OK cannot reopen the breaker or start another request',async()=>{
        const owner=new AbortController(),f=fixture({owner,pending:true});const result=f.call();
        owner.abort();await flush();assert.equal(await result,false);
        f.d.resolve({choices:[{message:{content:'OK'}}]});await flush();assert.equal(f.success(),0);assert.equal(f.sdk.length,1);
    });
    await test('concurrent sessions share the claimed window, not the private controller',async()=>{
        const owner=new AbortController(),f=fixture({owner,pending:true});const first=f.call();
        assert.equal(await f.context.probeLocalBrainForRecovery(),false);assert.equal(f.sdk.length,1);
        owner.abort();await flush();assert.equal(await first,false);assert.equal(f.success(),0);
    });
    await test('failed deadline preserves the retry window; a later probe can recover',async()=>{
        const f=fixture({pending:true});const first=f.call();f.fire();await flush();assert.equal(await first,false);
        assert.equal(await f.call(),false);assert.equal(f.sdk.length,1);
        f.advance(30_000);const next=f.call();assert.equal(f.sdk.length,2);
        f.d.resolve({choices:[{message:{content:'OK'}}]});await flush();assert.equal(await next,true);assert.equal(f.success(),1);
    });
    await test('rejection before deadline leaves a later owner abort detached',async()=>{
        const owner=new AbortController(),f=fixture({owner,pending:true});const result=f.call();
        f.d.reject(Error('synthetic SDK reject'));await flush();assert.equal(await result,false);owner.abort();
        assert.equal(f.sdk[0].options.signal?.aborted,false);assert.equal(f.timers.size,0);assert.equal(f.success(),0);
    });
    await test('router passes owner signal and rechecks cancellation before paused skip/new attempts',async()=>{
        const at=source.indexOf('if (await probeLocalBrainForRecovery(callerSignal))');assert.ok(at>0);
        const check=source.indexOf('throwIfCallerAborted();',at),skip=source.indexOf('if (isLocalBrainOpen())',at);
        assert.ok(check>at && check<skip);
    });
    const result={atUTC:new Date().toISOString(),scope:'actual extracted functions + actual LocalProvider + inert SDK/fake timer; no network/live inference',
        routerSHA256:crypto.createHash('sha256').update(source).digest('hex').toUpperCase(),providerSHA256:crypto.createHash('sha256').update(providerSource).digest('hex').toUpperCase(),
        tests:rows.length,passed:rows.filter(x=>x.pass).length,failed:rows.filter(x=>!x.pass).length,rows};
    console.log(JSON.stringify(result,null,2));process.exitCode=result.failed?1:0;
})().catch(error=>{console.error(error);process.exitCode=1;});
