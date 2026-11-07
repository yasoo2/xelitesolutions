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
import { deviceLinks, lanAddress, linkCommand, linkScript, reachableBase } from '../../core/devices/device-link';

const router = Router();

function uid(req: Request): string {
    return String((req as any).auth?.sub || (req as any).auth?.userId || config.localUserId).trim();
}

export { lanAddress } from '../../core/devices/device-link';

/** The address the other computer reaches this Joe at, from the address this request reached (device-link.ts reachableBase). */
export function publicBase(req: Request, env: NodeJS.ProcessEnv = process.env, lan: () => string = lanAddress): ReturnType<typeof reachableBase> {
    const proto = String(req.headers['x-forwarded-proto'] || (req as any).protocol || 'http').split(',')[0].trim() === 'https' ? 'https' : 'http';
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${config.port || 3000}`).split(',')[0].trim();
    return reachableBase(proto, host, env, lan);
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
