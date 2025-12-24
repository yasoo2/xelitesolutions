import { Router, Request, Response } from 'express';
import { executeTool, tools } from '../tools/registry';
import { broadcast, LiveEvent } from '../ws';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const noopCount = tools.filter(t => t.name.startsWith('noop_')).length;
  const realCount = tools.length - noopCount;
  res.json({ count: tools.length, realCount, noopCount, tools });
});

router.post('/run', async (req: Request, res: Response) => {
  const input = { text: String(req.body?.text ?? 'hello') };
  const steps: LiveEvent[] = [
    { type: 'step_started', data: { name: 'plan' } },
    { type: 'step_done', data: { name: 'plan' } },
    { type: 'step_started', data: { name: 'execute:echo', input } },
  ];
  steps.forEach(ev => broadcast(ev));
  const result = await executeTool('echo', input);
  broadcast({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:echo', result } });
  res.json(result);
});

router.post('/:name/execute', authenticate, async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const result = await executeTool(name, req.body || {});
  res.json(result);
});

export default router;
