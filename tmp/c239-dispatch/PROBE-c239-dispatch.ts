// C239 navigator dispatch-side probe (throwaway; receipt persisted separately).
// Side-effect-free by construction: registry lookup + alias check + firewall
// gate checks + one unknown_tool miss (returns before any effect branch) +
// one positive-control search_text over a disposable 1-file fixture.
// No sessionId/traceId (skips broadcast/trace), no network, no repo writes.
import { tools } from '../../api/src/modules/tools/registry';
import { executeTool, TOOL_ALIASES } from '../../api/src/modules/services/ToolService';
import { executionFirewall } from '../../api/src/orchestration/AgentExecutionFirewall';

const out: any = { registryTotal: (tools as any[]).length, head: 'HEAD', checks: {} };

async function main() {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  // 1. Static dispatch inputs (same predicates as ToolService.ts L675/L692).
  const found: any = (tools as any[]).find((x: any) => x?.name === 'codebase_navigator');
  (out.checks as any).registryMiss = found ? 'FOUND-UNEXPECTED' : 'MISS';
  (out.checks as any).aliasMiss = (TOOL_ALIASES as any)['codebase_navigator']
    ? 'ALIASED-UNEXPECTED:' + (TOOL_ALIASES as any)['codebase_navigator'] : 'NO-ALIAS';

  // 2. Negative control: direct call outside orchestrator context must throw at firewall.
  try {
    await executeTool('codebase_navigator', { action: 'search', query: 'x' }, undefined as any);
    (out.checks as any).directCall = 'ALLOWED-UNEXPECTED';
  } catch (e: any) {
    (out.checks as any).directCall = 'THROWS:' + String(e?.message || e).slice(0, 100);
  }

  // 3. Real dispatch path inside orchestrator context: expect honest unknown_tool miss.
  const miss: any = await executionFirewall.runInContext('c239', async () => {
    return await executeTool('codebase_navigator', { action: 'search', query: 'zephyr' }, { userId: 'c239-probe' } as any);
  });
  (out.checks as any).dispatchMiss = {
    ok: miss?.ok,
    errorHead: String(miss?.error || '').slice(0, 140),
    logHead: String((miss?.logs || []).join(' | ')).slice(0, 260),
  };

  // 4. Positive control: a registered read-only tool executes through the same path.
  // UtilityTools has its OWN local resolveToolPath (top of file) that requires
  // paths strictly inside getActiveRoot(wsId) — stricter than the shared util.
  // Self-locate that root, plant a unique fixture beneath it, remove after.
  const { workspaceService } = await import('../../api/src/modules/services/WorkspaceService');
  const wsRoot = String(workspaceService.getActiveRoot('default-workspace'));
  const dir = path.join(wsRoot, 'c239-fixture-' + Date.now().toString(36));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'note.txt'), 'zephyr invoice totals 42');
  const hit: any = await executionFirewall.runInContext('c239', async () => {
    return await executeTool('search_text', { query: 'zephyr', path: dir, glob: '*.txt' }, { userId: 'c239-probe' } as any);
  });
  (out.checks as any).positiveControl = {
    ok: hit?.ok,
    sawFixture: JSON.stringify(hit?.output ?? hit).includes('note.txt'),
    errorHead: hit?.ok ? null : String(hit?.error || '').slice(0, 200),
    wsRoot,
  };
  fs.rmSync(dir, { recursive: true, force: true });

  const receiptDir = 'D:/Joe/muse-worktree/tmp/c239-dispatch/work';
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(path.join(receiptDir, 'run.json'), JSON.stringify(out, null, 1));
  const pass = (out.checks as any).registryMiss === 'MISS'
    && (out.checks as any).aliasMiss === 'NO-ALIAS'
    && String((out.checks as any).directCall).startsWith('THROWS:')
    && (out.checks as any).dispatchMiss?.ok === false
    && String((out.checks as any).dispatchMiss?.errorHead).startsWith('unknown_tool: "codebase_navigator"')
    && (out.checks as any).positiveControl?.ok === true
    && (out.checks as any).positiveControl?.sawFixture === true;
  console.log('PROBE-' + (pass ? 'OK' : 'MISMATCH') + ' registryTotal=' + out.registryTotal);
  if (!pass) console.log(JSON.stringify(out.checks, null, 1));
}
main().then(() => process.exit(0), (e) => { console.error('PROBE-FAILED:', e?.message || e); process.exit(2); });
