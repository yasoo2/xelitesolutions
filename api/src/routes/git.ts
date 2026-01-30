
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import { authenticate } from '../middleware/auth';

const router = Router();

// Helper to find root
function findWorkspaceRoot() {
    return process.env.WORKSPACE_ROOT || process.cwd();
}

function isSafeRepoPath(p: string) {
    const raw = String(p || '');
    if (!raw) return false;
    if (raw.includes('\0')) return false;
    if (path.isAbsolute(raw)) return false;
    if (raw.startsWith('-')) return false;
    const normalized = path.normalize(raw);
    if (normalized.startsWith('..' + path.sep) || normalized === '..') return false;
    return true;
}

async function gitExec(args: string[]) {
    const cwd = findWorkspaceRoot();
    return await new Promise<{ ok: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
        const child = spawn('git', args, { cwd, shell: false });
        let stdout = '';
        let stderr = '';
        let done = false;

        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            try { child.kill('SIGKILL'); } catch { }
            resolve({ ok: false, stdout, stderr: stderr || 'timeout', error: 'Git command timed out' });
        }, 20000);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            const ok = code === 0;
            resolve({ ok, stdout, stderr, error: ok ? undefined : (stderr || 'Git command failed') });
        });
        child.on('error', (e: any) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve({ ok: false, stdout, stderr: String(e?.message || e || 'spawn_failed'), error: 'Git command failed' });
        });
    });
}

// GET /git/status
router.get('/status', authenticate as any, async (req: Request, res: Response) => {
    // Check if git initialized
    const check = await gitExec(['rev-parse', '--is-inside-work-tree']);
    if (!check.ok) {
        return res.json({ initialized: false, files: [] });
    }

    // Get status
    const result = await gitExec(['status', '--porcelain']);
    if (!result.ok) {
        return res.status(500).json({ error: result.error });
    }

    const lines = (result.stdout || '').split('\n').filter((l: string) => l.trim());
    const files = lines.map((line: string) => {
        const status = line.substring(0, 2);
        const file = line.substring(3).trim();
        return { status, file };
    });

    // Get branch
    const branchRes = await gitExec(['branch', '--show-current']);
    const branch = (branchRes.stdout || '').trim();

    // Get stats (ahead/behind)
    let ahead = 0;
    let behind = 0;
    try {
        const statsRes = await gitExec(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
        if (statsRes.ok) {
            const parts = (statsRes.stdout || '').trim().split(/\s+/);
            if (parts.length >= 2) {
                ahead = parseInt(parts[0]) || 0;
                behind = parseInt(parts[1]) || 0;
            }
        }
    } catch { }

    res.json({ initialized: true, branch, files, ahead, behind });
});

// GET /git/diff
router.get('/diff', authenticate as any, async (req: Request, res: Response) => {
    const file = String(req.query.file || '').trim();
    if (!file) return res.status(400).json({ error: 'File required' });
    if (!isSafeRepoPath(file)) return res.status(400).json({ error: 'Invalid file path' });

    // Check if staged or not
    const stagedReq = String(req.query.staged || '') === 'true';
    const args = ['diff', ...(stagedReq ? ['--staged'] : []), '--', file];
    const result = await gitExec(args);
    res.json({ ok: result.ok, diff: result.stdout || '' });
});

// POST /git/stage (add)
router.post('/stage', authenticate as any, async (req: Request, res: Response) => {
    const { files } = req.body;
    if (!files) return res.status(400).json({ error: 'Files required' });

    const list = Array.isArray(files) ? files.map((f) => String(f || '').trim()).filter(Boolean) : [String(files || '').trim()].filter(Boolean);
    if (list.length === 0) return res.status(400).json({ error: 'Files required' });
    if (list.length === 1 && list[0] === '.') {
        const result = await gitExec(['add', '.']);
        if (result.ok) res.json({ ok: true });
        else res.status(500).json({ error: result.error });
        return;
    }
    for (const f of list) {
        if (!isSafeRepoPath(f)) return res.status(400).json({ error: 'Invalid file path' });
    }
    const result = await gitExec(['add', '--', ...list]);

    if (result.ok) res.json({ ok: true });
    else res.status(500).json({ error: result.error });
});

// POST /git/unstage (restore --staged)
router.post('/unstage', authenticate as any, async (req: Request, res: Response) => {
    const { files } = req.body;
    if (!files) return res.status(400).json({ error: 'Files required' });

    const list = Array.isArray(files) ? files.map((f) => String(f || '').trim()).filter(Boolean) : [String(files || '').trim()].filter(Boolean);
    if (list.length === 0) return res.status(400).json({ error: 'Files required' });
    if (list.length === 1 && list[0] === '.') {
        const result = await gitExec(['restore', '--staged', '.']);
        if (result.ok) res.json({ ok: true });
        else res.status(500).json({ error: result.error });
        return;
    }
    for (const f of list) {
        if (!isSafeRepoPath(f)) return res.status(400).json({ error: 'Invalid file path' });
    }
    const result = await gitExec(['restore', '--staged', '--', ...list]);

    if (result.ok) res.json({ ok: true });
    else res.status(500).json({ error: result.error });
});

// POST /git/commit
router.post('/commit', authenticate as any, async (req: Request, res: Response) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    // Set user config if needed (done by agent usually, but here simple fallback)
    await gitExec(['config', 'user.name', 'Joe AI']);
    await gitExec(['config', 'user.email', 'joe@xelitesolutions.com']);

    const msg = String(message || '').trim();
    const result = await gitExec(['commit', '-m', msg]);
    if (result.ok) res.json({ ok: true, output: result.stdout });
    else res.status(500).json({ error: result.error });
});

// POST /git/push
router.post('/push', authenticate as any, async (req: Request, res: Response) => {
    // For now, simpler push. Authentication might fail without agent ASKPASS hook.
    // Ideally we should use the GitOpsTool logic which sets up ASKPASS.
    // But for UI Parity MVP, we might try simple push if SSH is set up, or fail and tell user to use Agent.
    const result = await gitExec(['push']);
    if (result.ok) res.json({ ok: true, output: result.stdout });
    else res.status(500).json({ error: "Authenticated push requires Agent intervention. Please ask Joe to push." });
});

// POST /git/pull
router.post('/pull', authenticate as any, async (req: Request, res: Response) => {
    const result = await gitExec(['pull']);
    if (result.ok) res.json({ ok: true, output: result.stdout });
    else res.status(500).json({ error: result.error });
});

export default router;
