/**
 *  A TEST RUN HELD OPEN SAYS WHY, AND HOW TO SEE ITS RESULTS.
 *
 *  C08 of the Codex exam, 2026-11-06: the model wrote attack tests for a path
 *  traversal; the suite started the server and never closed it, so `npm
 *  test` finished its tests and never exited. Piped into Select-String, it
 *  showed nothing, and all Joe heard was «Timed out after 301 s … It printed
 *  nothing» — then 121 s, then 90 s: eight minutes of a thirteen-minute fix.
 *
 *  Real processes: a node:test suite that leaves a server listening, run
 *  through shell_run with a short limit. The answer names the cause and the
 *  runner's own way out; the way out, run for real, ends with the results.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runShellCommand } from '../modules/tools/definitions/EngineShellTools';
import { testHangHint } from '../core/quality/test-run-evidence';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(120_000);

const TMP = process.env.JOE_TEST_TMP_ROOT || os.tmpdir();
let base = '';
let root = '';

beforeAll(() => {
    base = fs.mkdtempSync(path.join(TMP, 'joe-held-open-'));
    root = path.join(base, 'downloads');
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'downloads', scripts: { test: 'node --test' } }));
    //  The tests pass, and the server they started is never closed.
    fs.writeFileSync(path.join(root, 'test', 'held.test.js'), [
        'const test = require("node:test");',
        'const http = require("http");',
        'const server = http.createServer((q, s) => s.end("ok")).listen(0, "127.0.0.1");',
        'test("downloads a file", async () => { await new Promise(r => server.once("listening", r)); });',
    ].join('\n'));
});
beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(base); });
afterEach(() => { jest.restoreAllMocks(); });
afterAll(() => { fs.rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

const run = (input: any): Promise<any> => executionFirewall.runInContext('held-open-test', () =>
    runShellCommand(input, { projectRoot: root, workspaceId: 'ws-held-open', runId: 'run-held-open' }));

test('the hint names the runner\'s own way out', () => {
    expect(testHangHint('npm test', 'node --test')).toMatch(/node --test --test-isolation=none --test-force-exit/u);
    expect(testHangHint('npx jest')).toMatch(/--forceExit.*--detectOpenHandles/u);
    expect(testHangHint('npm test', 'vitest')).toMatch(/vitest run/u);
    expect(testHangHint('npm test', 'vitest run')).not.toMatch(/vitest run`/u);
    expect(testHangHint('npx mocha')).toMatch(/--exit/u);
    expect(testHangHint('npm test 2>&1 | Select-String -Pattern "fail"', 'node --test')).toMatch(/pipe held the runner's lines back/u);
    expect(testHangHint('npm test', '')).toMatch(/force-exit option/u);
});

test('a suite held open by its own server: the timeout says why and how to see the results', async () => {
    const r = await run({ command: 'npm test', timeout_seconds: 12 });
    expect(r.ok).toBe(false);
    expect(r.output.text).toMatch(/Timed out after/u);
    expect(r.output.text).toMatch(/Hint: A test run that reaches its limit has usually finished its tests and is held open/u);
    expect(r.output.text).toMatch(/node --test --test-isolation=none --test-force-exit/u);
});

test('the way out it names, run for real, ends with the results', async () => {
    const r = await run({ command: 'node --test --test-isolation=none --test-force-exit', timeout_seconds: 60 });
    expect(r.output.text).toMatch(/Exit code 0/u);
    expect(r.output.text).toMatch(/pass 1/u);
});

test('a command that is not a test run gets no test hint', async () => {
    fs.writeFileSync(path.join(root, 'forever.js'), 'setInterval(() => {}, 1000);');
    const r = await run({ command: 'node forever.js', timeout_seconds: 5 });
    expect(r.output.text).toMatch(/Timed out after/u);
    expect(r.output.text).not.toMatch(/Hint: A test run/u);
});
