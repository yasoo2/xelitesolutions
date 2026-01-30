import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Folder } from '../models/folder';
import { Session } from '../models/session';
import { authenticate } from '../middleware/auth';


const router = Router();

// List folders
router.get('/', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const folders = await Folder.find({ userId }).sort({ createdAt: 1 });
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create folder
router.post('/', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const folder = await Folder.create({ name, userId });
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Rename folder
router.patch('/:id', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const folder = await Folder.findOneAndUpdate(
      { _id: req.params.id, userId },
      { name },
      { new: true }
    );
    if (!folder) return res.status(404).json({ error: 'Not found' });
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete folder
router.delete('/:id', authenticate as any, async (req: Request, res: Response) => {
  try {
    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const folder = await Folder.findOne({ _id: req.params.id, userId }).select('_id').lean();
    if (!folder) return res.status(404).json({ error: 'Not found' });
    // Unset folderId from sessions in this folder
    await Session.updateMany({ folderId: req.params.id, userId }, { $unset: { folderId: "" } });

    await Folder.deleteOne({ _id: req.params.id, userId });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;
