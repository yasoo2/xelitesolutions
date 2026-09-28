import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import { executeTool } from '../modules/services/ToolService';
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';
import { isVerificationTool, verificationResultFromToolResult } from '../core/quality/verification-ledger';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

// A runnable phase's strongest verification is a live run: the planner is
// instructed to prove a live URL via project_run, and the sanitizer preserves
// that verification once the plan produced a runnable artifact (manifest with
// a launch script plus an install step and entrypoint). The phase gate must
// cover the contract it is handed: rejecting a preserved live check with
// "unsupported verification tool contract" after all tasks succeeded is the
// same pipeline-killing failure class as the project_detect filler
// (CRITICAL-REAL-JOE-UI-001 family), and self-fix cannot repair it either
// (no evidence-bound file). Task-level ledger selection and plan-level final
// normalization intentionally stay unchanged: only the phase gate opts into
// the live-run check.
describe('project_run live-run verification', () => {
    const executeToolMock = executeTool as jest.Mock;
    let projectRoot: string;

    // Mirrors the phase gate predicate exactly (PhaseExecutorTool).
    const phaseGateAccepts = (tool: string, args: Record<string, unknown>) =>
        isVerificationTool(tool, args, false, true, true);

    const runnablePhase = (verificationArgs: Record<string, unknown> = {}) => ({
        phaseNumber: 1,
        name: 'Runnable foundation',
        tasks: [
            {
                task: 'Write the service manifest',
                tool: 'write_file',
                args: {
                    path: 'NEXUS/package.json',
                    content: JSON.stringify({ name: 'nexus', scripts: { start: 'node server.js' } }),
                },
            },
            { task: 'Install project dependencies', tool: 'npm_manager', args: { command: 'install', cwd: 'NEXUS' } },
            { task: 'Write the server entry point', tool: 'write_file', args: { path: 'NEXUS/server.js', content: 'console.log("nexus")' } },
        ],
        verificationTask: { task: 'Start the live project', tool: 'project_run', args: verificationArgs },
    });

    beforeEach(() => {
        executeToolMock.mockReset();
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-project-run-verification-'));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('gate covers the preserved live check once the plan produced a runnable artifact', () => {
        const { phases, blocker } = sanitisePlanPhases([runnablePhase()], 'NEXUS', { mode: 'greenfield', candidateCheckCommands: [] });
        expect(blocker).toBeUndefined();
        expect(phases[0].verificationTask.tool).toBe('project_run');
        expect(phaseGateAccepts(phases[0].verificationTask.tool, phases[0].verificationTask.args || {})).toBe(true);
    });

    it('covers the live check with explicit run args (cwd-qualified variant)', () => {
        const { phases } = sanitisePlanPhases([runnablePhase({ cwd: 'NEXUS' })], 'NEXUS', { mode: 'greenfield', candidateCheckCommands: [] });
        expect(phases[0].verificationTask.tool).toBe('project_run');
        expect(phases[0].verificationTask.args).toMatchObject({ cwd: 'NEXUS' });
        expect(phaseGateAccepts('project_run', { cwd: 'NEXUS' })).toBe(true);
    });

    it('does not opt non-gate callers into the live check', () => {
        // Task-level ledger selection and plan-level final normalization keep
        // their previous contract: the opt-in belongs to the phase gate only.
        expect(isVerificationTool('project_run', {})).toBe(false);
        expect(isVerificationTool('project_run', {}, true)).toBe(false);
        expect(isVerificationTool('project_run', {}, false, true)).toBe(false);
    });

    it('maps a live URL result to passed and a failed start to failed', () => {
        expect(verificationResultFromToolResult({
            ok: true,
            output: { url: 'http://127.0.0.1:4300/', port: 4300, ready: true },
        })).toBe('passed');
        expect(verificationResultFromToolResult({
            ok: false,
            error: 'No runnable entry found for this project.',
        })).toBe('failed');
    });

    const runRunnablePhase = (liveResult: any, runTag: string) => {
        executeToolMock.mockImplementation(async (tool: string) => {
            if (tool === 'project_run') return liveResult;
            return { ok: true, output: {} };
        });
        return new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 1,
                name: 'Runnable foundation',
                tasks: [{
                    task: 'Write the server entry point',
                    tool: 'write_file',
                    args: { path: 'NEXUS/server.js', content: 'console.log("nexus")' },
                }],
                verificationTask: {
                    task: 'Start the live project',
                    tool: 'project_run',
                    args: { cwd: 'NEXUS' },
                },
            },
            projectContext: {
                projectName: 'NEXUS',
                projectRoot,
                projectRootRuntimeBound: true,
                runId: `run-project-run-verification-${runTag}`,
                workspaceId: 'workspace-project-run-verification',
            },
        }, {
            runId: `run-project-run-verification-${runTag}`,
            sessionId: `session-project-run-verification-${runTag}`,
            workspaceId: 'workspace-project-run-verification',
            userId: 'owner-project-run-verification',
        }) as Promise<any>;
    };

    it('executes the preserved live check instead of contract-killing the phase', async () => {
        const result = await runRunnablePhase({
            ok: true,
            output: { url: 'http://127.0.0.1:4300/', port: 4300, ready: true },
        }, 'pass');

        expect(result.ok).toBe(true);
        expect(result.output.status).toBe('completed');
        expect(executeToolMock).toHaveBeenCalledWith(
            'project_run',
            expect.objectContaining({ cwd: projectRoot }),
            expect.anything(),
        );
        const verificationEntry = result.output.results.find((entry: any) =>
            String(entry.task || '').startsWith('Start the live project'));
        expect(verificationEntry).toMatchObject({ tool: 'project_run', ok: true, execution: 'ran' });
    });

    it('reports an honest product error when the live run fails', async () => {
        const result = await runRunnablePhase({
            ok: false,
            error: 'No runnable entry found for this project.',
        }, 'missing');

        expect(result.ok).toBe(false);
        expect(result.output.status).toBe('partial');
        const verificationEntry = result.output.results.find((entry: any) =>
            String(entry.task || '').startsWith('Start the live project'));
        expect(verificationEntry).toMatchObject({ tool: 'project_run', ok: false, execution: 'ran' });
        expect(String(verificationEntry.error || '')).toContain('No runnable entry found');
        expect(String(verificationEntry.error || '')).not.toContain('unsupported verification tool contract');
        expect(String(result.error || '')).not.toContain('unsupported verification tool contract');
    });
});
