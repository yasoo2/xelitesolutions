/**
 * «جو لا يعتمد على الطرفية بشكل كبير وحقيقي ويجب أن يكون ذلك بشكل مرئي
 *  للمستخدم»
 *
 * He is right, and the reason is precise. Joe DID run real processes — npm
 * install, vite build, node server.js, a dozen probes. But of all that, only
 * the OUTPUT reached his screen. The command that produced it never did. So
 * the panel filled with npm's chatter attached to nothing: no prompt, no
 * arguments, no exit code, no duration. That does not read as a machine
 * working. It reads as a log file scrolling.
 *
 * The whole difference is what a shell shows you:
 *
 *     my-workspace/api-dar-al-rifq $ npm install --no-audit --no-fund
 *       added 68 packages in 738ms
 *     → exit 0 · 0.8s
 *
 * Same process, same bytes. One is a person working in a terminal; the other
 * is a program printing. This suite holds the first shape in place.
 */
import fs from 'fs';
import path from 'path';
import { openTerminal, transcriptLine } from '../core/quality/terminal-session';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const REACT = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
const API = read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
const AUDIT = read('core', 'quality', 'terminal-audit.ts');

describe('a session that looks like a shell, because it is one', () => {
    it('opening it states the machine it is working on', async () => {
        const lines: string[] = [];
        const t = openTerminal(l => lines.push(l));
        await t.open('Joe\'s terminal — building the server', '/tmp/work/my-app');
        const text = lines.join('\n');
        expect(text).toContain('Joe\'s terminal — building the server');
        expect(text).toContain('/tmp/work/my-app');
        // node and npm are asked for by running them, never assumed.
        expect(text).toMatch(/work\/my-app \$ node -v/);
        expect(text).toMatch(/work\/my-app \$ npm -v/);
    }, 30_000);

    it('every command is echoed BEFORE it runs, with its arguments', async () => {
        const lines: string[] = [];
        const t = openTerminal(l => lines.push(l));
        // The printed text is COMPUTED, so it cannot appear in the echoed
        // command line — otherwise the search below would find the prompt and
        // call it the output.
        await t.run(process.execPath, ['-e', 'console.log(["hello","from","a","real","process"].join("-"))'], { cwd: '/tmp' });
        const at = lines.findIndex(l => /\$ .*-e console\.log/.test(l));
        const out = lines.findIndex(l => /hello-from-a-real-process/.test(l));
        expect(at).toBeGreaterThanOrEqual(0);
        // The prompt precedes the output: it cannot be describing a command
        // that already finished.
        expect(at).toBeLessThan(out);
    }, 30_000);

    it('and every command ends out loud — exit code and elapsed time', async () => {
        const lines: string[] = [];
        const t = openTerminal(l => lines.push(l));
        await t.run(process.execPath, ['-e', 'console.log(1)'], { cwd: '/tmp' });
        expect(lines.some(l => /^→ exit 0 · \d+\.\d+s$/.test(l))).toBe(true);
    }, 30_000);

    /**
     * A transcript where failures are silent teaches him to distrust the
     * successes too.
     */
    it('a FAILING command is just as loud as a passing one', async () => {
        const lines: string[] = [];
        const t = openTerminal(l => lines.push(l));
        const r = await t.run(process.execPath, ['-e', 'process.exitCode = 3'], { cwd: '/tmp' });
        expect(r.exitCode).toBe(3);
        expect(lines.some(l => /^→ exit 3 · /.test(l))).toBe(true);
    }, 30_000);

    it('a command that is not on this machine says so by name', async () => {
        const lines: string[] = [];
        const t = openTerminal(l => lines.push(l));
        const r = await t.run('definitely-not-a-real-binary-xyz', ['--help'], { cwd: '/tmp', timeout: 8000 });
        expect(r.missing || r.exitCode !== 0).toBe(true);
        expect(lines.some(l => /not found|→ exit/.test(l))).toBe(true);
    }, 30_000);

    it('Joe\'s own words are marked as his, never dressed as process output', async () => {
        const lines: string[] = [];
        const t = openTerminal(l => lines.push(l));
        t.note('packages installed — the server can boot now');
        expect(lines[0]).toBe('# packages installed — the server can boot now');
    });

    it('the transcript counts what really ran, and names what failed', async () => {
        const t = openTerminal(() => { /* silent: this is about the count */ });
        await t.run(process.execPath, ['-e', 'console.log(1)'], { cwd: '/tmp' });
        await t.run(process.execPath, ['-e', 'process.exitCode = 1'], { cwd: '/tmp' });
        const tr = t.transcript();
        expect(tr.commands).toBe(2);
        expect(tr.passed).toBe(1);
        expect(tr.failed).toHaveLength(1);
        expect(tr.failed[0].command).toContain('process.exitCode = 1');
    }, 40_000);
});

describe('the report says how much of the build was real shell work', () => {
    it('a clean run is one line with the count', () => {
        const line = transcriptLine({ commands: 17, passed: 17, failed: [] }, false);
        expect(line).toContain('17 real commands');
        expect(line).toContain('17 exited clean');
    });

    it('a run with failures names them, with their exit codes', () => {
        const line = transcriptLine({
            commands: 5, passed: 4,
            failed: [{ command: 'npm ls --depth=0', exitCode: 1, ms: 300 }],
        }, false);
        expect(line).toContain('npm ls --depth=0');
        expect(line).toContain('exit 1');
    });

    it('…and it speaks Arabic when he does', () => {
        const line = transcriptLine({ commands: 3, passed: 3, failed: [] }, true);
        expect(line).toContain('الطرفية');
        expect(/[؀-ۿ]/.test(line)).toBe(true);
    });

    it('nothing ran means nothing is claimed', () => {
        expect(transcriptLine({ commands: 0, passed: 0, failed: [] }, false)).toBe('');
    });
});

describe('THE WIRING: both builders work in the visible shell', () => {
    it('the interface build opens the terminal panel before it writes a file', () => {
        expect(REACT).toMatch(/const shell = openTerminal\(term\);/);
        expect(REACT).toMatch(/panel: 'terminal', reason: 'build_shell'/);
        // …and the panel request comes before the scaffolding, not after it.
        expect(REACT.indexOf("reason: 'build_shell'"))
            .toBeLessThan(REACT.indexOf('react_project: scaffolded'));
    });

    it('and every process it runs goes through the session', () => {
        expect(REACT).toMatch(/const r = await shell\.run\(cmd, args, \{ cwd: proj, timeout: timeoutMs \}\);/);
        expect(REACT).toMatch(/await shell\.open\(/);
        // The old silent runner is gone — no bare streaming spawn in the build.
        expect(REACT).not.toMatch(/onLine: \(l: string\) => \{ lastLog \+= l \+ '\\n'; term\(/);
    });

    it('the server build does the same, and announces its long-running process', () => {
        expect(API).toMatch(/const shell = openTerminal\(term\);/);
        expect(API).toMatch(/const instRun = await shell\.run\('npm', \['install'/);
        // `node server.js` cannot be awaited like a command, but it is still
        // announced — otherwise the server's log appears under no command.
        expect(API).toMatch(/term\(`\$\{path\.basename\(proj\)\} \$ node server\.js   # PORT=\$\{port\}`\);/);
    });

    it('and the delivery report carries the transcript', () => {
        expect(REACT).toMatch(/const shellBlock = \(\(\) => \{/);
        expect(REACT).toMatch(/const line = transcriptLine\(shell\.transcript\(\), isAr\);/);
        // In BOTH languages' messages, never one of them.
        expect((REACT.match(/\$\{qaBlock\}\$\{shellBlock\}/g) || []).length).toBe(2);
    });

    /**
     * It first sat inside the QA block and vanished on any build where the
     * browser audit was skipped — the exact runs where the terminal is the
     * only instrument that worked, and so the only one with anything to say.
     */
    it('…and it survives a build where the browser never ran', () => {
        const block = REACT.indexOf('const shellBlock');
        const qa = REACT.indexOf('const qaBlock');
        expect(block).toBeGreaterThan(qa);
        // It is its own block: nothing about it depends on `audit`.
        const body = REACT.slice(block, block + 400);
        expect(body).not.toMatch(/\baudit\b/);
    });
});

describe('the terminal now has an opinion about the INTERFACE too', () => {
    it('three checks a browser cannot answer', () => {
        for (const id of ['app_deps_installed', 'app_bundle_real', 'app_is_the_one_served']) {
            expect(AUDIT).toContain(`'${id}'`);
        }
    });

    it('a bundle is bytes on disk, not a claim', () => {
        expect(AUDIT).toMatch(/no dist\/index\.html — nothing was bundled/);
        expect(AUDIT).toMatch(/dist\/index\.html loads no script — the bundle is an empty shell/);
        expect(AUDIT).toMatch(/bytes > 20_000/);
    });

    /**
     * A build can succeed and the packaging step still copy nothing — and then
     * he opens the site and sees the previous version, with every other check
     * green.
     */
    it('and the page the SERVER serves is compared to the one just built', () => {
        expect(AUDIT).toMatch(/the served page differs from the built one — he would open an older version/);
        expect(AUDIT).toMatch(/the server serves exactly the bundle that was just built/);
    });

    it('the interface is handed to the audit by the build', () => {
        expect(REACT).toMatch(/appDir: proj,/);
        expect(AUDIT).toMatch(/const appDir = String\(opts\.appDir \|\| ''\);/);
    });
});

/**
 * Found by running the shell on an ordinary request — «Tables: bookings,
 * clients» on a booking system — and reading the transcript it printed.
 */
describe('one name cannot mean two tables', () => {
    it('a declared table that IS the system\'s own table is not regenerated', () => {
        expect(API).toMatch(/const collided = designed\.filter\(\(e: any\) => e\.key === resource\)/);
        // The productivity blueprint chooses its own declared model, while every other domain still filters the built-in resource out.
        expect(API).toMatch(/designed\.filter\(\(e: any\) => e\.key !== resource\)/);
    });

    it('…and Joe says so, instead of silently dropping a word he typed', () => {
        expect(API).toMatch(/already the system's own table, not regenerated/);
        expect(API).toMatch(/هو جدول النظام الأساسي أصلاً/);
    });

    it('and a blueprint relation stands down when he named the tables', () => {
        // Repointed: the stand-down rule widened. It used to fire only on a
        // literal «الجداول: …» declaration; measured on an eleven-domain
        // sentence that declares nothing under that label, the two-table
        // parent/child shortcut replaced nine tables the request described.
        // The guarantee is the same and now covers both ways of naming them.
        expect(API).toMatch(/const relation = \(declaredForRelation \|\| designed\.length >= 3\)/);
        expect(API).toMatch(/: apiRelationForRequest\(request\);/);
    });
});
