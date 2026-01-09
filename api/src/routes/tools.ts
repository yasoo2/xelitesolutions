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
  const count = tools.length;
  res.json({ count, realCount: count, noopCount: 0, tools });
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
  const userId = (req as any)?.auth?.sub;
  const result = await executeTool(name, { ...(req.body || {}), __userId: userId });
  if (result && result.ok && result.output && typeof result.output === 'object') {
    const authHeader = String(req.headers.authorization || '');
    const bearerToken =
      authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    const xfProto = req.headers['x-forwarded-proto'];
    const reqProto =
      typeof xfProto === 'string' && xfProto.trim()
        ? xfProto.split(',')[0].trim()
        : req.protocol;
    const wsProto = reqProto === 'https' ? 'wss' : 'ws';
    const host = String(req.get('host') || '').trim();

    const absolutize = (href: string) => {
      const v = String(href || '').trim();
      if (!v) return v;
      if (/^wss?:\/\//i.test(v)) return v;
      if (!host) return v;
      const base = v.startsWith('/') ? `${wsProto}://${host}${v}` : `${wsProto}://${host}/${v}`;
      try {
        const u = new URL(base);
        if (bearerToken && u.pathname.startsWith('/browser/ws/') && !u.searchParams.get('token')) {
          u.searchParams.set('token', bearerToken);
        }
        return u.toString();
      } catch {
        return base;
      }
    };

    const wsUrlRaw = (result.output as any).wsUrl;
    if (typeof wsUrlRaw === 'string' && wsUrlRaw.startsWith('/browser/ws/')) {
      (result.output as any).wsUrl = absolutize(wsUrlRaw);
    }
    if (Array.isArray(result.artifacts)) {
      result.artifacts = result.artifacts.map((a) => {
        if (!a || typeof a !== 'object') return a;
        const href = (a as any).href;
        if (typeof href === 'string' && href.startsWith('/browser/ws/')) {
          return { ...(a as any), href: absolutize(href) };
        }
        return a as any;
      });
    }
  }
  res.json(result);
});

export default router;
