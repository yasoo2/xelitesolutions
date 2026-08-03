/**
 * The PUBLIC form endpoint the built pages post to. No auth on purpose —
 * a visitor filling a contact form has no token — but everything else is
 * tight: tiny rate limit, bounded body, bounded store, and the handler
 * never reveals anything (a POST gets {ok} and nothing more).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { appendSubmission } from '../form-inbox';
import { broadcast } from '../ws';
import { persistChatStores } from '../chat-store';

const router = Router();

/**
 * The session that OWNS a site id: pages post under their sessionKey, React
 * apps under their project directory name. Null when nobody owns it (the
 * message still lands in the inbox — ownership only decides who gets the
 * live notification).
 */
export function ownerSessionOf(site: string): string | null {
    const pages = (global as any).joePages || {};
    if (pages[site]) return site;
    const projects = (global as any).joeProjects || {};
    for (const [key, p] of Object.entries<any>(projects)) {
        if (p?.dir && path.basename(String(p.dir)).replace(/[^a-zA-Z0-9._-]/g, '') === site) return key;
    }
    return null;
}

/** Tell the owner NOW, in the chat they are looking at — and persist it. */
function notifyOwner(site: string, fields: Record<string, string>): void {
    try {
        const sessionId = ownerSessionOf(site);
        if (!sessionId) return;
        const preview = Object.entries(fields).slice(0, 2).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(' · ');
        const text = `📬 وصلت رسالة جديدة من نموذج موقعك${preview ? ` — ${preview}` : ''}\nقل «اعرض رسائل النموذج» لقراءتها كاملة.`;
        broadcast({ type: 'text', sessionId, data: { text, sessionId } } as any);
        broadcast({ type: 'form_submission', sessionId, data: { site, sessionId } } as any);
        if (process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1') {
            const store: any[] = (global as any).mockMessages || ((global as any).mockMessages = []);
            store.push({ _id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, sessionId, role: 'assistant', content: text, createdAt: new Date() });
            persistChatStores();
        }
    } catch { /* the visitor's POST must never depend on the owner's UI */ }
}

const limiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,                       // 30 submissions / 10 min / IP is a human, not a bot
    message: { ok: false },
    standardHeaders: false,
    legacyHeaders: false,
});

router.post('/:site', limiter, (req, res) => {
    try {
        const site = String(req.params.site || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
        const fields = (req.body && typeof req.body.fields === 'object' && req.body.fields) || {};
        if (!site || !Object.keys(fields).length) return res.status(400).json({ ok: false });
        const entry = appendSubmission(site, fields, typeof req.body.page === 'string' ? req.body.page : undefined);
        notifyOwner(site, entry.fields);
        return res.json({ ok: true });
    } catch {
        return res.status(500).json({ ok: false });
    }
});

export default router;
