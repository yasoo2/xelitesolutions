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

interface RunParts { runId: string; parts: DeliveryPart[] }

function store(): Record<string, RunParts> {
    const g: any = global as any;
    if (!g.joeDeliveryParts || typeof g.joeDeliveryParts !== 'object') g.joeDeliveryParts = {};
    return g.joeDeliveryParts;
}

const runIdOf = (runId: unknown) => String(runId || '').trim();

/** Record a bound root for this session's run; a new run starts a new ledger. */
export function recordDeliveryPart(sessionKey: string, runId: unknown, part: DeliveryPart): DeliveryPart[] {
    const id = runIdOf(runId);
    const key = String(sessionKey || 'default');
    const all = store();
    const current = all[key] && all[key].runId === id ? all[key] : { runId: id, parts: [] };
    const root = path.resolve(String(part.root || ''));
    if (part.root && !current.parts.some(p => path.resolve(p.root) === root)) {
        current.parts.push({ root, tool: String(part.tool || '') });
    }
    all[key] = current;
    return current.parts.map(p => ({ ...p }));
}

/** The parts bound in THIS run only — never another run's. */
export function deliveryPartsForRun(sessionKey: string, runId: unknown): DeliveryPart[] {
    const entry = store()[String(sessionKey || 'default')];
    if (!entry || entry.runId !== runIdOf(runId)) return [];
    return entry.parts.map(p => ({ ...p }));
}
