/**
 * /ws/phone-link: where the Joe app on the owner's phone calls in (core/devices/phone-link.ts).
 *
 * Two ways in, like a linked computer (device-link-socket.ts):
 *   - ?code=  the six digits Joe gave the owner (linked-phones.ts newPhonePairing),
 *             claimed once: the phone is kept, and its id and key are sent back in
 *             a WELCOME line the app keeps;
 *   - ?phone= a phone linked before: its id opens the door, its KEY rides in the
 *             first message (never in the address, so no log keeps it). An id the
 *             owner forgot is told «forget» and closed 4404; an id merely not found
 *             right now is closed 4403 and keeps calling.
 * The first message must be HELLO within twenty seconds:
 *   {"t":"hello","key":"…","model":"SM-F956B","android":"14","name":"…"}.
 * An address that keeps presenting codes or keys that open nothing is turned
 * away for ten minutes.
 */
import { WebSocketServer } from 'ws';
import { phoneLinks, type PhoneSocket } from '../core/devices/phone-link';
import { claimPhonePairing, isForgottenPhone, isKeptPhoneId, isPhonePairingWaiting, sawPhone, verifyPhone } from '../core/devices/linked-phones';

let wss: WebSocketServer | null = null;
let replyWss: WebSocketServer | null = null;
const misses = new Map<string, { n: number; since: number }>();
const MISS_WINDOW_MS = 10 * 60_000;
const MISS_LIMIT = 20;

function miss(ip: string, now: number): void {
    if (misses.size > 5000) for (const [k, v] of misses) if (now - v.since >= MISS_WINDOW_MS) misses.delete(k);
    const m = misses.get(ip);
    const fresh = !m || now - m.since >= MISS_WINDOW_MS;
    misses.set(ip, { n: fresh ? 1 : m!.n + 1, since: fresh ? now : m!.since });
}

export function _forgetPhoneMisses(): void { misses.clear(); }

function replyAndClose(req: any, socket: any, head: any, forget: boolean): void {
    if (!replyWss) replyWss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    replyWss.handleUpgrade(req, socket, head, ws => {
        ws.on('error', () => { try { ws.terminate(); } catch { /* gone */ } });
        if (forget) {
            try { ws.send(JSON.stringify({ t: 'forget' })); } catch { /* gone */ }
            setTimeout(() => { try { ws.close(4404, 'not linked to Joe any more'); } catch { /* gone */ } }, 200);
        } else {
            setTimeout(() => { try { ws.close(4403, 'not recognised right now'); } catch { /* gone */ } }, 50);
        }
        setTimeout(() => { try { ws.terminate(); } catch { /* gone */ } }, 1500);
    });
}

export function acceptPhoneLink(req: any, socket: any, head: any, reject: (status: number, message: string) => void): void {
    const now = Date.now();
    const ip = String(req?.socket?.remoteAddress || '');
    const m = misses.get(ip);
    if (m && now - m.since < MISS_WINDOW_MS && m.n >= MISS_LIMIT) return reject(429, 'Too Many Requests');
    let code = '';
    let phone = '';
    try {
        const params = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
        code = (params.get('code') || '').trim();
        phone = (params.get('phone') || '').trim();
    } catch { /* neither */ }
    if (phone) {
        if (!isKeptPhoneId(phone)) {
            if (!/^[0-9a-f]{16}$/u.test(phone)) miss(ip, now);
            return replyAndClose(req, socket, head, isForgottenPhone(phone));
        }
    } else if (!isPhonePairingWaiting(code, now)) {
        miss(ip, now);
        return reject(401, 'Unauthorized: this pairing code is not waiting');
    }
    //  Pictures of the screen travel on this line: up to 16 MB a message.
    if (!wss) wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
    wss.handleUpgrade(req, socket, head, ws => {
        ws.on('error', () => { try { ws.terminate(); } catch { /* gone */ } });
        const timer = setTimeout(() => { try { ws.close(4000, 'no hello'); } catch { /* gone */ } }, 20_000);
        ws.once('message', data => {
            clearTimeout(timer);
            let hello: any = {};
            try { hello = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)) || {}; } catch { /* below */ }
            if (hello.t !== 'hello') { try { ws.close(4001, 'expected hello'); } catch { /* gone */ } return; }
            let kept: { id: string; ownerId: string; name: string } | null = null;
            if (phone) {
                const k = verifyPhone(phone, String(hello.key || ''));
                if (!k) { miss(ip, Date.now()); try { ws.close(4401, 'wrong key'); } catch { /* gone */ } return; }
                kept = { id: k.id, ownerId: k.ownerId, name: k.name };
                sawPhone(k.id, hello);
            } else {
                let claimed: ReturnType<typeof claimPhonePairing> = null;
                try { claimed = claimPhonePairing(code, hello); } catch (e: any) {
                    try { ws.send(JSON.stringify({ t: 'error', error: String(e?.message || e) })); ws.close(4500, 'not saved'); } catch { /* gone */ }
                    return;
                }
                if (!claimed) { miss(ip, Date.now()); try { ws.close(4401, 'code not waiting'); } catch { /* gone */ } return; }
                try { ws.send(JSON.stringify({ t: 'welcome', id: claimed.id, key: claimed.key, name: claimed.name })); } catch { /* gone */ }
                kept = { id: claimed.id, ownerId: claimed.ownerId, name: claimed.name };
            }
            const p = phoneLinks.attach(ws as unknown as PhoneSocket, kept, hello);
            console.log(`[PhoneLink] «${p.name}» is online (${p.model || 'unknown model'}, Android ${p.android || '?'})`);
        });
    });
}
