import { Router } from 'express';
import { executeTool, tools } from '../tools/registry';
import { broadcast, LiveEvent } from '../ws';

const router = Router();

router.get('/', async (_req, res) => {
  res.json({ count: tools.length, tools });
});

router.post('/run', async (req, res) => {
  const steps: LiveEvent[] = [
    { type: 'step_started', data: { name: 'plan' } },
    { type: 'step_done', data: { name: 'plan' } },
    { type: 'step_started', data: { name: 'execute:echo' } },
  ];
  steps.forEach(ev => broadcast(ev));
  const result = await executeTool('echo', { text: String(req.body?.text ?? 'hello') });
  broadcast({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:echo', result } });
  res.json(result);
});

router.post('/:name/execute', async (req, res) => {
  const name = String(req.params.name);
  const result = await executeTool(name, req.body || {});
  res.json(result);
});

export default router;
