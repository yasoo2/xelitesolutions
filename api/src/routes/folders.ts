import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Folder } from '../models/folder';
import { Session } from '../models/session';
import { authenticate } from '../middleware/auth';
import { store } from '../mock/store';

const router = Router();

// List folders
router.get('/', authenticate as any, async (req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json(store.listFolders());
  }
  try {
    const folders = await Folder.find().sort({ createdAt: 1 });
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create folder
router.post('/', authenticate as any, async (req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    if (useMock) {
      const folder = store.createFolder(String(name));
      return res.json(folder);
    }

    const folder = await Folder.create({ name });
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Rename folder
router.patch('/:id', authenticate as any, async (req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  try {
    const { name } = req.body;
    if (useMock) {
      const folder = store.updateFolder(String(req.params.id), { name: String(name || '') });
      return res.json(folder);
    }
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
router.delete('/:id', authenticate as any, async (req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  try {
    if (useMock) {
      store.deleteFolder(String(req.params.id));
      return res.json({ success: true });
    }
    // Unset folderId from sessions in this folder
    await Session.updateMany({ folderId: req.params.id }, { $unset: { folderId: "" } });
    
    await Folder.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

export default router;
