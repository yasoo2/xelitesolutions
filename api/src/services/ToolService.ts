
import { tools } from '../tools/registry';
import { ToolDefinition } from '../tools/types';
import { redactSecretsFromString } from '../utils/redaction';

// Rate Limiting Logic (Ported)
const toolRateBuckets = new Map<string, { minute: number; count: number }>();

function rateLimitBucketKey(name: string, input: any) {
    if (name === 'browser_run' || name === 'browser_open' || name === 'visual_qa') {
        return `${name}:${input?.sessionId || 'global'}`;
    }
    return name;
}

function checkToolRateLimit(bucketKey: string, limitPerMinute?: number): { allowed: boolean; retryAfterMs?: number } {
    if (!limitPerMinute || limitPerMinute <= 0) return { allowed: true };
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const bucket = toolRateBuckets.get(bucketKey);

    if (bucket && bucket.minute === minute) {
        if (bucket.count >= limitPerMinute) {
            return { allowed: false, retryAfterMs: (minute + 1) * 60000 - now };
        }
        bucket.count++;
    } else {
        toolRateBuckets.set(bucketKey, { minute, count: 1 });
    }
    return { allowed: true };
}

export interface ToolContext {
    sessionId?: string;
}

export async function executeTool(name: string, input: any, context?: ToolContext) {
    const logs: string[] = [];
    const t0 = Date.now();
    let effectiveName = name;
    let effectiveInput = { ...input };

    // --- Aliasing & Compatibility Layer ---
    const contextSessionId = context?.sessionId;

    if (name === 'browser_open') {
        effectiveName = 'browser_run';
        const url = effectiveInput.url || effectiveInput.input || '';
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (url) {
            effectiveInput.actions.unshift({ type: 'goto', url });
        } else if (effectiveInput.actions.length === 0) {
            effectiveInput.actions.push({ type: 'goto', url: 'https://www.google.com' });
        }
    }
    if (name === 'browser_get_state') {
        effectiveName = 'browser_run';
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (effectiveInput.actions.length === 0) {
            effectiveInput.actions.push({ type: 'ui_audit' });
        }
    }
    if (name === 'browser_snapshot') {
        effectiveName = 'browser_run';
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (effectiveInput.actions.length === 0) {
            effectiveInput.actions.push({ type: 'ui_audit' });
        }
    }
    if (name === 'web_search') {
        effectiveName = 'browser_run';
        const query = effectiveInput.query || effectiveInput.q || effectiveInput.input || '';
        if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
        if (query) {
            effectiveInput.actions.unshift({ type: 'goto', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
            effectiveInput.actions.push({ type: 'wait', ms: 2000 });
        } else {
            effectiveInput.actions.push({ type: 'goto', url: 'https://www.google.com' });
        }
    }

    // Universal Session Injection
    if ((effectiveName === 'browser_run' || effectiveName === 'visual_qa' || effectiveName === 'codebase_navigator') && !effectiveInput.sessionId && contextSessionId) {
        effectiveInput.sessionId = contextSessionId;
    }

    logs.push(`[${new Date().toISOString()}] start ${effectiveName} (orig=${name})`);

    try {
        const tDef = tools.find(t => t.name === effectiveName);
        if (!tDef) {
            return { ok: false, error: 'unknown_tool', logs };
        }

        // Rate Limit Check
        const bucketKey = rateLimitBucketKey(effectiveName, effectiveInput);
        const rl = checkToolRateLimit(bucketKey, tDef.rateLimitPerMinute);
        if (!rl.allowed) {
            logs.push(`rate_limited=1 bucket=${bucketKey} retry_after_ms=${rl.retryAfterMs}`);
            return { ok: false, error: 'rate_limited', output: { retryAfterMs: rl.retryAfterMs }, logs };
        }

        // Execute
        // Genesis Wrapper Special Case Handling to avoid circular dependency issues in registry
        // If we want to move the Genesis wrapper logic HERE instead of in registry, we can.
        // But for now, we assume tDef has the handler.

        if (typeof (tDef as any).execute === 'function') {
            const res = await (tDef as any).execute(effectiveInput);
            const ok = !!res?.ok;
            const output = res?.output ?? null;
            const artifacts = Array.isArray(res?.artifacts) ? res.artifacts : undefined;
            const toolLogs = Array.isArray(res?.logs) ? res.logs : [];
            logs.push(...toolLogs);
            return { ok, output, logs, artifacts, error: res?.error };
        }

        return { ok: false, error: 'tool_implementation_missing', logs };

    } catch (e: any) {
        const duration = Date.now() - t0;
        logs.push(`exception=${e.message} duration=${duration}ms`);
        return { ok: false, error: `exception: ${e.message}`, logs };
    }
}
