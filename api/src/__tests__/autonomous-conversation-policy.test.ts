/** Real gateway/firewall/session lookup with inert leaf, ODM, IO and UI edges. */
export {};

const SID = '111111111111111111111111';
const UID = 'synthetic-owner';
const WS = '222222222222222222222222';
const context = () => ({ sessionId: SID, userId: UID, workspaceId: WS });

describe('server autonomous identity floor', () => {
    const originalEnv = process.env;
    const originalSessions = (global as any).mockSessions;
    afterEach(() => {
        process.env = originalEnv;
        if (originalSessions === undefined) delete (global as any).mockSessions;
        else (global as any).mockSessions = originalSessions;
        jest.useRealTimers();
        jest.restoreAllMocks();
        jest.resetModules();
    });

    function fixture(options: { mode?: string; autoAll?: string; autoSafe?: string; bypass?: string;
        connected?: boolean; sessions?: any[]; mongo?: any; mongoLookup?: () => Promise<any>; runConfig?: any } = {}) {
        jest.resetModules();
        jest.useFakeTimers(); // Capture cleanup timers; never advance callbacks.
        process.env = { NODE_ENV: 'test', JOE_AUTONOMOUS_DEVELOPMENT: options.mode ?? '1',
            AUTO_APPROVE_ALL: options.autoAll ?? '0', AUTO_APPROVE_SAFE: options.autoSafe ?? '0',
            ENABLE_AUTH_BYPASS: options.bypass ?? 'false', AI_COST_POLICY: 'free_only',
            ...(options.connected ? {} : { PERSISTENCE_MODE: 'JSON' }) };
        (global as any).mockSessions = options.sessions ?? [{ id: SID, _id: SID, userId: UID, workspaceId: WS }];
        const forbidden: string[] = [];
        const refuse = (name: string) => (..._args: any[]) => {
            forbidden.push(name);
            throw new Error('Unexpected focused effect: ' + name);
        };
        const closed = (name: string, fields: Record<string, any>): any => new Proxy(fields, {
            get(target, key) {
                if (Object.prototype.hasOwnProperty.call(target, key)) return target[key as string];
                if (key === '__esModule') return false;
                return refuse(name + '.' + String(key))();
            },
        });
        const mock = (name: string, fields: Record<string, any>) => jest.doMock(name, () => closed(name, fields));
        jest.doMock('fs', () => ({ __esModule: true, default: closed('fs', {}) }));
        mock('glob', { glob: refuse('glob') });
        class ObjectId {
            constructor(private value: string) {}
            toHexString() { return this.value; }
            static isValid(value: string) { return /^[0-9a-f]{24}$/u.test(value); }
        }
        jest.doMock('mongoose', () => ({ __esModule: true, default: closed('mongoose', {
            Types: { ObjectId }, connection: { readyState: options.connected ? 1 : 0 },
        }) }));
        const lookup = jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn(options.mongoLookup ?? (async () => options.mongo ?? null)) })) }));
        mock('../shared/models/session', { Session: closed('Session', { findById: lookup }) });
        // api/chat-store itself remains real; only its FS/ODM terminals are mocked.
        mock('../shared/utils/logger', { logger: closed('logger', { debug: jest.fn(), error: jest.fn() }) });
        mock('../modules/services/vectorDb', { vectorDb: closed('vectorDb', {}) });
        mock('../modules/services/TraceManager', { traceManager: closed('traceManager', { logEvent: jest.fn() }) });
        mock('../modules/tools/utils', { resolveToolPath: refuse('resolveToolPath') });
        mock('../modules/services/BinaryService', { BinaryService: closed('BinaryService', {}) });
        mock('../modules/services/secrets', { getSessionRunConfig: jest.fn(() => options.runConfig ?? {}) });
        mock('../modules/browser/challenge', { agentSearchUrl: refuse('agentSearchUrl') });
        mock('../shared/utils/redaction', { redactSecretsFromString: (value: string) => value });
        mock('../core/terminal/paint', { paintLine: (value: string) => value });
        mock('../shared/utils/url', { normalizeUrlForGoto: refuse('normalizeUrlForGoto') });
        mock('../shared/reply-language', { isArabicReply: () => false, say: (_ar: boolean, _a: string, en: string) => en });
        mock('../shared/utils/honestResult', { isApologyOnly: () => false, apologyText: () => '' });
        const wsEvents = jest.fn();
        mock('../api/ws', { broadcastThinkingPhase: wsEvents, broadcast: wsEvents,
            broadcastTerminalLine: wsEvents, registerSessionOwner: wsEvents });
        const release = jest.fn();
        mock('../core/session/attended-run', {
            // The actual pure owner bridge adds no execution authority or IO.
            bindRunCancellation: jest.requireActual('../core/session/attended-run').bindRunCancellation,
            registerRun: jest.fn(() => ({ cancelled: false, whenCancelled: new Promise(() => {}), cancel: jest.fn() })),
            releaseHandle: release,
            attendRun: ({ work }: any) => work(),
        });
        mock('../modules/services/WorkspaceService', {
            workspaceService: closed('workspaceService', { runWithWorkspace: (_ws: string, work: () => unknown) => work() }),
        });
        const executed: Array<{ name: string; input: any; context: any }> = [];
        const names = ['central_answer', 'echo', 'task_lifecycle', 'ask_user', 'write_file', 'file_edit',
            'scaffold_project', 'react_project', 'deploy_project', 'git_ops', 'shell_execute',
            'payments_create_checkout_session', 'browser_fill_form', 'browser_click', 'http_fetch', 'custom_tool'];
        mock('../modules/tools/registry', { tools: names.map(name => ({ name, permissions: [], sideEffects: [],
            rateLimitPerMinute: name === 'echo' ? 2 : 0,
            execute: async (input: any, executionContext: any) => {
                executed.push({ name, input, context: executionContext });
                return { ok: true, output: name === 'central_answer' ? 'synthetic answer' : { text: input.text }, logs: [] };
            },
        })) });
        const { executionFirewall: firewall } = require('../orchestration/AgentExecutionFirewall');
        const { executeTool } = require('../modules/services/ToolService');
        const invoke = (name: string, input: any = {}, ctx: any = context(), outer: any = { userId: UID, sessionId: SID }, system = false) =>
            system ? firewall.runAsSystem(() => executeTool(name, input, ctx), outer)
                : firewall.runInContext(undefined, () => executeTool(name, input, ctx), outer);
        return { executeTool, invoke, firewall, executed, forbidden, lookup, wsEvents, release, ObjectId };
    }

    test.each(['central_answer', 'echo'])('%s executes without any approval override', async name => {
        const f = fixture();
        const result = await f.invoke(name, { question: 'A general question', text: 'hello' });
        expect(result.ok).toBe(true);
        expect(f.executed.map(call => call.name)).toEqual([name]);
        expect(f.executed[0].context).toMatchObject(context());
        expect(f.executed[0].context.isCancelled()).toBe(false);
        expect(f.release).toHaveBeenCalledTimes(1);
        expect(process.env.AI_COST_POLICY).toBe('free_only');
        expect(f.forbidden).toEqual([]);
    });

    test.each(['ask_user', 'task_lifecycle', 'file_write', 'ai_write_file', 'edit_file',
        'delete_file', 'scaffold_project', 'react_project', 'deploy_project', 'git_ops', 'shell_execute',
        'payments_create_checkout_session', 'browser_fill_form', 'browser_click', 'http_fetch',
        'memorize_codebase', 'recall_memory', 'custom_tool', 'CENTRAL_ANSWER', 'central_answer_extra'])
    ('%s is rejected before alias, IO, memory, event or leaf effects', async name => {
        const f = fixture({ autoAll: '1', bypass: 'true', runConfig: { autoApproveAll: true, autoApproveSafe: true } });
        const result = await f.invoke(name, { path: 'new/folder/file.ts', action: 'start_server', command: 'node -e unsafe' }, context(), undefined, true);
        expect(result).toMatchObject({ ok: false, error: 'policy_blocked', output: { status: 'failed', reason: 'tool_not_admitted' } });
        expect(result.output).not.toHaveProperty('nonRecoverable');
        expect(f.executed).toEqual([]);
        expect(f.wsEvents).not.toHaveBeenCalled();
        expect(f.lookup).not.toHaveBeenCalled();
        expect(f.forbidden).toEqual([]);
    });

    test.each([
        ['missing context', undefined], ['numeric UID', { ...context(), userId: 7 }],
        ['empty SID', { ...context(), sessionId: ' ' }], ['missing WS', { ...context(), workspaceId: undefined }],
        ['object WS', { ...context(), workspaceId: { id: WS } }], ['foreign WS', { ...context(), workspaceId: 'foreign' }],
        ['foreign UID', { ...context(), userId: 'foreign' }], ['foreign SID', { ...context(), sessionId: 'foreign' }],
    ])('%s cannot derive authority from input or SYSTEM', async (_name, ctx: any) => {
        const f = fixture({ bypass: 'true', autoAll: '1' });
        const result = await f.firewall.runAsSystem(() => f.executeTool('echo', { ...context(), __userId: UID, __workspaceId: WS, text: 'hello' }, ctx), { userId: UID, sessionId: SID });
        expect(result.ok).toBe(false);
        expect(result.error).toBe('policy_blocked');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test.each([
        ['unknown', []], ['duplicate', [{ id: SID, userId: UID, workspaceId: WS }, { id: SID, userId: UID, workspaceId: WS }]],
        ['conflicting IDs', [{ id: SID, _id: '333333333333333333333333', userId: UID, workspaceId: WS }]],
        ['malformed present ID', [{ id: SID, _id: {}, userId: UID, workspaceId: WS }]],
        ['foreign owner', [{ id: SID, userId: 'foreign', workspaceId: WS }]],
        ['unbound', [{ id: SID, userId: UID }]], ['archived', [{ id: SID, userId: UID, workspaceId: WS, status: 'archived' }]],
        ['deleted', [{ id: SID, userId: UID, workspaceId: WS, status: 'deleted' }]],
    ])('%s local session fails closed without mint or fallback', async (_name, sessions) => {
        const f = fixture({ sessions: sessions as any[] });
        const snapshot = JSON.stringify((global as any).mockSessions);
        const result = await f.invoke('central_answer', { question: 'Question' });
        expect(result).toMatchObject({ ok: false, error: 'policy_blocked', output: { reason: 'session_forbidden' } });
        expect(JSON.stringify((global as any).mockSessions)).toBe(snapshot);
        expect(f.lookup).not.toHaveBeenCalled();
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test.each([false, true])('pre-cancelled call is denied (signal=%s)', async useSignal => {
        const f = fixture();
        const controller = new AbortController();
        controller.abort();
        const result = await f.invoke('echo', { text: 'hello' }, { ...context(), ...(useSignal ? { signal: controller.signal } : { isCancelled: () => true }) });
        expect(result).toMatchObject({ ok: false, error: 'policy_blocked', output: { reason: 'cancelled' } });
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('ambient owner is mandatory despite a known session', async () => {
        const f = fixture();
        const result = await f.invoke('echo', { text: 'hello' }, context(), {}, true);
        expect(result).toMatchObject({ ok: false, error: 'policy_blocked', output: { reason: 'session_forbidden' } });
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test.each([['numeric UID', { userId: 7, sessionId: SID }, { ...context(), userId: '7' }],
        ['numeric SID', { userId: UID, sessionId: 7 }, { ...context(), sessionId: '7' }]])
    ('raw ambient %s cannot become authority through string coercion', async (_name, outer: any, ctx: any) => {
        const f = fixture({ sessions: [{ id: ctx.sessionId, userId: ctx.userId, workspaceId: WS }] });
        expect((await f.invoke('echo', { text: 'hello' }, ctx, outer, true)).error).toBe('policy_blocked');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test.each(['resolved', 'rejected', 'handle', 'malformed', 'callback type', 'callback result', 'callback throw', 'signal shape'])
    ('%s cancellation context cannot dispatch an instant leaf', async shape => {
        const f = fixture();
        const extra: any = shape === 'resolved' ? { cancellation: Promise.resolve() }
            : shape === 'rejected' ? { cancellation: Promise.reject(new Error('synthetic cancellation')) }
            : shape === 'handle' ? { cancellation: { cancelled: true, whenCancelled: Promise.resolve(), cancel: () => {} } }
            : shape === 'malformed' ? { cancellation: { cancelled: false, whenCancelled: 7, cancel: () => {} } }
            : shape === 'callback type' ? { isCancelled: true }
            : shape === 'callback result' ? { isCancelled: () => 1 }
            : shape === 'callback throw' ? { isCancelled: () => { throw new Error('synthetic callback failure'); } }
            : { signal: { aborted: false } };
        if (shape === 'rejected') void extra.cancellation.catch(() => {});
        const result = await f.invoke('echo', { text: 'hello' }, { ...context(), ...extra });
        expect(result.error).toBe('policy_blocked');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test.each(['resolved cancellation', 'rejected cancellation', 'identity changed', 'mode retired'])
    ('%s during awaited authoritative lookup denies before leaf', async shape => {
        let finish!: (value: unknown) => void;
        let entered!: () => void;
        const started = new Promise<void>(resolve => { entered = resolve; });
        const held = new Promise(resolve => { finish = resolve; });
        const f = fixture({ connected: true, mongoLookup: () => { entered(); return held; } });
        let cancel!: () => void;
        let rejectCancellation!: (error: Error) => void;
        const cancellation = new Promise<void>((resolve, reject) => { cancel = resolve; rejectCancellation = reject; });
        void cancellation.catch(() => {});
        const ctx: any = { ...context(), cancellation };
        const pending = f.invoke('echo', { text: 'hello' }, ctx);
        await started;
        if (shape === 'resolved cancellation') cancel();
        else if (shape === 'rejected cancellation') rejectCancellation(new Error('synthetic cancellation'));
        else if (shape === 'identity changed') ctx.workspaceId = 'foreign';
        else process.env.JOE_AUTONOMOUS_DEVELOPMENT = '0';
        finish({ userId: UID, workspaceId: WS, status: 'active' });
        expect((await pending).error).toBe('policy_blocked');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('nested SYSTEM calls cannot borrow the outer safe admission', async () => {
        const f = fixture({ bypass: 'true', autoAll: '1' });
        const result = await f.firewall.runAsSystem(() => f.firewall.runInContext(undefined,
            () => f.executeTool('payments_create_checkout_session', {}, context()), { userId: UID, sessionId: SID }),
        { userId: UID, sessionId: SID });
        expect(result).toMatchObject({ ok: false, error: 'policy_blocked', output: { reason: 'tool_not_admitted' } });
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('connected Mongo uses the same explicit binding and no local fallback', async () => {
        const f = fixture({ connected: true, mongo: { userId: UID, workspaceId: WS, status: 'active' }, sessions: [] });
        expect((await f.invoke('echo', { text: 'hello' })).ok).toBe(true);
        expect(f.lookup).toHaveBeenCalledWith(SID);
        expect(f.forbidden).toEqual([]);
    });

    test('connected Mongo unknown owner cannot borrow local store', async () => {
        const f = fixture({ connected: true });
        expect((await f.invoke('echo', { text: 'hello' })).error).toBe('policy_blocked');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('ODM failure cannot borrow a valid local owner', async () => {
        const f = fixture({ connected: true, mongoLookup: async () => { throw new Error('synthetic ODM failure'); } });
        expect((await f.invoke('echo', { text: 'hello' })).error).toBe('policy_blocked');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('restored ObjectId fields retain authoritative session/workspace binding', async () => {
        const f = fixture();
        (global as any).mockSessions = [{ id: SID, _id: new f.ObjectId(SID), userId: UID, workspaceId: new f.ObjectId(WS) }];
        expect((await f.invoke('echo', { text: 'hello' })).ok).toBe(true);
        expect(f.executed[0].context).toMatchObject(context());
        expect(f.forbidden).toEqual([]);
    });

    test('oversized local registry is rejected without scanning or mutation', async () => {
        const f = fixture();
        const records = new Array(10_001).fill(null);
        records[0] = { id: SID, userId: UID, workspaceId: WS };
        (global as any).mockSessions = records;
        expect((await f.invoke('echo', { text: 'hello' })).error).toBe('policy_blocked');
        expect((global as any).mockSessions).toBe(records);
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('pending Cancellable retains the normal admitted execution contract', async () => {
        const f = fixture();
        const handle = { cancelled: false, whenCancelled: new Promise<void>(() => {}), cancel: () => {} };
        expect((await f.invoke('echo', { text: 'hello' }, { ...context(), cancellation: handle })).ok).toBe(true);
        expect(f.executed[0].context.cancellation).toBeInstanceOf(Promise);
        expect(f.executed[0].context.isCancelled()).toBe(false);
        expect(f.forbidden).toEqual([]);
    });

    test('admitted tool still requires the canonical firewall entry', async () => {
        const f = fixture();
        await expect(f.executeTool('echo', { text: 'hello' }, context())).rejects.toThrow('Execution bypass detected');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('rate limiting remains in force for admitted calls', async () => {
        const f = fixture();
        expect((await f.invoke('echo', { text: 'one' })).ok).toBe(true);
        expect((await f.invoke('echo', { text: 'two' })).ok).toBe(true);
        expect((await f.invoke('echo', { text: 'three' })).error).toBe('rate_limited');
        expect(f.executed).toHaveLength(2);
        expect(f.forbidden).toEqual([]);
    });

    test.each(['0', 'true', ''])('legacy mode %j retains approval-required behavior', async mode => {
        const f = fixture({ mode, connected: true, mongo: { userId: UID, workspaceId: WS } });
        expect((await f.invoke('central_answer', { question: 'Question' })).error).toBe('approval_required');
        expect(f.executed).toEqual([]);
        expect(f.forbidden).toEqual([]);
    });

    test('legacy saved all-risk preference retains its existing behavior', async () => {
        const f = fixture({ mode: '0', connected: true, mongo: { userId: UID, workspaceId: WS }, runConfig: { autoApproveAll: true } });
        expect((await f.invoke('payments_create_checkout_session', {})).ok).toBe(true);
        expect(f.executed.map(call => call.name)).toEqual(['payments_create_checkout_session']);
        expect(f.forbidden).toEqual([]); // Captured sentinel, never a payment request.
    });
});
