import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { logger } from '../../shared/utils/logger';
import { broadcast } from '../ws';

const router = Router();
const PROJECT_PATH = '/root/xelitesolutions';
const API_PATH = `${PROJECT_PATH}/api`;

// Track deployment status
let isDeploying = false;

/**
 * FIXED Webhook Handler - Uses spawn directly, no exec()
 */
router.post('/deploy', async (req: Request, res: Response) => {
    try {
        const commit = req.body.after || req.body.head_commit?.id || 'unknown';
        const ref = req.body.ref || 'unknown';

        logger.info(`[Webhook] Received push for ${ref}, commit: ${commit}`);

        // Only deploy main branch
        if (!ref.includes('main')) {
            return res.status(200).json({ message: 'Ignored - not main branch', ref });
        }

        // Check if already deploying
        if (isDeploying) {
            return res.status(202).json({ message: 'Deployment already in progress', commit });
        }

        // Respond immediately
        res.status(202).json({ 
            message: 'Deployment started', 
            commit,
            timestamp: new Date().toISOString()
        });

        // Run deployment via central DeployManager
        const { deployManager } = await import('../../modules/services/DeployManager');
        await deployManager.startDeploy('webhook', commit);

    } catch (error: any) {
        logger.error(`[Webhook] Error: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Status endpoint
router.get('/deploy/status', (req, res) => {
    res.json({
        isDeploying,
        timestamp: new Date().toISOString()
    });
});

// Manual trigger
router.post('/deploy/trigger', async (req, res) => {
    try {
        const { deployManager } = await import('../../modules/services/DeployManager');
        const id = await deployManager.startDeploy('manual');
        res.json({ id, message: 'Manual deployment started' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
