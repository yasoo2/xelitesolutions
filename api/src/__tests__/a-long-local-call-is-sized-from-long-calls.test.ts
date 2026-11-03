import { localDeadlineMs, localThroughputSnapshot, noteLocalThroughput, promptBucket, resetLocalThroughputForTests } from '../core/llm/local-throughput';

/**
 * Eval round 15, 2026-10-24 (P051/P251): one blended rate, learned mostly from
 * short calls, sized a ~14k-token acceptance judge at 55 min; it was still
 * reading at 51–52 min. Every generated token attends to the whole context,
 * so a long call is slower per token than a short one. Rates are kept per
 * prompt-size bucket, and a bucket only ever lengthens a deadline.
 */
const s = 1e9; // Ollama durations are nanoseconds
const blendedDeadline = (promptTokens: number, outputTokens: number) => {
    const r = localThroughputSnapshot()!;
    return Math.ceil((r.loadMs + (promptTokens / r.promptPerS + outputTokens / r.outputPerS) * 1000) * 1.5);
};

describe('a long local call is sized from long calls', () => {
    beforeEach(() => resetLocalThroughputForTests());

    it('buckets prompts by doubling size', () => {
        expect(promptBucket(800)).toBe(0);
        expect(promptBucket(1500)).toBe(1);
        expect(promptBucket(14_000)).toBe(4);
        expect(promptBucket(10_000_000)).toBe(6);
    });

    it('with only short receipts, a long call is extrapolated slower than the short-call rate', () => {
        noteLocalThroughput({ prompt_eval_count: 900, prompt_eval_duration: 150 * s, eval_count: 300, eval_duration: 100 * s });
        expect(localDeadlineMs(14_000, 1800)).toBeGreaterThan(blendedDeadline(14_000, 1800) * 1.4);
        // A call the size of the receipts is sized exactly as before.
        expect(localDeadlineMs(900, 300)).toBe(blendedDeadline(900, 300));
    });

    it('once a long call has a receipt, long calls are sized from it and short calls keep their own speed', () => {
        noteLocalThroughput({ prompt_eval_count: 900, prompt_eval_duration: 150 * s, eval_count: 300, eval_duration: 100 * s }); // ~6 read, 3 write
        noteLocalThroughput({ prompt_eval_count: 14_000, prompt_eval_duration: 5000 * s, eval_count: 1000, eval_duration: 1000 * s }); // ~2.8 read, 1 write
        const long = localDeadlineMs(14_000, 1800);
        // Reading 14k at ~2.8 tok/s and writing 1.8k at ~1 tok/s, with the 1.5 margin: well over two hours.
        expect(long).toBeGreaterThan(2 * 60 * 60_000);
        expect(localDeadlineMs(900, 300)).toBeLessThan(long / 10);
    });

    it('a bucket never shortens a deadline: a fast long receipt leaves the blended sizing in charge', () => {
        noteLocalThroughput({ prompt_eval_count: 900, prompt_eval_duration: 150 * s, eval_count: 300, eval_duration: 100 * s });
        noteLocalThroughput({ prompt_eval_count: 14_000, prompt_eval_duration: 20 * s, eval_count: 1000, eval_duration: 10 * s });
        expect(localDeadlineMs(14_000, 1800)).toBe(blendedDeadline(14_000, 1800));
    });

    it('reset forgets the buckets too', () => {
        const short = { prompt_eval_count: 900, prompt_eval_duration: 150 * s, eval_count: 300, eval_duration: 100 * s };
        noteLocalThroughput(short);
        const fresh = localDeadlineMs(14_000, 1800);
        resetLocalThroughputForTests();
        noteLocalThroughput({ prompt_eval_count: 14_000, prompt_eval_duration: 9000 * s, eval_count: 1000, eval_duration: 2000 * s });
        resetLocalThroughputForTests();
        noteLocalThroughput(short);
        expect(localDeadlineMs(14_000, 1800)).toBe(fresh);
    });
});
