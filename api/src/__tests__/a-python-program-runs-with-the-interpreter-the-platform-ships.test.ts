/**
 * Round 21 (quality fork's hand-back): every Python command Joe wrote or ran
 * said `python` — the CLI scaffold's start and test scripts, the test runner
 * its plans use, the delivery gate's run of his tests, discovery's test check.
 * A Linux server ships `python3` and often no `python` at all (Ubuntu without
 * python-is-python3), so a finished program failed there at «python: not
 * found». python-runtime already knew the name each platform ships; now every
 * one of them asks it.
 *
 * Round 22 (second review, Q11): asking it at BUILD time was still a guess for
 * the machine that runs the program — built on the Linux server, `python3
 * main.py` is the Microsoft Store stub on the Windows laptop he downloads it
 * to. A DELIVERED script now starts through a launcher that finds Python 3
 * where it runs (python-test-runner), the same text on every platform; only
 * Joe's own run of a check, on its own machine, uses the name that machine
 * ships.
 *
 * The platform is read when the modules load, so each case loads them afresh
 * under the platform it claims.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const PLATFORM = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => { Object.defineProperty(process, 'platform', PLATFORM); });

function onPlatform<T>(platform: NodeJS.Platform, read: () => T): T {
    Object.defineProperty(process, 'platform', { ...PLATFORM, value: platform });
    let out!: T;
    jest.isolateModules(() => { out = read(); });
    return out;
}

const CLI = 'Write a Python command-line tool that reads a CSV file and prints how many rows it has';

function pipelineCommands() {
    const { deterministicPhasesFor, pythonTestCommand } = require('../modules/tools/definitions/ProjectPipelineTool');
    const structure = deterministicPhasesFor(CLI)!.phases[0].tasks[0].args.structure as Record<string, string>;
    const pkg = JSON.parse(structure['package.json']);
    return { start: String(pkg.scripts.start), test: String(pkg.scripts.test), runner: String(pythonTestCommand(['test_main.py'], true)) };
}

async function gateCommand(): Promise<string> {
    const { runRequestedTests } = require('../core/quality/request-coverage');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-python-name-'));
    try {
        fs.writeFileSync(path.join(root, 'app.py'), 'x = 1\n');
        fs.writeFileSync(path.join(root, 'test_app.py'), 'def test_x():\n    assert True\n');
        const commands: string[] = [];
        await runRequestedTests(root, async (_tool: string, input: any) => { commands.push(String(input.command)); return { ok: true, output: { stdout: '', stderr: 'Ran 1 test in 0.001s\n\nOK\n' } }; });
        return commands[0];
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

describe('a Python program runs with an interpreter the machine running it has', () => {
    it('the delivered scripts are the same whichever platform built them, and start through the launcher', () => {
        const { pythonLauncher } = require('../core/quality/python-test-runner');
        const linux = onPlatform('linux', pipelineCommands);
        const windows = onPlatform('win32', pipelineCommands);
        expect(windows).toEqual(linux);
        expect(linux.start).toBe(`${pythonLauncher()} main.py`);
        expect(linux.test.startsWith(`${pythonLauncher()} -c "`)).toBe(true);
        expect(linux.runner.startsWith(`${pythonLauncher()} -c "`)).toBe(true);
    });

    it('Joe\'s own run of his tests, on its own machine, uses the name that machine ships', async () => {
        let gate: Promise<string> = Promise.resolve('');
        onPlatform('linux', () => { gate = gateCommand(); });
        expect(await gate).toMatch(/^python3 -c "[^"]+" \.$/u);
        onPlatform('win32', () => { gate = gateCommand(); });
        expect(await gate).toMatch(/^python -c "[^"]+" \.$/u);
    });
});
