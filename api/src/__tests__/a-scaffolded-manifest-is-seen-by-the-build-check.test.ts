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
import { planWrites, plannedTaskWrites } from '../modules/tools/auto-build-readiness';

/**
 * Eval run500, P001-landing-ar (2026-10-28, run-1793183272224). Phase 1 was a
 * scaffold_project task (baseDir «dental-clinic-landing», structure with
 * package.json); the terminal then said:
 *
 *     Auto-build check skipped honestly: this phase wrote no package.json
 *
 * Only path/filename arguments were read as writes, and the plan's file list
 * held only ai_write_file/write_file paths, so no phase of a scaffolded
 * project ever found the manifest it had written, and its build never ran.
 */
const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

const MANIFEST = JSON.stringify({ name: 'clinic', scripts: { build: 'vite build' }, devDependencies: { vite: '^5.0.10' } });
const SCAFFOLD = { task: 'Initialize project', tool: 'scaffold_project', args: {
    baseDir: 'clinic',
    structure: { 'package.json': MANIFEST, 'index.html': '<div id="root"></div>', 'src/components': null },
} };
const PLAN = [
    { phaseNumber: 1, tasks: [SCAFFOLD] },
    { phaseNumber: 2, tasks: [{ task: 'Write App', tool: 'ai_write_file', args: { path: 'clinic/src/App.tsx' } }] },
];

async function runPhase(root: string, phaseNumber: number, tasks: any[], plannedProjectFiles: string[] = planWrites(PLAN)) {
    const tools: string[] = [];
    mockedExecuteTool.mockImplementation(async (tool: any, input: any) => {
        tools.push(tool);
        const write = (file: string, content: string) => {
            fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
            fs.writeFileSync(path.join(root, file), content);
        };
        if (tool === 'scaffold_project') {
            for (const [key, content] of Object.entries(input.structure)) if (content !== null) write(`${input.baseDir}/${key}`, String(content));
        }
        if (tool === 'ai_write_file') write(String(input.path), 'export {};\n');
        if (tool === 'npm_manager') fs.mkdirSync(path.join(root, String(input?.cwd || '.'), 'node_modules'), { recursive: true });
        if (tool === 'shell_execute') return { ok: true, output: { stdout: '✓ built in 1.2s\n' } } as any;
        return { ok: true, output: {} } as any;
    });
    const result: any = await new PhaseExecutorTool().execute({
        phase: { phaseNumber, name: `Phase ${phaseNumber}`, tasks },
        projectContext: { projectName: 'clinic', totalPhases: 2, isFinalPhase: false,
            projectRoot: root, projectRootRuntimeBound: true, plannedProjectFiles,
            sessionId: 's', workspaceId: 'w', userId: 'u' },
    }, { runId: 'r', sessionId: 's', workspaceId: 'w', userId: 'u' });
    return { log: result.logs.join('\n'), tools: tools.filter(t => !['scaffold_project', 'ai_write_file'].includes(t)) };
}

describe('a scaffolded manifest is seen by the build check', () => {
    let root = '';
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-scaffold-build-'));
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        mockedExecuteTool.mockReset();
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('a scaffold task writes baseDir + each file key; directories and a repeated baseDir are read as the tool writes them', () => {
        expect(plannedTaskWrites(SCAFFOLD)).toEqual(['clinic/package.json', 'clinic/index.html']);
        expect(plannedTaskWrites({ tool: 'scaffold_project', args: { baseDir: 'clinic/', structure: { 'clinic/package.json': '{}', 'clinic\\src\\main.tsx': '' } } }))
            .toEqual(['clinic/package.json', 'clinic/src/main.tsx']);
        expect(plannedTaskWrites({ tool: 'scaffold_project', args: { structure: { 'package.json': '{}' } } })).toEqual(['package.json']);
        expect(plannedTaskWrites({ tool: 'ai_write_file', args: { path: './clinic/src/App.tsx' } })).toEqual(['clinic/src/App.tsx']);
        expect(planWrites(PLAN)).toEqual(['clinic/package.json', 'clinic/index.html', 'clinic/src/App.tsx']);
    });

    it('P001: the scaffolding phase knows it wrote package.json and waits for the files a later phase writes', async () => {
        const { log, tools } = await runPhase(root, 1, [SCAFFOLD]);
        expect(log).not.toMatch(/wrote no package\.json/);
        expect(log).toMatch(/waits for the phase that completes this project: 1 planned file\(s\).*clinic\/src\/App\.tsx/);
        expect(tools).toEqual([]);
    });

    it('the phase that writes the last planned file builds the scaffolded project', async () => {
        await runPhase(root, 1, [SCAFFOLD]);
        const { log, tools } = await runPhase(root, 2, PLAN[1].tasks);
        expect(log).toMatch(/Auto-running build check in clinic/);
        expect(tools).toEqual(['npm_manager', 'shell_execute']);
    });

    it('a scaffold phase with no plan list still builds the manifest it wrote', async () => {
        const { log, tools } = await runPhase(root, 1, [SCAFFOLD], []);
        expect(log).toMatch(/Auto-running build check in clinic/);
        expect(tools).toEqual(['npm_manager', 'shell_execute']);
    });
});
