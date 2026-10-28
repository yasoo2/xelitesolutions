/**
 * A TEST COMMAND THAT RAN NO TEST PROVED NOTHING.
 *
 * Round 21 review: the Rust CLI skeleton put its test in src/test.rs, which no
 * `mod` declares, so cargo never compiled it — `cargo test` printed «running 0
 * tests … test result: ok» and exited 0, and that was read as the program's
 * proof. The same shape exists for every runner: unittest before Python 3.12
 * exits 0 on «Ran 0 tests», `go test` exits 0 on «[no test files]», jest with
 * --passWithNoTests, pytest when every test is skipped. An exit code cannot
 * tell «nothing failed» from «nothing ran»; the runner's own summary can.
 *
 * This reads that summary, per runner, from what the command printed (stdout
 * and stderr together). It answers only where a runner's summary is present:
 * an output it does not recognise is never called empty.
 */

export interface EmptyTestRun {
    /** The runner whose summary said so. */
    runner: string;
    /** The summary line(s) it said it in. */
    evidence: string;
}

const lines = (output: string) => String(output || '').replace(/\x1b\[[0-9;]*m/gu, '').split(/\r?\n/u).map(line => line.trim());

type Reader = (all: string[]) => EmptyTestRun | null;

/** Python unittest: «Ran N tests in …», then «OK (skipped=K)». */
const unittest: Reader = (all) => {
    const ran = all.filter(line => /^Ran \d+ tests? in /u.test(line));
    if (!ran.length) return null;
    const total = ran.reduce((sum, line) => sum + Number(/^Ran (\d+)/u.exec(line)![1]), 0);
    const skipped = all.reduce((sum, line) => {
        const m = /^(?:OK|FAILED) \(.*\bskipped=(\d+)/u.exec(line);
        return sum + (m ? Number(m[1]) : 0);
    }, 0);
    return total - skipped <= 0 ? { runner: 'unittest', evidence: ran.join('; ') } : null;
};

/** pytest's closing summary: «2 passed, 1 skipped in 0.03s», «no tests ran in 0.01s». */
const pytest: Reader = (all) => {
    const summaries = all.filter(line => /^(?:=+\s*)?(?:no tests ran|(?:\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed|deselected|warnings?)(?:, )?)+) in [\d.]+s\b/u.test(line));
    if (!summaries.length) return null;
    const executed = summaries.reduce((sum, line) => {
        let n = 0;
        for (const m of line.matchAll(/(\d+) (passed|failed|errors?|xfailed|xpassed)\b/gu)) n += Number(m[1]);
        return sum + n;
    }, 0);
    return executed === 0 ? { runner: 'pytest', evidence: summaries.join('; ') } : null;
};

/** node:test (TAP «# tests N» or spec «ℹ tests N»), minus skipped and todo. */
const nodeTest: Reader = (all) => {
    const count = (name: string) => all.reduce((sum, line) => {
        const m = new RegExp(`^(?:#|ℹ) ${name} (\\d+)$`, 'u').exec(line);
        return sum + (m ? Number(m[1]) : 0);
    }, 0);
    const reported = all.filter(line => /^(?:#|ℹ) tests \d+$/u.test(line));
    if (!reported.length) return null;
    return count('tests') - count('skipped') - count('todo') <= 0 ? { runner: 'node --test', evidence: reported.join('; ') } : null;
};

/** cargo test: one «test result: ok. P passed; F failed; I ignored; …» per test binary. */
const cargo: Reader = (all) => {
    const results = all.filter(line => /^test result: \w+\. \d+ passed; \d+ failed;/u.test(line));
    if (!results.length) return null;
    const ran = results.reduce((sum, line) => {
        const m = /(\d+) passed; (\d+) failed;/u.exec(line)!;
        return sum + Number(m[1]) + Number(m[2]);
    }, 0);
    return ran === 0 ? { runner: 'cargo test', evidence: results.join('; ') } : null;
};

/** go test: «?  pkg [no test files]», «ok pkg 0.01s [no tests to run]», versus a package that ran. */
const goTest: Reader = (all) => {
    const empty = all.filter(line => /\[no test files\]$|\[no tests to run\]$|^testing: warning: no tests to run$/u.test(line));
    if (!empty.length) return null;
    const ran = all.some(line => (/^(?:ok|FAIL)\s+\S+\s+(?:[\d.]+s|\(cached\))/u.test(line) && !/\[no tests to run\]$/u.test(line))
        || /^--- (?:PASS|FAIL)/u.test(line));
    return ran ? null : { runner: 'go test', evidence: empty.slice(0, 3).join('; ') };
};

/** jest / vitest: «No tests found», «No test files found», or «Tests: K skipped, K total». */
const jestLike: Reader = (all) => {
    const none = all.find(line => /^No tests? (?:files )?found\b/u.test(line));
    if (none) return { runner: 'jest/vitest', evidence: none };
    const summary = all.find(line => /^Tests:\s+.*\b\d+ total$/u.test(line));
    if (!summary) return null;
    const total = Number(/(\d+) total$/u.exec(summary)![1]);
    const notRun = [...summary.matchAll(/(\d+) (?:skipped|todo)\b/gu)].reduce((sum, m) => sum + Number(m[1]), 0);
    return total - notRun <= 0 ? { runner: 'jest', evidence: summary } : null;
};

/** mocha: «0 passing», with no failing. */
const mocha: Reader = (all) => {
    const passing = all.filter(line => /^\d+ passing\b/u.test(line));
    if (!passing.length) return null;
    const ran = [...passing, ...all.filter(line => /^\d+ failing\b/u.test(line))].reduce((sum, line) => sum + Number(/^(\d+)/u.exec(line)![1]), 0);
    return ran === 0 ? { runner: 'mocha', evidence: passing.join('; ') } : null;
};

const READERS: Reader[] = [unittest, pytest, nodeTest, cargo, goTest, jestLike, mocha];

/**
 * The runner that said it ran no test, or null — null also when no runner's
 * summary is in the output at all (nothing is concluded from silence). When
 * a script runs several runners, any one that ran nothing is reported: that
 * part of the suite proved nothing.
 */
export function emptyTestRun(output: string): EmptyTestRun | null {
    const all = lines(output).filter(Boolean);
    for (const read of READERS) {
        const empty = read(all);
        if (empty) return empty;
    }
    return null;
}
