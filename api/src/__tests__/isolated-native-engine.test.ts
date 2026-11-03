import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), spawn: jest.fn() }));
jest.mock('node-pty', () => ({}));
import { spawn } from 'child_process';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { ISOLATED_GUEST_FILE_PROGRAM } from '../kernel/ExecutionEngine';
import { ExecutionEnforcer } from '../kernel/ExecutionEnforcer';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { issueEngineeringContext, issueEngineeringExecution, sealEngineeringEvidence, bindEngineeringExecutionGateway } from '../modules/services/AutonomousEngineeringPolicy';

describe('canonical isolated native execution authority (offline process transport)', () => {
    const CLI = 'C:/Users/home/AppData/Local/DockerSandboxes/bin/sbx.exe';
    const storage = 'D:/AI/DockerSandboxes';
    const id = '12345678-1234-1234-1234-123456789012';
    const owner = { userId: 'owner-1', sessionId: 'session-1', runId: 'engine-run-1' };
    let root: string, context: any, unboundContext: any, name: string, cancelled: boolean, permitted: boolean, receipts: string;
    let child: any, calls: any[], complete: (stdout: string | Buffer[], exit?: number) => void;
    let receive: (args: string[], input: string) => void;
    const originalRead = fs.readFileSync.bind(fs), originalWrite = fs.writeFileSync.bind(fs), originalMkdir = fs.mkdirSync.bind(fs);
    const mapReceipt = (value: any) => typeof value === 'string' && path.resolve(value).startsWith(path.resolve(storage, 'run-receipts', 'native'))
        ? path.join(receipts, path.relative(path.resolve(storage, 'run-receipts', 'native'), path.resolve(value))) : value;
    beforeEach(() => {
        process.env.LOCAL_LLM_MODEL = 'qwen2.5-coder:7b'; cancelled = false; permitted = true; calls = [];
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-native-engine-')); receipts = path.join(root, 'receipts');
        const manifest = '{"scripts":{"test":"node --test"}}';
        const planning = issueEngineeringContext({ ...owner, workspaceId: 'workspace-1', modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434' } },
            { ...owner, workspaceId: 'workspace-1', root, request: 'Fix source and run its tests' }, () => cancelled);
        const evidence = sealEngineeringEvidence(planning, { mode: 'existing_workspace', constraints: { createsNewProject: false, readOnly: false },
            selectedProject: { root, projectKinds: ['node'], sourceFiles: ['math.mjs'], testFiles: ['math.test.mjs'] }, sourceEvidence: { files: [{ path: 'package.json', content: manifest }] } });
        context = issueEngineeringExecution(planning, evidence, { phases: [{ tasks: [{ tool: 'shell_execute', input: { command: 'npm test' } }] }] });
        unboundContext = issueEngineeringExecution(planning, evidence, { phases: [{ tasks: [{ tool: 'shell_execute', input: { command: 'npm test' } }] }] });
        bindEngineeringExecutionGateway(context, async () => permitted);
        name = `joe-run-${crypto.createHash('sha256').update(`${owner.userId}/workspace-1/${owner.runId}`).digest('hex').slice(0,12)}-aabbccdd`;
        jest.spyOn(fs, 'writeFileSync').mockImplementation((file: any, data: any, options: any) => originalWrite(mapReceipt(file), data, options));
        jest.spyOn(fs, 'mkdirSync').mockImplementation((file: any, options: any) => originalMkdir(mapReceipt(file), options));
        receive = (_args, _input) => undefined;
        (spawn as jest.Mock).mockImplementation((file, args, options) => {
            child = new EventEmitter(); child.pid = 98765; child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = jest.fn();
            const current = child; let input = '';
            current.stdin.on('data', (chunk: Buffer) => { input += chunk.toString('utf8'); });
            complete = (output, code = 0) => { for (const chunk of Array.isArray(output) ? output : [Buffer.from(output)]) current.stdout.emit('data', chunk); current.emit('close', code); };
            current.stdin.on('finish', () => receive(args, input)); calls.push({ file, args, options, child: current }); return current;
        });
    });
    afterEach(() => { jest.restoreAllMocks(); (spawn as jest.Mock).mockReset(); });
    const inside = <T>(action: () => T) => executionFirewall.runInContext(undefined, action, owner);
    const open = () => inside(() => ExecutionGateway.openIsolatedNative(context, name));
    async function createAndBind(run: any) {
        receive = args => {
            if (args[0] === 'create') complete(`Created sandbox ${name}`);
            else if (args[0] === 'ls') complete(JSON.stringify([{ name, id, cpus: 2, memory_mib: 2048, status: 'running' }]));
        };
        await inside(() => run(['create',`${storage}/joe-isolated-shell-kit-v1`,'--name',name,'--skills','off','--cpus','2','--memory','2g','--deny-network','**','--pull','missing','--no-progress']));
        await inside(() => run(['ls','--format','json']));
    }
    test('unsealed, foreign owner and denied private gateway contexts cannot launch a process', async () => {
        await expect(inside(() => ExecutionGateway.openIsolatedNative({}, name))).rejects.toThrow('isolated_native_authority_required');
        await expect(executionFirewall.runInContext(undefined, () => ExecutionGateway.openIsolatedNative(context, name), { ...owner, userId: 'foreign' })).rejects.toThrow('isolated_native_authority_required');
        bindEngineeringExecutionGateway(context, async () => false);
        await expect(open()).rejects.toThrow('isolated_native_authority_required'); expect(spawn).not.toHaveBeenCalled();
    });
    test('a valid sealed lease with genuinely absent private ToolService gateway cannot open the SDK capability', async () => {
        await expect(inside(() => ExecutionGateway.openIsolatedNative(unboundContext,name))).rejects.toThrow('isolated_native_authority_required');
        expect(spawn).not.toHaveBeenCalled(); expect(fs.existsSync(receipts)).toBe(false);
    });
    test('literal SDK argv uses replacement environment and preserves raw UTF-8 chunk boundaries', async () => {
        process.env.GH_TOKEN = 'fixture-sentinel'; process.env.NVIDIA_API_KEY = 'fixture-sentinel'; process.env.SSH_AUTH_SOCK = 'fixture-sentinel';
        const run = await open(); const unicode = Buffer.from('{"text":"العربية"}');
        receive = () => complete([unicode.subarray(0,12),unicode.subarray(12,15),unicode.subarray(15)]);
        const result = await inside(() => run(['daemon','status','--format','json']));
        expect(result.stdout).toBe(unicode.toString('utf8')); expect(calls[0].file).toBe(CLI); expect(calls[0].args).toEqual(['daemon','status','--format','json']);
        expect(calls[0].options).toMatchObject({ shell:false,windowsHide:true,cwd:storage,stdio:['pipe','pipe','pipe'] });
        expect(calls[0].options.env).not.toHaveProperty('GH_TOKEN'); expect(calls[0].options.env).not.toHaveProperty('NVIDIA_API_KEY'); expect(calls[0].options.env).not.toHaveProperty('SSH_AUTH_SOCK');
        expect(calls[0].options.env).toMatchObject({ SANDBOXES_STORAGE_ROOT:storage,TEMP:`${storage}/tmp`,TMP:`${storage}/tmp` });
        delete process.env.GH_TOKEN; delete process.env.NVIDIA_API_KEY; delete process.env.SSH_AUTH_SOCK;
    });
    test('arbitrary CLI, MCP registration, foreign guest and exec before a positive creation/ID binding are denied', async () => {
        const run = await open();
        for (const args of [['mcp','load','untrusted'],['daemon','restart'],['exec',name,'powershell','-Command','x'],['stop','foreign','--format','json'],
            ['exec','-i',name,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/home/agent','LANG=C.UTF-8','node','-e',ISOLATED_GUEST_FILE_PROGRAM]])
            await expect(inside(() => run(args))).rejects.toThrow('isolated_native_route_rejected');
        expect(spawn).not.toHaveBeenCalled();
    });
    test('permission revoked during the awaited gateway check prevents process creation', async () => {
        const run = await open(); bindEngineeringExecutionGateway(context, async () => { cancelled = true; return true; });
        await expect(inside(() => run(['daemon','status','--format','json']))).rejects.toThrow('isolated_native_authority_expired'); expect(spawn).not.toHaveBeenCalled();
    });
    test('post-await permission false stops an otherwise active lease before any receipt or process effect', async () => {
        const run = await open(); bindEngineeringExecutionGateway(context, async () => { await Promise.resolve(); permitted = false; return false; });
        await expect(inside(() => run(['daemon','status','--format','json']))).rejects.toThrow('isolated_native_authority_expired');
        expect(cancelled).toBe(false); expect(spawn).not.toHaveBeenCalled(); expect(fs.existsSync(receipts)).toBe(false);
    });
    test('changed executable bytes fail their pin before receipt or process creation', async () => {
        const run = await open();
        jest.spyOn(fs,'readFileSync').mockImplementation((file:any,options:any) => typeof file === 'string' && path.resolve(file) === path.resolve(CLI)
            ? Buffer.from('different executable bytes') : originalRead(file,options));
        await expect(inside(() => run(['daemon','status','--format','json']))).rejects.toThrow('isolated_native_cli_pin_changed');
        expect(spawn).not.toHaveBeenCalled(); expect(fs.existsSync(receipts)).toBe(false);
    });
    test('a receipt-directory reparse point is rejected before writing or starting the executable', async () => {
        const run = await open(), receiptRoot = path.resolve(storage,'run-receipts','native');
        const exists = fs.existsSync.bind(fs), stat = fs.lstatSync.bind(fs);
        jest.spyOn(fs,'existsSync').mockImplementation((file:any) => typeof file === 'string' && path.resolve(file) === receiptRoot ? true : exists(file));
        jest.spyOn(fs,'lstatSync').mockImplementation((file:any,options:any) => typeof file === 'string' && path.resolve(file) === receiptRoot
            ? { isDirectory:()=>true,isSymbolicLink:()=>true } as fs.Stats : stat(file,options));
        await expect(inside(() => run(['daemon','status','--format','json']))).rejects.toThrow('isolated_receipt_link');
        expect(spawn).not.toHaveBeenCalled(); expect(exists(receipts)).toBe(false); expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
    test('deadline keeps a pending PID receipt, never kills, and late creation permits only owned cleanup', async () => {
        const run = await open(); const pending = jest.fn(); let late: any;
        const command = ['create',`${storage}/joe-isolated-shell-kit-v1`,'--name',name,'--skills','off','--cpus','2','--memory','2g','--deny-network','**','--pull','missing','--no-progress'];
        await expect(inside(() => run(command,'',5,{onPending:pending,onLateTerminal:(result:any)=>{late=result;}}))).rejects.toThrow('isolated_native_deadline_pending_no_kill');
        expect(pending).toHaveBeenCalledTimes(1); expect(child.kill).not.toHaveBeenCalled();
        const receipt = path.join(receipts,fs.readdirSync(receipts)[0]); const before = JSON.parse(originalRead(receipt,'utf8'));
        expect(before).toMatchObject({status:'PENDING_NO_KILL_NO_RETRY',pid:98765,name});
        cancelled = true; complete(`Created sandbox ${name}`); expect(late.exit).toBe(0);
        receive = args => complete(args[0] === 'ls' ? JSON.stringify([{name,id,cpus:2,memory_mib:2048,status:'stopped'}]) : JSON.stringify([{name,id,action:'stopped'}]));
        await inside(() => run(['ls','--format','json'])); await inside(() => run(['stop',name,'--format','json']));
        await expect(inside(() => run(['exec','-w','/home/agent/workspace/joe-project',name,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/home/agent','LANG=C.UTF-8','node','--test-reporter=tap','--test']))).rejects.toThrow('isolated_native_authority_expired');
        expect(calls).toHaveLength(3); expect(calls.every(call=>call.child.kill.mock.calls.length === 0)).toBe(true);
    });
    test('failed already-existing creation cannot adopt a matching foreign ID or stop it', async () => {
        const run = await open(); receive = () => complete('already exists',1);
        await inside(() => run(['create',`${storage}/joe-isolated-shell-kit-v1`,'--name',name,'--skills','off','--cpus','2','--memory','2g','--deny-network','**','--pull','missing','--no-progress']));
        await expect(inside(() => run(['stop',name,'--format','json']))).rejects.toThrow('isolated_native_route_rejected'); expect(calls).toHaveLength(1);
    });
    test('pending cancellation promise never kills and late terminal permits exact acknowledged guest cleanup only', async () => {
        let cancel!: () => void; context.cancellation = new Promise<void>(resolve => { cancel=resolve; });
        const run = await open(); await createAndBind(run); receive = () => undefined;
        let cleaned = false;
        const promise = inside(() => run(['exec','-w','/home/agent/workspace/joe-project',name,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/home/agent','LANG=C.UTF-8','node','--test-reporter=tap','--test'],'',1000,{
            onLateTerminal: async () => {
                receive = args => complete(args[0] === 'ls' ? JSON.stringify([{name,id,cpus:2,memory_mib:2048,status:'stopped'}]) : JSON.stringify([{name,id,action:'stopped'}]));
                await inside(() => run(['ls','--format','json'])); await inside(() => run(['stop',name,'--format','json'])); cleaned=true;
            },
        }));
        const rejection = expect(promise).rejects.toThrow('isolated_native_cancelled_pending_no_kill');
        await new Promise<void>(resolve=>setImmediate(resolve)); expect(calls).toHaveLength(3); const activeChild=child;
        cancelled=true; cancel(); await rejection; expect(activeChild.kill).not.toHaveBeenCalled();
        complete('# tests 1\n# fail 0\n'); await new Promise<void>(resolve=>setImmediate(resolve));
        expect(cleaned).toBe(true); expect(calls.map(call=>call.args[0])).toEqual(['create','ls','exec','ls','stop']);
        expect(calls[4].args).toEqual(['stop',name,'--format','json']); expect(calls.every(call=>call.child.kill.mock.calls.length===0)).toBe(true);
        const rows=fs.readdirSync(receipts).map(file=>JSON.parse(originalRead(path.join(receipts,file),'utf8')));
        expect(rows.some(row=>row.command==='exec' && row.status==='LATE_TERMINAL_NO_EXECUTION_RESUME' && row.pid===98765 && row.lateCleanup==='VERIFIED_OWNED_GUEST_STOPPED')).toBe(true);
        await expect(inside(() => run(['stop','foreign','--format','json']))).rejects.toThrow('isolated_native_route_rejected');
    });
    test('fixed guest program receives exact stdin, and receipts never store its source contents', async () => {
        const run = await open(); await createAndBind(run);
        const payload = '{"kind":"read","name":"math.mjs","fixture":"PRIVATE_SOURCE_MARKER"}'; let observed = '';
        receive = (_args,input) => { observed=input; complete('{"content":"safe"}'); };
        await inside(() => run(['exec','-i',name,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/home/agent','LANG=C.UTF-8','node','-e',ISOLATED_GUEST_FILE_PROGRAM],payload));
        expect(observed).toBe(payload);
        for (const file of fs.readdirSync(receipts)) expect(originalRead(path.join(receipts,file),'utf8')).not.toContain('PRIVATE_SOURCE_MARKER');
    });
    test('the actual boot integrity scanner rejects no execution path in the prospective source', () => {
        const main = 'D:/Joe/xelitesolutions', work = 'D:/Joe/coordination/worktrees/isolated-runner/xelitesolutions';
        jest.spyOn(fs,'readFileSync').mockImplementation((file:any,options:any) => {
            if (typeof file === 'string' && path.resolve(file) === path.resolve(main,'api/src/modules/services/IsolatedProjectRuntimeService.ts'))
                return originalRead(path.resolve(work,'api/src/modules/services/IsolatedProjectRuntimeService.ts'),options);
            return originalRead(file,options);
        });
        expect(ExecutionEnforcer.scanViolations()).not.toBeNull(); expect(ExecutionEnforcer.scanViolations()).toEqual([]);
    });
});
