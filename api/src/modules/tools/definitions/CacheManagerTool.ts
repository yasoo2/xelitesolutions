import { ToolDefinition } from '../types';
import crypto from 'crypto';

/**
 * CacheManagerTool - Smart caching system
 * Manages in-memory cache with TTL, statistics, and invalidation
 */
export class CacheManagerTool implements ToolDefinition {
    name = 'cache_manager';
    version = '1.0.0';
    description = 'Manage in-memory cache with TTL, stats, and invalidation';
    tags = ['cache', 'performance', 'optimization'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['get', 'set', 'delete', 'clear', 'stats'],
                description: 'Cache action'
            },
            key: {
                type: 'string' as const,
                description: 'Cache key'
            },
            value: {
                type: 'string' as const,
                description: 'Value to cache (for set action)'
            },
            ttl: {
                type: 'number' as const,
                description: 'Time to live in seconds (default: 3600)'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            value: { type: 'string' as const },
            stats: { type: 'object' as const }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 100;
    auditFields = ['action'];
    mockSupported = false;

    // In-memory cache storage
    private static cache = new Map<string, { value: any; expires: number }>();
    private static stats = {
        hits: 0,
        misses: 0,
        sets: 0,
        deletes: 0,
        clears: 0
    };

    async execute(input: { action: string; key?: string; value?: any; ttl?: number }) {
        const { action, key, value, ttl = 3600 } = input;
        const logs: string[] = [];

        try {
            switch (action) {
                case 'get':
                    return this.get(key!, logs);

                case 'set':
                    return this.set(key!, value, ttl, logs);

                case 'delete':
                    return this.delete(key!, logs);

                case 'clear':
                    return this.clear(logs);

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

    private get(key: string, logs: string[]) {
        const entry = CacheManagerTool.cache.get(key);

        if (!entry) {
            CacheManagerTool.stats.misses++;
            logs.push(`Cache miss: ${key}`);
            return {
                ok: true,
                output: { success: false, hit: false },
                logs
            };
        }

        // Check if expired
        if (Date.now() > entry.expires) {
            CacheManagerTool.cache.delete(key);
            CacheManagerTool.stats.misses++;
            logs.push(`Cache expired: ${key}`);
            return {
                ok: true,
                output: { success: false, hit: false, expired: true },
                logs
            };
        }

        CacheManagerTool.stats.hits++;
        logs.push(`Cache hit: ${key}`);
        return {
            ok: true,
            output: { success: true, hit: true, value: entry.value },
            logs
        };
    }

    private set(key: string, value: any, ttl: number, logs: string[]) {
        const expires = Date.now() + (ttl * 1000);
        CacheManagerTool.cache.set(key, { value, expires });
        CacheManagerTool.stats.sets++;

        logs.push(`Cache set: ${key} (TTL: ${ttl}s)`);
        return {
            ok: true,
            output: { success: true, key, ttl },
            logs
        };
    }

    private delete(key: string, logs: string[]) {
        const deleted = CacheManagerTool.cache.delete(key);
        if (deleted) {
            CacheManagerTool.stats.deletes++;
        }

        logs.push(`Cache delete: ${key} (${deleted ? 'found' : 'not found'})`);
        return {
            ok: true,
            output: { success: deleted },
            logs
        };
    }

    private clear(logs: string[]) {
        const size = CacheManagerTool.cache.size;
        CacheManagerTool.cache.clear();
        CacheManagerTool.stats.clears++;

        logs.push(`Cache cleared: ${size} entries`);
        return {
            ok: true,
            output: { success: true, cleared: size },
            logs
        };
    }

    private getStats(logs: string[]) {
        const total = CacheManagerTool.stats.hits + CacheManagerTool.stats.misses;
        const hitRate = total > 0 ? (CacheManagerTool.stats.hits / total * 100).toFixed(2) : '0.00';

        const stats = {
            ...CacheManagerTool.stats,
            total,
            hitRate: `${hitRate}%`,
            cacheSize: CacheManagerTool.cache.size
        };

        logs.push(`Cache stats: ${hitRate}% hit rate, ${stats.cacheSize} entries`);
        return {
            ok: true,
            output: { success: true, stats },
            logs
        };
    }
}
