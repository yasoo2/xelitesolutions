import { Router } from 'express';
import { AgentLoopService } from '../../modules/services/AgentLoopService';
import { AgentOrchestrator } from '../../orchestration/AgentOrchestrator';
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
            return res.status(400).json({ success: false, error: 'Goal is required' });
        }

        const orchestrator = new AgentOrchestrator();
        const result = await orchestrator.execute({ id: sessionId || `session-${Date.now()}`, goal });
        
        res.json({
            success: result.ok,
            data: result.result
        });
    } catch (error) {
        console.error('[AgentRoute] Execution failed:', error);
        res.status(500).json({
            success: false,
            error: 'An internal error occurred during execution'
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
        
        if (!goal) {
            return res.status(400).json({ success: false, error: 'Goal is required' });
        }

        const orchestrator = new AgentOrchestrator();
        const plan = await orchestrator.plan(goal);
        
        res.json({
            success: true,
            data: plan
        });
    } catch (error) {
        console.error('[AgentRoute] Planning failed:', error);
        res.status(500).json({
            success: false,
            error: 'An internal error occurred during planning'
        });
    }
});

export default router;
