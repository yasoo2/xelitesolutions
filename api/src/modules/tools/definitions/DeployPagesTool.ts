import { ToolDefinition, ToolPermission } from '../types';
import { executeTool } from '../../services/ToolService';
import { workspaceService } from '../../services/WorkspaceService';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as https from 'https';

/**
 * deploy_pages — permanent, FREE, keyless deployment to GitHub Pages.
 *
 * The last mile "from works on my machine to lives on the internet". For a
 * STATIC/FRONTEND build (React/Vite/plain HTML) this builds the site, pushes
 * the output to the repo's gh-pages branch, enables Pages, and returns the
 * permanent URL https://<owner>.github.io/<repo>/. It reuses the GitHub token
 * the user already connected — no new account, no new key.
 *
 * Honesty (THE LAW): a BACKEND (Node server, database) cannot run on Pages —
 * Pages serves static files only. The tool says so plainly and points to the
 * temporary public URL (project_run + expose) instead of pretending.
 */

function ghApi(method: string, apiPath: string, token: string, body?: any): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = https.request({
            hostname: 'api.github.com', path: apiPath, method,
            headers: {
                'User-Agent': 'Joe-AI-Agent',
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github+json',
                ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        }, (res) => {
            let raw = ''; res.on('data', (c) => raw += c);
            res.on('end', () => { try { resolve({ status: res.statusCode || 0, json: raw ? JSON.parse(raw) : {} }); } catch { resolve({ status: res.statusCode || 0, json: {} }); } });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function resolveRepoAndToken(input: any, context: any): Promise<{ repo: string; token: string; userId: string }> {
    const userId = String(context?.userId || input?.userId || '').trim();
    let token = '';
    try {
        const { getUserSecret, getSessionSecret } = require('../../services/secrets');
        token = (userId ? await getUserSecret(userId, 'github', 'GITHUB_TOKEN') : '') ||
            (context?.sessionId ? getSessionSecret(context.sessionId, 'GITHUB_TOKEN') : '') ||
            process.env.GITHUB_TOKEN || '';
    } catch { /* fall through */ }
    token = String(token || '').replace(/[\s\n\r]/g, '');

    let repo = String(input?.repo || '').trim();
    if (!repo) {
        const pick = (ws: any) => String(ws?.integrations?.github?.activeRepo || '').trim();
        try {
            const wsId = String(context?.workspaceId || '').trim();
            if (/^[0-9a-fA-F]{24}$/.test(wsId) && userId) repo = pick(await workspaceService.getWorkspace(wsId, userId));
            if (!repo && userId) for (const w of (await workspaceService.getUserWorkspaces(userId)) || []) { const r = pick(w); if (r) { repo = r; break; } }
            if (!repo && typeof (workspaceService as any).getAllWorkspacesForLookup === 'function') {
                for (const w of (await (workspaceService as any).getAllWorkspacesForLookup()) || []) { const r = pick(w); if (r) { repo = r; break; } }
            }
        } catch { /* none */ }
    }
    return { repo, token, userId };
}

export class DeployPagesTool implements ToolDefinition {
    name = 'deploy_pages';
    version = '1.0.0';
    description = 'Deploy a static/frontend build permanently and FREE to GitHub Pages (reuses the connected token). Returns a permanent https://<owner>.github.io/<repo>/ URL. Backends cannot run on Pages — it says so honestly.';
    tags = ['deploy', 'publish', 'github-pages', 'permanent', 'hosting'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            cwd: { type: 'string' as const, description: 'Project directory. Defaults to the active workspace root.' },
            repo: { type: 'string' as const, description: 'owner/repo. Defaults to the connected repo.' },
            buildCommand: { type: 'string' as const, description: 'Override the build command.' },
        },
    };
    outputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const }, deployed: { type: 'boolean' as const } } };
    permissions: ToolPermission[] = ['execute', 'internet'];
    sideEffects: ToolPermission[] = ['execute', 'internet'];
    rateLimitPerMinute = 4;
    auditFields = ['cwd', 'repo'];
    mockSupported = false;

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const say = (m: string) => { logs.push(m); context?.onProgress?.(m); };
        const cwd = String(input?.cwd || '').trim() || workspaceService.getActiveRoot(context?.workspaceId);
        if (!fs.existsSync(cwd)) return { ok: false, error: `مسار المشروع غير موجود: ${cwd}`, logs };

        const { repo, token } = await resolveRepoAndToken(input, context || {});
        if (!token) return { ok: false, error: 'GitHub غير مربوط. اربط حسابك بتوكن أولاً لينشر جو مشروعك.', output: { needsConnect: true }, logs };
        if (!repo || !repo.includes('/')) return { ok: false, error: 'لا يوجد مستودع مربوط. اضغط على مستودع في قائمة GitHub أولاً، ثم اطلب النشر.', output: { needsRepo: true }, logs };
        const [owner, repoName] = repo.split('/');

        // Honesty gate: Pages serves STATIC files. A backend cannot live here.
        const pkgPath = path.join(cwd, 'package.json');
        let scripts: Record<string, string> = {};
        let deps: Record<string, string> = {};
        if (fs.existsSync(pkgPath)) {
            try { const p = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); scripts = p.scripts || {}; deps = { ...(p.dependencies || {}), ...(p.devDependencies || {}) }; } catch { /* malformed */ }
        }
        const isBackend = !scripts.build && !fs.existsSync(path.join(cwd, 'index.html')) &&
            ['server.js', 'app.js', 'src/server.js', 'src/index.js'].some(e => {
                try { return fs.existsSync(path.join(cwd, e)) && /\.listen\s*\(/.test(fs.readFileSync(path.join(cwd, e), 'utf-8')); } catch { return false; }
            });
        if (isBackend) {
            return {
                ok: false,
                error: 'هذا نظام خلفي (باك اند) — GitHub Pages يستضيف الملفات الثابتة فقط ولا يشغّل خادماً. للاستضافة الدائمة للباك اند تحتاج حساباً سحابياً (Render/Railway). الآن أقدر أشغّله لك محلياً برابط مؤقت — قل «شغّل المشروع».',
                output: { unsupported: 'backend', suggestion: 'project_run' },
                logs,
            };
        }

        // 1) Build (base path = /repo/ so assets resolve under the Pages subpath).
        const isVite = !!deps.vite || fs.existsSync(path.join(cwd, 'vite.config.js')) || fs.existsSync(path.join(cwd, 'vite.config.ts'));
        let outDir = '';
        if (scripts.build) {
            const base = `/${repoName}/`;
            const buildCmd = input?.buildCommand ||
                (isVite ? `npm run build -- --base=${base}` : 'npm run build');
            say(`🏗️ أبني نسخة الإنتاج… (${buildCmd})`);
            const b = await executeTool('shell_execute', { command: buildCmd, cwd, timeout: 300000, env: { PUBLIC_URL: base.replace(/\/$/, '') } }, context);
            if (!b.ok) return { ok: false, error: `فشل بناء نسخة الإنتاج: ${b.error || 'build failed'}`, logs };
            for (const d of ['dist', 'build', 'out', 'public']) { if (fs.existsSync(path.join(cwd, d, 'index.html'))) { outDir = path.join(cwd, d); break; } }
            if (!outDir) return { ok: false, error: 'اكتمل البناء لكن لم أجد مجلد إخراج فيه index.html (dist/build/out).', logs };
        } else {
            // Plain static site — publish the folder as-is.
            if (!fs.existsSync(path.join(cwd, 'index.html'))) return { ok: false, error: 'لا يوجد سكربت build ولا index.html — لا شيء ثابت لنشره.', logs };
            outDir = cwd;
        }

        // 2) Push the built output to the gh-pages branch from an ISOLATED temp
        // repo, so the user's working tree is never touched. Auth rides git_ops.
        say('⬆️ أنشر الملفات إلى فرع gh-pages…');
        const stage = fs.mkdtempSync(path.join(os.tmpdir(), `joe-pages-${Date.now()}-`));
        try {
            fs.cpSync(outDir, stage, { recursive: true });
            // .nojekyll so GitHub Pages serves files/underscored dirs verbatim.
            fs.writeFileSync(path.join(stage, '.nojekyll'), '');
            const gctx = { sessionId: context?.sessionId, workspaceId: context?.workspaceId };
            const git = (operation: string, args: string[]) => executeTool('git_ops', { operation, args, cwd: stage, userId: context?.userId, sessionId: context?.sessionId }, gctx);
            await git('init', []);
            await git('checkout', ['-B', 'gh-pages']);
            await git('add', ['-A']);
            await git('commit', ['-m', `Deploy to GitHub Pages by Joe — ${new Date().toISOString()}`]);
            await git('remote', ['add', 'origin', `https://github.com/${owner}/${repoName}.git`]);
            const push = await git('push', ['--force', 'origin', 'gh-pages']);
            if (!push.ok) {
                const errTxt = String(push.error || '');
                if (push.output?.tokenInvalid) return { ok: false, error: errTxt, output: { tokenInvalid: true }, logs };
                return { ok: false, error: `تعذّر دفع ملفات النشر إلى gh-pages: ${errTxt}`, logs };
            }
        } finally {
            try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* cleanup */ }
        }

        // 3) Enable Pages (idempotent: already-enabled returns 409, which is fine).
        say('🌐 أفعّل GitHub Pages…');
        try {
            const enable = await ghApi('POST', `/repos/${owner}/${repoName}/pages`, token, { source: { branch: 'gh-pages', path: '/' } });
            if (enable.status === 409) {
                await ghApi('PUT', `/repos/${owner}/${repoName}/pages`, token, { source: { branch: 'gh-pages', path: '/' } }).catch(() => {});
            } else if (enable.status >= 400 && enable.status !== 409) {
                logs.push(`pages_enable_status=${enable.status} msg=${enable.json?.message || ''}`);
            }
        } catch (e: any) {
            logs.push(`pages_enable_error=${e?.message || e}`);
        }

        const url = `https://${owner}.github.io/${repoName}/`;
        say(`✅ نُشر بشكل دائم: ${url} (قد يستغرق ظهوره أول مرة دقيقة أو دقيقتين)`);
        return {
            ok: true,
            output: {
                deployed: true, url, repo: `${owner}/${repoName}`, branch: 'gh-pages',
                summary: `## 🚀 نُشر مشروعك بشكل دائم\nالرابط: **${url}**\nمُستضاف مجاناً على GitHub Pages من فرع \`gh-pages\`. قد يحتاج ظهوره أول مرة دقيقة أو دقيقتين. أي تحديث لاحق: اطلب «انشر المشروع» مجدداً.`,
            },
            logs,
        };
    }
}
