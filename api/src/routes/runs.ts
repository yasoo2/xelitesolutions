import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { store } from '../mock/store';
import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';
import { Artifact } from '../models/artifact';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const run = store.listRuns().find(r => r.id === id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const execs = store.listExecs(id);
    const artifacts = store.listArtifacts(id);
    return res.json({ run, execs, artifacts });
  } else {
    const run = await Run.findById(id).lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const execs = await ToolExecution.find({ runId: id }).lean();
    const artifacts = await Artifact.find({ runId: id }).lean();
    return res.json({ run, execs, artifacts });
  }
});

export default router;
