import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { store } from '../mock/store';
import { authenticate } from '../middleware/auth';
import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';

const router = Router();

router.post('/merge', authenticate as any, async (req: Request, res: Response) => {
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

router.get('/', authenticate as any, async (_req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ sessions: store.listSessions() });
  }
  const sessions = await Session.find().sort({ isPinned: -1, updatedAt: -1 }).lean();
  return res.json({ sessions });
});

router.get('/search', authenticate as any, async (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ results: [] });

  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ results: [] });
  }

  // Simple regex search for now. For production, use Atlas Search or Text Index.
  const messages = await Message.find({
    content: { $regex: query, $options: 'i' }
  }).sort({ createdAt: -1 }).limit(20).populate('sessionId', 'title');

  const results = messages.map(m => ({
    messageId: m._id,
    sessionId: (m.sessionId as any)._id,
    sessionTitle: (m.sessionId as any).title,
    content: m.content,
    createdAt: m.createdAt,
  }));

  return res.json({ results });
});

router.get('/:id/analytics', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  
  if (useMock) {
    const session = store.getSession(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const msgs = store.listMessages(id);
    const runs = store.listRuns(id);
    
    let totalSteps = 0;
    let successfulRuns = 0;
    const runIds: string[] = [];
    
    runs.forEach(r => {
        totalSteps += r.steps?.length || 0;
        if (r.status === 'done') successfulRuns++;
        runIds.push(r.id);
    });

    const allExecs = store.listExecs(); // Get all execs then filter
    const tools = allExecs.filter(e => runIds.includes(e.runId));
    
    const toolUsage: Record<string, number> = {};
    let toolErrors = 0;
    
    tools.forEach(t => {
        toolUsage[t.name] = (toolUsage[t.name] || 0) + 1;
        if (!t.ok) toolErrors++;
    });

    return res.json({ 
        duration: (session.lastUpdatedAt || Date.now()) - (session.lastUpdatedAt || Date.now()), // Mock duration 0 for now
        messageCount: msgs.length, 
        runCount: runs.length, 
        totalSteps,
        successfulRuns,
        successRate: runs.length > 0 ? (successfulRuns / runs.length) * 100 : 0,
        toolUsage,
        totalToolCalls: tools.length,
        toolErrorRate: tools.length > 0 ? (toolErrors / tools.length) * 100 : 0
    });
  }

  try {
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const messageCount = await Message.countDocuments({ sessionId: id });
    const runs = await Run.find({ sessionId: id });
    const runCount = runs.length;
    
    // Calculate steps and tool usage
    let totalSteps = 0;
    let successfulRuns = 0;
    
    runs.forEach(r => {
        totalSteps += r.steps?.length || 0;
        if (r.status === 'done') successfulRuns++;
    });

    // Get tool executions for this session's runs
    const runIds = runs.map(r => r._id);
    const tools = await ToolExecution.find({ runId: { $in: runIds } });
    
    const toolUsage: Record<string, number> = {};
    let toolErrors = 0;
    
    tools.forEach(t => {
        toolUsage[t.name] = (toolUsage[t.name] || 0) + 1;
        if (!t.ok) toolErrors++;
    });

    const duration = session.lastUpdatedAt.getTime() - session.createdAt.getTime();

    return res.json({
        duration, // in ms
        messageCount,
        runCount,
        totalSteps,
        successfulRuns,
        successRate: runCount > 0 ? (successfulRuns / runCount) * 100 : 0,
        toolUsage,
        totalToolCalls: tools.length,
        toolErrorRate: tools.length > 0 ? (toolErrors / tools.length) * 100 : 0
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

router.delete('/', authenticate as any, async (_req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    // store.clearAll();
    return res.json({ ok: true });
  }
  await Session.deleteMany({});
  await Message.deleteMany({});
  await Run.deleteMany({});
  return res.json({ ok: true });
});

router.get('/:id', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ session: store.getSession(id) });
  }
  const session = await Session.findById(id).lean();
  if (!session) return res.status(404).json({ error: 'Not found' });
  return res.json({ session });
});

router.delete('/:id', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    store.deleteSession(id);
    return res.json({ ok: true });
  }
  await Session.deleteOne({ _id: id });
  await Message.deleteMany({ sessionId: id });
  await Run.deleteMany({ sessionId: id });
  return res.json({ ok: true });
});

router.patch('/:id/state', authenticate as any, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { terminalState, browserState } = req.body;
    
    const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
    if (useMock) return res.json({ ok: true });
    
    await Session.findByIdAndUpdate(id, {
        $set: {
            terminalState,
            browserState,
            lastUpdatedAt: new Date()
        }
    });
    
    return res.json({ ok: true });
});

export default router;
