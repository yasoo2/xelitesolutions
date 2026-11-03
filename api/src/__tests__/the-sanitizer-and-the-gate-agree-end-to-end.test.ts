jest.mock('../modules/services/ToolService', () => ({
    executeTool: jest.fn(),
    TOOL_ALIASES: {},
}));
jest.mock('../shared/run-evidence-store', () => ({
    appendRunEvidenceEvent: jest.fn().mockResolvedValue(undefined),
    createRunEvidence: jest.fn().mockResolvedValue(undefined),
    saveRunReceipt: jest.fn().mockResolvedValue(undefined),
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeTool } from '../modules/services/ToolService';
import { workspaceService } from '../modules/services/WorkspaceService';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { sanitisePlanPhases } from '../core/orchestrator/plan-tools';

/**
 * Eval round 9, 2026-10-23 (P001, 45.8 min): the planner named project_detect
 * as the verification of a correct first phase. The catalogue advertised it
 * as one, and the plan sanitizer substitutes it itself. The phase gate, which
 * never accepts project_detect, failed the phase with verification_unavailable.
 * The run-4b rewrite to read_file had the same gap: its tests stopped at the
 * sanitizer, and the gate admits a read only as an observation. What the
 * sanitizer emits must pass the REAL gate.
 */
const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('the sanitizer and the gate agree, end to end', () => {
    const roots: string[] = [];
    afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

    const runSanitisedPhase = async (verificationTask: any) => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-gate-agree-'));
        roots.push(root);
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        const { phases } = sanitisePlanPhases([{
            phaseNumber: 1, name: 'Project Scaffolding & Architecture',
            tasks: [{ task: 'Write the architecture notes', tool: 'ai_write_file', args: { path: 'docs/architecture.md', description: 'Architecture of the clinic site.' } }],
            verificationTask,
        }, {
            phaseNumber: 2, name: 'Sections',
            tasks: [{ task: 'Write the page', tool: 'ai_write_file', args: { path: 'index.html', description: 'The clinic landing page.' } }],
        }], 'clinic', { mode: 'greenfield', candidateCheckCommands: [] });
        mockedExecuteTool.mockReset();
        mockedExecuteTool.mockImplementation(async (tool: any, input: any) => {
            if (tool === 'ai_write_file') {
                const file = path.join(root, String(input?.path || 'docs/architecture.md'));
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, '# Architecture\n');
                return { ok: true, output: { path: input?.path, message: 'File written' } } as any;
            }
            return { ok: true, output: { content: '# Architecture\n' } } as any;
        });
        const result: any = await new PhaseExecutorTool().execute({
            phase: phases[0],
            projectContext: { projectName: 'clinic', totalPhases: 2, isFinalPhase: false,
                projectRoot: root, projectRootRuntimeBound: true,
                sessionId: 'session', workspaceId: 'workspace', userId: 'user' },
        }, { runId: 'run', sessionId: 'session', workspaceId: 'workspace', userId: 'user' });
        return { phase: phases[0], result };
    };

    it.each([
        ['project_detect', { task: 'Inspect phase output on disk', tool: 'project_detect', args: {} }],
        ['project_run', { task: 'Start the live project', tool: 'project_run', args: {} }],
        // The NEXUS shape: a generator named as the check, formerly rewritten into a read the gate refuses.
        ['doc_generator', { task: 'Generate architecture document', tool: 'doc_generator', args: { filePath: 'architecture_plan.md' } }],
    ])('a planned %s verification no longer fails a correct phase at the gate', async (_name, verificationTask) => {
        const { phase, result } = await runSanitisedPhase(verificationTask);
        expect(JSON.stringify(result)).not.toContain('unsupported verification tool contract');
        expect(phase.verificationTask?.tool ?? 'none').not.toBe(verificationTask.tool);
        expect(result.ok).toBe(true);
    });

    it('a real checker is still handed to the gate unchanged', async () => {
        const { phase } = await runSanitisedPhase({ task: 'Review the code', tool: 'code_reviewer', args: { files: ['docs/architecture.md'] } });
        expect(phase.verificationTask).toMatchObject({ tool: 'code_reviewer' });
        expect(phase.verificationNote).toBeUndefined();
    });
});
