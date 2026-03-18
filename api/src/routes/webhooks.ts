import { Router, Request, Response } from 'express';
import { deployManager } from '../services/DeployManager';
import { logger } from '../utils/logger';
import { broadcast } from '../ws';

const router = Router();

/**
 * GitHub Webhook Handler - Fixed Version
 * Responds immediately and runs deployment in background
 */
router.post('/deploy', async (req: Request, res: Response) => {
    try {
        const commit = req.body.after || req.body.head_commit?.id || 'unknown';
        const ref = req.body.ref || 'unknown';

        logger.info(`[Webhook] Received push event for ${ref}, commit: ${commit}`);

        // Check if it's the main branch
        if (!ref.includes('main')) {
            logger.info(`[Webhook] Ignoring push to ${ref} (not main branch)`);
            return res.status(200).json({ 
                message: 'Ignored - not main branch',
                ref 
            });
        }

        // Check if deployment is already in progress
        if (deployManager.isDeploying()) {
            logger.warn(`[Webhook] Deployment already in progress, queueing...`);
            return res.status(202).json({ 
                message: 'Deployment already in progress, changes will be picked up by auto-deploy poller',
                commit 
            });
        }

        // Respond immediately - deployment will happen in background
        res.status(202).json({ 
            message: 'Deployment started',
            commit,
            timestamp: new Date().toISOString()
        });

        // Start deployment in background
        logger.info(`[Webhook] Starting background deployment for commit ${commit}`);

        try {
            const deploymentId = await deployManager.startDeploy('webhook', commit);
            logger.info(`[Webhook] Deployment ${deploymentId} completed`);

            broadcast({ 
                type: 'webhook_deployment_completed', 
                data: { commit, deploymentId, status: 'success' } 
            });
        } catch (error: any) {
            logger.error(`[Webhook] Deployment failed: ${error.message}`);

            broadcast({ 
                type: 'webhook_deployment_failed', 
                data: { commit, error: error.message } 
            });
        }

    } catch (error: any) {
        logger.error(`[Webhook] Error handling webhook: ${error.message}`);

        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Internal server error',
                message: error.message 
            });
        }
    }
});

/**
 * Manual deployment trigger
 */
router.post('/deploy/manual', async (req: Request, res: Response) => {
    try {
        if (deployManager.isDeploying()) {
            return res.status(409).json({ 
                error: 'Deployment already in progress',
                currentDeploymentId: deployManager.getCurrentDeploymentId()
            });
        }

        const deploymentId = await deployManager.startDeploy('manual');

        res.status(202).json({ 
            message: 'Manual deployment started',
            deploymentId,
            timestamp: new Date().toISOString()
        });

        broadcast({ 
            type: 'manual_deployment_started', 
            data: { deploymentId } 
        });

    } catch (error: any) {
        logger.error(`[Webhook] Manual deployment error: ${error.message}`);
        res.status(500).json({ 
            error: 'Deployment failed to start',
            message: error.message 
        });
    }
});

/**
 * Get deployment status
 */
router.get('/deploy/status', async (req: Request, res: Response) => {
    try {
        const deployments = await deployManager.getDeployments(10);
        const pollerStatus = deployManager.getPollerStatus();

        res.json({
            isDeploying: deployManager.isDeploying(),
            currentDeploymentId: deployManager.getCurrentDeploymentId(),
            pollerStatus,
            recentDeployments: deployments
        });
    } catch (error: any) {
        logger.error(`[Webhook] Status error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get specific deployment details
 */
router.get('/deploy/status/:id', async (req: Request, res: Response) => {
    try {
        const deployment = await deployManager.getDeployment(req.params.id);
        if (!deployment) {
            return res.status(404).json({ error: 'Deployment not found' });
        }
        res.json(deployment);
    } catch (error: any) {
        logger.error(`[Webhook] Deployment detail error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Rollback to a specific deployment
 */
router.post('/deploy/rollback/:id', async (req: Request, res: Response) => {
    try {
        if (deployManager.isDeploying()) {
            return res.status(409).json({ 
                error: 'Deployment already in progress' 
            });
        }

        const deploymentId = await deployManager.rollback(req.params.id);

        res.status(202).json({ 
            message: 'Rollback started',
            deploymentId,
            timestamp: new Date().toISOString()
        });

        broadcast({ 
            type: 'rollback_started', 
            data: { deploymentId, targetDeploymentId: req.params.id } 
        });

    } catch (error: any) {
        logger.error(`[Webhook] Rollback error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Control auto-deploy poller
 */
router.post('/deploy/poller/:action', (req: Request, res: Response) => {
    const { action } = req.params;

    try {
        if (action === 'stop') {
            deployManager.stopAutoDeployPoller();
            res.json({ message: 'Auto-deploy poller stopped' });
        } else if (action === 'start') {
            deployManager.startAutoDeployPoller();
            res.json({ message: 'Auto-deploy poller started' });
        } else if (action === 'status') {
            res.json(deployManager.getPollerStatus());
        } else {
            res.status(400).json({ error: 'Invalid action. Use: start, stop, or status' });
        }
    } catch (error: any) {
        logger.error(`[Webhook] Poller control error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Health check endpoint for deployment system
 */
router.get('/deploy/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        isDeploying: deployManager.isDeploying(),
        pollerStatus: deployManager.getPollerStatus(),
        timestamp: new Date().toISOString()
    });
});

export default router;
