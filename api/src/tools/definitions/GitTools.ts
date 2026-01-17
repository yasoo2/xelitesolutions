
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
            // Auto-configure user if committing
            if (op === 'commit') {
                try { await execAsync('git config user.name'); } catch {
                    await execAsync('git config user.name "Joe AI"');
                    await execAsync('git config user.email "joe@xelitesolutions.com"');
                }
            }

            const env: any = { ...process.env };

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
