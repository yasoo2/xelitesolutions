import { Router } from 'express';
import mongoose from 'mongoose';
import { Approval } from '../models/approval';
import { broadcast } from '../ws';
import { store } from '../mock/store';
import { planContext } from '../approvals/context';
import { executeTool } from '../tools/registry';
import { Run } from '../models/run';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/:id/decision', authenticate as any, async (req, res) => {
  const id = String(req.params.id);
  const { decision } = req.body || {};
  if (!['approved', 'denied'].includes(String(decision))) return res.status(400).json({ error: 'Invalid decision' });
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  const ctx = planContext.get(id);
  if (useMock) {
    const a = store.updateApproval(id, { status: decision as any });
    if (!a || !ctx) return res.status(404).json({ error: 'Approval not found' });
    broadcast({ type: 'approval_result', runId: ctx.runId, data: { id, decision } });
    if (decision === 'approved') {
      broadcast({ type: 'step_started', runId: ctx.runId, data: { name: `execute:${ctx.name}` } });
      const result = await executeTool(ctx.name, ctx.input);
      broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: ctx.runId, data: { name: `execute:${ctx.name}`, result } });
      if (result.artifacts) {
        for (const a of result.artifacts) {
          store.addArtifact(ctx.runId, a.name, a.href);
          broadcast({ type: 'artifact_created', runId: ctx.runId, data: { name: a.name, href: a.href } });
        }
      }
      store.updateRun(ctx.runId, { status: result.ok ? 'done' : 'failed' });
      broadcast({ type: 'run_finished', runId: ctx.runId, data: { runId: ctx.runId, ok: result.ok } });
      planContext.delete(id);
      return res.json({ ok: true, result });
    } else {
      store.updateRun(ctx.runId, { status: 'denied' as any });
      broadcast({ type: 'run_finished', runId: ctx.runId, data: { runId: ctx.runId, ok: false } });
      planContext.delete(id);
      return res.json({ ok: true, denied: true });
    }
  } else {
    const a = await Approval.findByIdAndUpdate(id, { $set: { status: decision } }, { new: true });
    if (!a || !ctx) return res.status(404).json({ error: 'Approval not found' });
    broadcast({ type: 'approval_result', runId: ctx.runId, data: { id, decision } });
    if (decision === 'approved') {
      broadcast({ type: 'step_started', runId: ctx.runId, data: { name: `execute:${ctx.name}` } });
      const result = await executeTool(ctx.name, ctx.input);
      broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: ctx.runId, data: { name: `execute:${ctx.name}`, result } });
      if (result.artifacts) {
        // Persist artifacts in DB using Artifact model if needed
      }
      await Run.findByIdAndUpdate(ctx.runId, { $set: { status: result.ok ? 'done' : 'failed' } });
      broadcast({ type: 'run_finished', runId: ctx.runId, data: { runId: ctx.runId, ok: result.ok } });
      planContext.delete(id);
      return res.json({ ok: true, result });
    } else {
      await Run.findByIdAndUpdate(ctx.runId, { $set: { status: 'denied' } });
      broadcast({ type: 'run_finished', runId: ctx.runId, data: { runId: ctx.runId, ok: false } });
      planContext.delete(id);
      return res.json({ ok: true, denied: true });
    }
  }
});

export default router;
