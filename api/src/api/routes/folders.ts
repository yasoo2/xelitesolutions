import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

/**
 * Session folders. The frontend (sessionStore) does GET/POST/DELETE /folders to
 * organise sessions, but no backend router existed -> every call 404'd and the
 * "New Folder" button did nothing. This is a small, single-user, offline-friendly
 * store kept in memory (global.joeFolders), consistent with the mock session store.
 */
const router = Router();

function store(): any[] {
    if (!(global as any).joeFolders) (global as any).joeFolders = [];
    return (global as any).joeFolders as any[];
}

// GET /folders -> list folders ({ _id, name })
router.get('/', authenticate as any, (_req: Request, res: Response) => {
    res.json(store());
});

// POST /folders { name } -> create a folder
router.post('/', authenticate as any, (req: Request, res: Response) => {
    const name = (typeof req.body?.name === 'string' && req.body.name.trim()) ? req.body.name.trim() : 'New Folder';
    const folder = {
        _id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        createdAt: new Date(),
    };
    store().unshift(folder);
    res.json(folder);
});

// DELETE /folders/:id -> remove folder and detach its sessions
router.delete('/:id', authenticate as any, (req: Request, res: Response) => {
    const id = String(req.params.id);
    (global as any).joeFolders = store().filter((f: any) => String(f._id) !== id);
    const sessions: any[] = (global as any).mockSessions || [];
    for (const s of sessions) {
        if (String(s.folderId) === id) s.folderId = undefined;
    }
    res.json({ ok: true });
});

export default router;
