
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import { getSessionSecret, getUserSecret } from '../../services/secrets';

const execAsync = util.promisify(exec);

export class GitOpsTool extends BaseTool {
    name = 'git_ops';
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
    // No specific output schema in registry, generic
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
            // Auto-configure user if committing
            if (op === 'commit') {
                try { await execAsync('git config user.name'); } catch {
                    await execAsync('git config user.name "Joe AI"');
                    await execAsync('git config user.email "joe@xelitesolutions.com"');
                }
            }

            const env: Record<string, string> = { ...process.env };

            // Handle Authentication via ASKPASS
            const wantsAuth = ['push', 'fetch', 'pull', 'clone'].includes(op);
            if (wantsAuth && (sessionId || userId)) {
                try {
                    const token = (userId ? (await getUserSecret(userId, 'github', 'GITHUB_TOKEN')) : null) ||
                        getSessionSecret(sessionId, 'GITHUB_TOKEN') || '';

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

            let cmd = `git ${op}`;
            if (args.length) cmd += ` ${args.join(' ')}`;

            logs.push(`git.cmd=${cmd}`);
            const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd(), env });
            logs.push(`git.success=${op}`);
            return { ok: true, output: { output: stdout || stderr }, logs };

        } catch (e: any) {
            logs.push(`git.error=${e.message}`);
            return { ok: false, error: e.message || e.stderr, logs };
        } finally {
            if (askpassDir) {
                try { await fs.promises.rm(askpassDir, { recursive: true, force: true }); } catch { }
            }
        }
    }
}

export class GitHubRepoCreateTool extends BaseTool {
    name = 'github_repo_create';
    version = '1.0.0';
    tags = ['github', 'api', 'create'];
    inputSchema = {
        type: 'object' as const,
        properties: { name: { type: 'string' }, description: { type: 'string' }, private: { type: 'boolean' } },
        required: ['name']
    };
    permissions: ToolPermission[] = ['internet'];
    sideEffects: ToolPermission[] = ['internet'];
    rateLimitPerMinute = 5;

    async execute(input: any) {
        // Requires token logic (omitted here for brevity, usually handled by checking secrets or env)
        // For now, returning not implemented to be safe or reusing logic if I could extract it fully.
        // Actually, I'll rely on env GITHUB_TOKEN if present.
        const token = process.env.GITHUB_TOKEN;
        if (!token) return { ok: false, error: 'GITHUB_TOKEN env required', logs: [] };

        const repoName = String(input?.name || '');
        const body = {
            name: repoName,
            description: input?.description,
            private: !!input?.private
        };

        try {
            // Create in user/org context
            const r = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'User-Agent': 'JOE AI' },
                body: JSON.stringify(body)
            });
            if (!r.ok) {
                const txt = await r.text();
                return { ok: false, error: `GitHub API ${r.status}: ${txt}`, logs: [] };
            }
            const json: any = await r.json();
            return { ok: true, output: { htmlUrl: json.html_url, cloneUrl: json.clone_url }, logs: [`github.create=${repoName}`] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}
