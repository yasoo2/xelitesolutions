/**
 * WHICH CONVERSATIONS ARE WORKING RIGHT NOW.
 *
 * Reported from the field, and it was the worst defect of the batch: «عند فتح
 * جلسة وتشغيل بروميت وأثناء ما جو يعمل فيها فاذهب الى جلسة اخرى ومن ثم ارجع
 * الى الجلسة السابقة فانها تكون قد توقفت ولم تكمل مهمتها».
 *
 * The run never actually stopped — the server's loop is fire-and-forget and
 * keeps going. What stopped was the UI's KNOWLEDGE of it: every panel consumer
 * filters socket events by the conversation on screen, so everything the
 * background run said was thrown away, and returning restored the snapshot
 * from the moment he left. A frozen panel is indistinguishable from a dead
 * task, so he was right to call it stopped.
 *
 * This registry sits BEFORE any of those filters. It is deliberately the one
 * place in the app that listens to every session at once, because "who is
 * still working" is a fact about all of them, not about the one on screen.
 */

type Listener = (running: Set<string>) => void;

const running = new Set<string>();
const listeners = new Set<Listener>();
let attached = false;

const norm = (v: any): string => String(v || '').trim();

/** The server writes the id in a few shapes; take whichever arrived. */
function sessionIdOf(event: any): string {
    return norm(event?.sessionId || event?.data?.sessionId);
}

function emit() {
    const snapshot = new Set(running);
    listeners.forEach(l => { try { l(snapshot); } catch { /* one bad listener must not stop the rest */ } });
}

function note(event: any) {
    const sid = sessionIdOf(event);
    if (!sid) return;
    const type = norm(event?.type);
    if (type === 'run_started') {
        if (!running.has(sid)) { running.add(sid); emit(); }
        return;
    }
    if (type === 'run_finished' || type === 'run_failed' || type === 'run_cancelled') {
        if (running.delete(sid)) emit();
    }
}

/** Attach once, for the lifetime of the page. */
export function startTrackingRuns() {
    if (attached) return;
    attached = true;
    void import('./socket').then(({ SocketService }) => {
        SocketService.subscribe(note);
    });
}

export function isSessionRunning(sessionId: string): boolean {
    return running.has(norm(sessionId));
}

export function getRunningSessions(): Set<string> {
    return new Set(running);
}

export function subscribeRunningSessions(l: Listener): () => void {
    listeners.add(l);
    l(new Set(running));
    return () => { listeners.delete(l); };
}

/** For a proof, and for the composer when it starts a run optimistically. */
export function markRunning(sessionId: string, on: boolean) {
    const sid = norm(sessionId);
    if (!sid) return;
    if (on) { if (!running.has(sid)) { running.add(sid); emit(); } }
    else if (running.delete(sid)) emit();
}
