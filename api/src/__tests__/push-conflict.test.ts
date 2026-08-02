/**
 * The diverged-push audit: when `git push` is rejected because the remote
 * branch moved ahead, the old smart-recovery handled only "no upstream" and
 * "remote exists" — a non-fast-forward rejection fell straight through to a
 * silent { ok:false } with a cryptic git message. Joe now integrates the
 * remote work (fetch + rebase) and retries; on a real conflict he aborts
 * cleanly and reports honestly, NEVER force-pushing over someone's history.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'GitTools.ts'), 'utf-8');

describe('non-fast-forward is detected and recovered', () => {
    test('the rejection is recognized across git’s phrasings', () => {
        expect(src).toMatch(/non-fast-forward\|fetch first\|\\\[rejected\\\]\|tip of your current branch is behind\|Updates were rejected/);
    });
    test('recovery integrates remote work: fetch then rebase, then retry push', () => {
        expect(src).toMatch(/runGitWithEnv\('fetch', \['origin'\]/);
        expect(src).toMatch(/runGitWithEnv\('pull', \['--rebase', 'origin', branch\]/);
        // the retry re-runs the ORIGINAL push args after a clean rebase
        expect(src).toMatch(/runGitWithEnv\('push', pushArgs/);
        expect(src).toMatch(/integratedRemote: true/);
    });
});

describe('safety: a real conflict is never forced', () => {
    test('no automatic force-push anywhere', () => {
        expect(src).not.toMatch(/--force\b/);
        expect(src).not.toMatch(/-f\b.*push|push.*['"]-f['"]/);
        expect(src).not.toMatch(/--force-with-lease/);
    });
    test('a conflicting rebase is aborted to leave the tree clean', () => {
        expect(src).toMatch(/runGitWithEnv\('rebase', \['--abort'\]/);
    });
    test('the conflict is reported honestly, in output so it survives ToolService', () => {
        expect(src).toMatch(/output: \{ conflict: true, reason: 'remote_diverged_conflict' \}/);
        expect(src).toMatch(/push_rejected_conflict/);
        // The Arabic message promises the local history was left untouched.
        expect(src).toMatch(/لم أُغيّر شيئاً في تاريخك المحلي/);
    });
    test('a detached HEAD refuses to auto-integrate rather than guessing', () => {
        expect(src).toMatch(/branch === 'HEAD'/);
        expect(src).toMatch(/detached HEAD/);
    });
});
