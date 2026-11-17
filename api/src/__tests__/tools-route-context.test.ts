import toolsRouter from '../api/routes/tools';
import { executeTool } from '../modules/services/ToolService';
import { authenticate } from '../api/middleware/auth';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.mock('../modules/tools/registry', () => ({ tools: [] }));
jest.mock('../modules/services/ToolService', () => ({ executeTool: jest.fn() }));
jest.mock('../api/middleware/auth', () => ({ authenticate: jest.fn(), superAdminEmails: () => ['boss@example.test'] }));
jest.mock('../shared/utils/logger', () => ({ logger: { debug: jest.fn(), error: jest.fn() } }));

// Exercise the registered HTTP handlers and the real AsyncLocalStorage firewall.
// The terminal tool is inert; these cases never execute a leaf tool or provider.
const routes = ['/execute', '/:name/execute'];
function handler(route: string) {
    const layer = (toolsRouter as any).stack.find((item: any) => item.route?.path === route);
    expect(layer.route.methods.post).toBe(true);
    expect(layer.route.stack[0].handle).toBe(authenticate);
    return layer.route.stack[layer.route.stack.length - 1].handle;
}
function request(overrides: any = {}) {
    return {
        auth: { sub: 'owner-a', role: 'OWNER' }, params: { name: 'echo' }, query: {},
        body: { tool: 'echo', input: { message: 'safe' }, sessionId: 'session-a', workspaceId: 'workspace-a' },
        ...overrides,
    };
}
function response() {
    const res: any = { statusCode: 200 };
    res.status = jest.fn((code: number) => { res.statusCode = code; return res; });
    res.json = jest.fn((body: any) => { res.body = body; return res; });
    return res;
}

describe('public tool routes preserve user execution authority', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    for (const route of routes) {
        for (const sub of [undefined, null, 42, {}, [], '', '   ']) {
            test(`${route}: malformed subject ${JSON.stringify(sub)} never dispatches`, async () => {
                const res = response();
                await handler(route)(request({ auth: { sub } }), res);
                expect(res.statusCode).toBe(401);
                expect(res.body.error).toBe('Unauthorized');
                expect(executeTool).not.toHaveBeenCalled();
            });
        }
        for (const sessionId of [null, 42, {}, [], '', '   ']) {
            test(`${route}: malformed session ${JSON.stringify(sessionId)} never dispatches`, async () => {
                const req = request();
                req.body.sessionId = sessionId;
                const res = response();
                await handler(route)(req, res);
                expect(res.statusCode).toBe(400);
                expect(res.body.error).toBe('Invalid sessionId');
                expect(executeTool).not.toHaveBeenCalled();
            });
        }
        test(`${route}: authenticated request remains AGENT and carries its owner`, async () => {
            (executeTool as jest.Mock).mockImplementation(async (name: string, input: any, context: any) => {
                executionFirewall.validateExecution('route-context-proof');
                expect(executionFirewall.isSystemContext()).toBe(false);
                expect(executionFirewall.currentOwner()).toEqual({ userId: 'owner-a', sessionId: 'session-a' });
                expect(context).toEqual({ workspaceId: 'workspace-a', userId: 'owner-a', sessionId: 'session-a' });
                expect(name).toBe('echo');
                expect(input).toHaveProperty(route === '/execute' ? 'message' : 'tool');
                return { ok: false, error: 'policy_blocked', output: { reason: 'proof' } };
            });
            const res = response();
            await handler(route)(request(), res);
            expect(executeTool).toHaveBeenCalledTimes(1);
            expect(res.body.ok).toBe(false);
            expect(res.body.output).toEqual({ reason: 'proof' });
            expect(executionFirewall.currentOwner()).toEqual({ userId: '', sessionId: '' });
        });
        test(`${route}: concurrent owners do not share ambient identity`, async () => {
            (executeTool as jest.Mock).mockImplementation(async (_name: string, _input: any, context: any) => {
                await Promise.resolve();
                expect(executionFirewall.isSystemContext()).toBe(false);
                expect(executionFirewall.currentOwner()).toEqual({ userId: context.userId, sessionId: context.sessionId });
                return { ok: true, output: context.userId };
            });
            const a = request();
            const b = request({ auth: { sub: 'owner-b', role: 'OWNER' } });
            b.body = { ...b.body, sessionId: 'session-b', workspaceId: 'workspace-b' };
            const ra = response(), rb = response();
            await Promise.all([handler(route)(a, ra), handler(route)(b, rb)]);
            expect(ra.body.output).toBe('owner-a');
            expect(rb.body.output).toBe('owner-b');
        });
        test(`${route}: tool exceptions become a failed HTTP result`, async () => {
            (executeTool as jest.Mock).mockImplementation(async () => { throw new Error('sentinel failure'); });
            const res = response();
            await handler(route)(request(), res);
            expect(res.statusCode).toBe(500);
            expect(res.body).toEqual({ ok: false, error: 'sentinel failure' });
        });
        test(`${route}: an inherited SYSTEM context cannot elevate a user request`, async () => {
            (executeTool as jest.Mock).mockImplementation(async () => {
                await Promise.resolve();
                executionFirewall.validateExecution('route-context-proof');
                expect(executionFirewall.isSystemContext()).toBe(false);
                expect(executionFirewall.currentOwner()).toEqual({ userId: 'owner-a', sessionId: 'session-a' });
                return { ok: true, output: 'de-elevated' };
            });
            await executionFirewall.runAsSystem(async () => {
                const res = response();
                await handler(route)(request(), res);
                expect(res.body).toEqual({ ok: true, output: 'de-elevated', error: undefined });
                expect(executionFirewall.isSystemContext()).toBe(true);
                expect(executionFirewall.currentOwner()).toEqual({ userId: 'background-owner', sessionId: 'background-session' });
            }, { userId: 'background-owner', sessionId: 'background-session' });
        });
    }
});

describe('a signed-in account that is not the owner never runs a tool by its name (tenant review N1)', () => {
    beforeEach(() => { jest.clearAllMocks(); (executeTool as jest.Mock).mockResolvedValue({ ok: true, output: 'ran' }); });
    const dangerous: Array<[string, any]> = [
        ['shell_execute', { command: 'type ..\\.env' }],
        ['execute_python', { code: 'print(open("/etc/passwd").read())', cwd: '/' }],
        ['engine_device', { op: 'look' }],
        ['github_repo_manager', { action: 'delete', repo: 'x' }],
    ];
    for (const role of ['USER', 'ADMIN', undefined]) {
        for (const [tool, input] of dangerous) {
            test(`/execute: ${role || 'no role'} running ${tool} is refused, nothing runs`, async () => {
                const res = response();
                await handler('/execute')(request({ auth: { sub: 'someone', role }, body: { tool, input, sessionId: 's' } }), res);
                expect(res.statusCode).toBe(403);
                expect(executeTool).not.toHaveBeenCalled();
            });
            test(`/:name/execute: ${role || 'no role'} running ${tool} is refused, nothing runs`, async () => {
                const res = response();
                await handler('/:name/execute')(request({ auth: { sub: 'someone', role }, params: { name: tool }, body: { ...input, sessionId: 's' } }), res);
                expect(res.statusCode).toBe(403);
                expect(executeTool).not.toHaveBeenCalled();
            });
        }
    }
    test('the file explorer\'s own call — listing his GitHub repositories — still works for any account', async () => {
        const res = response();
        await handler('/execute')(request({ auth: { sub: 'someone', role: 'USER' }, body: { tool: 'github_repo_manager', input: { action: 'list', token: 't' } } }), res);
        expect(executeTool).toHaveBeenCalledTimes(1);
        expect(res.body.ok).toBe(true);
    });
    test('the owner, a super admin and an allow-listed email run any tool', async () => {
        for (const auth of [{ sub: 'o', role: 'OWNER' }, { sub: 's', role: 'SUPER_ADMIN' }, { sub: 'b', role: 'USER', email: 'Boss@Example.test' }]) {
            const res = response();
            await handler('/execute')(request({ auth, body: { tool: 'shell_execute', input: { command: 'echo hi' } } }), res);
            expect(res.statusCode).toBe(200);
        }
        expect(executeTool).toHaveBeenCalledTimes(3);
    });
});
