/**
 *  ⛔ A RUN THE OWNER CAN SEE, AND A STOP BUTTON THAT STOPS.
 *
 *  Measured on his machine, 2026-08-28, on `aadb073`, watching a build he had
 *  started himself:
 *
 *      [17:30:20] Reading your request and working out exactly what you want
 *      [17:30:26] ▶ react_project
 *      …
 *      18:39:55   log count 271 — LAST LINE STILL [17:30:26]
 *
 *  **Sixty-nine minutes, zero lines.** The counter in the UI kept ticking
 *  (`68:35`) while the log said nothing at all. For comparison, a healthy run
 *  of the same request that morning had emitted 93 lines inside two minutes.
 *  This is not slowness — it is silence.
 *
 *  TWO SEPARATE FAULTS PRODUCED IT, and each has its own repair here.
 *
 *  ⛔ ONE — NOTHING SPEAKS WHILE A TOOL RUNS. `executeTool` awaits
 *  `tDef.execute(...)` with no deadline and no heartbeat, and the tool's own
 *  lines are flushed only after it RETURNS. ToolService says so in its own
 *  comment: «this is NOT real-time — it runs after the tool has returned,
 *  which for a page build means minutes of silence and then a flood». When the
 *  tool never returns, the flood never comes, and the owner is left with a
 *  spinner and no sentence he can act on.
 *
 *  The repair is NOT a ceiling. A guessed timeout kills legitimate long builds
 *  and would be one more number nothing measured — the ceiling that was right
 *  at 18000 and wrong at 40000 is the lesson. What is missing is a VOICE: a
 *  line, at a widening interval, naming the tool and how long it has been in
 *  there. «react_project — still running, 4m» is a sentence he can act on.
 *  Silence is not.
 *
 *  ⛔ TWO — STOP WAS A DEAD CONTROL. `POST /runs/stop` read, in full:
 *
 *      // Basic stop logic - since orchestrator is stateless per-request in
 *      // this version, we mark the run as failed in DB.
 *      await Run.findByIdAndUpdate(runId, { $set: { status: 'failed' } });
 *      res.json({ ok: true });
 *
 *  It writes a database field and answers `ok: true` about work that is still
 *  running. Pressed twice on that hung build; the run went on. **Joe blocks
 *  delivery of pages that contain dead controls, and shipped one.** A control
 *  that reports success for an effect it did not have is the same class as a
 *  guard that measures something adjacent to its claim — and it is worse here,
 *  because the owner is told the opposite of what happened.
 *
 *  So a run registers a handle before it starts, and stopping LOOKS IT UP and
 *  trips it. Nothing is guessed and nothing is killed by a clock: the run ends
 *  because the owner said so.
 */

/** What a stopped run rejects with, so callers can tell it from a real error. */
export const CANCELLED = 'run_cancelled_by_owner';

export interface Cancellable {
    /** True once the owner has asked for this run to stop. */
    cancelled: boolean;
    /** Resolves the moment the owner asks, and never otherwise. */
    whenCancelled: Promise<void>;
    /** Trip it. Idempotent — a second stop is not a second event. */
    cancel: () => void;
}

/**
 *  Live runs, by key. A run appears here for exactly as long as it is running:
 *  `release` is what keeps a long session from accumulating handles for work
 *  that finished hours ago.
 */
const live = new Map<string, Set<Cancellable>>();

/**
 *  Register a run under every id the stop request might arrive with.
 *
 *  ⛔ A SET, NOT A HANDLE — AND THAT IS NOT TIDINESS, IT IS THE SAME DEFECT
 *  COMING BACK.
 *
 *  `AgentOrchestrator.ts:706` runs a batch of nodes with `Promise.all`, so two
 *  tools share one `sessionId` at the same moment. With one handle per key the
 *  second `registerRun` OVERWRITES the first, and the first tool's `releaseRun`
 *  then DELETES the second one's — so Stop finds nothing, or finds the wrong
 *  run, and answers about work it never reached.
 *
 *  That is exactly the control this file exists to repair, rebuilt one layer
 *  in: a button that reports an effect it did not have. Every live run is held,
 *  a stop trips all of them under that id, and a release removes only its own.
 */
export function registerRun(...keys: Array<string | undefined | null>): Cancellable {
    let trip: () => void = () => { /* replaced below */ };
    const handle: Cancellable = {
        cancelled: false,
        whenCancelled: new Promise<void>(resolve => { trip = resolve; }),
        cancel: () => {
            if (handle.cancelled) return;
            handle.cancelled = true;
            trip();
        },
    };
    for (const k of keys) {
        if (!k) continue;
        const key = String(k);
        const set = live.get(key) || new Set<Cancellable>();
        set.add(handle);
        live.set(key, set);
    }
    return handle;
}

/** Forget a finished run, whatever it did. */
export function releaseRun(...keys: Array<string | undefined | null>): void {
    //  Without the handle this removes EVERY run under the key, including a
    //  concurrent one that is still going — the clobber wearing the opposite
    //  face. Callers that have their handle pass it; the key-only form stays
    //  for a caller that genuinely means «this session is finished».
    for (const k of keys) if (k) live.delete(String(k));
}

/** Forget one specific run, leaving anything else under the same key alone. */
export function releaseHandle(handle: Cancellable, ...keys: Array<string | undefined | null>): void {
    for (const k of keys) {
        if (!k) continue;
        const key = String(k);
        const set = live.get(key);
        if (!set) continue;
        set.delete(handle);
        if (!set.size) live.delete(key);
    }
}

/**
 *  Stop a run by any id the caller knows it by.
 *
 *  ⛔ RETURNS WHETHER ANYTHING WAS ACTUALLY STOPPED, and the route reports
 *  that instead of an unconditional `ok`. «I could not find that run» is a
 *  fact the owner can act on — press it again, reload, report it. `ok: true`
 *  over a run that kept going is the sentence that sent him hunting a build
 *  defect for an hour.
 */
export function stopRun(...keys: Array<string | undefined | null>): boolean {
    let stopped = false;
    for (const k of keys) {
        if (!k) continue;
        for (const h of live.get(String(k)) || []) { h.cancel(); stopped = true; }
    }
    return stopped;
}

/** Is this run currently registered and still running? Test seam, and honest. */
export function isRunning(key: string | undefined | null): boolean {
    if (!key) return false;
    for (const h of live.get(String(key)) || []) if (!h.cancelled) return true;
    return false;
}

/** Only for tests — a leaked handle between cases is a false green. */
export function _clearRuns(): void { live.clear(); }

export interface AttendOptions<T> {
    /** The work. Started immediately; never interrupted, only outlived. */
    work: () => Promise<T>;
    /** Called with each heartbeat sentence, in the owner's terminal. */
    say: (line: string) => void;
    /** What the owner is waiting on, named the way he asked for it. */
    what: string;
    /** The handle from `registerRun`, when this run can be stopped. */
    handle?: Cancellable;
    /** First beat after this long. Doubles each time, to a ceiling. */
    firstBeatMs?: number;
    maxBeatMs?: number;
    /** Test seams. Real callers pass nothing. */
    setTimer?: (fn: () => void, ms: number) => any;
    clearTimer?: (t: any) => void;
    now?: () => number;
}

/** «4m» / «45s» — the number he would say out loud, not milliseconds. */
export function humanElapsed(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 90) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

/**
 *  Run the work with a voice and a stop.
 *
 *  ⛔ THE WORK IS NEVER KILLED. There is no way to abort an arbitrary awaited
 *  promise in JavaScript, and pretending otherwise would be a second dead
 *  control. What this does is stop WAITING on it and say so, which is the
 *  honest half — and the half the owner actually needed at minute nine.
 */
export async function attendRun<T>(opts: AttendOptions<T>): Promise<T> {
    const setTimer = opts.setTimer || ((fn: () => void, ms: number) => setTimeout(fn, ms));
    const clearTimer = opts.clearTimer || ((t: any) => clearTimeout(t));
    const now = opts.now || (() => Date.now());
    const first = Math.max(1, opts.firstBeatMs ?? 30_000);
    const ceiling = Math.max(first, opts.maxBeatMs ?? 120_000);

    const started = now();
    let timer: any = null;
    let stopped = false;

    const beat = (waitMs: number) => {
        timer = setTimer(() => {
            if (stopped) return;
            //  ⛔ THE SENTENCE HE CAN ACT ON: what, and for how long. Without
            //  the name it is a spinner in words; without the elapsed time he
            //  cannot tell a slow build from a hung one.
            opts.say(`${opts.what} — still running, ${humanElapsed(now() - started)}`);
            beat(Math.min(waitMs * 2, ceiling));
        }, waitMs);
    };
    beat(first);

    const finish = () => { stopped = true; if (timer !== null) clearTimer(timer); timer = null; };

    try {
        if (!opts.handle) return await opts.work();
        //  Already stopped before the work began — do not start a run the
        //  owner has cancelled and then report it as his.
        if (opts.handle.cancelled) throw new Error(CANCELLED);
        return await Promise.race([
            opts.work(),
            opts.handle.whenCancelled.then(() => {
                opts.say(`${opts.what} — stopped at your request after ${humanElapsed(now() - started)}`);
                throw new Error(CANCELLED);
            }),
        ]);
    } finally {
        finish();
    }
}
