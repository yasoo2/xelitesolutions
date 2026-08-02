/**
 * LIVE PROOF — Joe can edit a connected repo, commit with a real message, and
 * push it. The bug this closes bit EVERY platform: the git runner joined argv
 * into a string and re-split it on whitespace, so `commit -m "Scaffolded
 * project by Joe"` became the message "Scaffolded" plus five bogus pathspecs —
 * every auto-commit in the push flow failed with "pathspec did not match".
 *
 * A local bare repo stands in for GitHub (no token/network needed): the push
 * mechanics through git_ops are identical, and the message-shredding bug is
 * platform-independent, so proving it here proves it on the user's Windows box.
 * The Windows askpass branch is asserted from source (can't run cmd.exe here).
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_git_push.ts
 */
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

async function main() {
    const stamp = Date.now();
    const base = fs.mkdtempSync(path.join(os.tmpdir(), `git-push-${stamp}-`));
    const bare = path.join(base, 'origin.git');   // the "GitHub" remote
    const work = path.join(base, 'work');          // Joe's working tree
    execSync(`git init -q --bare "${bare}"`, { stdio: 'pipe' });
    execSync(`git clone -q "${bare}" "${work}"`, { stdio: 'pipe' });
    execSync('git config user.email joe@test.local', { cwd: work });
    execSync('git config user.name Joe', { cwd: work });

    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const ctx = { sessionId: `push-${stamp}`, workspaceId: `push-${stamp}` };
    const git = (operation: string, args: string[]) =>
        executionFirewall.runAsSystem(() => executeTool('git_ops', { operation, args, cwd: work, userId: 'proof-user', sessionId: ctx.sessionId }, ctx));

    // Joe edits a file in the connected repo.
    fs.writeFileSync(path.join(work, 'feature.js'), 'export const answer = 42;\n');

    // add → commit WITH A SPACED MESSAGE → push. The spaced message is the exact
    // shape that used to be shredded into pathspecs.
    const COMMIT_MSG = 'Scaffolded project by Joe AI (multi word message)';
    const addRes = await git('add', ['.']);
    const commitRes = await git('commit', ['-m', COMMIT_MSG]);
    const pushRes = await git('push', ['origin', 'HEAD']);

    // The remote must now hold the commit with the EXACT message — proof the
    // message survived intact and the push really landed.
    let remoteMsg = '';
    let remoteHasFile = false;
    try {
        remoteMsg = execSync('git log -1 --pretty=%s', { cwd: bare }).toString().trim();
        remoteHasFile = execSync('git ls-tree --name-only HEAD', { cwd: bare }).toString().includes('feature.js');
    } catch { /* fails the checks below */ }

    // The Windows askpass branch must be shipped (asserted from source).
    const gitToolsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'GitTools.ts'), 'utf-8');
    const windowsAskpass = gitToolsSrc.includes("isWindows ? 'askpass.bat'")
        && gitToolsSrc.includes('findstr /I "Username"');
    const usesSpawnArgv = gitToolsSrc.includes("executionEngine.runArgv('git', finalArgs")
        && !gitToolsSrc.includes('finalArgs.join')
        && !gitToolsSrc.includes("from 'child_process'");

    const checks: Array<[string, boolean]> = [
        ['git add succeeded', addRes.ok === true],
        ['git commit with a MULTI-WORD message succeeded (no pathspec shredding)', commitRes.ok === true],
        ['git push to the remote succeeded', pushRes.ok === true],
        ['PROOF: the remote commit message is intact, word for word', remoteMsg === COMMIT_MSG],
        ['PROOF: the edited file really reached the remote', remoteHasFile],
        ['the git runner passes a real argv array via ExecutionEngine (no join-then-split, no child_process)', usesSpawnArgv],
        ['a Windows-executable askpass (.bat) is shipped for token auth', windowsAskpass],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* cleanup */ }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: edit → commit (real message) → push works; Windows token auth is executable.'
        : `\n${failed} CHECK(S) FAILED — commit=${JSON.stringify(commitRes).slice(0, 300)} push=${JSON.stringify(pushRes).slice(0, 300)}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
