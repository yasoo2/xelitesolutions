/**
 * MUSE wiring audit 112 — dispatch-reachability battery, families 9-11 (Level 3).
 *
 * Follow-up to 111 (next step named deploy_project action-split, docker_manager,
 * image_studio). For one representative tool per family this probe executes the
 * REAL executeTool dispatch path (alias layer -> registry -> firewall ->
 * approval gate -> handler) with inputs each layer provably rejects BEFORE any
 * side effect. Every expectation below was derived from source BEFORE the run:
 *
 *   P1 deploy_project {action:'expose_port', projectPath:'probe-app-112', port:99999}
 *      -> approval_required, risk=high
 *      (GATE, ToolService classifyToolRisk deploy_project expose_port -> high;
 *      gate fires BEFORE handler port validation, so the invalid port also
 *      pins GATE-before-HANDLER ordering)
 *   P2 deploy_project {action:'build_static'}
 *      -> 'Project path is required and must be workspace-relative.'
 *      (HANDLER, DeployProjectTool.ts:91-93 — before resolve/exists/switch)
 *   P3 deploy_project {action:'build_static', projectPath:'probe-no-such-dir-112'}
 *      -> 'Project path not found: probe-no-such-dir-112'
 *      (HANDLER, :108-110 exists-check — before the action switch)
 *   P4 deploy_project {action:'probe-no-such-action-112', projectPath:'probe-app-112'}
 *      with probe-app-112 pre-created EMPTY via the REAL resolveToolPath
 *      -> 'Unknown action: probe-no-such-action-112' + dir still empty after
 *      (HANDLER, :274 switch default — no build/spawn/tunnel; no-effect proof)
 *   K1 docker_manager {action:'probe-no-such-action-112'}
 *      -> 'Unknown action'
 *      (HANDLER, DockerManagerTool.ts:52 switch default — before
 *      executionEngine.run; no subprocess. Risk default medium -> gate allows.)
 *   I1 image_studio  {}
 *      -> '...no system with tables...'
 *      (HANDLER, ImageStudioTool.ts:130-137 — empty joeProjects/default
 *      session, before readTables/picturesFor; no FS writes, no network.
 *      Risk default medium -> gate allows; dispatch has no 'internet'
 *      special-case, ToolService.ts:722-785.)
 *
 * Safety: same isolated tsx method as 110/111 — canonical test env (setup.ts:
 * JSON persistence, mock DB), bypass OFF (hermetic), full attribution, NO
 * sessionId, zero network, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-112. No AUTO_APPROVE_* is set at
 * any point: every handler case reaches the handler through the default
 * medium-risk allowance, and every asserted error return precedes the
 * effect in source. P4's mkdir is inside containment and asserted empty
 * afterwards. No source is modified by this script.
 *
 * Run from api/ with plain DOS CWD:
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-112-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import { resolveToolPath } from 'D:/Joe/muse-worktree/api/src/modules/tools/utils';

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

  const attr = { workspaceId: 'probe-ws-112', userId: 'probe-user-112' } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-112-probe', async () => {
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
      pass: regCount === 163, detail: 'Muse-lineage pin from 107/108/109/110/111',
    });

    // D1: echo positive control (106-P3 / 110-D1 / 111-D1).
    const r1: any = await executeTool('echo', { text: 'probe-112' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-112',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-112')}`,
      pass: r1?.ok === true && out1.includes('probe-112'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // P1: deploy dispatch, GATE layer — expose_port is high-risk; gate fires
    // before handler port validation (99999 is handler-invalid).
    const rp1: any = await executeTool('deploy_project', { action: 'expose_port', projectPath: 'probe-app-112', port: 99999 }, attr);
    results.push({
      case: 'P1-deploy-gate', expect: 'ok=false error=approval_required risk=high',
      actual: `ok=${rp1?.ok} error=${rp1?.error} risk=${(rp1?.output as any)?.risk}`,
      pass: rp1?.ok === false && rp1?.error === 'approval_required' && (rp1?.output as any)?.risk === 'high',
      detail: `logs=${JSON.stringify((rp1?.logs || []).slice(-1))}`,
    });

    // P2: deploy dispatch, HANDLER layer — missing path, pre-resolve.
    const rp2: any = await executeTool('deploy_project', { action: 'build_static' }, attr);
    results.push({
      case: 'P2-deploy-handler-missing-path', expect: 'ok=false error=Project path is required...',
      actual: `ok=${rp2?.ok} error=${String(rp2?.error || '').slice(0, 60)}`,
      pass: rp2?.ok === false && String(rp2?.error || '').startsWith('Project path is required'),
      detail: 'before resolve/exists/switch; no effect possible',
    });

    // P3: deploy dispatch, HANDLER exists-check — unknown dir, pre-switch.
    const rp3: any = await executeTool('deploy_project', { action: 'build_static', projectPath: 'probe-no-such-dir-112' }, attr);
    results.push({
      case: 'P3-deploy-handler-notfound', expect: 'ok=false error=Project path not found: probe-no-such-dir-112',
      actual: `ok=${rp3?.ok} error=${String(rp3?.error || '').slice(0, 80)}`,
      pass: rp3?.ok === false && rp3?.error === 'Project path not found: probe-no-such-dir-112',
      detail: 'exists-check before action switch; no build spawned',
    });

    // P4: deploy dispatch, HANDLER switch default — pre-created EMPTY dir via
    // the REAL resolver (same function + workspaceId the handler uses), then
    // assert the unknown action rejects AND the dir is still empty.
    let p4setup = '';
    try {
      const resolved = resolveToolPath('probe-app-112', { workspaceId: 'probe-ws-112' });
      const inside = sbxRoot ? path.resolve(resolved).toLowerCase().startsWith(path.resolve(sbxRoot).toLowerCase()) : false;
      fs.mkdirSync(resolved, { recursive: true });
      p4setup = `resolved=${resolved} inside_sbx=${inside} pre_exists_after_mkdir=${fs.existsSync(resolved)}`;
      const rp4: any = await executeTool('deploy_project', { action: 'probe-no-such-action-112', projectPath: 'probe-app-112' }, attr);
      const entries = fs.readdirSync(resolved);
      const pass = rp4?.ok === false
        && rp4?.error === 'Unknown action: probe-no-such-action-112'
        && entries.length === 0
        && inside === true;
      results.push({
        case: 'P4-deploy-handler-unknown-action', expect: 'ok=false error=Unknown action: ... + dir_empty + inside_sbx',
        actual: `ok=${rp4?.ok} error=${String(rp4?.error || '').slice(0, 70)} entries=${entries.length} inside_sbx=${inside}`,
        pass, detail: p4setup,
      });
    } catch (e: any) {
      results.push({
        case: 'P4-deploy-handler-unknown-action', expect: 'ok=false error=Unknown action: ... + dir_empty + inside_sbx',
        actual: `setup_threw=${String(e?.message || e).slice(0, 120)}`, pass: false, detail: p4setup,
      });
    }

    // K1: docker dispatch, HANDLER layer — unknown action, pre-spawn.
    const rk1: any = await executeTool('docker_manager', { action: 'probe-no-such-action-112' }, attr);
    results.push({
      case: 'K1-docker-handler', expect: 'ok=false error=Unknown action',
      actual: `ok=${rk1?.ok} error=${rk1?.error}`,
      pass: rk1?.ok === false && rk1?.error === 'Unknown action',
      detail: 'switch default returns before executionEngine.run; no subprocess',
    });

    // I1: image dispatch, HANDLER layer — no session system, pre-read.
    const ri1: any = await executeTool('image_studio', {}, attr);
    results.push({
      case: 'I1-image-handler', expect: 'ok=false error_contains_no system with tables',
      actual: `ok=${ri1?.ok} error=${String(ri1?.error || '').slice(0, 80)}`,
      pass: ri1?.ok === false && String(ri1?.error || '').includes('no system with tables'),
      detail: 'empty joeProjects/default session; before readTables/picturesFor',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-112-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-112-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
