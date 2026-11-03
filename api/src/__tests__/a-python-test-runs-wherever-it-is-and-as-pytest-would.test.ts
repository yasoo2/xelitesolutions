/**
 * Round 21, second review — group Q (fixed in round 22), Python:
 *
 *   - Q3: the standard-library runner Joe's Python tests run under called a
 *     coroutine test and never awaited it — `async def test_x(): assert False`
 *     passed — and ignored pytest's xunit hooks (setup_method, setup_module, …),
 *     so a correct test that needs its setup failed for the runner's sake.
 *   - Q8: the delivery's run of the tests he asked for was `python -m unittest
 *     discover` from the root, which walks only into packages: the very file
 *     its own repair writes, tests/test_requested_records.py, has no
 *     __init__.py beside it — «Ran 0 tests», exit 5, on working tests — and a
 *     pytest-style test never ran unless the project declared pytest.
 *   - Q11: delivered scripts named the build machine's interpreter: built on
 *     the Linux server, `python3 main.py`, which on the Windows laptop he runs
 *     it on is the Microsoft Store stub. They now start through a launcher
 *     that finds Python 3 on the machine running the script.
 *
 * Python runs for real here (pytest is not installed on this machine); the
 * launcher runs for real with an impostor `python` first on PATH.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { pythonLauncher, pythonRunCommand, pythonTestCommand } from '../core/quality/python-test-runner';
import { pythonExecutable } from '../core/quality/python-executable';
import { runRequestedTests } from '../core/quality/request-coverage';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(120_000);

const roots: string[] = [];
const tmp = (name: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `joe-r22-checks-${name}-`));
    roots.push(dir);
    return dir;
};
afterAll(() => { for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
afterEach(() => { jest.restoreAllMocks(); });

const write = (root: string, files: Record<string, string>) => {
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), text);
    }
};
const run = (command: string, cwd: string) => spawnSync(command, { cwd, shell: true, encoding: 'utf-8' });
const python = spawnSync(pythonExecutable(), ['--version']).status === 0;

(python ? describe : describe.skip)('Q3: the runner runs a pytest-style test as pytest would', () => {
    it('a coroutine test is awaited: its assertion decides (it passed unrun before)', () => {
        const dir = tmp('py-async');
        write(dir, {
            'test_fails.py': 'async def test_awaited():\n    assert False, "the coroutine ran"\n',
            'test_passes.py': 'import asyncio\n\nasync def test_awaited():\n    await asyncio.sleep(0)\n    assert 1 + 1 == 2\n',
            'test_case.py': 'import unittest\n\nclass T(unittest.TestCase):\n    async def test_a_case_coroutine(self):\n        self.assertTrue(False)\n',
            'test_isolated.py': 'import unittest\n\nclass T(unittest.IsolatedAsyncioTestCase):\n    async def test_own_loop(self):\n        self.assertEqual(1, 1)\n',
        });
        const failed = run(pythonTestCommand(['test_fails.py'], true), dir);
        expect({ status: failed.status, said: failed.stderr }).toMatchObject({ status: 1, said: expect.stringMatching(/AssertionError: the coroutine ran/u) });
        expect(failed.stderr).not.toMatch(/never awaited/u);
        expect(run(pythonTestCommand(['test_passes.py'], true), dir).status).toBe(0);
        expect(run(pythonTestCommand(['test_case.py'], true), dir).status).toBe(1);
        expect(run(pythonTestCommand(['test_isolated.py'], true), dir).status).toBe(0);
    });

    it('pytest\'s xunit hooks run, in pytest\'s order, each with its argument when it takes one', () => {
        const dir = tmp('py-hooks');
        write(dir, {
            'test_hooks.py': [
                'import os',
                'LOG = []',
                'def setup_module(module):',
                '    LOG.append("setup_module:" + module.__name__)',
                'def teardown_module():',
                '    open(os.path.join(os.path.dirname(__file__), "hooks.log"), "w").write(",".join(LOG + ["teardown_module"]))',
                'def setup_function(function):',
                '    LOG.append("setup_function:" + function.__name__)',
                'def teardown_function(function):',
                '    LOG.append("teardown_function")',
                'def test_module_was_set_up():',
                '    assert LOG[0] == "setup_module:test_hooks"',
                'class TestWithHooks:',
                '    @classmethod',
                '    def setup_class(cls):',
                '        cls.shared = "class"',
                '        LOG.append("setup_class")',
                '    def teardown_class(cls):',
                '        LOG.append("teardown_class")',
                '    def setup_method(self, method):',
                '        self.value = 41',
                '        LOG.append("setup_method:" + method.__name__)',
                '    def teardown_method(self):',
                '        LOG.append("teardown_method")',
                '    def test_uses_its_setup(self):',
                '        assert self.value + 1 == 42 and self.shared == "class"',
                '    def test_gets_a_fresh_instance(self):',
                '        self.value = 0',
                '',
            ].join('\n'),
        });
        const result = run(pythonTestCommand(['test_hooks.py'], true), dir);
        expect({ status: result.status, said: result.stderr }).toMatchObject({ status: 0, said: expect.stringMatching(/Ran 3 tests/u) });
        expect(fs.readFileSync(path.join(dir, 'hooks.log'), 'utf-8').split(',')).toEqual([
            'setup_module:test_hooks',
            'setup_function:test_module_was_set_up', 'teardown_function',
            'setup_class',
            'setup_method:test_gets_a_fresh_instance', 'teardown_method',
            'setup_method:test_uses_its_setup', 'teardown_method',
            'teardown_class',
            'teardown_module',
        ]);
    });

    it('a folder stands for the test files directly in it, by pytest\'s and unittest\'s names', () => {
        const dir = tmp('py-folder');
        write(dir, {
            'tests/test_one.py': 'def test_one():\n    assert True\n',
            'tests/two_test.py': 'def test_two():\n    assert True\n',
            'tests/helpers.py': 'raise SystemExit("a helper is not a test file and is never imported")\n',
        });
        const result = run(pythonTestCommand(['tests'], true), dir);
        expect({ status: result.status, said: result.stderr }).toMatchObject({ status: 0, said: expect.stringMatching(/Ran 2 tests/u) });
    });
});

(python ? describe : describe.skip)('Q8: the tests he asked for are found where he put them, and run', () => {
    const shell = (id: string) => (input: any) => executionFirewall.runInContext(id, () => new ShellExecuteTool().execute(input));
    const runTool = (id: string) => async (tool: string, input: any) => {
        if (tool !== 'shell_execute') throw new Error(`unexpected tool ${tool}`);
        return shell(id)(input);
    };
    const project = (files: Record<string, string>) => {
        const ws = tmp('py-gate');
        const root = path.join(ws, 'clinic');
        write(root, files);
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(ws);
        return root;
    };
    const APP = 'def patients():\n    return [{"id": 1}]\n';

    it('tests/test_requested_records.py with no __init__.py — the file the gate\'s own repair writes — runs and passes', async () => {
        const root = project({
            'app.py': APP,
            'requirements.txt': 'flask\n',
            'tests/test_requested_records.py': 'import unittest\nfrom app import patients\n\nclass PatientsTest(unittest.TestCase):\n    def test_lists(self):\n        self.assertEqual(patients()[0]["id"], 1)\n',
        });
        // The premise, measured: unittest discover from the root does not find it.
        const discover = run(`${pythonExecutable()} -m unittest discover -v`, root);
        expect(discover.stderr).toMatch(/Ran 0 tests/u);
        expect(await runRequestedTests(root, runTool('gate-unittest'))).toMatchObject({ ran: true, passed: true, error: undefined });
    });

    it('a pytest-style test runs without pytest declared or installed; a wrong one fails', async () => {
        const root = project({ 'app.py': APP, 'tests/test_api.py': 'from app import patients\n\ndef test_lists():\n    assert patients() == [{"id": 1}]\n' });
        expect(await runRequestedTests(root, runTool('gate-bare'))).toMatchObject({ ran: true, passed: true });
        fs.writeFileSync(path.join(root, 'tests', 'test_api.py'), 'from app import patients\n\ndef test_lists():\n    assert patients() == []\n');
        expect(await runRequestedTests(root, runTool('gate-bare-wrong'))).toMatchObject({ ran: true, passed: false, error: expect.stringMatching(/AssertionError/u) });
    });

    it('a Python environment is not his tests, whatever its folder is called (pyvenv.cfg)', async () => {
        const root = project({
            'app.py': APP,
            'test_app.py': 'from app import patients\n\ndef test_lists():\n    assert len(patients()) == 1\n',
            'env/pyvenv.cfg': 'home = /usr/bin\n',
            'env/Lib/site-packages/vendored/test_vendored.py': 'def test_third_party():\n    assert False, "a third-party test ran"\n',
            // Where pip puts an editable checkout (`pip install -e git+…`): only the marker says it is the environment's.
            'env/src/vendored/tests/test_checkout.py': 'def test_third_party_checkout():\n    assert False, "a checkout in the environment ran"\n',
        });
        const result = await runRequestedTests(root, runTool('gate-env'));
        expect(result).toMatchObject({ ran: true, passed: true });
        expect(result.runner).not.toMatch(/env/u);
    });

    it('a test file that holds no test is not «tested»; no test file at all is «could not run»', async () => {
        const empty = project({ 'app.py': APP, 'test_app.py': 'import unittest\n' });
        expect(await runRequestedTests(empty, runTool('gate-empty'))).toMatchObject({ ran: true, passed: false, error: expect.stringMatching(/^the test command ran no tests \(unittest: Ran 0 tests/u) });
        const none = project({ 'app.py': APP });
        expect(await runRequestedTests(none, runTool('gate-none'))).toMatchObject({ ran: false, passed: false, error: expect.stringMatching(/no Python test file/u) });
    });
});

describe('Q11: a delivered script finds Python on the machine that runs it', () => {
    const PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')!;
    afterEach(() => { Object.defineProperty(process, 'platform', PLATFORM); });
    const REQUESTS = [
        'Write a Python command-line tool that reads a CSV file and prints how many rows it has',
        // A program he names is the entry: its start script is written by another path.
        'Write a Python command-line tool report.py that reads a CSV file and prints the totals',
    ];
    const scriptsOn = (platform: NodeJS.Platform) => {
        Object.defineProperty(process, 'platform', { ...PLATFORM, value: platform });
        let scripts: any[] = [];
        jest.isolateModules(() => {
            const { deterministicPhasesFor } = require('../modules/tools/definitions/ProjectPipelineTool');
            scripts = REQUESTS.map(request => JSON.parse(deterministicPhasesFor(request)!.phases[0].tasks[0].args.structure['package.json']).scripts);
        });
        return scripts;
    };

    it('the scripts are the same whichever machine built them, and name no interpreter', () => {
        const linux = scriptsOn('linux');
        const windows = scriptsOn('win32');
        expect(windows).toEqual(linux);
        for (const script of linux.flatMap(scripts => [scripts.start, scripts.test])) {
            expect(script.startsWith(`${pythonLauncher()} `)).toBe(true);
            expect(script).not.toMatch(/^python3? /u);
        }
        expect(linux.map(scripts => scripts.start)).toEqual([pythonRunCommand('main.py'), pythonRunCommand('report.py')]);
    });

    // The launcher's own program, run by this node, with a PATH the test controls.
    const launcherProgram = /^node -e "(.*)" --$/u.exec(pythonLauncher())![1];
    const launch = (args: string[], cwd: string, PATH: string) => spawnSync(process.execPath, ['-e', launcherProgram, '--', ...args], {
        cwd, encoding: 'utf-8', env: { ...process.env, PATH, Path: PATH },
    });
    /** A program named like Python that is not Python — what the Windows Store stub is. */
    const impostor = (dir: string, name: string) => {
        if (process.platform === 'win32') fs.copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe'), path.join(dir, `${name}.exe`));
        else { fs.writeFileSync(path.join(dir, name), '#!/bin/sh\necho "Python was not found"\nexit 49\n'); fs.chmodSync(path.join(dir, name), 0o755); }
    };

    (python ? it : it.skip)('it skips a stub that is not Python 3 and runs the real one, passing the arguments and the exit code through', () => {
        const dir = tmp('launcher');
        const stubs = path.join(dir, 'stubs');
        fs.mkdirSync(stubs);
        impostor(stubs, process.platform === 'win32' ? 'python' : 'python3');
        fs.writeFileSync(path.join(dir, 'main.py'), 'import sys\nprint("args=" + ",".join(sys.argv[1:]))\nsys.exit(int(sys.argv[1]))\n');
        // The premise: the first name on PATH is not Python.
        const first = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', 'import sys'], { cwd: dir, env: { ...process.env, PATH: stubs, Path: stubs } });
        expect(first.status).not.toBe(0);
        const PATH = `${stubs}${path.delimiter}${process.env.PATH || process.env.Path || ''}`;
        const result = launch(['main.py', '7', 'x'], dir, PATH);
        expect({ status: result.status, out: result.stdout.trim() }).toEqual({ status: 7, out: 'args=7,x' });
    });

    it('with no Python 3 at all it says so, naming every name it tried, and fails', () => {
        const dir = tmp('launcher-none');
        impostor(dir, process.platform === 'win32' ? 'python' : 'python3');
        const result = launch(['main.py'], dir, dir);
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(process.platform === 'win32'
            ? /No Python 3 interpreter was found on this machine \(tried: python, py -3, python3\)/u
            : /No Python 3 interpreter was found on this machine \(tried: python3, python\)/u);
    });
});
