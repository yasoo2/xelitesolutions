import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import { broadcast, LiveEvent } from '../ws';
import { executeTool } from '../tools/registry';
import { store } from '../mock/store';
import { ToolExecution } from '../models/toolExecution';
import { Artifact } from '../models/artifact';
import { Approval } from '../models/approval';
import { Run } from '../models/run';

const router = Router();

function pickToolFromText(text: string) {
  const t = text.toLowerCase();
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (t.includes('fetch') && urlMatch) return { name: 'http_fetch', input: { url: urlMatch[0] } };
  if (t.includes('write')) return { name: 'file_write', input: { filename: 'note.txt', content: text } };
  if (t.includes('browser') && urlMatch) return { name: 'browser_snapshot', input: { url: urlMatch[0] } };
  return { name: 'echo', input: { text } };
}

function detectRisk(text: string) {
  const risky = /(rm\s+-rf|delete|drop\s+table|shutdown|kill\s+process)/i;
  if (risky.test(text)) {
    return 'HIGH: instruction matches destructive pattern';
  }
  return null;
}

router.post('/start', authenticate, async (req: Request, res: Response) => {
  let { text, sessionId } = req.body || {};
  const ev = (e: LiveEvent) => broadcast(e);
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;

  ev({ type: 'step_started', data: { name: 'plan' } });
  const plan = pickToolFromText(String(text || ''));
  ev({ type: 'step_done', data: { name: 'plan', plan } });

  if (!sessionId) {
    if (useMock) {
      const s = store.createSession('Untitled Session');
      sessionId = s.id;
    } else {
      const { Session } = await import('../models/session');
      const { Tenant } = await import('../models/tenant');
      const tenantName = process.env.DEFAULT_TENANT_NAME || 'XElite Solutions';
      const tenantDoc = await Tenant.findOneAndUpdate(
        { name: tenantName },
        { $setOnInsert: { name: tenantName } },
        { upsert: true, new: true }
      );
      // Try to find a default user or use the one from auth if available
      // Since this is a public/open endpoint in some contexts, we might need a fallback
      // But ideally req.user should be there if authenticated.
      // If not authenticated, we can't really create a session for a user easily.
      // Assuming authenticated for now, or using a placeholder if needed.
      const userId = (req as any).auth?.sub; 
      
      if (!userId) {
        // If no user, we can't create a valid session per schema (userId required).
        // Return error or handle gracefully.
        return res.status(400).json({ error: 'Session ID required or must be logged in to create one' });
      }

      const s = await Session.create({ title: `Session ${new Date().toLocaleString()}`, mode: 'ADVISOR', userId, tenantId: tenantDoc._id });
      sessionId = s._id.toString();
    }
  }

  let runId: string;
  if (useMock) {
    const run = store.createRun(sessionId);
    runId = run.id;
    store.addStep(runId, 'plan', 'done');
  } else {
    const run = await Run.create({ sessionId, status: 'running', steps: [{ name: 'plan', status: 'done' }] });
    runId = run._id.toString();
  }

  const risk = detectRisk(String(text || ''));
  if (risk) {
    if (useMock) {
      const ap = store.createApproval(runId, String(text || ''), risk, plan.name, plan.input);
      ev({ type: 'approval_required', data: { id: ap.id, runId, risk, action: text } });
      store.updateRun(runId, { status: 'blocked' });
      // store plan context for continuation
      const { planContext } = await import('../approvals/context');
      planContext.set(ap.id, { runId, name: plan.name, input: plan.input });
      return res.json({ runId, blocked: true, approvalId: ap.id });
    } else {
      const ap = await Approval.create({ runId, action: String(text || ''), risk, status: 'pending' });
      ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
      const { planContext } = await import('../approvals/context');
      planContext.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
      return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
    }
  }

  ev({ type: 'step_started', data: { name: `execute:${plan.name}` } });
  const result = await executeTool(plan.name, plan.input);
  if (result.logs?.length) {
    for (const line of result.logs) {
      ev({ type: 'evidence_added', data: { kind: 'log', text: line } });
    }
  }
  ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan.name}`, result } });

  if (useMock) {
    store.addExec(runId, plan.name, plan.input, result.output, result.ok, result.logs);
    if (result.artifacts) {
      for (const a of result.artifacts) {
        store.addArtifact(runId, a.name, a.href);
        ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
        ev({ type: 'evidence_added', data: { kind: 'artifact', name: a.name, href: a.href } });
      }
    }
    store.updateRun(runId, { status: result.ok ? 'done' : 'failed' });
  } else {
    await ToolExecution.create({ runId, name: plan.name, input: plan.input, output: result.output, ok: result.ok, logs: result.logs });
    if (result.artifacts) {
      for (const a of result.artifacts) {
        await Artifact.create({ runId, name: a.name, href: a.href });
        ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
        ev({ type: 'evidence_added', data: { kind: 'artifact', name: a.name, href: a.href } });
      }
    }
    await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' }, $push: { steps: { name: `execute:${plan.name}`, status: result.ok ? 'done' : 'failed' } } });
  }

  ev({ type: 'run_finished', data: { runId, ok: result.ok } });
  // persist messages if sessionId provided
  try {
    if (sessionId) {
      const useMock2 = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
      if (useMock2) {
        store.addMessage(sessionId, 'user', String(text || ''));
        store.addMessage(sessionId, 'assistant', result.output ? JSON.stringify(result.output).slice(0, 512) : String(result.error || ''));
      } else {
        const { Message } = await import('../models/message');
        const userMsg = await Message.create({ sessionId, role: 'user', content: String(text || '') });
        const asstContent = result.output ? JSON.stringify(result.output).slice(0, 512) : String(result.error || '');
        const asstMsg = await Message.create({ sessionId, role: 'assistant', content: asstContent });
        const { Session } = await import('../models/session');
        await Session.findByIdAndUpdate(sessionId, { $set: { lastSnippet: asstContent.slice(0, 140), lastUpdatedAt: new Date() } });
      }
    }
  } catch {}
  res.json({ runId, result });
});

router.get('/', async (_req: Request, res: Response) => {
  const useMock = process.env.MOCK_DB === '1' || mongoose.connection.readyState !== 1;
  if (useMock) {
    res.json({ runs: store.listRuns() });
  } else {
    const runs = await Run.find().lean();
    res.json({ runs });
  }
});

router.post('/plan', async (req: Request, res: Response) => {
  const { text } = req.body || {};
  const ev = (e: LiveEvent) => broadcast(e);
  ev({ type: 'step_started', data: { name: 'plan' } });
  const plan = pickToolFromText(String(text || ''));
  ev({ type: 'step_done', data: { name: 'plan', plan } });
  res.json({ plan });
});

export default router;
