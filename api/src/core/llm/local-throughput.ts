/**
 * How fast THIS machine's local model really reads and writes, learned from
 * the model's own receipts, and the deadline a call of a given size needs.
 *
 * ⛔ 2026-10-23: three fixed cuts (180 s planner, 120 s engineering cap, 45 s
 * offline) sat below what the owner's CPU needs for one plan (~6 tokens/s read,
 * ~3 tokens/s written), so local planning never finished and every build fell
 * back to a stock app. A fixed number is right for one machine only; Ollama
 * reports prompt_eval_count/duration and eval_count/duration on every call, so
 * the deadline is computed from what this machine just did.
 */

// Before any receipt: a modest CPU. A fast machine only pays this on the first
// call's upper bound, and it finishes long before the bound anyway.
/**
 * The absolute upper bound of one local inference call: a runaway guard, not a
 * policy. The deadline a call actually gets is sized from this machine's
 * measured throughput (localDeadlineMs) or set by the operator
 * (LOCAL_LLM_TIMEOUT, LOCAL_BRAIN_LEASH_MAX). It used to be 30 minutes in four
 * places — a laptop-era cut that ended plans a CPU was still writing, and that a
 * GPU server never needed. Development runs on a CPU; production on a GPU
 * server: the same code must let both finish (owner, 2026-10-23).
 */
export const LOCAL_INFERENCE_HARD_MAX_MS = 6 * 60 * 60_000;

const DEFAULT_PROMPT_TOKENS_PER_S = 5;
const DEFAULT_OUTPUT_TOKENS_PER_S = 2;
const SAFETY = 1.5;
const BLEND = 0.4; // weight of the newest receipt

type Rates = { promptPerS: number; outputPerS: number; loadMs: number; samples: number };
let rates: Rates | null = null;

/**
 * SPEED DEPENDS ON THE CONTEXT. One blended rate learned mostly from short
 * calls under-sized long ones: on the owner's CPU, 41k-character acceptance
 * judges (~14k tokens) were still reading at 51–52 min of their 55-min sized
 * deadline (eval round 15, P051/P251) — every generated token attends to the
 * whole context, so both reading and writing slow as the prompt grows. Rates
 * are therefore also kept per prompt-size bucket (≤1k, ≤2k, … tokens), and a
 * long call is sized from its own bucket — or, before that bucket has a
 * receipt, from the nearest smaller one slowed by EXTRAPOLATE per doubling.
 * The result never undercuts the blended sizing: buckets only lengthen a
 * deadline, so a fast GPU server is unaffected and a CPU is not cut short.
 */
const EXTRAPOLATE = 0.85;
const BUCKETS = 7;
const buckets: Array<{ promptPerS: number; outputPerS: number; samples: number } | null> = Array(BUCKETS).fill(null);
export function promptBucket(promptTokens: number): number {
    const n = Math.max(1, Number(promptTokens) || 1);
    return Math.min(BUCKETS - 1, Math.max(0, Math.ceil(Math.log2(n / 1024))));
}

const positive = (n: unknown): number | null => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;

/** Record one successful local call from Ollama's own metrics (durations in ns). */
export function noteLocalThroughput(metrics: {
    prompt_eval_count?: number; prompt_eval_duration?: number;
    eval_count?: number; eval_duration?: number; load_duration?: number;
} | undefined): void {
    if (!metrics) return;
    const pc = positive(metrics.prompt_eval_count), pd = positive(metrics.prompt_eval_duration);
    const ec = positive(metrics.eval_count), ed = positive(metrics.eval_duration);
    // Tiny samples are mostly fixed overhead; they would overstate the rate.
    const promptPerS = pc && pd && pc >= 32 ? pc / (pd / 1e9) : null;
    const outputPerS = ec && ed && ec >= 16 ? ec / (ed / 1e9) : null;
    const loadMs = (positive(metrics.load_duration) || 0) / 1e6;
    if (!promptPerS && !outputPerS) return;
    const blend = (old: number, next: number | null) => next === null ? old : old * (1 - BLEND) + next * BLEND;
    if (pc) {
        const i = promptBucket(pc);
        const prior = buckets[i];
        buckets[i] = prior
            ? { promptPerS: blend(prior.promptPerS, promptPerS), outputPerS: blend(prior.outputPerS, outputPerS), samples: prior.samples + 1 }
            : { promptPerS: promptPerS ?? (rates?.promptPerS || DEFAULT_PROMPT_TOKENS_PER_S), outputPerS: outputPerS ?? (rates?.outputPerS || DEFAULT_OUTPUT_TOKENS_PER_S), samples: 1 };
    }
    rates = rates
        ? { promptPerS: blend(rates.promptPerS, promptPerS), outputPerS: blend(rates.outputPerS, outputPerS),
            loadMs: Math.max(rates.loadMs * (1 - BLEND), loadMs), samples: rates.samples + 1 }
        : { promptPerS: promptPerS ?? DEFAULT_PROMPT_TOKENS_PER_S, outputPerS: outputPerS ?? DEFAULT_OUTPUT_TOKENS_PER_S,
            loadMs, samples: 1 };
}

/** Prompt tokens estimated the same way the managed transport estimates them. */
export function estimatePromptTokens(text: string): number {
    return Math.ceil(Buffer.byteLength(String(text || ''), 'utf8') / 3);
}

/** The deadline a local call of this size needs on this machine, with a safety margin. */
export function localDeadlineMs(promptTokens: number, outputTokens: number): number {
    const r = rates || { promptPerS: DEFAULT_PROMPT_TOKENS_PER_S, outputPerS: DEFAULT_OUTPUT_TOKENS_PER_S, loadMs: 30_000, samples: 0 };
    const sized = sizedRates(promptTokens, r);
    const expected = r.loadMs + (Math.max(0, promptTokens) / sized.promptPerS + Math.max(0, outputTokens) / sized.outputPerS) * 1000;
    return Math.ceil(expected * SAFETY);
}

/** The rates for a prompt of this size: its bucket's, or the nearest smaller one's slowed per doubling; never faster than the blend. */
function sizedRates(promptTokens: number, blended: { promptPerS: number; outputPerS: number }): { promptPerS: number; outputPerS: number } {
    const target = promptBucket(promptTokens);
    let known: { promptPerS: number; outputPerS: number } | null = buckets[target];
    if (!known) {
        for (let i = target - 1; i >= 0 && !known; i--) {
            const b = buckets[i];
            if (b) {
                const slow = Math.pow(EXTRAPOLATE, target - i);
                known = { promptPerS: b.promptPerS * slow, outputPerS: b.outputPerS * slow };
            }
        }
    }
    if (!known) return blended;
    return { promptPerS: Math.min(blended.promptPerS, known.promptPerS), outputPerS: Math.min(blended.outputPerS, known.outputPerS) };
}

export function localThroughputSnapshot(): Readonly<Rates> | null { return rates ? { ...rates } : null; }

/** Test seam. */
export function resetLocalThroughputForTests(): void { rates = null; buckets.fill(null); }
