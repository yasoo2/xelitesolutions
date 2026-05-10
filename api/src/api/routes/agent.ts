import { Router } from 'express';
import { AgentLoopService } from '../../modules/services/AgentLoopService';
import { safeErrorMessage } from '../../shared/utils/redaction';

const router = Router();

/**
 * POST /api/agent
 * Execute an autonomous goal
 */
router.post('/', async (req, res) => {
    try {
        const { goal, sessionId, userId } = req.body;
        
        if (!goal) {
            return res.status(400).json({ ok: false, error: 'Goal is required' });
        }

        console.log(`[AgentRoute] Received goal: ${goal}`);
        
        const result = await AgentLoopService.execute(goal, { sessionId, userId });
        
        res.json({
            ok: true,
            result
        });
    } catch (error) {
        console.error('[AgentRoute] Execution failed:', error);
        res.status(500).json({
            ok: false,
            error: safeErrorMessage(error)
        });
    }
});

/**
 * GET /api/agent/plan
 * Generate an execution plan for a goal
 */
router.get('/plan', async (req, res) => {
    try {
        const goal = req.query.goal as string;
        const sessionId = req.query.sessionId as string;
        const userId = req.query.userId as string;

        if (!goal) {
            return res.status(400).json({ ok: false, error: 'Goal is required' });
        }

        console.log(`[AgentRoute] Planning for goal: ${goal}`);
        
        const plan = await AgentLoopService.plan(goal, { sessionId, userId });
        
        res.json({
            ok: true,
            plan
        });
    } catch (error) {
        console.error('[AgentRoute] Planning failed:', error);
        res.status(500).json({
            ok: false,
            error: safeErrorMessage(error)
        });
    }
});

export default router;
