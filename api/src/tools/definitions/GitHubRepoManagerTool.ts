import { ToolDefinition } from '../types';
import https from 'https';

/**
 * GitHubRepoManagerTool - GitHub repository management
 * Create, manage, and push code to GitHub repositories
 */
export class GitHubRepoManagerTool implements ToolDefinition {
    name = 'github_repo_manager';
    version = '1.0.0';
    description = 'Create and manage GitHub repositories, push code automatically';
    tags = ['github', 'repository', 'git'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['create', 'push', 'list', 'delete'],
                description: 'Action to perform'
            },
            repoName: {
                type: 'string' as const,
                description: 'Repository name'
            },
            description: {
                type: 'string' as const,
                description: 'Repository description'
            },
            private: {
                type: 'boolean' as const,
                description: 'Make repository private'
            },
            token: {
                type: 'string' as const,
                description: 'GitHub personal access token'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            repoUrl: { type: 'string' as const },
            message: { type: 'string' as const }
        }
    };

    permissions = ['execute' as const];
    sideEffects = ['write' as const];
    rateLimitPerMinute = 10;
    auditFields = ['action', 'repoName'];
    mockSupported = false;

    async execute(input: any) {
        const { action, repoName, description = '', private: isPrivate = false, token } = input;
        const logs: string[] = [];

        try {
            logs.push(`GitHub action: ${action} for repo: ${repoName || 'N/A'}`);

            let githubToken = (token || process.env.GITHUB_TOKEN || '').trim();

            // Fallback to user secrets if token is still missing
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

            if (!githubToken && action !== 'list') {
                throw new Error('GitHub token required. Set GITHUB_TOKEN env var, provide token in input, or set GITHUB_TOKEN in User Secrets.');
            }

            switch (action) {
                case 'create':
                    return await this.createRepo(repoName, description, isPrivate, githubToken, logs);

                case 'list':
                    return await this.listRepos(githubToken, logs);

                case 'delete':
                    return await this.deleteRepo(repoName, githubToken, logs);

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

    private async createRepo(name: string, description: string, isPrivate: boolean, token: string, logs: string[]) {
        const data = JSON.stringify({
            name,
            description,
            private: isPrivate,
            auto_init: true
        });

        const result = await this.githubRequest('POST', '/user/repos', data, token);

        logs.push(`Repository created: ${result.html_url}`);

        return {
            ok: true,
            output: {
                success: true,
                repoUrl: result.html_url,
                cloneUrl: result.clone_url,
                message: `Repository ${name} created successfully`
            },
            logs
        };
    }

    private async listRepos(token: string, logs: string[]) {
        const repos = await this.githubRequest('GET', '/user/repos?per_page=10', null, token);

        logs.push(`Found ${repos.length} repositories`);

        return {
            ok: true,
            output: {
                success: true,
                repos: repos.map((r: any) => ({
                    name: r.name,
                    url: r.html_url,
                    private: r.private
                })),
                message: `Listed ${repos.length} repositories`
            },
            logs
        };
    }

    private async deleteRepo(name: string, token: string, logs: string[]) {
        const username = await this.getUsername(token);
        await this.githubRequest('DELETE', `/repos/${username}/${name}`, null, token);

        logs.push(`Repository deleted: ${name}`);

        return {
            ok: true,
            output: {
                success: true,
                message: `Repository ${name} deleted successfully`
            },
            logs
        };
    }

    private async getUsername(token: string): Promise<string> {
        const user = await this.githubRequest('GET', '/user', null, token);
        return user.login;
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
                        reject(new Error(`GitHub API error: ${res.statusCode} - ${responseData}`));
                    }
                });
            });

            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    }
}
