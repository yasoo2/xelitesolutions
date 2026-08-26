/**
 * The push-safety audit (what happens when Joe edits a connected repo and
 * pushes it, especially on the user's Windows box) surfaced two real bugs:
 *
 * 1. The git runner joined argv into a string that a downstream runner
 *    re-split on whitespace. A commit message with spaces was shredded into
 *    bogus pathspecs — EVERY auto-commit in the push flow failed. Fixed by
 *    spawning git with a real argv array.
 * 2. Token auth used a `#!/bin/sh` GIT_ASKPASS that Windows cannot execute
 *    (no shebang honoring, no +x on NTFS) — every authenticated push/clone of
 *    a private repo failed there. Fixed with a platform-aware askpass: a .bat
 *    on Windows, the .sh elsewhere.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'GitTools.ts'), 'utf-8');

describe('argv is preserved — multi-word commit messages survive', () => {
    const engine = fs.readFileSync(
        path.join(__dirname, '..', 'kernel', 'ExecutionEngine.ts'), 'utf-8');

    test('git runs via a real argv array through ExecutionEngine, not a joined string', () => {
        expect(src).toMatch(/executionEngine\.runArgv\('git', finalArgs/);
    });
    test('the join-then-split runner is gone', () => {
        expect(src).not.toMatch(/finalArgs\.join\(' '\)/);
    });
    test('the tool imports NO child_process — the boot enforcer forbids it', () => {
        expect(src).not.toMatch(/from ['"]child_process['"]/);
        expect(src).not.toMatch(/\bspawn\(/);
    });
    test('ExecutionEngine.runArgv spawns argv verbatim (no whitespace re-split)', () => {
        expect(engine).toMatch(/async runArgv\(file: string, args: string\[\]/);
        expect(engine).toMatch(/spawn\(file, args, \{/);
        //  ⛔ THE ANCHOR IS PROVEN BEFORE ANYTHING IS BUILT ON IT.
        //
        //  `indexOf` returns -1 when the text moves, and `slice(-1)` then
        //  yields a one-character string -- so a NEGATIVE assertion over it
        //  passes on nothing at all. The guard would go green for ever, and
        //  green is the one colour nobody investigates.
        //
        //  Four sibling guards in this repository already do this implicitly,
        //  with a positive assertion on the same slice before the negative
        //  one. This is the same claim, said out loud.
        const argvAt = engine.indexOf('runArgvInternal');
        expect(argvAt).toBeGreaterThan(-1);
        const argvInternal = engine.slice(argvAt);
        expect(argvInternal.slice(0, 600)).not.toMatch(/split\(\/\\s\+\//);
    });
    test('the network-op timeout is generous enough for a weak machine', () => {
        expect(src).toMatch(/timeout: 600000/);
    });
});

describe('token auth is executable on the platform it actually runs on', () => {
    test('Windows gets a .bat askpass, POSIX keeps the .sh', () => {
        expect(src).toMatch(/process\.platform === 'win32'/);
        expect(src).toMatch(/isWindows \? 'askpass\.bat' : 'askpass\.sh'/);
    });
    test('the Windows askpass answers username vs password correctly', () => {
        expect(src).toMatch(/findstr \/I "Username"/);
        expect(src).toMatch(/echo x-access-token/);
        expect(src).toMatch(/echo %JOE_GIT_TOKEN%/);
    });
    test('the irrelevant X11 DISPLAY hint is not set on Windows', () => {
        expect(src).toMatch(/if \(!isWindows\) env\.DISPLAY/);
    });
    test('auth is scoped to network ops only', () => {
        expect(src).toMatch(/\['push', 'fetch', 'pull', 'clone'\]\.includes\(op\)/);
    });
    test('the askpass temp dir is always cleaned up', () => {
        expect(src).toMatch(/fs\.promises\.rm\(askpassDir, \{ recursive: true, force: true \}\)/);
    });
});
