import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { store } from '../mock/store';
import { authenticate } from '../middleware/auth';
import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';

const router = Router();

router.post('/merge', authenticate, async (req: Request, res: Response) => {
  const { sourceId, targetId } = req.body || {};
  if (!sourceId || !targetId || sourceId === targetId) return res.status(400).json({ error: 'Invalid source/target' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const result = store.mergeSessions(String(sourceId), String(targetId));
    return res.json({ ok: true, ...result });
  }
  const source = await Session.findById(sourceId);
  const target = await Session.findById(targetId);
  if (!source || !target) return res.status(404).json({ error: 'Session not found' });
  await Message.updateMany({ sessionId: sourceId }, { $set: { sessionId: targetId } });
  await Run.updateMany({ sessionId: sourceId }, { $set: { sessionId: targetId } });
  await Session.deleteOne({ _id: sourceId });
  return res.json({ ok: true });
});
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ sessions: store.listSessions() });
  }
  const sessions = await Session.find().lean();
  return res.json({ sessions });
});

router.post('/', authenticate, async (req: Request, res: Response) => {
  const { title, mode } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Missing title' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const s = store.createSession(title, mode || 'ADVISOR');
    return res.status(201).json(s);
  }
  const userId = (req as any).auth?.sub;
  const { Tenant } = await import('../models/tenant');
  const tenantName = process.env.DEFAULT_TENANT_NAME || 'XElite Solutions';
  const tenantDoc = await Tenant.findOneAndUpdate(
    { name: tenantName },
    { $setOnInsert: { name: tenantName } },
    { upsert: true, new: true }
  );
  const s = await Session.create({ title, mode: mode || 'ADVISOR', userId, tenantId: tenantDoc._id });
  return res.status(201).json({ id: s._id.toString(), title: s.title, mode: s.mode });
});

router.get('/:id/history', authenticate, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  
  if (useMock) {
    // Mock implementation for history
    const msgs = store.listMessages(sessionId);
    const runs = store.listRuns(sessionId);
    const execs = runs.flatMap(r => store.listExecs(r.id));
    
    const events: any[] = [];
    
    for (const m of msgs) {
      if (m.role === 'user') {
        events.push({ type: 'user_input', data: m.content, createdAt: m.createdAt });
      } else if (m.role === 'assistant') {
        events.push({ type: 'text', data: m.content, createdAt: m.createdAt });
      }
    }
    
    for (const ex of execs) {
       const duration = 100; // Mock duration
       events.push({
         type: 'step_done',
         duration,
         data: {
           name: `execute:${ex.name}`,
           plan: { input: ex.input },
           result: {
             output: ex.output,
             logs: ex.logs || [],
             ok: ex.ok
           }
         },
         createdAt: ex.createdAt || new Date().toISOString()
       });
    }
    
    events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return res.json({ events });
  }

  try {
    const messages = await Message.find({ sessionId }).lean();
    const runs = await Run.find({ sessionId }).select('_id').lean();
    const runIds = runs.map(r => r._id);
    const executions = await ToolExecution.find({ runId: { $in: runIds } }).lean();

    const events = [];

    // Map messages
    for (const m of messages) {
      if (m.role === 'user') {
        events.push({
          type: 'user_input',
          data: m.content,
          createdAt: m.createdAt
        });
      } else if (m.role === 'assistant') {
        events.push({
          type: 'text',
          data: m.content,
          createdAt: m.createdAt
        });
      }
    }

    // Map tool executions
     for (const ex of executions) {
       const duration = ex.updatedAt ? new Date(ex.updatedAt).getTime() - new Date(ex.createdAt).getTime() : 0;
       events.push({
         type: 'step_done',
         duration,
         data: {
           name: `execute:${ex.name}`,
           plan: { input: ex.input },
           result: {
             output: ex.output,
             logs: ex.logs,
             ok: ex.ok
           }
         },
         createdAt: ex.createdAt
       });
     }

    // Sort by date
    events.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return res.json({ events });
  } catch (err) {
    console.error('Failed to fetch history:', err);
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/:id/messages', authenticate, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ messages: store.listMessages(sessionId) });
  }
  const messages = await Message.find({ sessionId }).lean();
  return res.json({ messages });
});

router.post('/:id/messages', authenticate, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const { role, content } = req.body || {};
  if (!role || !content) return res.status(400).json({ error: 'Missing role/content' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const m = store.addMessage(sessionId, role, content);
    return res.status(201).json(m);
  }
  const m = await Message.create({ sessionId, role, content });
  await Session.findByIdAndUpdate(sessionId, { $set: { lastSnippet: content.slice(0, 140), lastUpdatedAt: new Date() } });
  return res.status(201).json({ id: m._id.toString(), sessionId, role, content });
});

router.get('/:id/summary', authenticate, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const s = store.getSummary(sessionId);
    return res.json({ summary: s ? { content: s.content, ts: s.ts } : null });
  }
  const { Summary } = await import('../models/summary');
  const s = await Summary.findOne({ sessionId }).lean();
  return res.json({ summary: s ? { content: s.content, ts: (s as any).updatedAt } : null });
});

router.post('/:id/summarize', authenticate, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  const content = String(req.body?.content || '').slice(0, 1000);
  if (useMock) {
    const s = store.upsertSummary(sessionId, content);
    return res.json({ summary: { content: s.content, ts: s.ts } });
  }
  const { Summary } = await import('../models/summary');
  const s = await Summary.findOneAndUpdate({ sessionId }, { $set: { content } }, { upsert: true, new: true });
  return res.json({ summary: { content: s.content, ts: (s as any).updatedAt } });
});

router.post('/:id/summarize/auto', authenticate, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  let content = '';
  if (useMock) {
    const msgs = store.listMessages(sessionId).slice(-10);
    content = msgs.map(m => `${m.role}: ${m.content.slice(0, 160)}`).join('\n');
    const s = store.upsertSummary(sessionId, content);
    return res.json({ summary: { content: s.content, ts: s.ts } });
  }
  const msgs = await Message.find({ sessionId }).sort({ createdAt: 1 }).lean();
  const last = msgs.slice(-10);
  content = last.map((m: any) => `${m.role}: ${String(m.content).slice(0, 160)}`).join('\n');
  const { Summary } = await import('../models/summary');
  const s = await Summary.findOneAndUpdate({ sessionId }, { $set: { content } }, { upsert: true, new: true });
  return res.json({ summary: { content: s.content, ts: (s as any).updatedAt } });
});

export default router;
