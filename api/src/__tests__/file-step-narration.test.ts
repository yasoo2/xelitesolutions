/** Actual coordinate method, with closed transport/tool/persistence fixtures.
 * This verifies narration scheduling/context forwarding, not real authority or I/O.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

function runtime() {
    const calls: Array<{tool:string; input:any; context:any}> = [];
    const narration = jest.fn(async () => ({text:'I inspect the current task before proceeding.'}));
    const progress = jest.fn();
    const forbidden = jest.fn(() => {throw new Error('External provider/persistence/agent use forbidden');});
    let toolReply: any = {ok:true,output:{content:'fixture',lineCount:1}};
    const modules: Record<string, any> = {
        '../core/orchestrator/PlanningEngine': {PlanningEngine:{generatePlan:forbidden}},
        '../shared/reply-language': {isArabicReply:()=>false,say:(_a:boolean,_ar:string,en:string)=>en},
        '../core/orchestrator/plan-tools': {unrunnableShellStep:()=>null},
        '../core/intelligence/IntentParser': {IntentParser:{parse:forbidden}},
        '../modules/services/ToolService': {executeTool:async(tool:string,input:any,context:any)=>{calls.push({tool,input,context});context.onProgress(`actual fixture tool ${tool}`);return toolReply;}},
        '../api/ws': {broadcastThinkingDetail:progress,broadcast:jest.fn()},
        '../core/orchestrator/phaseAnnounce': {announcePhase:jest.fn()},
        '../core/agents/narrator': {narrate:narration,narrationEnabled:()=>true},
        '../core/llm/intelligent-router': {routeToModel:forbidden,isProviderFailure:()=>false,PROVIDER_FAILURE_PREFIX:'__PROVIDER_FAILURE__',default:forbidden},
        './departments': {emitDepartment:jest.fn()},
        'crypto': {randomUUID:()=> 'fixture-id'},
        './agents/BaseAgent': {BaseAgent:class {}},
        './agents/SecurityAgent': {SecurityAgent:class {}},
        './agents/BrowserAgent': {BrowserAgent:class {}},
        '../core/orchestrator/ExecutionMemory': {compactRuntimeValue:(value:any)=>value},
        '../modules/services/TraceManager': {traceManager:{logEvent:jest.fn()}},
        './AgentExecutionFirewall': {executionFirewall:{allow:forbidden}},
        '../shared/utils/deadline': {withDeadline:(promise:any)=>promise,NODE_DEADLINE_MS:1000,RUN_DEADLINE_MS:1000},
        '../core/memory/repair-memory': {repairMemory:{record:forbidden}},
        '../core/session/attended-run': {CANCELLED:'cancelled'},
        '../core/capabilities/decision-profiles': {compactCapabilityDecisionReceiptForRuntime:()=>undefined},
    };
    const source = fs.readFileSync(path.join(__dirname,'../orchestration/AgentOrchestrator.ts'),'utf8');
    const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
    const box: any = {exports:{},require:(name:string)=>{if(!(name in modules)) throw new Error(`Unapproved import ${name}`);return modules[name];},console:{log:()=>{},warn:()=>{},error:()=>{}},process:{env:{}},setTimeout,clearTimeout,AbortController};
    vm.runInNewContext(compiled,box,{timeout:1000});
    const agent = new box.exports.AgentOrchestrator();
    const memory = {sessionId:'trusted-session',record:jest.fn(),getHistory:()=>[],getResults:()=>({fixture:true})};
    const context: any = {sessionId:'trusted-session',workspaceId:'trusted-workspace',userId:'trusted-owner',runId:'trusted-run',isCancelled:()=>false};
    agent.context=context;
    async function run(tools:string[], input?:any) {
        const nodes = tools.map((tool,index)=>({id:`n${index}`,agent:'Dev',task:`Operate ${tool}`,tool,input:input??{path:'fixture.txt',content:'fixture'},dependencies:index?[`n${index-1}`]:[],status:'pending'}));
        const dag={id:'fixture-dag',nodes,status:'idle'};
        const result=await agent.coordinate(dag,memory,context,undefined,'Perform the current workspace file operations');
        return {result,dag};
    }
    return {calls,narration,progress,forbidden,context,memory,run,setReply:(reply:any)=>{toolReply=reply;}};
}

describe('file steps do not wait for optional model narration',()=>{
    const aliases=['write_file','file_write','create_file','write_to_file','read_file','file_read','file_edit'];
    test.each([...aliases,...aliases.map(name=>` ${name} `)])('%s reaches the existing gateway without any decorative call',async tool=>{
        const fixture=runtime();
        const {result,dag}=await fixture.run([tool]);
        expect(result.ok).toBe(true);
        expect(dag.nodes[0].status).toBe('completed');
        expect(fixture.narration).not.toHaveBeenCalled();
        expect(fixture.forbidden).not.toHaveBeenCalled();
        expect(fixture.calls.map(call=>call.tool)).toEqual([tool.trim()]);
        expect(fixture.calls[0].context).toMatchObject({sessionId:'trusted-session',workspaceId:'trusted-workspace',userId:'trusted-owner',runId:'trusted-run'});
        expect(fixture.calls[0].context.isCancelled).toBe(fixture.context.isCancelled);
        expect(fixture.progress).toHaveBeenCalledWith('trusted-session',`actual fixture tool ${tool.trim()}`);
    });
    it('preserves dependency order and actual result evidence in a write/read pair',async()=>{
        const fixture=runtime();
        const {result}=await fixture.run(['write_file','read_file']);
        expect(result.ok).toBe(true);
        expect(fixture.calls.map(call=>call.tool)).toEqual(['write_file','read_file']);
        expect(fixture.memory.record.mock.calls.map(call=>call[3])).toEqual(['completed','completed']);
        expect(fixture.narration).not.toHaveBeenCalled();
        expect(result.steps.map((step:any)=>step.result)).toEqual([{content:'fixture',lineCount:1},{content:'fixture',lineCount:1}]);
    });
    it('keeps a planned literal edit when its data looks like a browser request',async()=>{
        const fixture=runtime();
        const input={path:'fixture.txt',find:'https://example.com',replace:'https://example.org'};
        const {result}=await fixture.run(['file_edit','read_file'],input);
        expect(result.ok).toBe(true);
        expect(fixture.calls.map(call=>call.tool)).toEqual(['file_edit','read_file']);
        expect(fixture.calls[0].input).toEqual(input);
        expect(fixture.narration).not.toHaveBeenCalled();expect(fixture.forbidden).not.toHaveBeenCalled();
    });
    it('stops an already cancelled graph before narration or tool admission',async()=>{
        const fixture=runtime();fixture.context.isCancelled=()=>true;
        await expect(fixture.run(['write_file'])).rejects.toThrow('cancelled');
        expect(fixture.calls).toEqual([]);expect(fixture.narration).not.toHaveBeenCalled();
    });
    it('keeps a nonrecoverable gateway rejection as a failed result without dependent read',async()=>{
        const fixture=runtime();fixture.setReply({ok:false,error:'workspace_access_denied',output:{nonRecoverable:true,message:'workspace_access_denied'}});
        const {result,dag}=await fixture.run(['write_file','read_file']);
        expect(result.ok).toBe(false);
        expect(dag.nodes.map((node:any)=>node.status)).toEqual(['failed','pending']);
        expect(fixture.calls.map(call=>call.tool)).toEqual(['write_file']);
        expect(fixture.narration).not.toHaveBeenCalled();expect(fixture.forbidden).not.toHaveBeenCalled();
    });
    test.each(['ambiguous_edit_match','file_changed','path_outside_workspace','tool_not_admitted','trusted_context_required'])('stops an explicit gateway policy rejection (%s) without generative recovery',async reason=>{
        const fixture=runtime();fixture.setReply({ok:false,error:'policy_blocked',output:{status:'failed',risk:'high',reason},logs:[`blocked=1 reason=${reason}`]});
        const {result,dag}=await fixture.run(['file_edit','read_file']);
        expect(result.ok).toBe(false);
        expect(result.result).toMatchObject({status:'failed',reason});
        expect(dag.nodes.map((node:any)=>node.status)).toEqual(['failed','pending']);
        expect(fixture.calls.map(call=>call.tool)).toEqual(['file_edit']);
        expect(fixture.forbidden).not.toHaveBeenCalled();expect(fixture.narration).not.toHaveBeenCalled();
    });
    test.each(['shell_execute','ai_write_file','npm_manager'])('keeps optional narration for unrelated %s work',async tool=>{
        const fixture=runtime();const {result}=await fixture.run([tool]);
        expect(result.ok).toBe(true);expect(fixture.narration).toHaveBeenCalledTimes(1);
        expect(fixture.calls.map(call=>call.tool)).toEqual([tool]);
    });
    test.each(['central_answer','echo','project_pipeline'])('preserves the previous narration exclusion for %s',async tool=>{
        const fixture=runtime();const {result}=await fixture.run([tool]);
        expect(result.ok).toBe(true);expect(fixture.narration).not.toHaveBeenCalled();
    });
});
