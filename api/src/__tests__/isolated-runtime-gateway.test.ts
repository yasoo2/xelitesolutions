/** Actual ToolService/firewall/identity and file leaves; controlled storage and inert external edges. */
export {};
const nativeFs = jest.requireActual('fs') as typeof import('fs');
const nativePath = jest.requireActual('path') as typeof import('path');
const SID = '111111111111111111111111', UID = 'synthetic-owner', WS = '222222222222222222222222';
const ctx = () => ({ sessionId: SID, userId: UID, workspaceId: WS });

describe('real ToolService isolated runtime boundaries', () => {
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
            registerRun: () => ({ cancelled: false, whenCancelled: new Promise(() => {}), cancel() { this.cancelled = true; } }),
            releaseHandle: jest.fn(), attendRun: ({ work }: any) => work(),
        });
        mock('../core/llm/intelligent-router', { verifyProviderDirect: deny('provider'), routeToModel: deny('model'), isProviderFailure: () => false });
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
            { name:'project_planner', permissions:[], sideEffects:[], inputSchema:{type:'object'}, execute:jest.fn(async(input:any)=>({ok:true,output:{phases:[{id:'files',tasks:[]}],autoExecuted:false,originalRequest:input.projectDescription},logs:[]})) });
        const executions = leaves.map(tool=>jest.spyOn(tool,'execute'));
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const invoke = (name: string, input: any, context: any = ctx(), owner: any = { userId: UID, sessionId: SID }) =>
            executionFirewall.runInContext(undefined, () => executeTool(name, input, context), owner);
        return { root, events, trace, roots, executions, invoke, leaves, selectRoot: (p: string) => { selectedRoot = p; } };
    }

    function setup(f: ReturnType<typeof fixture>, mutate?: (args: readonly string[], payload: unknown) => void, readFirst = false) {
        const child = nativePath.join(f.root, 'app'); nativeFs.mkdirSync(child);
        nativeFs.writeFileSync(nativePath.join(child, 'package.json'), '{"scripts":{"test":"node --test"}}');
        nativeFs.writeFileSync(nativePath.join(child, 'math.mjs'), 'export const add=(a,b)=>a-b;\n');
        nativeFs.writeFileSync(nativePath.join(child, 'math.test.mjs'), 'import {test} from "node:test";\n');
        const policy = require('../modules/services/AutonomousEngineeringPolicy');
        const issued = policy.issueEngineeringContext({ ...ctx(), runId: 'gateway-run',
            modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434' } },
            { ...ctx(), runId: 'gateway-run', root: child, request: 'Fix addition and test it' }, () => false);
        const evidence = policy.sealEngineeringEvidence(issued, { mode: 'existing_workspace', constraints: { createsNewProject: false, readOnly: false },
            selectedProject: { root: child, projectKinds: ['node'], sourceFiles: ['math.mjs'], testFiles: ['math.test.mjs'] },
            sourceEvidence: { files: ['package.json','math.mjs','math.test.mjs'].map(name => ({ path: name, content: nativeFs.readFileSync(nativePath.join(child, name), 'utf8') })) } });
        const tasks = readFirst ? [{ tool: 'read_file', input: { path: 'math.mjs' } }, { tool: 'shell_execute', input: { command: 'npm test' } }]
            : [{ tool: 'file_edit', input: { path: 'math.mjs', find: 'a-b', replace: 'a+b' } }, { tool: 'shell_execute', input: { command: 'npm test' } }];
        const execution = policy.issueEngineeringExecution(issued, evidence, { phases: [{ tasks }] });
        const phase = policy.engineeringExecution(execution).phases[0];
        const calls: string[][] = [], files = new Map<string,string>(); let name = '', status = 'running';
        const driver = async (args: readonly string[], stdin?: string) => {
            calls.push([...args]); let output = ''; const payload = stdin ? JSON.parse(stdin) : undefined;
            if (args[0] === 'daemon') output = '{"status":"running"}';
            else if (args[0] === 'settings') output = args[2] === 'mcp.forceLocalGateway' ? 'true' : 'false';
            else if (args[0] === 'mcp') output = '[]';
            else if (args[0] === 'create') name = args[args.indexOf('--name') + 1];
            else if (args[0] === 'ls') output = JSON.stringify([{ name, id:'12345678-1234-1234-1234-123456789012', cpus:2, memory_mib:2048, status }]);
            else if (args[0] === 'policy') output = JSON.stringify({ rules:[{status:'active',decision:'deny',scope:`sandbox:${name}`,resources:['**'],actions:['net:connect:tcp','net:connect:udp']}] });
            else if (args[0] === 'stop') { status='stopped'; output=JSON.stringify([{name,id:'12345678-1234-1234-1234-123456789012',action:'stopped'}]); }
            else if (payload?.kind === 'stage') { for (const file of payload.files) files.set(file.name,file.content); output='{}'; }
            else if (payload?.kind === 'read') output=JSON.stringify({content:files.get(payload.name)});
            else if (payload?.kind === 'edit') { files.set(payload.name,payload.after); output='{}'; }
            else output='# tests 2\n# fail 0\n';
            mutate?.(args, payload); return {exit:0,stdout:output,stderr:''};
        };
        const actual = jest.requireActual('../modules/services/IsolatedProjectRuntimeService');
        const service = new actual.IsolatedProjectRuntimeService(driver, false);
        jest.doMock('../modules/services/IsolatedProjectRuntimeService', () => ({ ...actual, isolatedProjectRuntime: service }));
        f.leaves.push({ name: 'shell_execute', permissions: [], sideEffects: [], inputSchema: { type:'object' }, execute: jest.fn(() => { throw Error('Host shell leaf must never execute'); }) });
        const invoke = (index: number) => f.invoke(phase.tasks[index].tool, phase.tasks[index].input,
            policy.issueEngineeringTask(execution, phase, phase.tasks[index]), { userId: UID, sessionId: SID, runId:'gateway-run' });
        return { child, calls, invoke };
    }

    test.each([false,true])('relative selected-child edit never reads the workspace parent preimage (parentFile=%s)', async parentFile => {
        const f = fixture(); if(parentFile) nativeFs.writeFileSync(nativePath.join(f.root,'math.mjs'),'Unrelated parent content');
        const s=setup(f); const result=await s.invoke(0);
        expect(result).toMatchObject({ok:true,output:{status:'completed',promoted:false}});
        expect(nativeFs.readFileSync(nativePath.join(s.child,'math.mjs'),'utf8')).toContain('a-b');
        if(parentFile) expect(nativeFs.readFileSync(nativePath.join(f.root,'math.mjs'),'utf8')).toBe('Unrelated parent content');
        expect(f.executions[2]).not.toHaveBeenCalled();
    });
    test('rebind during awaited permission lookup stops before any fake native call', async () => {
        let f: ReturnType<typeof fixture>, count=0;
        f=fixture({access:async write=>{if(write && ++count===2) f.selectRoot(nativePath.join(f.root,'app')); return true;}});
        const s=setup(f), result=await s.invoke(0);
        expect(result.ok).toBe(false); expect(s.calls).toHaveLength(0);
        expect(nativeFs.readFileSync(nativePath.join(s.child,'math.mjs'),'utf8')).toContain('a-b');
    });
    test('write revocation while final guest test is awaited prevents host promotion', async () => {
        let allowed=true; const f=fixture({access:async()=>allowed});
        const s=setup(f,args=>{if(args[0]==='exec' && args.includes('--test-reporter=tap')) allowed=false;});
        expect((await s.invoke(0)).ok).toBe(true); const result=await s.invoke(1);
        expect(result.ok).toBe(false); expect(nativeFs.readFileSync(nativePath.join(s.child,'math.mjs'),'utf8')).toContain('a-b');
        expect(s.calls.filter(call=>call[0]==='stop')).toHaveLength(1);
    });
    test('workspace rebind during exported file await prevents host publication', async () => {
        let exports=0; const f=fixture(); const s=setup(f,(args,payload:any)=>{
            if(payload?.kind==='read' && ++exports===2) f.selectRoot(nativePath.join(f.root,'app'));
        });
        expect((await s.invoke(0)).ok).toBe(true); const result=await s.invoke(1);
        expect(result.ok).toBe(false); expect(nativeFs.readFileSync(nativePath.join(s.child,'math.mjs'),'utf8')).toContain('a-b');
        expect(s.calls.filter(call=>call[0]==='stop')).toHaveLength(1);
    });
    test('read access revoked during guest read returns no content and stops only its owned guest', async () => {
        let allowed=true; const f=fixture({access:async()=>allowed});
        const s=setup(f,(_args,payload:any)=>{if(payload?.kind==='read') allowed=false;},true);
        const result=await s.invoke(0);
        expect(result.ok).toBe(false); expect(result.output.content).toBeUndefined();
        expect(result.output.cleanup).toBe('owned_guest_stopped');
        expect(s.calls.filter(call=>call[0]==='stop')).toHaveLength(1);
    });
});

