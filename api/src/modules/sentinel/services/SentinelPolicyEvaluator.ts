/**
 * The condition language for Sentinel policies, and its evaluator.
 *
 * The policy model used to declare `conditions: any // Rule definition syntax`.
 * There was no syntax — which is precisely why nothing ever evaluated it: you
 * cannot write an interpreter for a language nobody defined. The collection sat
 * there, the engine imported the model and never queried it, and an operator who
 * configured a policy got no effect whatsoever.
 *
 * So the language is defined here, and it is deliberately small:
 *
 *   { field: 'metrics.cpu', op: 'gt', value: 90 }
 *   { field: 'processes.suspiciousFound', op: 'count_gte', value: 1 }
 *   { field: 'users[].user', op: 'not_in', value: ['root', 'joe'] }
 *   { all: [ …, … ] }        every branch must match
 *   { any: [ …, … ] }        at least one branch must match
 *   { not: { … } }           the branch must not match
 *
 * Two properties matter more than expressiveness:
 *
 *   1. A policy is DATA, never code. There is no eval and no new Function. A
 *      condition that arrives from a database and executes as JavaScript is a
 *      remote code execution hole wearing a configuration hat.
 *   2. A malformed policy fails closed and says so. It does not throw into the
 *      telemetry pipeline, and it never counts as a match — an operator's typo
 *      must not silently arm or disarm a security rule.
 */

export type Comparison =
    | 'eq' | 'neq'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'contains' | 'not_contains'
    | 'matches'
    | 'in' | 'not_in'
    | 'exists' | 'missing'
    | 'count_gte' | 'count_lte';

export interface Predicate {
    field: string;
    op: Comparison;
    value?: any;
}

export type Condition =
    | Predicate
    | { all: Condition[] }
    | { any: Condition[] }
    | { not: Condition };

export interface PolicyLike {
    name: string;
    weight: number;
    conditions: any;
    autoResponse?: string;
    /** Where in the telemetry the action's target is read from. */
    autoResponseTargetField?: string;
    severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
    isActive?: boolean;
}

export interface PolicyMatch {
    name: string;
    weight: number;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    autoResponse?: string;
    autoResponseTargetField?: string;
    /** The values that made it match, for the incident's evidence. */
    evidence: Record<string, any>;
    /**
     * Which elements of which array actually matched, keyed by the array's root
     * path — `{ users: [1] }` when the second user is the one that tripped the
     * rule.
     *
     * This exists because of a bug the tests caught before it shipped: a policy
     * matched `users[].from == 'tor-exit'` (mallory) and its action then read
     * `users[].ip` across the WHOLE array and blocked the first address it
     * found, which was root's. An automatic block has to hit the element that
     * matched, not an arbitrary sibling.
     */
    matchedIndices: Record<string, number[]>;
}

export interface EvaluationResult {
    matches: PolicyMatch[];
    /** Policies that could not be evaluated, with the reason. Never silent. */
    invalid: Array<{ name: string; reason: string }>;
}

/* ---------- safety limits --------------------------------------------------- */

/** How deep a condition tree may nest before it is rejected as malformed. */
const MAX_DEPTH = 6;
/** How many predicates one policy may contain. */
const MAX_NODES = 60;
/** A user-supplied regex longer than this is refused outright. */
const MAX_PATTERN = 200;
/** Strings are truncated before a regex sees them, so a pathological pattern
 *  cannot spend unbounded time on a large telemetry blob. */
const MAX_SUBJECT = 4000;

/**
 * Catastrophic-backtracking shapes: a quantified group that itself contains a
 * quantifier, e.g. (a+)+ or (\d*)*. Refusing these is cheaper and far more
 * reliable than trying to time out a regex that has already started.
 */
const REDOS = /\((?:[^()]*[+*{][^()]*)\)\s*[+*{]/;

function safeRegex(pattern: string): RegExp | null {
    if (typeof pattern !== 'string' || !pattern || pattern.length > MAX_PATTERN) return null;
    if (REDOS.test(pattern)) return null;
    try { return new RegExp(pattern, 'i'); } catch { return null; }
}

/* ---------- reading a value out of the telemetry ---------------------------- */

/**
 * Resolve a dotted path. A `[]` segment maps over an array, so
 * `users[].user` yields every user's name and `processes.list[].pid` every pid.
 * Returns undefined when the path does not exist — never throws.
 */
export function readPath(source: any, path: string): any {
    if (!path || typeof path !== 'string') return undefined;
    let current: any = source;
    for (const rawSegment of path.split('.')) {
        if (current === undefined || current === null) return undefined;
        const mapsOverArray = rawSegment.endsWith('[]');
        const key = mapsOverArray ? rawSegment.slice(0, -2) : rawSegment;

        // The path comes from an operator-supplied policy, so it is untrusted
        // input. A field path must never reach the prototype chain — that is
        // how a "read this value" feature turns into prototype pollution or a
        // handle on a constructor.
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;

        if (key) {
            if (Array.isArray(current)) {
                // Already a list: read the key from every element.
                current = current.map(item => (item == null ? undefined : item[key]));
            } else if (typeof current !== 'object') {
                return undefined;
            } else {
                current = current[key];
            }
        }
        if (mapsOverArray && !Array.isArray(current)) {
            // `foo[]` on a non-array yields nothing rather than pretending.
            return current === undefined ? undefined : [];
        }
    }
    return current;
}

/* ---------- the comparisons ------------------------------------------------- */

const asNumber = (v: any): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
};

const asArray = (v: any): any[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

const text = (v: any): string => (v === null || v === undefined ? '' : String(v)).slice(0, MAX_SUBJECT);

/** Does ONE value satisfy the predicate? */
function compareOne(actual: any, op: Comparison, expected: any): boolean {
    switch (op) {
        case 'exists': return actual !== undefined && actual !== null;
        case 'missing': return actual === undefined || actual === null;
        case 'eq': return String(actual) === String(expected);
        case 'neq': return String(actual) !== String(expected);
        case 'gt': case 'gte': case 'lt': case 'lte': {
            const a = asNumber(actual), b = asNumber(expected);
            if (a === null || b === null) return false;
            return op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
        }
        case 'contains': return text(actual).toLowerCase().includes(text(expected).toLowerCase());
        case 'not_contains': return !text(actual).toLowerCase().includes(text(expected).toLowerCase());
        case 'matches': {
            const re = safeRegex(String(expected ?? ''));
            return re ? re.test(text(actual)) : false;
        }
        case 'in': return asArray(expected).some(e => String(e) === String(actual));
        case 'not_in': return !asArray(expected).some(e => String(e) === String(actual));
        default: return false;
    }
}

/* ---------- evaluating a condition tree ------------------------------------- */

interface EvalContext { evidence: Record<string, any>; nodes: number; indices: Record<string, number[]> }

function evaluateCondition(condition: any, telemetry: any, ctx: EvalContext, depth: number): boolean {
    if (depth > MAX_DEPTH) throw new Error(`condition nests deeper than ${MAX_DEPTH} levels`);
    if (++ctx.nodes > MAX_NODES) throw new Error(`condition has more than ${MAX_NODES} nodes`);
    if (!condition || typeof condition !== 'object') throw new Error('condition must be an object');

    if (Array.isArray((condition as any).all)) {
        const branches = (condition as any).all;
        if (!branches.length) throw new Error('"all" must contain at least one condition');
        return branches.every((c: any) => evaluateCondition(c, telemetry, ctx, depth + 1));
    }
    if (Array.isArray((condition as any).any)) {
        const branches = (condition as any).any;
        if (!branches.length) throw new Error('"any" must contain at least one condition');
        // Deliberately not short-circuiting: evidence from every matching branch
        // is worth recording on the incident.
        return branches.map((c: any) => evaluateCondition(c, telemetry, ctx, depth + 1)).some(Boolean);
    }
    if ((condition as any).not !== undefined) {
        return !evaluateCondition((condition as any).not, telemetry, ctx, depth + 1);
    }

    const { field, op, value } = condition as Predicate;
    if (typeof field !== 'string' || !field) throw new Error('predicate needs a "field"');
    if (typeof op !== 'string') throw new Error(`predicate on "${field}" needs an "op"`);

    const actual = readPath(telemetry, field);

    // Counting operators are about the collection, not its members.
    if (op === 'count_gte' || op === 'count_lte') {
        const n = Array.isArray(actual) ? actual.length : actual === undefined || actual === null ? 0 : 1;
        const want = asNumber(value);
        if (want === null) throw new Error(`"${op}" on "${field}" needs a numeric value`);
        const hit = op === 'count_gte' ? n >= want : n <= want;
        if (hit) ctx.evidence[field] = Array.isArray(actual) ? actual.slice(0, 10) : actual;
        return hit;
    }

    // A path that maps over an array matches when ANY element matches — "an
    // unauthorised user is present", not "every user is unauthorised".
    if (Array.isArray(actual) && field.includes('[]')) {
        const hitIndices: number[] = [];
        const hits: any[] = [];
        actual.forEach((v, i) => { if (compareOne(v, op, value)) { hitIndices.push(i); hits.push(v); } });
        if (hits.length) {
            ctx.evidence[field] = hits.slice(0, 10);
            // Remember WHICH elements matched, under the array's root path, so
            // an automatic action targets the offender and not a sibling.
            const root = field.slice(0, field.indexOf('[]'));
            const prev = ctx.indices[root] || [];
            ctx.indices[root] = Array.from(new Set([...prev, ...hitIndices]));
        }
        return hits.length > 0;
    }

    const hit = compareOne(actual, op, value);
    if (hit) ctx.evidence[field] = Array.isArray(actual) ? actual.slice(0, 10) : actual;
    return hit;
}

/** Check a policy's shape without running it against anything. */
export function validatePolicy(policy: PolicyLike): { ok: boolean; reason?: string } {
    if (!policy || typeof policy.name !== 'string' || !policy.name.trim()) {
        return { ok: false, reason: 'a policy needs a name' };
    }
    if (asNumber(policy.weight) === null) return { ok: false, reason: 'weight must be a number' };
    try {
        // Run the tree against an empty payload purely to exercise its shape.
        evaluateCondition(policy.conditions, {}, { evidence: {}, nodes: 0, indices: {} }, 0);
        return { ok: true };
    } catch (e: any) {
        return { ok: false, reason: String(e?.message || e) };
    }
}

/**
 * Evaluate every active policy against one telemetry payload.
 *
 * Never throws: a policy that cannot be evaluated is reported in `invalid` and
 * does NOT count as a match. An operator's typo must not be able to arm a rule,
 * disarm one, or take the telemetry pipeline down.
 */
export function evaluatePolicies(policies: PolicyLike[], telemetry: any): EvaluationResult {
    const matches: PolicyMatch[] = [];
    const invalid: Array<{ name: string; reason: string }> = [];

    for (const policy of policies || []) {
        if (policy?.isActive === false) continue;
        const shape = validatePolicy(policy);
        if (!shape.ok) {
            invalid.push({ name: policy?.name || '(unnamed)', reason: shape.reason! });
            continue;
        }
        const ctx: EvalContext = { evidence: {}, nodes: 0, indices: {} };
        let hit = false;
        try {
            hit = evaluateCondition(policy.conditions, telemetry, ctx, 0);
        } catch (e: any) {
            invalid.push({ name: policy.name, reason: String(e?.message || e) });
            continue;
        }
        if (!hit) continue;
        matches.push({
            name: policy.name,
            weight: asNumber(policy.weight) ?? 0,
            severity: policy.severity || 'medium',
            autoResponse: policy.autoResponse,
            autoResponseTargetField: policy.autoResponseTargetField,
            evidence: ctx.evidence,
            matchedIndices: ctx.indices,
        });
    }
    return { matches, invalid };
}
