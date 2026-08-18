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

    it('does not duplicate the runtime-bound project when repair evidence already includes its name', async () => {
        const nestedEvidencePlan: any = {
            ...plan,
            suggestedInput: {
                path: 'WeatherGo/src/services/weatherService.js',
                description: 'repair the exact JavaScript artifact',
            },
        };
        const phase = {
            name: 'Testing and QA',
            tasks: [{ task: 'Repair weather service', tool: 'ai_write_file', args: { path: 'src/services/weatherService.js' } }],
        };

        const result = await SelfFixExecutionService.executeOnce({
            phase,
            projectContext: {
                projectName: 'WeatherGo',
                projectRoot: '/workspace/WeatherGo',
                projectRootRuntimeBound: true,
            },
            selfFixPlan: nestedEvidencePlan,
            executionContext: context,
        });

        expect(result.ok).toBe(true);
        expect(executeToolSpy.mock.calls[0][0]).toBe('ai_write_file');
        expect(executeToolSpy.mock.calls[0][1].path).toBe('/workspace/WeatherGo/src/services/weatherService.js');
        expect(executeToolSpy.mock.calls[0][1].path).not.toContain('/WeatherGo/WeatherGo/');
    });

    it('rebinds a relative missing-file repair to the runtime-bound generated project', async () => {
        const missingFilePlan: any = {
            type: 'self_fix_plan',
            allowed: true,
            reason: 'repair the missing smoke test',
            maxAttempts: 1,
            strategy: 'missing_file_fix',
            suggestedTool: 'write_file',
            suggestedInput: {
                filename: 'scripts/smoke-test.test.mjs',
                content: 'real smoke test\n',
            },
            safety: { runOnlyOnce: true },
            sourceTicket: { primaryError: "Could not find 'scripts/smoke-test.test.mjs'", failedTasks: [], context: {} },
        };
        const phase = {
            name: 'Testing and QA',
            tasks: [{ task: 'Run smoke test', tool: 'auto_tester', args: { projectPath: 'WeatherGo' } }],
        };

        const result = await SelfFixExecutionService.executeOnce({
            phase,
            projectContext: {
                projectName: 'WeatherGo',
                projectRoot: '/workspace/WeatherGo',
                projectRootRuntimeBound: true,
            },
            selfFixPlan: missingFilePlan,
            executionContext: context,
        });

        expect(result.ok).toBe(true);
        expect(executeToolSpy.mock.calls[0][0]).toBe('write_file');
        expect(executeToolSpy.mock.calls[0][1].filename).toBe('/workspace/WeatherGo/scripts/smoke-test.test.mjs');
        expect(executeToolSpy.mock.calls[0][1].filename).not.toBe('/workspace/scripts/smoke-test.test.mjs');
    });
});
