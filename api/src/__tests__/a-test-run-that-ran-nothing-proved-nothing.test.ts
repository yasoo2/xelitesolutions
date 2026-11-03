/**
 * Round 21 review, group 1 #3 and #1:
 *
 *   - the Rust CLI skeleton put its test in src/test.rs, which no `mod`
 *     declares, so cargo never compiled it: `cargo test` printed «running 0
 *     tests … test result: ok» and exited 0, and that was the program's proof.
 *     The Go skeleton had the same shape (test.go is not a _test.go file);
 *   - «0 tests ran» must count as not run for every runner where the runner's
 *     own summary says so — unittest before Python 3.12 exits 0 on «Ran 0
 *     tests», go exits 0 on «[no test files]»;
 *   - Python: an empty run must fail on EVERY version, and a plan's
 *     pytest-style file (bare `def test_…`) is really run or fails honestly.
 *
 * cargo and go are not installed here: their scaffolds are checked by their
 * structure, and the zero-test reading on the output those tools print.
 * Python runs for real — with pre-3.12 unittest emulated, so the empty-run
 * guard is measured even on a newer interpreter.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { emptyTestRun } from '../core/quality/test-run-evidence';
import { deterministicPhasesFor, pythonTestCommand } from '../modules/tools/definitions/ProjectPipelineTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { handleShellCommand } from '../modules/tools/handlers';
import { pythonExecutable } from '../core/quality/python-executable';

jest.mock('../modules/tools/handlers', () => ({ handleShellCommand: jest.fn() }));
jest.mock('../modules/tools/utils', () => ({ resolveToolPath: (value: string) => value }));

jest.setTimeout(90_000);

// What each runner prints, recorded from the runners themselves.
const RECORDED = {
    unittest311Empty: '\n----------------------------------------------------------------------\nRan 0 tests in 0.000s\n\nOK\n',
    unittest312Empty: '\n----------------------------------------------------------------------\nRan 0 tests in 0.000s\n\nNO TESTS RAN\n',
    unittestAllSkipped: 'test_a (test_x.T.test_a) ... skipped \'later\'\n\n----------------------------------------------------------------------\nRan 2 tests in 0.001s\n\nOK (skipped=2)\n',
    unittestRan: 'test_a (test_x.T.test_a) ... ok\n\n----------------------------------------------------------------------\nRan 1 test in 0.001s\n\nOK\n',
    cargoUncompiledTest: '   Compiling cli v0.1.0 (/w/cli)\n    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.61s\n     Running unittests src/main.rs (target/debug/deps/cli-1a2b)\n\nrunning 0 tests\n\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n\n',
    cargoIntegrationTest: '     Running unittests src/main.rs (target/debug/deps/cli-1a2b)\n\nrunning 0 tests\n\ntest result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n\n     Running tests/cli.rs (target/debug/deps/cli-3c4d)\n\nrunning 1 test\ntest filters_by_property ... ok\n\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s\n\n',
    goNoTestFiles: '?   \tcli\t[no test files]\n',
    goRan: 'ok  \tcli\t0.004s\n',
    nodeTapEmpty: 'TAP version 13\n1..0\n# tests 0\n# suites 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 4.1\n',
    nodeSpecRan: '✔ counts words (1.2ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 52.1\n',
    pytestNone: '============================= test session starts =============================\ncollected 0 items\n\n============================ no tests ran in 0.01s ============================\n',
    pytestSkipped: '============================= 3 skipped in 0.02s ==============================\n',
    pytestRan: '========================= 1 failed, 2 passed in 0.03s =========================\n',
    jestNone: 'No tests found, exiting with code 0\n',
    mochaNone: '\n\n  0 passing (1ms)\n\n',
};

describe('a runner\'s own summary tells «nothing ran» from «nothing failed»', () => {
    it.each([
        ['unittest3.11 empty', RECORDED.unittest311Empty, 'unittest'],
        ['unittest3.12 empty', RECORDED.unittest312Empty, 'unittest'],
        ['unittest all skipped', RECORDED.unittestAllSkipped, 'unittest'],
        ['cargo, test file never compiled', RECORDED.cargoUncompiledTest, 'cargo test'],
        ['go, no _test.go file', RECORDED.goNoTestFiles, 'go test'],
        ['node --test, no test', RECORDED.nodeTapEmpty, 'node --test'],
        ['pytest, nothing collected', RECORDED.pytestNone, 'pytest'],
        ['pytest, all skipped', RECORDED.pytestSkipped, 'pytest'],
        ['jest, no tests', RECORDED.jestNone, 'jest/vitest'],
        ['mocha, no tests', RECORDED.mochaNone, 'mocha'],
    ])('%s → ran nothing', (_name, output, runner) => {
        expect(emptyTestRun(output)).toMatchObject({ runner });
    });

    it.each([
        ['unittest ran one', RECORDED.unittestRan],
        ['cargo ran the integration test', RECORDED.cargoIntegrationTest],
        ['go ran', RECORDED.goRan],
        ['node --test ran', RECORDED.nodeSpecRan],
        ['pytest ran', RECORDED.pytestRan],
        ['a bash test that prints its own words', 'Expected 2 results, got 2\nTest passed!\n'],
        ['no output at all', ''],
    ])('%s → not called empty', (_name, output) => {
        expect(emptyTestRun(output)).toBeNull();
    });

    it('quality_run counts a zero-test run as not run, whatever the exit code', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-empty-run-'));
        try {
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'cargo test' } }));
            const shell = handleShellCommand as jest.Mock;
            shell.mockResolvedValue({ ok: true, output: RECORDED.cargoUncompiledTest, error: '', stderr: '', logs: [] });
            const empty: any = await new QualityRunTool().execute({ path: root, tasks: ['test'] });
            expect(empty).toMatchObject({ ok: false, output: { status: 'failed' } });
            expect(empty.output.results[0]).toMatchObject({ task: 'test', ok: false, skipped: false, error: expect.stringMatching(/^the test command ran no tests \(cargo test: test result: ok\. 0 passed/u) });

            // unittest writes its summary to stderr; 3.11 says OK and exits 0.
            shell.mockResolvedValue({ ok: true, output: '', error: RECORDED.unittest311Empty, stderr: RECORDED.unittest311Empty, logs: [] });
            expect(await new QualityRunTool().execute({ path: root, tasks: ['test'] })).toMatchObject({ ok: false });

            shell.mockResolvedValue({ ok: true, output: RECORDED.cargoIntegrationTest, error: '', stderr: '', logs: [] });
            expect(await new QualityRunTool().execute({ path: root, tasks: ['test'] })).toMatchObject({ ok: true, output: { status: 'completed' } });
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
});

describe('a compiled toolchain\'s test is where its toolchain compiles tests', () => {
    const scaffoldOf = (request: string) => {
        const tasks = deterministicPhasesFor(request)!.phases[0].tasks;
        return { tasks, structure: tasks[0].args.structure as Record<string, string> };
    };

    it('Rust: the stock test is an integration test in tests/, run against the binary the crate builds', () => {
        const { structure } = scaffoldOf('Build a Rust command-line tool that reads a local JSON file and prints matching entries to stdout. No website or browser interface.');
        expect(Object.keys(structure)).toContain('tests/cli.rs');
        expect(Object.keys(structure).filter(file => /\.rs$/u.test(file) && file.startsWith('src/') && file !== 'src/main.rs')).toEqual([]);
        const crate = /^name = "([^"]+)"$/mu.exec(structure['Cargo.toml'])![1];
        const test = structure['tests/cli.rs'];
        // An integration test is compiled by cargo itself: top-level #[test], no cfg(test) module to declare.
        expect(test).toMatch(/^#\[test\]\nfn \w+\(\)/mu);
        expect(test).not.toMatch(/#\[cfg\(test\)\]/u);
        expect(test).toContain(`env!("CARGO_BIN_EXE_${crate}")`);
        // The entry it runs compiles: as_str() is already an Option.
        expect(structure['src/main.rs']).toContain('.and_then(|v| v.as_str())');
    });

    it('Rust: a request-authored test is written to tests/ and told how cargo runs it', () => {
        const { tasks, structure } = scaffoldOf('Write a Rust command-line tool that counts the words in a file.');
        const crate = /^name = "([^"]+)"$/mu.exec(structure['Cargo.toml'])![1];
        const testTask = tasks.find((task: any) => task.tool === 'ai_write_file' && /test/u.test(task.args.path));
        expect(testTask.args.path).toBe('tests/cli.rs');
        expect(testTask.args.description).toContain(`CARGO_BIN_EXE_${crate}`);
    });

    it('Go: the test is a _test.go file in package main, with every package it uses imported', () => {
        const { structure } = scaffoldOf('Build a Go command-line tool that reads a local JSON file and prints matching entries to stdout. No website or browser interface.');
        expect(Object.keys(structure)).toContain('main_test.go');
        expect(Object.keys(structure)).not.toContain('test.go');
        const imported = (source: string) => new Set([...source.matchAll(/^\t"([\w/]+)"$/gmu)].map(m => m[1].split('/').pop()));
        const used = (source: string) => new Set([...source.matchAll(/\b(json|fmt|os|strings|exec|csv|testing)\.[A-Z]/gu)].map(m => m[1]));
        for (const file of ['main.go', 'main_test.go']) {
            const source = structure[file];
            expect({ file, missing: [...used(source)].filter(pkg => !imported(source).has(pkg)) }).toEqual({ file, missing: [] });
        }
        const { tasks } = scaffoldOf('Write a Go CLI that counts the words in a file.');
        expect(tasks.filter((task: any) => task.tool === 'ai_write_file').map((task: any) => task.args.path)).toEqual(['main.go', 'main_test.go']);
    });
});

const python = (() => { try { execSync(`${pythonExecutable()} --version`, { stdio: 'ignore' }); return true; } catch { return false; } })();

(python ? describe : describe.skip)('a Python test run fails when nothing ran, on every Python, and runs pytest-style tests', () => {
    let dir = '';
    let legacy = '';
    // Python 3.11 and older: `python -m unittest` exits 0 on «Ran 0 tests».
    // 3.12 added exit code 5 as unittest.main._NO_TESTS_EXITCODE; setting it to 0
    // in a sitecustomize reproduces the old behaviour on this interpreter.
    const run = (command: string) => spawnSync(command, {
        cwd: dir, shell: true, encoding: 'utf-8',
        env: { ...process.env, PYTHONPATH: legacy },
    });
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-py-runner-'));
        legacy = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-py-legacy-'));
        // (`unittest.main` as an attribute is the TestProgram class; the module is in sys.modules.)
        fs.writeFileSync(path.join(legacy, 'sitecustomize.py'), "import sys, unittest.main\nsys.modules['unittest.main']._NO_TESTS_EXITCODE = 0\n");
        fs.writeFileSync(path.join(dir, 'wordcount.py'), 'def count(text):\n    return len(text.split())\n');
        fs.writeFileSync(path.join(dir, 'test_empty.py'), '# the model wrote no test\n');
        fs.writeFileSync(path.join(dir, 'test_bare.py'), 'from wordcount import count\n\ndef test_counts_words():\n    assert count("a b c") == 3\n\nclass TestEdges:\n    def test_empty_text(self):\n        assert count("") == 0\n');
        fs.writeFileSync(path.join(dir, 'test_wrong.py'), 'from wordcount import count\n\ndef test_counts_words():\n    assert count("a b") == 3\n');
        fs.writeFileSync(path.join(dir, 'test_fixture.py'), 'def test_reads_the_database(db_conn):\n    assert db_conn\n');
        fs.writeFileSync(path.join(dir, 'test_case.py'), 'import unittest\nfrom wordcount import count\n\nclass CountTest(unittest.TestCase):\n    def test_counts(self):\n        self.assertEqual(count("x y"), 2)\n');
    });
    afterAll(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.rmSync(legacy, { recursive: true, force: true });
    });

    it('the premise: under pre-3.12 unittest, `python -m unittest` passes an empty file', () => {
        const old = run(`${pythonExecutable()} -m unittest -v test_empty.py`);
        expect(old.stderr).toMatch(/Ran 0 tests/u);
        expect(old.status).toBe(0);
    });

    it.each([true, false])('an empty test file fails (Joe-authored: %s)', (own) => {
        const result = run(pythonTestCommand(['test_empty.py'], own));
        expect(result.status).not.toBe(0);
    });

    // Where pytest is installed a plan's tests run under it; its own summary then differs.
    const hasPytest = spawnSync(pythonExecutable(), ['-c', 'import pytest']).status === 0;
    it.each(hasPytest ? [true] : [true, false])('a pytest-style file is really run, without pytest (Joe-authored: %s)', (own) => {
        const passed = run(pythonTestCommand(['test_bare.py'], own));
        expect({ status: passed.status, stderr: passed.stderr }).toMatchObject({ status: 0, stderr: expect.stringMatching(/Ran 2 tests/u) });
        expect(passed.stderr).toMatch(/test_counts_words/u);
        expect(passed.stderr).toMatch(/test_empty_text/u);
        expect(run(pythonTestCommand(['test_wrong.py'], own)).status).not.toBe(0);
    });

    it('a test that needs a pytest fixture fails by name instead of passing unrun', () => {
        const result = run(pythonTestCommand(['test_fixture.py'], true));
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/missing 1 required positional argument: 'db_conn'/u);
    });

    it('a unittest suite still runs as before', () => {
        const result = run(pythonTestCommand(['test_case.py'], true));
        expect(result.status).toBe(0);
        expect(result.stderr).toMatch(/Ran 1 test/u);
    });
});
