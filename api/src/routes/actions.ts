
import { Router, Request, Response } from 'express';
import { GitHubActionsTool } from '../tools/definitions/GitHubActionsTool';
import { authenticate } from '../middleware/auth';

const router = Router();
const ghTool = new GitHubActionsTool();

router.get('/runs', authenticate as any, async (req: Request, res: Response) => {
    try {
        // Assuming environment variables for OWNER/REPO or passed in query
        // For UI simplicity we default to the current checked out repo if possible
        // Ideally we need owner/repo. Let's try to infer or require them.
        const owner = String(req.query.owner || 'yasoo2'); // Default fallback
        const repo = String(req.query.repo || 'xelitesolutions'); // Default fallback

        const result = await ghTool.execute({ action: 'list_runs', owner, repo, limit: 10 });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/trigger', authenticate as any, async (req: Request, res: Response) => {
    try {
        const { owner, repo, workflowId, ref } = req.body;
        const result = await ghTool.execute({
            action: 'trigger_workflow',
            owner: owner || 'yasoo2',
            repo: repo || 'xelitesolutions',
            workflowId,
            ref: ref || 'main'
        });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
