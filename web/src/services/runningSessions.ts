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

import { api } from './apiClient';

type Listener = (running: Set<string>) => void;

const running = new Set<string>();
const runIds = new Map<string, string>();
const listeners = new Set<Listener>();
let attached = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

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
        const runId = norm(event?.runId || event?.data?.runId);
        if (runId) runIds.set(sid, runId);
        if (!running.has(sid)) { running.add(sid); emit(); }
        return;
    }
    if (type === 'run_finished' || type === 'run_failed' || type === 'run_cancelled') {
        runIds.delete(sid);
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
    const sync = async () => {
        try {
            const data: any = await api.get('/runs/active');
            const serverIds = new Set<string>(
                (Array.isArray(data?.runs) ? data.runs : [])
                    .map((run: any) => norm(run?.sessionId))
                    .filter(Boolean)
            );
            const serverRunIds = new Map<string, string>();
            (Array.isArray(data?.runs) ? data.runs : []).forEach((run: any) => {
                const sid = norm(run?.sessionId);
                if (sid) serverRunIds.set(sid, norm(run?.runId));
            });
            let changed = serverIds.size !== running.size;
            if (!changed) for (const id of running) if (!serverIds.has(id)) { changed = true; break; }
            if (!changed) for (const [sid, runId] of serverRunIds) if ((runIds.get(sid) || '') !== runId) { changed = true; break; }
            if (changed) {
                running.clear();
                runIds.clear();
                serverIds.forEach(id => running.add(id));
                serverRunIds.forEach((runId, sid) => { if (runId) runIds.set(sid, runId); });
                emit();
            }
        } catch { /* the WebSocket remains the live fallback */ }
    };
    void sync();
    pollTimer = setInterval(() => { void sync(); }, 2500);
}

export function isSessionRunning(sessionId: string): boolean {
    return running.has(norm(sessionId));
}

export function getRunningSessions(): Set<string> {
    return new Set(running);
}

/** The canonical run id lets a remounted composer stop a run it rejoined. */
export function getRunningRunId(sessionId: string): string {
    return runIds.get(norm(sessionId)) || '';
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
    else {
        runIds.delete(sid);
        if (running.delete(sid)) emit();
    }
}
