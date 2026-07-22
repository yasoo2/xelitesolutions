/**
 * GitHub Integration Routes
 * Central REST API for GitHub operations (connect, repos, contents, commits, branches)
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { GitHubRepoManagerTool } from '../../modules/tools/definitions/GitHubRepoManagerTool';
import { setUserSecretEncrypted, getUserSecret } from '../../modules/services/secrets';
import https from 'https';

const router = Router();
const repoTool = new GitHubRepoManagerTool();

// ─── Helper: Make GitHub API request ───
function ghApi(method: string, path: string, token: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts: https.RequestOptions = {
            hostname: 'api.github.com',
            path,
            method,
            headers: {
                'User-Agent': 'Joe-AI-Agent',
                'Authorization': `token ${token.replace(/[\s\n\r]/g, '')}`,
                'Accept': 'application/vnd.github.v3+json',
                ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
            }
        };
        const req = https.request(opts, (res) => {
            let raw = '';
            res.on('data', (c) => raw += c);
            res.on('end', () => {
                try {
                    const json = raw ? JSON.parse(raw) : {};
                    if (res.statusCode && res.statusCode >= 400) {
                        reject({ status: res.statusCode, message: json.message || `HTTP ${res.statusCode}` });
                    } else {
                        resolve(json);
                    }
                } catch {
                    resolve(raw);
                }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ─── POST /connect — Save GitHub token ───
router.post('/connect', authenticate as any, async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Token is required' });
        }
        const clean = token.replace(/[\s\n\r]/g, '');

        // Validate token by fetching user info
        const user = await ghApi('GET', '/user', clean);
        const userId = (req as any).auth?.sub;
        if (userId) {
            await setUserSecretEncrypted(userId, 'github', 'GITHUB_TOKEN', clean);
        }

        return res.json({
            ok: true,
            username: user.login,
            avatarUrl: user.avatar_url,
            name: user.name || user.login
        });
    } catch (e: any) {
        return res.status(422).json({ error: 'Invalid GitHub token', details: e.message });
    }
});

// ─── GET /status — Check connection status ───
router.get('/status', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) {
            return res.json({ connected: false });
        }
        const clean = token.replace(/[\s\n\r]/g, '');
        const user = await ghApi('GET', '/user', clean);

        // Fetch active repo from workspace
        let activeRepo = undefined;
        const workspaceId = (req.headers['x-workspace-id'] as string) || (req.query.workspaceId as string);
        if (workspaceId && userId) {
            const { workspaceService } = await import('../../modules/services/WorkspaceService');
            const ws = await workspaceService.getWorkspace(workspaceId, userId);
            activeRepo = ws?.integrations?.github?.activeRepo;
        }

        return res.json({
            connected: true,
            username: user.login,
            avatarUrl: user.avatar_url,
            name: user.name || user.login,
            activeRepo
        });
    } catch {
        return res.json({ connected: false });
    }
});

// ─── GET /repos — List repos ───
router.get('/repos', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) return res.status(400).json({ error: 'GitHub not connected', connected: false });
        const clean = token.replace(/[\s\n\r]/g, '');

        const sort = req.query.sort || 'updated';
        const repos = await ghApi('GET', `/user/repos?sort=${sort}&per_page=30&type=owner`, clean);
        const mapped = (repos as any[]).map((r: any) => ({
            id: r.id,
            name: r.name,
            fullName: r.full_name,
            description: r.description,
            private: r.private,
            url: r.html_url,
            cloneUrl: r.clone_url,
            language: r.language,
            updatedAt: r.updated_at,
            defaultBranch: r.default_branch,
            stars: r.stargazers_count
        }));
        return res.json({ repos: mapped });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── POST /repos — Create repo ───
router.post('/repos', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) return res.status(400).json({ error: 'GitHub not connected', connected: false });

        const result = await repoTool.execute({
            action: 'create',
            repoName: req.body.name,
            description: req.body.description || '',
            private: req.body.isPrivate !== false,
            token,
            userId
        });
        return res.json(result);
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── GET /repos/:owner/:repo/contents — Browse files ───
router.get('/repos/:owner/:repo/contents', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) return res.status(400).json({ error: 'GitHub not connected', connected: false });
        const clean = token.replace(/[\s\n\r]/g, '');

        const { owner, repo } = req.params;
        const filePath = (req.query.path as string) || '';
        const ref = (req.query.ref as string) || '';
        const apiPath = `/repos/${owner}/${repo}/contents/${filePath}${ref ? `?ref=${ref}` : ''}`;

        const contents = await ghApi('GET', apiPath, clean);

        // If it's a single file (object, not array), decode the content if it's base64
        if (contents && typeof contents === 'object' && !Array.isArray(contents)) {
            if ((contents as any).encoding === 'base64' && (contents as any).content) {
                try {
                    (contents as any).content = Buffer.from((contents as any).content, 'base64').toString('utf8');
                } catch (e) {
                    console.error('Failed to decode GitHub content', e);
                }
            }
        }

        return res.json({ contents });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── GET /repos/:owner/:repo/commits — List commits ───
router.get('/repos/:owner/:repo/commits', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) return res.status(400).json({ error: 'GitHub not connected', connected: false });
        const clean = token.replace(/[\s\n\r]/g, '');

        const { owner, repo } = req.params;
        const commits = await ghApi('GET', `/repos/${owner}/${repo}/commits?per_page=20`, clean);
        const mapped = (commits as any[]).map((c: any) => ({
            sha: c.sha.substring(0, 7),
            message: c.commit.message,
            author: c.commit.author?.name || c.author?.login || 'Unknown',
            date: c.commit.author?.date || '',
        }));
        return res.json({ commits: mapped });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── GET /repos/:owner/:repo/branches — List branches ───
router.get('/repos/:owner/:repo/branches', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) return res.status(400).json({ error: 'GitHub not connected', connected: false });
        const clean = token.replace(/[\s\n\r]/g, '');

        const { owner, repo } = req.params;
        const branches = await ghApi('GET', `/repos/${owner}/${repo}/branches`, clean);
        const mapped = (branches as any[]).map((b: any) => ({
            name: b.name,
            protected: b.protected,
            sha: b.commit?.sha?.substring(0, 7) || ''
        }));
        return res.json({ branches: mapped });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

export default router;
