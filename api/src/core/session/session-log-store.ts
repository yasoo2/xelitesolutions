/**
 *  A LOG NOBODY WROTE DOWN CANNOT BE SHOWN AGAIN.
 *
 *  «كل الجلسات السابقة لا تعرض على البرفيو واللوجز ما تم في تلك الجلسة».
 *
 *  The preview came back the moment something asked the server for it — the
 *  built directory was on disk the whole time. The logs did not, and the
 *  reason was worse than a missing question: measured on his own store,
 *
 *      grep 6a8c1ef9433c894099603359 run-evidence.json   →  0
 *      grep 6a8c0be84bb5104928e21f46 run-evidence.json   →  0
 *      grep 6a8c269c433c89409960335d run-evidence.json   →  0
 *
 *  Not one of the sessions he can see in the row at the bottom had a single
 *  recorded event. run-evidence only ever held the agent-run pipeline; the
 *  build lines he actually watches were broadcast to a socket and then
 *  forgotten. Nothing on this machine could restore them, because nothing
 *  had written them down.
 *
 *  So they are written down here, at the ONE place every one of them passes
 *  through: broadcast() hands each event to its observers before anything
 *  else happens — «even the ones sent before a socket exists». Whatever the
 *  Logs panel would have drawn is what this keeps, produced by the same
 *  logTextFor the panel itself uses, so a restored line is not a summary of
 *  what happened but the line that happened.
 *
 *  Same disk pattern as the page and project stores: load at boot, debounced
 *  write after mutation, bounded, best-effort.
 */
import fs from 'fs';
import path from 'path';
import { logTextFor, logStampFor } from './log-line';

/** Enough to fill the panel several times; small enough to write often. */
export const MAX_LINES_PER_SESSION = 500;
/** Newest sessions only — the row at the bottom of his screen is short. */
export const MAX_PERSISTED_SESSIONS = 40;
const DEBOUNCE_MS = 1200;

function storeDir(): string {
    return String(process.env.JOE_CHAT_STORE_DIR || '').trim()
        || path.join(process.cwd(), 'data', 'db');
}
const logsFile = () => path.join(storeDir(), 'joe-session-logs.json');

interface SessionLog { lines: string[]; at: number; }

function store(): Record<string, SessionLog> {
    const g: any = global as any;
    if (!g.joeSessionLogs || typeof g.joeSessionLogs !== 'object' || Array.isArray(g.joeSessionLogs)) g.joeSessionLogs = {};
    return g.joeSessionLogs;
}

/** Trim to the newest N sessions by their recorded time. */
function bounded(all: Record<string, SessionLog>): Record<string, SessionLog> {
    const keys = Object.keys(all);
    if (keys.length <= MAX_PERSISTED_SESSIONS) return all;
    const newest = keys
        .sort((a, b) => (all[b]?.at || 0) - (all[a]?.at || 0))
        .slice(0, MAX_PERSISTED_SESSIONS);
    return Object.fromEntries(newest.map(k => [k, all[k]]));
}

let timer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(): void {
    if (timer) return;
    timer = setTimeout(() => {
        timer = null;
        try {
            const dir = storeDir();
            fs.mkdirSync(dir, { recursive: true });
            //  Written whole, to a temporary file, then moved into place.
            //  run-evidence.json on this machine is currently UNPARSEABLE —
            //  a second copy of its tail sits after the closing bracket — and
            //  a half-written store is worse than no store: it takes the
            //  reader down with it. A rename is the closest thing a
            //  filesystem gives to writing all of it or none of it.
            const target = logsFile();
            const temp = target + '.tmp';
            fs.writeFileSync(temp, JSON.stringify(bounded(store())), 'utf-8');
            fs.renameSync(temp, target);
        } catch { /* best effort: a log that cannot be saved is not an outage */ }
    }, DEBOUNCE_MS);
    (timer as any).unref?.();
}

/** Load at boot, once, and never over the top of a store already in memory. */
export function loadSessionLogs(): void {
    try {
        const g: any = global as any;
        if (g.joeSessionLogs && Object.keys(g.joeSessionLogs).length > 0) return;
        const raw = fs.readFileSync(logsFile(), 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) g.joeSessionLogs = parsed;
    } catch { /* no file yet is the normal first run */ }
}

/**
 *  Record whatever this event would have printed, for the session that owns it.
 *  An event with no session is transport chatter and belongs to nobody.
 */
export function recordSessionEvent(sessionId: unknown, event: any): void {
    const id = String(sessionId || '').trim();
    if (!id) return;
    const lines = logTextFor(event);
    if (!lines.length) return;
    const stamp = logStampFor(event?.ts);
    const all = store();
    const current = all[id] || { lines: [], at: 0 };
    const next = current.lines.concat(lines.map(l => `[${stamp}] ${l}`));
    all[id] = {
        lines: next.length > MAX_LINES_PER_SESSION ? next.slice(-MAX_LINES_PER_SESSION) : next,
        at: Date.now(),
    };
    schedulePersist();
}

/** What this session printed, in the order it printed it. */
export function sessionLogLines(sessionId: unknown): string[] {
    const id = String(sessionId || '').trim();
    if (!id) return [];
    return (store()[id]?.lines || []).slice();
}
