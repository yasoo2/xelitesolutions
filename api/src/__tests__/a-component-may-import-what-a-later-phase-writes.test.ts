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

/**
 * Eval round 12, 2026-10-23 (P001): phase 2 wrote App.tsx, which imports
 * Header, Hero, Services, Reviews, Contact and Footer, files phases 3+ of the
 * same plan create. The import gate knew only the current phase's files, so it
 * rejected App.tsx six times over an hour. The whole plan's files are planned.
 */
const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

describe('a component may import what a later phase writes', () => {
    it('the writer is told every file the whole plan will write', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-planned-'));
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        let seen: string[] = [];
        mockedExecuteTool.mockImplementation(async (tool: any, input: any, context: any) => {
            if (tool === 'ai_write_file') {
                seen = [...(context?.plannedPhaseFiles || [])];
                const file = path.join(root, String(input?.path));
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, 'export default function App() { return null; }');
            }
            return { ok: true, output: { path: input?.path } } as any;
        });
        try {
            await new PhaseExecutorTool().execute({
                phase: { phaseNumber: 2, name: 'Core Layout', tasks: [
                    { task: 'Create main App component', tool: 'ai_write_file', args: { path: 'clinic/src/App.tsx', description: 'App' } },
                ] },
                projectContext: { projectName: 'clinic', totalPhases: 4, isFinalPhase: false,
                    projectRoot: root, projectRootRuntimeBound: true,
                    plannedProjectFiles: ['clinic/src/App.tsx', 'clinic/src/components/Header.tsx', 'clinic/src/pages/Hero.tsx'],
                    sessionId: 's', workspaceId: 'w', userId: 'u' },
            }, { runId: 'r', sessionId: 's', workspaceId: 'w', userId: 'u' });
            expect(seen).toEqual(expect.arrayContaining(['clinic/src/App.tsx', 'clinic/src/components/Header.tsx', 'clinic/src/pages/Hero.tsx']));
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });

    it('the agent loop gives each phase the whole plan\'s written files', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf8');
        expect(src).toContain('plannedProjectFiles: Array.from(new Set<string>(phases.flatMap(');
    });
});
