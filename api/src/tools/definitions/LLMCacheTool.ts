import { ToolDefinition } from '../types';
import crypto from 'crypto';

/**
 * LLMCacheTool - Cache for LLM responses
 * Reduces LLM costs by caching responses for identical prompts
 */
export class LLMCacheTool implements ToolDefinition {
    name = 'llm_cache';
    version = '1.0.0';
    description = 'Cache LLM responses to reduce costs and improve speed';
    tags = ['cache', 'llm', 'optimization', 'cost-reduction'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['get', 'set', 'stats', 'clear'],
                description: 'Cache action'
            },
            prompt: {
                type: 'string' as const,
                description: 'LLM prompt (for get/set)'
            },
            response: {
                type: 'string' as const,
                description: 'LLM response (for set)'
            },
            model: {
                type: 'string' as const,
                description: 'Model name (optional, for better cache key)'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            cached: { type: 'boolean' as const },
            response: { type: 'string' as const }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 200;
    auditFields = ['action'];
    mockSupported = false;

    // LLM-specific cache
    private static cache = new Map<string, { response: string; timestamp: number; hits: number }>();
    private static stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        totalSaved: 0, // Estimated tokens saved
        costSaved: 0   // Estimated cost saved ($)
    };

    async execute(input: { action: string; prompt?: string; response?: string; model?: string }) {
        const { action, prompt, response, model } = input;
        const logs: string[] = [];

        try {
            switch (action) {
                case 'get':
                    return this.getCached(prompt!, model, logs);

                case 'set':
                    return this.setCached(prompt!, response!, model, logs);

                case 'stats':
                    return this.getStats(logs);

                case 'clear':
                    return this.clearCache(logs);

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

    private generateCacheKey(prompt: string, model?: string): string {
        const content = model ? `${model}:${prompt}` : prompt;
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    private getCached(prompt: string, model: string | undefined, logs: string[]) {
        const key = this.generateCacheKey(prompt, model);
        const entry = LLMCacheTool.cache.get(key);

        if (!entry) {
            LLMCacheTool.stats.misses++;
            logs.push(`LLM cache miss`);
            return {
                ok: true,
                output: { success: true, cached: false, hit: false },
                logs
            };
        }

        // Update hit count
        entry.hits++;
        LLMCacheTool.stats.hits++;

        // Estimate tokens saved (rough: ~4 chars per token)
        const tokensSaved = Math.ceil(entry.response.length / 4);
        LLMCacheTool.stats.totalSaved += tokensSaved;

        // Estimate cost saved (rough: $0.002 per 1K tokens for GPT-3.5)
        const costSaved = (tokensSaved / 1000) * 0.002;
        LLMCacheTool.stats.costSaved += costSaved;

        logs.push(`LLM cache hit (saved ~${tokensSaved} tokens, ~$${costSaved.toFixed(4)})`);

        return {
            ok: true,
            output: {
                success: true,
                cached: true,
                hit: true,
                response: entry.response,
                hits: entry.hits,
                tokensSaved,
                costSaved: costSaved.toFixed(4)
            },
            logs
        };
    }

    private setCached(prompt: string, response: string, model: string | undefined, logs: string[]) {
        const key = this.generateCacheKey(prompt, model);

        LLMCacheTool.cache.set(key, {
            response,
            timestamp: Date.now(),
            hits: 0
        });

        LLMCacheTool.stats.sets++;
        logs.push(`LLM response cached (${response.length} chars)`);

        return {
            ok: true,
            output: { success: true, cached: true, key: key.substring(0, 8) },
            logs
        };
    }

    private getStats(logs: string[]) {
        const total = LLMCacheTool.stats.hits + LLMCacheTool.stats.misses;
        const hitRate = total > 0 ? (LLMCacheTool.stats.hits / total * 100).toFixed(2) : '0.00';

        const stats = {
            ...LLMCacheTool.stats,
            total,
            hitRate: `${hitRate}%`,
            cacheSize: LLMCacheTool.cache.size,
            estimatedCostSaved: `$${LLMCacheTool.stats.costSaved.toFixed(2)}`
        };

        logs.push(`LLM cache: ${hitRate}% hit rate, $${stats.costSaved.toFixed(2)} saved`);

        return {
            ok: true,
            output: { success: true, stats },
            logs
        };
    }

    private clearCache(logs: string[]) {
        const size = LLMCacheTool.cache.size;
        LLMCacheTool.cache.clear();

        logs.push(`LLM cache cleared: ${size} entries`);

        return {
            ok: true,
            output: { success: true, cleared: size },
            logs
        };
    }

    // Helper method to be used by llm.ts
    static async checkCache(prompt: string, model?: string): Promise<string | null> {
        const tool = new LLMCacheTool();
        const result = await tool.getCached(prompt, model, []);
        return result.output?.response || null;
    }

    static async saveToCache(prompt: string, response: string, model?: string): Promise<void> {
        const tool = new LLMCacheTool();
        await tool.setCached(prompt, response, model, []);
    }
}
