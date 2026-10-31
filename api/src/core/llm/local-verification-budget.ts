/**
 * Local verification budget (PURE).
 *
 * Connection-only budget for a small selected canonical-local probe
 * (for example the selected `qwen2.5-coder:7b` loopback connection check).
 * A local server ignores an SDK dummy key, but model loading on CPU has
 * cold-load overhead, so the generic cloud 20s verification bound can end
 * a live local probe before it succeeds. This fixed 90s bound covers that
 * cold start only.
 *
 * Scope: connection probe timing only. The cloud ordinary 20s verification
 * bound and all real conversation deadlines are untouched. A longer bounded
 * probe is not proof of model quality.
 *
 * Pure by construction: fixed constants only. No env, network, imports,
 * model-size heuristics, mutable globals, or unbounded waiting.
 */

/** Maximum completion tokens for the connection-only local probe. */
export const LOCAL_VERIFICATION_MAX_COMPLETION_TOKENS = 32;

/**
 * Return the fixed local connection-probe budget in milliseconds.
 *
 * Always returns exactly 90000 (bounded 90 seconds).
 */
export function localVerificationBudgetMs(): number {
  return 90000;
}
