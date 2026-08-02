
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { getSessionSecret, getUserSecret } from '../../services/secrets';
import { workspaceService } from '../../services/WorkspaceService';
import { handleGitCommand } from '../handlers';

/**
 * Runs git with a REAL argv array — never a joined-then-split string.
 *
 * The previous runner joined the args into `git a b c` and handed it to a
 * runner that re-split on whitespace. Any argument containing a space was
 * shredded: `commit -m "Scaffolded project by Joe"` became the message
 * "Scaffolded" plus five bogus pathspecs, so EVERY auto-commit in the push
 * flow failed with "pathspec did not match". Passing argv straight to spawn
 * keeps each argument intact, on every platform, with no shell quoting to get
 * wrong. shell:false means no shell metacharacters are interpreted either.
 */
function runGitWithEnv(operation: string, args: string[], env: any, cwd: string): Promise<{ stdout: string; stderr: string }> {
    const op = String(operation || '');
    if (!/^[a-z0-9-]+$/.test(op)) {
        return Promise.reject(new Error('invalid_git_operation'));
    }
    const finalArgs = [op, ...args.map(a => String(a ?? ''))];
    return new Promise((resolve, reject) => {
        const child = spawn('git', finalArgs, { cwd, env, shell: false });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { child.kill('SIGKILL'); } catch { /* already gone */ }
            reject(new Error('git_timeout'));
        }, 600000); // authenticated network ops on a weak machine need room
        timer.unref?.();
        child.stdout?.on('data', (d) => { stdout += d.toString(); });
        child.stderr?.on('data', (d) => { stderr += d.toString(); });
        child.on('error', (e) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(e);
        });
        child.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(stderr.trim() || stdout.trim() || `git exited with code ${code}`));
        });
    });
}

export class GitOpsTool extends BaseTool {
    name = 'git_ops';
    description = 'Perform git operations (commit, push, pull, etc) with auto-authentication.';
    version = '1.0.0';
    tags = ['git', 'vcs', 'source-control'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            operation: { type: 'string' }, // add, commit, push, pull, clone, fetch, status
            args: { type: 'array', items: { type: 'string' } },
            cwd: { type: 'string' },
            sessionId: { type: 'string' },
            userId: { type: 'string' }
        },
        required: ['operation']
    };
    outputSchema = { type: 'object' as const, properties: { output: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'internet', 'read', 'write'];
    sideEffects: ToolPermission[] = ['execute', 'write', 'internet'];
    rateLimitPerMinute = 30;
    auditFields = ['operation', 'args'];

    async execute(input: any) {
        const logs: string[] = [];
        const op = String(input?.operation);
        const args = (input?.args as string[]) || [];
        const sessionId = String(input?.sessionId || '').trim();
        const userId = String(input?.userId || '').trim();

        let askpassDir = '';
        const env: any = { ...process.env };

        try {
            const wantsAuth = ['push', 'fetch', 'pull', 'clone'].includes(op);
            if (wantsAuth && (sessionId || userId)) {
                try {
                    const rawToken = (userId ? (await getUserSecret(userId, 'github', 'GITHUB_TOKEN')) : null) ||
                        getSessionSecret(sessionId, 'GITHUB_TOKEN') || process.env.GITHUB_TOKEN || '';
                    const token = rawToken.replace(/[\s\n\r]/g, '');

                    if (token) {
                        askpassDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-askpass-'));
                        // The user runs on Windows. A `#!/bin/sh` askpass with
                        // mode 0o700 does NOT execute there — Windows ignores
                        // shebangs and the +x bit is meaningless on NTFS, so
                        // every authenticated push/clone against a private repo
                        // silently failed with an auth prompt git could not
                        // answer. The askpass must be a program the host OS can
                        // actually run: a .bat on Windows, the .sh elsewhere.
                        // GitHub tokens are [A-Za-z0-9_] so echoing them in a
                        // batch file is safe (no %, &, ^, <, >, | to escape).
                        const isWindows = process.platform === 'win32';
                        const askpassPath = path.join(askpassDir, isWindows ? 'askpass.bat' : 'askpass.sh');
                        const script = isWindows
                            ? `@echo off\r\necho.%~1 | findstr /I "Username" >nul\r\nif %errorlevel%==0 (echo x-access-token) else (echo %JOE_GIT_TOKEN%)\r\n`
                            : `#!/bin/sh\ncase "$1" in\n*Username*) echo "x-access-token";;\n*) echo "$JOE_GIT_TOKEN";;\nesac\n`;
                        await fs.promises.writeFile(askpassPath, script, { mode: 0o700 });

                        env.GIT_ASKPASS = askpassPath;
                        env.GIT_TERMINAL_PROMPT = '0';
                        if (!isWindows) env.DISPLAY = '1'; // X11 hint — irrelevant on Windows
                        env.JOE_GIT_TOKEN = token;
                    }
                } catch (e: any) {
                    logs.push(`git.auth_setup_failed=${e.message}`);
                }
            }

            const safeArgs = Array.isArray(args) ? args.map(a => String(a || '')).filter(a => a.length > 0) : [];
            const cwd = (typeof input?.cwd === 'string' && input.cwd.trim()) ? input.cwd.trim() : workspaceService.getActiveRoot();
            const envResult = await runGitWithEnv(op, safeArgs, env, cwd);
            logs.push(`git.success=${op}`);
            return { ok: true, output: { output: envResult.stdout || envResult.stderr }, logs };

        } catch (e: any) {
            const errorMsg = e.message || e.stderr || '';
            const fallbackCwd = (typeof input?.cwd === 'string' && input.cwd.trim()) ? input.cwd.trim() : workspaceService.getActiveRoot();

            if (op === 'push' && errorMsg.includes('no upstream branch')) {
                logs.push('Smart Recovery: Setting upstream branch automatically...');
                try {
                    const revParse = await handleGitCommand('rev-parse', ['--abbrev-ref', 'HEAD'], fallbackCwd);
                    const currentBranch = String(revParse?.output || '').trim();
                    if (currentBranch) {
                        const retryResult = await runGitWithEnv('push', ['--set-upstream', 'origin', currentBranch], { ...process.env, ...env }, fallbackCwd);
                        logs.push('Smart Recovery: Success');
                        return { ok: true, output: { output: retryResult.stdout || retryResult.stderr }, logs };
                    }
                } catch (retryError: any) {
                    logs.push(`Smart Recovery Failed: ${retryError.message}`);
                }
            }

            // Non-fast-forward: the remote branch moved ahead of us (someone else
            // pushed, or our clone is stale). Failing here silently was the old
            // behaviour — the push just "didn't work" with a cryptic git message.
            // A senior engineer integrates the remote work and replays their own
            // commits on top, then pushes. NEVER a silent force-push: that would
            // destroy the remote's history, the exact mistake the launcher's own
            // reset-on-network-failure lesson taught. On a REAL conflict we abort
            // cleanly and report honestly, leaving the user's history untouched.
            const isNonFastForward = op === 'push'
                && /non-fast-forward|fetch first|\[rejected\]|tip of your current branch is behind|Updates were rejected/i.test(errorMsg);
            if (isNonFastForward) {
                logs.push('Smart Recovery: remote branch has diverged — integrating remote work before retrying push...');
                try {
                    const revParse = await handleGitCommand('rev-parse', ['--abbrev-ref', 'HEAD'], fallbackCwd);
                    const branch = String(revParse?.output || '').trim();
                    if (!branch || branch === 'HEAD') {
                        logs.push('Smart Recovery: detached HEAD — cannot auto-integrate safely.');
                        return { ok: false, error: 'push_rejected: HEAD منفصل، يتعذّر الدمج التلقائي بأمان. راجع الفرع يدوياً.', logs };
                    }
                    const authEnv = { ...process.env, ...env };
                    await runGitWithEnv('fetch', ['origin'], authEnv, fallbackCwd);
                    // Rebase local commits on top of the remote tip: linear history,
                    // no surprise merge commit, our work replayed on top of theirs.
                    try {
                        await runGitWithEnv('pull', ['--rebase', 'origin', branch], authEnv, fallbackCwd);
                    } catch (rebaseErr: any) {
                        // A genuine conflict (or unstaged changes). Leave NOTHING
                        // half-done: abort the rebase so the tree is clean, and tell
                        // the truth instead of forcing.
                        try { await runGitWithEnv('rebase', ['--abort'], authEnv, fallbackCwd); } catch { /* nothing to abort */ }
                        logs.push(`Smart Recovery: real conflict, aborted rebase to keep the tree clean — ${rebaseErr?.message || ''}`);
                        return {
                            ok: false,
                            error: 'push_rejected_conflict: الفرع البعيد يحوي تغييرات تتعارض مع تغييراتك ويحتاج دمجاً يدوياً. لم أُغيّر شيئاً في تاريخك المحلي.',
                            // In output so it survives ToolService's return shaping
                            // ({ ok, output, logs, artifacts, error }) — a top-level
                            // custom field would be silently dropped.
                            output: { conflict: true, reason: 'remote_diverged_conflict' },
                            logs,
                        };
                    }
                    // Clean rebase → replay the original push (recompute args:
                    // safeArgs lives in the try scope, out of reach here).
                    const pushArgs = Array.isArray(args) ? args.map(a => String(a || '')).filter(a => a.length > 0) : [];
                    const retryResult = await runGitWithEnv('push', pushArgs, authEnv, fallbackCwd);
                    logs.push('Smart Recovery: integrated remote work and pushed successfully.');
                    return { ok: true, output: { output: retryResult.stdout || retryResult.stderr, integratedRemote: true }, logs };
                } catch (recoveryError: any) {
                    logs.push(`Smart Recovery Failed: ${recoveryError.message}`);
                }
            }

            if (op === 'remote' && args[0] === 'add' && errorMsg.includes('remote origin already exists')) {
                logs.push('Smart Recovery: Remote exists, updating URL...');
                try {
                    const setUrlArgs = ['remote', 'set-url', ...args.slice(1)];
                    const retryResult = await runGitWithEnv('remote', setUrlArgs.slice(1), { ...process.env, ...env }, fallbackCwd);
                    logs.push('Smart Recovery: Success');
                    return { ok: true, output: { output: retryResult.stdout || retryResult.stderr }, logs };
                } catch (retryError: any) {
                    logs.push(`Smart Recovery Failed: ${retryError.message}`);
                }
            }

            // An auth failure on a network op almost always means the token was
            // revoked or expired mid-work. Git says "Authentication failed" /
            // "could not read Username" / "invalid username or password" — all
            // cryptic to the user. Translate it into a clear, actionable answer
            // so Joe says "reconnect your token", not a raw fatal line.
            const wasNetworkOp = ['push', 'fetch', 'pull', 'clone'].includes(op);
            const looksAuth = /authentication failed|could not read username|invalid username or password|403|terminal prompts disabled|remote: (invalid|repository not found)|permission to .* denied/i.test(errorMsg);
            if (wasNetworkOp && looksAuth) {
                logs.push('git.error=auth_failed (token likely revoked/expired)');
                return {
                    ok: false,
                    error: 'انتهت صلاحية توكن GitHub أو تم إلغاؤه، فتعذّرت المصادقة. أعِد ربط حسابك بتوكن جديد يملك صلاحية repo ثم أعد المحاولة.',
                    output: { tokenInvalid: true, operation: op },
                    logs,
                };
            }

            logs.push(`git.error=${e.message}`);
            return { ok: false, error: e.message || e.stderr, logs };
        } finally {
            if (askpassDir) {
                try { await fs.promises.rm(askpassDir, { recursive: true, force: true }); } catch { }
            }
        }
    }
}
