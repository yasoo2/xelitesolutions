
/**
 * Runtime Memory for Agent Orchestration
 * Tracks state, results, and history within a single goal execution
 */
export class ExecutionMemory {
    private history: Array<{ stepId: string, action: string, result: any, status: string }> = [];
    private context: Record<string, any> = {};
    private failures: number = 0;

    constructor(public readonly sessionId: string) {}

    public record(stepId: string, action: string, result: any, status: 'completed' | 'failed') {
        this.history.push({ stepId, action, result, status });
        if (status === 'completed') {
            this.context[stepId] = result;
        } else {
            this.failures++;
        }
    }

    public getResults(): Record<string, any> {
        return this.context;
    }

    public getHistory() {
        return this.history;
    }

    public getFailureCount(): number {
        return this.failures;
    }

    public getSummary(): string {
        return this.history.map(h => `- ${h.stepId} (${h.status}): ${h.action}`).join('\n');
    }
}
