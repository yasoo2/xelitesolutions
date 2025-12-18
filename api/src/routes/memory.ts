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
    await MemoryItem.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

export default router;
