/** Actual ToolService/firewall/identity and file leaves; controlled storage and inert external edges. */
export {};
const nativeFs = jest.requireActual('fs') as typeof import('fs');
const nativePath = jest.requireActual('path') as typeof import('path');
const SID = '111111111111111111111111', UID = 'synthetic-owner', WS = '222222222222222222222222';
const ctx = () => ({ sessionId: SID, userId: UID, workspaceId: WS });

describe('actual runtime diagnostics gateway', () => {
    const originalEnv = process.env, originalSessions = (global as any).mockSessions;
    afterEach(() => {
        process.env = originalEnv;
        if (originalSessions === undefined) delete (global as any).mockSessions;
        else (global as any).mockSessions = originalSessions;
        jest.useRealTimers(); jest.restoreAllMocks(); jest.resetModules();
    });
    function fixture(options: { beforeWork?: (root: string) => void; lookup?: () => Promise<any>; access?: (write: boolean) => Promise<boolean>; afterLeaf?: () => void } = {}) {
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
        const { RuntimeDiagnosticsTool } = require('../modules/tools/definitions/RuntimeDiagnosticsTool');
        const leaf = new RuntimeDiagnosticsTool();
        const actualExecute = leaf.execute.bind(leaf);
        leaf.execute = async (input: any, executionContext: any) => { const result = await actualExecute(input, executionContext); options.afterLeaf?.(); return result; };
        const leaves = [leaf];
        const executions = leaves.map(tool => jest.spyOn(tool, 'execute'));
        mock('../modules/tools/registry', { tools: leaves });
        const { executeTool } = require('../modules/services/ToolService');
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const invoke = (name: string, input: any, context: any = ctx(), owner: any = { userId: UID, sessionId: SID }) =>
            executionFirewall.runInContext(undefined, () => executeTool(name, input, context), owner);
        return { root, events, trace, roots, executions, invoke, selectRoot: (p: string) => { selectedRoot = p; } };
    }


    const request = 'Run a read-only local diagnostic in the current workspace: report the Node.js version and the current workspace path. Do not modify files, install packages, or start a server.';
    const input = () => ({ request, facts: ['node_version','workspace_path'], path: '.' });
    test('real gateway and leaf report actual scoped facts without executing commands', async () => {
        const f=fixture(); const result=await f.invoke('runtime_diagnostics',input());
        expect(result).toMatchObject({ok:true,output:{status:'completed',kind:'runtime_diagnostics',runtimeScope:'joe_api_process',executedCommands:false,
            facts:[{id:'node_version',value:process.version,source:'api_process'},{id:'workspace_path',value:f.root,source:'authorized_workspace'}]}});
        expect(f.executions[0]).toHaveBeenCalledTimes(1); expect(f.roots.every(id=>id===WS)).toBe(true);
    });
    test('single requested runtime version never reveals a workspace fact',async()=>{
        const f=fixture();const supplied={request:'Run a read-only local diagnostic: report the Node version. Do not modify files.',facts:['node_version'],path:'.'};
        const result=await f.invoke('runtime_diagnostics',supplied);expect(result.ok).toBe(true);expect(result.output.facts).toEqual([{id:'node_version',value:process.version,source:'api_process'}]);
    });
    test.each(['userId','sessionId','workspaceId'])('foreign %s is rejected before the real leaf',async key=>{
        const f=fixture(); expect((await f.invoke('runtime_diagnostics',input(),{...ctx(),[key]:'foreign'})).ok).toBe(false); expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test.each(['cancel','root','identity','signal'])('changed %s before work is rejected',async boundary=>{
        const context={...ctx(),isCancelled:()=>false},f=fixture({beforeWork:()=>{
            if(boundary==='root')f.selectRoot(nativePath.dirname(f.root)); if(boundary==='identity')context.userId='foreign';
            if(boundary==='cancel')context.isCancelled=()=>true; if(boundary==='signal')(context as any).signal=new AbortController().signal;
        }}); expect((await f.invoke('runtime_diagnostics',input(),context)).ok).toBe(false);expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test.each(['root','identity','cancel','owner','access'])('revoked %s after actual leaf suppresses publication',async boundary=>{
        let revoked=false,cancelled=false; const context={...ctx(),isCancelled:()=>cancelled}; const f=fixture({
            access:async write=>{expect(write).toBe(false);return !revoked;}, afterLeaf:()=>{
                if(boundary==='root')f.selectRoot(nativePath.dirname(f.root)); if(boundary==='identity')context.userId='foreign';
                if(boundary==='cancel')cancelled=true; if(boundary==='owner')(global as any).mockSessions[0].userId='foreign'; if(boundary==='access')revoked=true;
            }}); const result=await f.invoke('runtime_diagnostics',input(),context);expect(result.ok).toBe(false);expect(result.output.facts).toBeUndefined();expect(f.executions[0]).toHaveBeenCalledTimes(1);
    });
    test('readonly permission is checked again before leaf',async()=>{
        let reads=0;const f=fixture({access:async write=>{expect(write).toBe(false);return ++reads===1;}});
        expect((await f.invoke('runtime_diagnostics',input())).ok).toBe(false);expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test('access revoked during final owner lookup after leaf suppresses publication',async()=>{
        let afterLeaf=false,revoked=false,postLeafLookups=0;
        const f=fixture({access:async()=>!revoked,afterLeaf:()=>{afterLeaf=true;},lookup:async()=>{
            if(afterLeaf && ++postLeafLookups===2)revoked=true;
            return {userId:UID,workspaceId:WS};
        }});
        const result=await f.invoke('runtime_diagnostics',input());
        expect(postLeafLookups).toBe(2);expect(revoked).toBe(true);expect(f.executions[0]).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ok:false,output:{reason:'workspace_permission_denied'}});expect(result.output.facts).toBeUndefined();
    });
    test('snapshot ignores mutations during permission await',async()=>{
        const supplied=input();const f=fixture({access:async()=>{supplied.request='Run commands';supplied.facts[0]='secrets';supplied.path='../other';return true;}});
        const result=await f.invoke('runtime_diagnostics',supplied);expect(result.ok).toBe(true);expect(result.output.facts[0].value).toBe(process.version);
    });
    test.each(['command','cwd','env','userId','workspaceId','__workspaceId','bypass'])('unknown authority %s is rejected',async key=>{
        const f=fixture();expect((await f.invoke('runtime_diagnostics',{...input(),[key]:'forged'})).ok).toBe(false);expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test.each(['facts','request','path'])('accessor %s never runs',async key=>{
        const f=fixture(),getter=jest.fn(),supplied=Object.defineProperty(input(),key,{get:getter,enumerable:true});
        expect((await f.invoke('runtime_diagnostics',supplied)).ok).toBe(false);expect(getter).not.toHaveBeenCalled();expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test('proxy traps never run',async()=>{
        const f=fixture(),trap=jest.fn(()=>{throw Error('trap');}),supplied=new Proxy(input(),{ownKeys:trap,getPrototypeOf:trap});
        expect((await f.invoke('runtime_diagnostics',supplied)).ok).toBe(false);expect(trap).not.toHaveBeenCalled();
    });
    test('a fact index getter never runs',async()=>{
        const f=fixture(),getter=jest.fn(),facts=Object.defineProperty(['node_version','workspace_path'],'0',{get:getter,enumerable:true});
        expect((await f.invoke('runtime_diagnostics',{...input(),facts})).ok).toBe(false);expect(getter).not.toHaveBeenCalled();
    });
    test('extra array authority and sparse fact arrays are rejected',async()=>{
        const f=fixture();const extra=Object.assign(['node_version','workspace_path'],{command:'execute'}),sparse=new Array(2);sparse[1]='workspace_path';
        for(const facts of [extra,sparse])expect((await f.invoke('runtime_diagnostics',{...input(),facts})).ok).toBe(false);expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test.each([['environment'],['workspace_path','node_version'],['node_version','node_version'],[]].map(facts=>[facts]))('unsupported facts %j cannot borrow authority',async facts=>{
        const f=fixture();expect((await f.invoke('runtime_diagnostics',{...input(),facts})).ok).toBe(false);expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test('global no-tool denial remains authoritative',async()=>{
        const f=fixture();expect((await f.invoke('runtime_diagnostics',{...input(),request:request+' Do not use tools.'})).ok).toBe(false);expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test('synthetic credential in quoted request is rejected before tool logging',async()=>{
        const f=fixture();const supplied={...input(),request:request+' "nvapi-'+ 'A'.repeat(40)+'"'};
        expect((await f.invoke('runtime_diagnostics',supplied)).ok).toBe(false);expect(f.executions[0]).not.toHaveBeenCalled();expect(f.trace).not.toHaveBeenCalled();
    });
    test('raw shell remains rejected before all effects',async()=>{
        const f=fixture();expect(await f.invoke('shell_execute',{command:'node --version'})).toMatchObject({ok:false,output:{reason:'tool_not_admitted'}});expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test.each(['0','1'])('direct registered leaf has no authority in mode %s',async mode=>{
        const f=fixture();process.env.JOE_AUTONOMOUS_DEVELOPMENT=mode;const {RuntimeDiagnosticsTool}=require('../modules/tools/definitions/RuntimeDiagnosticsTool');
        const result=await new RuntimeDiagnosticsTool().execute(input(),ctx());expect(result).toMatchObject({ok:false,output:{reason:'runtime_diagnostic_gateway_required'}});
    });
});
