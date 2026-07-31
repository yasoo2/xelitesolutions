import { SentinelIncidentService } from './SentinelIncidentService';
import { SentinelActionRunner } from './SentinelActionRunner';
import { SentinelAuditService } from './SentinelAuditService';
import { SentinelPolicyModel } from '../../../shared/models/SentinelPolicy';
import { evaluatePolicies, readPath, type PolicyLike } from './SentinelPolicyEvaluator';

export interface TelemetryPayload {
    serverId: string;
    metrics: any;
    processes: any;
    users?: any[];
    fim: any;
    network: any;
}

export interface SentinelAction {
    id: string;
    type: string;
    target: string;
}

export class SentinelPolicyEngine {
    
    // Live cache for the Dashboard to consume
    static latestTelemetry: Record<string, TelemetryPayload> = {};
    
    // Remote Action Queue for the Agent to pick up
    static pendingActions: Record<string, SentinelAction[]> = {};

    /**
     * Enqueue an action for the agent to execute on its next ping.
     */
    static enqueueAction(serverId: string, actionType: string, target: string) {
        if (!this.pendingActions[serverId]) {
            this.pendingActions[serverId] = [];
        }
        const action = { id: Math.random().toString(36).substring(7), type: actionType, target };
        this.pendingActions[serverId].push(action);
        return action;
    }

    /**
     * Dequeue all pending actions for a server (called during telemetry POST).
     */
    static getPendingActions(serverId: string): SentinelAction[] {
        const actions = this.pendingActions[serverId] || [];
        this.pendingActions[serverId] = []; // clear after reading
        return actions;
    }

    /* ---------- operator-configured policies -------------------------------- */

    /** Cached active policies, so a telemetry ping does not hit the database. */
    private static policyCache: { at: number; policies: PolicyLike[] } | null = null;
    /** Why the last load failed, if it did. Surfaced, never swallowed. */
    static policyLoadError = '';
    private static readonly POLICY_TTL_MS = 30_000;

    /** Drop the cache so an edit takes effect on the next ping, not in 30s. */
    static invalidatePolicyCache(): void {
        this.policyCache = null;
    }

    /**
     * The active policies, from cache or the database.
     *
     * A database that cannot be reached does NOT quietly become "no policies":
     * that would silently disarm every rule an operator configured. The reason
     * is recorded on policyLoadError and the last good cache is reused if there
     * is one.
     */
    private static async loadPolicies(): Promise<PolicyLike[]> {
        const now = Date.now();
        if (this.policyCache && now - this.policyCache.at < this.POLICY_TTL_MS) {
            return this.policyCache.policies;
        }
        try {
            const docs = await SentinelPolicyModel.find({ isActive: true }).lean();
            const policies: PolicyLike[] = docs.map((d: any) => ({
                name: d.name, weight: d.weight, conditions: d.conditions,
                severity: d.severity, autoResponse: d.autoResponse,
                autoResponseTargetField: d.autoResponseTargetField, isActive: true,
            })) as any;
            this.policyCache = { at: now, policies };
            this.policyLoadError = '';
            return policies;
        } catch (e: any) {
            this.policyLoadError = String(e?.message || e);
            console.error(`[Sentinel] could not load policies: ${this.policyLoadError}`);
            // Better a stale rule set than a silently empty one.
            return this.policyCache?.policies || [];
        }
    }

    /**
     * Evaluates incoming telemetry against the fixed risk rules below AND the
     * policies an operator has configured in the SentinelPolicy collection.
     *
     * The collection used to be imported and never queried, so a configured
     * policy had no effect whatsoever while the docstring claimed otherwise.
     * Policies are data, never code: see SentinelPolicyEvaluator for the
     * condition language and the reasons it refuses to be anything larger.
     */
    static async evaluate(payload: TelemetryPayload) {
        // Cache the live state
        this.latestTelemetry[payload.serverId] = payload;

        let totalRiskScore = 0;
        const triggeredRules: string[] = [];
        const evidenceCollector: any = {};
        const actionRecommendations: Set<string> = new Set();
        let maxSeverity: 'info' | 'low' | 'medium' | 'high' | 'critical' = 'info';

        const serverId = payload.serverId;

        // 1. Users/SSH Analysis
        if (payload.users && payload.users.length > 0) {
            const unauthorized = payload.users.filter((u: any) => u.user !== 'root' && u.user !== 'joe');
            if (unauthorized.length > 0) {
                totalRiskScore += 70;
                triggeredRules.push('rule_unauthorized_ssh_user');
                actionRecommendations.add(this.canonicalAction('KILL_PROCESS'));
                maxSeverity = 'high';
                evidenceCollector['unauthorized_users'] = unauthorized;
            }
        }

        // 2. Process Analysis
        if (payload.processes && payload.processes.suspiciousFound && payload.processes.suspiciousFound.length > 0) {
            totalRiskScore += 80;
            triggeredRules.push('rule_process_suspicious_binary');
            actionRecommendations.add(this.canonicalAction('KILL_PROCESS'));
            maxSeverity = 'critical';
            evidenceCollector['suspicious_processes'] = payload.processes.suspiciousFound;
        }

        // 3. FIM Analysis
        if (payload.fim && payload.fim.changesDetected && payload.fim.changesDetected.length > 0) {
            const hasSSHChange = payload.fim.changesDetected.some((c: any) => c.path.includes('/ssh/'));
            const hasBinChange = payload.fim.changesDetected.some((c: any) => c.path.includes('/usr/local/bin/'));
            
            if (hasSSHChange) {
                totalRiskScore += 90;
                triggeredRules.push('rule_fim_ssh_tamper');
                maxSeverity = 'critical';
            } else if (hasBinChange) {
                totalRiskScore += 60;
                triggeredRules.push('rule_fim_bin_modification');
                if (maxSeverity !== 'critical') maxSeverity = 'high';
            }
            evidenceCollector['fim_changes'] = payload.fim.changesDetected;
        }

        // 4. Operator-configured policies, evaluated against the same payload.
        //    Their targets are resolved from the policy's own field path rather
        //    than the fixed evidence keys, so a rule can act on anything it can
        //    name in the telemetry.
        const policyTargets: Record<string, string> = {};
        const RANK = ['info', 'low', 'medium', 'high', 'critical'];
        const { matches, invalid } = evaluatePolicies(await this.loadPolicies(), payload);

        for (const m of matches) {
            totalRiskScore += m.weight;
            triggeredRules.push(`policy:${m.name}`);
            if (RANK.indexOf(m.severity) > RANK.indexOf(maxSeverity)) maxSeverity = m.severity;
            for (const [k, v] of Object.entries(m.evidence)) evidenceCollector[`policy.${m.name}.${k}`] = v;

            if (m.autoResponse) {
                // The fixed rules speak KILL_PROCESS and a policy speaks
                // kill_process_tree; without canonicalising, one threat queues
                // the same containment twice under two names.
                const canonical = this.canonicalAction(m.autoResponse);
                actionRecommendations.add(canonical);
                const target = this.policyTarget(payload, m);
                if (target) policyTargets[canonical] = target;
            }
        }
        // A policy that cannot be evaluated is an operator-visible fault, not a
        // silent no-op: it goes into the audit chain so somebody can fix it.
        for (const bad of invalid) {
            evidenceCollector[`policy_invalid.${bad.name}`] = bad.reason;
            await SentinelAuditService.logAction('system', 'POLICY_INVALID', `Policy:${bad.name}`, bad.reason).catch(() => { });
        }
        if (this.policyLoadError) {
            evidenceCollector['policy_load_error'] = this.policyLoadError;
        }

        // Threshold evaluation
        if (totalRiskScore > 0 && triggeredRules.length > 0) {
            const incident = await SentinelIncidentService.triggerIncident(
                serverId,
                `Sentinel Alert: Score ${totalRiskScore}`,
                maxSeverity,
                triggeredRules,
                evidenceCollector,
                Array.from(actionRecommendations)
            );

            for (const action of actionRecommendations) {
                await this.interdict(incident, serverId, action, evidenceCollector, policyTargets[action]);
            }
        }

    }

    /**
     * What a matched policy's automatic action should be aimed at.
     *
     * The target has to come from the element that MATCHED. Reading the target
     * field across the whole array blocks whichever address happens to be first:
     * a rule that matched `users[].from == 'tor-exit'` on an intruder resolved
     * `users[].ip` to root's address and would have blocked the administrator.
     */
    static policyTarget(payload: any, m: { autoResponseTargetField?: string; matchedIndices?: Record<string, number[]> }): string {
        const field = m.autoResponseTargetField;
        if (!field) return '';
        const value = readPath(payload, String(field));

        if (Array.isArray(value) && field.includes('[]')) {
            const root = field.slice(0, field.indexOf('[]'));
            const matched = m.matchedIndices?.[root];
            // Only narrow when the target shares the array the match came from.
            // A rule matching on `processes` cannot index into `users`.
            const candidates = matched?.length ? matched.map(i => value[i]) : value;
            return this.firstScalar(candidates);
        }
        return this.firstScalar(value);
    }

    /** The first usable scalar out of a path result, or ''. */
    private static firstScalar(v: any): string {
        const one = Array.isArray(v) ? v.find(x => x !== undefined && x !== null) : v;
        return one === undefined || one === null || typeof one === 'object' ? '' : String(one);
    }

    /**
     * Carry out one automatic interdiction — for real, on the machine it was
     * meant for, and recorded truthfully.
     *
     * What this replaces was broken in three separate ways, all of which made
     * the audit trail a work of fiction:
     *   - it ran `iptables`/`kill` through the LOCAL shell and ignored the
     *     serverId it was handed, so an interdiction meant for a monitored
     *     server was attempted on Joe's own machine;
     *   - on Windows — the platform this install actually runs on — the command
     *     does not exist, the failure was logged and then DISCARDED, and the
     *     caller carried on as if the threat had been contained;
     *   - nothing was written to the audit chain either way, so there was no
     *     record of whether a containment had happened at all.
     *
     * SentinelActionRunner already does this properly: it opens an SSH session
     * to the server the incident belongs to, records a run with its real exit
     * status, and appends to the chain-hashed audit log. The automatic path now
     * uses it instead of a second, worse copy.
     */
    private static async interdict(
        incident: any, serverId: string, action: string, evidence: any, policyTarget?: string,
    ): Promise<void> {
        // Two vocabularies reach here: the fixed rules speak KILL_PROCESS, and a
        // configured policy speaks the runner's own playbook name (block_ip).
        // Both must resolve, and an action outside the playbook must not.
        const PLAYBOOK: Record<string, string> = {
            KILL_PROCESS: 'kill_process_tree',
            BLOCK_IP: 'block_ip',
            QUARANTINE_FILE: 'quarantine_file',
            kill_process_tree: 'kill_process_tree',
            block_ip: 'block_ip',
            quarantine_file: 'quarantine_file',
        };
        const playbook = PLAYBOOK[action];
        // A policy names where its own target lives; the fixed rules read the
        // evidence keys they populated themselves.
        const target = policyTarget || this.targetFor(action, evidence);

        // An action with no real target is not performed. The previous code sent
        // the literal string "system" as the thing to kill or block, which can
        // only ever fail — and failed silently.
        if (!playbook || !target) {
            await SentinelAuditService.logAction(
                'system',
                `${action}_SKIPPED`,
                `Server:${serverId}`,
                playbook ? 'NO_TARGET_IN_EVIDENCE' : 'NO_PLAYBOOK_FOR_ACTION',
            ).catch(() => { });
            return;
        }

        const shadowMode = process.env.SENTINEL_SHADOW_MODE !== 'false';
        if (shadowMode) {
            // Shadow mode is a real state, not a no-op: record that containment
            // was WITHHELD, so nobody reads the quiet log as "nothing happened".
            await SentinelAuditService.logAction(
                'system', `${action}_WITHHELD`, `${target}@Server:${serverId}`, 'SHADOW_MODE',
            ).catch(() => { });
            return;
        }

        try {
            // executeAction writes its own run record and audit entry with the
            // command's real exit status, and throws when it could not run.
            await SentinelActionRunner.executeAction(
                String(incident?._id || ''), serverId, playbook, { target }, false, 'system',
            );
        } catch (e: any) {
            await SentinelAuditService.logAction(
                'system', `${action}_FAILED`, `${target}@Server:${serverId}`,
                String(e?.message || e).slice(0, 300),
            ).catch(() => { });
        }
    }

    /** Both vocabularies reduced to the runner's playbook name, or '' if it is
     *  not a playbook action at all. */
    static canonicalAction(action: string): string {
        const PLAYBOOK: Record<string, string> = {
            KILL_PROCESS: 'kill_process_tree', kill_process_tree: 'kill_process_tree',
            BLOCK_IP: 'block_ip', block_ip: 'block_ip',
            QUARANTINE_FILE: 'quarantine_file', quarantine_file: 'quarantine_file',
        };
        return PLAYBOOK[action] || '';
    }

    /** The concrete thing an action applies to, taken from the evidence, or ''. */
    static targetFor(action: string, evidence: any): string {
        if (action === 'KILL_PROCESS' || action === 'kill_process_tree') {
            const pid = evidence?.['suspicious_processes']?.[0]?.pid;
            return pid ? String(pid) : '';
        }
        if (action === 'BLOCK_IP' || action === 'block_ip') {
            // An unauthorised SSH session carries the address it came from; the
            // field name differs between agent versions, so accept any of them.
            const u = evidence?.['unauthorized_users']?.[0] || {};
            const ip = u.ip || u.from || u.host || u.source || u.remoteAddress;
            return typeof ip === 'string' && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : '';
        }
        if (action === 'QUARANTINE_FILE' || action === 'quarantine_file') {
            const p = evidence?.['fim_changes']?.[0]?.path;
            return typeof p === 'string' ? p : '';
        }
        return '';
    }
}
