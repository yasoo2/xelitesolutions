import { Router } from 'express';
import mongoose from 'mongoose';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { store } from '../mock/store';
import { authenticate } from '../middleware/auth';
import { Run } from '../models/run';

const router = Router();

router.post('/merge', authenticate, async (req, res) => {
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
router.get('/', authenticate, async (_req, res) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ sessions: store.listSessions() });
  }
  const sessions = await Session.find().lean();
  return res.json({ sessions });
});

router.post('/', authenticate, async (req, res) => {
  const { title, mode } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Missing title' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    const s = store.createSession(title, mode || 'ADVISOR');
    return res.status(201).json(s);
  }
  const userId = (req as any).auth?.sub;
  const s = await Session.create({ title, mode: mode || 'ADVISOR', userId });
  return res.status(201).json({ id: s._id.toString(), title: s.title, mode: s.mode });
});

router.get('/:id/messages', authenticate, async (req, res) => {
  const sessionId = String(req.params.id);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    return res.json({ messages: store.listMessages(sessionId) });
  }
  const messages = await Message.find({ sessionId }).lean();
  return res.json({ messages });
});

router.post('/:id/messages', authenticate, async (req, res) => {
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

export default router;
