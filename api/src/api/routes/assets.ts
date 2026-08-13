import { Router, Request, Response } from 'express';
import { FileModel } from '../../shared/models/file';
import { Artifact } from '../../shared/models/artifact';
import { Run } from '../../shared/models/run';
import { Session } from '../../shared/models/session';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get all assets (files + artifacts) for a session
router.get('/', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    const userId = (req as any).auth?.sub;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // [OFFLINE] Uploaded files live in .file-cache.json; return them (artifacts on disk).
    if (process.env.PERSISTENCE_MODE === 'JSON' || process.env.MOCK_DB === 'true' || String(process.env.MOCK_DB) === '1' || process.env.OFFLINE_MODE === 'true') {
      let files: any[] = [];
      try {
        const _fs = require('fs'); const _path = require('path');
        const cacheFilePath = _path.join(__dirname, '../../.file-cache.json');
        if (_fs.existsSync(cacheFilePath)) {
          const cache = JSON.parse(_fs.readFileSync(cacheFilePath, 'utf-8'));
          files = Object.values(cache).map((f: any) => ({
            id: f.id, name: f.originalName, type: f.mimeType, size: f.size,
            createdAt: new Date(), category: 'upload', url: `/files/${f.id}/raw`
          }));
        }
      } catch { /* ignore */ }
      return res.json({ files, artifacts: [] });
    }

    const allowed = await Session.findOne({ _id: String(sessionId), userId }).select('_id').lean();
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    /**
     * `sessionId` comes off `req.query`, so its type is
     * `string | ParsedQs | (string | ParsedQs)[]` — a caller can send
     * `?sessionId=a&sessionId=b` and hand this route an ARRAY. The line above
     * already narrows it with `String(sessionId)` for the ownership check;
     * these two queries did not, and were matching on whatever arrived.
     * A newer mongoose types this strictly and refused to compile it, which
     * is the type system catching a real inconsistency rather than a chore.
     */
    const sid = String(sessionId);

    // 1. Get User Uploaded Files
    const files = await FileModel.find({ sessionId: sid }).sort({ createdAt: -1 }).lean();

    // 2. Get AI Generated Artifacts
    // First find all runs for this session
    const runs = await Run.find({ sessionId: sid }).select('_id').lean();
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
