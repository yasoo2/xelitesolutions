import fs from 'fs';
import os from 'os';
import path from 'path';
import * as ToolService from '../modules/services/ToolService';
import { SelfFixExecutionService, phaseAfterRepair } from '../modules/services/SelfFixExecutionService';
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

    it('allows one evidence-bound follow-up after a dependency repair exposes a second failure', async () => {
        let phaseReruns = 0;
        executeToolSpy.mockImplementation(async (name: string) => {
            if (name === 'npm_manager') return { ok: true, output: { status: 'completed' }, logs: [] } as any;
            if (name === 'ai_write_file') return { ok: true, output: { path: '/workspace/WeatherGo/src/__tests__/app.integration.test.ts' }, logs: [] } as any;
            if (name === 'phase_executor') {
                phaseReruns++;
                if (phaseReruns === 1) {
                    return {
                        ok: false,
                        output: {
                            status: 'partial',
                            results: [{
                                ok: false,
                                task: 'Run generated integration test',
                                tool: 'auto_tester',
                                file: '/workspace/WeatherGo/src/__tests__/app.integration.test.ts',
                                error: 'partial: the generated integration test still fails after dependency installation',
                            }],
                        },
                        logs: [],
                    } as any;
                }
                return { ok: true, output: { status: 'completed' }, logs: [] } as any;
            }
            return { ok: true, output: { status: 'completed' }, logs: [] } as any;
        });

        const dependencyPlan: any = {
            type: 'self_fix_plan',
            allowed: true,
            reason: 'install evidenced test dependency',
            maxAttempts: 1,
            strategy: 'dependency_fix',
            suggestedTool: 'npm_manager',
            suggestedInput: {
                command: 'install',
                packages: ['@testing-library/react'],
                cwd: '/workspace/WeatherGo',
            },
            safety: {
                requiresTrustedContext: true,
                runOnlyOnce: true,
                mustReRunFailedPhase: true,
                stopOnSecondFailure: true,
            },
            sourceTicket: {
                primaryError: 'runtime_contract_mismatch: /workspace/WeatherGo/src/__tests__/app.integration.test.ts imports undeclared package(s): @testing-library/react.',
                failedTasks: [],
                context: {},
            },
        };
        const phase = {
            name: 'Testing and QA',
            tasks: [{ task: 'Run generated integration test', tool: 'auto_tester', args: { file: 'src/__tests__/app.integration.test.ts' } }],
        };

        const result = await SelfFixExecutionService.executeOnce({
            phase,
            projectContext: { projectName: 'WeatherGo', projectRoot: '/workspace/WeatherGo', projectRootRuntimeBound: true },
            selfFixPlan: dependencyPlan,
            executionContext: context,
        });

        expect(result.ok).toBe(true);
        expect(result.followUpPlan?.strategy).toBe('code_fix');
        expect(result.followUpExecution?.ok).toBe(true);
        expect(phaseReruns).toBe(2);
        expect(executeToolSpy).toHaveBeenCalledTimes(4);
        expect(executeToolSpy.mock.calls.map(call => call[0])).toEqual([
            'npm_manager', 'phase_executor', 'ai_write_file', 'phase_executor',
        ]);
    });

    it('allows one evidence-bound local-import follow-up after the first repair reveals another missing stylesheet', async () => {
        let phaseReruns = 0;
        executeToolSpy.mockImplementation(async (name: string, input: any) => {
            if (name === 'ai_write_file') {
                return { ok: true, output: { path: input.path }, logs: [] } as any;
            }
            if (name === 'phase_executor') {
                phaseReruns += 1;
                if (phaseReruns === 1) {
                    return {
                        ok: false,
                        output: {
                            status: 'partial',
                            results: [{
                                ok: false,
                                task: 'Run generated weather app',
                                tool: 'project_run',
                                file: '/workspace/WeatherGo/src/WeatherApp.jsx',
                                error: 'unresolved_local_import: /workspace/WeatherGo/src/WeatherApp.jsx imports "./WeatherApp.css", but no file resolves',
                            }],
                        },
                        logs: [],
                    } as any;
                }
                return { ok: true, output: { status: 'completed' }, logs: [] } as any;
            }
            return { ok: true, output: { status: 'completed' }, logs: [] } as any;
        });

        const firstRepairPlan: any = {
            type: 'self_fix_plan',
            allowed: true,
            reason: 'create the evidenced App.css target',
            maxAttempts: 1,
            strategy: 'build_fix',
            suggestedTool: 'ai_write_file',
            suggestedInput: {
                path: '/workspace/WeatherGo/src/App.css',
                description: 'create the exact stylesheet required by App.tsx',
            },
            safety: {
                requiresTrustedContext: true,
                runOnlyOnce: true,
                mustReRunFailedPhase: true,
                stopOnSecondFailure: true,
            },
            sourceTicket: {
                primaryError: 'local runtime import missing: /workspace/WeatherGo/src/App.tsx imports "./App.css"',
                failedTasks: [],
                context: {},
            },
        };
        const phase = {
            name: 'Build WeatherGo',
            tasks: [
                { task: 'Create App.css', tool: 'ai_write_file', args: { path: 'src/App.css' } },
                { task: 'Run generated weather app', tool: 'project_run', args: { projectPath: '/workspace/WeatherGo' } },
            ],
        };

        const result = await SelfFixExecutionService.executeOnce({
            phase,
            projectContext: { projectName: 'WeatherGo', projectRoot: '/workspace/WeatherGo', projectRootRuntimeBound: true },
            selfFixPlan: firstRepairPlan,
            executionContext: context,
        });

        expect(result.ok).toBe(true);
        expect(result.followUpPlan?.strategy).toBe('build_fix');
        expect(result.followUpPlan?.suggestedTool).toBe('ai_write_file');
        expect(result.followUpPlan?.suggestedInput.path).toBe('/workspace/WeatherGo/src/WeatherApp.css');
        expect(result.followUpExecution?.ok).toBe(true);
        expect(phaseReruns).toBe(2);
        expect(executeToolSpy.mock.calls.map(call => call[0])).toEqual([
            'ai_write_file', 'phase_executor', 'ai_write_file', 'phase_executor',
        ]);
    });

    it('rebinds rerun verification to the manifest nearest the repaired nested artifact', async () => {
        const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-react-weathergo-'));
        const repairedFile = path.join(artifactRoot, 'src', 'components', 'WeatherApp.jsx');
        fs.mkdirSync(path.dirname(repairedFile), { recursive: true });
        fs.writeFileSync(path.join(artifactRoot, 'package.json'), '{"private":true}\\n');

        executeToolSpy.mockImplementation(async (name: string, input: any) => {
            if (name === 'ai_write_file') return { ok: true, output: { path: input.path }, logs: [] } as any;
            return { ok: true, output: { status: 'completed' }, logs: [] } as any;
        });

        const nestedRepairPlan: any = {
            ...plan,
            suggestedInput: {
                path: repairedFile,
                description: 'repair the exact generated WeatherApp artifact',
            },
            sourceTicket: {
                primaryError: `runtime_contract_mismatch: ${repairedFile} imports undeclared package(s): react-redux`,
                failedTasks: [],
                context: {},
            },
        };

        try {
            const result = await SelfFixExecutionService.executeOnce({
                phase: {
                    name: 'Scaffold minimal runnable skeleton',
                    tasks: [
                        { task: 'Generate the React project', tool: 'react_project', args: {} },
                        { task: 'Run the generated project', tool: 'project_run', args: { cwd: '/workspace/WeatherGo' } },
                    ],
                },
                projectContext: {
                    projectName: 'WeatherGo',
                    projectRoot: '/workspace/WeatherGo',
                    projectRootRuntimeBound: true,
                },
                selfFixPlan: nestedRepairPlan,
                executionContext: context,
            });

            expect(result.ok).toBe(true);
            expect(executeToolSpy.mock.calls.map(call => call[0])).toEqual(['ai_write_file', 'phase_executor']);
            expect(executeToolSpy.mock.calls[1][1].projectContext.projectRoot).toBe(artifactRoot);
            expect(executeToolSpy.mock.calls[1][1].projectContext.projectRoot).not.toBe('/workspace/WeatherGo');
        } finally {
            fs.rmSync(artifactRoot, { recursive: true, force: true });
        }
    });

    it('keeps a resumed react project task after repairing its package manifest', () => {
        const phase = {
            name: 'Build WeatherGo',
            tasks: [{
                task: 'Generate the WeatherGo React project',
                tool: 'react_project',
                args: { path: '/workspace/WeatherGo/package.json' },
            }],
        };

        const result = phaseAfterRepair(phase, '/workspace/WeatherGo/package.json');

        expect(result.skipped).toEqual([]);
        expect(result.phase.tasks).toHaveLength(1);
        expect(result.phase.tasks[0].tool).toBe('react_project');
        expect(result.phase.tasks[0].args.resumeExisting).toBe(true);
    });

    it('does not infer a package repair from descriptive dependency wording', () => {
        const planResult = require('../modules/services/SelfFixService').SelfFixService.plan({
            type: 'phase_repair_ticket',
            projectName: 'WeatherGo',
            phaseNumber: 1,
            phaseName: 'Testing and QA',
            status: 'partial',
            severity: 'medium',
            primaryError: 'partial: the generated integration test still fails after dependency installation',
            failedTasks: [{
                task: 'Run generated integration test',
                tool: 'auto_tester',
                error: 'partial: the generated integration test still fails after dependency installation',
                file: '/workspace/WeatherGo/src/__tests__/app.integration.test.ts',
            }],
            suggestedNextAction: 'run one controlled repair pass',
            retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
            context: { workspaceId: 'self-fix-workspace' },
            createdAt: new Date().toISOString(),
        });
        expect(planResult.strategy).toBe('code_fix');
        expect(planResult.suggestedTool).toBe('ai_write_file');
        expect(planResult.suggestedInput?.path).toBe('/workspace/WeatherGo/src/__tests__/app.integration.test.ts');
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
