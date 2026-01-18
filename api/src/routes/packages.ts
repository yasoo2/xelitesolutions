
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../middleware/auth';

const router = Router();
const execAsync = util.promisify(exec);

// Helper to find root
function findWorkspaceRoot() {
    return process.env.WORKSPACE_ROOT || process.cwd();
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

        // Use npm search --json
        // Note: npm search can be slow. We might want to set a timeout.
        const { stdout } = await execAsync(`npm search "${q.replace(/"/g, '\\"')}" --json`, { timeout: 10000 });
        const results = JSON.parse(stdout);

        // Normalize results
        const normalized = Array.isArray(results) ? results.map((p: any) => ({
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
        let cmd = '';

        if (action === 'uninstall') {
            cmd = `npm uninstall ${pkgName}`;
        } else {
            // Install
            cmd = `npm install ${pkgName} ${dev ? '--save-dev' : ''}`;
        }

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

        const { stdout, stderr } = await execAsync(cmd, { cwd: root });

        res.json({ success: true, output: stdout });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Command failed' });
    }
});

export default router;
