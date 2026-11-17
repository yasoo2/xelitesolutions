import { Router, Request, Response } from 'express';
import { tools } from '../../modules/tools/registry';
import { executeTool } from '../../modules/services/ToolService';
import { authenticate, superAdminEmails } from '../middleware/auth';

const router = Router();

/**
 * WHO MAY RUN A TOOL BY ITS NAME.
 *
 * 2026-11-17, the tenant review (N1): these two routes ran ANY registered tool
 * for ANY signed-in account — execute_python, shell_execute, engine_device — on
 * the server, in any folder. One sign-up was a shell on the machine that holds
 * every user's projects and Joe's own secret. Only the owner and the super
 * admins may run a tool directly. Everyone else gets the one call Joe's own
 * interface makes here: the file explorer listing the GitHub repositories of the
 * token the user typed (EliteFileExplorer.tsx).
 */
export function mayRunToolDirectly(auth: { role?: string; email?: string } | undefined, tool: string, input: any): boolean {
  if (!auth) return false;
  const email = String(auth.email || '').toLowerCase().trim();
  if (auth.role === 'OWNER' || auth.role === 'SUPER_ADMIN' || (email && superAdminEmails().includes(email))) return true;
  return tool === 'github_repo_manager' && String(input?.action || '') === 'list';
}

function refuseUnlessAllowed(req: Request, res: Response, tool: string, input: any): boolean {
  if (mayRunToolDirectly((req as any)?.auth, tool, input)) return false;
  res.status(403).json({ ok: false, error: 'Forbidden: only the owner may run a tool directly' });
  return true;
}

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

router.post('/execute', authenticate, async (req: Request, res: Response) => {
  const name = String((req.body as any)?.tool || (req.body as any)?.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'tool is required' });
  const userId = (req as any)?.auth?.sub;
  if (typeof userId !== 'string' || !userId.trim()) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const workspaceId = extractWorkspaceId(req);
  const requestedSession = (req.body as any)?.sessionId;
  if (requestedSession !== undefined && (typeof requestedSession !== 'string' || !requestedSession.trim())) {
    return res.status(400).json({ ok: false, error: 'Invalid sessionId' });
  }
  const sessionId = requestedSession?.trim() || `session-${Date.now()}`;
  const input = (req.body as any)?.input || (req.body as any)?.args || req.body || {};
  if (refuseUnlessAllowed(req, res, name, input)) return;
  try {
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const result = await executionFirewall.context.exit(() => executionFirewall.runInContext(undefined, async () => {
        return await executeTool(name, input, { workspaceId, userId, sessionId });
    }, { userId, sessionId }));
    res.json({ ok: result.ok !== undefined ? result.ok : result.success !== false, output: result.output ?? result.data ?? result, error: result.error });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/:name/execute', authenticate, async (req: Request, res: Response) => {
  const name = String(req.params.name);
  const userId = (req as any)?.auth?.sub;
  if (typeof userId !== 'string' || !userId.trim()) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const workspaceId = extractWorkspaceId(req);
  const requestedSession = (req.body as any)?.sessionId;
  if (requestedSession !== undefined && (typeof requestedSession !== 'string' || !requestedSession.trim())) {
    return res.status(400).json({ ok: false, error: 'Invalid sessionId' });
  }
  const sessionId = requestedSession?.trim() || `session-${Date.now()}`;
  if (refuseUnlessAllowed(req, res, name, req.body || {})) return;

  try {
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    
    // A user request carries its owner through the gateway, without gaining
    // the trusted-background privilege that skips user policy checks.
    const result = await executionFirewall.context.exit(() => executionFirewall.runInContext(undefined, async () => {
        return await executeTool(name, req.body || {}, {
            workspaceId,
            userId,
            sessionId
        });
    }, { userId, sessionId }));

    res.json({
        ok: result.ok !== undefined ? result.ok : result.success !== false,
        output: result.output || result.data || result
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
