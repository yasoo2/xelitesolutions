/**
 * Round 21, second review — group Q (fixed in round 22):
 *
 *   - Q9: `"build": "echo No build step required"` counted as a build — the
 *     phase's automatic check ran it, it exited 0, «Auto-build check passed»
 *     and a passed receipt. Three readers of «is this script a placeholder?»
 *     disagreed (the build check: never; the delivery's quality contract: an
 *     echo with one of a few remembered words; the record gate: any lone
 *     echo). One reader now decides, by what the script's commands do.
 *   - Q10: a lint whose parser never answered (a full execution queue) made
 *     quality_run «failed», and self-fix went to repair code nobody had
 *     judged. A check that did not conclude is «incomplete», and the phase
 *     stops on it honestly (verificationUnavailable) instead of repairing.
 */
const executeToolMock = jest.fn();
jest.mock('../modules/services/ToolService', () => ({
    executeTool: (...args: any[]) => executeToolMock(...args),
    TOOL_ALIASES: {},
}));
jest.mock('../shared/run-evidence-store', () => ({
    appendRunEvidenceEvent: jest.fn().mockResolvedValue(undefined),
    createRunEvidence: jest.fn().mockResolvedValue(undefined),
    saveRunReceipt: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../modules/tools/utils', () => ({
    ...jest.requireActual('../modules/tools/utils'),
    resolveToolPath: (value: string, opts?: any) => {
        const actual = jest.requireActual('../modules/tools/utils');
        return require('path').isAbsolute(value) ? value : actual.resolveToolPath(value, opts);
    },
}));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { isPlaceholderScript } from '../core/quality/placeholder-script';
import { declaredBuild, manifestDeclaresBuild } from '../modules/tools/auto-build-readiness';
import { inspectProjectQualityContract } from '../modules/tools/definitions/ProjectPipelineTool';
import { runRequestedTests, testScriptPatchFor } from '../core/quality/request-coverage';
import { verificationResultFromToolResult } from '../core/quality/verification-ledger';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { workspaceService } from '../modules/services/WorkspaceService';

jest.setTimeout(90_000);

const roots: string[] = [];
const tmp = (name: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `joe-r22-checks-${name}-`));
    roots.push(dir);
    return dir;
};
afterAll(() => { for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
afterEach(() => { jest.restoreAllMocks(); executeToolMock.mockReset(); });

const PLACEHOLDERS = [
    'echo No build step required',
    'echo "Error: no test specified" && exit 1',
    "echo 'no tests yet' >&2; exit 1",
    'exit 0', 'true', ':', 'printf done',
];
const REAL = [
    'vite build', 'tsc -p .', 'echo building && vite build', 'node --test', 'echo built > dist/index.html',
    'echo $(node build.js)', 'cp -r src dist', 'echo "a && b" && npm run compile',
];

describe('Q9: one reader of «is this script a placeholder?», by what its commands do', () => {
    it.each(PLACEHOLDERS)('%s — a placeholder', (script) => expect(isPlaceholderScript(script)).toBe(true));
    it.each(REAL)('%s — real work', (script) => expect(isPlaceholderScript(script)).toBe(false));
    it('an empty or absent script is absent, not a placeholder', () => {
        expect(isPlaceholderScript('')).toBe(false);
        expect(isPlaceholderScript(undefined)).toBe(false);
    });

    it('the build check, the delivery contract and the record gate agree on every script', async () => {
        for (const script of [...PLACEHOLDERS, ...REAL]) {
            const root = tmp('readers');
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'p', scripts: { build: script, test: script } }));
            const placeholder = isPlaceholderScript(script);
            const contract = inspectProjectQualityContract(root, '');
            const said = {
                script,
                autoBuild: manifestDeclaresBuild(root),
                contract: contract.failures.some(failure => /build script is a placeholder/u.test(failure)),
                gatePatches: testScriptPatchFor(root) !== null,
            };
            expect(said).toEqual({ script, autoBuild: !placeholder, contract: placeholder, gatePatches: placeholder });
        }
        // The record gate does not run a placeholder test script as his tests.
        const root = tmp('gate');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'p', scripts: { test: 'echo No tests yet' } }));
        const calls: string[] = [];
        const run = await runRequestedTests(root, async (tool: string) => { calls.push(tool); return { ok: true, output: { results: [{ task: 'test', ok: true, skipped: false }] } }; });
        expect(run).toMatchObject({ ran: false, passed: false });
        expect(calls).toEqual([]);
    });

    it('the phase\'s build check does not run a placeholder build or call it passed — it says what it is', async () => {
        const root = tmp('auto-build');
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'site', scripts: { build: 'echo No build step required', start: 'node server.js' } }));
        expect(declaredBuild(root)).toEqual({ kind: 'placeholder', script: 'echo No build step required' });
        const shells: any[] = [];
        executeToolMock.mockImplementation(async (tool: string, input: any) => {
            if (tool === 'shell_execute') { shells.push(input); return { ok: true, output: { stdout: 'No build step required\n' } }; }
            if (tool === 'ai_write_file') fs.writeFileSync(path.join(root, String(input.path)), 'module.exports = 1;\n');
            return { ok: true, output: {} };
        });
        const result: any = await new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Write', tasks: [{ task: 'Write server.js', tool: 'ai_write_file', args: { path: 'server.js', description: 'server' } }] },
            projectContext: { projectName: 'site', totalPhases: 1, isFinalPhase: true, projectRoot: root, projectRootRuntimeBound: true, plannedProjectFiles: ['package.json', 'server.js'], sessionId: 's', workspaceId: 'w', userId: 'u' },
        }, { runId: 'r', sessionId: 's', workspaceId: 'w', userId: 'u' });
        const log = result.logs.join('\n');
        expect(shells).toEqual([]);
        expect(log).toMatch(/Auto-build check skipped honestly: the build script in package\.json is a placeholder \("echo No build step required"\) that builds nothing/u);
        expect(log).not.toMatch(/Auto-build check passed/u);
        expect((result.output.verificationLedger?.receipts || []).filter((r: any) => String(r.checkId).startsWith('auto-build:'))).toEqual([]);
    });
});

describe('Q10: a check that did not run is not a failure of the code', () => {
    const queueFull = { success: false, error: 'Execution queue is full. Please try again later.', data: { code: 'QUEUE_FULL' }, duration: 0 };

    it('quality_run with a lint whose parser never answered is «incomplete», not «failed»', async () => {
        const root = tmp('lint-unchecked');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'p' }));
        fs.writeFileSync(path.join(root, 'a.cjs'), 'module.exports = 1;\n');
        jest.spyOn(ExecutionGateway, 'execute').mockResolvedValue(queueFull as any);
        const result: any = await executionFirewall.runAsSystem(() => new QualityRunTool().execute({ path: root, tasks: ['lint'] }));
        expect(result).toMatchObject({ ok: false, output: { status: 'incomplete' } });
        expect(result.error).toMatch(/^Quality checks could not run: lint: the check could not run: Execution queue is full/u);
        expect(result.error).not.toMatch(/Quality checks failed/u);
        expect(result.logs).toContain('quality_run lint=not checked');
        expect(verificationResultFromToolResult(result)).toBe('incomplete');
    });

    it('a parser\'s real rejection is still «failed», even beside a check that could not run', async () => {
        const root = tmp('lint-rejected');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'p' }));
        fs.writeFileSync(path.join(root, 'a.cjs'), 'module.exports = 1;\n');
        fs.writeFileSync(path.join(root, 'b.cjs'), 'const = 2;\n');
        const real = ExecutionGateway.execute.bind(ExecutionGateway);
        jest.spyOn(ExecutionGateway, 'execute').mockResolvedValueOnce(queueFull as any).mockImplementation(real as any);
        const result: any = await executionFirewall.runAsSystem(() => new QualityRunTool().execute({ path: root, tasks: ['lint'] }));
        expect(result).toMatchObject({ ok: false, output: { status: 'failed' } });
        expect(verificationResultFromToolResult(result)).toBe('failed');
    });

    const runPhase = (root: string, phase: any) => {
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        return new PhaseExecutorTool().execute({
            phase,
            projectContext: { projectName: 'p', totalPhases: 1, isFinalPhase: true, projectRoot: root, projectRootRuntimeBound: true, sessionId: 's', workspaceId: 'w', userId: 'u' },
        }, { runId: 'r', sessionId: 's', workspaceId: 'w', userId: 'u' }) as Promise<any>;
    };
    const incomplete = { ok: false, error: 'Quality checks could not run: lint: the check could not run: Execution queue is full.', output: { status: 'incomplete', results: [{ task: 'lint', ok: false, skipped: false, unchecked: true }] } };

    it('the phase stops on it as a check that was unavailable — its own verification step', async () => {
        const root = tmp('phase-incomplete');
        executeToolMock.mockImplementation(async (tool: string) => (tool === 'quality_run' ? incomplete : { ok: true, output: {} }));
        const result = await runPhase(root, {
            phaseNumber: 1, name: 'Check', tasks: [{ task: 'Write notes', tool: 'write_file', args: { path: 'notes.md', content: 'x' } }],
            verificationTask: { task: 'Lint the code', tool: 'quality_run', args: { path: root, tasks: ['lint'] } },
        });
        expect(result.ok).toBe(false);
        expect(result.output.verificationUnavailable).toBe(true);
        expect(result.output.results.find((r: any) => r.task === 'Lint the code')).toMatchObject({ ok: false, error: expect.stringMatching(/^verification_unavailable: Quality checks could not run/u) });
    });

    it('…and as a task of the phase', async () => {
        const root = tmp('task-incomplete');
        executeToolMock.mockImplementation(async (tool: string) => (tool === 'quality_run' ? incomplete : { ok: true, output: {} }));
        const result = await runPhase(root, { phaseNumber: 1, name: 'Check', tasks: [{ task: 'Lint the code', tool: 'quality_run', args: { path: root, tasks: ['lint'] } }] });
        expect(result.ok).toBe(false);
        expect(result.output.verificationUnavailable).toBe(true);
        // A real failure of the same check is still a failure to repair.
        executeToolMock.mockImplementation(async () => ({ ok: false, error: 'Quality checks failed: lint: b.cjs:1: SyntaxError', output: { status: 'failed', results: [{ task: 'lint', ok: false, skipped: false }] } }));
        const failed = await runPhase(root, { phaseNumber: 1, name: 'Check', tasks: [{ task: 'Lint the code', tool: 'quality_run', args: { path: root, tasks: ['lint'] } }] });
        expect(failed.ok).toBe(false);
        expect(failed.output.verificationUnavailable).toBeUndefined();
    });
});
