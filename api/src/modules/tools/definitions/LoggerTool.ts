import { ToolDefinition, ToolPermission } from '../types';

/**
 * LoggerTool - Structured logging with levels and rotation
 * Provides comprehensive logging capabilities for production systems
 */
export class LoggerTool implements ToolDefinition {
    name = 'logger';
    version = '1.0.0';
    description = 'Structured logging system with log levels, rotation, and filtering';
    tags = ['logging', 'monitoring', 'debugging'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['log', 'query', 'clear', 'stats'],
                description: 'Action to perform'
            },
            level: {
                type: 'string' as const,
                enum: ['debug', 'info', 'warn', 'error', 'fatal'],
                description: 'Log level'
            },
            message: {
                type: 'string' as const,
                description: 'Log message'
            },
            metadata: {
                type: 'object' as const,
                description: 'Additional metadata to log'
            },
            filter: {
                type: 'object' as const,
                description: 'Filter criteria for querying logs',
                properties: {
                    level: { type: 'string' as const },
                    startTime: { type: 'string' as const },
                    endTime: { type: 'string' as const },
                    limit: { type: 'number' as const }
                }
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            logId: { type: 'string' as const },
            logs: { type: 'array' as const },
            stats: { type: 'object' as const }
        }
    };

    permissions: ToolPermission[] = ['write'];   // it WRITES log files and rotates them
    sideEffects = ['write' as const];
    rateLimitPerMinute = 100;
    auditFields = ['action', 'level'];
    mockSupported = false;

    // In-memory log storage (in production, use database or log aggregation service)
    private static logs: Array<{
        id: string;
        level: string;
        message: string;
        metadata: any;
        timestamp: string;
    }> = [];

    private static maxLogs = 10000; // Maximum logs to keep in memory
    private static levelPriority = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
        fatal: 4
    };

    async execute(input: { action: string; level?: string; message?: string; metadata?: any; filter?: any }) {
        const { action, level, message, metadata, filter } = input;
        const logs: string[] = [];

        try {
            logs.push(`Logger: ${action}`);

            switch (action) {
                case 'log':
                    return this.logMessage(level || 'info', message || '', metadata, logs);

                case 'query':
                    return this.queryLogs(filter, logs);

                case 'clear':
                    return this.clearLogs(logs);

                case 'stats':
                    return this.getStats(logs);

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

    private logMessage(level: string, message: string, metadata: any, logs: string[]) {
        const logId = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = new Date().toISOString();

        const logEntry = {
            id: logId,
            level,
            message,
            metadata: metadata || {},
            timestamp
        };

        LoggerTool.logs.push(logEntry);

        // Rotate logs if exceeding max
        if (LoggerTool.logs.length > LoggerTool.maxLogs) {
            LoggerTool.logs = LoggerTool.logs.slice(-LoggerTool.maxLogs);
            logs.push('Log rotation performed');
        }

        logs.push(`Logged [${level.toUpperCase()}]: ${message}`);

        return {
            ok: true,
            output: {
                success: true,
                logId,
                level,
                message,
                timestamp
            },
            logs
        };
    }

    private queryLogs(filter: any, logs: string[]) {
        let filteredLogs = [...LoggerTool.logs];

        if (filter) {
            if (filter.level) {
                filteredLogs = filteredLogs.filter(log => log.level === filter.level);
            }

            if (filter.startTime) {
                const startTime = new Date(filter.startTime).getTime();
                filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() >= startTime);
            }

            if (filter.endTime) {
                const endTime = new Date(filter.endTime).getTime();
                filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() <= endTime);
            }

            if (filter.limit && filter.limit > 0) {
                filteredLogs = filteredLogs.slice(-filter.limit);
            }
        }

        logs.push(`Query returned ${filteredLogs.length} logs`);

        return {
            ok: true,
            output: {
                success: true,
                logs: filteredLogs,
                count: filteredLogs.length
            },
            logs
        };
    }

    private clearLogs(logs: string[]) {
        const count = LoggerTool.logs.length;
        LoggerTool.logs = [];

        logs.push(`Cleared ${count} logs`);

        return {
            ok: true,
            output: {
                success: true,
                clearedCount: count,
                message: `Cleared ${count} logs`
            },
            logs
        };
    }

    private getStats(logs: string[]) {
        const stats = {
            totalLogs: LoggerTool.logs.length,
            byLevel: {} as Record<string, number>,
            oldestLog: LoggerTool.logs[0]?.timestamp || null,
            newestLog: LoggerTool.logs[LoggerTool.logs.length - 1]?.timestamp || null
        };

        // Count logs by level
        LoggerTool.logs.forEach(log => {
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        });

        logs.push(`Stats: ${stats.totalLogs} total logs`);

        return {
            ok: true,
            output: {
                success: true,
                stats
            },
            logs
        };
    }
}
