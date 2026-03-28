import { ToolDefinition } from '../types';

/**
 * FallbackTool - Graceful degradation with alternative strategies
 * Provides fallback mechanisms when primary operations fail
 */
export class FallbackTool implements ToolDefinition {
    name = 'fallback';
    version = '1.0.0';
    description = 'Manage fallback strategies and graceful degradation';
    tags = ['fallback', 'resilience', 'degradation'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['register', 'execute', 'list'],
                description: 'Action to perform'
            },
            strategyId: {
                type: 'string' as const,
                description: 'Strategy identifier'
            },
            primary: {
                type: 'object' as const,
                description: 'Primary operation',
                properties: {
                    tool: { type: 'string' as const },
                    params: { type: 'object' as const }
                }
            },
            fallbacks: {
                type: 'array' as const,
                description: 'Fallback operations in priority order',
                items: {
                    type: 'object' as const,
                    properties: {
                        tool: { type: 'string' as const },
                        params: { type: 'object' as const },
                        condition: { type: 'string' as const }
                    }
                }
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            strategyId: { type: 'string' as const },
            result: { type: 'object' as const },
            usedFallback: { type: 'boolean' as const },
            strategies: { type: 'array' as const }
        }
    };

    permissions = [];
    sideEffects = ['execute' as const];
    rateLimitPerMinute = 30;
    auditFields = ['action', 'strategyId'];
    mockSupported = false;

    // In-memory strategy storage
    private static strategies = new Map<string, {
        id: string;
        primary: any;
        fallbacks: any[];
        createdAt: string;
        executionCount: number;
        fallbackUsageCount: number;
    }>();

    async execute(input: { action: string; strategyId?: string; primary?: any; fallbacks?: any[] }) {
        const { action, strategyId, primary, fallbacks } = input;
        const logs: string[] = [];

        try {
            logs.push(`Fallback: ${action}`);

            switch (action) {
                case 'register':
                    return this.registerStrategy(strategyId || '', primary, fallbacks || [], logs);

                case 'execute':
                    return this.executeStrategy(strategyId || '', logs);

                case 'list':
                    return this.listStrategies(logs);

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

    private registerStrategy(strategyId: string, primary: any, fallbacks: any[], logs: string[]) {
        if (!strategyId) {
            strategyId = `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        const strategy = {
            id: strategyId,
            primary: primary || {},
            fallbacks: fallbacks || [],
            createdAt: new Date().toISOString(),
            executionCount: 0,
            fallbackUsageCount: 0
        };

        FallbackTool.strategies.set(strategyId, strategy);

        logs.push(`Registered strategy ${strategyId} with ${fallbacks.length} fallback(s)`);

        return {
            ok: true,
            output: {
                success: true,
                strategyId,
                strategy,
                message: `Strategy registered with ${fallbacks.length} fallback option(s)`
            },
            logs
        };
    }

    private async executeStrategy(strategyId: string, logs: string[]) {
        const strategy = FallbackTool.strategies.get(strategyId);

        if (!strategy) {
            throw new Error(`Strategy ${strategyId} not found`);
        }

        strategy.executionCount++;
        let usedFallback = false;
        let result: any = null;

        // Try primary operation
        logs.push(`Attempting primary operation: ${strategy.primary.tool || 'unknown'}`);

        try {
            result = await this.simulateOperation(strategy.primary);
            logs.push('Primary operation succeeded');

        } catch (primaryError: any) {
            logs.push(`Primary operation failed: ${primaryError.message}`);
            usedFallback = true;
            strategy.fallbackUsageCount++;

            // Try fallbacks in order
            for (let i = 0; i < strategy.fallbacks.length; i++) {
                const fallback = strategy.fallbacks[i];
                logs.push(`Attempting fallback ${i + 1}/${strategy.fallbacks.length}: ${fallback.tool || 'unknown'}`);

                try {
                    result = await this.simulateOperation(fallback);
                    logs.push(`Fallback ${i + 1} succeeded`);
                    break;

                } catch (fallbackError: any) {
                    logs.push(`Fallback ${i + 1} failed: ${fallbackError.message}`);

                    if (i === strategy.fallbacks.length - 1) {
                        // All fallbacks failed
                        throw new Error('All fallback strategies failed');
                    }
                }
            }
        }

        FallbackTool.strategies.set(strategyId, strategy);

        return {
            ok: true,
            output: {
                success: true,
                strategyId,
                result,
                usedFallback,
                executionStats: {
                    totalExecutions: strategy.executionCount,
                    fallbackUsageCount: strategy.fallbackUsageCount,
                    fallbackRate: (strategy.fallbackUsageCount / strategy.executionCount * 100).toFixed(2) + '%'
                }
            },
            logs
        };
    }

    private async simulateOperation(operation: any): Promise<any> {
        // Simulate operation with 60% success rate
        const random = Math.random();
        if (random > 0.6) {
            throw new Error('Simulated operation failure');
        }

        return {
            status: 'success',
            tool: operation.tool,
            data: operation.params || {},
            timestamp: new Date().toISOString()
        };
    }

    private listStrategies(logs: string[]) {
        const strategies = Array.from(FallbackTool.strategies.values());

        const summary = {
            total: strategies.length,
            totalExecutions: strategies.reduce((sum, s) => sum + s.executionCount, 0),
            totalFallbackUsage: strategies.reduce((sum, s) => sum + s.fallbackUsageCount, 0)
        };

        logs.push(`Listed ${strategies.length} strategies`);

        return {
            ok: true,
            output: {
                success: true,
                strategies,
                summary
            },
            logs
        };
    }
}
