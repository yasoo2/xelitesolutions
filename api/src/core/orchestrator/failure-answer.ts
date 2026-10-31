import { types } from 'util';
import { redactSecretsFromString } from '../../shared/utils/redaction';

/** Measured failure prose only; control flags are never an answer. */
export function failureAnswerOf(value: unknown): string {
    const visited = new WeakSet<object>();
    let nodes = 0;
    const text = (v: unknown): string => typeof v === 'string' && v.trim()
        ? redactSecretsFromString(v.trim().slice(0, 1200)) : '';
    const read = (v: unknown): Record<string, PropertyDescriptor> | null => {
        if (!v || typeof v !== 'object' || Array.isArray(v) || types.isProxy(v)) return null;
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null && !types.isNativeError(v)) return null;
        return Object.getOwnPropertyDescriptors(v);
    };
    const own = (d: Record<string, PropertyDescriptor>, key: string): unknown =>
        Object.prototype.hasOwnProperty.call(d, key) && 'value' in d[key] ? d[key].value : undefined;
    const walk = (v: unknown, depth: number): string => {
        if (typeof v === 'string') return text(v);
        if (depth > 4) return '';
        const d = read(v);
        if (!d || visited.has(v as object) || ++nodes > 64) return '';
        visited.add(v as object);
        const blocker = read(own(d, 'blocker'));
        if (blocker) {
            const detail = text(own(blocker, 'message')) || text(own(blocker, 'code'));
            if (detail) return detail;
        }
        for (const key of ['message', 'summary', 'error']) {
            const detail = text(own(d, key));
            if (detail) return detail;
        }
        for (const key of ['plannerResult', 'discoveryResult', 'output', 'result']) {
            const detail = walk(own(d, key), depth + 1);
            if (detail) return detail;
        }
        const reason = text(own(d, 'reason'));
        if (reason) return reason;
        // A structured receipt with only metadata is not a map of speaking steps.
        if (['status', 'pipelineFinal', 'executed', 'autoExecuted', 'nonRecoverable', 'verificationFailed', 'success', 'ok'].some(k => Object.prototype.hasOwnProperty.call(d, k))) return '';
        const keys = Object.keys(d).slice(0, 32);
        for (const key of keys.reverse()) {
            if (/userId|sessionId|workspaceId|runId|apiKey|password|credential|token|baseUrl/i.test(key)) continue;
            const detail = walk(own(d, key), depth + 1);
            if (detail) return detail;
        }
        return '';
    };
    return walk(value, 0);
}
