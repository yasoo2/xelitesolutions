jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));
jest.mock('../shared/run-evidence-store', () => ({
    appendRunEvidenceEvent: jest.fn().mockResolvedValue(undefined),
    createRunEvidence: jest.fn().mockResolvedValue(undefined),
    saveRunReceipt: jest.fn().mockResolvedValue(undefined),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentLoopService } from '../modules/services/AgentLoopService';
import { executeTool } from '../modules/services/ToolService';
import { workspaceService } from '../modules/services/WorkspaceService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { appendRunEvidenceEvent } from '../shared/run-evidence-store';
import { createVerificationLedger, recordVerification, selectVerification } from '../core/quality/verification-ledger';

const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;
const mockedAppendRunEvidenceEvent = appendRunEvidenceEvent as jest.MockedFunction<typeof appendRunEvidenceEvent>;

describe('change-aware verification through the canonical phase path', () => {
    const roots: string[] = [];
    let workspaceRootSpy: jest.SpyInstance;

    const project = () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-phase-verification-'));
        roots.push(root);
        fs.mkdirSync(path.join(root, 'src'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 1;\n');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }));
        fs.writeFileSync(path.join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
        workspaceRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        return root;
    };

    beforeEach(() => {
        mockedExecuteTool.mockReset();
        mockedAppendRunEvidenceEvent.mockClear();
    });

    it.each(['echo jest', 'npm test && node stateful.js'])('does not cache or certify the shell command %s', async command => {
        const root = project();
        mockedExecuteTool.mockResolvedValue({ ok: true, output: { status: 'completed' } } as any);
        const task = { task: 'Execute requested command', tool: 'shell_execute', args: { command, cwd: root } };
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Execute', tasks: [task, task],
                verificationTask: { ...task, verificationMode: 'final' } },
            projectContext: { projectName: 'fixture', totalPhases: 1, isFinalPhase: true,
                projectRoot: root, projectRootRuntimeBound: true,
                sessionId: 'session', workspaceId: 'workspace', userId: 'user' },
        }, { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' });
        expect(mockedExecuteTool).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(false);
        expect(result.output.verificationLedger.receipts).toHaveLength(0);
    });

    it.each(['read_file', 'write_file', 'project_detect', 'unregistered_checker'])('rejects %s as phase verification without executing it', async tool => {
        const root = project();
        mockedExecuteTool.mockResolvedValue({ ok: true, output: { status: 'completed' } } as any);
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Verify',
                tasks: [{ task: 'Focused check', tool: 'quality_run', verificationMode: 'focused', args: { path: root, tasks: ['test'] } }],
                verificationTask: { tool, task: 'Final acceptance', args: { path: 'package.json' }, verificationMode: 'final' } },
            projectContext: { projectName: 'fixture', totalPhases: 1, isFinalPhase: true,
                projectRoot: root, projectRootRuntimeBound: true,
                sessionId: 'session', workspaceId: 'workspace', userId: 'user' },
        }, { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' });
        expect(result.ok).toBe(false);
        expect(mockedExecuteTool.mock.calls.map(call => call[0])).toEqual(['quality_run']);
        expect(result.output.verificationLedger.receipts.some((receipt: any) => receipt.mode === 'final' && receipt.result === 'passed')).toBe(false);
    });

    afterEach(() => {
        workspaceRootSpy?.mockRestore();
        for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    });

    it('executes a matching passing check once and reports the duplicate as reused', async () => {
        const root = project();
        mockedExecuteTool.mockResolvedValue({ ok: true, output: { status: 'completed' } } as any);
        const task = {
            task: 'Run focused API tests',
            tool: 'quality_run',
            verificationId: 'api:focused',
            relevantPaths: ['src'],
            args: { path: root, tasks: ['test'] },
        };

        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Verify', tasks: [task, task] },
            projectContext: {
                projectName: 'fixture', totalPhases: 1, projectRoot: root, projectRootRuntimeBound: true,
                sessionId: 'session', workspaceId: 'workspace', userId: 'user',
            },
        }, { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' });

        expect(result).toMatchObject({
            ok: true,
            output: {
                status: 'completed',
                executedTasks: 1,
                reusedTasks: 1,
                verificationMetrics: { reused: 1, passed: 1 },
            },
        });
        expect(mockedExecuteTool).toHaveBeenCalledTimes(1);
        expect(result.output.results.map((item: any) => item.execution)).toEqual(['ran', 'reused']);
    });

    it('binds the frontend plan final check to the accepted runtime project and records its receipt', async () => {
        const root = project();
        const plan = (new ProjectPlannerTool() as any).constrainedFrontendPlan('Build a local inventory app.');
        mockedExecuteTool.mockResolvedValue({ ok: true, output: { status: 'completed' } } as any);
        const result: any = await new PhaseExecutorTool().execute({
            phase: { ...plan.phases[0], tasks: [{ task: 'Focused test', tool: 'quality_run', args: { tasks: ['test'] } }] },
            projectContext: {
                projectName: 'fixture', totalPhases: 1, isFinalPhase: true,
                projectRoot: root, projectRootRuntimeBound: true,
                sessionId: 'session', workspaceId: 'workspace', userId: 'user',
            },
        }, { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' });
        expect(result).toMatchObject({ ok: true, output: { status: 'completed' } });
        const finalCall = mockedExecuteTool.mock.calls.find(call =>
            call[0] === 'quality_run' && (call[1] as any).tasks?.length === 4);
        expect(finalCall?.[1]).toMatchObject({ path: root, tasks: ['lint', 'typecheck', 'test', 'build'] });
        expect(result.output.verificationLedger.receipts).toEqual(expect.arrayContaining([
            expect.objectContaining({ checkId: 'frontend:final-quality', mode: 'final', result: 'passed' }),
        ]));
    });

    it('reuses successful work but reruns a previously failed phase verification', async () => {
        const root = project();
        let reviewAttempts = 0;
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'quality_run') return { ok: true, output: { status: 'completed' } } as any;
            if (toolName === 'code_reviewer') {
                reviewAttempts++;
                return reviewAttempts === 1
                    ? { ok: false, error: 'measured acceptance failure', output: { status: 'failed' } } as any
                    : { ok: true, output: { status: 'completed' } } as any;
            }
            throw new Error(`unexpected tool: ${toolName}`);
        });
        const phase = {
            phaseNumber: 1,
            name: 'Build and verify',
            tasks: [{
                task: 'Run focused tests', tool: 'quality_run', verificationId: 'focused',
                relevantPaths: ['src'], args: { path: root, tasks: ['test'] },
            }],
            verificationTask: {
                task: 'Review acceptance', tool: 'code_reviewer', verificationId: 'acceptance',
                relevantPaths: ['src'], args: { files: [path.join(root, 'src', 'index.ts')] },
            },
        };
        const projectContext: any = {
            projectName: 'fixture', totalPhases: 1, projectRoot: root, projectRootRuntimeBound: true,
            sessionId: 'session', workspaceId: 'workspace', userId: 'user',
        };
        const context = { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' };

        const first: any = await new PhaseExecutorTool().execute({ phase, projectContext }, context);
        expect(first.ok).toBe(false);
        projectContext.verificationLedger = first.output.verificationLedger;

        const rerun: any = await new PhaseExecutorTool().execute({ phase, projectContext }, context);
        expect(rerun.ok).toBe(true);
        expect(rerun.output.results.map((item: any) => item.execution)).toEqual(['reused', 'ran']);
        expect(mockedExecuteTool.mock.calls.filter(call => call[0] === 'quality_run')).toHaveLength(1);
        expect(mockedExecuteTool.mock.calls.filter(call => call[0] === 'code_reviewer')).toHaveLength(2);
    });

    it('carries passing receipts across AgentLoop phases and invalidates them after a relevant edit', async () => {
        const root = project();
        let qualityCalls = 0;
        mockedExecuteTool.mockImplementation(async (toolName: string, input: any, context: any) => {
            if (toolName === 'phase_executor') return new PhaseExecutorTool().execute(input, context) as any;
            if (toolName === 'quality_run') {
                qualityCalls++;
                return { ok: true, output: { status: 'completed' } } as any;
            }
            if (toolName === 'write_file') {
                fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const value = 2;\n');
                return { ok: true, output: { status: 'completed' } } as any;
            }
            if (toolName === 'joe_engineering_report') return { ok: true, output: { report: {}, markdown: 'ok' } } as any;
            throw new Error(`unexpected tool: ${toolName}`);
        });
        const qualityTask = {
            task: 'Run API unit tests', tool: 'quality_run', verificationId: 'api:unit',
            relevantPaths: ['src'], args: { path: root, tasks: ['test'] },
        };
        const result: any = await AgentLoopService.runPlannedPhasesIfPresent({
            sessionId: 'session', runId: 'run', userId: 'user', workspaceId: 'workspace',
            request: 'Modify a small test-backed application.',
            plannerResult: {
                ok: true,
                output: {
                    projectName: 'fixture', projectRoot: root, createsNewProject: false, totalPhases: 3,
                    phases: [
                        { phaseNumber: 1, name: 'Baseline', tasks: [qualityTask] },
                        { phaseNumber: 2, name: 'Unchanged evidence', tasks: [qualityTask] },
                        {
                            phaseNumber: 3,
                            name: 'Relevant edit',
                            tasks: [
                                { task: 'Apply relevant edit', tool: 'write_file', args: { filename: path.join(root, 'src', 'index.ts'), content: 'export const value = 2;' } },
                                qualityTask,
                            ],
                        },
                    ],
                },
            },
        });

        expect(result.ok).toBe(true);
        expect(qualityCalls).toBe(2);
        expect(result.results.map((phaseResult: any) => phaseResult.reusedTasks)).toEqual([0, 1, 0]);
        expect(result.results[1].verificationMetrics.estimatedSavedDurationMs).toBeGreaterThanOrEqual(0);
        expect(result.results[2].logs.join('\n')).toContain('invalidated: relevant content');
        expect(mockedAppendRunEvidenceEvent).toHaveBeenCalledWith('run', expect.objectContaining({
            type: 'verification_summary',
            data: expect.objectContaining({
                stage: 'phase',
                metrics: expect.objectContaining({ reused: expect.any(Number), invalidated: expect.any(Number) }),
            }),
        }));
        const finalSummary = mockedAppendRunEvidenceEvent.mock.calls
            .map(call => call[1] as any)
            .find(event => event?.data?.phaseName === 'Relevant edit');
        expect(finalSummary?.data?.evidence?.checks).toEqual(expect.arrayContaining([
            expect.objectContaining({ checkId: 'api:unit', mode: 'final', result: 'passed' }),
        ]));
    });

    it('does not let a focused receipt satisfy the final whole-project gate', async () => {
        const root = project();
        mockedExecuteTool.mockResolvedValue({ ok: true, output: { status: 'completed' } } as any);
        const focused = {
            task: 'Run tests', tool: 'quality_run', verificationId: 'all-tests', verificationMode: 'focused',
            relevantPaths: ['src'], args: { path: root, tasks: ['test'] },
        };
        const final = { ...focused, verificationMode: 'final' };
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Final', tasks: [focused, final, final] },
            projectContext: {
                projectName: 'fixture', totalPhases: 1, projectRoot: root, projectRootRuntimeBound: true,
                sessionId: 'session', workspaceId: 'workspace', userId: 'user',
            },
        }, { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' });

        expect(result.ok).toBe(true);
        expect(mockedExecuteTool).toHaveBeenCalledTimes(2);
        expect(result.output.results.map((item: any) => item.execution)).toEqual(['ran', 'ran', 'reused']);
    });

    it('never lets verification metadata make a mutating task reusable', async () => {
        const root = project();
        mockedExecuteTool.mockResolvedValue({ ok: true, output: { status: 'completed' } } as any);
        const writer = {
            task: 'Write source', tool: 'write_file', verificationId: 'unsafe-writer-cache',
            args: { filename: path.join(root, 'src', 'generated.ts'), content: 'export const generated = true;' },
        };
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Write twice', tasks: [writer, writer] },
            projectContext: {
                projectName: 'fixture', totalPhases: 1, projectRoot: root, projectRootRuntimeBound: true,
                isFinalPhase: true, sessionId: 'session', workspaceId: 'workspace', userId: 'user',
            },
        }, { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' });

        expect(result.output.reusedTasks).toBe(0);
        expect(mockedExecuteTool).toHaveBeenCalledTimes(2);
    });

    it('does not let a focused receipt satisfy an explicitly required final gate', async () => {
        const root = project();
        const selected = selectVerification(createVerificationLedger(), {
            checkId: 'required-final', tool: 'quality_run', workspaceId: 'workspace',
            workspaceRoot: root, scopeRoot: root, relevantPaths: ['src'], mode: 'focused',
        });
        const focusedLedger = recordVerification(selected.ledger, selected.selection, 'passed', 5);
        mockedExecuteTool.mockImplementation(async (toolName: string) => {
            if (toolName === 'phase_executor') {
                return {
                    ok: true,
                    output: {
                        status: 'completed', phaseNumber: 99, executedTasks: 1, reusedTasks: 0,
                        skippedTasks: 0, totalTasks: 1, results: [], verificationLedger: focusedLedger,
                    },
                    logs: [],
                } as any;
            }
            throw new Error(`unexpected tool: ${toolName}`);
        });

        const result: any = await AgentLoopService.runPlannedPhasesIfPresent({
            sessionId: 'session', runId: 'run', userId: 'user', workspaceId: 'workspace',
            plannerResult: {
                ok: true,
                output: {
                    projectName: 'fixture', projectRoot: root, createsNewProject: false, totalPhases: 99,
                    phases: [{
                        phaseNumber: 99, name: 'Malformed numbering', tasks: [{ task: 'work', tool: 'echo' }],
                        verificationTask: { task: 'Final gate', tool: 'quality_run', verificationId: 'required-final' },
                    }],
                },
            },
        });

        expect(result).toMatchObject({ ok: false, finalVerificationMissing: true });
        expect(mockedExecuteTool).toHaveBeenCalledTimes(1);
    });
});
