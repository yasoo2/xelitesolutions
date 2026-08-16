import { ExecutionMemory } from '../core/orchestrator/ExecutionMemory';
import { TraceManager } from '../modules/services/TraceManager';

describe('ExecutionMemory bounds', () => {
    it('keeps recent history bounded and truncates large runtime values', () => {
        const memory = new ExecutionMemory('memory-test');
        const huge = 'x'.repeat(20_000);

        for (let i = 0; i < 100; i++) {
            memory.record(`step-${i}`, `action-${i}`, { stdout: huge, index: i }, 'completed');
        }

        expect(memory.getHistory()).toHaveLength(32);
        expect(memory.getHistory()[0].stepId).toBe('step-68');
        expect(memory.getHistory()[31].stepId).toBe('step-99');
        expect(memory.getHistory()[31].result.stdout.length).toBeLessThan(20_000);
        expect(Object.keys(memory.getResults())).toHaveLength(64);
        expect(memory.getResults()['step-36']).toBeDefined();
        expect(memory.getResults()['step-35']).toBeUndefined();
    });

    it('bounds trace timelines and compacts nested event payloads', () => {
        const manager = TraceManager.getInstance();
        const traceId = manager.startTrace(`trace-session-${Date.now()}`, 'trace-bound-test');
        const huge = 'y'.repeat(20_000);

        for (let i = 0; i < 400; i++) {
            manager.logEvent(traceId, 'tool', {
                index: i,
                output: { stdout: huge, rows: Array.from({ length: 100 }, (_, j) => ({ j, text: huge })) },
            });
        }

        const trace = manager.getTrace(traceId);
        expect(trace).toBeDefined();
        expect(trace!.timeline).toHaveLength(256);
        expect(trace!.timeline[0].data.index).toBe(144);
        expect(String(trace!.timeline[255].data.output.stdout).length).toBeLessThan(20_000);
        // 64 retained rows plus one explicit truncation marker.
        expect(trace!.timeline[255].data.output.rows.length).toBeLessThanOrEqual(65);
        manager.endTrace(traceId);
        expect(manager.getTrace(traceId)).toBeDefined();
    });

    it('preserves failure accounting while keeping failed evidence bounded', () => {
        const memory = new ExecutionMemory('failure-test');
        for (let i = 0; i < 40; i++) {
            memory.record(`failed-${i}`, 'shell_execute', { stderr: 'failure' }, 'failed');
        }

        expect(memory.getFailureCount()).toBe(40);
        expect(memory.getHistory()).toHaveLength(32);
        expect(memory.getHistory()[0].stepId).toBe('failed-8');
        expect(memory.getSummary()).toContain('failed-39 (failed): shell_execute');
    });
});
