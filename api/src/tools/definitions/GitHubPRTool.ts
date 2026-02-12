import { ToolDefinition } from '../types';
import https from 'https';

/**
 * GitHubPRTool - Pull Request automation
 * Create and manage Pull Requests on GitHub
 */
export class GitHubPRTool implements ToolDefinition {
    name = 'github_pr';
    version = '1.0.0';
    description = 'Create and manage GitHub Pull Requests automatically';
    tags = ['github', 'pr', 'pull-request'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['create', 'merge', 'list'],
                description: 'PR action'
            },
            owner: {
                type: 'string' as const,
                description: 'Repository owner'
            },
            repo: {
                type: 'string' as const,
                description: 'Repository name'
            },
            title: {
                type: 'string' as const,
                description: 'PR title'
            },
            body: {
                type: 'string' as const,
                description: 'PR description'
            },
            head: {
                type: 'string' as const,
                description: 'Source branch'
            },
            base: {
                type: 'string' as const,
                description: 'Target branch (default: main)'
            },
            token: {
                type: 'string' as const,
                description: 'GitHub token'
            }
        },
        required: ['action', 'owner', 'repo']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            prUrl: { type: 'string' as const }
        }
    };

    permissions = ['execute' as const];
    sideEffects = ['write' as const];
    rateLimitPerMinute = 10;
    auditFields = ['action', 'repo'];
    mockSupported = false;

    async execute(input: any) {
        const { action, owner, repo, title, body, head, base = 'main', token } = input;
        const logs: string[] = [];

        try {
            let githubToken = (token || process.env.GITHUB_TOKEN || '').trim();

            if (!githubToken && (input as any).userId) {
                try {
                    const { getUserSecret } = require('../../services/secrets');
                    const secretFn = await getUserSecret((input as any).userId, 'github', 'GITHUB_TOKEN');
                    if (secretFn) {
                        githubToken = secretFn.trim();
                        logs.push(`Using GitHub token from user secrets`);
                    }
                } catch (e) {
                    logs.push(`Failed to fetch user secret: ${(e as any).message}`);
                }
            }
            if (!githubToken) {
                throw new Error('GitHub token required');
            }

            logs.push(`PR action: ${action} for ${owner}/${repo}`);

            switch (action) {
                case 'create':
                    return await this.createPR(owner, repo, title, body, head, base, githubToken, logs);

                case 'list':
                    return await this.listPRs(owner, repo, githubToken, logs);

                default:
                    throw new Error(`Unknown action: ${action}`);
            }

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }

    private async createPR(owner: string, repo: string, title: string, body: string, head: string, base: string, token: string, logs: string[]) {
        const data = JSON.stringify({
            title,
            body,
            head,
            base
        });

        const pr = await this.githubRequest('POST', `/repos/${owner}/${repo}/pulls`, data, token);

        logs.push(`PR created: ${pr.html_url}`);

        return {
            ok: true,
            output: {
                success: true,
                prUrl: pr.html_url,
                prNumber: pr.number,
                message: `Pull Request #${pr.number} created`
            },
            logs
        };
    }

    private async listPRs(owner: string, repo: string, token: string, logs: string[]) {
        const prs = await this.githubRequest('GET', `/repos/${owner}/${repo}/pulls`, null, token);

        logs.push(`Found ${prs.length} open PRs`);

        return {
            ok: true,
            output: {
                success: true,
                prs: prs.map((pr: any) => ({
                    number: pr.number,
                    title: pr.title,
                    url: pr.html_url,
                    state: pr.state
                })),
                message: `Listed ${prs.length} pull requests`
            },
            logs
        };
    }

    private githubRequest(method: string, path: string, data: string | null, token: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const options: any = {
                hostname: 'api.github.com',
                path: path,
                method: method,
                headers: {
                    'User-Agent': 'Joe-AI-Agent',
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }

            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(responseData ? JSON.parse(responseData) : {});
                        } catch (e) {
                            resolve({});
                        }
                    } else {
                        reject(new Error(`GitHub API error: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    }
}
