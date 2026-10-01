/**
 * Bypass-off attribution for permission-defaulted tools (wiring audit 082).
 *
 * The registry's enforceContract pass gives tools with empty declared
 * permissions a conservative default (write/read/internet by name). That
 * default only matters when the bypass is OFF: ToolService then requires a
 * workspace and a user for any tool with non-empty permissions. With no
 * session record and no attribution, dispatch must stop before execution.
 * No mutation is executed by any case here: rejected calls never dispatch.
 */
jest.mock('../modules/services/session-identity', () => ({
    __esModule: true,
    normalizeId: (v: any) => String(v ?? '').trim(),
    resolveSessionIdentity: async () => null,
}));

import { tools } from '../modules/tools/registry';

describe('defaulted permissions are enforced when the bypass is off', () => {
    const saved = {
        bypass: process.env.ENABLE_AUTH_BYPASS,
        autoAll: process.env.AUTO_APPROVE_ALL,
        autoSafe: process.env.AUTO_APPROVE_SAFE,
    };
    let executeTool: any;
    let firewall: any;

    beforeAll(async () => {
        delete process.env.ENABLE_AUTH_BYPASS;
        delete process.env.AUTO_APPROVE_ALL;
        delete process.env.AUTO_APPROVE_SAFE;
        ({ executeTool } = await import('../modules/services/ToolService'));
        ({ executionFirewall: firewall } = await import('../orchestration/AgentExecutionFirewall'));
    });
    afterAll(() => {
        if (saved.bypass === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = saved.bypass;
        if (saved.autoAll === undefined) delete process.env.AUTO_APPROVE_ALL; else process.env.AUTO_APPROVE_ALL = saved.autoAll;
        if (saved.autoSafe === undefined) delete process.env.AUTO_APPROVE_SAFE; else process.env.AUTO_APPROVE_SAFE = saved.autoSafe;
    });

    const call = (name: string, input: any, context: any) =>
        firewall.runInContext(`defaults-${Date.now()}-${name}`, () => executeTool(name, input, context));

    it('echo carries a non-empty defaulted permission', () => {
        const echo = tools.find((t: any) => t.name === 'echo') as any;
        expect(echo).toBeDefined();
        expect(Array.isArray(echo.permissions) && echo.permissions.length > 0).toBe(true);
    });

    it('rejects a read-defaulted tool with no attribution as unauthorized', async () => {
        // The workspace is auto-assigned to default-workspace before the gate
        // (ToolService ~L336), so the live attribution check is the user one.
        const r: any = await call('echo', { message: 'hi' }, {} as any);
        expect(r.ok).toBe(false);
        expect(r.error).toBe('unauthorized');
    });

    it('rejects a read-defaulted tool with workspace but no user as unauthorized', async () => {
        const r: any = await call('echo', { message: 'hi' }, { workspaceId: 'ws-1' } as any);
        expect(r.ok).toBe(false);
        expect(r.error).toBe('unauthorized');
    });

    it('rejects a write-defaulted tool with no attribution before execution', async () => {
        const r: any = await call('write_file', { filePath: 'x.txt', content: 'x' }, {} as any);
        expect(r.ok).toBe(false);
        expect(r.error).toBe('unauthorized');
    });

    it('control: the same unattributed call executes with the bypass on', async () => {
        process.env.ENABLE_AUTH_BYPASS = 'true';
        try {
            const r: any = await call('echo', { message: 'hi' }, {} as any);
            expect(r.error).not.toBe('workspace_required');
            expect(r.error).not.toBe('unauthorized');
            expect(r.ok).toBe(true);
        } finally {
            delete process.env.ENABLE_AUTH_BYPASS;
        }
    });
});
