import { Router } from 'express';
import { AgentLoopService } from '../../modules/services/AgentLoopService';
import { AgentOrchestrator } from '../../orchestration/AgentOrchestrator';
import { safeErrorMessage } from '../../shared/utils/redaction';
import { traceManager } from '../../modules/services/TraceManager';

const router = Router();

/**
 * POST /api/agent
 * Execute an autonomous goal
 */
router.post('/', async (req, res) => {
    try {
        const { goal, sessionId, userId } = req.body;
        const debug = req.query.debug === 'true';
        
        if (!goal) {
            return res.status(400).json({ success: false, error: 'Goal is required' });
        }

        const traceId = traceManager.startTrace(sessionId || 'anonymous', goal);
        const orchestrator = new AgentOrchestrator();
        const result = await orchestrator.execute({ 
            id: sessionId || `session-${Date.now()}`, 
            goal,
            traceId 
        });
        
        const response: any = {
            success: result.ok,
            data: result.result,
            traceId
        };

        if (debug) {
            response.trace = traceManager.getTrace(traceId);
        }
        
        res.json(response);
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
        const debug = req.query.debug === 'true';
        
        if (!goal) {
            return res.status(400).json({ success: false, error: 'Goal is required' });
        }

        const traceId = traceManager.startTrace('planning', goal);
        const orchestrator = new AgentOrchestrator();
        const plan = await orchestrator.plan(goal, undefined, traceId);
        
        const response: any = {
            success: true,
            data: plan,
            traceId
        };

        if (debug) {
            response.trace = traceManager.getTrace(traceId);
        }

        res.json(response);
    } catch (error) {
        console.error('[AgentRoute] Planning failed:', error);
        res.status(500).json({
            success: false,
            error: 'An internal error occurred during planning'
        });
    }
});

export default router;
