import fs from 'fs';
import path from 'path';
import os from 'os';
import { issueEngineeringContext, sealEngineeringEvidence, issueEngineeringExecution, engineeringExecution, issueEngineeringTask, scopedEngineeringTool } from '../modules/services/AutonomousEngineeringPolicy';
import { IsolatedProjectRuntimeService, IsolatedNativeRunner, IsolatedAdmissionLedger } from '../modules/services/IsolatedProjectRuntimeService';

describe('isolated existing Node execution authority and physical delivery', () => {
    let root: string, context: any, evidence: any, cancelled: boolean;
    const modelBefore = process.env.LOCAL_LLM_MODEL;
    beforeEach(() => {
        process.env.LOCAL_LLM_MODEL = 'qwen2.5-coder:7b'; cancelled = false;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-isolated-test-'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test' } }));
        fs.writeFileSync(path.join(root, 'math.mjs'), 'export const add=(a,b)=>a-b;\n');
        fs.writeFileSync(path.join(root, 'math.test.mjs'), 'import {test} from "node:test";\n');
        context = issueEngineeringContext({ userId: 'owner-1', sessionId: 'session-1', workspaceId: 'workspace-1', runId: 'run-1',
            modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434' }, isCancelled: () => cancelled },
            { userId: 'owner-1', sessionId: 'session-1', workspaceId: 'workspace-1', runId: 'run-1', root, request: 'Fix addition and run its tests' }, () => cancelled);
        evidence = sealEngineeringEvidence(context, { mode: 'existing_workspace', constraints: { createsNewProject: false, readOnly: false },
            selectedProject: { root, projectKinds: ['node'], sourceFiles: ['math.mjs'], testFiles: ['math.test.mjs'] },
            sourceEvidence: { files: ['package.json', 'math.mjs', 'math.test.mjs'].map(name => ({ path: name, content: fs.readFileSync(path.join(root, name), 'utf8') })) } });
    });
    afterEach(() => { process.env.LOCAL_LLM_MODEL = modelBefore; });
    function plan() { return { phases: [{ name: 'Repair and verify', tasks: [
        { tool: 'file_edit', input: { path: 'math.mjs', find: 'a-b', replace: 'a+b' } },
        { tool: 'shell_execute', input: { command: 'npm test' } },
    ] }] }; }
    function runner(fail = false) {
        const calls: string[][] = [], files = new Map<string, string>(); let guestName = '', status = 'running';
        const native: IsolatedNativeRunner = async (args, stdin) => {
            calls.push([...args]); let stdout = '';
            if (args[0] === 'daemon') stdout = JSON.stringify({ status: 'running' });
            else if (args[0] === 'settings') stdout = args[2] === 'mcp.forceLocalGateway' ? 'true' : 'false';
            else if (args[0] === 'mcp') stdout = '[]';
            else if (args[0] === 'create') guestName = args[args.indexOf('--name') + 1];
            else if (args[0] === 'ls') stdout = JSON.stringify([{ name: guestName, id: '12345678-1234-1234-1234-123456789012', cpus: 2, memory_mib: 2048, status }]);
            else if (args[0] === 'policy') stdout = JSON.stringify({ rules: [{ scope: `sandbox:${guestName}`, status: 'active', decision: 'deny', resources: ['**'], actions: ['net:connect:tcp','net:connect:udp'] }] });
            else if (args[0] === 'stop') { status = 'stopped'; stdout = JSON.stringify([{ name: guestName, id: '12345678-1234-1234-1234-123456789012', action: 'stopped' }]); }
            else if (stdin) {
                const payload = JSON.parse(stdin);
                if (payload.kind === 'stage') { for (const file of payload.files) files.set(file.name, file.content); stdout = JSON.stringify({ staged: payload.files.length }); }
                else if (payload.kind === 'read') stdout = JSON.stringify({ content: files.get(payload.name) });
                else if (payload.kind === 'edit') { files.set(payload.name, payload.after); stdout = JSON.stringify({ edited: true }); }
            } else { stdout = fail ? '# tests 2\n# fail 1\n' : '# tests 2\n# fail 0\n'; return { exit: fail ? 1 : 0, stdout, stderr: '' }; }
            return { exit: 0, stdout, stderr: '' };
        };
        return { native, calls, files };
    }
    test('a planning token alone cannot admit phase or shell execution', () => {
        expect(scopedEngineeringTool('phase_executor', context)).toBe(false);
        expect(scopedEngineeringTool('shell_execute', context)).toBe(false);
    });
    test('foreign evidence, unsupported shell, edit-only phase and parallel work are rejected before runtime', () => {
        expect(() => issueEngineeringExecution(context, { ...evidence }, plan())).toThrow();
        const unsafe = plan(); unsafe.phases[0].tasks[1].input = { command: 'npm install' } as any;
        expect(() => issueEngineeringExecution(context, evidence, unsafe)).toThrow('isolated_test_command_not_admitted');
        const editOnly = plan(); editOnly.phases[0].tasks.pop();
        expect(() => issueEngineeringExecution(context, evidence, editOnly)).toThrow('isolated_phase_test_required');
    });
    test('sealed tasks cannot be replayed by another owner or supplied as cloned input', async () => {
        const leaseContext = issueEngineeringExecution(context, evidence, plan()), lease = engineeringExecution(leaseContext)!;
        const phase = lease.phases[0], task = phase.tasks[0];
        const fake = runner(), service = new IsolatedProjectRuntimeService(fake.native, false);
        expect((await service.execute(task.tool, { ...task.input }, issueEngineeringTask(leaseContext, phase, task))).ok).toBe(false);
        expect((await service.execute(task.tool, task.input, { ...issueEngineeringTask(leaseContext, phase, task), userId: 'another-owner' })).ok).toBe(false);
        expect(fake.calls).toHaveLength(0);
    });
    test('failed guest tests preserve the physical source and stop exactly the owned guest', async () => {
        const leaseContext = issueEngineeringExecution(context, evidence, plan()), phase = engineeringExecution(leaseContext)!.phases[0];
        const fake = runner(true), service = new IsolatedProjectRuntimeService(fake.native, false);
        const before = fs.readFileSync(path.join(root, 'math.mjs'), 'utf8');
        expect((await service.execute('file_edit', phase.tasks[0].input, issueEngineeringTask(leaseContext, phase, phase.tasks[0]))).ok).toBe(true);
        const result = await service.execute('shell_execute', phase.tasks[1].input, issueEngineeringTask(leaseContext, phase, phase.tasks[1]));
        expect(result.ok).toBe(false); expect(result.output.cleanup).toBe('owned_guest_stopped');
        expect(fs.readFileSync(path.join(root, 'math.mjs'), 'utf8')).toBe(before);
        expect(fake.calls.filter(call => call[0] === 'stop')).toHaveLength(1);
    });
    test('passing final tests promote only the planned source edit, then close the owned guest', async () => {
        const leaseContext = issueEngineeringExecution(context, evidence, plan()), phase = engineeringExecution(leaseContext)!.phases[0];
        const fake = runner(), service = new IsolatedProjectRuntimeService(fake.native, false);
        await service.execute('file_edit', phase.tasks[0].input, issueEngineeringTask(leaseContext, phase, phase.tasks[0]));
        const result = await service.execute('shell_execute', phase.tasks[1].input, issueEngineeringTask(leaseContext, phase, phase.tasks[1]));
        expect(result.ok).toBe(true); expect(fs.readFileSync(path.join(root, 'math.mjs'), 'utf8')).toContain('a+b');
        expect(result.output.files).toEqual([path.join(root, 'math.mjs')]);
        expect(result.output.transportSelectionObserved).toBe(false);
        expect(fake.calls.some(call => call.includes('--cloud') || call.includes('npm') || call.includes('add'))).toBe(false);
    });
    test('cancellation before the first task creates no native guest', async () => {
        const leaseContext = issueEngineeringExecution(context, evidence, plan()), phase = engineeringExecution(leaseContext)!.phases[0];
        const taskContext = issueEngineeringTask(leaseContext, phase, phase.tasks[0]); cancelled = true;
        const fake = runner(), service = new IsolatedProjectRuntimeService(fake.native, false);
        expect((await service.execute('file_edit', phase.tasks[0].input, taskContext)).ok).toBe(false);
        expect(fake.calls).toHaveLength(0);
    });
    test('a timed-out late successful creation may only be identified and stopped, never staged', async () => {
        const issued = issueEngineeringExecution(context, evidence, plan()), phase = engineeringExecution(issued)!.phases[0];
        const fake = runner(); let late: any, createdName = '';
        const pending: IsolatedNativeRunner = async (args, stdin, timeout, hooks) => {
            const result = await fake.native(args, stdin, timeout);
            if (args[0] === 'create') {
                createdName = args[args.indexOf('--name') + 1]; late = hooks?.onLateTerminal;
                hooks?.onPending?.(); throw Error('isolated_native_deadline_pending_no_kill');
            }
            return result;
        };
        const service = new IsolatedProjectRuntimeService(pending, false);
        expect((await service.execute('file_edit', phase.tasks[0].input, issueEngineeringTask(issued, phase, phase.tasks[0]))).ok).toBe(false);
        expect(fake.calls.filter(call => call[0] === 'stop')).toHaveLength(0);
        await late({ exit: 0, stdout: `Created sandbox ${createdName}`, stderr: '' });
        expect(fake.calls.filter(call => call[0] === 'stop')).toHaveLength(1);
        expect(fake.calls.filter(call => call[0] === 'exec')).toHaveLength(0);
    });
    test('changed source after planning cannot create a guest', async () => {
        const issued = issueEngineeringExecution(context, evidence, plan()), phase = engineeringExecution(issued)!.phases[0];
        fs.writeFileSync(path.join(root, 'math.mjs'), 'export const add=(a,b)=>a*b;\n');
        const fake = runner(), service = new IsolatedProjectRuntimeService(fake.native, false);
        const result = await service.execute('file_edit', phase.tasks[0].input, issueEngineeringTask(issued, phase, phase.tasks[0]));
        expect(result.ok).toBe(false); expect(result.error).toBe('isolated_planning_source_changed');
        expect(fake.calls.filter(call => call[0] === 'create')).toHaveLength(0);
    });
    test('successive staged edits use the current guest text while preserving the original host preimage', async () => {
        const p: any = plan(); p.phases[0].tasks.splice(1, 0, { tool: 'file_edit', input: { path: 'math.mjs', find: 'add', replace: 'sum' } });
        const issued = issueEngineeringExecution(context, evidence, p), phase = engineeringExecution(issued)!.phases[0];
        const fake = runner(), service = new IsolatedProjectRuntimeService(fake.native, false);
        for (const task of phase.tasks) expect((await service.execute(task.tool, task.input, issueEngineeringTask(issued, phase, task))).ok).toBe(true);
        expect(fs.readFileSync(path.join(root, 'math.mjs'), 'utf8')).toBe('export const sum=(a,b)=>a+b;\n');
    });
    test('an unfinished persisted prior run blocks a fresh adapter instance before all native calls', async () => {
        const ledger = new IsolatedAdmissionLedger(path.join(root, 'ledger'));
        ledger.admit('joe-run-1234-5678', { userId: 'lost', sessionId: 'lost', workspaceId: 'lost', runId: 'lost' });
        const issued = issueEngineeringExecution(context, evidence, plan()), phase = engineeringExecution(issued)!.phases[0];
        const fake = runner(), service = new IsolatedProjectRuntimeService(fake.native, false, ledger);
        const result = await service.execute('file_edit', phase.tasks[0].input, issueEngineeringTask(issued, phase, phase.tasks[0]));
        expect(result.ok).toBe(false); expect(result.error).toBe('isolated_unfinished_prior_run'); expect(fake.calls).toHaveLength(0);
    });
    test('a malformed MCP object with length zero is never treated as an empty catalog', async () => {
        const issued = issueEngineeringExecution(context, evidence, plan()), phase = engineeringExecution(issued)!.phases[0];
        const fake = runner(); const malformed: IsolatedNativeRunner = async (args, input, timeout) => args[0] === 'mcp'
            ? { exit: 0, stdout: '{"length":0}', stderr: '' } : fake.native(args, input, timeout);
        const service = new IsolatedProjectRuntimeService(malformed, false);
        expect((await service.execute('file_edit', phase.tasks[0].input, issueEngineeringTask(issued, phase, phase.tasks[0]))).ok).toBe(false);
        expect(fake.calls.filter(call => call[0] === 'create')).toHaveLength(0);
    });
    test('canonical planner metadata is accepted without admitting unknown grants or invoking metadata getters', () => {
        const p: any = plan();
        Object.assign(p.phases[0], { phaseNumber: 1, description: 'Repair existing addition', verificationTask: 'Run declared tests',
            deliverables: ['math.mjs'], estimatedTime: '1 minute', requirementsCovered: ['R1'] });
        for (const task of p.phases[0].tasks) Object.assign(task, { priority: 'high', realisticMinutes: 1 });
        expect(() => issueEngineeringExecution(context, evidence, p)).not.toThrow();
        p.phases[0].tasks[0].allowHostShell = true;
        expect(() => issueEngineeringExecution(context, evidence, p)).toThrow('invalid_engineering_input');
        delete p.phases[0].tasks[0].allowHostShell;
        const getter = jest.fn(() => '1 minute');
        Object.defineProperty(p.phases[0], 'estimatedTime', { enumerable: true, get: getter });
        expect(() => issueEngineeringExecution(context, evidence, p)).toThrow('invalid_engineering_input');
        expect(getter).not.toHaveBeenCalled();
    });
    test('phase budget counts only actual tasks: three phases and nine tasks pass while thirteen tasks fail', () => {
        const phase = () => ({ tasks: [{ tool: 'read_file', input: { path: 'math.mjs' } },
            { tool: 'file_edit', input: { path: 'math.mjs', find: 'a-b', replace: 'a+b' } },
            { tool: 'shell_execute', input: { command: 'npm test' } }] });
        expect(() => issueEngineeringExecution(context, evidence, { phases: [phase(), phase(), phase()] })).not.toThrow();
        const tooMany = phase();
        for (let n = 0; n < 10; n++) tooMany.tasks.unshift({ tool: 'read_file', input: { path: 'math.mjs' } } as typeof tooMany.tasks[number]);
        expect(() => issueEngineeringExecution(context, evidence, { phases: [tooMany] })).toThrow('isolated_plan_budget');
    });
    test.each(['.', '..', 'nested/..', 'nested', 'D:/not-this-owned-project'])('portable test cwd remains bound to the selected root: %s', async cwd => {
        const p: any = plan(); p.phases[0].tasks[1].input.cwd = cwd;
        const issued = issueEngineeringExecution(context, evidence, p), phase = engineeringExecution(issued)!.phases[0];
        const fake = runner(), service = new IsolatedProjectRuntimeService(fake.native, false);
        expect((await service.execute('file_edit', phase.tasks[0].input, issueEngineeringTask(issued, phase, phase.tasks[0]))).ok).toBe(true);
        const result = await service.execute('shell_execute', phase.tasks[1].input, issueEngineeringTask(issued, phase, phase.tasks[1]));
        expect(result.ok).toBe(cwd === '.');
        const checks = fake.calls.filter(call => call.includes('--test-reporter=tap'));
        if (cwd === '.') expect(checks[0].slice(0, 3)).toEqual(['exec', '-w', '/home/agent/workspace/joe-project']);
        else { expect(checks).toHaveLength(0); expect(fs.readFileSync(path.join(root, 'math.mjs'), 'utf8')).toContain('a-b'); }
    });
    test.each([undefined, 'Check the declared Node tests'])('canonical sanitizer enumerable verificationNote is inert metadata: %s', note => {
        // plan-tools.ts sanitisePlanPhases returns this key even when its value is undefined.
        const p: any = plan(); Object.assign(p.phases[0], {
            verificationTask: { task: 'Check tests', tool: 'shell_execute', args: { command: 'npm test' } }, verificationNote: note,
        });
        expect(Object.prototype.propertyIsEnumerable.call(p.phases[0], 'verificationNote')).toBe(true);
        expect(() => issueEngineeringExecution(context, evidence, p)).not.toThrow();
        p.phases[0].verificationGrant = { allowHostShell: true };
        expect(() => issueEngineeringExecution(context, evidence, p)).toThrow('invalid_engineering_input');
        delete p.phases[0].verificationGrant;
        const getter = jest.fn(() => note); Object.defineProperty(p.phases[0], 'verificationNote', { enumerable: true, get: getter });
        expect(() => issueEngineeringExecution(context, evidence, p)).toThrow('invalid_engineering_input');
        expect(getter).not.toHaveBeenCalled();
    });
});
