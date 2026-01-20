
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import util from 'util';
import { authenticate } from '../middleware/auth';

const router = Router();
const execAsync = util.promisify(exec);

// Helper to find root
function findWorkspaceRoot() {
    return process.env.WORKSPACE_ROOT || process.cwd();
}

async function gitExec(args: string) {
    const cwd = findWorkspaceRoot();
    try {
        const { stdout, stderr } = await execAsync(`git ${args}`, { cwd });
        return { ok: true, stdout, stderr };
    } catch (e: any) {
        return { ok: false, error: e.message || e.stderr || 'Git command failed', stdout: e.stdout, stderr: e.stderr };
    }
}

// GET /git/status
router.get('/status', authenticate as any, async (req: Request, res: Response) => {
    // Check if git initialized
    const check = await gitExec('rev-parse --is-inside-work-tree');
    if (!check.ok) {
        return res.json({ initialized: false, files: [] });
    }

    // Get status
    const result = await gitExec('status --porcelain');
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
    const branchRes = await gitExec('branch --show-current');
    const branch = (branchRes.stdout || '').trim();

    // Get stats (ahead/behind)
    let ahead = 0;
    let behind = 0;
    try {
        const statsRes = await gitExec('rev-list --left-right --count HEAD...@{u}');
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

    // Check if staged or not
    const stagedReq = String(req.query.staged || '') === 'true';
    const args = `diff ${stagedReq ? '--staged' : ''} "${file}"`;

    const result = await gitExec(args);
    res.json({ ok: result.ok, diff: result.stdout || '' });
});

// POST /git/stage (add)
router.post('/stage', authenticate as any, async (req: Request, res: Response) => {
    const { files } = req.body;
    if (!files) return res.status(400).json({ error: 'Files required' });

    const target = Array.isArray(files) ? files.join(' ') : files === '.' ? '.' : `"${files}"`;
    const result = await gitExec(`add ${target}`);

    if (result.ok) res.json({ ok: true });
    else res.status(500).json({ error: result.error });
});

// POST /git/unstage (restore --staged)
router.post('/unstage', authenticate as any, async (req: Request, res: Response) => {
    const { files } = req.body;
    if (!files) return res.status(400).json({ error: 'Files required' });

    const target = Array.isArray(files) ? files.join(' ') : files === '.' ? '.' : `"${files}"`;
    const result = await gitExec(`restore --staged ${target}`);

    if (result.ok) res.json({ ok: true });
    else res.status(500).json({ error: result.error });
});

// POST /git/commit
router.post('/commit', authenticate as any, async (req: Request, res: Response) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    // Set user config if needed (done by agent usually, but here simple fallback)
    await gitExec('config user.name "Joe AI"');
    await gitExec('config user.email "joe@xelitesolutions.com"');

    const result = await gitExec(`commit -m "${message.replace(/"/g, '\\"')}"`);
    if (result.ok) res.json({ ok: true, output: result.stdout });
    else res.status(500).json({ error: result.error });
});

// POST /git/push
router.post('/push', authenticate as any, async (req: Request, res: Response) => {
    // For now, simpler push. Authentication might fail without agent ASKPASS hook.
    // Ideally we should use the GitOpsTool logic which sets up ASKPASS.
    // But for UI Parity MVP, we might try simple push if SSH is set up, or fail and tell user to use Agent.
    const result = await gitExec('push');
    if (result.ok) res.json({ ok: true, output: result.stdout });
    else res.status(500).json({ error: "Authenticated push requires Agent intervention. Please ask Joe to push." });
});

// POST /git/pull
router.post('/pull', authenticate as any, async (req: Request, res: Response) => {
    const result = await gitExec('pull');
    if (result.ok) res.json({ ok: true, output: result.stdout });
    else res.status(500).json({ error: result.error });
});

export default router;
