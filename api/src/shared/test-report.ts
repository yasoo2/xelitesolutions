/**
 * Recognition for executed test reports.
 *
 * A failing shell command is either a HARNESS failure (the tests could not
 * run: missing binary, bad path, syntax crash before any test, timeout) or a
 * TEST failure (the harness ran and the tests reported their outcome). Only
 * the first shape must halt a phase: the second shape is diagnostic evidence
 * (a red step in a red-green plan), and halting on it prevents the planned
 * fix tasks from ever running.
 *
 * Each grammar below matches a stable, well-known runner summary line and
 * requires at least one executed test, so an unrecognized runner keeps the
 * legacy halt behavior (fail-open). Counts only are extracted; raw output is
 * never embedded in the summary, so receipts and logs cannot leak secrets
 * through this path.
 */

export interface ExecutedTestReport {
    /** Stable runner key: node:test, tap, jest, mocha, vitest, pytest, unittest, playwright, go, dotnet. */
    runner: string;
    /** Tests the report shows as executed. Always >= 1 when a report is returned. */
    executed: number;
    /** Tests the report shows as passed (0 when the report does not list passes). */
    passed: number;
    /** Tests the report shows as failed. */
    failed: number;
    /** Bounded counts-only summary for receipts and logs. */
    summary: string;
}

const MAX_SCAN_CHARS = 24000;

function toCount(value: string | undefined): number {
    const n = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

function summarize(runner: string, executed: number, passed: number, failed: number): string {
    return `${runner}: ${executed} executed, ${passed} passed, ${failed} failed`.slice(0, 120);
}

function report(runner: string, executed: number, passed: number, failed: number): ExecutedTestReport | null {
    if (!Number.isFinite(executed) || executed < 1) return null;
    return { runner, executed, passed, failed, summary: summarize(runner, executed, passed, failed) };
}

/**
 * Returns the executed-test report when `text` contains a recognized runner
 * summary showing at least one executed test, else null (fail-open: unknown
 * output keeps the legacy halt behavior).
 */
export function parseExecutedTestReport(text: string): ExecutedTestReport | null {
    const input = String(text || '');
    if (!input) return null;
    const scan = input.length > MAX_SCAN_CHARS ? input.slice(input.length - MAX_SCAN_CHARS) : input;

    // node:test human summary (node --test, tsx --test): summaries print at the end.
    //   ℹ tests 2 / ℹ pass 0 / ℹ fail 2
    const specTests = scan.match(/ℹ\s*tests\s+(\d+)/u);
    if (specTests) {
        const executed = toCount(specTests[1]);
        if (executed >= 1) {
            const passed = toCount(scan.match(/ℹ\s*pass\s+(\d+)/u)?.[1]);
            const failed = toCount(scan.match(/ℹ\s*fail\s+(\d+)/u)?.[1]);
            return report('node:test', executed, passed, failed);
        }
    }

    // node:test TAP summary block.
    //   # tests 2 / # pass 0 / # fail 2
    const tapTests = scan.match(/^#\s*tests\s+(\d+)\s*$/gim);
    if (tapTests && tapTests.length > 0) {
        const executed = toCount(tapTests[tapTests.length - 1].match(/(\d+)/)?.[1]);
        if (executed >= 1) {
            const passLines = scan.match(/^#\s*pass\s+(\d+)\s*$/gim) || [];
            const failLines = scan.match(/^#\s*fail\s+(\d+)\s*$/gim) || [];
            const passed = toCount(passLines.length ? passLines[passLines.length - 1].match(/(\d+)/)?.[1] : undefined);
            const failed = toCount(failLines.length ? failLines[failLines.length - 1].match(/(\d+)/)?.[1] : undefined);
            return report('tap', executed, passed, failed);
        }
    }

    // Jest summary: "Tests: 2 failed, 3 passed, 5 total" (failed/passed groups optional).
    const jest = scan.match(/Tests:\s*(?:(\d+)\s*failed,\s*)?(?:(\d+)\s*passed,\s*)?(\d+)\s*total/i);
    if (jest) {
        const failed = toCount(jest[1]);
        const passed = toCount(jest[2]);
        const total = toCount(jest[3]);
        const parsed = report('jest', total, passed, failed);
        if (parsed) return parsed;
    }

    // Mocha summary: "10 passing" with optional "2 failing" / "1 pending".
    const mochaPassing = scan.match(/(\d+)\s*passing\b/i);
    if (mochaPassing) {
        const passed = toCount(mochaPassing[1]);
        const failed = toCount(scan.match(/(\d+)\s*failing\b/i)?.[1]);
        const parsed = report('mocha', passed + failed, passed, failed);
        if (parsed) return parsed;
    }

    // Vitest summary: "Tests  2 failed (2)" / "Tests  1 failed | 4 passed (5)".
    const vitest = scan.match(/^\s*Tests\s+(?:(\d+)\s*failed\s*(?:\|\s*)?)?(?:(\d+)\s*passed\s*)?\((\d+)\)/m);
    if (vitest) {
        const failed = toCount(vitest[1]);
        const passed = toCount(vitest[2]);
        const total = toCount(vitest[3]);
        const parsed = report('vitest', total, passed, failed);
        if (parsed) return parsed;
    }

    // Pytest short summary line: "2 failed, 3 passed in 1.2s" (extras such as
    // skipped/deselected/warnings may sit between the counts and "in").
    const pytestLines = scan.split('\n').filter((line) => /(\d+)\s*(failed|passed)\b/i.test(line) && /\bin\s+[\d.]+s\b/i.test(line));
    const pytestSummary = pytestLines.length > 0 ? pytestLines[pytestLines.length - 1] : '';
    if (pytestSummary) {
        const failed = toCount(pytestSummary.match(/(\d+)\s*failed\b/i)?.[1]);
        const passed = toCount(pytestSummary.match(/(\d+)\s*passed\b/i)?.[1]);
        const parsed = report('pytest', failed + passed, passed, failed);
        if (parsed) return parsed;
    }

    // Python unittest: "Ran 5 tests" + "OK" / "FAILED (failures=2, errors=1)".
    const unittestRan = scan.match(/^Ran (\d+) tests?/m);
    if (unittestRan) {
        const executed = toCount(unittestRan[1]);
        if (executed >= 1) {
            const failed = toCount(scan.match(/failures=(\d+)/)?.[1]) + toCount(scan.match(/errors=(\d+)/)?.[1]);
            return report('unittest', executed, Math.max(0, executed - failed), failed);
        }
    }

    // Playwright: "Running 5 tests using 2 workers" header plus indented counts.
    const playwrightHeader = scan.match(/^Running (\d+) tests?\s+using/im);
    if (playwrightHeader && toCount(playwrightHeader[1]) >= 1) {
        const failedMatches = scan.match(/^\s*(\d+)\s*failed\b/gim) || [];
        const passedMatches = scan.match(/^\s*(\d+)\s*passed\b/gim) || [];
        const failed = failedMatches.reduce((sum, line) => sum + toCount(line.match(/(\d+)/)?.[1]), 0);
        const passed = passedMatches.reduce((sum, line) => sum + toCount(line.match(/(\d+)/)?.[1]), 0);
        const parsed = report('playwright', failed + passed, passed, failed);
        if (parsed) return parsed;
    }

    // Go: top-level "--- FAIL: TestName" lines (subtests are indented and belong
    // to their parent; build failures print "FAIL\tpkg [build failed]" instead
    // and match nothing, which correctly keeps the halt behavior).
    const goFail = scan.match(/^--- FAIL: \S+/gm) || [];
    if (goFail.length > 0) {
        const goPass = scan.match(/^--- PASS: \S+/gm) || [];
        return report('go', goFail.length + goPass.length, goPass.length, goFail.length);
    }

    // .NET: "Passed! - Failed: 2, Passed: 5, ..." / "Failed! - Failed: 2, Passed: 0, ...".
    const dotnet = scan.match(/(?:Passed!|Failed!)\s*-\s*Failed:\s*(\d+),\s*Passed:\s*(\d+)/i);
    if (dotnet) {
        const failed = toCount(dotnet[1]);
        const passed = toCount(dotnet[2]);
        const parsed = report('dotnet', failed + passed, passed, failed);
        if (parsed) return parsed;
    }

    // Generic TAP: "1..N" plan plus result lines.
    const tapPlan = scan.match(/^1\.\.(\d+)\s*$/gm) || [];
    if (tapPlan.length > 0) {
        const planned = toCount(tapPlan[tapPlan.length - 1].match(/\.\.(\d+)/)?.[1]);
        if (planned >= 1) {
            const failed = (scan.match(/^not ok\b/gm) || []).length;
            const passed = (scan.match(/^ok\b/gm) || []).length;
            return report('tap', planned, passed, failed);
        }
    }

    return null;
}
