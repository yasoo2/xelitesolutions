import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
}));

import { executeTool } from '../modules/services/ToolService';
import { isVerificationTool } from '../core/quality/verification-ledger';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

// The plan sanitizer rewrites unverifiable phase checkers into output-existence
// observations ("Verify phase output exists: <path>" via read_file). The phase
// gate must execute that contract instead of failing the whole build with
// "unsupported verification tool contract" (CRITICAL-REAL-JOE-UI-001 run 2:
// mdtable stopped at 0/4 for exactly this reason). Final quality gates stay
// strict: read_file must never count as final delivery evidence.
describe('phase output-existence verification', () => {
    const executeToolMock = executeTool as jest.Mock;
    let projectRoot: string;

    beforeEach(() => {
        executeToolMock.mockReset();
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-phase-output-observation-'));
    });

    afterEach(() => {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('still rejects read_file as a general checker (final gates stay strict)', () => {
        const args = { path: 'mdtable/docs/01-project_setup.md' };
        expect(isVerificationTool('read_file', args)).toBe(false);
        expect(isVerificationTool('read_file', args, true)).toBe(false);
        expect(isVerificationTool('project_detect', {})).toBe(false);
    });

    it('accepts a single contained read as a phase existence observation', () => {
        expect(isVerificationTool('read_file', { path: 'mdtable/docs/01-project_setup.md' }, false, true)).toBe(true);
        // Planner-native alias keys and runtime-bound absolute paths describe the same observation.
        expect(isVerificationTool('read_file', { filePath: 'mdtable/package.json' }, false, true)).toBe(true);
        expect(isVerificationTool('read_file', { path: path.join(projectRoot, 'mdtable', 'index.js') }, false, true)).toBe(true);
    });

    it('rejects ambiguous or escaping observation shapes even at the phase gate', () => {
        const phaseGate = (tool: string, args: Record<string, unknown>) =>
            isVerificationTool(tool, args, false, true);
        expect(phaseGate('read_file', {})).toBe(false);
        expect(phaseGate('read_file', { path: '' })).toBe(false);
        expect(phaseGate('read_file', { path: '../escape.md' })).toBe(false);
        expect(phaseGate('read_file', { path: 'a/../escape.md' })).toBe(false);
        expect(phaseGate('read_file', { path: 'a.md', filePath: 'b.md' })).toBe(false);
        expect(phaseGate('write_file', { path: 'a.md' })).toBe(false);
        expect(phaseGate('shell_execute', { command: 'cat a.md' })).toBe(false);
    });

    const runSetupPhase = (readResult: any, runTag: string) => {
        executeToolMock.mockImplementation(async (tool: string) => {
            if (tool === 'scaffold_project') {
                return { ok: true, output: { created: ['package.json'], projectDir: projectRoot } };
            }
            if (tool === 'read_file') return readResult;
            return { ok: true, output: {} };
        });
        return new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 1,
                name: 'Project Setup',
                tasks: [{
                    task: 'Create project directory',
                    tool: 'scaffold_project',
                    args: { structure: { 'package.json': '{}' } },
                }],
                verificationTask: {
                    task: 'Verify phase output exists: mdtable/docs/01-project_setup.md',
                    tool: 'read_file',
                    args: { path: 'mdtable/docs/01-project_setup.md' },
                },
            },
            projectContext: {
                projectName: 'mdtable',
                projectRoot,
                projectRootRuntimeBound: true,
                runId: `run-output-observation-${runTag}`,
                workspaceId: 'workspace-output-observation',
            },
        }, {
            runId: `run-output-observation-${runTag}`,
            sessionId: `session-output-observation-${runTag}`,
            workspaceId: 'workspace-output-observation',
            userId: 'owner-output-observation',
        }) as Promise<any>;
    };

    it('executes the sanitizer existence observation instead of failing the phase', async () => {
        const result = await runSetupPhase({ ok: true, output: { content: '# Project Setup', totalLines: 13 } }, 'pass');

        expect(result.ok).toBe(true);
        expect(result.output.status).toBe('completed');
        expect(executeToolMock).toHaveBeenCalledWith(
            'read_file',
            expect.objectContaining({ path: expect.stringContaining('01-project_setup.md') }),
            expect.anything(),
        );
        const verificationEntry = result.output.results.find((entry: any) =>
            String(entry.task || '').startsWith('Verify phase output exists'));
        expect(verificationEntry).toMatchObject({ tool: 'read_file', ok: true, execution: 'ran' });
    });

    it('fails honestly with the tool error when the observed output is missing', async () => {
        const result = await runSetupPhase({ ok: false, error: 'File not found' }, 'missing');

        expect(result.ok).toBe(false);
        expect(result.output.status).toBe('partial');
        expect(result.error).toBe('File not found');
        expect(result.error).not.toContain('unsupported verification tool contract');
    });
});
