import { Router, Request, Response } from 'express';
import { FileModel } from '../models/file';
import { Artifact } from '../models/artifact';
import { Run } from '../models/run';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get all assets (files + artifacts) for a session
router.get('/', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    // 1. Get User Uploaded Files
    const files = await FileModel.find({ sessionId }).sort({ createdAt: -1 }).lean();

    // 2. Get AI Generated Artifacts
    // First find all runs for this session
    const runs = await Run.find({ sessionId }).select('_id').lean();
    const runIds = runs.map(r => r._id);
    
    const artifacts = await Artifact.find({ runId: { $in: runIds } }).sort({ createdAt: -1 }).lean();

    res.json({
      files: files.map(f => ({
        id: f._id,
        name: f.originalName,
        type: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
        category: 'upload',
        url: `/files/${f._id}/raw` // Assumes this route exists
      })),
      artifacts: artifacts.map(a => ({
        id: a._id,
        name: a.name,
        type: a.name.endsWith('.html') ? 'text/html' : 'image/png', // Simple heuristic
        createdAt: a.createdAt,
        category: 'artifact',
        url: a.href
      }))
    });

  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

export default router;
