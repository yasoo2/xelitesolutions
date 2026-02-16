
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getSessionSecret, getUserSecret } from '../../services/secrets';
import { workspaceService } from '../../services/WorkspaceService';
import { handleGitCommand } from '../handlers';

const spawn = require('child_process').spawn;

async function runGitWithEnv(operation: string, args: string[], env: any, cwd: string) {
    const op = String(operation || '');
    if (!/^[a-z0-9-]+$/.test(op)) {
        throw new Error('invalid_git_operation');
    }
    const finalArgs = [op, ...args.map(a => String(a || ''))];
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn('git', finalArgs, { cwd, env, shell: false });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d: any) => { stdout += d.toString(); });
        child.stderr.on('data', (d: any) => { stderr += d.toString(); });
        child.on('error', (err: any) => reject(err));
        child.on('close', (code: number) => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(stderr || stdout || `Exit code ${code}`));
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

        try {
            if (op === 'commit') {
                try {
                    const checkUser = await handleGitCommand('config', ['user.name'], process.cwd());
                    if (!checkUser.ok) {
                        const nameResult = await handleGitCommand('config', ['user.name', 'Joe AI'], process.cwd());
                        if (!nameResult.ok) throw new Error(nameResult.error || 'git_config_failed');
                        const emailResult = await handleGitCommand('config', ['user.email', 'joe@xelitesolutions.com'], process.cwd());
                        if (!emailResult.ok) throw new Error(emailResult.error || 'git_config_failed');
                    }
                } catch (e: any) {
                    logs.push(`git.config_failed=${e.message}`);
                }
            }

            const env: any = { ...process.env };

            // Handle Authentication via ASKPASS
            const wantsAuth = ['push', 'fetch', 'pull', 'clone'].includes(op);
            if (wantsAuth && (sessionId || userId)) {
                try {
                    const rawToken = (userId ? (await getUserSecret(userId, 'github', 'GITHUB_TOKEN')) : null) ||
                        getSessionSecret(sessionId, 'GITHUB_TOKEN') || '';
                    const token = rawToken.replace(/[\s\n\r]/g, '');

                    if (token) {
                        askpassDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-askpass-'));
                        const askpassPath = path.join(askpassDir, 'askpass.sh');
                        const script = `#!/bin/sh\ncase "$1" in\n*Username*) echo "x-access-token";;\n*) echo "$JOE_GIT_TOKEN";;\nesac\n`;
                        await fs.promises.writeFile(askpassPath, script, { mode: 0o700 });

                        env.GIT_ASKPASS = askpassPath;
                        env.GIT_TERMINAL_PROMPT = '0';
                        env.DISPLAY = '1'; // prevent window prompts
                        env.JOE_GIT_TOKEN = token;
                    }
                } catch (e: any) {
                    logs.push(`git.auth_setup_failed=${e.message}`);
                }
            }

            const safeArgs = Array.isArray(args) ? args.map(a => String(a || '')).filter(a => a.length > 0) : [];
            const cwd = workspaceService.getActiveRoot();
            const envResult = await runGitWithEnv(op, safeArgs, env, cwd);
            logs.push(`git.success=${op}`);
            return { ok: true, output: { output: envResult.stdout || envResult.stderr }, logs };

        } catch (e: any) {
            const errorMsg = e.message || e.stderr || '';

            // Smart Recovery 1: Missing Upstream
            if (op === 'push' && errorMsg.includes('no upstream branch')) {
                logs.push('Smart Recovery: Setting upstream branch automatically...');
                try {
                    const currentBranch = (await handleGitCommand('rev-parse', ['--abbrev-ref', 'HEAD'], process.cwd())).stdout.trim();
                    if (currentBranch) {
                        const upstreamArgs = ['push', '--set-upstream', 'origin', currentBranch];
                        const retryResult = await runGitWithEnv('push', ['--set-upstream', 'origin', currentBranch], { ...process.env, ...env }, workspaceService.getActiveRoot());
                        logs.push('Smart Recovery: Success');
                        return { ok: true, output: { output: retryResult.stdout || retryResult.stderr }, logs };
                    }
                } catch (retryError: any) {
                    logs.push(`Smart Recovery Failed: ${retryError.message}`);
                }
            }

            // Smart Recovery 2: Remote Already Exists
            if (op === 'remote' && args[0] === 'add' && errorMsg.includes('remote origin already exists')) {
                logs.push('Smart Recovery: Remote exists, updating URL...');
                try {
                    // Try set-url instead
                    const setUrlArgs = ['remote', 'set-url', ...args.slice(1)];
                    const retryResult = await runGitWithEnv('remote', setUrlArgs.slice(1), { ...process.env, ...env }, workspaceService.getActiveRoot());
                    logs.push('Smart Recovery: Success');
                    return { ok: true, output: { output: retryResult.stdout || retryResult.stderr }, logs };
                } catch (retryError: any) {
                    logs.push(`Smart Recovery Failed: ${retryError.message}`);
                }
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
