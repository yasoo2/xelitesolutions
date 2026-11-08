/**
 * /api/phones — the owner's phones linked through the Joe app (core/devices/linked-phones.ts).
 *
 *   GET  /app.apk     the Joe app itself, for the phone's browser to download (no sign-in:
 *                     the app opens nothing without a code the owner got from his own chat)
 *   POST /pair        a six-digit code for a new phone (signed in), with the steps
 *   GET  /            his phones: kept, and which are online now
 *   POST /:id/forget  unlink one for good, by its exact id or exact name
 */
import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { config } from '../../shared/config';
import { phoneLinks } from '../../core/devices/phone-link';
import { forgetPhone, keptPhones, newPhonePairing, PhoneStoreError } from '../../core/devices/linked-phones';
import { publicBase } from './devices';

const router = Router();

function uid(req: Request): string {
    return String((req as any).auth?.sub || (req as any).auth?.userId || config.localUserId).trim();
}

/** Where the built app is kept: JOE_PHONE_APK, else data/joe-phone.apk beside Joe's data. */
export function phoneApkFile(env: NodeJS.ProcessEnv = process.env): string {
    return env.JOE_PHONE_APK || path.join(process.cwd(), 'data', 'joe-phone.apk');
}

router.get('/app.apk', (_req: Request, res: Response) => {
    const file = phoneApkFile();
    if (!fs.existsSync(file)) return res.status(404).type('text/plain; charset=utf-8').send('The Joe app is not built on this Joe yet.');
    res.set({ 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="joe.apk"', 'Cache-Control': 'no-store' });
    return res.sendFile(path.resolve(file));
});

router.post('/pair', authenticate as any, (req: Request, res: Response) => {
    try {
        const p = newPhonePairing(uid(req), String(req.body?.name || ''));
        const base = publicBase(req, process.env);
        return res.json({ ok: true, code: p.code, until: p.until, server: base.http, apk: `${base.http}/api/phones/app.apk`, via: base.via });
    } catch (e: any) {
        return res.status(e instanceof PhoneStoreError ? 503 : 500).json({ ok: false, error: String(e?.message || e) });
    }
});

router.get('/', authenticate as any, (req: Request, res: Response) => {
    const online = new Map(phoneLinks.list(uid(req)).map(p => [p.id, p]));
    return res.json({
        ok: true,
        apkReady: fs.existsSync(phoneApkFile()),
        phones: keptPhones(uid(req)).map(p => ({ id: p.id, name: p.name, model: p.model || '', android: p.android || '', lastSeen: p.lastSeen, online: online.has(p.id) })),
    });
});

router.post('/:id/forget', authenticate as any, (req: Request, res: Response) => {
    try {
        const p = forgetPhone(uid(req), String(req.params.id || ''));
        if (!p) return res.status(404).json({ ok: false, error: `No phone is named exactly «${String(req.params.id || '')}».` });
        phoneLinks.forget(p.id);
        return res.json({ ok: true, id: p.id, name: p.name });
    } catch (e: any) {
        return res.status(e instanceof PhoneStoreError ? 503 : 500).json({ ok: false, error: String(e?.message || e) });
    }
});

export default router;
