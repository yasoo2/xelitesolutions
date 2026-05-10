import { Router, Request, Response } from 'express';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../middleware/auth';

const router = Router();

// Helper to find root
function findWorkspaceRoot() {
    return process.env.WORKSPACE_ROOT || process.cwd();
}

function isValidNpmPackageName(name: string) {
    const s = String(name || '').trim();
    if (!s || s.length > 214) return false;
    const re = /^(?:@[a-z0-9][a-z0-9-._~]*\/)?[a-z0-9][a-z0-9-._~]*$/;
    return re.test(s);
}

async function spawnWithTimeout(cmd: string, args: string[], cwd: string, timeoutMs: number) {
    const result = await ExecutionGateway.execute({
        id: `npm_${Date.now()}`,
        type: 'shell',
        payload: {
            command: `${cmd} ${args.join(' ')}`,
            options: { cwd, timeout: timeoutMs, shell: true }
        },
        priority: 'normal'
    });

    return {
        code: result.data?.exitCode ?? (result.success ? 0 : 1),
        stdout: result.data?.output || '',
        stderr: result.data?.error || result.error || ''
    };
}

// GET /packages - List installed packages
router.get('/', authenticate as any, async (req: Request, res: Response) => {
    try {
        const root = findWorkspaceRoot();
        const pkgPath = path.join(root, 'package.json');

        try {
            await fs.promises.access(pkgPath);
        } catch {
            return res.json({ dependencies: {}, devDependencies: {} });
        }

        const content = await fs.promises.readFile(pkgPath, 'utf-8');
        const json = JSON.parse(content);

        res.json({
            dependencies: json.dependencies || {},
            devDependencies: json.devDependencies || {}
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to read package.json' });
    }
});

// GET /packages/search?q=query
router.get('/search', authenticate as any, async (req: Request, res: Response) => {
    try {
        const q = String(req.query.q || '').trim();
        if (!q) return res.json({ results: [] });
        if (q.startsWith('-') || q.length > 100) return res.json({ results: [] });

        // Use npm search --json
        // Note: npm search can be slow. We might want to set a timeout.
        const root = findWorkspaceRoot();
        const r = await spawnWithTimeout('npm', ['search', q, '--json'], root, 10000);
        const raw = (r.stdout || '').trim();
        const parsed = (() => {
            try { return JSON.parse(raw); } catch { }
            const start = raw.indexOf('[');
            const end = raw.lastIndexOf(']');
            if (start >= 0 && end > start) {
                try { return JSON.parse(raw.slice(start, end + 1)); } catch { }
            }
            return [];
        })();

        // Normalize results
        const normalized = Array.isArray(parsed) ? parsed.map((p: any) => ({
            name: p.name,
            version: p.version,
            description: p.description,
            keywords: p.keywords,
            date: p.date,
            links: p.links
        })) : [];

        res.json({ results: normalized });
    } catch (e) {
        console.error(e);
        // Fallback or empty
        res.json({ results: [] });
    }
});

// POST /packages/install or uninstall
router.post('/', authenticate as any, async (req: Request, res: Response) => {
    try {
        const { package: pkgName, dev, action } = req.body;
        if (!pkgName) return res.status(400).json({ error: 'Package name required' });

        const root = findWorkspaceRoot();
        const name = String(pkgName || '').trim();
        if (!isValidNpmPackageName(name)) return res.status(400).json({ error: 'Invalid package name' });

        const args =
            action === 'uninstall'
                ? ['uninstall', name]
                : ['install', name, ...(dev ? ['--save-dev'] : [])];

        // We run this async and don't wait for full completion to avoid timeout? 
        // Or we wait. npm install can take time.
        // For better UX, we should stream logs, but simple await is okay for MVP unless it times out.
        // Let's await.

        // Also try to install types automatically if installing
        let extra = '';
        if (action !== 'uninstall' && !pkgName.startsWith('@types/')) {
            // We can't easily check if types exist without failing.
            // We'll leave auto-types to the Agent Tool or user.
        }

        const r = await spawnWithTimeout('npm', args, root, 5 * 60_000);
        if (r.code !== 0) return res.status(500).json({ error: (r.stderr || 'Command failed').slice(0, 2000) });

        res.json({ success: true, output: r.stdout });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Command failed' });
    }
});

export default router;
