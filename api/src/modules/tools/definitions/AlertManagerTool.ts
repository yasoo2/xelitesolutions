import { ToolDefinition } from '../types';

/**
 * AlertManagerTool - Alert management with conditions and notifications
 * Provides alerting capabilities for production monitoring
 */
export class AlertManagerTool implements ToolDefinition {
    name = 'alert_manager';
    version = '1.0.0';
    description = 'Manage alerts with conditions, notifications, and history tracking';
    tags = ['alerts', 'monitoring', 'notifications'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['create', 'trigger', 'resolve', 'list', 'history'],
                description: 'Action to perform'
            },
            alertId: {
                type: 'string' as const,
                description: 'Alert identifier'
            },
            name: {
                type: 'string' as const,
                description: 'Alert name'
            },
            condition: {
                type: 'object' as const,
                description: 'Alert condition',
                properties: {
                    metric: { type: 'string' as const },
                    operator: { type: 'string' as const },
                    threshold: { type: 'number' as const }
                }
            },
            severity: {
                type: 'string' as const,
                enum: ['low', 'medium', 'high', 'critical'],
                description: 'Alert severity'
            },
            message: {
                type: 'string' as const,
                description: 'Alert message'
            },
            metadata: {
                type: 'object' as const,
                description: 'Additional alert metadata'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            alertId: { type: 'string' as const },
            alerts: { type: 'array' as const },
            history: { type: 'array' as const }
        }
    };

    permissions = [];
    sideEffects = ['write' as const];
    rateLimitPerMinute = 60;
    auditFields = ['action', 'alertId', 'severity'];
    mockSupported = false;

    // In-memory alert storage
    private static alerts = new Map<string, {
        id: string;
        name: string;
        condition: any;
        severity: string;
        status: 'active' | 'triggered' | 'resolved';
        createdAt: string;
        triggeredAt?: string;
        resolvedAt?: string;
    }>();

    private static history: Array<{
        alertId: string;
        action: string;
        timestamp: string;
        message: string;
        metadata: any;
    }> = [];

    async execute(input: { action: string; alertId?: string; name?: string; condition?: any; severity?: string; message?: string; metadata?: any }) {
        const { action, alertId, name, condition, severity, message, metadata } = input;
        const logs: string[] = [];

        try {
            logs.push(`AlertManager: ${action}`);

            switch (action) {
                case 'create':
                    return this.createAlert(name || '', condition, severity || 'medium', logs);

                case 'trigger':
                    return this.triggerAlert(alertId || '', message || '', metadata, logs);

                case 'resolve':
                    return this.resolveAlert(alertId || '', message || '', logs);

                case 'list':
                    return this.listAlerts(logs);

                case 'history':
                    return this.getHistory(alertId, logs);

                default:
                    throw new Error(`Unknown action: ${action}`);
            }

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }

    private createAlert(name: string, condition: any, severity: string, logs: string[]) {
        const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();

        const alert = {
            id: alertId,
            name,
            condition: condition || {},
            severity,
            status: 'active' as const,
            createdAt: timestamp
        };

        AlertManagerTool.alerts.set(alertId, alert);

        // Add to history
        AlertManagerTool.history.push({
            alertId,
            action: 'created',
            timestamp,
            message: `Alert "${name}" created`,
            metadata: { severity, condition }
        });

        logs.push(`Alert created: ${name} (${severity})`);

        return {
            ok: true,
            output: {
                success: true,
                alertId,
                alert,
                message: `Alert "${name}" created successfully`
            },
            logs
        };
    }

    private triggerAlert(alertId: string, message: string, metadata: any, logs: string[]) {
        const alert = AlertManagerTool.alerts.get(alertId);

        if (!alert) {
            throw new Error(`Alert ${alertId} not found`);
        }

        const timestamp = new Date().toISOString();
        alert.status = 'triggered';
        alert.triggeredAt = timestamp;

        AlertManagerTool.alerts.set(alertId, alert);

        // Add to history
        AlertManagerTool.history.push({
            alertId,
            action: 'triggered',
            timestamp,
            message: message || `Alert "${alert.name}" triggered`,
            metadata: metadata || {}
        });

        logs.push(`Alert triggered: ${alert.name}`);

        return {
            ok: true,
            output: {
                success: true,
                alertId,
                alert,
                message: `Alert "${alert.name}" triggered`,
                severity: alert.severity
            },
            logs
        };
    }

    private resolveAlert(alertId: string, message: string, logs: string[]) {
        const alert = AlertManagerTool.alerts.get(alertId);

        if (!alert) {
            throw new Error(`Alert ${alertId} not found`);
        }

        const timestamp = new Date().toISOString();
        alert.status = 'resolved';
        alert.resolvedAt = timestamp;

        AlertManagerTool.alerts.set(alertId, alert);

        // Add to history
        AlertManagerTool.history.push({
            alertId,
            action: 'resolved',
            timestamp,
            message: message || `Alert "${alert.name}" resolved`,
            metadata: {}
        });

        logs.push(`Alert resolved: ${alert.name}`);

        return {
            ok: true,
            output: {
                success: true,
                alertId,
                alert,
                message: `Alert "${alert.name}" resolved`
            },
            logs
        };
    }

    private listAlerts(logs: string[]) {
        const alerts = Array.from(AlertManagerTool.alerts.values());

        const summary = {
            total: alerts.length,
            active: alerts.filter(a => a.status === 'active').length,
            triggered: alerts.filter(a => a.status === 'triggered').length,
            resolved: alerts.filter(a => a.status === 'resolved').length
        };

        logs.push(`Listed ${alerts.length} alerts`);

        return {
            ok: true,
            output: {
                success: true,
                alerts,
                summary
            },
            logs
        };
    }

    private getHistory(alertId: string | undefined, logs: string[]) {
        let history = [...AlertManagerTool.history];

        if (alertId) {
            history = history.filter(h => h.alertId === alertId);
        }

        logs.push(`Retrieved ${history.length} history entries`);

        return {
            ok: true,
            output: {
                success: true,
                history,
                count: history.length
            },
            logs
        };
    }
}
