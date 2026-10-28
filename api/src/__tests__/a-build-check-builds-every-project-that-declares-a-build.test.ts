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
import { autoBuildManifests, manifestDeclaresBuild } from '../modules/tools/auto-build-readiness';

/**
 * Round 21 review:
 *   - group 1 #4: the phase's build check took the FIRST manifest — a phase of
 *     a two-project plan (an API and its web client) built one project and
 *     never the other. The manifest is now the nearest one above each file the
 *     phase wrote, and every manifest the phase touched is checked.
 *   - group 4 #1: `npm run --if-present build` with no build script prints
 *     nothing and exits 0, and that was logged «Auto-build check passed» with
 *     a passed receipt for a build that never ran. One reader decides whether
 *     the project declares a build (shared with self-fix); without one the
 *     check is skipped, said, and leaves no receipt.
 */
const mockedExecuteTool = executeTool as jest.MockedFunction<typeof executeTool>;

const API = JSON.stringify({ name: 'api', scripts: { build: 'tsc -p .', start: 'node dist/server.js' } });
const WEB = JSON.stringify({ name: 'web', scripts: { build: 'vite build' } });
const PLAIN = JSON.stringify({ name: 'plain-server', scripts: { start: 'node server.js' }, dependencies: {} });

type Call = { tool: string; input: any };

async function runPhase(root: string, writes: Record<string, string>, opts: { plannedProjectFiles?: string[]; isFinalPhase?: boolean } = {}) {
    const calls: Call[] = [];
    mockedExecuteTool.mockImplementation(async (tool: any, input: any) => {
        calls.push({ tool, input });
        if (tool === 'ai_write_file') {
            const file = path.join(root, String(input?.path));
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, writes[String(input?.path)] ?? 'export {};\n');
            return { ok: true, output: { path: input?.path } } as any;
        }
        if (tool === 'shell_execute') return { ok: true, output: { stdout: '' } } as any;
        return { ok: true, output: {} } as any;
    });
    const result: any = await new PhaseExecutorTool().execute({
        phase: { phaseNumber: 2, name: 'Phase 2', tasks: Object.keys(writes).map(file => (
            { task: `Write ${file}`, tool: 'ai_write_file', args: { path: file, description: file } })) },
        projectContext: { projectName: 'pair', totalPhases: 3, isFinalPhase: opts.isFinalPhase === true,
            projectRoot: root, projectRootRuntimeBound: true,
            ...(opts.plannedProjectFiles ? { plannedProjectFiles: opts.plannedProjectFiles } : {}),
            sessionId: 's', workspaceId: 'w', userId: 'u' },
    }, { runId: 'r', sessionId: 's', workspaceId: 'w', userId: 'u' });
    const builds = calls.filter(call => call.tool === 'shell_execute').map(call => call.input.cwd || '.');
    const receipts = (result.output?.verificationLedger?.receipts || []).filter((receipt: any) => String(receipt.checkId || '').startsWith('auto-build:'));
    return { result, builds, receipts, log: result.logs.join('\n') };
}

describe('the build check builds every project the phase wrote into, when it declares a build', () => {
    let root = '';
    const put = (rel: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    };
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-two-projects-'));
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        mockedExecuteTool.mockReset();
        // Earlier phases put both manifests (installed) on disk.
        put('api/package.json', API);
        put('web/package.json', WEB);
        fs.mkdirSync(path.join(root, 'api', 'node_modules'), { recursive: true });
        fs.mkdirSync(path.join(root, 'web', 'node_modules'), { recursive: true });
    });
    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(root, { recursive: true, force: true });
    });

    const PLAN = ['api/package.json', 'api/src/server.ts', 'web/package.json', 'web/src/App.jsx'];

    it('a phase that wrote into both projects builds both', async () => {
        const { builds, receipts } = await runPhase(root, { 'api/src/server.ts': 'export {};\n', 'web/src/App.jsx': 'export default 1;\n' }, { plannedProjectFiles: PLAN });
        expect(builds.sort()).toEqual(['api', 'web']);
        expect(receipts.map((receipt: any) => receipt.result)).toEqual(['passed', 'passed']);
    });

    it('a phase that wrote into one project builds that one — not the first manifest of the plan', async () => {
        const { builds } = await runPhase(root, { 'web/src/App.jsx': 'export default 1;\n' }, { plannedProjectFiles: PLAN });
        expect(builds).toEqual(['web']);
    });

    it('the nearest manifest wins over one further up', () => {
        put('package.json', JSON.stringify({ name: 'root', scripts: { build: 'echo root' } }));
        expect(autoBuildManifests(['web/src/App.jsx', 'README.md'], ['package.json', ...PLAN], 'w')).toEqual(['package.json', 'web/package.json']);
        expect(autoBuildManifests(['docs/notes.md'], PLAN, 'w')).toEqual([]);
        // The final phase never waits, so it also discharges every planned project on disk.
        expect(autoBuildManifests(['docs/notes.md'], PLAN, 'w', { everyPlanned: true })).toEqual(['api/package.json', 'web/package.json']);
    });

    it('a project that declares no build is not «passed»: the check is skipped, said, and leaves no receipt', async () => {
        put('server/package.json', PLAIN);
        fs.mkdirSync(path.join(root, 'server', 'node_modules'), { recursive: true });
        const { result, builds, receipts, log } = await runPhase(root, { 'server/server.js': 'module.exports = 1;\n' }, { plannedProjectFiles: ['server/package.json', 'server/server.js'] });
        expect(builds).toEqual([]);
        expect(receipts).toEqual([]);
        expect(log).toMatch(/Auto-build check skipped honestly: server\/package\.json declares no build script/u);
        expect(log).not.toMatch(/Auto-build check passed/u);
        expect(result.ok).toBe(true);
    });

    it('one reader of «does this project declare a build?», shared with self-fix', () => {
        put('a/package.json', JSON.stringify({ scripts: { build: 'vite build' } }));
        put('b/package.json', JSON.stringify({ scripts: { build: '   ' } }));
        put('c/package.json', JSON.stringify({ scripts: { start: 'node .' } }));
        put('d/package.json', '{ not json');
        expect(manifestDeclaresBuild(path.join(root, 'a'))).toBe(true);
        expect(manifestDeclaresBuild(path.join(root, 'b'))).toBe(false);
        expect(manifestDeclaresBuild(path.join(root, 'c'))).toBe(false);
        // An unreadable manifest keeps the build, so npm says what is wrong with it.
        expect(manifestDeclaresBuild(path.join(root, 'd'))).toBe(true);
        const selfFix = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'SelfFixExecutionService.ts'), 'utf-8');
        expect(selfFix).toMatch(/import \{ manifestDeclaresBuild \} from '\.\.\/tools\/auto-build-readiness'/u);
        expect(selfFix).not.toMatch(/function manifestDeclaresBuild/u);
    });
});
