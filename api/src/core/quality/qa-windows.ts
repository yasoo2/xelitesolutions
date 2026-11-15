/**
 * THE VERIFICATION'S OWN WINDOWS: WHEN A CHANGE TO THE OWNER'S DATA MAY HAVE COME FROM JOE'S CHECKS.
 *
 * Design v13.3 §5b step 4. On path 2T the recovery watcher (`qa-leaves-no-trace.ts › watchAppData`) sees every
 * change to the app's data files from the snapshot to the end of the put-back. A change inside one of these
 * windows may be the checks' own; a change outside every window is «unexplained» and told as `recoveryKept`
 * («did not come from the checks» — never «it was yours»).
 *
 * The windows of one verification, created by `verify.ts` and passed down:
 *   - `project_run`'s start (call → first answer);
 *   - every request of the walks and of the browser probes (`QaFence.windows()`, added with `add`);
 *   - every request the in-process probes make (`isolation-probe.ts`, `request-coverage.ts › probeServedResources`),
 *     the project's own tests (the whole run of the test command), the mend's rebuild, the restart inside
 *     `putQaRecordsBack(true)`, `project_stop` (call → exit), and the put-back itself — each through `around`.
 *
 * Each window counts until 1 s after its end; a `long` one (a response open > 5 s, a tunnel) counts only for
 * its first second.
 */
import type { QaWindow } from './qa-fence';

export type { QaWindow } from './qa-fence';

/** A window counts this long after its end: the app's write lands a moment after it answers. */
export const QA_WINDOW_GRACE_MS = 1000;

export interface QaWindows {
    /** Runs `fn` inside a window named `what` (its start → its end, success or throw). */
    around<T>(what: string, fn: () => Promise<T>): Promise<T>;
    /** Adds a window measured elsewhere (the fence's requests). */
    add(w: QaWindow): void;
    /** Every window so far, in the order they were added. */
    list(): QaWindow[];
}

/** One verification's windows. `now` is for tests. */
export function createQaWindows(now: () => number = Date.now): QaWindows {
    const kept: QaWindow[] = [];
    return {
        async around<T>(what: string, fn: () => Promise<T>): Promise<T> {
            const start = now();
            try { return await fn(); }
            finally { kept.push({ start, end: now(), long: false, what: String(what) }); }
        },
        add(w: QaWindow) {
            if (!w || !Number.isFinite(w.start)) return;
            kept.push({ start: w.start, end: Number.isFinite(w.end) ? w.end : w.start, long: !!w.long, what: String(w.what ?? '') });
        },
        list: () => kept.map(w => ({ ...w })),
    };
}

/** The span a window explains: [start, end + 1 s], or [start, start + 1 s] for a long one. */
export function windowSpan(w: QaWindow, graceMs = QA_WINDOW_GRACE_MS): { from: number; to: number } {
    return w.long ? { from: w.start, to: w.start + graceMs } : { from: w.start, to: Math.max(w.start, w.end) + graceMs };
}

/** Whether a change seen at `at` falls inside one of the verification's windows. */
export function explained(at: number, windows: readonly QaWindow[], graceMs = QA_WINDOW_GRACE_MS): boolean {
    return windows.some(w => { const s = windowSpan(w, graceMs); return at >= s.from && at <= s.to; });
}

/** The files with a change outside every window (each named once, in the order first seen): `recoveryKept({files})`. */
export function unexplainedFiles(changes: ReadonlyArray<{ file: string; at: number }>, windows: readonly QaWindow[], graceMs = QA_WINDOW_GRACE_MS): string[] {
    const out: string[] = [];
    for (const c of changes) if (!explained(c.at, windows, graceMs) && !out.includes(c.file)) out.push(c.file);
    return out;
}
