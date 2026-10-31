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

/**
 * Strict session binding for the server's conversation-only autonomy mode.
 * It reads the same restored local store as the session API, never mints a
 * session, and does not grant workspace write access or filesystem ownership.
 */
export async function resolveAutonomousSessionIdentity(sid: string): Promise<SessionIdentity | null> {
    const { autonomousIdentity } = await import('./AutonomousDevelopmentPolicy');
    const id = autonomousIdentity(sid);
    if (!id) return null;
    try {
        const { usesLocalChatStore } = await import('../../api/chat-store');
        const m = await import('mongoose');
        const mongoose: any = (m as any).default || m;
        const storedId = (value: unknown): string | null => {
            if (typeof value === 'string') return autonomousIdentity(value);
            if (value instanceof mongoose.Types.ObjectId) return (value as { toHexString(): string }).toHexString();
            return null;
        };
        let session: any;
        if (usesLocalChatStore()) {
            const sessions: unknown = (global as any).mockSessions;
            if (!Array.isArray(sessions) || sessions.length > 10_000) return null;
            const matches = sessions.filter((entry: any) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
                return storedId(entry.id) === id || storedId(entry._id) === id;
            });
            if (matches.length !== 1) return null;
            session = matches[0];
            const publicId = session.id === undefined ? null : storedId(session.id);
            const databaseId = session._id === undefined ? null : storedId(session._id);
            if (session.id !== undefined && !publicId) return null;
            if (session._id !== undefined && !databaseId) return null;
            if (publicId && databaseId && publicId !== databaseId) return null;
        } else {
            if (mongoose.connection.readyState !== 1 || !mongoose.Types.ObjectId.isValid(id)) return null;
            const { Session } = await import('../../shared/models/session');
            session = await Session.findById(id).select({ userId: 1, workspaceId: 1, status: 1 }).lean();
        }
        if (!session || (session.status !== undefined && session.status !== 'active')) return null;
        const userId = autonomousIdentity(session.userId);
        const workspaceId = storedId(session.workspaceId);
        if (!userId || !workspaceId) return null;
        return Object.freeze({ userId, workspaceId });
    } catch {
        return null;
    }
}
