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

interface Done { at: number; target?: DeviceKind; request: string; summary: string; ok: boolean; question?: string; takenBy?: string }
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

export function noteOperateResult(sessionId: unknown, r: { target?: DeviceKind; request: string; summary: string; ok: boolean; question?: string }, now = Date.now()): void {
    const id = String(sessionId || '');
    if (!id) return;
    const s = load();
    const list = (s.done[id] || []).filter(e => now - e.at <= DONE_MS);
    list.push({ at: now, target: r.target, request: String(r.request || '').slice(0, 200), summary: String(r.summary || '').slice(0, 500), ok: r.ok, ...(r.question ? { question: String(r.question).slice(0, 800) } : {}) });
    s.done[id] = list.slice(-5);
    save(now);
}

/**
 * JOE ASKED, AND WAITS: the owner's next message is the answer.
 *
 * The owner, 2026-11-08: Joe asked «shall I send it to shoroq…?», the owner
 * wrote «اجل», and the chat's answerer replied «OK, I will send it» — and
 * nothing was sent, because «اجل» alone went to the answerer. While the chat's
 * last device run ended on a question (ask_owner) less than 30 minutes ago,
 * the next message goes back to that work, with the question beside it.
 */
const ANSWER_MS = 30 * 60_000;
export function pendingQuestion(sessionId: unknown, now = Date.now()): { target?: DeviceKind; request: string; question: string } | null {
    const list = load().done[String(sessionId || '')] || [];
    const last = list[list.length - 1];
    if (!last || !last.question || now - last.at > ANSWER_MS) return null;
    return { target: last.target, request: last.request, question: last.question };
}

/**
 * The chat's last device work within 30 minutes: what a short message («افحص») continues.
 *
 * With `anchor` (operate.ts deviceWorkAnchor), the most recent one that STANDS
 * ALONE, walked back through the chat's work, as the anchor reads it (its own
 * words, or what a recorded «X — Y» continued). The owner's engineer,
 * 2026-11-08: «افحص» after a failed «افحص» continued «افحص» and lost the Wi-Fi
 * question before it. The reader is passed in: this file must not load
 * operate.ts (the answerer loads it on every question).
 */
export function lastDeviceWork(sessionId: unknown, now = Date.now(), anchor?: (request: string) => string | null): { target?: DeviceKind; request: string; ok: boolean } | null {
    const list = (load().done[String(sessionId || '')] || []).filter(e => now - e.at <= ANSWER_MS);
    if (!anchor) {
        const last = list[list.length - 1];
        return last ? { target: last.target, request: last.request, ok: last.ok } : null;
    }
    for (let i = list.length - 1; i >= 0; i--) {
        const request = anchor(list[i].request);
        if (request) return { target: list[i].target, request, ok: list[i].ok };
    }
    return null;
}

/**
 * The question was answered (a new run took it up), or the owner's next
 * message went elsewhere (select.ts): it no longer waits. Found on 2026-11-08:
 * left waiting after a message that was not its answer, it took the message
 * after that one too, for half an hour.
 */
export function answeredQuestion(sessionId: unknown): void {
    const list = load().done[String(sessionId || '')] || [];
    const last = list[list.length - 1];
    if (last && last.question) { delete last.question; delete last.takenBy; save(); }
}

/**
 * THE ROUTE GIVES THE QUESTION TO ONE RUN.
 *
 * Found on 2026-11-08: every operate run in the chat read the waiting
 * question as answered by its own message, and was recorded under the old
 * request — «افتح المفكرة» after «shall I send it?» was told «the owner's
 * message answers it». Only the route that read the message as the answer
 * (select.ts) hands the question on, and only to the run it routed: that
 * run's id is kept with the question, and the run asks for it by its id
 * (AgentEngineTool runOperate).
 */
export function takeQuestion(sessionId: unknown, runId: unknown): void {
    const id = String(runId || '').trim();
    const list = load().done[String(sessionId || '')] || [];
    const last = list[list.length - 1];
    if (!id || !last || !last.question) return;
    last.takenBy = id;
    save();
}

/** Did the route give the waiting question to this run? */
export function questionTakenBy(sessionId: unknown, runId: unknown, now = Date.now()): boolean {
    const id = String(runId || '').trim();
    const list = load().done[String(sessionId || '')] || [];
    const last = list[list.length - 1];
    return !!id && !!last && !!last.question && now - last.at <= ANSWER_MS && last.takenBy === id;
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

/**
 * The same facts for the chat's ANSWERER, with the rule it broke: it cannot
 * act, so it must never promise to (2026-11-08: «OK, I will send it», and
 * nothing was sent).
 */
export function answererDeviceFacts(sessionId: unknown, now = Date.now()): string {
    const facts = deviceWorkFacts(sessionId, now);
    if (!facts) return '';
    return `${facts}\nYou, answering here, cannot act on his devices: never say you will send, open or do something on them. If he asks for an action, tell him plainly to say it as a command (for example «أرسلها», «افتحه») and Joe will do it.`;
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
