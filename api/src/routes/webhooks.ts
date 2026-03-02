import { Router, Request, Response } from 'express';
import { deployManager } from '../services/DeployManager';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/webhooks/github
 * Listens for GitHub push events to trigger automated deployments
 */
router.post('/github', async (req: Request, res: Response) => {
    try {
        const event = req.headers['x-github-event'];
        const payload = req.body;

        if (event === 'ping') {
            logger.info('[Webhook] Received ping from GitHub');
            return res.json({ message: 'pong' });
        }

        if (event !== 'push') {
            logger.info(`[Webhook] Ignoring event: ${event}`);
            return res.json({ message: 'Ignored' });
        }

        const ref = payload.ref; // e.g., "refs/heads/main"
        const branch = ref?.replace('refs/heads/', '');

        if (branch !== 'main') {
            logger.info(`[Webhook] Ignoring push to branch: ${branch}`);
            return res.json({ message: 'Ignored branch' });
        }

        logger.info(`[Webhook] Triggering automated deployment for branch: ${branch}`);

        // Extract commit SHA for logging/tracking
        const commit = payload.after || 'unknown';

        // Start deployment in background
        deployManager.startDeploy('webhook', commit).catch(err => {
            logger.error(`[Webhook] Deployment failed to start: ${err.message}`);
        });

        res.json({ message: 'Deployment triggered', commit });
    } catch (e: any) {
        logger.error(`[Webhook] Error processing payload: ${e.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
