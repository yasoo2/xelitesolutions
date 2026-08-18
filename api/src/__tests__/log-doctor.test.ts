/**
 * WHAT THE TERMINAL DISCOVERS, JOE FIXES.
 *
 * The browser half was done — an audit finds a defect and the source is
 * repaired before delivery. The terminal half returned ADVICE: a table matched
 * the error and produced «Change port or kill process using the port», printed
 * at the person who had asked Joe to do the work.
 *
 * A diagnosis earns its place here only by being certain (the log says so
 * outright), deterministic (the remedy is an action, not a judgement) and safe
 * (applying it to a healthy project changes nothing). These gates hold that
 * line — especially the last group, which keeps a guess from ever being
 * dressed up as a fix.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { diagnose, applyRemedy, portFree, findFreePort } from '../core/quality/log-doctor';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'joe-doctor-t-'));

describe('reading a failed command', () => {
    it('names a missing install however the shell words it', () => {
        const cwd = tmp();   // no node_modules in it
        for (const log of [
            'sh: 1: vite: not found',
            "'vite' is not recognized as an internal or external command",
            'Error: Cannot find module \'vite\'',
            'ERR_MODULE_NOT_FOUND',
        ]) {
            expect(diagnose({ exitCode: 127, log, cwd })?.id).toBe('no_node_modules');
        }
        fs.rmSync(cwd, { recursive: true, force: true });
    });

    it('does not blame the install when the packages are there', () => {
        const cwd = tmp();
        fs.mkdirSync(path.join(cwd, 'node_modules'), { recursive: true });
        expect(diagnose({ exitCode: 127, log: 'sh: 1: vite: not found', cwd })?.id).not.toBe('no_node_modules');
        fs.rmSync(cwd, { recursive: true, force: true });
    });

    it('names the package a bundler asked for, and skips one already declared', () => {
        const cwd = tmp();
        fs.mkdirSync(path.join(cwd, 'node_modules'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ dependencies: { react: '^18' } }));
        const log = 'Failed to resolve import "recharts" from "src/App.jsx"';
        const d = diagnose({ exitCode: 1, log, cwd });
        expect(d?.id).toBe('missing_package');
        expect(d?.data.missing).toContain('recharts');
        // A package the manifest already declares is an install problem, not a
        // shopping list — fetching it again would fix nothing.
        expect(diagnose({ exitCode: 1, log: 'Failed to resolve import "react" from "src/App.jsx"', cwd })?.id)
            .not.toBe('missing_package');
        fs.rmSync(cwd, { recursive: true, force: true });
    });

    it('reads a port conflict and carries the number', () => {
        const d = diagnose({ exitCode: 1, cwd: tmp(), log: 'Error: listen EADDRINUSE: address already in use 127.0.0.1:5002' });
        expect(d?.id).toBe('port_in_use');
        expect(d?.data.port).toBe(5002);
        expect(d?.fixable).toBe(true);
    });

    it('reads a heap exhaustion', () => {
        const d = diagnose({ exitCode: 134, cwd: tmp(), log: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory' });
        expect(d?.id).toBe('heap_out_of_memory');
    });
});

describe('what it will NOT pretend to fix', () => {
    it('repairs a relative import only when the uniquely evidenced file is one ancestor away', async () => {
        const cwd = tmp();
        fs.mkdirSync(path.join(cwd, 'node_modules', '.bin'), { recursive: true });
        fs.mkdirSync(path.join(cwd, 'src', 'components'), { recursive: true });
        fs.mkdirSync(path.join(cwd, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'src', 'components', 'WeatherApp.jsx'), "import '../styles/other.css';\nimport './styles/app.css';\n");
        fs.writeFileSync(path.join(cwd, 'src', 'styles', 'app.css'), 'body {}\n');
        const d = diagnose({ exitCode: 1, cwd, log: 'Failed to resolve import "./styles/app.css" from "src/components/WeatherApp.jsx"' })!;
        expect(d.id).toBe('repairable_relative_import');
        expect(d.fixable).toBe(true);
        const r = await applyRemedy(d, cwd, async () => ({ exitCode: 0 }));
        expect(r.applied).toBe(true);
        expect(fs.readFileSync(path.join(cwd, 'src', 'components', 'WeatherApp.jsx'), 'utf8')).toContain("import '../styles/app.css';");
        fs.rmSync(cwd, { recursive: true, force: true });
    });

    it('a dangling local import is named, with both files, and left alone', () => {
        const d = diagnose({
            exitCode: 1, cwd: tmp(),
            log: 'Failed to resolve import "./components/Missing.jsx" from "src/App.jsx". Does the file exist?',
        });
        expect(d?.id).toBe('dangling_import');
        expect(d?.fixable).toBe(false);
        expect(d?.ar).toContain('Missing.jsx');
        expect(d?.ar).toContain('App.jsx');
    });

    it('an unrecognised failure gets no invented diagnosis', () => {
        expect(diagnose({ exitCode: 1, cwd: tmp(), log: 'Error: something nobody has ever seen' })).toBeNull();
    });

    it('a command that never started, and one that timed out, are told apart', () => {
        expect(diagnose({ exitCode: null, cwd: tmp(), log: '' })?.id).toBe('npm_missing');
        expect(diagnose({ exitCode: 124, cwd: tmp(), log: 'building…', timedOut: true })?.id).toBe('timeout');
    });
});

describe('the remedies act, they do not advise', () => {
    it('a heap failure raises the limit and changes nothing else', async () => {
        const d = diagnose({ exitCode: 134, cwd: tmp(), log: 'JavaScript heap out of memory' })!;
        const r = await applyRemedy(d, tmp(), async () => ({ exitCode: 0 }));
        expect(r.applied).toBe(true);
        expect(r.envPatch).toEqual({ NODE_OPTIONS: '--max-old-space-size=4096' });
    });

    it('a busy port becomes a free one, verified by binding it', async () => {
        const d = diagnose({ exitCode: 1, cwd: tmp(), log: 'EADDRINUSE 127.0.0.1:4301' })!;
        const r = await applyRemedy(d, tmp(), async () => ({ exitCode: 0 }));
        expect(r.applied).toBe(true);
        expect(r.portPatch).toBeGreaterThan(4301);
        expect(await portFree(r.portPatch!)).toBe(true);
        expect(r.envPatch?.PORT).toBe(String(r.portPatch));
    });

    it('a package remedy installs exactly what was named', async () => {
        const cwd = tmp();
        fs.mkdirSync(path.join(cwd, 'node_modules'), { recursive: true });
        fs.writeFileSync(path.join(cwd, 'package.json'), '{}');
        const d = diagnose({ exitCode: 1, cwd, log: 'Failed to resolve import "recharts" from "src/App.jsx"' })!;
        const calls: string[][] = [];
        await applyRemedy(d, cwd, async (c, a) => { calls.push([c, ...a]); return { exitCode: 0 }; });
        expect(calls[0]).toEqual(['npm', 'install', '--no-audit', '--no-fund', 'recharts']);
        fs.rmSync(cwd, { recursive: true, force: true });
    });

    it('and a diagnosis it cannot act on returns no action at all', async () => {
        const d = diagnose({ exitCode: 1, cwd: tmp(), log: 'Failed to resolve import "./x.jsx" from "src/App.jsx"' })!;
        const r = await applyRemedy(d, tmp(), async () => ({ exitCode: 0 }));
        expect(r.applied).toBe(false);
    });
});

describe('the doctor is on the paths that actually run commands', () => {
    const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

    it('the React build diagnoses its own failure and retries once', () => {
        const R = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(R).toMatch(/require\('\.\.\/\.\.\/\.\.\/core\/quality\/log-doctor'\)/);
        expect(R).toMatch(/if \(remedy\.applied\)/);
        expect(R).toMatch(/buildDiagnosis/);
    });

    it('the self-repair rebuild goes through it too', () => {
        expect(read('core', 'quality', 'self-repair.ts')).toMatch(/const \{ runDoctored \} = require\('\.\/log-doctor'\)/);
    });

    it('one remedy, one retry — the loop is bounded by construction', () => {
        const D = read('core', 'quality', 'log-doctor.ts');
        expect((D.match(/THE ONE RETRY/g) || []).length).toBe(1);
        expect(D).toMatch(/const second = await runCmd\(cmd, args, timeoutMs/);
        // …and no third attempt anywhere in the function.
        expect((D.match(/await runCmd\(cmd, args/g) || []).length).toBe(2);
    });
});

describe('free-port search', () => {
    it('returns a port that really is bindable', async () => {
        const p = await findFreePort(4500);
        expect(p).toBeGreaterThanOrEqual(4500);
        expect(await portFree(p)).toBe(true);
    });
});
