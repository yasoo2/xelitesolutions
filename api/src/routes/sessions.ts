import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { store } from '../mock/store';
import { authenticate } from '../middleware/auth';
import { Run } from '../models/run';
import { ToolExecution } from '../models/toolExecution';
import { Summary } from '../models/summary';
import { MemoryService } from '../services/memory';
import { generateSummary, SYSTEM_PROMPT } from '../llm';
import { MemoryItem } from '../models/memoryItem';
import { broadcast } from '../ws';
import { executeTool } from '../tools/registry';
import { popPendingTool, setSessionSecret } from '../services/secrets';

const router = Router();

// Create Session
router.post('/', authenticate as any, async (req: Request, res: Response) => {
  const { title } = req.body;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  try {
    if (useMock) {
      const session = store.createSession(title || 'New Session');
      return res.json(session);
    }

    const session = await Session.create({ title: title || 'New Session' });
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.post('/:id/secrets', authenticate as any, async (req: Request, res: Response) => {
  const sessionId = String(req.params.id || '').trim();
  const key = String(req.body?.key || '').trim();
  const value = typeof req.body?.value === 'string' ? req.body.value : String(req.body?.value ?? '');
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
  if (!key) return res.status(400).json({ error: 'Missing key' });
  if (!value) return res.status(400).json({ error: 'Missing value' });
  if (value.length > 8000) return res.status(400).json({ error: 'Value too large' });

  setSessionSecret(sessionId, key, value);

  const pending = popPendingTool(sessionId);
  if (!pending) return res.json({ ok: true });

  if (useMock) {
    store.updateRun(pending.runId, { status: 'running' as any });
  } else {
    try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'running' } }); } catch {}
  }

  broadcast({ type: 'step_started', runId: pending.runId, data: { name: `execute:${pending.name}`, input: pending.input } });
  const result = await executeTool(pending.name, pending.input);
  broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: pending.runId, data: { name: `execute:${pending.name}`, result } });

  const toText = (r: any) => {
    const outStr =
      typeof r?.output?.output === 'string'
        ? r.output.output
        : typeof r?.output?.text === 'string'
          ? r.output.text
          : r?.output != null
            ? JSON.stringify(r.output)
            : '';
    if (r?.ok) return outStr || 'تم التنفيذ بنجاح.';
    const errStr = typeof r?.error === 'string' ? r.error : Array.isArray(r?.logs) ? r.logs.join('\n') : 'فشل التنفيذ.';
    return `فشل التنفيذ: ${errStr}`;
  };

  const assistantText = toText(result);
  broadcast({ type: 'text', runId: pending.runId, data: assistantText });

  if (useMock) {
    store.addExec(pending.runId, pending.name, pending.input, result.output, result.ok, result.logs);
    store.addMessage(sessionId, 'assistant', assistantText, pending.runId);
  } else {
    try {
      await ToolExecution.create({
        runId: pending.runId,
        name: pending.name || 'unknown',
        input: pending.input,
        output: result.output,
        ok: result.ok,
        logs: result.logs,
      });
    } catch {}
    try {
      await Message.create({ sessionId, role: 'assistant', content: assistantText, runId: pending.runId });
    } catch {}
  }

  if (useMock) {
    store.updateRun(pending.runId, { status: result.ok ? 'done' : 'failed' });
  } else {
    try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: result.ok ? 'done' : 'failed' } }); } catch {}
  }

  broadcast({ type: 'run_finished', runId: pending.runId, data: { runId: pending.runId, ok: result.ok } });
  return res.json({ ok: true, resumed: true, result });
});

// Get Session Messages
router.get('/:id/messages', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  
  try {
    if (useMock) {
      const messages = store.listMessages(id).filter(m => m.role !== 'system');
      return res.json({ messages });
    }
    
    const messages = await Message.find({ sessionId: id, role: { $ne: 'system' } }).sort({ createdAt: 1 }).lean();
    res.json({ messages });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get Full Session Context
router.get('/:id/context', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = (req as any).auth?.sub;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  try {
    let summary = '';
    let recentMessages: any[] = [];
    let memories: any[] = [];

    if (useMock) {
        summary = store.getSummary(id)?.content || '';
        recentMessages = store.listMessages(id).filter(m => m.role !== 'system').slice(-10);
    } else {
        const sumDoc = await Summary.findOne({ sessionId: id });
        summary = sumDoc?.content || '';
        
        recentMessages = await Message.find({ sessionId: id, role: { $ne: 'system' } })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        // reverse to show in order
        recentMessages.reverse();

        if (userId) {
            memories = await MemoryItem.find({ userId }).sort({ createdAt: -1 }).lean();
        }
    }

    res.json({
        systemPrompt: SYSTEM_PROMPT,
        summary,
        recentMessages,
        memories
    });
  } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch context' });
  }
});

// Get Session Summary
router.get('/:id/summary', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  
  if (useMock) {
    const s = store.getSummary(id);
    return res.json({ summary: s });
  }

  try {
    const summary = await Summary.findOne({ sessionId: id });
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Manual Summarize
router.post('/:id/summarize', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;
  
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    store.upsertSummary(id, content);
    return res.json({ ok: true });
  }

  try {
    await Summary.findOneAndUpdate(
      { sessionId: id },
      { content },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update summary' });
  }
});

// Auto Summarize
router.post('/:id/summarize/auto', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  try {
    // Check if we have messages
    let messages: any[] = [];
    if (useMock) {
        messages = store.listMessages(id);
    } else {
        messages = await Message.find({ sessionId: id }).sort({ createdAt: 1 }).limit(100);
    }
    
    if (messages.length === 0) return res.json({ ok: true });

    const msgsForLLM = messages.map(m => ({ 
        role: m.role || 'user', 
        content: String(m.content || '') 
    }));
    
    const summaryContent = await generateSummary(msgsForLLM);
    
    if (useMock) {
        store.upsertSummary(id, summaryContent);
    } else {
        await Summary.findOneAndUpdate(
            { sessionId: id },
            { content: summaryContent },
            { upsert: true, new: true }
        );
    }

    res.json({ ok: true, summary: summaryContent });
  } catch (e) {
    console.error('Auto summary error:', e);
    res.status(500).json({ error: 'Auto summary failed' });
  }
});

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
  const kindRaw = String((_req.query as any)?.kind || '').trim();
  const kind = kindRaw === 'agent' ? 'agent' : kindRaw === 'chat' ? 'chat' : null;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const all = store.listSessions();
    const filtered = kind ? all.filter((s: any) => (s as any).kind === kind) : all;
    return res.json({ sessions: filtered });
  }
  const sessions = await Session.find(kind ? { kind } : {}).sort({ isPinned: -1, updatedAt: -1 }).lean();
  return res.json({ sessions });
});

router.get('/search', authenticate as any, async (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ results: [] });

  const kindRaw = String((req.query as any).kind || '').trim();
  const kind = kindRaw === 'agent' ? 'agent' : kindRaw === 'chat' ? 'chat' : null;

  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ results: [] });
  }

  // Simple regex search for now. For production, use Atlas Search or Text Index.
  const messages = await Message.find({
    content: { $regex: query, $options: 'i' },
    role: { $ne: 'system' }
  }).sort({ createdAt: -1 }).limit(20).populate('sessionId', 'title kind');

  const filteredMessages = kind ? messages.filter(m => (m.sessionId as any)?.kind === kind) : messages;

  const results = filteredMessages.map(m => ({
    messageId: m._id,
    sessionId: (m.sessionId as any)._id,
    sessionTitle: (m.sessionId as any).title,
    content: m.content,
    createdAt: m.createdAt,
  }));

  return res.json({ results });
});

router.get('/:id/history', authenticate as any, async (req: Request, res: Response) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const msgs = store.listMessages(id).filter(m => m.role !== 'system');
    const events = msgs.map(m => ({
      type: m.role === 'user' ? 'user_input' : 'text',
      data: m.content,
      ts: m.ts,
    }));
    return res.json({ events });
  }
  try {
    const msgs = await Message.find({ sessionId: id, role: { $ne: 'system' } }).sort({ createdAt: 1 }).lean();
    const events = msgs.map(m => ({
      type: m.role === 'user' ? 'user_input' : 'text',
      data: m.content,
      ts: (m as any).createdAt ? new Date((m as any).createdAt).getTime() : Date.now(),
    }));
    return res.json({ events });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
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
    const { terminalState } = req.body;
    
    const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
    if (useMock) return res.json({ ok: true });
    
    await Session.findByIdAndUpdate(id, {
        $set: {
            terminalState,
            lastUpdatedAt: new Date()
        }
    });
    
    return res.json({ ok: true });
});

export default router;
