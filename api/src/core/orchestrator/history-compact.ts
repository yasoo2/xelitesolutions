/**
 * Compacts an execution history before it enters a planning prompt.
 *
 * Why this exists: the planner used to receive JSON.stringify(fullHistory) with
 * no ceiling. One completed web_page_builder node carries an entire HTML page
 * in its result — a single recovery replan could push hundreds of thousands of
 * tokens at a free-tier model, the call itself would fail, and the "recovery"
 * collapsed into the failover chat answer. The history's JOB in a planning
 * prompt is orientation: what ran, what worked, what broke and WHY. Failures
 * keep the most text (the error is the material the repair is planned from);
 * successes keep a scent, not the payload.
 */

export interface HistoryEntry {
    stepId: string;
    action: string;
    result: any;
    status: string;
}

const MAX_ENTRIES = 12;
const COMPLETED_RESULT_CAP = 600;
const FAILED_RESULT_CAP = 2000;

function asText(result: any): string {
    if (result == null) return '';
    if (typeof result === 'string') return result;
    try { return JSON.stringify(result); } catch { return String(result); }
}

function truncate(text: string, cap: number): string {
    if (text.length <= cap) return text;
    return text.slice(0, cap) + `…[truncated ${text.length - cap} chars]`;
}

/**
 * Returns a compact copy of the history, safe to embed in an LLM prompt:
 * - only the most recent MAX_ENTRIES entries survive (older ones are summarized
 *   to a single counter line so the planner knows work happened before);
 * - failed entries keep up to FAILED_RESULT_CAP chars of their error;
 * - completed entries keep up to COMPLETED_RESULT_CAP chars of their result.
 */
export function compactHistoryForPrompt(history: HistoryEntry[] | any): any {
    if (!Array.isArray(history)) return history;
    const recent = history.slice(-MAX_ENTRIES);
    const dropped = history.length - recent.length;
    const compact = recent.map((h) => ({
        stepId: h?.stepId,
        action: typeof h?.action === 'string' ? truncate(h.action, 300) : h?.action,
        status: h?.status,
        result: truncate(asText(h?.result), h?.status === 'failed' ? FAILED_RESULT_CAP : COMPLETED_RESULT_CAP),
    }));
    return dropped > 0
        ? [{ note: `${dropped} earlier step(s) omitted for brevity` }, ...compact]
        : compact;
}
