/**
 * THE RED STEP THAT KILLED THE GREEN PLAN.
 *
 * EVAL-003 (novel broken system, TaskQueue priority bug): the plan's phase 2
 * is a textbook red-green sequence -- write a reproducing test, run it to
 * confirm it fails, apply the fix, re-run to confirm it passes. The executor
 * halted the phase on the red step (`tsx --test` exits nonzero with a clean
 * assertion-level report: 2 run, 0 passed, 2 failed), retried it identically,
 * and stopped; the planned fix task never ran and self-fix honestly refused
 * (a bare command_failed names no evidence-bound file). Pipeline: 1/3.
 *
 * A failing test command is either a HARNESS failure (tests could not run)
 * or a TEST failure (the harness ran and reported). Only the first shape
 * must halt a phase; the second is diagnostic evidence for the remaining
 * tasks, with the phase verification as the final arbiter. This suite pins
 * the report grammars that distinguish the two shapes across runners, plus
 * the fail-open negatives that must keep the legacy halt behavior.
 */
import { parseExecutedTestReport } from '../shared/test-report';

describe('executed test report recognition', () => {
    it('recognizes the EVAL-003 tsx/node spec report (red step)', () => {
        const output = [
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
            '',
            '\u2716 failing tests:',
            '',
            'test at test\\priority-bug.test.ts:6:1',
            '  AssertionError [ERR_ASSERTION]: High priority should be dequeued first',
        ].join('\n');
        expect(parseExecutedTestReport(output)).toEqual({
            runner: 'node:test',
            executed: 2,
            passed: 0,
            failed: 2,
            summary: 'node:test: 2 executed, 0 passed, 2 failed',
        });
    });

    it('recognizes node TAP summary blocks', () => {
        const output = ['TAP version 13', 'not ok 1 - should order first', 'ok 2 - keeps fifo', '1..2', '# tests 2', '# pass 1', '# fail 1'].join('\n');
        expect(parseExecutedTestReport(output)).toEqual(expect.objectContaining({
            runner: 'tap',
            executed: 2,
            passed: 1,
            failed: 1,
        }));
    });

    it('recognizes generic TAP plans with result lines', () => {
        const output = ['TAP version 13', 'ok 1 - loads', 'not ok 2 - saves', '1..2'].join('\n');
        expect(parseExecutedTestReport(output)).toEqual(expect.objectContaining({
            runner: 'tap',
            executed: 2,
            passed: 1,
            failed: 1,
        }));
    });

    it('recognizes jest summaries with and without a failed group', () => {
        expect(parseExecutedTestReport('Tests: 2 failed, 3 passed, 5 total')).toEqual(expect.objectContaining({
            runner: 'jest',
            executed: 5,
            passed: 3,
            failed: 2,
        }));
        expect(parseExecutedTestReport('Tests: 5 passed, 5 total')).toEqual(expect.objectContaining({
            runner: 'jest',
            executed: 5,
            passed: 5,
            failed: 0,
        }));
    });

    it('recognizes mocha passing/failing counts', () => {
        expect(parseExecutedTestReport('8 passing (41ms)\n2 failing')).toEqual(expect.objectContaining({
            runner: 'mocha',
            executed: 10,
            passed: 8,
            failed: 2,
        }));
        expect(parseExecutedTestReport('  3 passing (12ms)')).toEqual(expect.objectContaining({
            runner: 'mocha',
            executed: 3,
            passed: 3,
            failed: 0,
        }));
    });

    it('recognizes vitest file/test summaries', () => {
        expect(parseExecutedTestReport(' Test Files  1 failed (1)\n Tests  2 failed (2)')).toEqual(expect.objectContaining({
            runner: 'vitest',
            executed: 2,
            failed: 2,
        }));
        expect(parseExecutedTestReport(' Tests  1 failed | 4 passed (5)')).toEqual(expect.objectContaining({
            runner: 'vitest',
            executed: 5,
            passed: 4,
            failed: 1,
        }));
    });

    it('recognizes pytest summary lines with extras and rule wrapping', () => {
        expect(parseExecutedTestReport('FAILED test_q.py::test_a - assert 1 == 2\n===== 2 failed, 3 passed in 1.23s =====')).toEqual(expect.objectContaining({
            runner: 'pytest',
            executed: 5,
            passed: 3,
            failed: 2,
        }));
        expect(parseExecutedTestReport('2 failed, 3 passed, 1 skipped, 4 warnings in 0.80s')).toEqual(expect.objectContaining({
            runner: 'pytest',
            executed: 5,
            passed: 3,
            failed: 2,
        }));
        expect(parseExecutedTestReport('1 failed in 0.50s')).toEqual(expect.objectContaining({
            runner: 'pytest',
            executed: 1,
            failed: 1,
        }));
    });

    it('recognizes unittest runs and failure/error splits', () => {
        expect(parseExecutedTestReport('Ran 5 tests in 0.123s\n\nFAILED (failures=2, errors=1)')).toEqual(expect.objectContaining({
            runner: 'unittest',
            executed: 5,
            failed: 3,
            passed: 2,
        }));
        expect(parseExecutedTestReport('Ran 4 tests in 0.010s\n\nOK')).toEqual(expect.objectContaining({
            runner: 'unittest',
            executed: 4,
            failed: 0,
            passed: 4,
        }));
    });

    it('recognizes playwright header plus counts', () => {
        const output = ['Running 5 tests using 2 workers', '  2 failed', '  3 passed (45.2s)'].join('\n');
        expect(parseExecutedTestReport(output)).toEqual(expect.objectContaining({
            runner: 'playwright',
            executed: 5,
            passed: 3,
            failed: 2,
        }));
    });

    it('recognizes go top-level failures but not build failures', () => {
        const output = ['--- FAIL: TestOrder (0.00s)', '    --- FAIL: TestOrder/high_first (0.00s)', 'FAIL', 'FAIL\tqueue\t0.123s'].join('\n');
        expect(parseExecutedTestReport(output)).toEqual(expect.objectContaining({
            runner: 'go',
            executed: 1,
            failed: 1,
        }));
        expect(parseExecutedTestReport('FAIL\tqueue [build failed]')).toBeNull();
    });

    it('recognizes dotnet test summaries', () => {
        expect(parseExecutedTestReport('Failed! - Failed: 2, Passed: 5, Skipped: 0, Total: 7, Duration: 1 s')).toEqual(expect.objectContaining({
            runner: 'dotnet',
            executed: 7,
            passed: 5,
            failed: 2,
        }));
    });

    it('keeps halt behavior for harness failures (fail-open negatives)', () => {
        const negatives = [
            '', // empty output
            "'tsx' is not recognized as an internal or external command", // missing binary
            'Cannot find module \'./PriorityComparer\' imported from TaskQueue.ts', // missing module
            'ReferenceError: describe is not defined\n    at test.js:3:1', // harness mismatch, no report
            'No tests found, exiting with code 1', // nothing ran
            '0 passing (2ms)', // mocha zero run
            '\u2139 tests 0\n\u2139 pass 0\n\u2139 fail 0', // node zero run
            '1..0', // TAP zero plan
            'npm error code EPERM\nnpm error syscall mkdir', // environment failure
            'Error: Command timed out after 60000ms', // timeout, no report
            'FAIL\tqueue [setup failed]', // go setup failure, no test lines
            'Running 5 tests using 2 workers', // playwright header without counts
            'Tests: 0 total', // jest zero run
        ];
        for (const output of negatives) {
            expect(parseExecutedTestReport(output)).toBeNull();
        }
    });

    it('never embeds raw output in the summary', () => {
        const withSecret = 'prefix secret=hunter2-TOKEN-abc123\n\u2139 tests 1\n\u2139 pass 0\n\u2139 fail 1';
        const parsed = parseExecutedTestReport(withSecret);
        expect(parsed).not.toBeNull();
        expect(parsed!.summary).not.toContain('hunter2');
        expect(parsed!.summary).not.toContain('secret');
        expect(parsed!.summary.length).toBeLessThanOrEqual(120);
    });
});
