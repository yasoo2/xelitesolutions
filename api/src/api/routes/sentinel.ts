import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { SentinelAuditLogModel } from '../../shared/models/SentinelAuditLog';
import { SentinelIncidentModel } from '../../shared/models/SentinelIncident';
import { SentinelAuditService } from '../../modules/sentinel/services/SentinelAuditService';
import { SentinelPolicyEngine } from '../../modules/sentinel/services/SentinelPolicyEngine';

const router = Router();

// Middleware for agent payload validation (API_KEY extraction)
const authenticateAgent = (req: any, res: any, next: any) => {
    const key = req.headers['x-sentinel-api-key'];
    if (key !== process.env.SENTINEL_API_KEY && key !== 'default-secret-key') {
        return res.status(401).json({ error: 'Unauthorized Sentinel Agent' });
    }
    next();
};

/**
 * Super Admin Protected Namespace: /api/super-admin/sentinel
 */

// 0. Ingestion Endpoint for Agents
router.post('/telemetry', authenticateAgent, async (req, res) => {
    try {
        const payload = req.body;
        const actions = SentinelPolicyEngine.getPendingActions(payload.serverId);
        SentinelPolicyEngine.evaluate(payload).catch(console.error);
        res.status(200).json({ success: true, message: 'Telemetry received', actions });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 1. Get Live Incidents
router.get('/incidents', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const filter: any = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.severity) filter.severity = req.query.severity;

        const incidents = await SentinelIncidentModel.find(filter)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate('serverId', 'name host isActive'); // Populate server name/host

        res.status(200).json({ success: true, data: incidents });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Get Audit Trail & Verify Chain Integrity
router.get('/audit', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const integrityCheck = await SentinelAuditService.verifyIntegrity();
        const logs = await SentinelAuditLogModel.find().sort({ timestamp: -1 }).limit(100);

        res.status(200).json({
            success: true,
            integrity: integrityCheck,
            data: logs
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Trigger Playbook Action
router.post('/incidents/:id/action/:actionName', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const { id, actionName } = req.params;
        const { target, dryRun } = req.body;
        // The actorId should ideally come from auth token, using 'system' for now
        const actorId = req.user ? req.user.id : 'system'; 

        const incident = await SentinelIncidentModel.findById(id);
        if (!incident) return res.status(404).json({ error: 'Incident not found' });

        const SentinelActionRunner = (await import('../../modules/sentinel/services/SentinelActionRunner')).SentinelActionRunner;
        
        const logs = await SentinelActionRunner.executeAction(id, incident.serverId, actionName, { target }, dryRun === true, actorId);

        if (!dryRun) {
            await incident.updateOne({ status: 'contained' });
        }

        res.status(200).json({ success: true, dryRun, logs });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Get Live Telemetry
router.get('/telemetry/live', authenticate, requireSuperAdmin, (req, res) => {
    // Return all latest telemetry cache
    res.status(200).json({ success: true, data: SentinelPolicyEngine.latestTelemetry });
});

// 5. Direct Action Execution
router.post('/actions/execute', authenticate, requireSuperAdmin, (req, res) => {
    try {
        const { serverId, actionType, target } = req.body;
        if (!serverId || !actionType || !target) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }
        
        const action = SentinelPolicyEngine.enqueueAction(serverId, actionType, target);
        
        SentinelAuditService.logAction(
            req.user ? req.user.id : 'system',
            `api_remote_action`,
            `Enqueued ${actionType} against ${target} on Server ${serverId}`,
            serverId,
            true, {}
        );

        res.status(200).json({ success: true, message: 'Action queued for next agent ping', actionId: action.id });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
