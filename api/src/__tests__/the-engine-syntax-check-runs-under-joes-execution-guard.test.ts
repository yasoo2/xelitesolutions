/**
 * THE ENGINE'S SYNTAX CHECK RUNS UNDER JOE'S EXECUTION GUARD.
 *
 * At boot Joe installs ExecutionGuard (api/index.ts), which blocks every child
 * process whose stack is not ExecutionEngine's. esbuild's asynchronous
 * `transform` starts its service from the calling thread, so under the guard
 * it is blocked and a syntax check built on it says «unchecked» on his machine
 * while it passes in jest, where no guard is installed. This test installs the
 * real guard and shows the check still locates a broken file and still gates
 * an edit. The guard's originals are put back afterwards: child_process is
 * shared by every test file that runs in this process.
 */
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(120_000);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cp = require('child_process');
const originals = { spawn: cp.spawn, exec: cp.exec, execSync: cp.execSync, spawnSync: cp.spawnSync, execFile: cp.execFile, execFileSync: cp.execFileSync };

let fx: FileToolsFixture;
beforeAll(() => {
    fx = fileToolsFixture('guard');
    fx.put('src/app.js', 'export const a = 1;\n');
    require('../kernel/ExecutionGuard').ExecutionGuard.install();
});
afterAll(() => {
    Object.assign(cp, originals);
    fx.cleanup();
});

describe('with the guard installed, as on his machine', () => {
    it('the guard is really on: a child process started directly is blocked here', () => {
        expect(() => cp.spawnSync(process.execPath, ['--version'])).toThrow(/ExecutionGuard/u);
    });

    it('a broken file is still located by the parser', async () => {
        const r = await fx.run('engine_file_write', { path: 'bad.js', content: 'const x = ;\n' });
        expect(r.output.text).toContain('Written, but it does not parse: line 1 col 11: Unexpected ";"');
        expect((await fx.run('engine_file_write', { path: 'ok.tsx', content: 'export const C = () => <b />;\n' })).output.text).toMatch(/\nTSX syntax OK\.$/u);
    });

    it('an edit that would break a file that parsed is still refused, and the file keeps its bytes', async () => {
        const before = fx.sha('src/app.js');
        const r = await fx.run('engine_file_edit', { path: 'src/app.js', old_text: 'a = 1', new_text: 'a = ' });
        expect(r.error).toMatch(/^Not applied: after this edit src\/app\.js would not parse: line 1 col 18: Unexpected ";"\n/u);
        expect(fx.sha('src/app.js')).toBe(before);
    });
});
