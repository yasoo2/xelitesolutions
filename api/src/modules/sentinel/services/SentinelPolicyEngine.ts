import { SentinelIncidentService } from './SentinelIncidentService';
import { SentinelPolicyModel } from '../../../shared/models/SentinelPolicy';
import { Types } from 'mongoose';

interface TelemetryPayload {
    serverId: string;
    metrics: any;
    processes: any;
    fim: any;
    network: any;
}

export class SentinelPolicyEngine {
    
    /**
     * Evaluates incoming telemetry against Risk Thresholds and dynamic Policies.
     * Computes a total Risk Score and dispatches incidents.
     */
    static async evaluate(payload: TelemetryPayload) {
        // Find existing custom policies (if any) or use built-in hardcoded fallbacks
        const customPolicies = await SentinelPolicyModel.find({ isActive: true });
        
        let totalRiskScore = 0;
        const triggeredRules: string[] = [];
        const evidenceCollector: any = {};
        const actionRecommendations: Set<string> = new Set();
        let maxSeverity: 'info' | 'low' | 'medium' | 'high' | 'critical' = 'info';

        const serverId = new Types.ObjectId(payload.serverId);

        // 1. Process Analysis (Hardcoded Core Rules for V1)
        if (payload.processes && payload.processes.suspiciousFound && payload.processes.suspiciousFound.length > 0) {
            totalRiskScore += 80;
            triggeredRules.push('rule_process_suspicious_binary');
            actionRecommendations.add('kill_process_tree');
            actionRecommendations.add('quarantine_file');
            maxSeverity = 'critical';
            evidenceCollector['suspicious_processes'] = payload.processes.suspiciousFound;
        }

        // 2. FIM Analysis
        if (payload.fim && payload.fim.changesDetected && payload.fim.changesDetected.length > 0) {
            const hasSSHChange = payload.fim.changesDetected.some((c: any) => c.path.includes('/ssh/'));
            const hasBinChange = payload.fim.changesDetected.some((c: any) => c.path.includes('/usr/local/bin/'));
            
            if (hasSSHChange) {
                totalRiskScore += 90;
                triggeredRules.push('rule_fim_ssh_tamper');
                actionRecommendations.add('revert_ssh_keys');
                maxSeverity = 'critical';
            } else if (hasBinChange) {
                totalRiskScore += 60;
                triggeredRules.push('rule_fim_bin_modification');
                actionRecommendations.add('quarantine_file');
                if (maxSeverity !== 'critical') maxSeverity = 'high';
            } else {
                totalRiskScore += 30;
                triggeredRules.push('rule_fim_general_change');
                if (maxSeverity === 'info') maxSeverity = 'medium';
            }
            evidenceCollector['fim_changes'] = payload.fim.changesDetected;
        }

        // 3. System Load Analysis
        if (payload.metrics && payload.metrics.cpu) {
            const loadPerc = (payload.metrics.cpu.load1m / payload.metrics.cpu.cores);
            if (loadPerc > 1.5) { // 150% load indicates heavy CPU stress
                totalRiskScore += 40;
                triggeredRules.push('rule_cpu_spike');
                if (maxSeverity === 'info') maxSeverity = 'medium';
                evidenceCollector['cpu_load'] = payload.metrics.cpu.load1m;
            }
        }

        // Threshold evaluation
        if (totalRiskScore >= 50 && triggeredRules.length > 0) {
            // High/Critical Incident
            await SentinelIncidentService.triggerIncident(
                serverId,
                `High Risk Detected: Score ${totalRiskScore}`,
                maxSeverity,
                triggeredRules,
                evidenceCollector,
                Array.from(actionRecommendations)
            );
        } else if (totalRiskScore > 0 && totalRiskScore < 50 && triggeredRules.length > 0) {
            // Medium/Low/Info Incident
            await SentinelIncidentService.triggerIncident(
                serverId,
                `Suspicious Activity: Score ${totalRiskScore}`,
                maxSeverity,
                triggeredRules,
                evidenceCollector,
                Array.from(actionRecommendations)
            );
        }
        
    }
}
