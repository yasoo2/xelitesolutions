/**
 * THE SAME FILES THAT PASSED ARE NOT RUN AGAIN (request-coverage.ts runRequestedTests).
 *
 * The Codex exam in Arabic, 2026-11-08: a second task_finish ran the whole
 * suite again on a tree byte for byte the one that had just passed; the
 * ladder's L150 ran `npm test` (97–183 s) on each of nine task_finish calls.
 * Pinned: the same files again are the same pass; any edit — a file changed,
 * added or removed — is a new run; a failure is never kept; what a test run
 * writes in the machine's own folders changes nothing; and it can be turned off.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.setTimeout(60_000);

let dir = '';
beforeEach(() => {
    jest.resetModules();
    process.env.JOE_TEST_RUN_CACHE = 'on';
    dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-same-files-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', scripts: { test: 'node --test' } }));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'sum.js'), 'module.exports = (a, b) => a + b;\n');
});
afterEach(() => {
    delete process.env.JOE_TEST_RUN_CACHE;
    fs.rmSync(dir, { recursive: true, force: true });
});

function runner(outcomes: boolean[]) {
    const calls: string[] = [];
    const runTool = async (tool: string) => {
        calls.push(tool);
        const ok = outcomes.length ? outcomes.shift()! : true;
        return { ok, output: { results: [{ task: 'test', skipped: false, ...(ok ? {} : { error: '1 test failed' }) }] }, ...(ok ? {} : { error: '1 test failed' }) };
    };
    return { calls, runTool };
}
const rc = () => require('../core/quality/request-coverage');

test('the same files again are the same pass; an edit, a new file or a removed one is a new run', async () => {
    const { runRequestedTests } = rc();
    const { calls, runTool } = runner([]);
    const first = await runRequestedTests(dir, runTool);
    expect(first).toMatchObject({ ran: true, passed: true, runner: 'npm test' });
    expect(first.sameFilesAsLastPass).toBeUndefined();
    const again = await runRequestedTests(dir, runTool);
    expect(again).toMatchObject({ ran: true, passed: true, sameFilesAsLastPass: true });
    expect(calls).toHaveLength(1);

    fs.writeFileSync(path.join(dir, 'src', 'sum.js'), 'module.exports = (a, b) => b + a;\n');
    expect((await runRequestedTests(dir, runTool)).sameFilesAsLastPass).toBeUndefined();
    expect(calls).toHaveLength(2);
    fs.writeFileSync(path.join(dir, 'src', 'extra.js'), '1;\n');
    await runRequestedTests(dir, runTool);
    fs.rmSync(path.join(dir, 'src', 'extra.js'));
    await runRequestedTests(dir, runTool);
    expect(calls).toHaveLength(4);
});

test('what a test run writes in the machine\'s own folders changes nothing', async () => {
    const { runRequestedTests } = rc();
    const { calls, runTool } = runner([]);
    await runRequestedTests(dir, runTool);
    for (const d of ['node_modules', '.joe', 'coverage', '__pycache__']) {
        fs.mkdirSync(path.join(dir, d), { recursive: true });
        fs.writeFileSync(path.join(dir, d, 'x.txt'), String(Date.now()));
    }
    fs.writeFileSync(path.join(dir, 'npm-debug.log'), 'noise');
    expect((await runRequestedTests(dir, runTool)).sameFilesAsLastPass).toBe(true);
    expect(calls).toHaveLength(1);
});

test('a failure is never kept: the same files are run again', async () => {
    const { runRequestedTests } = rc();
    const { calls, runTool } = runner([false, true, true]);
    expect((await runRequestedTests(dir, runTool)).passed).toBe(false);
    expect((await runRequestedTests(dir, runTool)).passed).toBe(true);
    expect(calls).toHaveLength(2);
    expect((await runRequestedTests(dir, runTool)).sameFilesAsLastPass).toBe(true);
    expect(calls).toHaveLength(2);
});

test('JOE_TEST_RUN_CACHE=off runs every time', async () => {
    process.env.JOE_TEST_RUN_CACHE = 'off';
    const { runRequestedTests } = rc();
    const { calls, runTool } = runner([]);
    await runRequestedTests(dir, runTool);
    await runRequestedTests(dir, runTool);
    expect(calls).toHaveLength(2);
});
