/**
 * IS JOE BUSY RIGHT NOW — asked from outside the composer.
 *
 * The self-update autopilot must never restart Joe under a running task: an
 * update that kills a build mid-flight costs more than it saves. The only
 * component that truly knows whether a run is active is CommandComposer, and
 * its state dies with it. Same pattern as the update store: module-level
 * state, publish on change, subscribe from anywhere.
 */
type Listener = (busy: boolean) => void;

let busy = false;
const listeners = new Set<Listener>();

export function setRunBusy(next: boolean): void {
    if (busy === next) return;
    busy = next;
    listeners.forEach(l => { try { l(busy); } catch { /* one bad listener must not stop the rest */ } });
}

export function isRunBusy(): boolean {
    return busy;
}

export function subscribeRunBusy(l: Listener): () => void {
    listeners.add(l);
    l(busy);
    return () => { listeners.delete(l); };
}
