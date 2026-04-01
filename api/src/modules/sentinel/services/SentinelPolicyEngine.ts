import { SentinelIncidentService } from './SentinelIncidentService';
import { SentinelPolicyModel } from '../../../shared/models/SentinelPolicy';
import { Types } from 'mongoose';

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
     * Evaluates incoming telemetry against Risk Thresholds and dynamic Policies.
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

        const serverId = new Types.ObjectId(payload.serverId);

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
            await SentinelIncidentService.triggerIncident(
                serverId,
                `Sentinel Alert: Score ${totalRiskScore}`,
                maxSeverity,
                triggeredRules,
                evidenceCollector,
                Array.from(actionRecommendations)
            );
        }
        
    }
}
