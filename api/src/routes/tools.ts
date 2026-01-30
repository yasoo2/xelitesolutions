import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { tools } from '../tools/registry';
import { executeTool } from '../services/ToolService';
import { broadcast, LiveEvent } from '../ws';
import { authenticate } from '../middleware/auth';

import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';

const router = Router();

function extractWorkspaceId(req: Request) {
  const fromReq = (req as any)?.workspace?._id ? String((req as any).workspace._id) : '';
  const fromBody = req.body && typeof req.body === 'object' ? String((req.body as any)?.workspaceId || (req.body as any)?.__workspaceId || '') : '';
  const val = (fromReq || fromBody || '').trim();
  return val || undefined;
}

router.get('/', async (_req: Request, res: Response) => {
  const count = tools.length;
  res.json({ count, realCount: count, noopCount: 0, tools });
});

router.post('/run', async (req: Request, res: Response) => {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const workspaceId = extractWorkspaceId(req);
  const text = String(req.body?.text ?? 'hello');
  const input = { text };



  if (!sessionId) {
    const steps: LiveEvent[] = [
      { type: 'step_started', data: { name: 'plan' } },
      { type: 'step_done', data: { name: 'plan' } },
      { type: 'step_started', data: { name: 'execute:echo', input } },
    ];
    steps.forEach(ev => broadcast(ev));
    const result = await executeTool('echo', input, { sessionId: sessionId || undefined, workspaceId });
    broadcast({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:echo', result } });
    return res.json(result);
  }

  let runId = '';

  const r = await Run.create({ sessionId, status: 'running', steps: [{ name: 'plan', status: 'done' }] });
  runId = r._id.toString();

  const ev = (e: LiveEvent) => broadcast({ ...e, runId });
  ev({ type: 'step_started', data: { name: 'plan' } });
  ev({ type: 'step_done', data: { name: 'plan' } });
  ev({ type: 'step_started', data: { name: 'execute:echo', input } });

  const result = await executeTool('echo', input, { sessionId, workspaceId });
  ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:echo', result } });

  try {
    await ToolExecution.create({ runId, name: 'echo', input, output: result.output, ok: result.ok, logs: result.logs || [] });
  } catch { }
  try {
    await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
  } catch { }

  return res.json({ runId, sessionId, result });
});

router.post('/:name/execute', authenticate, async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const userId = (req as any)?.auth?.sub;
  const language = req.headers['accept-language'] || 'en';
  const workspaceId = extractWorkspaceId(req);
  const result = await executeTool(
    name,
    { ...(req.body || {}), userId, __userId: userId },
    { sessionId: (req.body as any)?.sessionId, language, workspaceId }
  );
  if (result && result.ok && result.output && typeof result.output === 'object') {
  }
  res.json(result);
});

export default router;
