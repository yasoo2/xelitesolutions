/**
 * CROSS-RUN LESSON LOOP — prevention, not just cure.
 *
 * RepairMemory already closes the repair loop: a proven cure is recorded and
 * recalled by EXACT error signature when the same failure recurs. But two gaps
 * remain. First, a reworded error (different tool, same root cause) never
 * matches its signature, so the cure stays buried. Second, cures only reach
 * the recovery planner at repair time — the main planner never sees them, so
 * every run re-discovers failures a previous run already beat.
 *
 * This module is the read side that closes both gaps:
 *   - findSimilarCures(): fuzzy retrieval over stored cures by token overlap
 *     on the signature plus the human-readable error sample, weighted by
 *     rarity, proven wins, and recency. Expired cures (untouched 90 days)
 *     are excluded.
 *   - buildLessonContext(): formats the top cures as a planner context block.
 *     No signal means no block — a new context section must earn its tokens.
 *   - appendLessons(): the one helper AgentLoopService calls to extend its
 *     existing memoryContext block. Best-effort, never throws.
 *
 * The write side already exists (recordRepair at both proven-cure points), so
 * this module writes nothing. Workspace note: repair records carry no
 * workspace tag today, so cures are global; the query match itself is the
 * relevance gate, and the block is capped and clearly labeled as past-run
 * experience, never instructions.
 */
import { errorSignature, type RepairMemory, type RepairRecord } from './repair-memory';
import { recallTerms, termWeights } from './recall-rank';

const LESSON_EXPIRY_DAYS = 90;
const MAX_BLOCK_CURES = 3;

export interface SimilarCure {
    record: RepairRecord;
    score: number;
    matched: number;
}

export function lessonTerms(text: string): string[] {
    return recallTerms(text);
}

function cureText(record: RepairRecord): string {
    return `${record.signature} ${record.errorSample}`;
}

/** Fuzzy rank of stored cures against a goal or error. Pure. */
export function rankCures(records: RepairRecord[], query: string, now = Date.now()): SimilarCure[] {
    const terms = recallTerms(query);
    if (!terms.length) return [];
    const texts = records.map(cureText);
    const weights = termWeights(texts, terms);
    const scored: SimilarCure[] = [];
    for (const record of records) {
        const ageDays = (now - Date.parse(record.lastAt || '')) / 86400000;
        if (Number.isFinite(ageDays) && ageDays > LESSON_EXPIRY_DAYS) continue;
        const haystack = cureText(record).toLowerCase();
        let matched = 0;
        let score = 0;
        for (const term of terms) {
            if (haystack.includes(term)) {
                matched++;
                score += 2 * (weights.get(term) ?? 1);
            }
        }
        if (!matched) continue;
        if (matched > 1) score += (matched - 1) * 1.5;
        score += Math.min(Math.max(0, record.wins || 0), 5) * 0.5; // proven cures first
        if (Number.isFinite(ageDays)) score += Math.max(0, 1 - ageDays / 30); // 30d recency
        scored.push({ record, score: Math.round(score * 10) / 10, matched });
    }
    return scored.sort((a, b) => b.score - a.score);
}

/**
 * Top fuzzy cures for a goal or error. Empty when nothing matches — callers
 * treat that as "no lesson block". Never throws.
 */
export function findSimilarCures(store: RepairMemory, query: string, limit = MAX_BLOCK_CURES): SimilarCure[] {
    try {
        const key = errorSignature(query);
        if (!key && !recallTerms(query).length) return [];
        return rankCures(store.all(), query).slice(0, Math.max(1, limit));
    } catch {
        return [];
    }
}

/** Planner context block, or '' when there is nothing worth saying. */
export function buildLessonContext(store: RepairMemory, query: string, limit = MAX_BLOCK_CURES): string {
    const cures = findSimilarCures(store, query, limit);
    if (!cures.length) return '';
    const lines = cures.map(({ record }) =>
        `- Failed before with "${record.errorSample.slice(0, 140)}" — the fix that worked (proven ${record.wins}x): ${record.repair.slice(0, 200)}`,
    );
    return [
        'LESSONS FROM PREVIOUS RUNS (real failures Joe already beat — avoid repeating them; the fix is a strong lead, not a script):',
        ...lines,
    ].join('\n');
}

/**
 * Append the lesson block to an existing context string. The single helper
 * AgentLoopService calls. Never throws, never returns a dangling header.
 */
export function appendLessons(memoryText: string, store: RepairMemory, query: string): string {
    try {
        const block = buildLessonContext(store, query);
        if (!block) return memoryText;
        return memoryText ? `${memoryText}\n\n${block}` : block;
    } catch {
        return memoryText;
    }
}
