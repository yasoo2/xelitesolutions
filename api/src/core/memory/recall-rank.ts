/**
 * HYBRID MEMORY RECALL — relevance first, recency second.
 *
 * The legacy scorer matches query words by substring and then adds recency,
 * importance, and access bonuses with no relevance floor — so a query that
 * matches NOTHING still recalls everything, ordered by noise. The past that
 * surfaces should be the past that is relevant.
 *
 * This module layers three signals, all fail-closed:
 *   1. HYBRID SCORE (deterministic): substring matches weighted by inverse
 *      frequency across the candidate set (rare words carry intent), plus a
 *      coverage bonus for matching several query terms, plus the legacy
 *      recency/importance/access bonuses unchanged.
 *   2. RELATIVE RELEVANCE FLOOR: when at least one memory matches, zero-match
 *      memories are ineligible — unless the model confidently rescues them
 *      (below). When NOTHING matches (or the query is empty), the legacy
 *      recency ordering is kept: a same-workspace follow-up such as
 *      "continue" must still surface recent context. This fallback is a
 *      tested contract (workspace-memory-isolation), not an accident.
 *   3. LLM RERANK (optional): the top-K hybrid candidates are offered to the
 *      model, which may only REORDER that set; its confident top picks bypass
 *      the floor (paraphrase rescue). Below the confidence threshold — or on
 *      any failure, outage, or kill-switch — the hybrid order wins.
 *
 * Operates on pre-scoped memory lists: workspace isolation stays owned by the
 * caller (LongTermMemory), exactly as before. Disabled with
 * JOE_MEMORY_RERANK=off. Unit tests use injected calls only, never the mesh.
 */
import { normalizeForMatch } from './learn';
import { parseRanking, resolveCall, type LlmCall } from '../orchestrator/tool-rerank';

export interface RecallMemoryLike {
    content: string;
    timestamp: number;
    importance: number;
    accessCount: number;
}

export interface RecallOptions {
    llmCall?: LlmCall;
    /** Minimum confidence to apply a model reorder. Default 0.6. */
    confidenceThreshold?: number;
    /** How many hybrid-top memories the model may reorder. Default 8. */
    rerankLimit?: number;
    cacheEnabled?: boolean;
}

export interface ScoredMemory<T> {
    memory: T;
    score: number;
    matched: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const recallCache = new Map<string, { at: number; ranking: number[]; confidence: number }>();

export function clearRecallCache(): void {
    recallCache.clear();
}

export function recallRerankDisabled(): boolean {
    return process.env.JOE_MEMORY_RERANK === 'off';
}

/** Query terms: normalized words longer than 2 chars (same rule as legacy recall). */
export function recallTerms(query: string): string[] {
    return normalizeForMatch(query)
        .split(/[^\p{L}\p{N}]+/u)
        .map(word => word.trim())
        .filter(word => word.length > 2);
}

/** Inverse frequency of each term across the candidate contents (rare = informative). */
export function termWeights(contents: string[], terms: string[]): Map<string, number> {
    const weights = new Map<string, number>();
    const total = Math.max(1, contents.length);
    for (const term of terms) {
        let docs = 0;
        for (const content of contents) {
            if (normalizeForMatch(content).includes(term)) docs++;
        }
        // Present everywhere proves nothing; absent everywhere never matches anyway.
        weights.set(term, docs <= 0 ? 1 : Math.max(0.25, Math.log(total / docs) / Math.log(total + 1) + 0.5));
    }
    return weights;
}

function legacyBonuses(memory: RecallMemoryLike, now: number): number {
    const ageHours = (now - memory.timestamp) / (1000 * 60 * 60);
    return (
        Math.max(0, 1 - ageHours / 168) + // recency decay over 1 week
        memory.importance * 3 + // importance bonus
        Math.min(memory.accessCount / 10, 1) // access frequency bonus
    );
}

/**
 * Deterministic hybrid score. matched counts query terms with a substring hit;
 * the floor uses it, not the score (bonuses alone must not pass the floor).
 */
export function hybridScore<T extends RecallMemoryLike>(
    memory: T,
    terms: string[],
    weights: Map<string, number>,
    now: number,
): { score: number; matched: number } {
    if (!terms.length) return { score: legacyBonuses(memory, now), matched: 0 };
    const contentNorm = normalizeForMatch(memory.content);
    let matched = 0;
    let score = 0;
    for (const term of terms) {
        if (contentNorm.includes(term)) {
            matched++;
            score += 2 * (weights.get(term) ?? 1);
        }
    }
    // Coverage: matching three of four terms beats matching one twice-scored word.
    if (matched > 1) score += (matched - 1) * 1.5;
    score += legacyBonuses(memory, now);
    // Round like the legacy scorer so receipts stay comparable.
    return { score: Math.round(score * 10) / 10, matched };
}

/** Hybrid ranking, best first. Pure and synchronous. */
export function rankMemoriesHybrid<T extends RecallMemoryLike>(memories: T[], query: string, now = Date.now()): ScoredMemory<T>[] {
    const terms = recallTerms(query);
    const weights = termWeights(memories.map(memory => memory.content), terms);
    return memories
        .map(memory => ({ memory, ...hybridScore(memory, terms, weights, now) }))
        .sort((a, b) => b.score - a.score);
}

function hashKey(value: string): string {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
}

/**
 * Hybrid ranking with an optional model rerank. Final eligibility: matched
 * memories when any matched (the relative floor), else everything in bonus
 * order — UNION the model's confident picks (the paraphrase rescue). Never
 * rejects: any failure resolves to the floored hybrid order.
 */
export async function recallRankedAsync<T extends RecallMemoryLike>(
    memories: T[],
    query: string,
    limit = 5,
    opts: RecallOptions = {},
): Promise<T[]> {
    const ranked = rankMemoriesHybrid(memories, query);
    const terms = recallTerms(query);
    const hasSignal = terms.length > 0 && ranked.some(entry => entry.matched > 0);
    const floored = hasSignal ? ranked.filter(entry => entry.matched > 0) : ranked;
    const finish = (entries: ScoredMemory<T>[]): T[] => {
        // Access counters reward what was actually returned (legacy behavior).
        for (const entry of entries.slice(0, limit)) entry.memory.accessCount++;
        return entries.slice(0, limit).map(entry => entry.memory);
    };
    try {
        if (recallRerankDisabled()) return finish(floored);
        const rerankLimit = Math.max(2, Math.min(12, Math.floor(opts.rerankLimit ?? 8)));
        const pool = ranked.slice(0, rerankLimit);
        if (pool.length < 2) return finish(floored);
        const threshold = opts.confidenceThreshold ?? 0.6;
        const useCache = opts.cacheEnabled !== false;
        const fingerprint = pool.map(entry => `${entry.memory.content.slice(0, 60)}@${entry.memory.timestamp}`).join('|');
        const key = `recall:${hashKey(`${query.length}:${query}|${fingerprint}`)}`;
        const cached = useCache ? recallCache.get(key) : undefined;
        let ranking: number[] | null = null;
        if (cached && Date.now() - cached.at < CACHE_TTL_MS && cached.confidence >= threshold) {
            ranking = cached.ranking;
        } else {
            const ids = pool.map((_, index) => `m${index + 1}`);
            const prompt = [
                'Pick the memories most relevant to this request. Reply ONLY JSON, no prose, no fences: {"ranking":["m1",...],"confidence":0..1}.',
                `Request: ${String(query || '').slice(0, 500)}`,
                'Memories:',
                ...pool.map((entry, index) => `${ids[index]}. ${String(entry.memory.content || '').slice(0, 200)}`),
                'Rules: rank most-relevant first; use ONLY these ids; confidence is your certainty the top pick is relevant. When none fits well, answer confidence below 0.6.',
            ].join('\n');
            const parsed = parseRanking(await resolveCall({ llmCall: opts.llmCall })(prompt), ids);
            if (!parsed || parsed.confidence < threshold) return finish(floored);
            ranking = parsed.ranking.map(id => ids.indexOf(id)).filter(index => index >= 0);
            if (!ranking.length) return finish(floored);
            if (useCache) {
                if (recallCache.size >= CACHE_MAX) {
                    const oldest = recallCache.keys().next();
                    if (!oldest.done) recallCache.delete(oldest.value);
                }
                recallCache.set(key, { at: Date.now(), ranking, confidence: parsed.confidence });
            }
        }
        // Model order first (its confident picks bypass the floor, which is the
        // paraphrase rescue), then the remaining relevant memories in hybrid
        // order. Unranked pool items with matches are kept, not dropped.
        const rankedPool = ranking.map(index => pool[index]);
        const rankedSet = new Set(rankedPool);
        const ordered = [...rankedPool, ...floored.filter(entry => !rankedSet.has(entry))];
        return finish(ordered);
    } catch {
        return finish(floored);
    }
}
