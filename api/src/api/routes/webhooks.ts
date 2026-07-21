import { Router, Request, Response } from 'express';
import { logger } from '../../shared/utils/logger';
import { broadcast } from '../ws';

import crypto from 'crypto';

const router = Router();
const PROJECT_PATH = '/root/xelitesolutions';
const API_PATH = `${PROJECT_PATH}/api`;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

// Track deployment status
let isDeploying = false;

function verifyGitHubSignature(req: Request, res: Response, next: Function) {
    if (!GITHUB_WEBHOOK_SECRET) {
        logger.warn('[Webhook] GITHUB_WEBHOOK_SECRET is not configured. Rejecting webhook.');
        return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
        return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
    }

    const payload = JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');

    try {
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))) {
            return res.status(401).json({ error: 'Invalid signature' });
        }
    } catch (e) {
        return res.status(401).json({ error: 'Invalid signature format' });
    }

    next();
}

/**
 * FIXED Webhook Handler - Uses central DeployManager
 */
router.post('/deploy', verifyGitHubSignature, async (req: Request, res: Response) => {
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
        const id = await deployManager.startDeploy('manual', 'HEAD');
        res.json({ id, message: 'Manual deployment started' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
