/**
 * MUSE wiring audit 106 — 079-R2 bypass-off dispatch probe.
 *
 * Question (079-R2): local runs use ENABLE_AUTH_BYPASS, so the ToolService
 * attribution firewall (ToolService.ts:722-785) is dormant in practice.
 * This probe executes the REAL executeTool dispatch path with the bypass OFF
 * in an isolated process and checks:
 *   P1: no context            -> workspace_required
 *   P2: workspaceId, no user  -> unauthorized
 *   P3: workspaceId + userId  -> firewall passes, echo executes (ok:true)
 *
 * Safety: tool under test is `echo` (pure passthrough, SystemTools.ts:659-671,
 * zero side effects, risk 'low'). No sessionId is passed, so no session-store
 * lookup runs. No network, no files written by the tool. Process-scoped env
 * only. No source is modified by this script.
 *
 * Run from api/: ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-106-bypass-probe.ts
 */
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools, contractDefaults } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';

interface CaseResult {
  case: string;
  expect: string;
  actual: string;
  pass: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
  };
  // Hermetic bypass-off: the probe question is meaningless if ambient env
  // carries the bypass. Process-scoped only; recorded in output.
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  await executionFirewall.runInContext('muse-106-probe', async () => {
    // P0 preconditions: orchestrator-authorized, NON-system, bypass off.
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()}`,
      pass: p0a && p0b, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    // P0c: echo must be registered AND default-granted (the 079 mechanism).
    const echoDef: any = (tools as any[]).find((t: any) => t.name === 'echo');
    const echoPerms: string[] = Array.isArray(echoDef?.permissions) ? echoDef.permissions : [];
    const defaulted = (contractDefaults.permissions as string[]).includes('echo→read');
    results.push({
      case: 'P0c-echo-defaulted', expect: 'registered+permissions=[read]+contractDefaults_has_echo→read',
      actual: `registered=${!!echoDef} permissions=[${echoPerms.join('/')}] defaulted=${defaulted}`,
      pass: !!echoDef && echoPerms.includes('read') && defaulted,
      detail: 'ties the dispatch result to the 079 defaulting mechanism',
    });

    // P1: no context -> unauthorized (NOT workspace_required: ToolService.ts:336-342
    // auto-assigns a workspace BEFORE the firewall at :722-771, so the
    // workspace_required branch at :764-767 is unreachable. Recorded as F-106-1.)
    const r1: any = await executeTool('echo', { text: 'probe-1' });
    results.push({
      case: 'P1-no-context', expect: 'ok=false error=unauthorized',
      actual: `ok=${r1?.ok} error=${r1?.error}`,
      pass: r1?.ok === false && r1?.error === 'unauthorized',
      detail: `logs=${JSON.stringify((r1?.logs || []).slice(-2))}`,
    });

    // P2: workspaceId but no userId -> unauthorized.
    const r2: any = await executeTool('echo', { text: 'probe-2' }, { workspaceId: 'probe-ws-106' } as any);
    results.push({
      case: 'P2-no-user', expect: 'ok=false error=unauthorized',
      actual: `ok=${r2?.ok} error=${r2?.error}`,
      pass: r2?.ok === false && r2?.error === 'unauthorized',
      detail: `logs=${JSON.stringify((r2?.logs || []).slice(-2))}`,
    });

    // P3: full attribution -> firewall passes, echo executes.
    const r3: any = await executeTool('echo', { text: 'probe-3' }, { workspaceId: 'probe-ws-106', userId: 'probe-user-106' } as any);
    const out3 = JSON.stringify(r3?.output ?? r3);
    results.push({
      case: 'P3-attributed', expect: 'ok=true output_contains_probe-3',
      actual: `ok=${r3?.ok} error=${r3?.error ?? 'none'} output_has_probe3=${out3.includes('probe-3')}`,
      pass: r3?.ok === true && out3.includes('probe-3'),
      detail: `output=${out3.slice(0, 200)}`,
    });

    // P4: userId but NO workspaceId -> executes in auto-assigned
    // 'default-workspace' (fail-open workspace leg, F-106-1). Intercept
    // console.info to capture the auto-assign line as the mechanism proof.
    const seen: string[] = [];
    const realInfo = console.info;
    console.info = (...a: any[]) => {
      try { seen.push(String(a[0] ?? '')); } catch { /* ignore */ }
      return (realInfo as any)(...a);
    };
    let r4: any = null;
    try {
      r4 = await executeTool('echo', { text: 'probe-4' }, { userId: 'probe-user-106' } as any);
    } finally {
      console.info = realInfo;
    }
    const autoLine = seen.find((s) => s.includes('Auto-assigned workspace context')) || '';
    const out4 = JSON.stringify(r4?.output ?? r4);
    results.push({
      case: 'P4-user-no-workspace', expect: 'ok=true auto-assigned=default-workspace',
      actual: `ok=${r4?.ok} error=${r4?.error ?? 'none'} autoLine=${JSON.stringify(autoLine)} output_has_probe4=${out4.includes('probe-4')}`,
      pass: r4?.ok === true && autoLine.includes('default-workspace') && out4.includes('probe-4'),
      detail: 'proves the workspace leg auto-satisfies instead of failing closed',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-106-bypass', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-106-bypass', fatal: String(e?.stack || e) }));
  process.exitCode = 2;
});
