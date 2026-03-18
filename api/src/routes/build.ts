import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceService } from '../services/WorkspaceService';
import { JoeAgent } from '../agents/JoeAgent';
import { broadcast } from '../ws';
import path from 'path';

const router = Router();

/**
 * Build a complete project using JoeAgent
 * POST /api/build/project
 */
router.post('/project', authenticate as any, async (req: Request, res: Response) => {
    try {
        const { goal, projectName } = req.body;

        if (!goal || typeof goal !== 'string') {
            return res.status(400).json({ error: 'Goal is required' });
        }

        const activeRoot = workspaceService.getActiveRoot();
        const projectPath = projectName 
            ? path.join(activeRoot, projectName)
            : activeRoot;

        // Initialize JoeAgent
        const joe = new JoeAgent(projectPath);

        // Broadcast start
        broadcast({
            type: 'build_started',
            data: { goal, projectPath, timestamp: new Date().toISOString() }
        });

        // Run JoeAgent ignite
        const result = await joe.ignite(goal);

        // Broadcast result
        broadcast({
            type: 'build_completed',
            data: { 
                success: result.success, 
                goal, 
                projectPath,
                iterations: result.iterations,
                timestamp: new Date().toISOString()
            }
        });

        res.json({
            success: result.success,
            goal,
            projectPath,
            iterations: result.iterations,
            finalError: result.finalError,
            message: result.success ? 'Project built successfully' : 'Build failed'
        });

    } catch (error: any) {
        console.error('[Build Route] Error:', error);
        broadcast({
            type: 'build_error',
            data: { error: error.message, timestamp: new Date().toISOString() }
        });
        res.status(500).json({ error: error.message });
    }
});

export default router;
