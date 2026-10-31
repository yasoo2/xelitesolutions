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

type Listener = (running: Set<string>, runIds: ReadonlyMap<string, string>) => void;
const RECOVERY_POLL_MS = 15_000;

const running = new Set<string>();
const runIds = new Map<string, string>();
const listeners = new Set<Listener>();
const generations = new Map<string, number>();
const liveGenerations = new Map<string, number>();
const awaitingIdentity = new Set<string>();
// Keep exact terminal identities across fresh recovery polls. Never evict a
// terminal merely to admit a server row that may still be draining.
const closedRuns = new Set<string>();
const CLOSED_RUN_LIMIT = 256;
let closedRevision = 0;
let recoverySaturated = false;
const closedKey = (sid: string, id: string) => JSON.stringify([sid, id]);
const isClosed = (sid: string, id: string) => Boolean(id) && closedRuns.has(closedKey(sid, id));
function rememberClosed(sid: string, id: string) {
    if (!id || isClosed(sid, id)) return;
    closedRevision += 1;
    if (closedRuns.size < CLOSED_RUN_LIMIT) closedRuns.add(closedKey(sid, id));
    else recoverySaturated = true;
}
type Admission = { sequence: number; terminals: Set<string>; unidentifiedTerminal: boolean };
const admissions = new Map<string, Set<Admission>>();
const latestAdmission = new Map<string, number>();
let admissionSequence = 0;
let generation = 0;
let pollSequence = 0;
let appliedPollSequence = 0;
let pendingPolls = 0;
let lifecycle = 0;
let attached = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let releaseSocketSubscription: (() => void) | null = null;

const norm = (v: any): string => String(v || '').trim();

/** The server writes the id in a few shapes; take whichever arrived. */
function sessionIdOf(event: any): string {
    return norm(event?.sessionId || event?.data?.sessionId);
}

function emit() {
    listeners.forEach(l => { try { l(new Set(running), new Map(runIds)); } catch { /* one bad listener must not stop the rest */ } });
}

function advance(sid: string, live = true) {
    generations.set(sid, ++generation);
    if (live) liveGenerations.set(sid, generation);
}

function pruneClosedGenerations() {
    if (pendingPolls) return;
    for (const sid of generations.keys()) if (!running.has(sid) && !admissions.has(sid)) {
        generations.delete(sid);
        liveGenerations.delete(sid);
    }
}

function note(event: any) {
    const sid = sessionIdOf(event);
    if (!sid) return;
    const type = norm(event?.type);
    if (type === 'run_started') {
        const runId = norm(event?.runId || event?.data?.runId);
        if (isClosed(sid, runId)) return;
        const changed = !running.has(sid) || (Boolean(runId) && runIds.get(sid) !== runId) || awaitingIdentity.has(sid);
        if (!changed) return;
        advance(sid);
        awaitingIdentity.delete(sid);
        if (runId) runIds.set(sid, runId);
        running.add(sid);
        emit();
        return;
    }
    if (type === 'run_finished' || type === 'run_failed' || type === 'run_cancelled' || type === 'run_completed') {
        const runId = norm(event?.runId || event?.data?.runId);
        const knownId = runIds.get(sid) || '';
        rememberClosed(sid, runId);
        for (const admission of admissions.get(sid) || []) {
            if (!runId || admission.terminals.size >= 128) admission.unidentifiedTerminal = true;
            else admission.terminals.add(runId);
        }
        if ((runId && knownId && runId !== knownId) || (!runId && knownId) || awaitingIdentity.has(sid)) return;
        // A terminal for an unseen session may still invalidate a snapshot
        // already in flight, but must not create a phantom running session.
        if (pendingPolls || admissions.has(sid) || running.has(sid)) advance(sid);
        awaitingIdentity.delete(sid);
        runIds.delete(sid);
        if (running.delete(sid)) emit();
        pruneClosedGenerations();
    }
}

/** Attach once, for the lifetime of the page. */
export function startTrackingRuns() {
    if (attached) return;
    attached = true;
    void import('./socket').then(({ SocketService }) => {
        if (!attached) return;
        releaseSocketSubscription?.();
        releaseSocketSubscription = SocketService.subscribe(note);
    });
    const sync = async () => {
        const requestSequence = ++pollSequence;
        const requestLifecycle = lifecycle;
        const requestClosedRevision = closedRevision;
        const requestGeneration = generation;
        const atRequest = new Map(liveGenerations);
        pendingPolls += 1;
        try {
            const data: any = await api.get('/runs/active');
            if (!attached || requestLifecycle !== lifecycle || requestSequence < appliedPollSequence || !Array.isArray(data?.runs)) return;
            appliedPollSequence = requestSequence;
            // Only a fresh authoritative all-empty snapshot can release the
            // bounded fence. An older empty response must not erase a newer
            // terminal or an explicit successor admission.
            if (data.runs.length === 0 && requestClosedRevision === closedRevision && requestGeneration === generation) {
                closedRuns.clear();
                recoverySaturated = false;
            }
            const eligibleRuns = data.runs.filter((run: any) => {
                const sid = norm(run?.sessionId);
                const id = norm(run?.runId);
                if (isClosed(sid, id)) return false;
                // At capacity, do not discover unknown runs from recovery, but
                // still reconcile known live identities and absent sessions.
                return !recoverySaturated || (running.has(sid) && (runIds.get(sid) || '') === id);
            });
            const serverIds = new Set<string>(
                eligibleRuns
                    .map((run: any) => norm(run?.sessionId))
                    .filter(Boolean)
            );
            const serverRunIds = new Map<string, string>();
            eligibleRuns.forEach((run: any) => {
                const sid = norm(run?.sessionId);
                // The server lists the newest run first for a session.
                if (sid && !serverRunIds.has(sid)) serverRunIds.set(sid, norm(run?.runId));
            });
            let changed = false;
            for (const sid of new Set([...running, ...serverIds])) {
                if ((liveGenerations.get(sid) || 0) !== (atRequest.get(sid) || 0)) continue;
                const id = serverRunIds.get(sid) || '';
                const sessionChanged = running.has(sid) !== serverIds.has(sid) || (runIds.get(sid) || '') !== id;
                if (serverIds.has(sid)) {
                    if (!running.has(sid) || (runIds.get(sid) || '') !== id) changed = true;
                    running.add(sid);
                    if (id) runIds.set(sid, id); else runIds.delete(sid);
                } else {
                    if (running.delete(sid)) changed = true;
                    runIds.delete(sid);
                }
                awaitingIdentity.delete(sid);
                if (sessionChanged) advance(sid, false);
            }
            if (changed) emit();
        } catch { /* the WebSocket remains the live fallback */ }
        finally {
            pendingPolls -= 1;
            pruneClosedGenerations();
        }
    };
    void sync();
    // WebSocket events are the live path. This is only bounded recovery for a
    // dropped event, so keep it slow enough that several open tabs stay cheap.
    pollTimer = setInterval(() => { void sync(); }, RECOVERY_POLL_MS);
}

function stopTrackingRuns() {
    attached = false;
    lifecycle += 1;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    releaseSocketSubscription?.();
    releaseSocketSubscription = null;
}

if (import.meta.hot) {
    import.meta.hot.dispose(stopTrackingRuns);
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
    l(new Set(running), new Map(runIds));
    return () => { listeners.delete(l); };
}

/** For a proof, and for the composer when it starts a run optimistically. */
export function getRunningGeneration(sessionId: string): number {
    return generations.get(norm(sessionId)) || 0;
}

/** Retain invalidation while HTTP is pending, even after its composer unmounts. */
export function captureRunningAdmission(sessionId: string) {
    const sid = norm(sessionId);
    const atCapture = getRunningGeneration(sid);
    const initialId = runIds.get(sid) || '';
    const initiallyRunning = running.has(sid);
    const capturedLifecycle = lifecycle;
    const admission: Admission = { sequence: ++admissionSequence, terminals: new Set(), unidentifiedTerminal: false };
    const pending = admissions.get(sid) || new Set<Admission>();
    pending.add(admission);
    admissions.set(sid, pending);
    latestAdmission.set(sid, admission.sequence);
    let released = false;
    const canStart = (runId: string) => {
        const id = norm(runId);
        if (!sid || !id || released || lifecycle !== capturedLifecycle || latestAdmission.get(sid) !== admission.sequence
            || admission.unidentifiedTerminal || admission.terminals.has(id) || isClosed(sid, id)) return false;
        if (running.has(sid) && runIds.get(sid) === id) return true;
        return getRunningGeneration(sid) === atCapture && (runIds.get(sid) || '') === initialId
            && running.has(sid) === initiallyRunning;
    };
    return {
        canStart,
        markStarted(runId: string) {
            if (!canStart(runId)) return false;
            markRunning(sid, true, runId);
            return true;
        },
        release() {
            if (released) return;
            released = true;
            pending.delete(admission);
            if (!pending.size) { admissions.delete(sid); latestAdmission.delete(sid); }
            pruneClosedGenerations();
        },
    };
}

export function markRunning(sessionId: string, on: boolean, expectedRunId = '', expectedGeneration?: number) {
    const sid = norm(sessionId);
    if (!sid) return;
    const id = norm(expectedRunId);
    if (on) {
        if (isClosed(sid, id)) return;
        if (running.has(sid) && id && runIds.get(sid) === id && !awaitingIdentity.has(sid)) return;
        advance(sid);
        if (id) { runIds.set(sid, id); awaitingIdentity.delete(sid); }
        else { runIds.delete(sid); awaitingIdentity.add(sid); }
        running.add(sid);
        emit();
    }
    else {
        if (expectedGeneration !== undefined && getRunningGeneration(sid) !== expectedGeneration) return;
        const knownId = runIds.get(sid) || '';
        if ((knownId && knownId !== id) || (awaitingIdentity.has(sid) && id)) return;
        rememberClosed(sid, id);
        if (pendingPolls || running.has(sid)) advance(sid);
        awaitingIdentity.delete(sid);
        runIds.delete(sid);
        if (running.delete(sid)) emit();
        pruneClosedGenerations();
    }
}
