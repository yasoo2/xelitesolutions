export type FinishedVisibleRun = { sessionId: string; runId: string };

/** Presentation receipts only: absence asks for durable history, never implies success. */
export class RunHistoryRecovery {
    private visibleSessionId = '';
    private observedRunId = '';
    private readonly pending = new Set<string>();
    private readonly retryAfterFailure = new Set<string>();
    private readonly refreshed = new Set<string>();

    observe(sessionId: string | undefined, running: ReadonlySet<string>, runIds: ReadonlyMap<string, string>): FinishedVisibleRun | null {
        const sid = String(sessionId || '').trim();
        const currentRunId = running.has(sid) ? String(runIds.get(sid) || '').trim() : '';
        if (sid !== this.visibleSessionId) {
            this.visibleSessionId = sid;
            this.observedRunId = currentRunId;
            return null;
        }
        const previousRunId = this.observedRunId;
        // An optimistic successor has no id yet. Do not mistake it for an old
        // run ending, or carry the old identity into its eventual completion.
        this.observedRunId = currentRunId;
        if (!sid || running.has(sid) || !previousRunId) return null;
        return { sessionId: sid, runId: previousRunId };
    }

    claim(sessionId: string, runId: string, finalEvent = false): boolean {
        const sid = String(sessionId || '').trim();
        const rid = String(runId || '').trim();
        if (!sid || !rid) return false;
        const key = JSON.stringify([sid, rid]);
        if (this.refreshed.has(key)) return false;
        if (this.pending.has(key)) {
            if (finalEvent) this.retryAfterFailure.add(key);
            return false;
        }
        if (this.pending.size >= 256) return false;
        this.pending.add(key);
        return true;
    }

    settle(sessionId: string, runId: string, answered: boolean): boolean {
        const key = JSON.stringify([sessionId, runId]);
        this.pending.delete(key);
        const retry = this.retryAfterFailure.delete(key);
        // A failed read, or an early cancellation snapshot without this run's
        // durable reply, must not suppress a later real final-event retry.
        if (!answered) return retry;
        this.refreshed.add(key);
        // Match the transport's bounded recent-run receipt policy.
        if (this.refreshed.size > 256) this.refreshed.delete(this.refreshed.values().next().value!);
        return false;
    }
}
