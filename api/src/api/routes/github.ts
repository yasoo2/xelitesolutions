/**
 * GitHub Integration Routes
 * Central REST API for GitHub operations (connect, repos, contents, commits, branches)
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { GitHubRepoManagerTool } from '../../modules/tools/definitions/GitHubRepoManagerTool';
import { setUserSecretEncrypted, getUserSecret } from '../../modules/services/secrets';
import { executeTool } from '../../modules/services/ToolService';
import { workspaceService } from '../../modules/services/WorkspaceService';
import { broadcastThinkingDetail } from '../ws';
import fs from 'fs';
import path from 'path';
import https from 'https';

const router = Router();
const repoTool = new GitHubRepoManagerTool();

/**
 * Turns a raw GitHub API failure into a clear, actionable answer.
 *
 * A revoked or expired token makes GitHub reply `{message:"Bad credentials"}`;
 * the routes used to re-emit that verbatim as an HTTP 500 — the user saw a
 * cryptic English phrase and no hint that the fix is "reconnect your token".
 * This maps the real failure classes to the right status and an Arabic
 * sentence that says what to DO. The token is never auto-deleted (a transient
 * blip must not wipe a good connection) — the user re-entering it overwrites it.
 */
function classifyGhError(e: any): { status: number; body: any } {
    const status = Number(e?.status) || 0;
    const msg = String(e?.message || '');
    if (status === 401 || /bad credentials|requires authentication/i.test(msg)) {
        return { status: 401, body: { error: 'انتهت صلاحية توكن GitHub أو تم إلغاؤه. أعِد ربط حسابك بتوكن جديد لمتابعة العمل.', connected: false, tokenInvalid: true } };
    }
    if (status === 403 && /rate limit/i.test(msg)) {
        return { status: 429, body: { error: 'تجاوزت حدّ طلبات GitHub مؤقتاً. انتظر قليلاً ثم أعد المحاولة.', rateLimited: true } };
    }
    if (status === 403) {
        return { status: 403, body: { error: 'التوكن الحالي لا يملك الصلاحية الكافية لهذه العملية. أعِد ربط حسابك بتوكن يملك صلاحية repo كاملة.', tokenInsufficientScope: true } };
    }
    if (status === 404) {
        return { status: 404, body: { error: 'المستودع غير موجود أو لا تملك صلاحية الوصول إليه بهذا التوكن.', notFound: true } };
    }
    return { status: status >= 400 ? status : 500, body: { error: msg || 'خطأ غير متوقع من GitHub.' } };
}

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
// "See ALL my repositories" means ALL: owned, org, AND collaborator repos, past
// the first page. The old call (`type=owner&per_page=30`) hid every org and
// shared repo and silently truncated at 30 — a user with more, or with a repo
// they only collaborate on, could never connect to it here. GitHub caps a page
// at 100; we walk pages until they run out (bounded, so a 900-repo account can't
// stall the UI), and `affiliation` widens the net to everything the token sees.
router.get('/repos', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) return res.status(400).json({ error: 'GitHub not connected', connected: false });
        const clean = token.replace(/[\s\n\r]/g, '');

        const sort = String(req.query.sort || 'updated');
        const MAX_PAGES = 10; // up to 1000 repos — beyond that, search is the right tool
        const all: any[] = [];
        for (let page = 1; page <= MAX_PAGES; page++) {
            const batch = await ghApi(
                'GET',
                `/user/repos?sort=${sort}&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`,
                clean,
            );
            if (!Array.isArray(batch) || batch.length === 0) break;
            all.push(...batch);
            if (batch.length < 100) break; // last page
        }

        const mapped = all.map((r: any) => ({
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
            stars: r.stargazers_count,
            // So the UI can tell "mine" from "shared/org" — the user asked to see
            // them all, but which is which still matters.
            owned: !!r.permissions?.admin || String(r.owner?.login || '').toLowerCase() === String((req as any).__ghLogin || '').toLowerCase(),
            role: r.permissions?.admin ? 'admin' : r.permissions?.push ? 'write' : 'read',
        }));
        return res.json({ repos: mapped, total: mapped.length });
    } catch (e: any) {
        const { status, body } = classifyGhError(e); return res.status(status).json(body);
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
        const { status, body } = classifyGhError(e); return res.status(status).json(body);
    }
});

// ─── POST /repos/:owner/:repo/connect — Connect AND clone a repo ───
// The heart of "شبك على مستودع بشكل مباشر": setting activeRepo only stored a
// NAME — the local workspace stayed empty, so Joe could analyse via the API but
// could never open, edit, or build the repo's real files. This endpoint makes
// the connection physical: it records the active repo AND clones (or updates)
// the working tree into the workspace root, so the very next build/edit acts on
// the actual code. Idempotent — a repo already on disk is fetched, not re-cloned.
router.post('/repos/:owner/:repo/connect', authenticate as any, async (req: Request, res: Response) => {
    const userId = (req as any).auth?.sub;
    const owner = String(req.params.owner || '');
    const repo = String(req.params.repo || '');
    const fullName = `${owner}/${repo}`;
    const hdrWs = req.headers['x-workspace-id'];
    const workspaceId = (req.body?.workspaceId as string) || (Array.isArray(hdrWs) ? hdrWs[0] : hdrWs) || '';
    const sessionId = (req.body?.sessionId as string) || '';
    try {
        const token = userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : null;
        if (!token) return res.status(400).json({ error: 'GitHub not connected', connected: false });
        if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required to connect a repo' });

        // 1) Record the selection so every later tool resolves the connected repo.
        await workspaceService.updateWorkspace(userId, workspaceId, { activeRepo: fullName, kind: 'github' });

        // 2) Bring the working tree down. getActiveRoot creates/returns the dir.
        const root = workspaceService.getActiveRoot(workspaceId);
        const hasGit = (() => { try { return fs.existsSync(path.join(root, '.git')); } catch { return false; } })();
        const dirEmpty = (() => { try { return fs.readdirSync(root).length === 0; } catch { return true; } })();
        const say = (m: string) => { if (sessionId) { try { broadcastThinkingDetail(sessionId, m); } catch { /* optional */ } } };

        // Auth rides through git_ops' askpass (token never enters the URL or logs).
        const gitCtx = { sessionId, workspaceId };
        let mode: 'cloned' | 'updated' | 'cloned_subdir';
        let workdir = root;

        if (hasGit) {
            say(`🔄 المستودع ${fullName} موجود محلياً — أجلب آخر التحديثات…`);
            const r = await executeTool('git_ops', { operation: 'fetch', args: ['--all', '--prune'], cwd: root, userId, sessionId }, gitCtx);
            if (!r.ok) throw new Error(String(r.error || 'git fetch failed'));
            await executeTool('git_ops', { operation: 'pull', args: ['--ff-only'], cwd: root, userId, sessionId }, gitCtx).catch(() => {});
            mode = 'updated';
        } else {
            const url = `https://github.com/${fullName}.git`;
            // Shallow, single-branch clone: on a weak machine a large repo
            // downloads in seconds with a fraction of the disk — the full
            // history is rarely needed to work on the current code, and a
            // deeper history can be fetched on demand later.
            const shallow = ['--depth', '1', '--single-branch'];
            if (dirEmpty) {
                say(`⬇️ أستنسخ ${fullName} إلى مساحة العمل (نسخة سريعة خفيفة)…`);
                const r = await executeTool('git_ops', { operation: 'clone', args: [...shallow, url, '.'], cwd: root, userId, sessionId }, gitCtx);
                if (!r.ok) throw new Error(String(r.error || 'git clone failed'));
                mode = 'cloned';
            } else {
                // The workspace already holds unrelated files: clone into a named
                // subdir and point the active root there, so nothing is clobbered.
                say(`⬇️ أستنسخ ${fullName} إلى مجلد فرعي (نسخة سريعة خفيفة)…`);
                const r = await executeTool('git_ops', { operation: 'clone', args: [...shallow, url, repo], cwd: root, userId, sessionId }, gitCtx);
                if (!r.ok) throw new Error(String(r.error || 'git clone failed'));
                workdir = path.join(root, repo);
                await workspaceService.setActiveRoot(workdir, workspaceId);
                mode = 'cloned_subdir';
            }
        }

        say(`✅ المستودع ${fullName} جاهز للعمل عليه محلياً.`);
        // Fetch the default branch so the UI can show it immediately.
        let defaultBranch = 'main';
        try { const meta = await ghApi('GET', `/repos/${fullName}`, token.replace(/[\s\n\r]/g, '')); defaultBranch = meta.default_branch || 'main'; } catch { /* non-fatal */ }

        return res.json({ ok: true, connected: true, activeRepo: fullName, mode, workdir, defaultBranch });
    } catch (e: any) {
        return res.status(500).json({ ok: false, error: `تعذّر ربط المستودع: ${e?.message || e}` });
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
        const { status, body } = classifyGhError(e); return res.status(status).json(body);
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
        const { status, body } = classifyGhError(e); return res.status(status).json(body);
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
        const { status, body } = classifyGhError(e); return res.status(status).json(body);
    }
});

export default router;
