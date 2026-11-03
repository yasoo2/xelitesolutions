/**
 * EVERY PART THAT WAS BUILT, NOT ONLY THE LAST ONE.
 *
 * Round 15 (P101): the session's project slot holds ONE root, and every
 * builder overwrites it — api-rest was bound, then react-rest replaced it,
 * and delivery judged only the last. This ledger keeps every root a phase
 * bound in the current pipeline run, so delivery can measure each part.
 * It lives beside the project slot, never inside it: builders rewrite that
 * slot wholesale.
 */
import path from 'path';

export interface DeliveryPart {
    root: string;
    /** The tool whose evidence bound it — a hint only; roles come from evidence on disk. */
    tool: string;
}

/**
 * ONE ENTRY PER (SESSION, RUN), FREED WHEN THE RUN ENDS.
 *
 * Round 15 review: the store held one {runId, parts} per session and a new
 * run REPLACED it — a second build in the same session (tools and runs share
 * a sessionId concurrently) wiped the first run's parts mid-flight, so it
 * measured only its last root again (the P101 gap this ledger closes), and
 * nothing was ever freed on a server with thousands of sessions. Entries are
 * now keyed by session AND run, and the pipeline clears its own entry when it
 * starts and when it ends.
 */
function store(): Map<string, DeliveryPart[]> {
    const g: any = global as any;
    if (!(g.joeDeliveryParts instanceof Map)) g.joeDeliveryParts = new Map<string, DeliveryPart[]>();
    return g.joeDeliveryParts;
}

const runIdOf = (runId: unknown) => String(runId || '').trim();
const entryKey = (sessionKey: string, runId: unknown) => `${String(sessionKey || 'default')}\u0000${runIdOf(runId)}`;

/** Record a bound root for this session's run. */
export function recordDeliveryPart(sessionKey: string, runId: unknown, part: DeliveryPart): DeliveryPart[] {
    const all = store();
    const key = entryKey(sessionKey, runId);
    const parts = all.get(key) || [];
    const root = path.resolve(String(part.root || ''));
    if (part.root && !parts.some(p => path.resolve(p.root) === root)) {
        parts.push({ root, tool: String(part.tool || '') });
    }
    all.set(key, parts);
    return parts.map(p => ({ ...p }));
}

/** The parts bound in THIS run only — never another run's. */
export function deliveryPartsForRun(sessionKey: string, runId: unknown): DeliveryPart[] {
    return (store().get(entryKey(sessionKey, runId)) || []).map(p => ({ ...p }));
}

/** Forget this run's parts: a retried pipeline in the same run starts clean, and the store stays bounded. */
export function clearDeliveryParts(sessionKey: string, runId: unknown): void {
    store().delete(entryKey(sessionKey, runId));
}

/** How many runs currently hold parts (a bound the tests can check). */
export function deliveryPartRunsForTests(): number {
    return store().size;
}
