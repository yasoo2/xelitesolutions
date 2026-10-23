import { estimatePromptTokens, localDeadlineMs, localThroughputSnapshot, noteLocalThroughput, resetLocalThroughputForTests } from '../core/llm/local-throughput';
import { clampPlannerTotalMs, localPlannerCeilingMs } from '../core/orchestrator/planner-run-boundary';

/**
 * 2026-10-23: four fixed cuts (45 s offline, 120 s engineering cap, 180 s
 * planner, 300 s planner boundary) all sat below one local plan on the owner's
 * CPU (~6 tokens/s read, ~3 written). Deadlines now come from the call's size
 * and the speed this machine just showed.
 */
const s = 1e9; // Ollama durations are nanoseconds
describe('a deadline is sized to the call and to the machine', () => {
    beforeEach(() => resetLocalThroughputForTests());
    const saved = process.env.LOCAL_BRAIN_LEASH_MAX;
    afterEach(() => { if (saved === undefined) delete process.env.LOCAL_BRAIN_LEASH_MAX; else process.env.LOCAL_BRAIN_LEASH_MAX = saved; });

    it('learns read and write speed from the model receipts', () => {
        noteLocalThroughput({ prompt_eval_count: 975, prompt_eval_duration: 157 * s, eval_count: 10, eval_duration: 2.8 * s });
        noteLocalThroughput({ prompt_eval_count: 600, prompt_eval_duration: 100 * s, eval_count: 300, eval_duration: 100 * s });
        const r = localThroughputSnapshot()!;
        expect(r.promptPerS).toBeGreaterThan(5.5);
        expect(r.promptPerS).toBeLessThan(6.5);
        expect(r.outputPerS).toBeGreaterThan(2);
        expect(r.outputPerS).toBeLessThan(3.5);
    });

    it('ignores tiny receipts that are mostly overhead', () => {
        noteLocalThroughput({ prompt_eval_count: 3, prompt_eval_duration: 0.01 * s, eval_count: 2, eval_duration: 0.01 * s });
        expect(localThroughputSnapshot()).toBeNull();
    });

    it('a bigger call on a slower machine gets a longer deadline', () => {
        noteLocalThroughput({ prompt_eval_count: 1200, prompt_eval_duration: 200 * s, eval_count: 300, eval_duration: 100 * s });
        const small = localDeadlineMs(500, 200);
        const plan = localDeadlineMs(2500, 4000);
        expect(plan).toBeGreaterThan(small * 4);
        // The owner's compact plan: far beyond every former fixed cut.
        expect(plan).toBeGreaterThan(300_000);
        resetLocalThroughputForTests();
        noteLocalThroughput({ prompt_eval_count: 1200, prompt_eval_duration: 1.2 * s, eval_count: 300, eval_duration: 3 * s });
        expect(localDeadlineMs(2500, 4000)).toBeLessThan(plan / 10);
    });

    it('estimates prompt tokens from bytes like the managed transport', () => {
        expect(estimatePromptTokens('abc'.repeat(100))).toBe(100);
        expect(estimatePromptTokens('عيادة')).toBe(Math.ceil(Buffer.byteLength('عيادة') / 3));
    });

    it('the planner boundary may exceed five minutes only for a local plan, within the operator leash', () => {
        expect(clampPlannerTotalMs(20 * 60_000)).toBe(300_000);
        process.env.LOCAL_BRAIN_LEASH_MAX = String(25 * 60_000);
        expect(localPlannerCeilingMs()).toBe(25 * 60_000);
        expect(clampPlannerTotalMs(20 * 60_000, localPlannerCeilingMs())).toBe(20 * 60_000);
        process.env.LOCAL_BRAIN_LEASH_MAX = String(99 * 60 * 60_000);
        expect(localPlannerCeilingMs()).toBe(30 * 60_000);
        delete process.env.LOCAL_BRAIN_LEASH_MAX;
        expect(localPlannerCeilingMs()).toBe(300_000);
    });
});
