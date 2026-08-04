import { Router, Request, Response } from 'express';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import path from 'path';
import { authenticate } from '../middleware/auth';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';
import { parseStatusPorcelainBranch } from '../../core/git/parse-status';

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
    return await executionFirewall.runAsSystem(async () => {
        const result = await ExecutionGateway.execute('git', args, { cwd, timeout: 30000 });
        const ok = result.success && result.data?.ok !== false;
        return {
            ok,
            stdout: result.data?.output || '',
            stderr: result.data?.error || result.error || '',
            error: ok ? undefined : (result.error || result.data?.error || 'Git command failed')
        };
    });
}

// Short-lived cache for /git/status. The frontend polls it every second, and each
// call runs FOUR git commands (slow on Windows / large repos), which was flooding the
// server and slowing everything else. Serving a cached snapshot for a few seconds
// removes that load with no visible difference to the user.
let _statusCache: { at: number; data: any } | null = null;
const STATUS_CACHE_MS = Number(process.env.GIT_STATUS_CACHE_MS || 5000);

// GET /git/status
//
// ONE git command instead of four. `git status --porcelain --branch` carries
// the entry list, the branch name, and ahead/behind in a single spawn — and
// its failure IS the "not a repository" answer, so the rev-parse pre-flight,
// `branch --show-current`, and `rev-list --count` spawns are gone. On the
// Windows machine this serves, each spawn costs real seconds and the frontend
// polls this endpoint on a timer: 4 commands per refresh was the single
// biggest background load Joe put on the laptop.
// Stale-while-revalidate: on the user's laptop a single `git status` was
// measured at 0.6-8.3 SECONDS during a build, and the old handler made the
// HTTP request WAIT for it. Now a request is answered from the cache
// instantly, and when the cache is old ONE background refresh runs — nobody
// ever waits on git, and concurrent polls never stack refreshes.
let _statusRefreshing = false;
/**
 * ADAPTIVE BACKOFF — measured, not guessed.
 *
 * The cache made the HTTP call instant, but the BACKGROUND refresh still ran
 * every five seconds forever, and on the user's laptop one `git status` was
 * measured at 0.5s, 1.4s, 2.1s and 3.2s while a build was running («SLOW
 * EXECUTION … cmd=git status» in his log, over and over). A command that costs
 * three seconds must not be run every five: the interval now follows the cost
 * of the LAST refresh — eight times its duration, capped at two minutes — so a
 * fast repository still refreshes every five seconds and a slow one (or a busy
 * machine mid-build) stops competing with the work the user is waiting for.
 */
let _lastRefreshMs = 0;
const STATUS_MAX_MS = Number(process.env.GIT_STATUS_MAX_MS || 120_000);
function statusIntervalMs(): number {
    return Math.min(STATUS_MAX_MS, Math.max(STATUS_CACHE_MS, _lastRefreshMs * 8));
}
async function refreshGitStatus(): Promise<void> {
    if (_statusRefreshing) return;
    _statusRefreshing = true;
    const startedAt = Date.now();
    try {
        const result = await gitExec(['status', '--porcelain', '--branch']);
        if (!result.ok) {
            // "fatal: not a git repository" lands here; anything else (index
            // lock, permission) is transient — a brief initialized:false is
            // still right, the next refresh re-checks.
            _statusCache = { at: Date.now(), data: { initialized: false, files: [] } };
            return;
        }
        const snap = parseStatusPorcelainBranch(result.stdout || '');
        _statusCache = {
            at: Date.now(),
            data: { initialized: true, branch: snap.branch, files: snap.files, ahead: snap.ahead, behind: snap.behind },
        };
    } finally {
        _lastRefreshMs = Date.now() - startedAt;
        _statusRefreshing = false;
    }
}

/** Exposed for the proof: how long the last refresh cost, and the interval it earned. */
export function _gitStatusPace() { return { lastRefreshMs: _lastRefreshMs, intervalMs: statusIntervalMs() }; }

router.get('/status', authenticate as any, async (req: Request, res: Response) => {
    if (_statusCache) {
        res.json(_statusCache.data);
        if (Date.now() - _statusCache.at >= statusIntervalMs()) {
            refreshGitStatus().catch(() => { /* next poll retries */ });
        }
        return;
    }
    // Very first call after boot: nothing to serve stale, so this one waits.
    await refreshGitStatus().catch(() => { });
    res.json(_statusCache ? (_statusCache as any).data : { initialized: false, files: [] });
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

    const commits = (result.stdout || '').split('\n').filter(Boolean).map((line: string) => {
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
