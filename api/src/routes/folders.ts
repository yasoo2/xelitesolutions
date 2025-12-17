import { Router, Request, Response } from 'express';
import { Folder } from '../models/folder';
import { Session } from '../models/session';
import { authenticate } from '../middleware/auth';

const router = Router();

// List folders
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const folders = await Folder.find().sort({ createdAt: 1 });
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create folder
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const folder = await Folder.create({ name });
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Rename folder
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const folder = await Folder.findByIdAndUpdate(
      req.params.id, 
      { name }, 
      { new: true }
    );
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete folder
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    // Unset folderId from sessions in this folder
    await Session.updateMany({ folderId: req.params.id }, { $unset: { folderId: "" } });
    
    await Folder.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;
