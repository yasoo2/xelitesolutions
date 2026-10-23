/**
 * How large a window a local model may be given.
 *
 * Owner, 2026-10-23: the laptop (16 GB, CPU) is for development; Joe will run
 * on a GPU server with large memory for thousands of users. The window used to
 * stop at 16384 tokens in three places — right for the laptop, a silent limit on
 * a server that could hold a whole existing project in view.
 *
 * - The CEILING is the operator's (LOCAL_MAX_CONTEXT); unset, it stays 16384,
 *   so a machine nobody configured behaves exactly as before.
 * - The TIER follows measured memory with the same rule as before, continued
 *   upward: one token per 512 KiB usable (8 GiB → 16384, 16 GiB → 32768, …),
 *   floored to a power of two, at least 2048. The 512 KiB budget per token is
 *   generous for qwen3.5's hybrid attention (~32 KiB of KV per token).
 * - The HARD maximum bounds both; it is a sanity limit, not a policy.
 */
export const CONTEXT_HARD_MAX_TOKENS = 262144;
export const DEFAULT_CONTEXT_CEILING_TOKENS = 16384;
const BYTES_PER_TOKEN_OF_WINDOW = 512 * 1024;
const MIN_TIER = 2048;

export function localContextCeilingTokens(): number {
    const configured = Number.parseInt(String(process.env.LOCAL_MAX_CONTEXT || '').trim(), 10);
    if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_CONTEXT_CEILING_TOKENS;
    return Math.max(MIN_TIER, Math.min(CONTEXT_HARD_MAX_TOKENS, configured));
}

export function contextTierForMemory(usableBytes: number): number {
    const tokens = Math.floor(Math.max(0, usableBytes) / BYTES_PER_TOKEN_OF_WINDOW);
    if (tokens < MIN_TIER) return MIN_TIER;
    return Math.min(CONTEXT_HARD_MAX_TOKENS, 2 ** Math.floor(Math.log2(tokens)));
}
