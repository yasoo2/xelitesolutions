import { Router, Request, Response } from 'express';
import { MemoryItem } from '../../shared/models/memoryItem';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get all memories for user
router.get('/', authenticate as any, async (req: Request, res: Response) => {
  const userId = (req as any).auth?.sub;
  if (!userId) return res.json({ memories: [] });

  try {
    const memories = await MemoryItem.find({ userId }).sort({ createdAt: -1 });
    res.json({ memories });
  } catch (e) {
    res.json({ memories: [] }); // offline / DB down -> empty, not an error
  }
});

// Delete memory
router.delete('/:id', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).auth?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const deleted = await MemoryItem.findOneAndDelete({ _id: req.params.id, userId });
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (e: any) {
    // This used to answer `{ ok: true }` with the comment "offline -> treat as
    // removed". The delete had FAILED and the item was still there; the user was
    // told their memory was erased and it was not. Whether the store is offline
    // or the query threw, nothing was removed, and that is what gets reported.
    console.error(`[memory] delete failed for ${req.params.id}: ${e?.message || e}`);
    return res.status(503).json({
      ok: false,
      error: 'memory_delete_failed',
      detail: String(e?.message || e),
      hint: 'The item was NOT deleted — the memory store could not be reached.',
    });
  }
});

export default router;
