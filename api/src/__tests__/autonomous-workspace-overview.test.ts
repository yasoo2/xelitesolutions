/** Actual ToolService/firewall/identity and file leaves; controlled storage and inert external edges. */
export {};
const nativeFs = jest.requireActual('fs') as typeof import('fs');
const nativePath = jest.requireActual('path') as typeof import('path');
const SID = '111111111111111111111111', UID = 'synthetic-owner', WS = '222222222222222222222222';
const ctx = () => ({ sessionId: SID, userId: UID, workspaceId: WS });

describe('autonomous workspace gateway floor', () => {
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
        const { WriteFileTool, FileEditTool } = require('../modules/tools/definitions/SystemTools');
        const { SafeReadFileTool } = require('../modules/tools/definitions/TaskInteractionTools');
        const { DirectoryInspectionTool } = require('../modules/tools/definitions/UtilityTools');
        const leaves = [new WriteFileTool(), new SafeReadFileTool(), new FileEditTool(), new DirectoryInspectionTool(), { name: 'project_pipeline', permissions: ['execute'], sideEffects: ['execute'], inputSchema: {type: 'object'}, execute: jest.fn(async input => ({ok: true, output: input, logs: []})) }];
        const executions = leaves.map(tool => jest.spyOn(tool, 'execute'));
        mock('../modules/tools/registry', { tools: leaves });
        const { executeTool } = require('../modules/services/ToolService');
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const invoke = (name: string, input: any, context: any = ctx(), owner: any = { userId: UID, sessionId: SID }) =>
            executionFirewall.runInContext(undefined, () => executeTool(name, input, context), owner);
        return { root, events, trace, roots, executions, invoke, selectRoot: (p: string) => { selectedRoot = p; } };
    }

    const overview = 'Inspect the workspace and list its top-level files without making changes.';
    test('directory listing uses the explicit owned root and no approval flags', async () => {
        const f=fixture(); nativeFs.writeFileSync(nativePath.join(f.root,'visible.txt'),'content');
        const result=await f.invoke('inspect_directory',{path:'.',depth:1});
        expect(result).toMatchObject({ok:true,output:{tree:[{name:'visible.txt',type:'file',size:7}],truncated:false}});
        expect(f.roots.every(id=>id===WS)).toBe(true);
    });
    test('pipeline admission is limited to a frozen read-only overview', async () => {
        const f=fixture(), input={request:overview,path:'.'};
        const result=await f.invoke('project_pipeline',input);
        expect(result).toMatchObject({ok:true,output:{request:overview,path:f.root}});
        expect(input.path).toBe('.');
    });
    test.each(['Build a Node project and run tests.', 'Build a project with a README.',
        'List root files without changes, then create a server.', 'Read-only: audit the existing project without writing.',
        'Answer only: list root files without making changes.', 'Explain how to list root files without making changes.'])
        ('cannot borrow overview admission: %s',async request=>{
            const f=fixture(); const result=await f.invoke('project_pipeline',{request});
            expect(result).toMatchObject({ok:false,output:{reason:'autonomous_engineering_not_supported'}});
            expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
        });
    test.each(['../escape','../../escape','.env','.git','.ssh','secrets','node_modules','credentials.json',
        'auth.json','bad\0path','folder:stream','trailing.','trailing ','con','nul','id_rsa','cert.pem'])
        ('rejects directory boundary %s before the leaf',async path=>{
            const f=fixture(); const result=await f.invoke('inspect_directory',{path});
            expect(result.ok).toBe(false); expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
        });
    test.each([0,2,NaN,Infinity,'1',null])('rejects nonbounded depth %s',async depth=>{
        const f=fixture(); expect((await f.invoke('inspect_directory',{path:'.',depth})).ok).toBe(false);
        expect(f.executions.every(spy=>spy.mock.calls.length===0)).toBe(true);
    });
    test.each(['userId','workspaceId','__workspaceId','__userId','bypass','command'])('rejects caller authority key %s',async key=>{
        const f=fixture(); expect((await f.invoke('inspect_directory',{path:'.',[key]:'forged'})).ok).toBe(false);
    });
    test('does not execute getters',async()=>{
        const f=fixture(), getter=jest.fn(()=>'.'), input=Object.defineProperty({},'path',{get:getter,enumerable:true});
        expect((await f.invoke('inspect_directory',input)).ok).toBe(false); expect(getter).not.toHaveBeenCalled();
    });
    test('freezes input across asynchronous role checks',async()=>{
        const input={path:'.'}, f=fixture({access:async()=>{input.path='../escape'; return true;}});
        expect((await f.invoke('inspect_directory',input)).ok).toBe(true);
        expect((f.executions[3].mock.calls[0][0] as any).path).toBe(f.root);
    });
    test('rechecks read role immediately before the leaf',async()=>{
        let n=0;const f=fixture({access:async write=>{expect(write).toBe(false);return ++n===1;}});
        expect(await f.invoke('inspect_directory',{path:'.'})).toMatchObject({ok:false,output:{reason:'workspace_permission_denied'}});
        expect(f.executions[3]).not.toHaveBeenCalled();
    });
    test.each(['cancel','root','identity','signal'])('refuses changed %s before reading',async boundary=>{
        const context={...ctx(),isCancelled:()=>false}, f=fixture({beforeWork:()=>{
            if(boundary==='root') f.selectRoot(nativePath.dirname(f.root));
            if(boundary==='identity') context.userId='foreign';
            if(boundary==='cancel') context.isCancelled=()=>true;
            if(boundary==='signal') (context as any).signal=new AbortController().signal;
        }});
        expect((await f.invoke('inspect_directory',{path:'.'},context)).ok).toBe(false);
        expect(f.executions[3]).not.toHaveBeenCalled();
    });
    test.each([{userId:'foreign'}, {workspaceId:'foreign'}, {sessionId:'foreign'}])('rejects forged identity %j',async changed=>{
        const f=fixture();expect((await f.invoke('inspect_directory',{path:'.'},{...ctx(),...changed})).ok).toBe(false);
        expect(f.executions[3]).not.toHaveBeenCalled();
    });
    test('does not list sensitive paths, child junctions or hardlinks',async()=>{
        const f=fixture(); nativeFs.mkdirSync(nativePath.join(f.root,'.git'));nativeFs.writeFileSync(nativePath.join(f.root,'.env'),'fixture');
        nativeFs.writeFileSync(nativePath.join(f.root,'visible.txt'),'public');
        nativeFs.linkSync(nativePath.join(f.root,'visible.txt'),nativePath.join(f.root,'hard.txt'));
        nativeFs.symlinkSync(nativePath.dirname(f.root),nativePath.join(f.root,'linked'),'junction');
        const result=await f.invoke('inspect_directory',{path:'.'});
        expect(result).toMatchObject({ok:true,output:{tree:[]}});
        expect((await f.invoke('inspect_directory',{path:'linked'})).ok).toBe(false);
    });
    test('marks truncation at the bounded entry budget',async()=>{
        const f=fixture();for(let i=0;i<257;i++)nativeFs.writeFileSync(nativePath.join(f.root,`file-${i}.txt`),'x');
        const result=await f.invoke('inspect_directory',{path:'.'});
        expect(result).toMatchObject({ok:true,output:{truncated:true,inspectedEntries:256}});
        expect(result.output.tree).toHaveLength(256);
    });
});
