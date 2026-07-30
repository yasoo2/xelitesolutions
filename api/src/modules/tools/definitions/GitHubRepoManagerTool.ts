import { ToolDefinition } from '../types';
import https from 'https';

/**
 * GitHubRepoManagerTool - GitHub repository management
 * Create, manage, and push code to GitHub repositories
 */
export class GitHubRepoManagerTool implements ToolDefinition {
    name = 'github_repo_manager';
    version = '1.1.0';
    description = 'Create, manage and ANALYZE GitHub repositories (analyze = real repo report: languages, file tree, README, latest commits)';
    tags = ['github', 'repository', 'git', 'analysis'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['create', 'push', 'list', 'delete', 'analyze'],
                description: 'Action to perform'
            },
            repoName: {
                type: 'string' as const,
                description: 'Repository name ("owner/repo" or bare name). For analyze, omit to use the workspace\'s connected repo.'
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

            let githubToken = (token || process.env.GITHUB_TOKEN || '').replace(/[\s\n\r]/g, '');

            // Fallback to user secrets if token is still missing
            if (!githubToken && (input as any).userId) {
                try {
                    const { getUserSecret } = require('../../services/secrets');
                    const secretFn = await getUserSecret((input as any).userId, 'github', 'GITHUB_TOKEN');
                    if (secretFn) {
                        githubToken = secretFn.replace(/[\s\n\r]/g, '');
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

                case 'analyze':
                    return await this.analyzeRepo(repoName, githubToken, input, logs);

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

        try {
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
        } catch (error: any) {
            // Smart Recovery: Repo already exists
            if (error.message && error.message.includes('name already exists')) {
                logs.push(`Smart Recovery: Repository '${name}' already exists. Fetching details...`);
                try {
                    const username = await this.getUsername(token);
                    const existingRepo = await this.githubRequest('GET', `/repos/${username}/${name}`, null, token);
                    return {
                        ok: true,
                        output: {
                            success: true,
                            repoUrl: existingRepo.html_url,
                            cloneUrl: existingRepo.clone_url,
                            message: `Repository ${name} already exists (recovered successfully)`
                        },
                        logs
                    };
                } catch (fetchError: any) {
                    throw new Error(`Failed to recover existing repo: ${fetchError.message}`);
                }
            }
            throw error;
        }
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

    /** Find the repo the user connected in the UI ("the connected repo").
     *
     *  ToolService does NOT forward the real workspace id: when a tool is called
     *  from an orchestrated run it substitutes a synthetic `session-<id>`, so a
     *  lookup by that id can never match and previously threw — and because all
     *  the lookups shared one try/catch, that first throw skipped the fallbacks
     *  entirely and the analysis died with "no repo specified" even though a repo
     *  was plainly connected. Each source is now attempted independently and
     *  logged, so a miss is diagnosable instead of silent. */
    private async resolveConnectedRepo(input: any, logs: string[]): Promise<string> {
        let svc: any;
        try {
            svc = require('../../services/WorkspaceService').workspaceService;
        } catch (e: any) {
            logs.push(`WorkspaceService unavailable: ${e.message}`);
            return '';
        }
        const userId = String(input?.__userId || input?.userId || '').trim();
        const rawWsId = String(input?.__workspaceId || input?.workspaceId || '').trim();
        // A synthetic "session-…"/"default-workspace" id is not a workspace id.
        const realWsId = /^[0-9a-fA-F]{24}$/.test(rawWsId) ? rawWsId : '';
        if (rawWsId && !realWsId) logs.push(`Ignoring synthetic workspace id "${rawWsId}"`);

        const pick = (ws: any): string => String(ws?.integrations?.github?.activeRepo || '').trim();

        if (realWsId && userId) {
            try {
                const ws = await svc.getWorkspace(realWsId, userId);
                const r = pick(ws);
                if (r) { logs.push(`Connected repo from workspace ${realWsId}: ${r}`); return r; }
            } catch (e: any) { logs.push(`getWorkspace(${realWsId}) failed: ${e.message}`); }
        }

        if (userId) {
            try {
                const all = await svc.getUserWorkspaces(userId);
                for (const w of (Array.isArray(all) ? all : [])) {
                    const r = pick(w);
                    if (r) { logs.push(`Connected repo from workspace "${w?.name || w?._id}": ${r}`); return r; }
                }
                logs.push(`No connected repo in ${Array.isArray(all) ? all.length : 0} workspace(s) of user ${userId}`);
            } catch (e: any) { logs.push(`getUserWorkspaces failed: ${e.message}`); }
        } else {
            logs.push('No userId reached the tool — cannot list workspaces.');
        }

        // Local single-user mode: the run may carry no usable user id at all, yet
        // the machine has exactly one connected repo. Scan every stored workspace.
        try {
            if (typeof svc.getAllWorkspacesForLookup === 'function') {
                const all = await svc.getAllWorkspacesForLookup();
                for (const w of (Array.isArray(all) ? all : [])) {
                    const r = pick(w);
                    if (r) { logs.push(`Connected repo found by global scan: ${r}`); return r; }
                }
                logs.push('Global workspace scan found no connected repo.');
            }
        } catch (e: any) { logs.push(`Global workspace scan failed: ${e.message}`); }

        return '';
    }

    /** REAL repository analysis straight from the GitHub API (metadata, languages,
     *  file tree, README, latest commits) + a best-effort LLM architectural summary.
     *  When no repoName is given, resolves "the connected repo" from the workspace's
     *  integrations.github.activeRepo. Raw facts are always returned even if the
     *  LLM summary fails — nothing here is fabricated. */
    private async analyzeRepo(repoName: string | undefined, token: string, input: any, logs: string[]) {
        let fullName = String(repoName || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
        if (fullName && !fullName.includes('/')) {
            fullName = `${await this.getUsername(token)}/${fullName}`;
        }
        if (!fullName) fullName = await this.resolveConnectedRepo(input, logs);
        if (!fullName) {
            return { ok: false, error: 'لا يوجد ريبو محدّد للتحليل: مرّر repoName (مثل owner/repo) أو اربط ريبو في مساحة العمل أولاً.', logs };
        }
        logs.push(`Analyzing ${fullName} via GitHub API`);

        const meta = await this.githubRequest('GET', `/repos/${fullName}`, null, token);
        const defaultBranch = String(meta.default_branch || 'main');

        let languages: Record<string, number> = {};
        try { languages = await this.githubRequest('GET', `/repos/${fullName}/languages`, null, token); } catch (e: any) { logs.push(`languages fetch failed: ${e.message}`); }

        let files: string[] = []; let fileCount = 0; let treeTruncated = false;
        try {
            const tree = await this.githubRequest('GET', `/repos/${fullName}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`, null, token);
            const blobs = (Array.isArray(tree?.tree) ? tree.tree : []).filter((e: any) => e.type === 'blob');
            fileCount = blobs.length;
            treeTruncated = !!tree?.truncated;
            files = blobs.slice(0, 80).map((e: any) => e.path);
        } catch (e: any) { logs.push(`tree fetch failed: ${e.message}`); }

        let readme = '';
        try {
            const r = await this.githubRequest('GET', `/repos/${fullName}/readme`, null, token);
            if (r?.content) readme = Buffer.from(String(r.content), 'base64').toString('utf-8').slice(0, 4000);
        } catch { logs.push('No README found'); }

        let commits: any[] = [];
        try {
            const cs = await this.githubRequest('GET', `/repos/${fullName}/commits?per_page=5`, null, token);
            commits = (Array.isArray(cs) ? cs : []).map((c: any) => ({
                sha: String(c.sha || '').slice(0, 7),
                message: String(c.commit?.message || '').split('\n')[0],
                author: c.commit?.author?.name,
                date: c.commit?.author?.date,
            }));
        } catch (e: any) { logs.push(`commits fetch failed: ${e.message}`); }

        const repo = {
            fullName,
            url: meta.html_url,
            description: meta.description || '',
            private: !!meta.private,
            defaultBranch,
            stars: meta.stargazers_count || 0,
            forks: meta.forks_count || 0,
            openIssues: meta.open_issues_count || 0,
            createdAt: meta.created_at,
            lastPush: meta.pushed_at,
            languages,
            fileCount: treeTruncated ? `${fileCount}+` : fileCount,
            files,
            latestCommits: commits,
            readmeExcerpt: readme ? readme.slice(0, 1500) : '',
        };

        // Best-effort Arabic architectural summary over the REAL facts above.
        let summary = '';
        try {
            const { routeToModel } = require('../../../core/llm/intelligent-router');
            summary = await routeToModel([
                { role: 'system', content: 'أنت مهندس برمجيات خبير. البيانات التالية حقيقية ومأخوذة مباشرة من GitHub API. حلّلها وقدّم تقريراً موجزاً بالعربية: نوع المشروع وهدفه، التقنيات واللغات، بنية الملفات، النشاط الأخير، وملاحظات/توصيات. لا تخترع معلومات غير موجودة في البيانات.' },
                { role: 'user', content: `تحليل المستودع ${fullName}:\n${JSON.stringify({ ...repo, readmeExcerpt: readme }, null, 1).slice(0, 9000)}` },
            ]);
        } catch (e: any) { logs.push(`LLM summary failed (raw facts still returned): ${e.message}`); }

        return {
            ok: true,
            output: {
                success: true,
                repo,
                summary: summary || undefined,
                message: `تم تحليل ${fullName} مباشرة من GitHub API${summary ? '' : ' (البيانات الخام فقط — تعذّر توليد الملخص)'}`,
            },
            logs,
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
