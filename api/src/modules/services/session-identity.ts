/**
 * WHO OWNS THIS SESSION?
 *
 * One question, asked in one place. It used to live inline inside the tool
 * gate, tangled with the database import, which had two costs: the gate could
 * only be tested with a live database, and the answer was used only to FILL a
 * missing identity — never to check a supplied one.
 *
 * Pulled out here it becomes a rule with a name: a session has an owner, and
 * whoever calls with someone else's session id is not that owner.
 */
export interface SessionIdentity {
    userId?: string;
    workspaceId?: string;
}

/** Mongo ids and ObjectIds both arrive; the comparison needs one shape. */
export function normalizeId(v: any): string {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    try { return String(v?._id ?? v).trim(); } catch { return ''; }
}

/**
 * Read the owner of a session, or null when it cannot be known — no database,
 * no such session, an id that is not one. «Cannot be known» is never «anyone
 * may pass»: the caller keeps whatever checks it already had.
 */
export async function resolveSessionIdentity(sid: string): Promise<SessionIdentity | null> {
    const id = String(sid || '').trim();
    if (!id) return null;
    try {
        const m = await import('mongoose');
        const mongoose: any = (m as any).default || m;
        if (!mongoose?.Types?.ObjectId?.isValid?.(id)) return null;
        if (mongoose?.connection?.readyState !== 1) return null;
        const { Session } = await import('../../shared/models/session');
        const sess: any = await Session.findById(id).select({ userId: 1, workspaceId: 1 }).lean();
        if (!sess) return null;
        return { userId: normalizeId(sess.userId), workspaceId: normalizeId(sess.workspaceId) };
    } catch {
        return null;
    }
}
