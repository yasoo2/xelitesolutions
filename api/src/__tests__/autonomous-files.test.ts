/** Actual ToolService/firewall/identity and file leaves; controlled storage and inert external edges. */
export {};
const nativeFs = jest.requireActual('fs') as typeof import('fs');
const nativePath = jest.requireActual('path') as typeof import('path');
const SID = '111111111111111111111111', UID = 'synthetic-owner', WS = '222222222222222222222222';
const ctx = () => ({ sessionId: SID, userId: UID, workspaceId: WS });

describe('bounded autonomous workspace files', () => {
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
        const leaves = [new WriteFileTool(), new SafeReadFileTool(), new FileEditTool()];
        const executions = leaves.map(tool => jest.spyOn(tool, 'execute'));
        mock('../modules/tools/registry', { tools: leaves });
        const { executeTool } = require('../modules/services/ToolService');
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const invoke = (name: string, input: any, context: any = ctx(), owner: any = { userId: UID, sessionId: SID }) =>
            executionFirewall.runInContext(undefined, () => executeTool(name, input, context), owner);
        return { root, events, trace, roots, executions, invoke, selectRoot: (p: string) => { selectedRoot = p; } };
    }
    test('creates and reads the real file without approval flags and scopes emitted content', async () => {
        const f = fixture();
        const write = await f.invoke('write_file', { path: 'notes/result.txt', filename: 'notes/result.txt', content: 'A useful result' });
        expect(write.ok).toBe(true);
        expect(nativeFs.readFileSync(nativePath.join(f.root, 'notes/result.txt'), 'utf8')).toBe('A useful result');
        const read = await f.invoke('read_file', { path: 'notes/result.txt' });
        expect(read).toMatchObject({ ok: true, output: { content: 'A useful result', totalLines: 1 } });
        expect(f.roots.length).toBeGreaterThan(1); expect(f.roots.every(id => id === WS)).toBe(true);
        expect(f.events.mock.calls.filter(([e]) => e.type === 'diff' || e.type === 'file_stream').every(([e]) => e.sessionId === SID)).toBe(true);
    });
    test.each([
        ['Read the file reports/status.json and report its exact content.', 'reports/status.json', '{"ready":true}'],
        ['اقرأ الملف نتيجة.txt واعرض محتواه', 'نتيجة.txt', 'محتوى فعلي محفوظ'],
        ['Please read the file "notes/team.txt" and show its contents.', 'notes/team.txt', 'Existing notes'],
    ])('actual parser/planner read crosses the gateway: %s', async (goal, file, content) => {
        const f = fixture(), forbidden = () => { throw new Error('Unexpected planning effect'); };
        jest.doMock('../core/llm/intelligent-router', () => ({ routeToModel: forbidden, default: forbidden }));
        jest.doMock('../core/llm/context-engine', () => ({ analyzeContextualIntent: forbidden, buildConversationContext: forbidden }));
        jest.doMock('../core/orchestrator/toolCatalog', () => ({ catalogueFor: forbidden, capabilityRoute: forbidden, inputForTool: forbidden, registeredToolNames: [] }));
        jest.doMock('../core/orchestrator/history-compact', () => ({ compactHistoryForPrompt: forbidden }));
        jest.doMock('../core/orchestrator/workspace-evidence', () => ({ enrichWorkspaceToolInput: forbidden }));
        jest.doMock('../core/orchestrator/active-built-project', () => ({ findActiveBuiltProject: forbidden }));
        jest.doMock('../core/api-discovery/integration', () => ({ capabilityFromRequest: forbidden, capabilityFamilyFromRequest: () => null }));
        jest.doMock('../core/capabilities/decision-profiles', () => ({ capabilityFamilyFromRequest: () => null }));
        jest.doMock('../core/orchestrator/capability-match', () => ({ capableTools: forbidden }));
        jest.doMock('../core/orchestrator/adaptive-dag-planner', () => ({ diagnoseFailure: forbidden, detectParallelGroups: forbidden, generatePlanAttempts: forbidden, selectBestPlan: forbidden, validatePlan: forbidden }));
        const target = nativePath.join(f.root, file);
        nativeFs.mkdirSync(nativePath.dirname(target), { recursive: true });
        nativeFs.writeFileSync(target, content);
        const { IntentParser } = require('../core/intelligence/IntentParser');
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        const intent = await IntentParser.parse(goal, {});
        const plan = await PlanningEngine.generatePlan({ intent });
        expect(plan.metadata.matchedBy).toBe('explicit-read-file-contract');
        expect(plan.steps).toHaveLength(1);
        const step = plan.steps[0];
        expect(step.tool).toBe('read_file');
        expect(Object.prototype.hasOwnProperty.call(step.input, 'expectedMarker')).toBe(true);
        const result = await f.invoke(step.tool, step.input);
        expect(result).toMatchObject({ ok: true, output: { content, totalLines: 1 } });
        expect(f.executions[0]).not.toHaveBeenCalled();
        expect(f.executions[1]).toHaveBeenCalledTimes(1);
        expect(f.executions[1].mock.calls[0][0]).not.toHaveProperty('expectedMarker');
        expect(nativeFs.readFileSync(target, 'utf8')).toBe(content);
    });
    test.each([undefined, 'verified marker'])('read-only marker metadata is inert: %s', async expectedMarker => {
        const f = fixture(), target = nativePath.join(f.root, 'read.txt');
        nativeFs.writeFileSync(target, 'verified marker');
        expect(await f.invoke('read_file', { path: 'read.txt', expectedMarker })).toMatchObject({ ok: true, output: { content: 'verified marker' } });
        expect(f.executions[1].mock.calls[0][0]).not.toHaveProperty('expectedMarker');
        expect(nativeFs.readFileSync(target, 'utf8')).toBe('verified marker');
    });
    test.each([{}, 1, true, 'x'.repeat(1025), 'password=verylongvalue', 'sk-synthetic123456789012345'])
    ('unsafe marker metadata fails before identity lookup, events and IO: %s', async expectedMarker => {
        const lookup = jest.fn(async () => ({ userId: UID, workspaceId: WS }));
        const f = fixture({ lookup });
        expect(await f.invoke('read_file', { path: 'read.txt', expectedMarker })).toMatchObject({ ok: false, error: 'policy_blocked' });
        expect(lookup).not.toHaveBeenCalled(); expect(f.roots).toEqual([]);
        expect(f.events).not.toHaveBeenCalled(); expect(f.trace).not.toHaveBeenCalled();
        expect(f.executions.every(s => s.mock.calls.length === 0)).toBe(true);
    });
    test('marker accessor is never evaluated', async () => {
        const f = fixture(), getter = jest.fn(() => 'safe');
        const input = { path: 'read.txt' };
        Object.defineProperty(input, 'expectedMarker', { enumerable: true, get: getter });
        expect((await f.invoke('read_file', input)).ok).toBe(false);
        expect(getter).not.toHaveBeenCalled(); expect(f.roots).toEqual([]); expect(f.events).not.toHaveBeenCalled();
    });
    test('marker does not grant write or unknown-field authority', async () => {
        const f = fixture();
        expect((await f.invoke('write_file', { path: 'read.txt', content: 'x', expectedMarker: undefined })).ok).toBe(false);
        expect((await f.invoke('read_file', { path: 'read.txt', expectedMarker: undefined, bypass: true })).ok).toBe(false);
        expect(f.roots).toEqual([]); expect(f.events).not.toHaveBeenCalled();
        expect(nativeFs.readdirSync(f.root)).toEqual([]);
    });
    test('append preserves prior bytes and idempotent append does not duplicate', async () => {
        const f = fixture(), file = nativePath.join(f.root, 'list.txt'); nativeFs.writeFileSync(file, 'one\r\n');
        const input = { path: 'list.txt', content: 'two', mode: 'append', ensureSingleAppend: true, expectedFinalLineCount: 2 };
        expect((await f.invoke('write_file', input)).ok).toBe(true);
        expect((await f.invoke('write_file', input)).ok).toBe(true);
        expect(nativeFs.readFileSync(file, 'utf8')).toBe('one\r\ntwo');
    });
    test.each(['read_file', 'write_file'])('%s rejects foreign owner before filesystem lookup or events', async name => {
        const f = fixture(); const result = await f.invoke(name, { path: 'file.txt', content: name === 'write_file' ? 'x' : undefined }, { ...ctx(), userId: 'foreign' });
        expect(result.ok).toBe(false); expect(f.roots).toEqual([]); expect(f.events).not.toHaveBeenCalled();
    });
    test.each(['../escape.txt', '..\\escape.txt', '/outside.txt', '\\\\server\\share\\file.txt', '.env', '.env.local', '.git/config',
        '.ssh/id_rsa', 'secrets.json', 'credentials.json', 'auth.json', 'private.pem', 'file.txt:stream', 'con.txt', 'foo./x.txt', 'foo /x.txt', '.joe-history/item'])
    ('rejects %s before events or leaf work', async target => {
        const f = fixture(); const result = await f.invoke('write_file', { path: target, content: 'text' }, { ...ctx(), traceId: 'trace' });
        expect(result.ok).toBe(false); expect(result.error).toBe('policy_blocked');
        expect(f.events).not.toHaveBeenCalled(); expect(f.trace).not.toHaveBeenCalled(); expect(f.executions.every(s => s.mock.calls.length === 0)).toBe(true);
    });
    test.each(['write_file', 'read_file'])('%s refuses a directory target', async name => {
        const f = fixture(); nativeFs.mkdirSync(nativePath.join(f.root, 'folder'));
        const result = await f.invoke(name, { path: 'folder', ...(name === 'write_file' ? { content: 'text' } : {}) });
        expect(result.ok).toBe(false); expect(f.events).not.toHaveBeenCalled();
    });
    test('never overwrites existing work', async () => {
        const f = fixture(), file = nativePath.join(f.root, 'work.txt'); nativeFs.writeFileSync(file, 'uncommitted original');
        const result = await f.invoke('write_file', { path: 'work.txt', content: 'replacement' });
        expect(result).toMatchObject({ ok: false, output: { reason: 'existing_file_preserved' } });
        expect(nativeFs.readFileSync(file, 'utf8')).toBe('uncommitted original'); expect(f.events).not.toHaveBeenCalled();
    });
    test('viewer can read but cannot create or append', async () => {
        const f = fixture({ access: async write => !write }); nativeFs.writeFileSync(nativePath.join(f.root, 'x.txt'), 'original');
        expect((await f.invoke('read_file', { path: 'x.txt' })).ok).toBe(true);
        expect(await f.invoke('write_file', { path: 'new.txt', content: 'x' })).toMatchObject({ ok: false, output: { reason: 'workspace_permission_denied' } });
        expect((await f.invoke('write_file', { path: 'x.txt', content: 'x', mode: 'append' })).ok).toBe(false);
        expect(nativeFs.readFileSync(nativePath.join(f.root, 'x.txt'), 'utf8')).toBe('original');
    });
    test('cancellation during permission lookup stops before root resolution', async () => {
        let cancelled = false; const f = fixture({ access: async () => { cancelled = true; return true; } });
        const result = await f.invoke('write_file', { path: 'x.txt', content: 'x' }, { ...ctx(), isCancelled: () => cancelled });
        expect(result.ok).toBe(false); expect(f.roots).toEqual([]); expect(f.events).not.toHaveBeenCalled();
    });
    test.each(['read_file', 'write_file'])('%s rejects linked files and parents', async name => {
        const f = fixture(), outside = nativeFs.mkdtempSync(nativePath.join(originalEnv.JOE_FILE_TEST_ROOT!, 'foreign-'));
        nativeFs.writeFileSync(nativePath.join(outside, 'file.txt'), 'foreign content');
        nativeFs.symlinkSync(outside, nativePath.join(f.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
        const result = await f.invoke(name, { path: 'link/file.txt', ...(name === 'write_file' ? { mode: 'append', content: 'x' } : {}) });
        expect(result).toMatchObject({ ok: false, output: { reason: 'linked_file_path' } });
        expect(nativeFs.readFileSync(nativePath.join(outside, 'file.txt'), 'utf8')).toBe('foreign content'); expect(f.events).not.toHaveBeenCalled();
    });
    test('hard links are denied', async () => {
        const f = fixture(), file = nativePath.join(f.root, 'file.txt'); nativeFs.writeFileSync(file, 'data');
        nativeFs.linkSync(file, nativePath.join(f.root, 'alias.txt'));
        expect((await f.invoke('read_file', { path: 'alias.txt' })).ok).toBe(false);
    });
    test.each(['password=verylongvalue', 'sk-synthetic123456789012345', '-----BEGIN PRIVATE KEY-----'])
    ('sensitive content stays out of events and disk: %s', async secret => {
        const f = fixture(); const result = await f.invoke('write_file', { path: 'normal.txt', content: secret }, { ...ctx(), traceId: 'trace' });
        expect(result.ok).toBe(false); expect(f.events).not.toHaveBeenCalled(); expect(f.trace).not.toHaveBeenCalled(); expect(nativeFs.readdirSync(f.root)).toEqual([]);
    });
    test.each([Buffer.from([0xff, 0xfe]), Buffer.from('password=verylongvalue'), Buffer.alloc(131073, 'a')])
    ('existing binary, sensitive or oversized files cannot be read or appended', async bytes => {
        const f = fixture(); nativeFs.writeFileSync(nativePath.join(f.root, 'data.txt'), bytes);
        expect((await f.invoke('read_file', { path: 'data.txt' })).ok).toBe(false);
        expect((await f.invoke('write_file', { path: 'data.txt', content: 'x', mode: 'append' })).ok).toBe(false);
        expect(f.events).not.toHaveBeenCalled(); expect(nativeFs.readFileSync(nativePath.join(f.root, 'data.txt'))).toEqual(bytes);
    });
    test.each(['nvapi-', 'gsk_', 'AIza'])('standalone %s credential shape is refused for write, read and append', async prefix => {
        const f = fixture(), content = prefix + 'synthetic'.repeat(8), file = nativePath.join(f.root, 'data.txt');
        expect((await f.invoke('write_file', { path: 'new.txt', content }, { ...ctx(), traceId: 'trace' })).ok).toBe(false);
        nativeFs.writeFileSync(file, content);
        expect((await f.invoke('read_file', { path: 'data.txt' }, { ...ctx(), traceId: 'trace' })).ok).toBe(false);
        expect((await f.invoke('write_file', { path: 'data.txt', content: 'x', mode: 'append' }, { ...ctx(), traceId: 'trace' })).ok).toBe(false);
        expect(f.events).not.toHaveBeenCalled(); expect(f.trace).not.toHaveBeenCalled();
        expect(f.executions.every(s => s.mock.calls.length === 0)).toBe(true);
        expect(nativeFs.readFileSync(file, 'utf8')).toBe(content); expect(nativeFs.existsSync(nativePath.join(f.root, 'new.txt'))).toBe(false);
    });
    test.each([{ path: 'x', filename: 'y', content: 'x' }, { path: 'x', content: {}, }, { path: 'x', content: 'x', mode: 'delete' },
        { path: 'x', content: 'x', ensureSingleAppend: 'yes' }, { path: 'x', content: 'x', command: 'unsafe' }, { path: 'x', content: 'a'.repeat(131073) }])
    ('malformed write input fails closed', async input => { const f = fixture(); expect((await f.invoke('write_file', input)).ok).toBe(false); expect(f.events).not.toHaveBeenCalled(); });
    test('input accessors are not invoked', async () => {
        const f = fixture(), getter = jest.fn(() => 'unsafe');
        const input = { path: 'x.txt' }; Object.defineProperty(input, 'content', { enumerable: true, get: getter });
        expect((await f.invoke('write_file', input)).ok).toBe(false); expect(getter).not.toHaveBeenCalled(); expect(f.events).not.toHaveBeenCalled();
    });
    test.each(['read_file', 'write_file'])('%s pre-cancellation denies lookup and IO', async name => {
        const f = fixture(), controller = new AbortController(); controller.abort();
        expect((await f.invoke(name, { path: 'x.txt', ...(name === 'write_file' ? { content: 'x' } : {}) }, { ...ctx(), signal: controller.signal })).ok).toBe(false);
        expect(f.roots).toEqual([]); expect(f.events).not.toHaveBeenCalled(); expect(nativeFs.readdirSync(f.root)).toEqual([]);
    });
    test.each([{ startLine: 0 }, { endLine: 10001 }, { startLine: 9, endLine: 3 }, { startLine: '1' }])('invalid read window is denied', async window => {
        const f = fixture(); expect((await f.invoke('read_file', { path: 'x.txt', ...window })).ok).toBe(false);
        expect(f.roots).toEqual([]); expect(f.events).not.toHaveBeenCalled();
    });
    test('external-root fallback grants no file capability', async () => {
        const f = fixture(); f.selectRoot(originalEnv.JOE_FILE_TEST_ROOT!);
        expect((await f.invoke('write_file', { path: 'x.txt', content: 'x' })).ok).toBe(false); expect(f.events).not.toHaveBeenCalled();
    });
    test('input mutation during authoritative lookup cannot change the admitted file', async () => {
        let resume: (v: any) => void = () => {};
        const f = fixture({ lookup: () => new Promise(resolve => { resume = resolve; }) });
        const input = { path: 'safe.txt', content: 'original' }, run = f.invoke('write_file', input);
        for (let i = 0; i < 12; i++) await Promise.resolve();
        input.path = '../escape.txt'; input.content = 'changed'; resume({ userId: UID, workspaceId: WS, status: 'active' });
        const result = await run; expect(result.ok).toBe(true);
        expect(nativeFs.readFileSync(nativePath.join(f.root, 'safe.txt'), 'utf8')).toBe('original');
    });
    test('late cancellation prevents the leaf mutation', async () => {
        let stopped = false; const f = fixture({ beforeWork: () => { stopped = true; } });
        const result = await f.invoke('write_file', { path: 'x.txt', content: 'text' }, { ...ctx(), isCancelled: () => stopped });
        expect(result.ok).toBe(false); expect(nativeFs.readdirSync(f.root)).toEqual([]); expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test('changed workspace root prevents the leaf', async () => {
        let f: ReturnType<typeof fixture>; f = fixture({ beforeWork: () => f.selectRoot(originalEnv.JOE_FILE_TEST_ROOT!) });
        expect((await f.invoke('write_file', { path: 'x.txt', content: 'text' })).ok).toBe(false);
        expect(nativeFs.readdirSync(f.root)).toEqual([]); expect(f.executions[0]).not.toHaveBeenCalled();
    });
    test('late file arrival is preserved instead of overwritten', async () => {
        const f = fixture({ beforeWork: root => nativeFs.writeFileSync(nativePath.join(root, 'x.txt'), 'arrived') });
        expect((await f.invoke('write_file', { path: 'x.txt', content: 'replacement' })).ok).toBe(false);
        expect(nativeFs.readFileSync(nativePath.join(f.root, 'x.txt'), 'utf8')).toBe('arrived'); expect(f.executions[0]).not.toHaveBeenCalled();
    });

    test.each([
        ['plain', 'Before\nKeep', 'Before', 'After', 'After\nKeep'],
        ['literal dollars', 'value=old', 'old', '$& $$ $`', 'value=$& $$ $`'],
        ['Arabic', 'عنوان: قديم\nمحفوظ', 'قديم', 'جديد', 'عنوان: جديد\nمحفوظ'],
        ['CRLF', 'one\r\ntwo\r\nkeep', 'one\ntwo', 'new\nlines', 'new\r\nlines\r\nkeep'],
        ['empty replacement', 'before remove after', 'remove ', '', 'before after'],
    ])('edits only the unique literal and preserves other bytes: %s', async (_label, before, find, replace, after) => {
        const f = fixture(), target = nativePath.join(f.root, 'existing.txt');
        nativeFs.writeFileSync(target, before);
        const result = await f.invoke('file_edit', { path: 'existing.txt', find, replace });
        expect(result.ok).toBe(true);
        expect(nativeFs.readFileSync(target, 'utf8')).toBe(after);
        expect(f.executions[2]).toHaveBeenCalledTimes(1);
        expect(f.roots.every(id => id === WS)).toBe(true);
        expect(f.events.mock.calls.filter(([e]) => e.type === 'diff').every(([e]) => e.sessionId === SID)).toBe(true);
        expect(process.env.AUTO_APPROVE_ALL).toBe('0'); expect(process.env.AUTO_APPROVE_SAFE).toBe('0');
    });
    test.each([
        ['absent', undefined, 'old'], ['missing literal', 'unchanged', 'old'],
        ['repeated literal', 'old old', 'old'], ['overlapping matches', 'aaa', 'aa'],
        ['binary', 'old\0data', 'old'], ['sensitive preimage', 'password=notarealpassword old', 'old'],
    ])('refuses %s without mutation or invoking the edit leaf', async (_label, content, find) => {
        const f = fixture(), target = nativePath.join(f.root, 'existing.txt');
        if (content !== undefined) nativeFs.writeFileSync(target, content);
        expect((await f.invoke('file_edit', { path: 'existing.txt', find, replace: 'new' })).ok).toBe(false);
        expect(f.executions[2]).not.toHaveBeenCalled();
        if (content !== undefined) expect(nativeFs.readFileSync(target, 'utf8')).toBe(content);
        else expect(nativeFs.existsSync(target)).toBe(false);
    });
    test.each([
        { path: 'x.txt', find: '', replace: 'new' },
        { path: 'x.txt', find: 'old' },
        { path: 'x.txt', find: 'old', replace: 1 },
        { path: 'x.txt', find: 'old', search: 'other', replace: 'new' },
        { path: 'x.txt', find: 'old', replace: 'new', new_string: 'other' },
        { path: 'x.txt', filename: 'other.txt', find: 'old', replace: 'new' },
        { path: 'x.txt', find: 'old', replace: 'password=notarealpassword' },
        { path: 'x.txt', find: 'old', replace: 'new', autonomousEditBefore: 'old' },
        { path: 'x.txt', find: 'old', replace: 'new', mode: 'overwrite' },
        { path: 'x.txt', find: 'old', replace: 'new', expectedEditContent: 'old' },
    ])('malformed or forged edit input stops before ownership, events and IO', async input => {
        const lookup = jest.fn(async () => ({ userId: UID, workspaceId: WS })), f = fixture({ lookup });
        expect((await f.invoke('file_edit', input)).ok).toBe(false);
        expect(lookup).not.toHaveBeenCalled(); expect(f.events).not.toHaveBeenCalled(); expect(f.roots).toEqual([]);
        expect(f.executions.every(x => x.mock.calls.length === 0)).toBe(true);
    });
    test('edit input getters remain inert', async () => {
        const f = fixture(), getter = jest.fn(() => 'old'), input: any = { path: 'x.txt', replace: 'new' };
        Object.defineProperty(input, 'find', { enumerable: true, get: getter });
        expect((await f.invoke('file_edit', input)).ok).toBe(false); expect(getter).not.toHaveBeenCalled();
        expect(f.roots).toEqual([]); expect(f.events).not.toHaveBeenCalled();
    });
    test.each(['../outside.txt', '.env', '.git/config', 'keys/private.pem', 'file.txt:stream'])
    ('edit refuses restricted target %s before the leaf', async path => {
        const f = fixture(); expect((await f.invoke('file_edit', { path, find: 'old', replace: 'new' })).ok).toBe(false);
        expect(f.executions[2]).not.toHaveBeenCalled();
    });
    test.each(['owner', 'workspace', 'permission', 'cancel', 'changed file', 'changed root'])
    ('edit preserves the file when %s changes or is invalid', async boundary => {
        let cancelled = false;
        const f = fixture({ access: async write => boundary !== 'permission' || !write,
            beforeWork: root => {
                if (boundary === 'cancel') cancelled = true;
                if (boundary === 'changed file') nativeFs.writeFileSync(nativePath.join(root, 'x.txt'), 'other edit');
                if (boundary === 'changed root') f.selectRoot(basePath());
            } });
        function basePath() { return nativePath.dirname(f.root); }
        const target = nativePath.join(f.root, 'x.txt'); nativeFs.writeFileSync(target, 'old');
        const context: any = { ...ctx(), isCancelled: () => cancelled };
        if (boundary === 'owner') context.userId = 'foreign';
        if (boundary === 'workspace') context.workspaceId = 'foreign';
        expect((await f.invoke('file_edit', { path: 'x.txt', find: 'old', replace: 'new' }, context)).ok).toBe(false);
        expect(nativeFs.readFileSync(target, 'utf8')).toBe(boundary === 'changed file' ? 'other edit' : 'old');
        expect(f.executions[2]).not.toHaveBeenCalled();
    });
    test('joined replacement cannot assemble a sensitive value', async () => {
        const f = fixture(), target = nativePath.join(f.root, 'x.txt'); nativeFs.writeFileSync(target, 'passOLD=notarealpassword');
        expect((await f.invoke('file_edit', { path: 'x.txt', find: 'OLD', replace: 'word' })).ok).toBe(false);
        expect(nativeFs.readFileSync(target, 'utf8')).toBe('passOLD=notarealpassword'); expect(f.executions[2]).not.toHaveBeenCalled();
    });
    test.each(['directory', 'hard link', 'linked parent', 'oversized result'])('edit refuses %s', async boundary => {
        const f = fixture(), target = nativePath.join(f.root, 'x.txt');
        let path = 'x.txt';
        if (boundary === 'directory') nativeFs.mkdirSync(target);
        else nativeFs.writeFileSync(target, 'old');
        if (boundary === 'hard link') nativeFs.linkSync(target, nativePath.join(f.root, 'alias.txt'));
        if (boundary === 'linked parent') {
            nativeFs.symlinkSync(f.root, nativePath.join(f.root, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
            path = 'link/x.txt';
        }
        const replace = boundary === 'oversized result' ? 'x'.repeat(131073) : 'new';
        expect((await f.invoke('file_edit', { path, find: 'old', replace })).ok).toBe(false);
        expect(f.executions[2]).not.toHaveBeenCalled();
        if (boundary !== 'directory') expect(nativeFs.readFileSync(target, 'utf8')).toBe('old');
    });
    test.each(['file changed', 'cancelled'])('descriptor recheck refuses a late %s before writing', async boundary => {
        let cancelled = false;
        const f = fixture(), target = nativePath.join(f.root, 'x.txt'); nativeFs.writeFileSync(target, 'old');
        const originalOpen = nativeFs.openSync;
        jest.spyOn(nativeFs, 'openSync').mockImplementation(((file: any, flags: any, ...rest: any[]) => {
            if (file === target && typeof flags === 'number' && (flags & nativeFs.constants.O_RDWR) === nativeFs.constants.O_RDWR) {
                if (boundary === 'file changed') nativeFs.writeFileSync(target, 'another change');
                else cancelled = true;
            }
            return (originalOpen as any)(file, flags, ...rest);
        }) as any);
        expect((await f.invoke('file_edit', { path: 'x.txt', find: 'old', replace: 'new' }, { ...ctx(), isCancelled: () => cancelled })).ok).toBe(false);
        expect(nativeFs.readFileSync(target, 'utf8')).toBe(boundary === 'file changed' ? 'another change' : 'old');
        expect(f.events.mock.calls.filter(([e]) => e.type === 'diff')).toHaveLength(0);
    });
    test('private preimage is excluded from trace and started event inputs', async () => {
        const f = fixture(); nativeFs.writeFileSync(nativePath.join(f.root, 'x.txt'), 'old and other bytes');
        expect((await f.invoke('file_edit', { path: 'x.txt', find: 'old', replace: 'new' }, { ...ctx(), traceId: 'trace' })).ok).toBe(true);
        for (const input of [...f.trace.mock.calls.map(([, , e]) => e.input).filter(Boolean),
            ...f.events.mock.calls.filter(([e]) => e.type === 'tool_started').map(([e]) => e.data.input)]) {
            expect(input).not.toHaveProperty('expectedEditContent'); expect(input).not.toHaveProperty('autonomousEditBefore');
            expect(input).not.toHaveProperty('autonomousEditAfter');
        }
    });

});
