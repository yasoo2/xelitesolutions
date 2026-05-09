import { SentinelIncidentModel, SentinelIncidentDocument } from '../../../shared/models/SentinelIncident';
import { SentinelAuditService } from './SentinelAuditService';
import { Types } from 'mongoose';

export class SentinelIncidentService {
    /**
     * Creates a new incident or updates an existing open one if the same rule triggers for the same server.
     */
    static async triggerIncident(
        serverId: any,
        title: string,
        severity: 'info' | 'low' | 'medium' | 'high' | 'critical',
        rules: string[],
        evidence: any,
        recommendedActions: string[]
    ): Promise<SentinelIncidentDocument> {
        
        // Find if there's an existing OPEN incident for this specific primary rule on this server
        const existingIncident = await SentinelIncidentModel.findOne({
            serverId,
            status: 'open',
            detectingRules: { $in: rules }
        });

        if (existingIncident) {
            // Update evidence (append or replace)
            existingIncident.evidence = { ...existingIncident.evidence, ...evidence, lastSeen: new Date() };
            
            // Escalate severity if incoming is higher
            const severities = ['info', 'low', 'medium', 'high', 'critical'];
            if (severities.indexOf(severity) > severities.indexOf(existingIncident.severity)) {
                existingIncident.severity = severity;
            }

            // Merge recommended actions without duplicates
            const newActions = new Set([...existingIncident.recommendedActions, ...recommendedActions]);
            existingIncident.recommendedActions = Array.from(newActions);
            
            await existingIncident.save();
            return existingIncident;
        }

        // Create new incident
        const newIncident = await SentinelIncidentModel.create({
            title,
            severity,
            serverId,
            detectingRules: rules,
            evidence,
            recommendedActions
        });

        await SentinelAuditService.logAction(
            'system',
            'INCIDENT_CREATED',
            `Incident:${newIncident._id}`,
            `Severity:${severity}|Rules:${rules.join(',')}`
        );

        return newIncident;
    }

    static async updateIncidentStatus(incidentId: string, status: 'acknowledged' | 'contained' | 'resolved' | 'false_positive', actor: string) {
        const incident = await SentinelIncidentModel.findByIdAndUpdate(incidentId, { status }, { new: true });
        if (incident) {
            await SentinelAuditService.logAction(
                actor,
                `INCIDENT_${status.toUpperCase()}`,
                `Incident:${incident._id}`,
                'success'
            );
        }
        return incident;
    }
}
