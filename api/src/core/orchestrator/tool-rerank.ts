/**
 * LLM-ASSISTED TOOL RERANK — a second opinion, never a replacement.
 *
 * The deterministic scorer in toolCatalog ranks by token overlap. That fails
 * on paraphrase twice over: «is my site easy for search engines to find»
 * ranks browser_find_text above the SEO tools, and «give me a rundown of this
 * repository health» scores every specialist near zero. The planner then plans
 * with the wrong tools — or with the generic core only.
 *
 * This module adds two bounded LLM layers ON TOP of the deterministic order:
 *   TIER 2 — RERANK ON AMBIGUITY: when candidates exist but the winner is weak
 *   or the race is close, the model may only REORDER that candidate set.
 *   TIER 3 — RETRIEVAL ON NEAR-ZERO SIGNAL: when the deterministic top score
 *   is below 3 (paraphrase the scorer cannot see), the model picks up to 5
 *   tools from a compact full-registry digest. Unknown names are dropped.
 *
 * Both tiers share the same discipline: confidence threshold or the
 * deterministic result wins unchanged; any failure (timeout, outage, garbage,
 * kill-switch) falls back silently. The sync functions in toolCatalog are
 * untouched. A decisive deterministic winner (score >= 12, margin >= 6) costs
 * zero tokens, successful answers are cached briefly, and the whole layer is
 * disabled with JOE_TOOL_RERANK=off.
 */
import {
    ACT_VERB,
    goalTerms,
    inputForTool,
    norm,
    ROUTER_EXCLUDED,
    scoreTool,
    selectToolsFor,
    toolLine,
    type CapabilityRoute,
    type ScoredTool,
} from './toolCatalog';
import { tools } from '../../modules/tools/registry';

/** Injectable model call so tests never touch the network (same pattern as the browser ReAct brain). */
export type LlmCall = (prompt: string) => Promise<string>;

export interface RerankOptions {
    llmCall?: LlmCall;
    /** Minimum confidence to apply a catalogue reorder/pick. Default 0.6. */
    confidenceThreshold?: number;
    /** Minimum confidence to route a single specialist. Default 0.7. */
    routeThreshold?: number;
    /** How many deterministic candidates the model may reorder. Default 12. */
    candidateLimit?: number;
    cacheEnabled?: boolean;
}

export interface AsyncCapabilityRoute extends CapabilityRoute {
    via: 'llm-rerank';
}

/** Deterministic top score below this means the scorer saw no real signal. */
export const WEAK_SIGNAL_SCORE = 3;

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const rerankCache = new Map<string, { at: number; ranking: string[]; confidence: number }>();

export function clearRerankCache(): void {
    rerankCache.clear();
}

export function rerankDisabled(): boolean {
    return process.env.JOE_TOOL_RERANK === 'off';
}

function hashKey(value: string): string {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
    return (hash >>> 0).toString(36);
}

function unitTestGuard(): boolean {
    // Jest runs with no provider keys and no local brain by design: a real
    // mesh call here would burn seconds per test for a fallback verdict the
    // injected-llmCall tests already prove. Production and manual probes
    // (NODE_ENV unset or development) always use the real mesh.
    return process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
}

function testGuardCall(prompt: string): Promise<string> {
    void prompt;
    return Promise.reject(new Error('tool-rerank mesh call skipped under unit test'));
}

export function resolveCall(opts: RerankOptions): LlmCall {
    if (opts.llmCall) return opts.llmCall;
    if (unitTestGuard()) return testGuardCall;
    return defaultLlmCall;
}

function defaultLlmCall(prompt: string): Promise<string> {
    // Lazy require: keeps unit tests light and matches the codebase's
    // cycle-avoidance pattern (intelligent-router never imports this module,
    // but planning layers import both, so stay decoupled).
    const { routeToModel } = require('../llm/intelligent-router');
    return routeToModel(
        [{ role: 'user', content: prompt }],
        undefined, undefined, undefined, undefined, undefined, undefined,
        { purpose: 'internal' },
    );
}

/** A decisive deterministic winner needs no second opinion. */
export function needsRerank(scored: ScoredTool[]): boolean {
    const top = scored[0];
    if (!top || top.score <= 0) return false;
    const second = scored[1];
    if (top.score >= 12 && (!second || top.score - second.score >= 6)) return false;
    return true;
}

/** Compact full-registry digest, built once: `name — one short line`. */
let digestAll: string[] | null = null;
export function registryDigest(exclude?: Set<string>): string[] {
    if (!exclude && digestAll) return digestAll;
    const names = (tools as any[])
        .filter(t => t?.name && t?.description && !exclude?.has(t.name))
        .map(t => `${t.name} — ${String(t.description).split(/(?<=[.。])\s/)[0].slice(0, 70).trim()}`)
        .sort();
    if (!exclude) digestAll = names;
    return names;
}

function candidateLines(names: string[]): string {
    const byName = new Map((tools as any[]).map(t => [t?.name, t]));
    return names
        .map((name, index) => {
            const tool = byName.get(name);
            return tool ? `${index + 1}. ${toolLine(tool)}` : '';
        })
        .filter(Boolean)
        .join('\n');
}

function extractJsonPayload(text: string): any | null {
    const raw = String(text || '');
    // Contract shape first (object), then the bare-array shape small models
    // prefer (observed live: a fenced [{name, purpose, confidence}, ...]).
    const objectStart = raw.indexOf('{');
    const objectEnd = raw.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
        try {
            return JSON.parse(raw.slice(objectStart, objectEnd + 1));
        } catch {
            // Fall through to the array attempt below.
        }
    }
    const arrayStart = raw.indexOf('[');
    const arrayEnd = raw.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        try {
            return JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
        } catch {
            return null;
        }
    }
    return null;
}

interface ParsedRanking {
    ranking: string[];
    confidence: number;
}

/**
 * Parse a model ranking. Accepts the contract shapes {"ranking":[...]} and
 * {"pick":"name"}, plus the variants small models actually emit: a bare array
 * (of names or {name, ...} objects) and {"tools"|"picks"|"ranked"|"selected"|
 * "most_relevant"|"relevant"}. Only candidate names survive, in model order;
 * everything else is dropped.
 */
export function parseRanking(text: string, candidates: string[]): ParsedRanking | null {
    const parsed = extractJsonPayload(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const allowed = new Set(candidates);
    // Items may be bare names or {name, ...} objects (observed live).
    const itemName = (item: unknown): string | null => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && typeof (item as any).name === 'string') return (item as any).name;
        return null;
    };
    const listOf = (value: any): unknown[] | null => {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object') return null;
        const key = ['ranking', 'tools', 'picks', 'ranked', 'selected', 'most_relevant', 'relevant'].find(k => Array.isArray(value[k]));
        if (key) return value[key];
        const single = ['pick', 'tool', 'name'].map(k => value[k]).find(v => typeof v === 'string');
        return single ? [single] : null;
    };
    const raw = listOf(parsed);
    if (!raw) return null;
    const seen = new Set<string>();
    const ranking: string[] = [];
    for (const item of raw) {
        const name = itemName(item);
        if (name && allowed.has(name) && !seen.has(name)) {
            seen.add(name);
            ranking.push(name);
        }
    }
    if (!ranking.length) return null;
    const firstItem: any = raw[0];
    const itemConfidence = Number(firstItem && typeof firstItem === 'object' ? firstItem.confidence : NaN);
    const topConfidence = Number((parsed as any)?.confidence);
    const confidence = [topConfidence, itemConfidence].find(value => Number.isFinite(value)) ?? 0;
    return { ranking, confidence: Math.max(0, Math.min(1, confidence)) };
}

function reorder<T extends { name: string }>(base: T[], ranking: string[]): T[] {
    const rankIndex = new Map(ranking.map((name, index) => [name, index]));
    return [...base].sort((a, b) => {
        const ra = rankIndex.has(a.name) ? rankIndex.get(a.name)! : Number.MAX_SAFE_INTEGER;
        const rb = rankIndex.has(b.name) ? rankIndex.get(b.name)! : Number.MAX_SAFE_INTEGER;
        return ra - rb;
    });
}

function cacheGet(key: string, threshold: number): string[] | null {
    const cached = rerankCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS && cached.confidence >= threshold) return cached.ranking;
    return null;
}

function cacheSet(key: string, ranking: string[], confidence: number): void {
    if (rerankCache.size >= CACHE_MAX) {
        const oldest = rerankCache.keys().next();
        if (!oldest.done) rerankCache.delete(oldest.value);
    }
    rerankCache.set(key, { at: Date.now(), ranking, confidence });
}

/**
 * Deterministic catalogue, improved by the model only where the deterministic
 * signal is ambiguous (tier 2: reorder candidates) or near-zero (tier 3: pick
 * from the full registry). Never rejects: any failure resolves to
 * selectToolsFor.
 */
export async function selectToolsForAsync(goal: string, limit = 30, opts: RerankOptions = {}): Promise<ScoredTool[]> {
    const base = selectToolsFor(goal, limit);
    try {
        if (rerankDisabled()) return base;
        const threshold = opts.confidenceThreshold ?? 0.6;
        const call = resolveCall(opts);
        const useCache = opts.cacheEnabled !== false;
        const topScore = base[0]?.score ?? 0;

        // TIER 2 — reorder ambiguous candidates. When the model itself says none
        // fits well (low confidence), fall through to tier 3 instead of keeping
        // a wrong-but-decisive-looking order.
        let tier2Refused = false;
        const candidateLimit = Math.max(2, Math.min(24, Math.floor(opts.candidateLimit ?? 12)));
        const candidates = base.filter(s => s.score > 0).slice(0, candidateLimit);
        if (candidates.length >= 2 && needsRerank(base)) {
            const key = `r2:${hashKey(`${goal.length}:${goal}|${candidates.map(c => c.name).join(',')}|${limit}`)}`;
            const hit = useCache ? cacheGet(key, threshold) : null;
            if (hit) return reorder(base, hit);
            const prompt = [
                'Pick the tools that best serve this request. Reply ONLY JSON, no prose, no fences: {"ranking":["name",...],"confidence":0..1}.',
                `Request: ${String(goal || '').slice(0, 500)}`,
                'Candidates (name(args) — purpose):',
                candidateLines(candidates.map(c => c.name)),
                'Rules: rank best-first; use ONLY candidate names; confidence is your certainty the top pick serves the request. When none fits well, answer confidence below 0.6.',
            ].join('\n');
            const parsed = parseRanking(await call(prompt), candidates.map(c => c.name));
            if (parsed && parsed.confidence >= threshold) {
                if (useCache) cacheSet(key, parsed.ranking, parsed.confidence);
                return reorder(base, parsed.ranking);
            }
            tier2Refused = true;
        }

        // TIER 3 — the scorer saw nothing (or tier 2 refused); let the model retrieve.
        if (topScore < WEAK_SIGNAL_SCORE || tier2Refused) {
            const digest = registryDigest();
            const key = `r3:${hashKey(`${goal.length}:${goal}|${digest.length}`)}`;
            const hit = useCache ? cacheGet(key, threshold) : null;
            const ranking = hit ?? await (async () => {
                const prompt = [
                    'Pick up to 5 tools that best serve this request. Reply ONLY JSON, no prose, no fences: {"ranking":["name",...],"confidence":0..1}.',
                    `Request: ${String(goal || '').slice(0, 500)}`,
                    'Every available tool (name — purpose):',
                    digest.join('\n'),
                    'Rules: rank best-first; use ONLY listed names; confidence is your certainty the top pick serves the request.',
                ].join('\n');
                const parsed = parseRanking(await call(prompt), digest.map(line => line.split(' — ')[0]));
                if (!parsed || parsed.confidence < threshold) return null;
                if (useCache) cacheSet(key, parsed.ranking, parsed.confidence);
                return parsed.ranking;
            })();
            if (ranking?.length) {
                const byName = new Map(base.map(s => [s.name, s]));
                const terms = goalTerms(goal);
                const picked: ScoredTool[] = [];
                for (const name of ranking.slice(0, 5)) {
                    const existing = byName.get(name);
                    if (existing) {
                        picked.push(existing);
                    } else {
                        const tool = (tools as any[]).find(t => t?.name === name);
                        if (tool) picked.push({ name, score: scoreTool(tool, terms), line: toolLine(tool) });
                    }
                }
                const pickedNames = new Set(picked.map(p => p.name));
                return [...picked, ...base.filter(s => !pickedNames.has(s.name))].slice(0, Math.max(limit, picked.length));
            }
        }
        return base;
    } catch {
        return base;
    }
}

/** Async catalogue block for planner prompts. Never rejects. */
export async function catalogueForAsync(goal: string, limit = 30, opts: RerankOptions = {}): Promise<string> {
    return (await selectToolsForAsync(goal, limit, opts)).map(s => s.line).join('\n');
}

/**
 * Capability routing with an LLM second opinion. The deterministic decision is
 * always tried first and returned unchanged when it fires; the model only gets
 * the goals it refused, and must still name a feedable tool with high
 * confidence. Never rejects: any failure resolves to null.
 */
export async function capabilityRouteAsync(
    goal: string,
    context?: any,
    opts: RerankOptions = {},
): Promise<CapabilityRoute | AsyncCapabilityRoute | null> {
    const { capabilityRoute } = require('./toolCatalog') as typeof import('./toolCatalog');
    const sync = capabilityRoute(goal, context);
    if (sync || rerankDisabled()) return sync;
    try {
        const g = String(goal || '').trim();
        if (g.length < 6 || !ACT_VERB.test(norm(g))) return null;
        const threshold = opts.routeThreshold ?? 0.7;
        const call = resolveCall(opts);

        const terms = goalTerms(g);
        const ranked = (tools as any[])
            .filter(t => t?.name && !ROUTER_EXCLUDED.has(t.name))
            .map(t => ({ tool: t, score: scoreTool(t, terms) }))
            .sort((a, b) => b.score - a.score);
        // Always retrieve from the full registry (minus the router-excluded
        // tools, whose deterministic paths still own them): the deterministic
        // top-5 can be confidently wrong, and this path only fires when the
        // deterministic router already refused.
        const pool = registryDigest(ROUTER_EXCLUDED).map(line => line.split(' — ')[0]);
        const prompt = [
            'Pick the ONE specialist tool that best serves this request. Reply ONLY JSON, no prose, no fences: {"pick":"name","confidence":0..1}.',
            `Request: ${g.slice(0, 500)}`,
            'Every available tool (name — purpose):',
            registryDigest(ROUTER_EXCLUDED).join('\n'),
            'Rules: use ONLY a listed name; confidence is your certainty it serves the request alone.',
        ].join('\n');
        const parsed = parseRanking(await call(prompt), pool);
        if (!parsed || parsed.confidence < threshold) return null;

        const tool = (tools as any[]).find(t => t?.name === parsed.ranking[0]);
        if (!tool) return null;
        const input = inputForTool(tool, g, context);
        if (!input) return null;
        const deterministic = ranked.find(c => c.tool.name === tool.name);
        return {
            tool: tool.name,
            input,
            score: deterministic?.score ?? 0,
            runnerUp: (ranked[0]?.tool?.name && ranked[0].tool.name !== tool.name ? ranked[0].tool.name : ranked[1]?.tool?.name) || '',
            via: 'llm-rerank',
        };
    } catch {
        return null;
    }
}
