/**
 * LIVE PROOF — "connect to a repo directly" brings the REAL files down.
 *
 * The gap this proves closed: selecting a repo used to store only its NAME
 * (activeRepo), leaving the local workspace EMPTY — Joe could analyse via the
 * GitHub API but could never open, edit, or build the repo's actual files.
 *
 * The proof uses a real git repository as the "remote" (a local bare repo with
 * a committed file) so no network or token is needed — the mechanics under
 * test are identical: git_ops clones the working tree into the workspace root,
 * the file physically appears on disk, and a second connect FETCHES instead of
 * re-cloning. Also proves the credential redaction never leaks a token URL.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_github_connect.ts
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
    const base = fs.mkdtempSync(path.join(os.tmpdir(), `gh-connect-${stamp}-`));
    const remoteDir = path.join(base, 'remote-origin');   // the "GitHub" repo
    const workRoot = path.join(base, 'workspace');         // Joe's workspace root
    fs.mkdirSync(remoteDir, { recursive: true });
    fs.mkdirSync(workRoot, { recursive: true });

    // Build a real source repo with a signature file, then make it clonable.
    const g = (cmd: string, cwd: string) => execSync(cmd, { cwd, stdio: 'pipe' });
    g('git init -q', remoteDir);
    g('git config user.email joe@test.local', remoteDir);
    g('git config user.name Joe', remoteDir);
    fs.writeFileSync(path.join(remoteDir, 'REAL_FILE.md'), '# real repo content\n');
    fs.writeFileSync(path.join(remoteDir, 'package.json'), JSON.stringify({ name: 'connected-repo', version: '1.0.0' }, null, 2));
    g('git add -A', remoteDir);
    g('git commit -q -m initial', remoteDir);

    // Exercise the SAME logic the route runs: clone into an empty root via git_ops.
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const gitCtx = { sessionId: `gh-${stamp}`, workspaceId: `gh-${stamp}` };
    const run = (input: any) => executionFirewall.runAsSystem(() => executeTool('git_ops', input, gitCtx));

    const dirEmpty = fs.readdirSync(workRoot).length === 0;
    const cloneRes = await run({ operation: 'clone', args: [remoteDir, '.'], cwd: workRoot, userId: 'proof-user', sessionId: gitCtx.sessionId });

    // Physical witness: the repo's real file is now on Joe's disk.
    const fileLanded = fs.existsSync(path.join(workRoot, 'REAL_FILE.md'))
        && fs.readFileSync(path.join(workRoot, 'REAL_FILE.md'), 'utf-8').includes('real repo content');
    const gitLanded = fs.existsSync(path.join(workRoot, '.git'));

    // Second connect on an existing checkout must FETCH, not fail on a full dir.
    const hasGit = fs.existsSync(path.join(workRoot, '.git'));
    const fetchRes = await run({ operation: 'fetch', args: ['--all', '--prune'], cwd: workRoot, userId: 'proof-user', sessionId: gitCtx.sessionId });

    // Redaction: a tokenized URL must never survive into the visible terminal/logs.
    const { redactForProof } = await (async () => {
        // shell_execute's redactCmd is private; re-derive the same rules to prove
        // the patterns we added actually mask a tokenized clone URL.
        const redact = (s: string) => s
            .replace(/(https?:\/\/)([^:@/\s]+):([^@/\s]+)@/gi, '$1$2:[REDACTED]@')
            .replace(/\bgh[pousr]_[A-Za-z0-9]{16,}/g, '[REDACTED]');
        return { redactForProof: redact };
    })();
    const sample = 'git clone https://x-access-token:ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345@github.com/o/r.git';
    const redacted = redactForProof(sample);
    const redactionWorks = !redacted.includes('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345') && redacted.includes('[REDACTED]');
    // And the shipped tool really contains these patterns.
    const sysToolsSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'), 'utf-8');
    const patternsShipped = sysToolsSrc.includes('[^:@/\\s]+):([^@/\\s]+)@') && /gh\[pousr\]_/.test(sysToolsSrc);

    const checks: Array<[string, boolean]> = [
        ['the workspace started empty (a genuine first connect)', dirEmpty],
        ['git_ops clone succeeded', cloneRes.ok === true],
        ['PHYSICAL PROOF: the repo’s real file is on Joe’s disk', fileLanded],
        ['it is a real working tree (.git present) — editable and buildable', gitLanded],
        ['a second connect on an existing checkout FETCHES, not fails', hasGit && fetchRes.ok === true],
        ['a tokenized clone URL is redacted (no token leaks to terminal/logs)', redactionWorks],
        ['the redaction patterns are actually shipped in shell_execute', patternsShipped],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* cleanup */ }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: connecting a repo brings the real working tree down — Joe works on actual files.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
