// Muse independent read-only policy-branch probe for TOOL-HTTP-OWNER-GATE-001.
// No network, no writes: compares the identical registered read-only
// decide_capability_route call under an ordinary vs a system firewall context
// on the MUSE tree. Expected: ordinary -> unauthorized (no userId),
// system -> ok:true (authBypass skips the user/session/approval branch).
import { executeTool } from 'file:///D:/Joe/muse-worktree/api/src/modules/services/ToolService.ts';
import { executionFirewall } from 'file:///D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall.ts';

const input = { request: 'offline OCR' };
const base = { sessionId: 'muse-probe-session', workspaceId: 'muse-probe-workspace' };
const userContext = await executionFirewall.runInContext(undefined,
  () => executeTool('decide_capability_route', { ...input }, { ...base }));
const systemContext = await executionFirewall.runAsSystem(
  () => executeTool('decide_capability_route', { ...input }, { ...base }));
const result = {
  tree: 'muse-worktree',
  userContext: { ok: userContext.ok, error: userContext.error || null },
  systemContext: { ok: systemContext.ok, error: systemContext.error || null },
};
console.log(JSON.stringify(result));
if (userContext.error !== 'unauthorized' || systemContext.ok !== true) process.exitCode = 2;
