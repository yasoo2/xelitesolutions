import * as ToolService from '../modules/services/ToolService';
import { SelfFixExecutionService } from '../modules/services/SelfFixExecutionService';
import { repairMemory } from '../core/memory/repair-memory';

const context = {
    sessionId: 'self-fix-session',
    workspaceId: 'self-fix-workspace',
    userId: 'self-fix-user',
};

const plan: any = {
    type: 'self_fix_plan',
    allowed: true,
    reason: 'repair one invalid artifact',
    maxAttempts: 1,
    strategy: 'code_fix',
    suggestedTool: 'ai_write_file',
    suggestedInput: {
        path: '/workspace/live-joe-test/src/routes/auth.js',
        description: 'repair the exact JavaScript artifact',
    },
    safety: {
        requiresTrustedContext: true,
        runOnlyOnce: true,
        mustReRunFailedPhase: true,
        stopOnSecondFailure: true,
    },
    sourceTicket: {
        primaryError: 'artifact_type_mismatch: auth.js',
        failedTasks: [],
        context: {},
    },
};

describe('SelfFixExecutionService phase resumption', () => {
    let executeToolSpy: jest.SpyInstance;
    let recordRepairSpy: jest.SpyInstance;

    beforeEach(() => {
        executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockImplementation(async (name: string) => {
            if (name === 'ai_write_file') return { ok: true, output: { path: plan.suggestedInput.path }, logs: [] } as any;
            return { ok: true, output: { status: 'completed' }, logs: [] } as any;
        });
        recordRepairSpy = jest.spyOn(repairMemory, 'recordRepair').mockResolvedValue();
    });

    afterEach(() => {
        executeToolSpy.mockRestore();
        recordRepairSpy.mockRestore();
    });

    it('skips only the repaired artifact task and reruns the remaining phase work', async () => {
        const phase = {
            name: 'Setup and Authentication',
            tasks: [
                { task: 'Write auth route', tool: 'ai_write_file', args: { path: 'src/routes/auth.js' } },
                { task: 'Write server entrypoint', tool: 'ai_write_file', args: { path: 'src/server.js' } },
            ],
        };

        const result = await SelfFixExecutionService.executeOnce({
            phase,
            projectContext: { projectName: 'TaskFlow AI' },
            selfFixPlan: plan,
            executionContext: context,
        });

        expect(result.ok).toBe(true);
        expect(executeToolSpy).toHaveBeenCalledTimes(2);
        expect(executeToolSpy.mock.calls[0][0]).toBe('ai_write_file');
        expect(executeToolSpy.mock.calls[1][0]).toBe('phase_executor');
        expect(executeToolSpy.mock.calls[1][1].phase.tasks).toEqual([
            { task: 'Write server entrypoint', tool: 'ai_write_file', args: { path: 'src/server.js' } },
        ]);
        expect(recordRepairSpy).toHaveBeenCalledTimes(1);
    });

    it('keeps a single-task phase non-empty so it can provide post-repair proof', async () => {
        const phase = {
            name: 'Setup and Authentication',
            tasks: [{ task: 'Write auth route', tool: 'ai_write_file', args: { path: 'src/routes/auth.js' } }],
        };

        const result = await SelfFixExecutionService.executeOnce({
            phase,
            projectContext: { projectName: 'TaskFlow AI' },
            selfFixPlan: plan,
            executionContext: context,
        });

        expect(result.ok).toBe(true);
        expect(executeToolSpy.mock.calls[1][1].phase.tasks).toHaveLength(1);
        expect(executeToolSpy.mock.calls[1][1].phase.tasks[0].args.path).toBe('src/routes/auth.js');
    });
});
