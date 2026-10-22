import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import { ISOLATED_GUEST_FILE_PROGRAM as FILE_PROGRAM, IsolatedNativeRunner } from '../../kernel/ExecutionEngine';
export type { IsolatedNativeRunner } from '../../kernel/ExecutionEngine';
import { engineeringExecution, engineeringExecutionTask, recheckEngineeringExecutionGateway } from './AutonomousEngineeringPolicy';
import { autonomousFileTextIsSafe, snapshotAutonomousFileInput, validateAutonomousFileOperation } from './AutonomousFilePolicy';
import { redactSecretsFromString } from '../../shared/utils/redaction';

const STORAGE = 'D:/AI/DockerSandboxes';
const CLI = 'C:/Users/home/AppData/Local/DockerSandboxes/bin/sbx.exe';
const KIT = `${STORAGE}/joe-isolated-shell-kit-v1`;
const CLI_HASH = '0d05cdb9e2480a59c4624a9e4135e3ac665495607533c659c8a13b9036e40986';
const KIT_HASH = 'ded3b28d7ef9e2a9ab699043d2c71f92dd6653649da783ae3d2298e48f40713e';
const IMAGE = 'sha256:5bbe8539825fe1cace6dda2fb66919ef819324d905bea2795b8516aee0198222';
const GUEST_ROOT = '/home/agent/workspace/joe-project';
const MAX_OUTPUT = 256 * 1024, MAX_TOTAL = 512 * 1024, MAX_FILES = 40;
type NativeResult = { exit: number; stdout: string; stderr: string };
type State = { name: string; id?: string; creationConfirmed: boolean; creationPending?: boolean; closed: boolean; active: () => boolean; root: string; originals: Map<string, string>; current: Map<string, string>; edited: Set<string>; testArgs: string[]; phase: number; run: IsolatedNativeRunner; failure?: any; cleanup?: Promise<void>; ledger?: string };

function hash(bytes: Buffer | string): string { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function safeRelative(value: unknown): string {
    if (typeof value !== 'string' || !value || value.length > 240 || /[\\\u0000-\u001f]/u.test(value)
        || path.posix.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..' || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/u.test(p))
        || /(?:^|\/)(?:\.env|\.git|\.ssh|node_modules|auth|credentials?|secrets?)(?:\.|\/|$)/iu.test(value)) throw Error('isolated_path_not_admitted');
    return value;
}
function checkedJSON(text: string): any { if (Buffer.byteLength(text) > MAX_OUTPUT) throw Error('isolated_output_limit'); return JSON.parse(text); }

/** Admission after process loss is deliberately fail-closed; it never adopts or stops a guest. */
export class IsolatedAdmissionLedger {
    private readonly directory: string;
    constructor(directory: string) {
        if (!path.isAbsolute(directory)) throw Error('isolated_ledger_path_invalid');
        this.directory = path.resolve(directory);
    }
    private checkRoot(): void {
        let cursor = path.parse(this.directory).root;
        for (const part of this.directory.slice(cursor.length).split(path.sep)) {
            cursor = path.join(cursor, part);
            let stat: fs.Stats;
            try { stat = fs.lstatSync(cursor); }
            catch (error: unknown) {
                if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') continue;
                throw error;
            }
            if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('isolated_ledger_link');
        }
        // Existing ancestors were checked before recursive creation can follow them.
        fs.mkdirSync(this.directory, { recursive: true });
        const directory = fs.lstatSync(this.directory);
        if (directory.isSymbolicLink() || !directory.isDirectory()) throw Error('isolated_ledger_link');
    }
    assertClear(): void {
        this.checkRoot(); const entries = fs.readdirSync(this.directory);
        if (entries.length > 128) throw Error('isolated_ledger_budget');
        for (const entry of entries) {
            if (!/^joe-run-[a-f0-9]+-[a-f0-9]+\.json$/u.test(entry)) throw Error('isolated_ledger_ambiguous');
            const file = path.join(this.directory, entry), stat = fs.lstatSync(file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) throw Error('isolated_ledger_ambiguous');
            let row: any; try { row = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw Error('isolated_ledger_ambiguous'); }
            if (row.version !== 1 || row.status !== 'verified_stopped' || !/^[a-f0-9-]{36}$/u.test(row.guestId || '')) throw Error('isolated_unfinished_prior_run');
        }
    }
    admit(name: string, owner: { userId: string; sessionId: string; workspaceId: string; runId: string }): string {
        this.assertClear();
        const file = path.join(this.directory, `${name}.json`);
        fs.writeFileSync(file, JSON.stringify({ version: 1, name, owner, guestId: null, status: 'create_pending', createdUTC: new Date().toISOString() }), { flag: 'wx' });
        return file;
    }
    update(file: string, name: string, id: string | undefined, stopped = false): void {
        this.checkRoot();
        if (path.dirname(file) !== this.directory || path.basename(file) !== `${name}.json`) throw Error('isolated_ledger_mismatch');
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 4096) throw Error('isolated_ledger_ambiguous');
        const row = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (row.version !== 1 || row.name !== name || (row.guestId && row.guestId !== id) || (stopped && !id)) throw Error('isolated_ledger_mismatch');
        fs.writeFileSync(file, JSON.stringify({ ...row, guestId: id || null, status: stopped ? 'verified_stopped' : 'guest_bound', updatedUTC: new Date().toISOString() }));
    }
}

function stagedEdit(before: string, input: any): string {
    if (typeof before !== 'string' || Buffer.byteLength(before) > 128 * 1024 || !autonomousFileTextIsSafe(before)) throw Error('isolated_staged_text_invalid');
    const crlf = (before.match(/\r\n/g) || []).length, lf = (before.match(/(?<!\r)\n/g) || []).length;
    const newline = crlf > lf ? '\r\n' : '\n';
    const find = input.find.replace(/\r\n|\r|\n/g, newline), replace = input.replace.replace(/\r\n|\r|\n/g, newline);
    const offset = before.indexOf(find);
    if (!find || offset < 0 || before.indexOf(find, offset + 1) >= 0) throw Error('isolated_staged_edit_ambiguous');
    const after = before.slice(0, offset) + replace + before.slice(offset + find.length);
    if (Buffer.byteLength(after) > 128 * 1024 || !autonomousFileTextIsSafe(after)) throw Error('isolated_staged_edit_sensitive');
    return after;
}

export class IsolatedProjectRuntimeService {
    private readonly states = new WeakMap<object, State>();
    // Dependency injection is server/test construction only, never tool input.
    constructor(private readonly run?: IsolatedNativeRunner, private readonly native = true,
        private readonly ledger = native ? new IsolatedAdmissionLedger(`${STORAGE}/run-ledger`) : undefined) {}

    private async authorization(context: any, state?: State): Promise<void> {
        if (!engineeringExecution(context) || state?.closed || state && !state.active()) throw Error('isolated_cancelled');
        const allowed = await recheckEngineeringExecutionGateway(context);
        if (allowed === false || (allowed === null && this.native)) throw Error('isolated_gateway_access_changed');
        if (!engineeringExecution(context) || state?.closed || state && !state.active()) throw Error('isolated_cancelled');
    }

    private async call(args: string[], stdin = '', timeout = 30_000, state?: State, runner?: IsolatedNativeRunner): Promise<NativeResult> {
        if (args.includes('--cloud') || args.includes('--debug')) throw Error('isolated_native_route_rejected');
        const run = runner || state?.run || this.run;
        if (!run) throw Error('isolated_native_authority_required');
        const result = await run(Object.freeze(args), stdin, timeout, state ? {
            onPending: () => { state.closed = true; if (args[0] === 'create') state.creationPending = true; },
            onLateTerminal: result => {
                if (args[0] === 'create' && state.creationPending && result.exit === 0
                    && result.stdout.includes(`Created sandbox ${state.name}`)) {
                    state.creationConfirmed = true;
                    // A late creation may only be identified and stopped, never staged or executed.
                    return this.owned(state).then(() => this.stop(state));
                }
            },
        } : undefined);
        if (!Number.isInteger(result.exit) || Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr) > MAX_OUTPUT) throw Error('isolated_native_result_invalid');
        return result;
    }

    private async requireZero(args: string[], stdin = '', timeout = 30_000, state?: State, runner?: IsolatedNativeRunner): Promise<NativeResult> {
        const result = await this.call(args, stdin, timeout, state, runner);
        if (result.exit !== 0) throw Error(`isolated_native_failed:${args[0]}:${result.exit}`);
        return result;
    }

    private async owned(state: State): Promise<any> {
        if (!state.creationConfirmed) throw Error('isolated_creation_unconfirmed_no_adoption');
        const rows = checkedJSON((await this.requireZero(['ls','--format','json'], '', 30_000, state)).stdout);
        if (!Array.isArray(rows)) throw Error('isolated_inventory_invalid');
        const candidates = rows.filter(row => row.name === state.name);
        if (candidates.length !== 1 || !/^[a-f0-9-]{36}$/u.test(candidates[0].id) || candidates[0].cpus !== 2 || candidates[0].memory_mib !== 2048
            || (state.id && candidates[0].id !== state.id)) throw Error('isolated_guest_identity_changed');
        if (!state.id) {
            state.id = candidates[0].id;
            if (state.ledger) this.ledger!.update(state.ledger, state.name, state.id);
        }
        return candidates[0];
    }

    private async stop(state: State): Promise<void> {
        if (!state.creationConfirmed || !state.id) throw Error('isolated_creation_unconfirmed_no_stop');
        if (state.cleanup) return state.cleanup;
        state.cleanup = this.stopOwned(state);
        return state.cleanup;
    }

    private async stopOwned(state: State): Promise<void> {
        state.closed = true;
        const before = await this.owned(state);
        if (before.status !== 'stopped') {
            const result = checkedJSON((await this.requireZero(['stop',state.name,'--format','json'], '', 30_000, state)).stdout);
            if (!Array.isArray(result) || result.length !== 1 || result[0].name !== state.name || result[0].id !== state.id || result[0].action !== 'stopped') throw Error('isolated_stop_unverified');
        }
        if ((await this.owned(state)).status !== 'stopped') throw Error('isolated_stop_unverified');
        if (state.ledger) this.ledger!.update(state.ledger, state.name, state.id, true);
    }

    private async file(state: State, payload: any): Promise<any> {
        if (state.closed || !state.active()) throw Error('isolated_cancelled');
        await this.owned(state);
        if (state.closed || !state.active()) throw Error('isolated_cancelled');
        const result = await this.requireZero(['exec','-i',state.name,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/home/agent','LANG=C.UTF-8',
            'node','-e',FILE_PROGRAM], JSON.stringify(payload), 30_000, state);
        if (state.closed || !state.active()) throw Error('isolated_cancelled');
        return checkedJSON(result.stdout);
    }

    private async prepare(context: any): Promise<State> {
        const lease = engineeringExecution(context);
        if (!lease) throw Error('isolated_execution_authority_required');
        this.ledger?.assertClear();
        await this.authorization(context);
        const name = `joe-run-${hash(`${lease.scope.userId}/${lease.scope.workspaceId}/${lease.scope.runId}`).slice(0,12)}-${crypto.randomBytes(4).toString('hex')}`;
        const run = this.run || await ExecutionGateway.openIsolatedNative(context, name);
        const active = () => engineeringExecution(context)?.token === lease.token;
        const checkActive = () => { if (!active()) throw Error('isolated_cancelled'); };
        if (this.native) {
            if (process.platform !== 'win32' || hash(fs.readFileSync(CLI)) !== CLI_HASH || hash(fs.readFileSync(`${KIT}/spec.yaml`)) !== KIT_HASH
                || os.freemem() < 3 * 1024 ** 3 || fs.lstatSync(STORAGE).isSymbolicLink()) throw Error('isolated_runtime_resources_or_pin');
            const disk = fs.statfsSync(STORAGE); if (Number(disk.bavail) * Number(disk.bsize) < 10 * 1024 ** 3) throw Error('isolated_disk_pressure');
        }
        const daemon = checkedJSON((await this.requireZero(['daemon','status','--format','json'], '', 30_000, undefined, run)).stdout);
        checkActive();
        if (daemon.status !== 'running') throw Error('isolated_daemon_not_running');
        const local = await this.requireZero(['settings','get','mcp.forceLocalGateway'], '', 30_000, undefined, run); checkActive();
        const ssh = await this.requireZero(['settings','get','ssh.agentForwardingEnabled'], '', 30_000, undefined, run); checkActive();
        const catalog = await this.requireZero(['mcp','ls','--format','json'], '', 30_000, undefined, run); checkActive();
        const servers = checkedJSON(catalog.stdout);
        if (local.stdout.trim() !== 'true' || ssh.stdout.trim() !== 'false' || !Array.isArray(servers) || servers.length !== 0) throw Error('isolated_host_integration_not_admitted');
        const evidence = lease.evidence.selectedProject;
        const names = [...new Set<string>(['package.json', ...(evidence.sourceFiles || []), ...(evidence.testFiles || [])])];
        if (!evidence.testFiles?.length || names.length > MAX_FILES) throw Error('isolated_source_budget_or_tests_missing');
        const originals = new Map<string, string>(); let bytes = 0;
        for (const raw of names) {
            const name = safeRelative(raw);
            const args = snapshotAutonomousFileInput('read_file', { path: name });
            const checked = validateAutonomousFileOperation('read_file', args, lease.scope.root, process.cwd());
            const before = fs.lstatSync(checked.path);
            const fd = fs.openSync(checked.path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
            let content: string;
            try {
                const actual = fs.fstatSync(fd);
                if (!actual.isFile() || actual.nlink !== 1 || actual.size > 128 * 1024 || actual.ino !== before.ino || actual.dev !== before.dev) throw Error('isolated_source_changed');
                const bytes = fs.readFileSync(fd); content = bytes.toString('utf8');
                if (!Buffer.from(content, 'utf8').equals(bytes)) throw Error('isolated_source_binary');
            } finally { fs.closeSync(fd); }
            if (!autonomousFileTextIsSafe(content) || (bytes += Buffer.byteLength(content)) > MAX_TOTAL) throw Error('isolated_source_not_admitted');
            const plannedSource = lease.evidence.sourceEvidence?.files?.find((source: any) => source.path === name);
            if (!plannedSource || plannedSource.content !== content) throw Error('isolated_planning_source_changed');
            originals.set(name, content);
        }
        const manifest = checkedJSON(originals.get('package.json')!);
        if (Object.keys(manifest.dependencies || {}).length || Object.keys(manifest.devDependencies || {}).length) throw Error('isolated_dependencies_unavailable');
        const script = manifest.scripts?.test;
        if (typeof script !== 'string' || !/^node --test(?: [A-Za-z0-9_./-]+)*$/u.test(script)) throw Error('isolated_declared_test_not_supported');
        const testArgs = script.split(' ').slice(1);
        for (const target of testArgs.slice(1)) if (!originals.has(safeRelative(target))) throw Error('isolated_test_target_unstaged');
        if (!engineeringExecution(context)) throw Error('isolated_cancelled');
        const state: State = { name, run,
            root: lease.scope.root, originals, current: new Map(originals), edited: new Set(), testArgs, closed: false, active, creationConfirmed: false, phase: 0 };
        this.states.set(lease.token, state);
        state.ledger = this.ledger?.admit(state.name, { userId: lease.scope.userId, sessionId: lease.scope.sessionId, workspaceId: lease.scope.workspaceId, runId: lease.scope.runId });
        if (context.cancellation && typeof context.cancellation.then === 'function') {
            void context.cancellation.then(() => { state.closed = true; if (state.id) void this.stop(state).catch(() => undefined); });
        }
        checkActive();
        await this.authorization(context, state);
        const beforeCreation = checkedJSON((await this.requireZero(['ls','--format','json'], '', 30_000, state)).stdout); checkActive();
        if (!Array.isArray(beforeCreation) || beforeCreation.some((row: any) => row.name === state.name)) throw Error('isolated_creation_name_conflict');
        const created = await this.requireZero(['create',KIT,'--name',state.name,'--skills','off','--cpus','2','--memory','2g','--deny-network','**','--pull','missing','--no-progress'], '', 180_000, state);
        if (this.native && !created.stdout.includes(`Created sandbox ${state.name}`)) throw Error('isolated_creation_unconfirmed');
        state.creationConfirmed = true;
        await this.owned(state);
        if (state.closed || !engineeringExecution(context)) throw Error('isolated_cancelled');
        const policy = checkedJSON((await this.requireZero(['policy','ls',state.name,'--type','network','--format','json'], '', 30_000, state)).stdout);
        checkActive();
        if (!policy.rules?.some((r: any) => r.status === 'active' && r.decision === 'deny' && r.scope === `sandbox:${state.name}`
            && r.resources?.includes('**') && r.actions?.includes('net:connect:tcp') && r.actions?.includes('net:connect:udp'))) throw Error('isolated_network_policy_missing');
        await this.file(state, { kind: 'stage', files: [...originals].map(([name, content]) => ({ name, content })) });
        return state;
    }

    private async promote(state: State, context: any): Promise<string[]> {
        await this.authorization(context, state);
        const prepared: Array<{ target: string; before: string; after: string }> = [];
        for (const name of state.edited) {
            if (!engineeringExecution(context)) throw Error('isolated_cancelled');
            const after = (await this.file(state, { kind: 'read', name })).content;
            await this.authorization(context, state);
            if (typeof after !== 'string' || Buffer.byteLength(after) > 128 * 1024 || !autonomousFileTextIsSafe(after)) throw Error('isolated_export_not_admitted');
            if (after !== state.current.get(name)) throw Error('isolated_export_unplanned_change');
            const before = state.originals.get(name)!;
            const checked = validateAutonomousFileOperation('file_edit', snapshotAutonomousFileInput('file_edit', { path: name, find: before, replace: after }), state.root, process.cwd(), before);
            prepared.push({ target: checked.path, before, after });
        }
        await this.authorization(context, state);
        if (this.native && prepared.length) {
            // Preserve exact original bytes in this run's private D receipt before publication.
            const backup = path.join(STORAGE, 'run-receipts', state.name);
            if (fs.existsSync(backup)) throw Error('isolated_export_receipt_exists');
            fs.mkdirSync(backup, { recursive: true });
            for (let index = 0; index < prepared.length; index++) fs.writeFileSync(path.join(backup, `${index}.before.txt`), prepared[index].before, { flag: 'wx' });
            fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ guestId: state.id,
                files: prepared.map((edit, index) => ({ path: path.relative(state.root, edit.target), before: `${index}.before.txt`, sha256: hash(edit.before) })) }), { flag: 'wx' });
        }
        // No await between final physical preimage checks and descriptor writes.
        const descriptors: Array<{ fd: number; edit: typeof prepared[number] }> = [];
        try {
            for (const edit of prepared) {
                const fd = fs.openSync(edit.target, fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW ?? 0));
                descriptors.push({ fd, edit });
                const stat = fs.fstatSync(fd);
                if (!stat.isFile() || stat.nlink !== 1 || fs.readFileSync(fd, 'utf8') !== edit.before) throw Error('isolated_export_preimage_changed');
            }
            for (const { fd, edit } of descriptors) { fs.writeSync(fd, edit.after, 0, 'utf8'); fs.ftruncateSync(fd, Buffer.byteLength(edit.after)); }
        } finally { for (const { fd } of descriptors) fs.closeSync(fd); }
        return prepared.map(edit => edit.target);
    }

    async execute(name: string, input: any, context: any): Promise<any> {
        const lease = engineeringExecution(context), task = engineeringExecutionTask(name, context);
        if (!lease || !task || input !== task.input) return { ok: false, error: 'isolated_task_authority_required', output: { status: 'failed' }, logs: [] };
        let state = this.states.get(lease.token);
        try {
            state = state || await this.prepare(context);
            await this.authorization(context, state);
            if (state.closed || !engineeringExecution(context)) throw Error('isolated_run_closed_or_cancelled');
            const target = name === 'shell_execute' ? undefined : safeRelative(path.isAbsolute(input.path) ? path.relative(state.root, input.path).split(path.sep).join('/') : input.path);
            if (target && !state.originals.has(target)) throw Error('isolated_file_unstaged');
            if (name === 'read_file') {
                const content = (await this.file(state, { kind: 'read', name: target })).content;
                await this.authorization(context, state);
                if (!autonomousFileTextIsSafe(content)) throw Error('isolated_sensitive_result');
                return { ok: true, output: { status: 'completed', content }, logs: [] };
            }
            if (name === 'file_edit') {
                const before = (await this.file(state, { kind: 'read', name: target })).content;
                await this.authorization(context, state);
                if (before !== state.current.get(target!)) throw Error('isolated_edit_preimage_changed');
                const after = stagedEdit(before, input);
                await this.file(state, { kind: 'edit', name: target, before, after }); state.edited.add(target!); state.current.set(target!, after);
                return { ok: true, output: { status: 'completed', guestFile: target, promoted: false }, logs: [] };
            }
            if (name !== 'shell_execute' || input.cwd !== undefined && (typeof input.cwd !== 'string' || !input.cwd.trim()
                || /[\u0000-\u001f\u007f]/u.test(input.cwd) || /^[\\/]{2}/u.test(input.cwd)
                || input.cwd.replace(/\\/g, '/').split('/').includes('..') || path.resolve(state.root, input.cwd) !== state.root))
                throw Error('isolated_command_not_admitted');
            await this.owned(state);
            if (state.closed || !state.active()) throw Error('isolated_cancelled');
            const result = await this.call(['exec','-w',GUEST_ROOT,state.name,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/home/agent','LANG=C.UTF-8',
                'node','--test-reporter=tap',...state.testArgs], '', 60_000, state);
            await this.authorization(context, state);
            if (!engineeringExecution(context)) throw Error('isolated_cancelled');
            const counts = { tests: Number(result.stdout.match(/^# tests (\d+)$/mu)?.[1] || 0), fail: Number(result.stdout.match(/^# fail (\d+)$/mu)?.[1] ?? -1) };
            if (result.exit !== 0 || counts.tests < 1 || counts.fail !== 0) {
                state.failure = { stdout: redactSecretsFromString(result.stdout), stderr: redactSecretsFromString(result.stderr), tests: counts, exitCode: result.exit };
                throw Error('isolated_declared_tests_failed');
            }
            state.phase++;
            const files = state.phase === lease.phases.length ? await this.promote(state, context) : [];
            if (state.phase === lease.phases.length) await this.stop(state);
            return { ok: true, output: { status: 'completed', exitCode: result.exit, tests: counts, stdout: redactSecretsFromString(result.stdout),
                files, guestId: state.id, runtime: 'local_mountless_sbx', image: IMAGE, transportSelectionObserved: false }, logs: [] };
        } catch (error: any) {
            state = state || this.states.get(lease.token);
            let cleanup = 'not_created';
            if (state) { try { await this.stop(state); cleanup = 'owned_guest_stopped'; } catch { cleanup = 'owned_guest_cleanup_unverified'; } }
            return { ok: false, error: String(error?.message || 'isolated_runtime_failed'), output: { ...state?.failure, status: 'failed', cleanup, executed: !!state?.id }, logs: [] };
        }
    }
}

export const isolatedProjectRuntime = new IsolatedProjectRuntimeService();
