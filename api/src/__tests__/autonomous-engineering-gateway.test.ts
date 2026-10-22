/** Actual ToolService/firewall/identity and file leaves; controlled storage and inert external edges. */
export {};
const nativeFs = jest.requireActual('fs') as typeof import('fs');
const nativePath = jest.requireActual('path') as typeof import('path');
const SID = '111111111111111111111111', UID = 'synthetic-owner', WS = '222222222222222222222222';
const ctx = () => ({ sessionId: SID, userId: UID, workspaceId: WS });

describe('actual current-run engineering gateway', () => {
    const originalEnv = process.env, originalSessions = (global as any).mockSessions;
    afterEach(() => {
        process.env = originalEnv;
        if (originalSessions === undefined) delete (global as any).mockSessions;
        else (global as any).mockSessions = originalSessions;
        jest.useRealTimers(); jest.restoreAllMocks(); jest.resetModules();
    });
    function fixture(options: { beforeWork?: (root: string) => void; lookup?: () => Promise<any>; access?: (write: boolean) => Promise<boolean> } = {}) {
        jest.resetModules(); jest.useFakeTimers();
        const base = originalEnv.JOE_FILE_TEST_ROOT;
        if (!base || !nativePath.isAbsolute(base)) throw new Error('An explicitly owned retained test root is required');
        const root = nativeFs.mkdtempSync(nativePath.join(base, 'workspace-'));
        process.env = { NODE_ENV: 'test', JOE_AUTONOMOUS_DEVELOPMENT: '1', PERSISTENCE_MODE: 'JSON',
            AI_COST_POLICY: 'free_only', AUTO_APPROVE_ALL: '0', AUTO_APPROVE_SAFE: '0', ENABLE_AUTH_BYPASS: 'false' };
        (global as any).mockSessions = [{ id: SID, userId: UID, workspaceId: WS }];
        const deny = (name: string) => (..._args: any[]) => { throw new Error('Unexpected external effect: ' + name); };
        const mock = (name: string, fields: any) => jest.doMock(name, () => fields);
        const filesystem = new Proxy(nativeFs, {
            get(target: any, key: string) {
                if (['writeFileSync', 'mkdirSync', 'readFileSync', 'openSync', 'existsSync', 'statSync', 'realpathSync'].includes(key)) {
                    return (file: any, ...args: any[]) => {
                        if (typeof file !== 'number') {
                            const relative = nativePath.relative(root, nativePath.resolve(String(file)));
                            if (relative === '..' || relative.startsWith('..' + nativePath.sep) || nativePath.isAbsolute(relative)) throw new Error('Fixture IO outside workspace');
                        }
                        return target[key](file, ...args);
                    };
                }
                if (['rmSync', 'unlinkSync', 'renameSync', 'copyFileSync', 'createReadStream', 'createWriteStream', 'promises'].includes(key)) return deny('fs.' + key);
                return target[key];
            },
        });
        jest.doMock('fs', () => ({ __esModule: true, default: filesystem }));
        mock('glob', { glob: deny('glob') });
        class ObjectId { static isValid(v: string) { return /^[0-9a-f]{24}$/u.test(v); } }
        mock('mongoose', { __esModule: true, default: { Types: { ObjectId }, connection: { readyState: options.lookup ? 1 : 0 } } });
        mock('../api/chat-store', { usesLocalChatStore: () => !options.lookup });
        mock('../shared/models/session', { Session: { findById: () => ({ select: () => ({ lean: options.lookup }) }) } });
        mock('../shared/utils/logger', { logger: { debug: jest.fn(), error: jest.fn() } });
        mock('../modules/services/vectorDb', { vectorDb: {} });
        const events = jest.fn(), trace = jest.fn();
        mock('../modules/services/TraceManager', { traceManager: { logEvent: trace } });
        const roots: string[] = [];
        let selectedRoot = root;
        mock('../modules/services/WorkspaceService', { workspaceService: {
            externalRoot: base,
            canAccessAutonomousFiles: async (id: string, uid: string, write: boolean) => id === WS && uid === UID && (options.access ? await options.access(write) : true),
            getActiveRoot: (id: string) => { roots.push(id); if (id !== WS) throw new Error('Wrong explicit workspace'); return selectedRoot; },
            runWithWorkspace: (id: string, work: () => any) => { if (id !== WS) throw new Error('Wrong run workspace'); options.beforeWork?.(root); return work(); },
        } });
        mock('../modules/tools/utils', { resolveToolPath: (p: string, opts: any) => {
            if (opts?.workspaceId !== WS) throw new Error('Missing explicit workspace');
            const abs = nativePath.resolve(selectedRoot, p), relative = nativePath.relative(selectedRoot, abs);
            if (relative.startsWith('..') || nativePath.isAbsolute(relative)) throw new Error('path_outside_workspace');
            return abs;
        } });
        mock('../modules/services/BinaryService', { BinaryService: {} });
        mock('../modules/services/secrets', { getSessionRunConfig: deny('secrets') });
        mock('../modules/browser/challenge', { agentSearchUrl: deny('network') });
        mock('../core/terminal/paint', { paintLine: (v: any) => v });
        mock('../shared/utils/url', { normalizeUrlForGoto: deny('URL') });
        mock('../api/ws', { broadcast: events, broadcastThinkingPhase: events, broadcastTerminalLine: events,
            registerSessionOwner: events, registerTerminalOwner: events, registerTerminalSessionOwner: events });
        mock('../api/page-store', { persistJoeProjects: deny('projects'), writeJoeProject: deny('projects') });
        mock('../modules/terminal/command-router', { commandRouter: {} });
        mock('../modules/tools/handlers', { handleShellCommand: deny('shell') });
        mock('../kernel/ExecutionEngine', { executionEngine: {} });
        mock('../shared/file-write-contract', { validateFileWriteBatch: deny('batch') });
        mock('../modules/tools/terminal/TerminalState', { terminals: {}, registerTerminal: deny('terminal'), removeTerminal: deny('terminal') });
        mock('../modules/terminal/terminal-kernel', { terminalKernel: {} });
        mock('../core/session/attended-run', {
            bindRunCancellation: jest.requireActual('../core/session/attended-run').bindRunCancellation,
            registerRun: () => ({ cancelled: false, whenCancelled: new Promise(() => {}), cancel() { this.cancelled = true; } }),
            releaseHandle: jest.fn(), attendRun: ({ work }: any) => work(),
        });
        mock('../core/llm/intelligent-router', { verifyProviderDirect: deny('provider'), routeToModel: deny('model'), isProviderFailure: () => false });
        mock('../modules/services/AgentLoopService', { AgentLoopService: { runPlannedPhasesIfPresent: deny('orchestrator') } });
        mock('../modules/tools/definitions/ProjectRunTool', { detectStart: deny('run'), missingRuntimeDependencies: deny('run'), reconcileMissingRuntimeTarget: deny('run'), resolveRunnableProject: deny('run') });
        mock('../core/quality/app-audit', { auditBuiltApp: deny('audit'), findingText: deny('audit') });
        const leaves: any[] = [];
        mock('../modules/tools/registry', { tools: leaves });
        const { executeTool } = require('../modules/services/ToolService');
        const { WriteFileTool, FileEditTool } = require('../modules/tools/definitions/SystemTools');
        const { SafeReadFileTool } = require('../modules/tools/definitions/TaskInteractionTools');
        const { DirectoryInspectionTool } = require('../modules/tools/definitions/UtilityTools');
        const { EngineeringDiscoveryTool } = require('../modules/tools/definitions/EngineeringDiscoveryTool');
        const { ProjectPipelineTool } = require('../modules/tools/definitions/ProjectPipelineTool');
        leaves.push(new WriteFileTool(),new SafeReadFileTool(),new FileEditTool(),new DirectoryInspectionTool(),new ProjectPipelineTool(),new EngineeringDiscoveryTool(),
            { name:'project_planner', permissions:[], sideEffects:[], inputSchema:{type:'object'}, execute:jest.fn(async(input:any)=>({ok:true,output:{phases:[{phaseNumber:1,name:'Untrusted delete',tasks:[{tool:'delete_file',input:{path:'agent.js'}}]}],autoExecuted:false,originalRequest:input.projectDescription},logs:[]})) });
        const executions = leaves.map(tool=>jest.spyOn(tool,'execute'));
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const invoke = (name: string, input: any, context: any = ctx(), owner: any = { userId: UID, sessionId: SID }) =>
            executionFirewall.runInContext(undefined, () => executeTool(name, input, context), owner);
        return { root, events, trace, roots, executions, invoke, selectRoot: (p: string) => { selectedRoot = p; } };
    }

    const runId='owned-run';
    const request='Build a local Node command-line task agent in a new folder with automated tests.';
    const existingRequest='Build a local Node task agent in the existing selected folder with source and tests.';
    const sources: Record<string,string> = {
        'package.json':'{"name":"owned-node-fixture","scripts":{"test":"node --test"}}',
        'agent.js':'export const taskLimit = 10;',
        'agent.test.js':'import { taskLimit } from "./agent.js";',
    };
    function installExistingNode(root: string) {
        for (const [name,content] of Object.entries(sources)) nativeFs.writeFileSync(nativePath.join(root,name),content);
    }
    function expectCompleteSourceSnapshots(f: ReturnType<typeof fixture>) {
        const reads = f.executions[1].mock.calls.filter(call => (call[0] as any).startLine === 1 && (call[0] as any).endLine === 10000);
        expect(reads).toHaveLength(Object.keys(sources).length * 2);
        for (const name of Object.keys(sources)) expect(reads.filter(call => (call[0] as any).path === nativePath.join(f.root,name))).toHaveLength(2);
        const plannerInput = f.executions[6].mock.calls[0][0] as any;
        expect(plannerInput.evidence).toMatchObject({mode:'existing_workspace',workspaceRoot:f.root,
            selectedProject:{root:f.root,projectKinds:['node']},
            sourceEvidence:{files:Object.entries(sources).map(([path,content])=>({path,content,lineCount:1}))}});
        for (const content of Object.values(sources)) expect(plannerInput.evidence.requiredSpecification.content).toContain(content);
    }
    const engineeringCtx=()=>({...ctx(),runId,modelConfig:{provider:'local',model:'qwen2.5-coder:7b',baseUrl:'http://127.0.0.1:11434/v1'}});
    const ambient=()=>({userId:UID,sessionId:SID,runId});
    test('real gateway, discovery and complete source snapshots reach planner and reject an untrusted phase before execution',async()=>{
        const f=fixture();installExistingNode(f.root);nativeFs.writeFileSync(nativePath.join(f.root,'README.md'),'# Actual owned workspace');
        const r=await f.invoke('project_pipeline',{request:existingRequest},engineeringCtx(),ambient());
        expect(r).toMatchObject({ok:false,error:'isolated_tool_not_admitted',output:{pipelineFinal:true,status:'failed',executed:false,reason:'isolated_tool_not_admitted',plannerResult:{autoExecuted:false,originalRequest:existingRequest}}});
        expect(f.executions[5]).toHaveBeenCalledTimes(1);expect(f.executions[6]).toHaveBeenCalledTimes(1);
        expectCompleteSourceSnapshots(f);
        expect((f.executions[6].mock.calls[0][0] as any).evidence.facts.some((x:any)=>x.statement==='# Actual owned workspace')).toBe(true);
        expect(f.executions[6].mock.calls[0][1]).toMatchObject({modelConfig:{provider:'local',model:'qwen2.5-coder:7b',baseUrl:'http://127.0.0.1:11434/v1'},engineeringPipeline:false});
        expect(f.executions[0]).not.toHaveBeenCalled();expect(f.executions[2]).not.toHaveBeenCalled();expect(f.roots.every(id=>id===WS)).toBe(true);
    });
    test('missing source evidence holds before the planner or execution',async()=>{
        const f=fixture();nativeFs.writeFileSync(nativePath.join(f.root,'README.md'),'# Actual owned workspace');
        const r=await f.invoke('project_pipeline',{request},engineeringCtx(),ambient());
        expect(r).toMatchObject({ok:false,error:'isolated_source_context_budget',output:{pipelineFinal:true,status:'failed',executed:false,reason:'isolated_source_context_budget'}});
        expect(f.executions[5]).toHaveBeenCalledTimes(1);expect(f.executions[6]).not.toHaveBeenCalled();
        expect(f.executions[0]).not.toHaveBeenCalled();expect(f.executions[2]).not.toHaveBeenCalled();expect(f.roots.every(id=>id===WS)).toBe(true);
    });
    test.each(['engineering_discovery','project_planner','phase_executor','shell_execute','npm_manager','builder_execute'])('unscoped %s cannot borrow admission',async name=>{
        const f=fixture();const r=await f.invoke(name,{request},engineeringCtx(),ambient());expect(r).toMatchObject({ok:false,output:{reason:'tool_not_admitted'}});expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
    test('foreign ambient run blocks before any leaf or model',async()=>{
        const f=fixture();const r=await f.invoke('project_pipeline',{request},engineeringCtx(),{...ambient(),runId:'foreign'});expect(r.ok).toBe(false);expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
    test.each(['userId','sessionId','workspaceId'])('foreign %s remains blocked before discovery',async key=>{
        const f=fixture();const c:any=engineeringCtx();c[key]='foreign';const r=await f.invoke('project_pipeline',{request},c,ambient());expect(r.ok).toBe(false);expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
    test.each([{provider:'auto',model:'qwen2.5-coder:7b'},{provider:'meta',model:'muse'},{provider:'local',model:'wrong'}])('non-exact model config is blocked',async modelConfig=>{
        const f=fixture();const r=await f.invoke('project_pipeline',{request},{...engineeringCtx(),modelConfig},ambient());expect(r.ok).toBe(false);expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
    test('physical workspace access revocation stops before planning',async()=>{
        const f=fixture({access:async()=>false});const r=await f.invoke('project_pipeline',{request},engineeringCtx(),ambient());expect(r).toMatchObject({ok:false,output:{reason:'workspace_permission_denied'}});expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
    test('request getters never run',async()=>{
        const f=fixture(),getter=jest.fn(()=>request);const input=Object.defineProperty({},'request',{get:getter,enumerable:true});const r=await f.invoke('project_pipeline',input,engineeringCtx(),ambient());expect(r.ok).toBe(false);expect(getter).not.toHaveBeenCalled();expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
    test('frozen request cannot be replaced during role lookup',async()=>{
        const input={request:existingRequest};const f=fixture({access:async()=>{input.request='Deploy and delete the workspace';return true;}});installExistingNode(f.root);
        const r=await f.invoke('project_pipeline',input,engineeringCtx(),ambient());
        expect(input.request).toBe('Deploy and delete the workspace');
        expect(r).toMatchObject({ok:false,error:'isolated_tool_not_admitted',output:{pipelineFinal:true,status:'failed',executed:false,plannerResult:{originalRequest:existingRequest}}});
        expect(f.executions[5]).toHaveBeenCalledTimes(1);expect(f.executions[6]).toHaveBeenCalledTimes(1);expectCompleteSourceSnapshots(f);
        expect((f.executions[6].mock.calls[0][0] as any).projectDescription).toBe(existingRequest);
        expect(f.executions[0]).not.toHaveBeenCalled();expect(f.executions[2]).not.toHaveBeenCalled();expect(f.roots.every(id=>id===WS)).toBe(true);
    });
    test('cancellation stops before the first discovery effect',async()=>{
        const f=fixture();const r=await f.invoke('project_pipeline',{request},{...engineeringCtx(),isCancelled:()=>true},ambient());expect(r).toMatchObject({ok:false,output:{reason:'cancelled'}});expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
});
