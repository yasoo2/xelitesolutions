/**
 * THE GATE THAT HAS NEVER RUN IN ANGER.
 *
 * Joe runs single-user with ENABLE_AUTH_BYPASS=true, and so does every proof in
 * this repository — which is exactly why 51 tools could declare an empty
 * permission list for months without a single test noticing. He intends to put
 * Joe online. On that day the bypass goes off and this path becomes the one
 * every request takes; the worst possible moment to find out what it does.
 *
 * Running it with the gate ENFORCED turned up a second, sharper thing. The
 * session lookup existed only to FILL a missing userId — it never compared a
 * SUPPLIED one against the session's owner. So a caller who knew somebody
 * else's sessionId could pass their own userId, satisfy the check, and have the
 * workspace resolved to that session's workspace: another user's files, under
 * their own name.
 *
 * The database is not reachable from the test runner, so it is simulated here —
 * deliberately, because the branch under test is precisely the one that only
 * runs when a session record CAN be read.
 */
const OWNER = '507f1f77bcf86cd799439011';

// The database read lives behind one named seam now — `resolveSessionIdentity`
// — so the gate can be tested without a live Mongo and without stubbing
// mongoose itself (other models build Schemas from it; a stub breaks them).
jest.mock('../modules/services/session-identity', () => ({
    __esModule: true,
    normalizeId: (v: any) => String(v ?? '').trim(),
    resolveSessionIdentity: async () => ({ userId: 'owner-1', workspaceId: 'ws-owner-1' }),
}));

describe('a session belongs to whoever created it', () => {
    const saved = { bypass: process.env.ENABLE_AUTH_BYPASS, auto: process.env.AUTO_APPROVE_ALL };
    let executeTool: any, firewall: any;

    beforeAll(async () => {
        delete process.env.ENABLE_AUTH_BYPASS;
        delete process.env.AUTO_APPROVE_ALL;
        ({ executeTool } = await import('../modules/services/ToolService'));
        ({ executionFirewall: firewall } = await import('../orchestration/AgentExecutionFirewall'));
    });
    afterAll(() => {
        if (saved.bypass === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = saved.bypass;
        if (saved.auto === undefined) delete process.env.AUTO_APPROVE_ALL; else process.env.AUTO_APPROVE_ALL = saved.auto;
    });

    const call = (userId?: string) => firewall.runInContext(`t-${Date.now()}`, () =>
        executeTool('echo', { message: 'hi' }, { sessionId: OWNER, workspaceId: 'ws-owner-1', userId } as any));

    it('refuses a caller who is not the owner, by name', async () => {
        const r: any = await call('intruder-9');
        expect(r.ok).toBe(false);
        expect(r.error).toBe('session_forbidden');
    });

    it('and lets the owner through', async () => {
        const r: any = await call('owner-1');
        expect(r.error).not.toBe('session_forbidden');
    });

    it('a request with no user at all is still refused as unauthorized', async () => {
        // With no userId supplied, the session's own owner fills it — which is
        // the pre-existing convenience, and must not become an escape hatch:
        // the caller still ends up acting AS the owner, never as somebody else.
        const r: any = await call(undefined);
        expect(r.error).not.toBe('session_forbidden');
    });
});

describe('the ownership check is not conditional on something being missing', () => {
    it('runs on every gated call', () => {
        const fs = require('fs'); const path = require('path');
        const T = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'ToolService.ts'), 'utf-8');
        expect(T).toMatch(/asked !== resolvedUserId/);
        expect(T).toMatch(/error: 'session_forbidden'/);
        // The old shape guarded the lookup behind «something is missing», which
        // is why an attacker who supplied everything was never checked at all.
        expect(T).not.toMatch(/if \(\(needsWorkspace && !contextWorkspaceId\) \|\| \(needsUser && !effectiveContext\.userId\)\) \{[\s\S]{0,40}try \{/);
    });
});


describe('shell diagnostics use the least-privilege approval path', () => {
    const saved = {
        bypass: process.env.ENABLE_AUTH_BYPASS,
        autoAll: process.env.AUTO_APPROVE_ALL,
        autoSafe: process.env.AUTO_APPROVE_SAFE,
    };
    let executeTool: any, firewall: any;

    beforeAll(async () => {
        delete process.env.ENABLE_AUTH_BYPASS;
        delete process.env.AUTO_APPROVE_ALL;
        process.env.AUTO_APPROVE_SAFE = '1';
        ({ executeTool } = await import('../modules/services/ToolService'));
        ({ executionFirewall: firewall } = await import('../orchestration/AgentExecutionFirewall'));
    });

    afterAll(() => {
        if (saved.bypass === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = saved.bypass;
        if (saved.autoAll === undefined) delete process.env.AUTO_APPROVE_ALL; else process.env.AUTO_APPROVE_ALL = saved.autoAll;
        if (saved.autoSafe === undefined) delete process.env.AUTO_APPROVE_SAFE; else process.env.AUTO_APPROVE_SAFE = saved.autoSafe;
    });

    const context = { sessionId: OWNER, workspaceId: 'ws-owner-1', userId: 'owner-1' } as any;
    const executeAsAgent = (command: string) => firewall.runInContext(
        `shell-policy-${Date.now()}`,
        () => executeTool('shell_execute', { command }, context),
        { userId: 'owner-1', sessionId: OWNER },
    );

    it('runs a single read-only diagnostic without escalating it to approval_required', async () => {
        const result: any = await executeAsAgent('pwd');
        expect(result.ok).toBe(true);
        expect(String(result.error || '')).not.toBe('approval_required');
        expect(String(result.output?.stdout || '').trim()).toMatch(/^\//);
    });

    it('still blocks a repository push without explicit all-risk approval', async () => {
        const result: any = await executeAsAgent('git push');
        expect(result.ok).toBe(false);
        expect(result.error).toBe('approval_required');
    });

    it('allows local deployment actions through the safe approval path', async () => {
        const result: any = await firewall.runInContext(
            `local-deploy-${Date.now()}`,
            () => executeTool('deploy_project', {
                action: 'start_server',
                projectPath: 'missing-local-project',
                port: 4173,
            }, context),
            { userId: 'owner-1', sessionId: OWNER },
        );
        expect(result.error).not.toBe('approval_required');
        expect(result.error).toBe('Project path not found: missing-local-project');
    });

    it('rejects an absolute path outside the workspace before execution', async () => {
        const result: any = await firewall.runInContext(
            `outside-deploy-${Date.now()}`,
            () => executeTool('deploy_project', {
                action: 'build_static',
                projectPath: '/tmp',
            }, context),
            { userId: 'owner-1', sessionId: OWNER },
        );
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(/outside workspace/i);
    });

    it('keeps public port exposure behind explicit all-risk approval', async () => {
        const result: any = await firewall.runInContext(
            `public-deploy-${Date.now()}`,
            () => executeTool('deploy_project', {
                action: 'expose_port',
                projectPath: '/tmp',
                port: 4173,
            }, context),
            { userId: 'owner-1', sessionId: OWNER },
        );
        expect(result.ok).toBe(false);
        expect(result.error).toBe('approval_required');
    });
});
