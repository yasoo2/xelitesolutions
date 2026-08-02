/**
 * LIVE PROOF — when a push is rejected because the remote branch moved ahead,
 * Joe integrates the remote work and retries; on a REAL conflict he aborts
 * cleanly and reports honestly, never force-pushing over someone's history.
 *
 * Two acts, both on local bare repos (no network/token needed — the recovery
 * logic is identical):
 *   A) The remote gains a commit touching a DIFFERENT file. Joe's push is
 *      rejected non-fast-forward; the recovery fetches, rebases (clean), and
 *      pushes. The remote ends with BOTH commits.
 *   B) The remote and Joe edit the SAME line. The rebase conflicts; Joe aborts
 *      it, leaves his local history untouched, and returns conflict:true.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_push_conflict.ts
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const sh = (cmd: string, cwd: string) => execSync(cmd, { cwd, stdio: 'pipe' }).toString();

async function scenario(sameLine: boolean) {
    const stamp = Date.now() + (sameLine ? 1 : 0);
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), `push-conf-${stamp}-`));
    const bare = path.join(baseDir, 'origin.git');
    const joe = path.join(baseDir, 'joe');       // Joe's working tree
    const other = path.join(baseDir, 'other');   // a teammate

    sh(`git init -q --bare "${bare}"`, baseDir);
    sh(`git clone -q "${bare}" "${joe}"`, baseDir);
    for (const d of [joe]) { sh('git config user.email joe@t.local', d); sh('git config user.name Joe', d); }
    // Seed an initial commit so both sides share history.
    fs.writeFileSync(path.join(joe, 'app.js'), 'line1\nline2\nline3\n');
    sh('git add -A', joe); sh('git commit -q -m seed', joe); sh('git push -q origin HEAD', joe);

    // A teammate clones, commits, and pushes FIRST — the remote moves ahead.
    sh(`git clone -q "${bare}" "${other}"`, baseDir);
    sh('git config user.email other@t.local', other); sh('git config user.name Other', other);
    if (sameLine) {
        fs.writeFileSync(path.join(other, 'app.js'), 'line1\nOTHER-EDIT\nline3\n');
    } else {
        fs.writeFileSync(path.join(other, 'README.md'), '# teammate doc\n');
    }
    sh('git add -A', other); sh('git commit -q -m teammate', other); sh('git push -q origin HEAD', other);

    // Now Joe commits locally (stale) and tries to push → non-fast-forward.
    if (sameLine) {
        fs.writeFileSync(path.join(joe, 'app.js'), 'line1\nJOE-EDIT\nline3\n');
    } else {
        fs.writeFileSync(path.join(joe, 'feature.js'), 'export const x = 1;\n');
    }
    sh('git add -A', joe); sh('git commit -q -m joe-work', joe);
    const joeHeadBefore = sh('git rev-parse HEAD', joe).trim();

    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx = { sessionId: `pc-${stamp}`, workspaceId: `pc-${stamp}` };
    const pushRes: any = await executionFirewall.runAsSystem(() =>
        executeTool('git_ops', { operation: 'push', args: ['origin', 'HEAD'], cwd: joe, userId: 'u', sessionId: ctx.sessionId }, ctx));

    const joeHeadAfter = sh('git rev-parse HEAD', joe).trim();
    const remoteMessages = sh('git log --pretty=%s', bare).trim().split('\n');

    let result: Array<[string, boolean]>;
    if (!sameLine) {
        // Clean integration expected.
        result = [
            ['A: the diverged push was recovered (ok:true)', pushRes.ok === true],
            ['A: the recovery reported integrating remote work', pushRes.output?.integratedRemote === true],
            ['A: the remote now holds BOTH commits (teammate + joe-work)',
                remoteMessages.includes('teammate') && remoteMessages.includes('joe-work')],
        ];
    } else {
        // Honest conflict expected — nothing forced, local history intact.
        const treeClean = (() => { try { return sh('git status --porcelain', joe).trim() === ''; } catch { return false; } })();
        const noRebaseInProgress = !fs.existsSync(path.join(joe, '.git', 'rebase-merge')) && !fs.existsSync(path.join(joe, '.git', 'rebase-apply'));
        result = [
            ['B: a real conflict was NOT forced through (ok:false)', pushRes.ok === false],
            ['B: it was reported as a conflict, honestly', pushRes.output?.conflict === true],
            ['B: Joe’s local history was left untouched', joeHeadAfter === joeHeadBefore],
            ['B: the working tree is clean (rebase aborted, nothing half-done)', treeClean && noRebaseInProgress],
            ['B: the teammate’s commit was NOT overwritten on the remote',
                remoteMessages.includes('teammate') && !remoteMessages.includes('joe-work')],
        ];
    }
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    return result;
}

async function main() {
    const checks = [...await scenario(false), ...await scenario(true)];
    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: diverged pushes are integrated; real conflicts are reported honestly, never forced.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
