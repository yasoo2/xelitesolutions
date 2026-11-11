import fs from 'fs';
import os from 'os';
import path from 'path';
import { executionEngine } from '../kernel/ExecutionEngine';
import { installProgressProbe } from '../shared/network-install-timeouts';
import { openTerminal } from '../core/quality/terminal-session';

/**
 * Eval run500 P001, 2026-10-26 (run-1793050584667): react_project's cold
 * `npm install` printed nothing — npm on a pipe is silent until it is done —
 * while it wrote 2,226 files into node_modules and its --cache (1,040 in the
 * last full minute). The idle watchdog read only stdout/stderr and killed it
 * «after no progress for 302.1s»; the phase then failed «'vite' is not
 * recognized» and the build stopped at 0/5. Silence is not idleness when the
 * command is writing; a command that neither prints nor writes still stops.
 */
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'joe-silent-install-'));

// Silent for ~2.4 s, writing one file every 150 ms into <dir>/node_modules.
const silentWriter = (dir: string) => [
    '-e',
    `const fs=require('fs'),p=require('path');const d=p.join(${JSON.stringify(dir)},'node_modules');`
    + `fs.mkdirSync(d,{recursive:true});let i=0;const t=setInterval(()=>{fs.writeFileSync(p.join(d,'f'+(i++)),'x'.repeat(i));`
    + `if(i>=16){clearInterval(t);process.exit(0);}},150);`,
];
const silentSleeper = ['-e', 'setTimeout(()=>process.exit(0),4000)'];

describe('a silent install that is writing is not stalled', () => {
    jest.setTimeout(30_000);

    it('a silent command that keeps writing finishes under an idle bound shorter than its silence', async () => {
        const dir = tmp();
        const r = await executionEngine.runArgvStreaming('node', silentWriter(dir), {
            cwd: dir, timeout: 20_000, idleTimeout: 300, idleProgress: installProgressProbe(dir, []),
        }).done;
        expect(r).toEqual({ ok: true, exitCode: 0 });
        expect(fs.readdirSync(path.join(dir, 'node_modules'))).toHaveLength(16);
    });

    it('the terminal session the build tools run through carries the progress evidence to the engine', async () => {
        const dir = tmp();
        const lines: string[] = [];
        const r = await openTerminal(l => lines.push(l)).run('node', silentWriter(dir), {
            cwd: dir, timeout: 20_000, idleTimeout: 300, idleProgress: installProgressProbe(dir, []),
        });
        expect(r.exitCode).toBe(0);
        expect(r.timedOut).toBe(false);
        expect(lines.some(l => /stopped after no progress/.test(l))).toBe(false);
    });

    it('without the progress evidence the same command is still cut as idle (the bound itself is unchanged)', async () => {
        const dir = tmp();
        const r = await executionEngine.runArgvStreaming('node', silentWriter(dir), {
            cwd: dir, timeout: 20_000, idleTimeout: 300,
        }).done;
        expect(r.error).toBe('idle_timeout');
    });

    it('a command that neither prints nor writes still stops at the idle bound', async () => {
        const dir = tmp();
        const started = Date.now();
        const r = await executionEngine.runArgvStreaming('node', silentSleeper, {
            cwd: dir, timeout: 20_000, idleTimeout: 300, idleProgress: installProgressProbe(dir, []),
        }).done;
        expect(r.error).toBe('idle_timeout');
        expect(Date.now() - started).toBeLessThan(3_500);
    });

    it('the probe reads node_modules and the --cache npm was given, in both spellings', async () => {
        const dir = tmp();
        const cacheA = path.join(dir, '.joe', 'npm-cache');
        const cacheB = path.join(dir, 'other-cache');
        const probe = installProgressProbe(dir, ['install', '--cache', cacheA, `--cache=${cacheB}`]);
        const first = await probe();
        expect(await probe()).toBe(first);
        for (const [at, name] of [[path.join(dir, 'node_modules', 'react'), 'index.js'], [path.join(cacheA, '_cacache'), 'x'], [cacheB, 'y']]) {
            const before = await probe();
            fs.mkdirSync(at, { recursive: true });
            fs.writeFileSync(path.join(at, name), 'data');
            expect(await probe()).not.toBe(before);
        }
        // Files outside those roots are not the install's progress.
        const before = await probe();
        fs.writeFileSync(path.join(dir, 'unrelated.txt'), 'data');
        expect(await probe()).toBe(before);
    });

    it('every project install passes its writes as progress (react_project and the API tool)', () => {
        const defs = path.join(__dirname, '..', 'modules', 'tools', 'definitions');
        const react = fs.readFileSync(path.join(defs, 'ReactProjectTool.ts'), 'utf8');
        const runner = react.slice(react.indexOf('const run = async (cmd: string, args: string[], timeoutMs: number, idleTimeoutMs?: number)'));
        expect(runner.slice(0, 600)).toMatch(/idleProgress: cmd === 'npm' && idleTimeoutMs \? installProgressProbe\(proj, args\)/);
        const api = fs.readFileSync(path.join(defs, 'ApiProjectTool.ts'), 'utf8');
        const install = api.slice(api.indexOf("const instRun = await shell.run('npm', ["), api.indexOf('const inst = instRun.missing'));
        expect(install).toContain("idleProgress: installProgressProbe(proj, ['--cache', npmCache])");
    });
});
