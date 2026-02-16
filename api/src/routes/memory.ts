import { Router, Request, Response } from 'express';
import { MemoryItem } from '../models/memoryItem';
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
    res.status(500).json({ error: 'Failed to fetch memories' });
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
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

export default router;
