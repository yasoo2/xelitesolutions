/**
 * /ws/device-link: where a linked computer calls in (core/devices/device-link.ts).
 *
 * Two ways in:
 *   - ?code=  a one-time pairing code, claimed here, once, naming the owner
 *             the computer joins for this session;
 *   - ?device= a computer linked for good (linked-computers.ts). Its id opens
 *             the door — an id the owner FORGOT is told «forget» and closed
 *             (4404), and its agent removes itself; an id we do not recognise
 *             right now (never linked, or the store unreadable this moment) is
 *             closed 4403 with no «forget», so a still-linked computer keeps
 *             calling — and its KEY rides in the first message (never in the
 *             address, so no log keeps it).
 * The first message must be the computer's HELLO within twenty seconds. An
 * address that keeps presenting codes, ids or keys that open nothing is turned
 * away for ten minutes.
 */
import { WebSocketServer } from 'ws';
import { deviceLinks, type LinkSocket } from '../core/devices/device-link';
import { isForgotten, keptComputers, verifyComputer, verifyComputerId } from '../core/devices/linked-computers';

let wss: WebSocketServer | null = null;
//  A SEPARATE, throwaway server used only to say one word to an id that opens nothing, then close.
//  It never reads a real frame, so its payload cap is tiny (1 KB): the old shared 64 MB cap with no
//  'error' listener meant one malformed frame on this path crashed Joe (the owner's case, 2026-11-08).
let replyWss: WebSocketServer | null = null;
const misses = new Map<string, { n: number; since: number }>();
const MISS_WINDOW_MS = 10 * 60_000;
const MISS_LIMIT = 20;

/**
 * Upgrades a connection from an id that opens nothing only to answer it and end the line.
 *   forget=true  → the owner forgot this computer: say «forget» (words any Windows reads) and
 *                  close 4404, so even an old helper that cannot read the word sees it in the code.
 *   forget=false → an id we do not recognise RIGHT NOW (never linked, or the store is unreadable
 *                  this moment): say nothing and close 4403, so a still-linked computer keeps
 *                  calling instead of deleting its own link.
 * Any protocol error (an oversized or malformed frame) just terminates the socket; the line is
 * terminated for good shortly after, even if the peer never acks the close.
 */
function replyAndClose(req: any, socket: any, head: any, forget: boolean): void {
    if (!replyWss) replyWss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    replyWss.handleUpgrade(req, socket, head, ws => {
        ws.on('error', () => { try { ws.terminate(); } catch { /* gone */ } });
        if (forget) {
            try { ws.send('0\tforget'); } catch { /* gone */ }
            setTimeout(() => { try { ws.close(4404, 'not linked to Joe any more'); } catch { /* gone */ } }, 200);
        } else {
            setTimeout(() => { try { ws.close(4403, 'not recognised right now'); } catch { /* gone */ } }, 50);
        }
        setTimeout(() => { try { ws.terminate(); } catch { /* gone */ } }, 1500);
    });
}

function miss(ip: string, now: number): void {
    const m = misses.get(ip);
    const fresh = !m || now - m.since >= MISS_WINDOW_MS;
    misses.set(ip, { n: fresh ? 1 : m!.n + 1, since: fresh ? now : m!.since });
}

/** A kept computer's id that is still kept (by any owner): only those are let in to say their key. */
function isKeptId(id: string): boolean {
    return !!id && verifyComputerId(id);
}

export function acceptDeviceLink(req: any, socket: any, head: any, reject: (status: number, message: string) => void): void {
    const now = Date.now();
    const ip = String(req?.socket?.remoteAddress || '');
    const m = misses.get(ip);
    if (m && now - m.since < MISS_WINDOW_MS && m.n >= MISS_LIMIT) return reject(429, 'Too Many Requests');
    let code = '';
    let device = '';
    try {
        const params = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
        code = params.get('code') || '';
        device = params.get('device') || '';
    } catch { /* neither */ }
    let owner: string | null = null;
    if (device) {
        if (!isKeptId(device)) {
            miss(ip, now);
            //  Only an id the owner FORGOT for good is told «forget». An id that is merely not
            //  found right now — never linked, OR the kept store could not be read this moment
            //  (its path follows process.cwd(), a transient read failure, a restored backup) —
            //  is closed with 4403 and keeps calling, so it never deletes a still-good link.
            //  Forgetting on «not found» once erased a linked computer (the owner's case, 2026-11-08).
            replyAndClose(req, socket, head, isForgotten(device));
            return;
        }
    } else {
        owner = deviceLinks.claim(code, now);
        if (!owner) { miss(ip, now); return reject(401, 'Unauthorized: this pairing code is not waiting'); }
    }
    if (!wss) wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
    wss.handleUpgrade(req, socket, head, ws => {
        //  Without this, one malformed WebSocket frame makes 'ws' emit an unhandled 'error' and
        //  crashes Joe; terminate() ends just this line instead (the owner's case, 2026-11-08).
        ws.on('error', () => { try { ws.terminate(); } catch { /* gone */ } });
        const timer = setTimeout(() => { try { ws.close(4000, 'no hello'); } catch { /* gone */ } }, 20_000);
        ws.once('message', data => {
            clearTimeout(timer);
            const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
            const tab = text.indexOf('\t');
            if (tab < 0 || text.slice(0, tab) !== 'HELLO') { try { ws.close(4001, 'expected hello'); } catch { /* gone */ } return; }
            let hello: Record<string, unknown> = {};
            try { hello = JSON.parse(Buffer.from(text.slice(tab + 1), 'base64').toString('utf8')) || {}; } catch { /* a computer with no name */ }
            if (device) {
                const kept = verifyComputer(device, String(hello.key || ''));
                if (!kept) { miss(ip, Date.now()); try { ws.close(4401, 'wrong key'); } catch { /* gone */ } return; }
                const { key: _key, ...said } = hello;
                const d = deviceLinks.attach(ws as unknown as LinkSocket, kept.ownerId, said as any, Date.now(), { id: kept.id, name: kept.name });
                console.log(`[DeviceLink] «${d.name}» (kept) is online (${d.os || 'unknown system'})`);
                return;
            }
            const d = deviceLinks.attach(ws as unknown as LinkSocket, owner as string, hello as any);
            console.log(`[DeviceLink] «${d.name}» linked (${d.os || 'unknown system'})`);
        });
    });
}

/** For a test: the kept computers an owner has, as this socket sees them. */
export const _keptFor = keptComputers;
