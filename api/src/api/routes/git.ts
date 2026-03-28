
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
    return res.status(400).json({ error: "DEPRECATED: Please ask Joe to commit your changes. Verify your diffs and simply say 'commit these changes'." });
});

// POST /git/push
router.post('/push', authenticate as any, async (req: Request, res: Response) => {
    return res.status(400).json({ error: "DEPRECATED: Please ask Joe to push your changes. He handles authentication securely." });
});

// POST /git/pull
router.post('/pull', authenticate as any, async (req: Request, res: Response) => {
    return res.status(400).json({ error: "DEPRECATED: Please ask Joe to pull changes." });
});

// GET /git/blame
router.get('/blame', authenticate as any, async (req: Request, res: Response) => {
    const file = String(req.query.file || '').trim();
    if (!file) return res.status(400).json({ error: 'File required' });
    if (!isSafeRepoPath(file)) return res.status(400).json({ error: 'Invalid file path' });

    const result = await gitExec(['blame', '--porcelain', '--', file]);
    if (!result.ok) {
        return res.json({ ok: false, error: result.error, lines: [] });
    }

    // Parse porcelain blame output
    const lines: Array<{ lineNum: number; author: string; date: string; hash: string; content: string }> = [];
    const rawLines = (result.stdout || '').split('\n');
    let currentHash = '';
    let currentAuthor = '';
    let currentDate = '';
    let lineNum = 0;

    for (const raw of rawLines) {
        if (/^[0-9a-f]{40}/.test(raw)) {
            const parts = raw.split(' ');
            currentHash = parts[0].substring(0, 8);
            lineNum = parseInt(parts[2]) || 0;
        } else if (raw.startsWith('author ')) {
            currentAuthor = raw.substring(7);
        } else if (raw.startsWith('author-time ')) {
            const ts = parseInt(raw.substring(12)) || 0;
            currentDate = ts ? new Date(ts * 1000).toISOString().split('T')[0] : '';
        } else if (raw.startsWith('\t')) {
            lines.push({
                lineNum,
                author: currentAuthor,
                date: currentDate,
                hash: currentHash,
                content: raw.substring(1)
            });
        }
    }

    res.json({ ok: true, lines });
});

// POST /git/search-replace - Find and replace within a file
router.post('/search-replace', authenticate as any, async (req: Request, res: Response) => {
    const { file, search, replace, isRegex, caseSensitive } = req.body;
    if (!file || search === undefined) return res.status(400).json({ error: 'File and search required' });

    const cwd = findWorkspaceRoot();
    const filePath = path.join(cwd, file);
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(cwd)) return res.status(400).json({ error: 'Invalid path' });

    try {
        const fs = await import('fs');
        const content = fs.readFileSync(normalizedPath, 'utf-8');

        let flags = 'g';
        if (!caseSensitive) flags += 'i';

        const pattern = isRegex ? new RegExp(search, flags) : new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
        const matches = (content.match(pattern) || []).length;

        if (replace !== undefined) {
            const newContent = content.replace(pattern, replace);
            fs.writeFileSync(normalizedPath, newContent, 'utf-8');
            return res.json({ ok: true, replacements: matches, content: newContent });
        }

        // Count-only mode
        res.json({ ok: true, matches });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Search-replace failed' });
    }
});

// GET /git/log - Recent commits
router.get('/log', authenticate as any, async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(String(req.query.limit || '20')) || 20, 100);
    const result = await gitExec(['log', `--max-count=${limit}`, '--pretty=format:%H|%an|%ae|%at|%s']);
    if (!result.ok) {
        return res.json({ ok: false, commits: [] });
    }

    const commits = (result.stdout || '').split('\n').filter(Boolean).map(line => {
        const [hash, author, email, timestamp, ...msgParts] = line.split('|');
        return {
            hash: (hash || '').substring(0, 8),
            fullHash: hash,
            author,
            email,
            date: new Date(parseInt(timestamp) * 1000).toISOString(),
            message: msgParts.join('|')
        };
    });

    res.json({ ok: true, commits });
});

export default router;
