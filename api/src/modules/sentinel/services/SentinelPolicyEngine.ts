import { SentinelIncidentService } from './SentinelIncidentService';
import { SentinelActionRunner } from './SentinelActionRunner';
import { SentinelAuditService } from './SentinelAuditService';

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

    /**
     * Evaluates incoming telemetry against the fixed risk rules below.
     *
     * It does NOT read the SentinelPolicy collection: this used to claim it
     * evaluated "dynamic Policies" while importing the model and never querying
     * it, so a policy an operator had configured had no effect whatsoever. The
     * claim is removed rather than left standing; wiring the collection in is a
     * separate piece of work, and until then nobody should believe otherwise.
     * Computes a total Risk Score and dispatches incidents.
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
                actionRecommendations.add('KILL_PROCESS'); // Kill all procs for user or Block IP
                maxSeverity = 'high';
                evidenceCollector['unauthorized_users'] = unauthorized;
            }
        }

        // 2. Process Analysis
        if (payload.processes && payload.processes.suspiciousFound && payload.processes.suspiciousFound.length > 0) {
            totalRiskScore += 80;
            triggeredRules.push('rule_process_suspicious_binary');
            actionRecommendations.add('KILL_PROCESS');
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
                await this.interdict(incident, serverId, action, evidenceCollector);
            }
        }

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
    private static async interdict(incident: any, serverId: string, action: string, evidence: any): Promise<void> {
        // The engine's vocabulary is not the runner's playbook vocabulary.
        const PLAYBOOK: Record<string, string> = {
            KILL_PROCESS: 'kill_process_tree',
            BLOCK_IP: 'block_ip',
            QUARANTINE_FILE: 'quarantine_file',
        };
        const playbook = PLAYBOOK[action];
        const target = this.targetFor(action, evidence);

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

    /** The concrete thing an action applies to, taken from the evidence, or ''. */
    private static targetFor(action: string, evidence: any): string {
        if (action === 'KILL_PROCESS') {
            const pid = evidence?.['suspicious_processes']?.[0]?.pid;
            return pid ? String(pid) : '';
        }
        if (action === 'BLOCK_IP') {
            // An unauthorised SSH session carries the address it came from; the
            // field name differs between agent versions, so accept any of them.
            const u = evidence?.['unauthorized_users']?.[0] || {};
            const ip = u.ip || u.from || u.host || u.source || u.remoteAddress;
            return typeof ip === 'string' && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : '';
        }
        if (action === 'QUARANTINE_FILE') {
            const p = evidence?.['fim_changes']?.[0]?.path;
            return typeof p === 'string' ? p : '';
        }
        return '';
    }
}
