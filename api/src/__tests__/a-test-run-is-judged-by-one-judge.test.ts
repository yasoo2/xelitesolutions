/**
 * Round 21, second review — group Q (fixed in round 22):
 *
 *   - Q1: a plan's own verification step (`shell_execute npm test`,
 *     `node --test`, `npx jest`, `npx vitest run`) was judged by its exit code
 *     alone — «ℹ tests 0», exit 0 → a passed receipt and a completed task. The
 *     same by reading in the delivery's run of the generated app's suite
 *     (terminal-audit app_tests), the spec verifier and the import review. One
 *     judge now (judgeTestRun): a test run passed when it exited 0 AND its
 *     runner's own summary does not say it ran nothing — asked everywhere a
 *     test command's exit code becomes a verdict.
 *   - the review's unverified note: vitest's all-skipped summary
 *     («Tests  2 skipped (2)») was not read by the jest reader.
 *
 * node --test, npm and Python run for real here; the jest and vitest
 * summaries are recorded from those runners.
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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { emptyTestRun, isRunnerSummaryLine, isTestRunCommand, judgeTestRun } from '../core/quality/test-run-evidence';
import { judgedTestRunResult, verificationResultFromToolResult } from '../core/quality/verification-ledger';
import { auditInTerminal } from '../core/quality/terminal-audit';
import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { SpecificationVerificationTool } from '../modules/tools/definitions/SpecificationVerificationTool';
import { auditImportedProject } from '../modules/tools/definitions/ImportProjectTool';
import { workspaceService } from '../modules/services/WorkspaceService';

jest.setTimeout(120_000);

const roots: string[] = [];
const tmp = (name: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `joe-r22-checks-${name}-`));
    roots.push(dir);
    return dir;
};
afterAll(() => { for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
afterEach(() => { jest.restoreAllMocks(); executeToolMock.mockReset(); });

/** What `node --test` prints in a folder with no test file — measured on this Node. */
function emptyNodeTestRun(): { status: number | null; printed: string } {
    const dir = tmp('node-empty');
    const run = spawnSync(process.execPath, ['--test'], { cwd: dir, encoding: 'utf-8' });
    return { status: run.status, printed: `${run.stdout}\n${run.stderr}` };
}

const RECORDED = {
    vitestAllSkipped: ' ↓ src/sum.test.ts (2 tests | 2 skipped)\n\n Test Files  1 skipped (1)\n      Tests  2 skipped (2)\n   Start at  10:02:11\n   Duration  312ms\n',
    vitestRan: ' ✓ src/sum.test.ts (2 tests) 3ms\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)\n   Start at  10:02:11\n   Duration  290ms\n',
    vitestMixed: ' ❯ src/sum.test.ts (2 tests | 1 failed) 5ms\n\n Test Files  1 failed (1)\n      Tests  1 failed | 1 passed (2)\n',
    vitestTodo: '      Tests  1 todo (1)\n',
    jestAllSkipped: 'Test Suites: 1 skipped, 0 of 1 total\nTests:       2 skipped, 2 total\nSnapshots:   0 total\nTime:        0.4 s\n',
    jestRan: 'Test Suites: 1 passed, 1 total\nTests:       2 passed, 2 total\nSnapshots:   0 total\n',
    cargoManyBinaries: [
        '     Running unittests src/lib.rs (target/debug/deps/lib-1)',
        '', 'running 3 tests', 'test a ... ok', 'test b ... ok', 'test c ... ok', '',
        'test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
        ...Array.from({ length: 300 }, (_, i) => `   Compiling dep-${i} v1.0.0`),
        '     Running tests/cli.rs (target/debug/deps/cli-2)', '', 'running 0 tests', '',
        'test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
        '   Doc-tests lib', '', 'running 0 tests', '',
        'test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
    ].join('\n'),
};

describe('one judge of a test run', () => {
    it('the premise, measured: `node --test` with no test file prints «ℹ tests 0» and exits 0', () => {
        const { status, printed } = emptyNodeTestRun();
        expect(status).toBe(0);
        expect(printed).toMatch(/ℹ tests 0/u);
        expect(judgeTestRun(true, printed)).toMatchObject({ passed: false, ranNothing: { runner: 'node --test' }, reason: expect.stringMatching(/^the test command ran no tests \(node --test: ℹ tests 0\)$/u) });
        // A run that failed keeps its own failure: the judge only refuses the empty pass.
        expect(judgeTestRun(false, printed)).toEqual({ passed: false, ranNothing: null, reason: '' });
    });

    it('vitest\'s own summary is read: all skipped or todo is nothing run (the review\'s unverified note)', () => {
        expect(emptyTestRun(RECORDED.vitestAllSkipped)).toMatchObject({ runner: 'vitest', evidence: 'Tests  2 skipped (2)' });
        expect(emptyTestRun(RECORDED.vitestTodo)).toMatchObject({ runner: 'vitest' });
        expect(emptyTestRun(RECORDED.vitestRan)).toBeNull();
        expect(emptyTestRun(RECORDED.vitestMixed)).toBeNull();
        expect(emptyTestRun(RECORDED.jestAllSkipped)).toMatchObject({ runner: 'jest' });
        expect(emptyTestRun(RECORDED.jestRan)).toBeNull();
    });

    it('the summary lines alone give the verdict the whole output gives — a bounded display can keep them', () => {
        const corpus = [...Object.values(RECORDED), emptyNodeTestRun().printed,
            'Ran 0 tests in 0.000s\n\nOK\n', 'test_a ... ok\n\nRan 1 test in 0.001s\n\nOK\n', 'Ran 2 tests in 0.001s\n\nOK (skipped=2)\n',
            '?   \tcli\t[no test files]\n', 'ok  \tcli\t0.004s\n', '=== 1 failed, 2 passed in 0.03s ===\n', '  0 passing (1ms)\n'];
        for (const output of corpus) {
            const summary = output.split(/\r?\n/u).filter(isRunnerSummaryLine).join('\n');
            expect({ output: output.slice(0, 60), verdict: emptyTestRun(summary) }).toEqual({ output: output.slice(0, 60), verdict: emptyTestRun(output) });
        }
        // The cargo run whose first binary ran tests 300 lines before the empty ones:
        // a head or a tail of the output alone gets it wrong; the summary lines do not.
        expect(emptyTestRun(RECORDED.cargoManyBinaries)).toBeNull();
        expect(emptyTestRun(RECORDED.cargoManyBinaries.split('\n').slice(-60).join('\n'))).toMatchObject({ runner: 'cargo test' });
    });

    it('a test command is a test runner or a package script named test — a log that mentions tests is not', () => {
        for (const command of ['npm test', 'npm run test', 'npm run test:unit', 'pnpm test', 'yarn test', 'node --test', 'node --test tests/',
            'npx jest', 'npx jest --ci', 'npx vitest run', 'python -m pytest -q', 'python3 -m unittest discover', 'cargo test', 'go test ./...',
            'cd app && npm test', 'npx playwright test']) {
            expect({ command, test: isTestRunCommand(command) }).toEqual({ command, test: true });
        }
        for (const command of ['npm run build', 'npm install', 'cat test.log', 'node index.js --test', 'npm run testing', 'npx tsc --noEmit', 'echo done']) {
            expect({ command, test: isTestRunCommand(command) }).toEqual({ command, test: false });
        }
    });

    it('a test command\'s tool result is judged where it ran: an empty run becomes a failure that says so', () => {
        const { printed } = emptyNodeTestRun();
        const empty = { ok: true, output: { stdout: printed, stderr: '', exitCode: 0 } };
        const judged: any = judgedTestRunResult('shell_execute', { command: 'npm test' }, empty);
        expect(judged).toMatchObject({ ok: false, error: 'the test command ran no tests (node --test: ℹ tests 0)', output: { status: 'failed', ranNothing: { runner: 'node --test' } } });
        expect(verificationResultFromToolResult(judged)).toBe('failed');
        // Everything else is returned as it came.
        const ran = { ok: true, output: { stdout: 'ℹ tests 3\nℹ pass 3\n' } };
        expect(judgedTestRunResult('shell_execute', { command: 'npm test' }, ran)).toBe(ran);
        expect(judgedTestRunResult('shell_execute', { command: 'cat test.log' }, empty)).toBe(empty);
        expect(judgedTestRunResult('quality_run', { command: 'npm test' }, empty)).toBe(empty);
        const failed = { ok: false, error: 'exit 1', output: { stdout: printed } };
        expect(judgedTestRunResult('shell_execute', { command: 'npm test' }, failed)).toBe(failed);
    });
});

describe('every place a test exit code becomes a verdict asks the judge', () => {
    const phase = async (root: string, task: any, verificationTask?: any) => {
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        return new PhaseExecutorTool().execute({
            phase: { phaseNumber: 1, name: 'Verify', tasks: [task], ...(verificationTask ? { verificationTask } : {}) },
            projectContext: { projectName: 'p', totalPhases: 1, isFinalPhase: true, projectRoot: root, projectRootRuntimeBound: true, sessionId: 's', workspaceId: 'w', userId: 'u' },
        }, { runId: 'r', sessionId: 's', workspaceId: 'w', userId: 'u' }) as Promise<any>;
    };

    it('a plan step `shell_execute node --test` that ran nothing is a failed task and a failed receipt, not passed', async () => {
        const root = tmp('phase-task');
        const { printed } = emptyNodeTestRun();
        executeToolMock.mockResolvedValue({ ok: true, output: { stdout: printed, stderr: '', exitCode: 0 } });
        const result = await phase(root, { task: 'Run the tests', tool: 'shell_execute', args: { command: 'node --test', cwd: root } });
        expect(result.ok).toBe(false);
        expect(result.output.results[0]).toMatchObject({ tool: 'shell_execute', ok: false, error: expect.stringMatching(/^the test command ran no tests \(node --test: ℹ tests 0\)/u) });
        expect(result.output.verificationLedger.receipts.map((receipt: any) => receipt.result)).toEqual(['failed']);

        executeToolMock.mockResolvedValue({ ok: true, output: { stdout: 'ℹ tests 2\nℹ pass 2\nℹ fail 0\n', stderr: '', exitCode: 0 } });
        const ran = await phase(root, { task: 'Run the tests', tool: 'shell_execute', args: { command: 'node --test', cwd: root } });
        expect(ran.output.results[0]).toMatchObject({ ok: true });
        expect(ran.output.verificationLedger.receipts.map((receipt: any) => receipt.result)).toEqual(['passed']);
    });

    it('a phase\'s own verification step `shell_execute npm test` that ran nothing fails the verification', async () => {
        const root = tmp('phase-verification');
        fs.writeFileSync(path.join(root, 'notes.md'), 'x\n');
        executeToolMock.mockImplementation(async (tool: string) => tool === 'shell_execute'
            ? { ok: true, output: { stdout: 'No tests found, exiting with code 0\n', stderr: '', exitCode: 0 } }
            : { ok: true, output: {} });
        const result = await phase(root, { task: 'Write notes', tool: 'write_file', args: { path: 'notes.md', content: 'x' } },
            { task: 'Run the tests', tool: 'shell_execute', args: { command: 'npm test', cwd: root } });
        expect(result.ok).toBe(false);
        expect(result.output.verificationFailed).toBe(true);
        expect(result.output.results.find((r: any) => r.task === 'Run the tests')).toMatchObject({ ok: false, error: expect.stringMatching(/ran no tests \(jest\/vitest: No tests found/u) });
    });

    it('the delivery\'s run of the generated app\'s suite (terminal-audit app_tests): exit 0 with no test is not «passed»', async () => {
        const dir = tmp('audit-server');
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'server', scripts: { start: 'node server.js' } }));
        const appDir = path.join(dir, 'web');
        fs.mkdirSync(appDir);
        fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({ name: 'web', scripts: { test: 'node --test' } }));
        const empty = await auditInTerminal(dir, { appDir, timeoutMs: 20_000 });
        expect(empty.checks.find(check => check.id === 'app_tests')).toMatchObject({ ok: false, detail: expect.stringMatching(/^the test command ran no tests \(node --test: ℹ tests 0\)/u) });

        fs.writeFileSync(path.join(appDir, 'sum.test.js'), "const test = require('node:test');\nconst assert = require('node:assert');\ntest('sums', () => assert.strictEqual(1 + 1, 2));\n");
        const ran = await auditInTerminal(dir, { appDir, timeoutMs: 20_000 });
        expect(ran.checks.find(check => check.id === 'app_tests')).toMatchObject({ ok: true, detail: 'the generated application test suite passed' });
    });

    it('the spec verifier: an acceptance criterion is not «verified by tests» that never ran', async () => {
        const ws = tmp('spec');
        const root = path.join(ws, 'app');
        fs.mkdirSync(root);
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(ws);
        const { printed } = emptyNodeTestRun();
        executeToolMock.mockResolvedValue({ ok: true, output: { stdout: printed, stderr: '' } });
        const empty = await (new SpecificationVerificationTool() as any).runTests([], root);
        expect(empty).toEqual({ pass: false, evidence: 'Tests did not run: the test command ran no tests (node --test: ℹ tests 0)' });
        executeToolMock.mockResolvedValue({ ok: true, output: { stdout: 'ℹ tests 1\nℹ pass 1\n', stderr: '' } });
        expect(await (new SpecificationVerificationTool() as any).runTests([], root)).toEqual({ pass: true, evidence: 'Tests passed' });
    });

    it('the import review: a declared `node --test` that runs no test is not «passed»', async () => {
        const root = tmp('import');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'imported', scripts: { test: 'node --test' } }));
        fs.writeFileSync(path.join(root, 'README.md'), '# imported\n');
        const empty = await auditImportedProject(root, { isAr: false });
        expect(empty.verification).toMatchObject({ status: 'ran_no_tests', command: 'npm test', exitCode: 0, message: expect.stringMatching(/exited 0 but ran no test \(node --test: ℹ tests 0\); that is not a pass/u) });
        expect(empty.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'test-ran-nothing' })]));

        fs.writeFileSync(path.join(root, 'smoke.test.js'), "const test = require('node:test');\ntest('smoke', () => {});\n");
        expect((await auditImportedProject(root, { isAr: false })).verification).toMatchObject({ status: 'passed' });
    });
});
