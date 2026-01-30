import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';
import { Artifact } from '../models/artifact';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database not ready' });
  }
  const run = await Run.findById(id).lean();
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const execs = await ToolExecution.find({ runId: id }).lean();
  const artifacts = await Artifact.find({ runId: id }).lean();
  return res.json({ run, execs, artifacts });
});

export default router;
