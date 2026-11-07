/**
 * /ws/device-link: where a linked computer calls in (core/devices/device-link.ts).
 *
 * Two ways in:
 *   - ?code=  a one-time pairing code, claimed here, once, naming the owner
 *             the computer joins for this session;
 *   - ?device= a computer linked for good (linked-computers.ts). Its id opens
 *             the door — an id the owner forgot is refused with 401, which
 *             tells its agent to remove itself — and its KEY rides in the
 *             first message (never in the address, so no log keeps it).
 * The first message must be the computer's HELLO within twenty seconds. An
 * address that keeps presenting codes, ids or keys that open nothing is turned
 * away for ten minutes.
 */
import { WebSocketServer } from 'ws';
import { deviceLinks, type LinkSocket } from '../core/devices/device-link';
import { keptComputers, verifyComputer, verifyComputerId } from '../core/devices/linked-computers';

let wss: WebSocketServer | null = null;
const misses = new Map<string, { n: number; since: number }>();
const MISS_WINDOW_MS = 10 * 60_000;
const MISS_LIMIT = 20;

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
        if (!isKeptId(device)) { miss(ip, now); return reject(401, 'Unauthorized: this computer is not linked to Joe any more'); }
    } else {
        owner = deviceLinks.claim(code, now);
        if (!owner) { miss(ip, now); return reject(401, 'Unauthorized: this pairing code is not waiting'); }
    }
    if (!wss) wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
    wss.handleUpgrade(req, socket, head, ws => {
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
