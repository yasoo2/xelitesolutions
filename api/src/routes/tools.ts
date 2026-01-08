import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { executeTool, tools } from '../tools/registry';
import { broadcast, LiveEvent } from '../ws';
import { authenticate } from '../middleware/auth';
import { store } from '../mock/store';
import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const noopCount = tools.filter(t => t.name.startsWith('noop_')).length;
  const realCount = tools.length - noopCount;
  res.json({ count: tools.length, realCount, noopCount, tools });
});

router.post('/run', async (req: Request, res: Response) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const text = String(req.body?.text ?? 'hello');
  const input = { text };

  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  if (!sessionId) {
    const steps: LiveEvent[] = [
      { type: 'step_started', data: { name: 'plan' } },
      { type: 'step_done', data: { name: 'plan' } },
      { type: 'step_started', data: { name: 'execute:echo', input } },
    ];
    steps.forEach(ev => broadcast(ev));
    const result = await executeTool('echo', input);
    broadcast({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:echo', result } });
    return res.json(result);
  }

  let runId = '';
  if (useMock) {
    const r = store.createRun(sessionId);
    runId = r.id;
    store.addStep(runId, 'plan', 'done');
  } else {
    const r = await Run.create({ sessionId, status: 'running', steps: [{ name: 'plan', status: 'done' }] });
    runId = r._id.toString();
  }

  const ev = (e: LiveEvent) => broadcast({ ...e, runId });
  ev({ type: 'step_started', data: { name: 'plan' } });
  ev({ type: 'step_done', data: { name: 'plan' } });
  ev({ type: 'step_started', data: { name: 'execute:echo', input } });

  const result = await executeTool('echo', input);
  ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:echo', result } });

  if (useMock) {
    store.addExec(runId, 'echo', input, result.output, result.ok, result.logs || []);
    store.updateRun(runId, { status: result.ok ? 'done' : 'failed' });
  } else {
    try {
      await ToolExecution.create({ runId, name: 'echo', input, output: result.output, ok: result.ok, logs: result.logs || [] });
    } catch {}
    try {
      await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
    } catch {}
  }

  return res.json({ runId, sessionId, result });
});

router.post('/:name/execute', authenticate, async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const result = await executeTool(name, req.body || {});
  res.json(result);
});

export default router;
