import { ToolDefinition } from '../types';

/**
 * MonitoringTool - System monitoring and metrics collection
 * Tracks performance, success rates, and system health
 */
export class MonitoringTool implements ToolDefinition {
    name = 'monitoring';
    version = '1.0.0';
    description = 'Monitor system performance, metrics, and health';
    tags = ['monitoring', 'metrics', 'observability'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['track', 'get_metrics', 'reset'],
                description: 'Monitoring action'
            },
            event: {
                type: 'string' as const,
                description: 'Event name to track'
            },
            value: {
                type: 'number' as const,
                description: 'Metric value'
            },
            metadata: {
                type: 'object' as const,
                description: 'Additional metadata'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            metrics: { type: 'object' as const }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 200;
    auditFields = ['action', 'event'];
    mockSupported = false;

    private static metrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalBuildTime: 0,
        averageBuildTime: 0,
        llmCalls: 0,
        cacheHits: 0,
        cacheMisses: 0,
        toolUsage: {} as Record<string, number>,
        errors: [] as Array<{ timestamp: number; error: string; context: any }>
    };

    async execute(input: { action: string; event?: string; value?: number; metadata?: any }) {
        const { action, event, value, metadata } = input;
        const logs: string[] = [];

        try {
            switch (action) {
                case 'track':
                    return this.trackEvent(event!, value, metadata, logs);

                case 'get_metrics':
                    return this.getMetrics(logs);

                case 'reset':
                    return this.resetMetrics(logs);

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

    private trackEvent(event: string, value: number | undefined, metadata: any, logs: string[]) {
        switch (event) {
            case 'request':
                MonitoringTool.metrics.totalRequests++;
                break;

            case 'success':
                MonitoringTool.metrics.successfulRequests++;
                break;

            case 'failure':
                MonitoringTool.metrics.failedRequests++;
                if (metadata?.error) {
                    MonitoringTool.metrics.errors.push({
                        timestamp: Date.now(),
                        error: metadata.error,
                        context: metadata.context || {}
                    });
                    // Keep only last 100 errors
                    if (MonitoringTool.metrics.errors.length > 100) {
                        MonitoringTool.metrics.errors.shift();
                    }
                }
                break;

            case 'build_time':
                if (value !== undefined) {
                    MonitoringTool.metrics.totalBuildTime += value;
                    const count = MonitoringTool.metrics.successfulRequests || 1;
                    MonitoringTool.metrics.averageBuildTime = MonitoringTool.metrics.totalBuildTime / count;
                }
                break;

            case 'llm_call':
                MonitoringTool.metrics.llmCalls++;
                break;

            case 'cache_hit':
                MonitoringTool.metrics.cacheHits++;
                break;

            case 'cache_miss':
                MonitoringTool.metrics.cacheMisses++;
                break;

            case 'tool_usage':
                if (metadata?.tool) {
                    MonitoringTool.metrics.toolUsage[metadata.tool] =
                        (MonitoringTool.metrics.toolUsage[metadata.tool] || 0) + 1;
                }
                break;
        }

        logs.push(`Tracked: ${event}${value !== undefined ? ` = ${value}` : ''}`);

        return {
            ok: true,
            output: { success: true, event, tracked: true },
            logs
        };
    }

    private getMetrics(logs: string[]) {
        const total = MonitoringTool.metrics.totalRequests;
        const successRate = total > 0
            ? ((MonitoringTool.metrics.successfulRequests / total) * 100).toFixed(2)
            : '0.00';

        const cacheTotal = MonitoringTool.metrics.cacheHits + MonitoringTool.metrics.cacheMisses;
        const cacheHitRate = cacheTotal > 0
            ? ((MonitoringTool.metrics.cacheHits / cacheTotal) * 100).toFixed(2)
            : '0.00';

        const metrics = {
            ...MonitoringTool.metrics,
            successRate: `${successRate}%`,
            cacheHitRate: `${cacheHitRate}%`,
            recentErrors: MonitoringTool.metrics.errors.slice(-10)
        };

        logs.push(`Metrics retrieved: ${successRate}% success rate`);

        return {
            ok: true,
            output: { success: true, metrics },
            logs
        };
    }

    private resetMetrics(logs: string[]) {
        MonitoringTool.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalBuildTime: 0,
            averageBuildTime: 0,
            llmCalls: 0,
            cacheHits: 0,
            cacheMisses: 0,
            toolUsage: {},
            errors: []
        };

        logs.push('Metrics reset');

        return {
            ok: true,
            output: { success: true, reset: true },
            logs
        };
    }
}
