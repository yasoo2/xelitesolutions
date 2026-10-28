/**
 * Round 21 (quality fork's hand-back): every Python command Joe wrote or ran
 * said `python` — the CLI scaffold's start and test scripts, the test runner
 * its plans use, the delivery gate's run of his tests, discovery's test check.
 * A Linux server ships `python3` and often no `python` at all (Ubuntu without
 * python-is-python3), so a finished program failed there at «python: not
 * found». python-runtime already knew the name each platform ships; now every
 * one of them asks it.
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
        const commands: string[] = [];
        await runRequestedTests(root, async (_tool: string, input: any) => { commands.push(String(input.command)); return { ok: true, output: { stdout: '', stderr: 'Ran 1 test in 0.001s\n\nOK\n' } }; });
        return commands[0];
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

describe('a Python program runs with the interpreter the platform ships', () => {
    it('on Linux the scaffold, its test runner and the delivery gate say python3', async () => {
        const commands = onPlatform('linux', pipelineCommands);
        expect(commands.start).toBe('python3 main.py');
        expect(commands.test).toMatch(/^python3 -c "/u);
        expect(commands.runner).toMatch(/^python3 -c "/u);
        let gate: Promise<string> = Promise.resolve('');
        onPlatform('linux', () => { gate = gateCommand(); });
        expect(await gate).toBe('python3 -m unittest discover -v');
    });

    it('on Windows they say python, the name Windows ships', async () => {
        const commands = onPlatform('win32', pipelineCommands);
        expect(commands.start).toBe('python main.py');
        expect(commands.test).toMatch(/^python -c "/u);
        let gate: Promise<string> = Promise.resolve('');
        onPlatform('win32', () => { gate = gateCommand(); });
        expect(await gate).toBe('python -m unittest discover -v');
    });
});
