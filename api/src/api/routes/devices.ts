/**
 * The owner's computers: this one, and the ones he linked (core/devices/device-link.ts).
 *
 *   POST /api/devices/pair            a pairing code and the one line to run on the other computer
 *   GET  /api/devices/link.ps1?code=  the link script, served only while that code is waiting
 *   GET  /api/devices                 this computer and the linked ones
 *   POST /api/devices/:id/disconnect  ends a link from here
 */
import { Router, Request, Response } from 'express';
import os from 'os';
import { authenticate } from '../middleware/auth';
import { config } from '../../shared/config';
import { deviceLinks, linkCommand, linkScript } from '../../core/devices/device-link';

const router = Router();

function uid(req: Request): string {
    return String((req as any).auth?.sub || (req as any).auth?.userId || config.localUserId).trim();
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

/** This computer's address on its own network (the first private IPv4), if it has one. */
export function lanAddress(interfaces = os.networkInterfaces()): string {
    for (const list of Object.values(interfaces)) {
        for (const a of list || []) {
            const family = String((a as any).family);
            if ((family === 'IPv4' || family === '4') && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
        }
    }
    return '';
}

/**
 * The address the other computer reaches this Joe at. As this request reached
 * it, unless that is an address only this computer knows (localhost): then
 * PUBLIC_URL when it is set, else this computer's address on its network
 * (Joe listens on every interface by default, shared/go-live.ts).
 */
export function publicBase(req: Request, env: NodeJS.ProcessEnv = process.env, lan: () => string = lanAddress): { http: string; ws: string; via: 'request' | 'public' | 'lan' | 'local' } {
    const proto = String(req.headers['x-forwarded-proto'] || (req as any).protocol || 'http').split(',')[0].trim() === 'https' ? 'https' : 'http';
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${config.port || 3000}`).split(',')[0].trim();
    const at = (p: string, h: string) => ({ http: `${p}://${h}`, ws: `${p === 'https' ? 'wss' : 'ws'}://${h}` });
    if (!LOCAL_HOST.test(host)) return { ...at(proto, host), via: 'request' };
    try {
        const pub = new URL(String(env.PUBLIC_URL || ''));
        if (/^https?:$/.test(pub.protocol) && !LOCAL_HOST.test(pub.host)) return { ...at(pub.protocol.replace(':', ''), pub.host), via: 'public' };
    } catch { /* no public address */ }
    const ip = String(env.JOE_BIND_HOST || '0.0.0.0').trim() === '0.0.0.0' ? lan() : '';
    const port = (host.match(/:(\d+)$/) || [])[1];
    if (ip) return { ...at(proto, port ? `${ip}:${port}` : ip), via: 'lan' };
    return { ...at(proto, host), via: 'local' };
}

router.post('/pair', authenticate as any, (req: Request, res: Response) => {
    const { code, expiresAt } = deviceLinks.newPairingCode(uid(req));
    const base = publicBase(req);
    const scriptUrl = `${base.http}/api/devices/link.ps1?code=${code}`;
    return res.json({
        ok: true, code, expiresAt, scriptUrl, command: linkCommand(scriptUrl),
        //  Said plainly: a network address reaches only computers on that network,
        //  and an address only this computer knows reaches none.
        via: base.via,
        localOnly: base.via === 'local',
    });
});

router.get('/link.ps1', (req: Request, res: Response) => {
    const code = String(req.query.code || '');
    if (!deviceLinks.isWaiting(code)) {
        return res.status(404).type('text/plain; charset=utf-8').send("Write-Host 'This pairing code is not waiting any more: ask Joe for a new one.' -ForegroundColor Red\n");
    }
    //  The computer that fetched this reached Joe at this very address: it calls back the same way.
    const base = publicBase(req, {}, () => '');
    return res.type('text/plain; charset=utf-8').send(linkScript(`${base.ws}/ws/device-link?code=${encodeURIComponent(code)}`));
});

router.get('/', authenticate as any, (req: Request, res: Response) => {
    return res.json({
        ok: true,
        here: { name: os.hostname(), os: `${os.type()} ${os.release()}`, desktop: process.platform === 'win32' },
        linked: deviceLinks.list(uid(req)),
    });
});

router.post('/:id/disconnect', authenticate as any, (req: Request, res: Response) => {
    const done = deviceLinks.disconnect(uid(req), String(req.params.id || ''));
    return done ? res.json({ ok: true }) : res.status(404).json({ ok: false, error: 'no such linked computer' });
});

export default router;
