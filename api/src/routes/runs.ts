import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { store } from '../mock/store';
import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';
import { Artifact } from '../models/artifact';
import { Session } from '../models/session';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/:id', authenticate as any, async (req: Request, res: Response) => {
  const id = String(req.params.id || '').trim();
  const userId = String((req as any).auth?.sub || '').trim();
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const run = store.listRuns().find(r => r.id === id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const execs = store.listExecs(id);
    const artifacts = store.listArtifacts(id);
    return res.json({ run, execs, artifacts });
  } else {
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });
    const run = await Run.findById(id).lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const allowed = await Session.findOne({ _id: run.sessionId, userId }).select('_id').lean();
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const runId = (run as any)._id;
    const execs = await ToolExecution.find({ runId }).lean();
    const artifacts = await Artifact.find({ runId }).lean();
    return res.json({ run, execs, artifacts });
  }
});

export default router;
