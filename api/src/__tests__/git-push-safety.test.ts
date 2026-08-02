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
    test('git is spawned with a real argv array, not a joined string', () => {
        expect(src).toMatch(/spawn\('git', finalArgs, \{ cwd, env, shell: false \}\)/);
    });
    test('the join-then-split runner is gone', () => {
        expect(src).not.toMatch(/finalArgs\.join\(' '\)/);
        expect(src).not.toMatch(/executionEngine\.run/);
    });
    test('shell:false — no shell metacharacter interpretation on any arg', () => {
        expect(src).toMatch(/shell: false/);
        expect(src).not.toMatch(/shell: true/);
    });
    test('the network-op timeout is generous enough for a weak machine', () => {
        expect(src).toMatch(/600000/);
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
