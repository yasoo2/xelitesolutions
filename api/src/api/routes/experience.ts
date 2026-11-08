/**
 * /api/experience — Joe's experience book, the owner's own (core/engine/experience.ts).
 *
 *   GET    /       what Joe learned: the recipes (done again with no model, or why
 *                  not), the lessons, and the totals (replays, money saved)
 *   DELETE /:id    he removes a recipe or a lesson he does not want kept
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { config } from '../../shared/config';
import { experienceOn, experienceView, forgetExperience, replayOn } from '../../core/engine/experience';

const router = Router();

function uid(req: Request): string {
    return String((req as any).auth?.sub || (req as any).auth?.userId || config.localUserId).trim();
}

router.get('/', authenticate as any, (req: Request, res: Response) => {
    res.json({ ok: true, learning: experienceOn(), replaying: replayOn(), ...experienceView(uid(req)) });
});

router.delete('/:id', authenticate as any, (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!/^[a-f0-9]{6,32}$/u.test(id)) return res.status(400).json({ ok: false, error: 'bad_id' });
    return forgetExperience(uid(req), id) ? res.json({ ok: true }) : res.status(404).json({ ok: false, error: 'not_found' });
});

export default router;
