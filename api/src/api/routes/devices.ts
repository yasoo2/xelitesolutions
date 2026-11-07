/**
 * The owner's computers: this one, and the ones he linked (core/devices/device-link.ts).
 *
 *   POST /api/devices/pair            a pairing code and the one line to run on the other computer
 *   GET  /api/devices/link.ps1?code=  the link script, served only while that code is waiting
 *   GET  /api/devices                 this computer and the linked ones
 *   POST /api/devices/:id/disconnect  ends a link from here
 *   GET  /api/devices/phone/screen    the phone's screen now (a PNG), for the live preview
 *   GET  /api/devices/computer/screen this computer's screen now (a PNG), for the live preview
 */
import { Router, Request, Response } from 'express';
import os from 'os';
import { authenticate } from '../middleware/auth';
import { config } from '../../shared/config';
import { deviceLinks, lanAddress, linkCommand, linkScript, reachableBase } from '../../core/devices/device-link';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';

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

/**
 * GET /api/devices/phone/screen — the owner's phone screen now, a PNG, for the
 * live Device view in Joe's page (EngineAndroidTool phoneScreenNow). Never
 * cached; the phone, its model and whether its screen is on ride in headers.
 */
router.get('/phone/screen', authenticate as any, async (req: Request, res: Response) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { phoneScreenNow } = require('../../modules/tools/definitions/EngineAndroidTool');
        //  A fixed capture (adb devices, screencap, pull), no command from the page:
        //  run as the owner's own system task, the way git.ts runs git (the firewall).
        const serial = String(req.query.serial || '').trim() || undefined;
        const frame = await executionFirewall.runAsSystem(() => phoneScreenNow(serial), { userId: uid(req) });
        if (!frame.ok) return res.status(frame.code === 'failed' ? 502 : 404).set('Cache-Control', 'no-store').json({ ok: false, code: frame.code, error: frame.error });
        return res.status(200).set({
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            'X-Joe-Phone': encodeURIComponent(frame.serial),
            'X-Joe-Phone-Model': encodeURIComponent(frame.model),
            'X-Joe-Screen-Awake': frame.awake === null ? 'unknown' : String(frame.awake),
            'X-Joe-Frame-At': String(frame.at),
            'Access-Control-Expose-Headers': 'X-Joe-Phone, X-Joe-Phone-Model, X-Joe-Screen-Awake, X-Joe-Frame-At',
        }).send(frame.png);
    } catch (e: any) {
        return res.status(500).set('Cache-Control', 'no-store').json({ ok: false, code: 'failed', error: String(e?.message || e) });
    }
});

/** GET /api/devices/computer/screen — this computer's whole screen now (1280 wide), for the live preview. */
router.get('/computer/screen', authenticate as any, async (req: Request, res: Response) => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { computerScreenNow } = require('../../modules/tools/definitions/EngineDeviceTools');
        const frame = await executionFirewall.runAsSystem(() => computerScreenNow(), { userId: uid(req) });
        if (!frame.ok) return res.status(frame.code === 'failed' ? 502 : 404).set('Cache-Control', 'no-store').json({ ok: false, code: frame.code, error: frame.error });
        return res.status(200).set({
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
            'X-Joe-Frame-At': String(frame.at),
            'Access-Control-Expose-Headers': 'X-Joe-Frame-At',
        }).send(frame.png);
    } catch (e: any) {
        return res.status(500).set('Cache-Control', 'no-store').json({ ok: false, code: 'failed', error: String(e?.message || e) });
    }
});

router.post('/:id/disconnect', authenticate as any, (req: Request, res: Response) => {
    const done = deviceLinks.disconnect(uid(req), String(req.params.id || ''));
    return done ? res.json({ ok: true }) : res.status(404).json({ ok: false, error: 'no such linked computer' });
});

export default router;
