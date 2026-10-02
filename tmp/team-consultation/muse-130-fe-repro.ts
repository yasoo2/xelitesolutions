import * as fs from 'fs';
import * as path from 'path';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';

async function main(): Promise<void> {
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;
  const sbx = String(process.env.JOE_TEST_TMP_ROOT || '');
  const attr = { workspaceId: 'probe-ws-130', userId: 'probe-user-130' } as any;
  const target = path.join(sbx, 'fx130', 'fe-proj', 'multi130.txt');
  await executionFirewall.runInContext('muse-130-fe-repro', async () => {
    const r: any = await executeTool('file_edit_advanced', { filePath: target, edits: [{ find: 'ALPHA130', replace: 'x130' }] }, attr);
    console.log(JSON.stringify({ probe: 'muse-130-fe-repro', ok: r?.ok, error: String(r?.error || '').slice(0, 1500), logs: (r?.logs || []).slice(0, 4) }, null, 2));
  });
}
main().catch((e) => { console.log(JSON.stringify({ probe: 'muse-130-fe-repro', fatal: String(e?.stack || e).slice(0, 1500) })); });
