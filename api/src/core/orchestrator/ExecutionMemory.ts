/**
 * Runtime Memory for Agent Orchestration
 * Tracks bounded state, results, and history within a single goal execution.
 *
 * A long engineering run can execute hundreds of tools. Keeping every raw
 * terminal/browser/LLM result in both history and context makes memory grow
 * quadratically because the same history is passed into later tool calls.
 * This class therefore keeps recent, evidence-bearing summaries only.
 */

const MAX_HISTORY_ENTRIES = 32;
const MAX_CONTEXT_ENTRIES = 64;
const MAX_STRING_CHARS = 8_000;
const MAX_ARRAY_ITEMS = 64;
const MAX_OBJECT_KEYS = 80;
const MAX_NESTING_DEPTH = 4;

function compactRuntimeValue(value: any, depth = 0): any {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
        return value.length > MAX_STRING_CHARS
            ? `${value.slice(0, MAX_STRING_CHARS)}\n...[truncated by ExecutionMemory]`
            : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth >= MAX_NESTING_DEPTH) return '[truncated nested value]';
    if (Array.isArray(value)) {
        const items = value.slice(0, MAX_ARRAY_ITEMS).map(item => compactRuntimeValue(item, depth + 1));
        if (value.length > MAX_ARRAY_ITEMS) items.push(`[...${value.length - MAX_ARRAY_ITEMS} more items]`);
        return items;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        const result: Record<string, any> = {};
        for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
            result[key] = compactRuntimeValue(item, depth + 1);
        }
        if (entries.length > MAX_OBJECT_KEYS) {
            result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
        }
        return result;
    }
    return String(value);
}

export class ExecutionMemory {
    private history: Array<{ stepId: string, action: string, result: any, status: string }> = [];
    private context: Record<string, any> = {};
    private contextOrder: string[] = [];
    private failures = 0;

    constructor(public readonly sessionId: string) {}

    public record(stepId: string, action: string, result: any, status: 'completed' | 'failed') {
        const compactResult = compactRuntimeValue(result);
        this.history.push({
            stepId,
            action: String(action || '').slice(0, MAX_STRING_CHARS),
            result: compactResult,
            status,
        });
        if (this.history.length > MAX_HISTORY_ENTRIES) {
            this.history.splice(0, this.history.length - MAX_HISTORY_ENTRIES);
        }

        if (status === 'completed') {
            if (Object.prototype.hasOwnProperty.call(this.context, stepId)) {
                this.contextOrder = this.contextOrder.filter(id => id !== stepId);
            }
            this.context[stepId] = compactResult;
            this.contextOrder.push(stepId);
            while (this.contextOrder.length > MAX_CONTEXT_ENTRIES) {
                const oldest = this.contextOrder.shift();
                if (oldest) delete this.context[oldest];
            }
        } else {
            this.failures++;
        }
    }

    public getResults(): Record<string, any> {
        return { ...this.context };
    }

    public getHistory() {
        return this.history.map(entry => ({ ...entry }));
    }

    public getFailureCount(): number {
        return this.failures;
    }

    public getSummary(): string {
        return this.history
            .map(h => `- ${h.stepId} (${h.status}): ${String(h.action).slice(0, 500)}`)
            .join('\n');
    }
}

export { compactRuntimeValue };
