import { ToolDefinition } from '../types';

/**
 * RetryManagerTool - Intelligent retry logic with exponential backoff
 * Provides resilient operation retry capabilities
 */
export class RetryManagerTool implements ToolDefinition {
    name = 'retry_manager';
    version = '1.0.0';
    description = 'Manage retries with exponential backoff and success tracking';
    tags = ['retry', 'resilience', 'error-handling'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['configure', 'execute', 'stats'],
                description: 'Action to perform'
            },
            operationId: {
                type: 'string' as const,
                description: 'Operation identifier'
            },
            maxAttempts: {
                type: 'number' as const,
                description: 'Maximum retry attempts (default: 3)'
            },
            initialDelay: {
                type: 'number' as const,
                description: 'Initial delay in ms (default: 1000)'
            },
            maxDelay: {
                type: 'number' as const,
                description: 'Maximum delay in ms (default: 30000)'
            },
            backoffMultiplier: {
                type: 'number' as const,
                description: 'Backoff multiplier (default: 2)'
            },
            operation: {
                type: 'object' as const,
                description: 'Operation to retry',
                properties: {
                    type: { type: 'string' as const },
                    params: { type: 'object' as const }
                }
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            attempts: { type: 'number' as const },
            result: { type: 'object' as const },
            stats: { type: 'object' as const }
        }
    };

    permissions = [];
    sideEffects = ['execute' as const];
    rateLimitPerMinute = 30;
    auditFields = ['action', 'operationId'];
    mockSupported = false;

    // In-memory retry configuration and stats
    private static configs = new Map<string, {
        maxAttempts: number;
        initialDelay: number;
        maxDelay: number;
        backoffMultiplier: number;
    }>();

    private static stats = new Map<string, {
        totalAttempts: number;
        successfulRetries: number;
        failedRetries: number;
        averageAttempts: number;
    }>();

    async execute(input: { action: string; operationId?: string; maxAttempts?: number; initialDelay?: number; maxDelay?: number; backoffMultiplier?: number; operation?: any }) {
        const { action, operationId, maxAttempts, initialDelay, maxDelay, backoffMultiplier, operation } = input;
        const logs: string[] = [];

        try {
            logs.push(`RetryManager: ${action}`);

            switch (action) {
                case 'configure':
                    return this.configureRetry(operationId || 'default', maxAttempts, initialDelay, maxDelay, backoffMultiplier, logs);

                case 'execute':
                    return this.executeWithRetry(operationId || 'default', operation, logs);

                case 'stats':
                    return this.getStats(operationId, logs);

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

    private configureRetry(operationId: string, maxAttempts: number | undefined, initialDelay: number | undefined, maxDelay: number | undefined, backoffMultiplier: number | undefined, logs: string[]) {
        const config = {
            maxAttempts: maxAttempts || 3,
            initialDelay: initialDelay || 1000,
            maxDelay: maxDelay || 30000,
            backoffMultiplier: backoffMultiplier || 2
        };

        RetryManagerTool.configs.set(operationId, config);

        logs.push(`Configured retry for ${operationId}: ${config.maxAttempts} attempts, ${config.initialDelay}ms initial delay`);

        return {
            ok: true,
            output: {
                success: true,
                operationId,
                config,
                message: `Retry configuration set for ${operationId}`
            },
            logs
        };
    }

    private async executeWithRetry(operationId: string, operation: any, logs: string[]) {
        const config = RetryManagerTool.configs.get(operationId) || {
            maxAttempts: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2
        };

        let attempts = 0;
        let lastError: any = null;
        let delay = config.initialDelay;

        while (attempts < config.maxAttempts) {
            attempts++;
            logs.push(`Attempt ${attempts}/${config.maxAttempts}`);

            try {
                // Simulate operation execution
                // In production, this would call the actual operation
                const result = await this.simulateOperation(operation);

                // Update stats
                this.updateStats(operationId, attempts, true);

                logs.push(`Operation succeeded on attempt ${attempts}`);

                return {
                    ok: true,
                    output: {
                        success: true,
                        attempts,
                        result,
                        message: `Operation succeeded after ${attempts} attempt(s)`
                    },
                    logs
                };

            } catch (error: any) {
                lastError = error;
                logs.push(`Attempt ${attempts} failed: ${error.message}`);

                if (attempts < config.maxAttempts) {
                    logs.push(`Waiting ${delay}ms before retry...`);
                    await this.sleep(delay);
                    delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
                }
            }
        }

        // All attempts failed
        this.updateStats(operationId, attempts, false);

        logs.push(`All ${attempts} attempts failed`);

        return {
            ok: false,
            error: `Operation failed after ${attempts} attempts: ${lastError?.message || 'Unknown error'}`,
            output: {
                success: false,
                attempts,
                lastError: lastError?.message
            },
            logs
        };
    }

    private async simulateOperation(operation: any): Promise<any> {
        // Simulate operation with 70% success rate
        const random = Math.random();
        if (random > 0.7) {
            throw new Error('Simulated operation failure');
        }

        return {
            status: 'success',
            data: operation?.params || {},
            timestamp: new Date().toISOString()
        };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private updateStats(operationId: string, attempts: number, success: boolean) {
        const stats = RetryManagerTool.stats.get(operationId) || {
            totalAttempts: 0,
            successfulRetries: 0,
            failedRetries: 0,
            averageAttempts: 0
        };

        stats.totalAttempts += attempts;
        if (success) {
            stats.successfulRetries++;
        } else {
            stats.failedRetries++;
        }

        const totalOperations = stats.successfulRetries + stats.failedRetries;
        stats.averageAttempts = stats.totalAttempts / totalOperations;

        RetryManagerTool.stats.set(operationId, stats);
    }

    private getStats(operationId: string | undefined, logs: string[]) {
        if (operationId) {
            const stats = RetryManagerTool.stats.get(operationId);
            if (!stats) {
                throw new Error(`No stats found for operation ${operationId}`);
            }

            logs.push(`Retrieved stats for ${operationId}`);

            return {
                ok: true,
                output: {
                    success: true,
                    operationId,
                    stats
                },
                logs
            };
        }

        // Return all stats
        const allStats = Object.fromEntries(RetryManagerTool.stats);

        logs.push(`Retrieved stats for ${Object.keys(allStats).length} operations`);

        return {
            ok: true,
            output: {
                success: true,
                stats: allStats
            },
            logs
        };
    }
}
