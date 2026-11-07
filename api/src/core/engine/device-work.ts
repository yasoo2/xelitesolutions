/**
 * WHAT JOE DID ON A DEVICE IN THIS CHAT, FOR THE ANSWERER.
 *
 * The owner, 2026-11-07: right after Joe had turned his flashlight on, the
 * chat's answerer said «I have done nothing on the phone in this chat» — it
 * reads the question only, never the runs. Each operate run leaves its
 * result here (the last five, for two hours), and the answerer is given them
 * as facts.
 *
 * Kept apart from operate.ts, with no import at all: the answerer loads it on
 * every question, and must not load the device tools (or their timers) with it.
 */
export type DeviceKind = 'phone' | 'computer';

interface Done { at: number; target?: DeviceKind; request: string; summary: string; ok: boolean }

const DONE = new Map<string, Done[]>();
const DONE_MS = 2 * 60 * 60_000;

export function noteOperateResult(sessionId: unknown, r: { target?: DeviceKind; request: string; summary: string; ok: boolean }, now = Date.now()): void {
    const id = String(sessionId || '');
    if (!id) return;
    const list = (DONE.get(id) || []).filter(e => now - e.at <= DONE_MS);
    list.push({ at: now, target: r.target, request: String(r.request || '').slice(0, 200), summary: String(r.summary || '').slice(0, 500), ok: r.ok });
    DONE.set(id, list.slice(-5));
}

/** The facts block: empty when this chat worked no device. */
export function deviceWorkFacts(sessionId: unknown, now = Date.now()): string {
    const list = (DONE.get(String(sessionId || '')) || []).filter(e => now - e.at <= DONE_MS);
    if (!list.length) return '';
    const lines = list.map(e => {
        const minutes = Math.max(0, Math.round((now - e.at) / 60_000));
        return `- ${minutes} min ago, on the owner's ${e.target || 'device'}: «${e.request}» → ${e.ok ? 'done and checked' : 'not completed'}: ${e.summary.replace(/\s+/gu, ' ')}`;
    });
    return `\n\nWHAT JOE DID ON THE OWNER'S DEVICES IN THIS CHAT (facts; never say Joe did nothing there):\n${lines.join('\n')}`;
}
