import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AgentLoopService } from '../../modules/services/AgentLoopService';
import { authenticateOptional } from '../middleware/auth';
import { Run } from '../../shared/models/run';
import { ToolExecution } from '../../shared/models/toolExecution';
import { Artifact } from '../../shared/models/artifact';
import { Session } from '../../shared/models/session';
import { traceManager } from '../../modules/services/TraceManager';

const router = Router();

/**
 * [REAL-TIME RUNTIME GATEWAY]
 * This route now delegates all intelligence to the AgentOrchestrator.
 * Legacy simulation logic has been decommissioned.
 */
router.post('/start', authenticateOptional as any, async (req: Request, res: Response) => {
    const { text, sessionId, userId: bodyUserId, provider, model, apiKey, baseUrl } = req.body || {};
    const userId = (req as any).auth?.sub || bodyUserId || 'anonymous';
    
    console.log(`[RunRoute] Unified execution requested for session: ${sessionId}`);

    if (!text) {
        return res.status(400).json({ error: 'Goal text is required' });
    }

    try {
        const traceId = traceManager.startTrace(sessionId || 'anonymous', text);
        
        // Generate a runId immediately so we can return it
        const tempRunId = `run-${Date.now()}`;
        
        // [ELITE FIX] Make execution non-blocking to prevent Nginx timeouts and frontend hang
        // The background process will handle its own errors and broadcast status via WS
        AgentLoopService.execute(text, { 
            sessionId, 
            userId,
            traceId,
            modelConfig: {
                provider,
                model,
                apiKey,
                baseUrl
            }
        }).catch(err => {
            console.error(`[RunRoute] Background execution fatal error:`, err);
        });

        // Return immediately so the frontend can start listening for WS updates
        return res.json({
            ok: true,
            runId: tempRunId,
            traceId
        });
    } catch (error: any) {
        console.error('[RunRoute] Execution failed:', error);
        return res.status(500).json({ error: error.message || 'Internal execution error' });
    }
});

/**
 * Basic Run Management Routes
 */
router.get('/', async (req, res) => {
    const runs = await Run.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(runs);
});

router.get('/:id', async (req, res) => {
    const run = await Run.findById(req.params.id).lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });
    
    const execs = await ToolExecution.find({ runId: req.params.id }).lean();
    const artifacts = await Artifact.find({ runId: req.params.id }).lean();
    
    res.json({ run, execs, artifacts });
});

router.post('/stop', async (req, res) => {
    // Basic stop logic - since orchestrator is stateless per-request in this version,
    // we mark the run as failed in DB.
    const { runId } = req.body;
    if (runId && mongoose.Types.ObjectId.isValid(runId)) {
        await Run.findByIdAndUpdate(runId, { $set: { status: 'failed' } });
    }
    res.json({ ok: true });
});

export default router;
