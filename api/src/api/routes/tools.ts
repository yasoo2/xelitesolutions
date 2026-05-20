import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { tools } from '../../modules/tools/registry';
import { executeTool } from '../../modules/services/ToolService';
import { AgentOrchestrator } from '../../orchestration/AgentOrchestrator';
import { broadcast, LiveEvent } from '../ws';
import { authenticate } from '../middleware/auth';

import { Run } from '../../shared/models/run';
import { ToolExecution } from '../../shared/models/toolExecution';

const router = Router();

function extractWorkspaceId(req: Request) {
  const fromReq = (req as any)?.workspace?._id ? String((req as any).workspace._id) : '';
  const fromBody = req.body && typeof req.body === 'object' ? String((req.body as any)?.workspaceId || (req.body as any)?.__workspaceId || '') : '';
  const fromQuery = req.query && typeof req.query === 'object' ? String((req.query as any)?.workspaceId || '') : '';
  const val = (fromReq || fromBody || fromQuery || '').trim();
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



  const orchestrator = new AgentOrchestrator();
  const result = await orchestrator.execute({ 
    id: sessionId || `session-${Date.now()}`, 
    goal: text 
  });

  return res.json({ runId, sessionId, result: { ok: result.ok, output: result.result } });
});

router.post('/selftest', authenticate, async (req: Request, res: Response) => {
  const workspaceId = extractWorkspaceId(req);
  if (!workspaceId) return res.status(400).json({ ok: false, error: 'workspace_required' });

  const userId = String((req as any)?.auth?.sub || '').trim();
  if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const requiredTools = ['project_detect', 'auth_builder', 'swagger_docs', 'dead_code_detector', 'mobile_builder'];
  const available = new Set(tools.map(t => String((t as any)?.name || '').trim()).filter(Boolean));
  const toolPresence = Object.fromEntries(requiredTools.map(n => [n, available.has(n)]));

  const orchestrator = new AgentOrchestrator();
  const detectResult = await orchestrator.execute({
    id: sessionId || `session-${Date.now()}`,
    goal: `Detect project structure at path "${detectPath}" in workspace ${workspaceId}`
  });

  const ok = requiredTools.every(n => toolPresence[n]) && !!detectResult?.ok;
  return res.json({
    ok,
    toolPresence,
    projectDetect: detectResult.result
  });
});

router.post('/:name/execute', authenticate, async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const userId = (req as any)?.auth?.sub;
  const workspaceId = extractWorkspaceId(req);
  const sessionId = (req.body as any)?.sessionId || `session-${Date.now()}`;
  
  try {
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    
    // Deterministic execution for IDE tools without invoking the LLM Orchestrator.
    // We run this as SYSTEM to satisfy the ExecutionFirewall requirements.
    const result = await executionFirewall.runAsSystem(async () => {
        return await executeTool(name, req.body || {}, {
            workspaceId,
            userId,
            sessionId
        });
    });

    res.json({
        ok: result.ok !== undefined ? result.ok : result.success !== false,
        output: result.output || result.data || result
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
