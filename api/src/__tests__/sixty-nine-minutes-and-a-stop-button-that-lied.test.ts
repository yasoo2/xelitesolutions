/**
 * SIXTY-NINE MINUTES OF SILENCE, AND A STOP BUTTON THAT ANSWERED `ok: true`.
 *
 * Measured on his machine on `aadb073`, on a build he started and watched:
 *
 *     [17:30:20] Reading your request and working out exactly what you want
 *     [17:30:26] ▶ react_project
 *     …
 *     18:39:55   log count 271 — LAST LINE STILL [17:30:26]
 *
 * Zero lines in sixty-nine minutes, while the UI counter read `68:35`. The
 * same request that morning had emitted 93 lines inside two minutes, so this
 * was not slowness. And the log panel was re-read live to prove the panel
 * itself was not stale — the count came back 271 and the tail unchanged.
 *
 * ⛔ AND STOP WAS PRESSED TWICE. `POST /runs/stop` set a database field and
 * answered `ok: true`; the run went on. **Joe blocks delivery of pages that
 * contain dead controls, and shipped one** — and one that reports the opposite
 * of what happened, which is worse than a control that does nothing visibly.
 *
 * ⛔ WHAT THIS FILE REFUSES TO ASSERT. Not that `attendRun` computes a nice
 * sentence — that would be a guard on spelling. It drives the thing: work that
 * hangs must produce lines, work that is quick must produce none, and a stop
 * must end the wait and SAY it did. Broken five ways before being believed;
 * every sabotage is written at the bottom of this file with what it reddened.
 */

import {
    attendRun,
    registerRun,
    releaseRun,
    releaseHandle,
    stopRun,
    isRunning,
    humanElapsed,
    CANCELLED,
    _clearRuns,
} from '../core/session/attended-run';

/** A clock and a timer queue under the test's control — no real waiting. */
function fakeClock() {
    let t = 0;
    const queue: Array<{ at: number; fn: () => void; id: number }> = [];
    let nextId = 1;
    return {
        now: () => t,
        setTimer: (fn: () => void, ms: number) => {
            const id = nextId++;
            queue.push({ at: t + ms, fn, id });
            return id;
        },
        clearTimer: (id: any) => {
            const i = queue.findIndex(q => q.id === id);
            if (i >= 0) queue.splice(i, 1);
        },
        /** Advance, firing anything due, the way a real clock would. */
        advance: async (ms: number) => {
            const target = t + ms;
            for (; ;) {
                queue.sort((a, b) => a.at - b.at);
                const next = queue[0];
                if (!next || next.at > target) break;
                queue.shift();
                t = next.at;
                next.fn();
                await Promise.resolve();
            }
            t = target;
            await Promise.resolve();
        },
        /** Timers still queued — a finished run must leave none behind. */
        pending: () => queue.length,
    };
}

/** Work that never finishes — the shape of the hang, not a slow version of it. */
const neverReturns = () => new Promise<string>(() => { /* exactly what happened */ });

beforeEach(() => _clearRuns());

describe('a run the owner can see', () => {
    it('⛔ POSITIVE — work that hangs SAYS SO, naming itself and the elapsed time', async () => {
        //  The defect in one assertion: at minute nine of his build there was
        //  nothing on screen but a counter. There must be sentences.
        const clock = fakeClock();
        const said: string[] = [];
        const handle = registerRun('sess-1');
        const p = attendRun({
            work: neverReturns,
            say: l => said.push(l),
            what: 'react_project',
            handle,
            firstBeatMs: 30_000,
            maxBeatMs: 120_000,
            setTimer: clock.setTimer,
            clearTimer: clock.clearTimer,
            now: clock.now,
        });
        p.catch(() => { /* it never resolves; the beats are the claim */ });

        await clock.advance(29_000);
        expect(said).toEqual([]);           // not chatty before there is anything to say
        await clock.advance(2_000);
        expect(said.length).toBe(1);
        expect(said[0]).toContain('react_project');
        //  30s, not 31s: the beat fires AT its deadline, so the elapsed time it
        //  reports is the deadline itself. My first expectation here was 31s
        //  and the code was right — written down because a guard corrected by
        //  loosening it until it passes is how a test stops being evidence.
        expect(said[0]).toContain('30s');

        //  ⛔ AND IT KEEPS SPEAKING. One line at minute one and silence after
        //  is the same defect with a nicer opening: at 17:39 he still had to
        //  guess whether anything was alive.
        await clock.advance(10 * 60_000);
        expect(said.length).toBeGreaterThan(4);
        expect(said[said.length - 1]).toMatch(/still running, \d+m/);

        stopRun('sess-1');
    });

    it('⛔ NEGATIVE — work that returns quickly says NOTHING', async () => {
        //  A heartbeat on every tool call would bury the lines that matter.
        //  The claim is «speak when silence would be misleading», not «speak».
        const clock = fakeClock();
        const said: string[] = [];
        const out = await attendRun({
            work: async () => 'built',
            say: l => said.push(l),
            what: 'react_project',
            firstBeatMs: 30_000,
            setTimer: clock.setTimer,
            clearTimer: clock.clearTimer,
            now: clock.now,
        });
        expect(out).toBe('built');
        //  ⛔ AND THE TIMER IS GONE, NOT MERELY MUTED. Measured: removing the
        //  `stopped` flag while leaving `clearTimer` in place left this test
        //  green, so "nothing was said" was not the claim it looked like — a
        //  muted beat still holds the event loop open for every tool call Joe
        //  makes. The leak is the defect; silence is only its symptom.
        expect(clock.pending()).toBe(0);
        await clock.advance(10 * 60_000);
        expect(said).toEqual([]);           // and no beat fires after it finished
    });
});

describe('a stop button that stops', () => {
    it('⛔ POSITIVE — stopping ends the wait and says it was HIS doing', async () => {
        //  He pressed it twice and the run continued. The wait must end, and
        //  the reason must be his, not a timeout wearing his name.
        const clock = fakeClock();
        const said: string[] = [];
        const handle = registerRun('sess-2', 'run-abc');
        const p = attendRun({
            work: neverReturns,
            say: l => said.push(l),
            what: 'react_project',
            handle,
            firstBeatMs: 30_000,
            setTimer: clock.setTimer,
            clearTimer: clock.clearTimer,
            now: clock.now,
        });
        await clock.advance(45_000);
        //  Stopped by the OTHER id the request might carry — the route knows a
        //  runId, the tool layer knows a sessionId, and a stop that only works
        //  through one of them is a stop that works on some screens.
        expect(stopRun('run-abc')).toBe(true);
        await expect(p).rejects.toThrow(CANCELLED);
        expect(said.some(l => /stopped at your request/.test(l))).toBe(true);
    });

    it('⛔ NEGATIVE — stopping an unknown run reports FALSE, it does not answer ok', async () => {
        //  This is the whole defect in miniature. `res.json({ ok: true })` over
        //  a run nothing stopped is what sent him hunting a build defect for an
        //  hour. «I did not find that run» is a fact he can act on.
        expect(stopRun('a-run-that-was-never-registered')).toBe(false);
        expect(stopRun(undefined, null, '')).toBe(false);
    });

    it('⛔ NEGATIVE — stopping one run does not stop another', async () => {
        //  Cross-cancellation would be worse than no stop at all: the owner
        //  ends work he never asked to end, and the log blames him for it.
        const clock = fakeClock();
        const mine = registerRun('sess-mine');
        const other = registerRun('sess-other');
        const p = attendRun({
            work: neverReturns, say: () => { }, what: 'react_project', handle: mine,
            firstBeatMs: 30_000, setTimer: clock.setTimer, clearTimer: clock.clearTimer, now: clock.now,
        });
        p.catch(() => { });
        stopRun('sess-other');
        expect(other.cancelled).toBe(true);
        expect(mine.cancelled).toBe(false);
        expect(isRunning('sess-mine')).toBe(true);
        stopRun('sess-mine');
    });

    it('NEGATIVE — a released run is not stoppable, and does not leak', async () => {
        //  A handle that outlives its run answers `true` to a stop that stopped
        //  nothing — the dead control returning under a new name.
        registerRun('sess-3');
        releaseRun('sess-3');
        expect(isRunning('sess-3')).toBe(false);
        expect(stopRun('sess-3')).toBe(false);
    });

    it('NEGATIVE — work already cancelled before it starts is never begun', async () => {
        let started = false;
        const handle = registerRun('sess-4');
        handle.cancel();
        await expect(attendRun({
            work: async () => { started = true; return 'x'; },
            say: () => { }, what: 'react_project', handle,
        })).rejects.toThrow(CANCELLED);
        expect(started).toBe(false);
    });
});

describe('the elapsed time is the number he would say out loud', () => {
    it('reads in seconds, then minutes, then hours', () => {
        expect(humanElapsed(31_000)).toBe('31s');
        expect(humanElapsed(89_000)).toBe('89s');
        expect(humanElapsed(240_000)).toBe('4m');
        //  69 minutes — his run, the reason this file exists.
        expect(humanElapsed(69 * 60_000)).toBe('1h09');
    });
});

/**
 * BROKEN ON PURPOSE, AND WHAT EACH ONE REDDENED:
 *
 *   beat() never rescheduled (one line, then silence)
 *       -> POSITIVE 1, "keeps speaking"
 *   the beat timer not cleared in `finish()`
 *       -> NEGATIVE "work that returns quickly says NOTHING"
 *   `stopRun` returning true unconditionally (the shipped defect)
 *       -> NEGATIVE "reports FALSE, it does not answer ok"
 *   `registerRun` storing one shared handle for every key
 *       -> NEGATIVE "stopping one run does not stop another"
 *   the `handle.cancelled` pre-check removed
 *       -> NEGATIVE "already cancelled before it starts is never begun"
 */

/**
 * ⛔ AND THE DEAD CONTROL CAME BACK ONE LAYER IN, BEFORE THIS EVER RAN.
 *
 * `registerRun` held ONE handle per key and `releaseRun` deleted the key. But
 * `AgentOrchestrator.ts:706` runs a batch of nodes under `Promise.all`, so two
 * tools share one `sessionId` at the same moment:
 *
 *     tool A registers  -> live[sess] = A
 *     tool B registers  -> live[sess] = B     (A is gone)
 *     tool A finishes   -> delete live[sess]  (B is gone, and still running)
 *
 * Stop then finds nothing, or finds the wrong run, and reports about work it
 * never reached — **which is the exact control this file exists to repair,
 * rebuilt one layer down.** Found by reading the orchestrator before applying
 * the repair, not after shipping it.
 */
describe('two tools in one session do not stop each other', () => {
    it('⛔ POSITIVE — a stop reaches BOTH runs registered under the same session', () => {
        const a = registerRun('sess-batch');
        const b = registerRun('sess-batch');
        expect(stopRun('sess-batch')).toBe(true);
        expect(a.cancelled).toBe(true);
        expect(b.cancelled).toBe(true);
    });

    it('⛔ NEGATIVE — one finishing does not un-register the other', () => {
        //  The clobber, asserted directly: A ends, B is still going, and a stop
        //  must still find B. Under one-handle-per-key this returned false.
        const a = registerRun('sess-batch2');
        const b = registerRun('sess-batch2');
        releaseHandle(a, 'sess-batch2');
        expect(isRunning('sess-batch2')).toBe(true);
        expect(stopRun('sess-batch2')).toBe(true);
        expect(b.cancelled).toBe(true);
        expect(a.cancelled).toBe(false);
    });

    it('⛔ NEGATIVE — and when the last one leaves, the key is gone', () => {
        //  A long session must not accumulate handles for work that finished
        //  hours ago, and a key with an empty set would answer «running».
        const a = registerRun('sess-batch3');
        const b = registerRun('sess-batch3');
        releaseHandle(a, 'sess-batch3');
        releaseHandle(b, 'sess-batch3');
        expect(isRunning('sess-batch3')).toBe(false);
        expect(stopRun('sess-batch3')).toBe(false);
    });

    it('⛔ NEGATIVE — a cancelled run is not «running», even before it is released', () => {
        const a = registerRun('sess-batch4');
        a.cancel();
        expect(isRunning('sess-batch4')).toBe(false);
    });
});
