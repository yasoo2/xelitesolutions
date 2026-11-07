/**
 * /ws/device-link: where a linked computer calls in (core/devices/device-link.ts).
 *
 * The pairing code in the address is the only key: it is claimed here, once,
 * and names the owner the computer joins. The first message must be the
 * computer's HELLO (what it is) within twenty seconds. An address that keeps
 * presenting codes that are not waiting is turned away for ten minutes.
 */
import { WebSocketServer } from 'ws';
import { deviceLinks, type LinkSocket } from '../core/devices/device-link';

let wss: WebSocketServer | null = null;
const misses = new Map<string, { n: number; since: number }>();
const MISS_WINDOW_MS = 10 * 60_000;
const MISS_LIMIT = 20;

export function acceptDeviceLink(req: any, socket: any, head: any, reject: (status: number, message: string) => void): void {
    const now = Date.now();
    const ip = String(req?.socket?.remoteAddress || '');
    const m = misses.get(ip);
    if (m && now - m.since < MISS_WINDOW_MS && m.n >= MISS_LIMIT) return reject(429, 'Too Many Requests');
    let code = '';
    try { code = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('code') || ''; } catch { /* no code */ }
    const owner = deviceLinks.claim(code, now);
    if (!owner) {
        const fresh = !m || now - m.since >= MISS_WINDOW_MS;
        misses.set(ip, { n: fresh ? 1 : m!.n + 1, since: fresh ? now : m!.since });
        return reject(401, 'Unauthorized: this pairing code is not waiting');
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
            const device = deviceLinks.attach(ws as unknown as LinkSocket, owner, hello as any);
            console.log(`[DeviceLink] «${device.name}» linked (${device.os || 'unknown system'})`);
        });
    });
}
