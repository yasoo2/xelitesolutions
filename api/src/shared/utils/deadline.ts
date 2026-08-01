/**
 * Wall-clock deadlines for work that must never hang the user's screen.
 *
 * The orchestrator's stall detector runs BETWEEN loop iterations — if a
 * node's await hangs inside a tool (a socket that never answers, a provider
 * that accepted the request and went silent), the loop is frozen inside that
 * await and no detector ever fires. That is exactly the «مهام معلقة للأبد»
 * the user reported on day one.
 *
 * withDeadline() puts a hard wall-clock limit around any promise. On expiry
 * the caller gets an honest `deadline_exceeded` error — the run FAILS VISIBLY
 * with a reason instead of spinning forever. The underlying work is not
 * cancelled (JS cannot force-cancel an await), but the user's screen is
 * released and told the truth, and a retried build resumes from checkpoints.
 */
export class DeadlineError extends Error {
    constructor(label: string, ms: number) {
        super(`deadline_exceeded: ${label} exceeded ${Math.round(ms / 1000)}s wall-clock`);
        this.name = 'DeadlineError';
    }
}

export function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms);
        // Never keep the process alive just to enforce a deadline.
        (timer as any).unref?.();
        work.then(
            v => { clearTimeout(timer); resolve(v); },
            e => { clearTimeout(timer); reject(e); },
        );
    });
}

/** A node (one tool/agent step) may legitimately run long on a slow CPU — but not forever. */
export const NODE_DEADLINE_MS = Math.max(60_000, Number(process.env.JOE_NODE_DEADLINE_MS) || 15 * 60_000);

/** The whole run's ceiling — beyond this, honesty beats hope. */
export const RUN_DEADLINE_MS = Math.max(5 * 60_000, Number(process.env.JOE_RUN_DEADLINE_MS) || 45 * 60_000);
