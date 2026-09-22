import type { ToolDefinition, ToolExecutionResult, ToolPermission } from '../types';
import { capabilityConstraintsFromRequest, capabilityFamilyFromRequest, capabilityProfilesFor, decideCapabilityRoute } from '../../../core/capabilities/decision-profiles';

/**
 * Produces a policy receipt only. Connection, credentials, payment, and any
 * follow-on execution remain separate guarded actions through ToolService.
 */
export class CapabilityDecisionTool implements ToolDefinition {
    name = 'decide_capability_route';
    version = '1.0.0';
    description = 'Choose the least-burdensome safe local or external capability route and return inspectable evidence and at most one required user action.';
    tags = ['capability', 'decision', 'local', 'external', 'provider', 'setup', 'privacy', 'cost'];
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 30;
    mockSupported = true;
    auditFields = ['request', 'family', 'offline', 'privacy', 'deployment', 'requireProvenReliability', 'allowPaid'];
    inputSchema = {
        type: 'object',
        properties: {
            request: { type: 'string' }, family: { type: 'string' }, offline: { type: 'boolean' },
            privacy: { type: 'string', enum: ['LOCAL_ONLY', 'EXTERNAL_ALLOWED'] }, deployment: { type: 'boolean' },
            requireProvenReliability: { type: 'boolean' }, allowPaid: { type: 'boolean' }, requiresUnlimitedRate: { type: 'boolean' },
            allowedLicenses: { type: 'array', items: { type: 'string' } }, maxMaintenance: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        }, required: ['request'],
    };
    outputSchema = { type: 'object', properties: { receipt: { type: 'object' }, userAction: { type: 'string' } } };

    async execute(input: any): Promise<ToolExecutionResult> {
        const request = String(input?.request || '').trim();
        const family = String(input?.family || '').trim().toLowerCase() || capabilityFamilyFromRequest(request);
        if (!request) return { ok: false, error: 'request is required', logs: [] };
        if (!family) return { ok: false, error: 'unsupported_capability_family', output: { supportedFamilies: ['ocr', 'geocoding', 'storage', 'speech', 'routing'] }, logs: ['CAPABILITY_DECISION stopped: request did not identify a supported general capability family'] };
        const inferred = capabilityConstraintsFromRequest(request);
        const receipt = decideCapabilityRoute({
            family,
            offline: input?.offline === true || inferred.offline,
            privacy: input?.privacy === 'LOCAL_ONLY' ? 'LOCAL_ONLY' : inferred.privacy || 'EXTERNAL_ALLOWED',
            deployment: input?.deployment === true || inferred.deployment,
            requireProvenReliability: input?.requireProvenReliability === true || inferred.requireProvenReliability,
            allowPaid: input?.allowPaid === true,
            requiresUnlimitedRate: input?.requiresUnlimitedRate === true || inferred.requiresUnlimitedRate,
            allowedLicenses: Array.isArray(input?.allowedLicenses) ? input.allowedLicenses.map(String).slice(0, 8) : undefined,
            maxMaintenance: ['LOW', 'MEDIUM', 'HIGH'].includes(String(input?.maxMaintenance)) ? input.maxMaintenance : undefined,
        }, capabilityProfilesFor(family));
        return {
            ok: Boolean(receipt.selected),
            ...(receipt.selected ? {} : { error: 'no_safe_capability_route' }),
            output: { receipt, ...(receipt.requiredUserAction ? { userAction: receipt.requiredUserAction } : {}) },
            logs: [receipt.selected
                ? `CAPABILITY_DECISION selected ${receipt.selected.route} with ${receipt.requiredUserAction || 'no'} user setup action`
                : 'CAPABILITY_DECISION stopped: no candidate satisfied the stated constraints'],
        };
    }
}
