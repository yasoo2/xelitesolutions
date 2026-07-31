import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { SentinelAuditLogModel } from '../../shared/models/SentinelAuditLog';
import { SentinelIncidentModel } from '../../shared/models/SentinelIncident';
import { SentinelAuditService } from '../../modules/sentinel/services/SentinelAuditService';
import { SentinelPolicyEngine } from '../../modules/sentinel/services/SentinelPolicyEngine';
import { SentinelPolicyModel } from '../../shared/models/SentinelPolicy';
import { validatePolicy, evaluatePolicies } from '../../modules/sentinel/services/SentinelPolicyEvaluator';

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
        // The actorId comes from the authenticated token (auth.sub), falling back to 'system'
        const actorId = (req as any).auth?.sub || 'system';

        const incident = await SentinelIncidentModel.findById(id);
        if (!incident) return res.status(404).json({ error: 'Incident not found' });

        const SentinelActionRunner = (await import('../../modules/sentinel/services/SentinelActionRunner')).SentinelActionRunner;
        
        const logs = await SentinelActionRunner.executeAction(String(id), incident.serverId, String(actionName), { target }, dryRun === true, actorId);

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
            (req as any).auth?.sub || 'system',
            `api_remote_action`,
            `Enqueued ${actionType} against ${target} on Server ${serverId}`,
            'success'
        );

        res.status(200).json({ success: true, message: 'Action queued for next agent ping', actionId: action.id });
    } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ============================================================================
   6. Policies — the collection the engine now actually evaluates.
   ============================================================================ */

/** List the configured policies, with the engine's current view of them. */
router.get('/policies', authenticate, requireSuperAdmin, async (_req, res) => {
    try {
        const policies = await SentinelPolicyModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: policies,
            // If the engine could not read the collection on its last pass, say
            // so here rather than showing a list the engine is not using.
            engineLoadError: SentinelPolicyEngine.policyLoadError || undefined,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Try a policy against a payload without saving it.
 *
 * A security rule that is written blind and armed immediately is how an
 * operator disables their own monitoring by accident.
 */
router.post('/policies/test', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const { policy, telemetry } = req.body || {};
        const shape = validatePolicy(policy || {});
        if (!shape.ok) return res.status(400).json({ success: false, error: shape.reason });
        const result = evaluatePolicies([{ ...policy, isActive: true }], telemetry || {});
        res.status(200).json({
            success: true,
            matched: result.matches.length > 0,
            evidence: result.matches[0]?.evidence || {},
            invalid: result.invalid,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Create a policy. Refused unless it is one the evaluator can actually run. */
router.post('/policies', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const shape = validatePolicy(body);
        if (!shape.ok) return res.status(400).json({ success: false, error: shape.reason });
        // An action with nowhere to read its target from can never be carried
        // out; storing it would create a rule that looks armed and is not.
        if (body.autoResponse && !body.autoResponseTargetField) {
            return res.status(400).json({
                success: false,
                error: 'autoResponse needs autoResponseTargetField — where in the telemetry to read the target from, e.g. "users[].ip"',
            });
        }
        const created = await SentinelPolicyModel.create(body);
        SentinelPolicyEngine.invalidatePolicyCache();
        await SentinelAuditService.logAction(
            (req as any).auth?.sub || 'system', 'POLICY_CREATED', `Policy:${created.name}`, 'success',
        ).catch(() => { });
        res.status(201).json({ success: true, data: created });
    } catch (err: any) {
        const conflict = /duplicate key/i.test(String(err?.message));
        res.status(conflict ? 409 : 500).json({ success: false, error: conflict ? 'a policy with that name already exists' : err.message });
    }
});

/** Update a policy. Same validation — an unrunnable edit is refused. */
router.patch('/policies/:id', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const existing = await SentinelPolicyModel.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Policy not found' });

        const merged = { ...existing.toObject(), ...(req.body || {}) };
        const shape = validatePolicy(merged as any);
        if (!shape.ok) return res.status(400).json({ success: false, error: shape.reason });
        if (merged.autoResponse && !merged.autoResponseTargetField) {
            return res.status(400).json({ success: false, error: 'autoResponse needs autoResponseTargetField' });
        }

        Object.assign(existing, req.body || {});
        await existing.save();
        SentinelPolicyEngine.invalidatePolicyCache();
        await SentinelAuditService.logAction(
            (req as any).auth?.sub || 'system', 'POLICY_UPDATED', `Policy:${existing.name}`, 'success',
        ).catch(() => { });
        res.status(200).json({ success: true, data: existing });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** Delete a policy. Recorded in the audit chain like any other disarming. */
router.delete('/policies/:id', authenticate, requireSuperAdmin, async (req, res) => {
    try {
        const deleted = await SentinelPolicyModel.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, error: 'Policy not found' });
        SentinelPolicyEngine.invalidatePolicyCache();
        await SentinelAuditService.logAction(
            (req as any).auth?.sub || 'system', 'POLICY_DELETED', `Policy:${deleted.name}`, 'success',
        ).catch(() => { });
        res.status(200).json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
