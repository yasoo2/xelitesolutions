/**
 * THE RED STEP THAT KILLED THE GREEN PLAN (executor flow).
 *
 * EVAL-003 phase 2 is a red-green sequence: write a reproducing test, run it
 * to confirm it fails, apply the fix, re-run to confirm it passes. The
 * executor halted on the red step (a clean assertion-level report: 2 run, 2
 * failed), retried it identically, and stopped the phase, so the planned fix
 * never ran. A shell test command that produces an executed test report has a
 * working harness: its failure is diagnostic evidence for the remaining
 * tasks, not a blocking defect. The executor must record the report, skip
 * the blind retry, and continue; the phase verification stays the final
 * arbiter. Harness failures (nothing ran) keep the legacy halt behavior,
 * and a failing final verification still fails the phase.
 */
const executeToolMock = jest.fn();

jest.mock('../modules/services/ToolService', () => ({
    executeTool: (...args: any[]) => executeToolMock(...args),
}));

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';

const RED_SPEC = [
    '\u2716 high priority tasks should be processed before normal priority (3.2078ms)',
    '\u2716 urgent priority tasks should be processed before high priority (0.5077ms)',
    '\u2139 tests 2',
    '\u2139 suites 0',
    '\u2139 pass 0',
    '\u2139 fail 2',
    '\u2139 cancelled 0',
    '\u2139 skipped 0',
    '\u2139 todo 0',
    '\u2139 duration_ms 324.6713',
].join('\n');

const GREEN_SPEC = [
    '\u2714 high priority tasks should be processed before normal priority (1.1ms)',
    '\u2714 urgent priority tasks should be processed before high priority (0.5ms)',
    '\u2139 tests 2',
    '\u2139 suites 0',
    '\u2139 pass 2',
    '\u2139 fail 0',
    '\u2139 cancelled 0',
    '\u2139 skipped 0',
    '\u2139 todo 0',
    '\u2139 duration_ms 120.4',
].join('\n');

const CONTEXT = {
    sessionId: 'diag-session',
    workspaceId: 'diag-workspace',
    userId: 'diag-user',
};

describe('PhaseExecutor diagnostic test steps', () => {
    beforeEach(() => executeToolMock.mockReset());

    it('continues past a red step and completes when verification passes', async () => {
        executeToolMock
            .mockResolvedValueOnce({ ok: true, output: { path: 'test/red.test.ts' }, logs: [] })
            .mockResolvedValueOnce({
                ok: false,
                error: 'command_failed',
                output: { status: 'failed', stdout: RED_SPEC, stderr: '', exitCode: 1 },
                logs: [],
            })
            .mockResolvedValueOnce({ ok: true, output: { path: 'src/fix.ts' }, logs: [] })
            .mockResolvedValueOnce({ ok: true, output: { status: 'success', stdout: GREEN_SPEC, stderr: '' }, logs: [] })
            .mockResolvedValueOnce({ ok: true, output: { status: 'success', stdout: GREEN_SPEC, stderr: '' }, logs: [] });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Diagnose and fix',
                tasks: [
                    { task: 'Write a reproducing test', tool: 'write_file', args: { path: 'test/red.test.ts', content: '// t' }, priority: 'high' },
                    { task: 'Run the new test to confirm it fails', tool: 'shell_execute', args: { command: 'tsx --test test/red.test.ts' }, priority: 'high' },
                    { task: 'Apply the fix', tool: 'file_edit', args: { filename: 'src/fix.ts', find: 'a', replace: 'b' }, priority: 'high' },
                    { task: 'Re-run the test to confirm it passes', tool: 'shell_execute', args: { command: 'tsx --test test/red.test.ts' } },
                ],
                verificationTask: { task: 'Bug fix tests pass', tool: 'shell_execute', args: { command: 'npm test' } },
            },
            projectContext: {},
        }, CONTEXT);

        // No blind retry of the deterministic red step: each command runs once,
        // then the phase verification arbitrates.
        expect(executeToolMock).toHaveBeenCalledTimes(5);
        expect(executeToolMock.mock.calls.map((call: any[]) => call[0])).toEqual([
            'write_file',
            'shell_execute',
            'file_edit',
            'shell_execute',
            'shell_execute',
        ]);
        expect(result.ok).toBe(true);
        expect(result.output.status).toBe('completed');
        expect(result.output.results).toEqual(expect.arrayContaining([
            expect.objectContaining({
                tool: 'shell_execute',
                ok: false,
                diagnosticTestReport: 'node:test: 2 executed, 0 passed, 2 failed',
            }),
        ]));
        expect(result.logs.join('\n')).toContain('Diagnostic test report recorded');
    });

    it('halts and retries when the harness itself fails (no report)', async () => {
        const harnessFailure = {
            ok: false,
            error: 'command_failed',
            output: { status: 'failed', stdout: '', stderr: "'tsxx' is not recognized as an internal or external command", exitCode: 1 },
            logs: [],
        };
        executeToolMock
            .mockResolvedValueOnce(harnessFailure)
            .mockResolvedValueOnce(harnessFailure);

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Diagnose and fix',
                tasks: [
                    // Non-checker command shape: a plain task, so the legacy
                    // retry-then-halt path applies (checker-shaped tasks take
                    // the ledger-selection path pinned below).
                    { task: 'Run the new test to confirm it fails', tool: 'shell_execute', args: { command: 'tsxx --test test/red.test.ts' }, priority: 'high' },
                    { task: 'Apply the fix', tool: 'file_edit', args: { filename: 'src/fix.ts', find: 'a', replace: 'b' }, priority: 'high' },
                ],
                verificationTask: { task: 'Bug fix tests pass', tool: 'shell_execute', args: { command: 'npm test' } },
            },
            projectContext: {},
        }, CONTEXT);

        // Legacy behavior preserved: one retry, then the phase stops and the
        // fix task plus the phase verification never run.
        expect(executeToolMock).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(false);
        expect(result.output.status).not.toBe('completed');
        expect(result.output.results).toEqual(expect.arrayContaining([
            expect.objectContaining({ tool: 'shell_execute', ok: false }),
        ]));
        expect(result.output.results.find((r: any) => r.tool === 'shell_execute' && r.ok === false).diagnosticTestReport).toBeUndefined();
    });

    it('skips the retry for checker-shaped harness failures but still refuses completion', async () => {
        executeToolMock
            .mockResolvedValueOnce({
                ok: false,
                error: 'command_failed',
                output: { status: 'failed', stdout: '', stderr: "'tsx' is not recognized as an internal or external command", exitCode: 1 },
                logs: [],
            })
            .mockResolvedValueOnce({ ok: true, output: { path: 'src/fix.ts' }, logs: [] });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Diagnose and fix',
                tasks: [
                    { task: 'Run the new test to confirm it fails', tool: 'shell_execute', args: { command: 'tsx --test test/red.test.ts' }, priority: 'high' },
                    { task: 'Apply the fix', tool: 'file_edit', args: { filename: 'src/fix.ts', find: 'a', replace: 'b' }, priority: 'high' },
                ],
                verificationTask: { task: 'Bug fix tests pass', tool: 'shell_execute', args: { command: 'npm test' } },
            },
            projectContext: {},
        }, CONTEXT);

        // Pre-existing ledger-selection semantics: a checker-shaped step never
        // retries (the check is deterministic), the failure is recorded, and
        // the phase continues to gather evidence -- but without a diagnostic
        // report the phase verification does not run and nothing completes.
        expect(executeToolMock).toHaveBeenCalledTimes(2);
        expect(executeToolMock.mock.calls.map((call: any[]) => call[0])).toEqual(['shell_execute', 'file_edit']);
        expect(result.ok).toBe(false);
        expect(result.output.status).toBe('partial');
        expect(result.output.verificationFailed).toBeUndefined();
    });

    it('stays partial when verification fails after a continued red step', async () => {
        executeToolMock
            .mockResolvedValueOnce({
                ok: false,
                error: 'command_failed',
                output: { status: 'failed', stdout: RED_SPEC, stderr: '', exitCode: 1 },
                logs: [],
            })
            .mockResolvedValueOnce({ ok: true, output: { path: 'src/fix.ts' }, logs: [] })
            .mockResolvedValueOnce({
                ok: false,
                error: 'command_failed',
                output: { status: 'failed', stdout: RED_SPEC, stderr: '', exitCode: 1 },
                logs: [],
            });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Diagnose and fix',
                tasks: [
                    { task: 'Run the new test to confirm it fails', tool: 'shell_execute', args: { command: 'tsx --test test/red.test.ts' }, priority: 'high' },
                    { task: 'Apply the fix', tool: 'file_edit', args: { filename: 'src/fix.ts', find: 'a', replace: 'b' }, priority: 'high' },
                ],
                verificationTask: { task: 'Bug fix tests pass', tool: 'shell_execute', args: { command: 'npm test' } },
            },
            projectContext: {},
        }, CONTEXT);

        expect(executeToolMock).toHaveBeenCalledTimes(3);
        expect(result.ok).toBe(false);
        expect(result.output.status).toBe('partial');
        expect(result.output.verificationFailed).toBe(true);
    });

    it('does not treat non-shell failures as diagnostic', async () => {
        const writeFailure = { ok: false, error: 'disk_full', output: {}, logs: [] };
        executeToolMock
            .mockResolvedValueOnce(writeFailure)
            .mockResolvedValueOnce(writeFailure);

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Diagnose and fix',
                tasks: [
                    { task: 'Write a reproducing test', tool: 'write_file', args: { path: 'test/red.test.ts', content: '// t' }, priority: 'high' },
                    { task: 'Apply the fix', tool: 'file_edit', args: { filename: 'src/fix.ts', find: 'a', replace: 'b' }, priority: 'high' },
                ],
            },
            projectContext: {},
        }, CONTEXT);

        expect(executeToolMock).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(false);
        expect(result.output.results.find((r: any) => r.tool === 'write_file').diagnosticTestReport).toBeUndefined();
    });

    it('continues a ledger-selected tsx step the same way (selection is not a veto)', async () => {
        executeToolMock
            .mockResolvedValueOnce({ ok: true, output: { path: 'test/red.test.ts' }, logs: [] })
            .mockResolvedValueOnce({
                ok: false,
                error: 'command_failed',
                output: { status: 'failed', stdout: RED_SPEC, stderr: '', exitCode: 1 },
                logs: [],
            })
            .mockResolvedValueOnce({ ok: true, output: { path: 'src/fix.ts' }, logs: [] })
            .mockResolvedValueOnce({ ok: true, output: { status: 'success', stdout: GREEN_SPEC, stderr: '' }, logs: [] });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Diagnose and fix',
                tasks: [
                    { task: 'Write a reproducing test', tool: 'write_file', args: { path: 'test/red.test.ts', content: '// t' }, priority: 'high' },
                    { task: 'Run the new test to confirm it fails', tool: 'shell_execute', args: { command: 'tsx --test test/red.test.ts', cwd: 'queue-app' }, priority: 'high' },
                    { task: 'Apply the fix', tool: 'file_edit', args: { filename: 'src/fix.ts', find: 'a', replace: 'b' }, priority: 'high' },
                ],
                verificationTask: { task: 'Bug fix tests pass', tool: 'shell_execute', args: { command: 'npm test' } },
            },
            projectContext: {},
        }, CONTEXT);

        // The cwd scopes the tsx step into a ledger checkpoint (selection
        // engages), yet the red report still continues: a recorded ledger
        // failure is evidence, never a veto, and the verification arbitrates.
        expect(result.logs.join('\n')).toContain('verification run: shell_execute:Run the new test to confirm it fails');
        expect(executeToolMock).toHaveBeenCalledTimes(4);
        expect(result.ok).toBe(true);
        expect(result.output.status).toBe('completed');
    });

    it('continues when the report shows executed tests even with zero failures', async () => {
        const pytestGreen = '===== 5 passed in 0.80s =====';
        executeToolMock
            .mockResolvedValueOnce({
                ok: false,
                error: 'command_failed',
                output: { status: 'failed', stdout: pytestGreen, stderr: 'coverage gate: threshold not met', exitCode: 1 },
                logs: [],
            })
            .mockResolvedValueOnce({ ok: true, output: { status: 'success', stdout: pytestGreen, stderr: '' }, logs: [] });

        const result: any = await new PhaseExecutorTool().execute({
            phase: {
                phaseNumber: 2,
                name: 'Diagnose and fix',
                tasks: [
                    { task: 'Run the suite under the coverage gate', tool: 'shell_execute', args: { command: 'pytest test_x.py --cov-fail-under=90' }, priority: 'high' },
                ],
                verificationTask: { task: 'Suite passes', tool: 'shell_execute', args: { command: 'npm test' } },
            },
            projectContext: {},
        }, CONTEXT);

        // The criterion is "the harness executed tests", not "a test failed":
        // the report proves the suite ran, so the phase continues and the
        // verification arbitrates the outcome.
        expect(executeToolMock).toHaveBeenCalledTimes(2);
        expect(executeToolMock.mock.calls[1][0]).toBe('shell_execute');
        expect(String(executeToolMock.mock.calls[1][1].command)).toBe('npm test');
        expect(result.ok).toBe(true);
        expect(result.output.status).toBe('completed');
    });
});

