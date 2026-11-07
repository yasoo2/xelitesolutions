/**
 * WHAT JOE DID ON A DEVICE IN THIS CHAT, AND WHICH DEVICE THE CHAT IS WORKING.
 *
 * The owner, 2026-11-07: right after Joe had turned his flashlight on, the
 * chat's answerer said «I have done nothing on the phone in this chat» — it
 * reads the question only, never the runs. Each operate run leaves its
 * result here (the last five, for two hours), and the answerer and the next
 * operate run are given them as facts.
 *
 * KEPT ON DISK. The owner, 2026-11-08: Joe was restarted a few minutes
 * before «ارسل ايميل الى …», the chat's device was forgotten with the
 * process, and the email went to the computer instead of the phone the
 * chat had been working. The record is written to data/device-work.json
 * (a small file, pruned to two hours) and read back after a restart.
 *
 * Kept apart from operate.ts, with nothing but fs and path: the answerer
 * loads it on every question, and must not load the device tools (or their
 * timers) with it.
 */
import fs from 'fs';
import path from 'path';

export type DeviceKind = 'phone' | 'computer';

interface Done { at: number; target?: DeviceKind; request: string; summary: string; ok: boolean }
interface Working { target: DeviceKind; at: number; request: string }
interface Store { done: Record<string, Done[]>; working: Record<string, Working> }

const DONE_MS = 2 * 60 * 60_000;
let store: Store | null = null;

/** The file: JOE_DEVICE_WORK_FILE, else data/device-work.json; none under a test unless named. */
function storeFile(): string | null {
    if (process.env.JOE_DEVICE_WORK_FILE) return process.env.JOE_DEVICE_WORK_FILE;
    if (process.env.JEST_WORKER_ID) return null;
    return path.join(process.cwd(), 'data', 'device-work.json');
}

function load(): Store {
    if (store) return store;
    store = { done: {}, working: {} };
    const f = storeFile();
    if (f) {
        try {
            const j = JSON.parse(fs.readFileSync(f, 'utf8'));
            store = { done: j && typeof j.done === 'object' ? j.done : {}, working: j && typeof j.working === 'object' ? j.working : {} };
        } catch { /* no file yet, or unreadable: start empty */ }
    }
    return store;
}

function save(now = Date.now()): void {
    const s = load();
    for (const [id, list] of Object.entries(s.done)) {
        const kept = list.filter(e => now - e.at <= DONE_MS);
        if (kept.length) s.done[id] = kept; else delete s.done[id];
    }
    for (const [id, w] of Object.entries(s.working)) if (now - w.at > DONE_MS) delete s.working[id];
    const f = storeFile();
    if (!f) return;
    try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const tmp = `${f}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(s));
        fs.renameSync(tmp, f);
    } catch { /* the record helps; it never stops a run */ }
}

/** Forgets what was read, so the next call reads the file again (a test, or a restart in place). */
export function reloadDeviceWork(): void { store = null; }

export function noteOperateResult(sessionId: unknown, r: { target?: DeviceKind; request: string; summary: string; ok: boolean }, now = Date.now()): void {
    const id = String(sessionId || '');
    if (!id) return;
    const s = load();
    const list = (s.done[id] || []).filter(e => now - e.at <= DONE_MS);
    list.push({ at: now, target: r.target, request: String(r.request || '').slice(0, 200), summary: String(r.summary || '').slice(0, 500), ok: r.ok });
    s.done[id] = list.slice(-5);
    save(now);
}

/** The facts block: empty when this chat worked no device. */
export function deviceWorkFacts(sessionId: unknown, now = Date.now()): string {
    const list = (load().done[String(sessionId || '')] || []).filter(e => now - e.at <= DONE_MS);
    if (!list.length) return '';
    const lines = list.map(e => {
        const minutes = Math.max(0, Math.round((now - e.at) / 60_000));
        return `- ${minutes} min ago, on the owner's ${e.target || 'device'}: «${e.request}» → ${e.ok ? 'done and checked' : 'not completed'}: ${e.summary.replace(/\s+/gu, ' ')}`;
    });
    return `\n\nWHAT JOE DID ON THE OWNER'S DEVICES IN THIS CHAT (facts; never say Joe did nothing there):\n${lines.join('\n')}`;
}

/** The device this chat is working, as operate.ts notes it. */
export function setWorking(sessionId: unknown, w: Working): void {
    const id = String(sessionId || '');
    if (!id) return;
    load().working[id] = { target: w.target, at: w.at, request: String(w.request || '').slice(0, 300) };
    save(w.at);
}

export function getWorking(sessionId: unknown): Working | null {
    return load().working[String(sessionId || '')] || null;
}

export function clearWorking(sessionId: unknown): void {
    const s = load();
    delete s.working[String(sessionId || '')];
    save();
}
