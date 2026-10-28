import fs from 'fs';
import os from 'os';
import path from 'path';
import { runRequestedTests } from '../core/quality/request-coverage';
import { pythonExecutable } from '../core/quality/python-executable';
import { AutoTesterTool } from '../modules/tools/definitions/AutoTesterTool';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import * as ToolService from '../modules/services/ToolService';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Round 21: the delivery gate runs the tests he asked for with Python's own
 * runner, and took its exit code for the verdict. Before Python 3.12,
 * `python -m unittest discover` prints «Ran 0 tests … OK» and exits 0, so a
 * project whose test file held no test was «tested» — on the very servers
 * (Ubuntu 22.04 ships 3.10) Joe is built for. The runner's summary says it ran
 * nothing, but shell_execute dropped everything a successful command printed
 * to stderr, which is where unittest prints it.
 *
 * Python runs for real here, with the pre-3.12 exit code reproduced on this
 * interpreter, so the guard is measured where the exit code cannot help.
 */
jest.setTimeout(120_000);

const roots: string[] = [];
const savedPythonPath = process.env.PYTHONPATH;
afterAll(() => {
    if (savedPythonPath === undefined) delete process.env.PYTHONPATH; else process.env.PYTHONPATH = savedPythonPath;
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
afterEach(() => { jest.restoreAllMocks(); });

function project(files: Record<string, string>): string {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-empty-run-'));
    roots.push(ws);
    const root = path.join(ws, 'shop');
    fs.mkdirSync(root, { recursive: true });
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, name), body);
    jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(ws);
    return root;
}

/** Python 3.12 added exit code 5 as unittest.main._NO_TESTS_EXITCODE; 0 is the older behaviour. */
function olderUnittest(): void {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-py311-'));
    roots.push(dir);
    fs.writeFileSync(path.join(dir, 'sitecustomize.py'), "import sys, unittest.main\nsys.modules['unittest.main']._NO_TESTS_EXITCODE = 0\n");
    process.env.PYTHONPATH = dir;
}

const shell = (id: string) => (input: any) => executionFirewall.runInContext(id, () => new ShellExecuteTool().execute(input));
const runTool = (id: string) => async (tool: string, input: any) => {
    if (tool !== 'shell_execute') throw new Error(`unexpected tool ${tool}`);
    return shell(id)(input);
};

describe('a test run that ran nothing is not a pass', () => {
    it('a successful command keeps what it printed to stderr', async () => {
        const root = project({});
        const result: any = await shell('stderr-on-success')({ command: `${pythonExecutable()} -c "import sys; sys.stderr.write('said on stderr')"`, cwd: root });
        expect(result.ok).toBe(true);
        expect(String(result.output.stderr)).toContain('said on stderr');
    });

    it('a Python project whose test file holds no test is not «tested», where unittest exits 0 for it', async () => {
        olderUnittest();
        const root = project({ 'app.py': 'def add(a, b):\n    return a + b\n', 'test_app.py': 'import unittest\n' });
        // The interpreter really says «OK» and exits 0 here: only the summary can tell.
        const bare: any = await shell('empty-run-bare')({ command: `${pythonExecutable()} -m unittest discover -v`, cwd: root });
        expect(bare.ok).toBe(true);
        const run = await runRequestedTests(root, runTool('empty-run-gate'));
        expect(run).toMatchObject({ ran: true, passed: false, runner: `${pythonExecutable()} -m unittest discover -v` });
        expect(String(run.error)).toMatch(/ran no tests \(unittest: Ran 0 tests/);
    });

    it('a Python project whose tests ran and passed is «tested»', async () => {
        olderUnittest();
        const root = project({
            'app.py': 'def add(a, b):\n    return a + b\n',
            'test_app.py': 'import unittest\nfrom app import add\n\nclass AddTest(unittest.TestCase):\n    def test_adds(self):\n        self.assertEqual(add(2, 3), 5)\n',
        });
        expect(await runRequestedTests(root, runTool('ran-run-gate'))).toMatchObject({ ran: true, passed: true, error: undefined });
    });
});

/**
 * The same shape in auto_tester's unit and integration runs: it ran the
 * project's declared script and took its exit code. `node --test` with no test
 * file prints «ℹ tests 0» and exits 0 on Node 24 — on every machine.
 */
describe('auto_tester: a declared test script that ran nothing is not a pass', () => {
    const autoTester = (root: string, id: string) => {
        jest.spyOn(ToolService, 'executeTool').mockImplementation(async (tool: string, input: any) => {
            if (tool !== 'shell_execute') throw new Error(`unexpected tool ${tool}`);
            return shell(`${id}-shell`)(input) as any;
        });
        return executionFirewall.runInContext(id, () => new AutoTesterTool().execute({ testType: 'unit', projectPath: root }, { workspaceId: id })) as Promise<any>;
    };

    it('`node --test` with no test file fails, saying the runner ran no tests', async () => {
        const root = project({ 'package.json': JSON.stringify({ name: 'shop', scripts: { test: 'node --test' } }), 'index.js': 'module.exports = 1;\n' });
        const result = await autoTester(root, 'auto-tester-empty');
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/^the unit test script ran no tests \(node --test: ℹ tests 0\)/u);
    });

    it('a test that ran and passed passes', async () => {
        const root = project({
            'package.json': JSON.stringify({ name: 'shop', scripts: { test: 'node --test' } }),
            'add.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\ntest('adds', () => assert.strictEqual(1 + 1, 2));\n",
        });
        const result = await autoTester(root, 'auto-tester-ran');
        expect(result).toMatchObject({ ok: true, output: { passed: true } });
    });
});
