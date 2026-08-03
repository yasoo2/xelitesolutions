/**
 * The PUBLIC form endpoint the built pages post to. No auth on purpose —
 * a visitor filling a contact form has no token — but everything else is
 * tight: tiny rate limit, bounded body, bounded store, and the handler
 * never reveals anything (a POST gets {ok} and nothing more).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { appendSubmission } from '../form-inbox';

const router = Router();

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
        appendSubmission(site, fields, typeof req.body.page === 'string' ? req.body.page : undefined);
        return res.json({ ok: true });
    } catch {
        return res.status(500).json({ ok: false });
    }
});

export default router;
