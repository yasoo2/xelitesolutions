/**
 * MUSE wiring audit 111 — dispatch-reachability battery, families 6-8 (Level 3).
 *
 * Follow-up to 110 (5 families handler-proven; next step named browser/git/
 * npm). For one representative tool per family this probe executes the REAL
 * executeTool dispatch path (alias layer -> registry -> firewall -> approval
 * gate -> handler) with inputs each layer provably rejects BEFORE any side
 * effect. Every expectation below was derived from source BEFORE the run:
 *
 *   B1 browser_run  {}                                        -> 'sessionId_required'
 *      (HANDLER, BrowserRunTool.ts:248 — before auth/session/browser work)
 *   B2 browser_run  {sessionId:'probe-111-no-such-session'}   -> 'forbidden'
 *      (HANDLER, :259-267 — unknown chat id fails canAccessBrowserSession;
 *      read-only JSON-store lookup, no session row created)
 *   G1 git_ops      {operation:'push'}                        -> approval_required, risk=high
 *      (GATE, ToolService classifyToolRisk git_ops push/commit -> high)
 *   G2 git_ops      {operation:''}                            -> 'invalid_git_operation'
 *      (HANDLER, GitTools.ts runGitWithEnv regex rejects '' BEFORE spawn)
 *   N1 npm_manager  {}                                        -> 'missing_command'
 *      (HANDLER, SystemTools.ts:1212 — before safePath/workspace/spawn)
 *
 * Risk note (source-derived): browser_run/git_ops('')/npm_manager classify as
 * 'medium', which the gate ALLOWS under default autoSafe=true — only 'high'/
 * 'critical' (shell default, git push/commit) meet approval_required. The
 * probe asserts exactly that split.
 *
 * Safety: same isolated tsx method as 110 — canonical test env (setup.ts:
 * JSON persistence, mock DB), bypass OFF (hermetic), full attribution, NO
 * sessionId, zero network, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-111. No AUTO_APPROVE_* is set at
 * any point in this probe: every handler case reaches the handler through the
 * default medium-risk allowance, and every asserted error return precedes the
 * effect in source. No source is modified by this script.
 *
 * Run from api/ with plain DOS CWD:
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-111-dispatch-probe.ts
 */
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';

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
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const attr = { workspaceId: 'probe-ws-111', userId: 'probe-user-111' } as any;

  await executionFirewall.runInContext('muse-111-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()}`,
      pass: p0a && p0b, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107/108/109/110',
    });

    // D1: echo positive control (106-P3 / 110-D1).
    const r1: any = await executeTool('echo', { text: 'probe-111' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-111',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-111')}`,
      pass: r1?.ok === true && out1.includes('probe-111'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // B1: browser dispatch, HANDLER layer — missing sessionId, pre-auth.
    const rb1: any = await executeTool('browser_run', {}, attr);
    results.push({
      case: 'B1-browser-handler-noscid', expect: 'ok=false error=sessionId_required',
      actual: `ok=${rb1?.ok} error=${rb1?.error}`,
      pass: rb1?.ok === false && rb1?.error === 'sessionId_required',
      detail: `logs=${JSON.stringify((rb1?.logs || []).slice(-2))}`,
    });

    // B2: browser dispatch, HANDLER auth layer — unknown session, read-only.
    const rb2: any = await executeTool('browser_run', { sessionId: 'probe-111-no-such-session' }, attr);
    results.push({
      case: 'B2-browser-handler-forbidden', expect: 'ok=false error=forbidden',
      actual: `ok=${rb2?.ok} error=${rb2?.error}`,
      pass: rb2?.ok === false && rb2?.error === 'forbidden',
      detail: 'unknown chat id; JSON-store lookup only, nothing created',
    });

    // G1: git dispatch, GATE layer — push is high-risk.
    const rg1: any = await executeTool('git_ops', { operation: 'push' }, attr);
    results.push({
      case: 'G1-git-gate', expect: 'ok=false error=approval_required risk=high',
      actual: `ok=${rg1?.ok} error=${rg1?.error} risk=${(rg1?.output as any)?.risk}`,
      pass: rg1?.ok === false && rg1?.error === 'approval_required' && (rg1?.output as any)?.risk === 'high',
      detail: `logs=${JSON.stringify((rg1?.logs || []).slice(-1))}`,
    });

    // G2: git dispatch, HANDLER layer — empty op rejected before spawn.
    const rg2: any = await executeTool('git_ops', { operation: '' }, attr);
    results.push({
      case: 'G2-git-handler', expect: 'ok=false error=invalid_git_operation',
      actual: `ok=${rg2?.ok} error=${String(rg2?.error || '').slice(0, 60)}`,
      pass: rg2?.ok === false && rg2?.error === 'invalid_git_operation',
      detail: 'runGitWithEnv regex rejects empty op; no subprocess spawned',
    });

    // N1: npm dispatch, HANDLER layer — missing command, pre-spawn.
    const rn1: any = await executeTool('npm_manager', {}, attr);
    results.push({
      case: 'N1-npm-handler', expect: 'ok=false error=missing_command',
      actual: `ok=${rn1?.ok} error=${rn1?.error}`,
      pass: rn1?.ok === false && rn1?.error === 'missing_command',
      detail: 'empty command returns before safePath/workspace/spawn',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-111-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-111-dispatch', fatal: String(e?.stack || e) }));
  process.exitCode = 2;
});
