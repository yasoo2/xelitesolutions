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
import { buildFailureEvidence } from '../modules/tools/auto-build-readiness';

/**
 * Eval run500, P001-landing-ar (2026-10-25, run-1792949598462). Phase 1 of a
 * four-phase plan wrote dental-clinic-site/package.json (vite in
 * devDependencies) and src/index.ts; the auto-build then ran in a folder never
 * installed:
 *
 *     'vite' is not recognized as an internal or external command
 *     BUILD_CHECK_FAILED
 *
 * The phase failed as a bare "Auto-build check failed", self-fix found "no
 * evidence-bound repair file", and the build stopped at 0/4 — while
 * public/index.html and the components were phases 2–3's work.
 *
 * The check runs on the project as the plan makes it: installed first, after
 * the plan's files exist (the final phase never waits), speaking the build's words.
 */
const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

const MANIFEST = JSON.stringify({ name: 'clinic', scripts: { build: 'vite build' }, devDependencies: { vite: '^5.0.10' } });
const PLAN = ['clinic/package.json', 'clinic/src/index.ts', 'clinic/index.html', 'clinic/src/components/Hero.tsx'];

type Call = { tool: string; input: any };

async function runPhase(root: string, opts: {
    phaseNumber: number;
    writes: string[];
    isFinalPhase?: boolean;
    plannedProjectFiles?: string[];
    buildOutput?: string;
    installOk?: boolean;
}) {
    const calls: Call[] = [];
    mockedExecuteTool.mockImplementation(async (tool: any, input: any) => {
        calls.push({ tool, input });
        if (tool === 'ai_write_file') {
            const file = path.join(root, String(input?.path));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, /package\.json$/.test(file) ? MANIFEST : 'export {};\n');
            return { ok: true, output: { path: input?.path } } as any;
        }
        if (tool === 'npm_manager') {
            if (opts.installOk === false) return { ok: false, error: 'npm ERR! 404 Not Found - GET https://registry.npmjs.org/vitee' } as any;
            fs.mkdirSync(path.join(root, String(input?.cwd || '.'), 'node_modules'), { recursive: true });
            return { ok: true, output: 'added 12 packages' } as any;
        }
        if (tool === 'shell_execute') {
            return { ok: true, output: { stdout: opts.buildOutput ?? 'vite v5.0.10 building for production...\n✓ built in 1.2s\n' } } as any;
        }
        return { ok: true, output: {} } as any;
    });
    const result: any = await new PhaseExecutorTool().execute({
        phase: { phaseNumber: opts.phaseNumber, name: `Phase ${opts.phaseNumber}`, tasks: opts.writes.map(file => (
            { task: `Write ${file}`, tool: 'ai_write_file', args: { path: file, description: file } })) },
        projectContext: { projectName: 'clinic', totalPhases: 4, isFinalPhase: opts.isFinalPhase === true,
            projectRoot: root, projectRootRuntimeBound: true,
            ...(opts.plannedProjectFiles ? { plannedProjectFiles: opts.plannedProjectFiles } : {}),
            sessionId: 's', workspaceId: 'w', userId: 'u' },
    }, { runId: 'r', sessionId: 's', workspaceId: 'w', userId: 'u' });
    return { result, calls, tools: calls.map(c => c.tool).filter(t => t !== 'ai_write_file') };
}

describe('a build check runs on the project the plan makes', () => {
    let root = '';
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-autobuild-'));
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        mockedExecuteTool.mockReset();
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('P001: phase 1 of 4 does not build a project whose page a later phase writes', async () => {
        const { result, tools } = await runPhase(root, { phaseNumber: 1, writes: ['clinic/package.json', 'clinic/src/index.ts'], plannedProjectFiles: PLAN });
        expect(tools).toEqual([]);
        expect(result.ok).toBe(true);
        expect(result.logs.join('\n')).toMatch(/waits for the phase that completes this project: 2 planned file\(s\).*clinic\/index\.html/);
    });

    it('the phase that writes the last planned file installs the manifest, then builds inside the project', async () => {
        await runPhase(root, { phaseNumber: 1, writes: ['clinic/package.json', 'clinic/src/index.ts'], plannedProjectFiles: PLAN });
        const { result, calls, tools } = await runPhase(root, { phaseNumber: 3, writes: ['clinic/index.html', 'clinic/src/components/Hero.tsx'], plannedProjectFiles: PLAN });
        expect(tools).toEqual(['npm_manager', 'shell_execute']);
        expect(calls.find(c => c.tool === 'npm_manager')!.input).toEqual({ command: 'install --ignore-scripts --no-audit --no-fund', cwd: 'clinic' });
        expect(calls.find(c => c.tool === 'shell_execute')!.input.cwd).toBe('clinic');
        expect(result.ok).toBe(true);
    });

    it('an installed project is not installed again', async () => {
        fs.mkdirSync(path.join(root, 'clinic', 'node_modules'), { recursive: true });
        const { tools } = await runPhase(root, { phaseNumber: 1, writes: ['clinic/package.json', 'clinic/src/index.ts'] });
        expect(tools).toEqual(['shell_execute']);
    });

    it('the final phase never waits: missing planned files are the build\'s to report', async () => {
        const { tools } = await runPhase(root, { phaseNumber: 4, isFinalPhase: true, writes: ['clinic/package.json'], plannedProjectFiles: PLAN });
        expect(tools).toEqual(['npm_manager', 'shell_execute']);
    });

    it('a failed build carries what the build said, so self-fix has evidence', async () => {
        const { result } = await runPhase(root, {
            phaseNumber: 1, writes: ['clinic/package.json', 'clinic/src/index.ts'],
            buildOutput: '> vite build\r\n\u001b[31merror\u001b[0m Cannot find module \'./components/Hero\' imported from src/main.tsx\r\nBUILD_CHECK_FAILED\r\n',
        });
        expect(result.ok).toBe(false);
        expect(String(result.error)).toContain('Auto-build check failed:');
        expect(String(result.error)).toContain("Cannot find module './components/Hero' imported from src/main.tsx");
        expect(String(result.error)).not.toContain('BUILD_CHECK_FAILED');
    });

    it('a failed install fails the check with npm\'s words and never runs the build', async () => {
        const { result, tools } = await runPhase(root, { phaseNumber: 1, writes: ['clinic/package.json', 'clinic/src/index.ts'], installOk: false });
        expect(tools).toEqual(['npm_manager']);
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/could not install the declared dependencies: npm ERR! 404/);
    });

    it('the evidence keeps the end of a long log, where the error is', () => {
        const said = buildFailureEvidence(`${'transforming...\n'.repeat(200)}error TS2304: Cannot find name 'x'.\nBUILD_CHECK_FAILED\n`, 120);
        expect(said.length).toBeLessThanOrEqual(120);
        expect(said.endsWith("error TS2304: Cannot find name 'x'.")).toBe(true);
    });
});
