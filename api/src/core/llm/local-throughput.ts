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
    const expected = r.loadMs + (Math.max(0, promptTokens) / r.promptPerS + Math.max(0, outputTokens) / r.outputPerS) * 1000;
    return Math.ceil(expected * SAFETY);
}

export function localThroughputSnapshot(): Readonly<Rates> | null { return rates ? { ...rates } : null; }

/** Test seam. */
export function resetLocalThroughputForTests(): void { rates = null; }
