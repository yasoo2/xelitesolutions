/**
 * MUSE wiring audit 115 — dispatch-reachability battery: json_query contract,
 * grep_search alias chain, monitoring read-vs-mutation + cross-workspace
 * isolation (Level 3).
 *
 * Follow-up to 114 (next step named json_query pure-function positive;
 * monitoring read-vs-mutation split per CODEX-TO-MUSE-MONITORING-CONTRACT;
 * grep_search alias chain). For each target this probe executes the REAL
 * executeTool dispatch path (alias layer -> registry -> firewall -> approval
 * gate -> handler). Every expectation below was derived from source BEFORE
 * the run:
 *
 *   J1 json_query {json:{a:{b:42}}, path:'a.b'}
 *      -> ok=true, output.value=42
 *      (HANDLER positive, ContentTools.ts:132-152 pure function; no FS, no
 *      network. permissions=[] -> no firewall attribution requirement;
 *      risk default medium (no special case) -> default allowance.)
 *   J2 json_query {path:'a.b'} (no json)
 *      -> ok=false, error='json required'
 *      (HANDLER presence guard, ContentTools.ts:135 — completes the per-file
 *      validation map: http_fetch/html_extract/json_query guard, rss_fetch
 *      does not (R1-114). No dispatch-level schema enforcement involved.)
 *   G1 grep_search {query:'probe-115-marker', path:'probe-grep-115'}
 *      with probe-grep-115/seed.txt pre-created via the REAL resolveToolPath
 *      -> ok=true, total>=1, match text contains the marker, dispatch logs
 *      contain 'orig=grep_search'
 *      (ALIAS+HANDLER: hardcoded redirect ToolService.ts:526 resolves
 *      grep_search->search_text BEFORE the start line (:623) and before risk
 *      classification (:778, computed on 'search_text' -> default medium ->
 *      allowed). search_text permissions=['read'] -> attr workspaceId+userId
 *      satisfy the firewall. Real file read inside containment.)
 *   G2 grep_search {} (no query)
 *      -> ok=false, error='search_text needs a query ...'
 *      (HANDLER validation reached THROUGH the alias: requiredAny is not
 *      enforced at dispatch — fourth pin of the OBS-111-2 class.)
 *   M0 monitoring {action:'get_metrics'} under ws-A
 *      -> ok=true, baseline totalRequests recorded (expect 0, fresh process)
 *   M1 monitoring {action:'track', event:'request'} under ws-A
 *      -> ok=true, output.tracked=true
 *      (HANDLER mutation through the default medium allowance: monitoring has
 *      no risk special case (:142-203) and permissions=[]/sideEffects=[]
 *      (MonitoringTool.ts:45-46), so NO approval and NO workspace/user
 *      requirement — identical friction to the read action.)
 *   M2 monitoring {action:'get_metrics'} under ws-A
 *      -> totalRequests = M0baseline+1 (mutation effect proven live)
 *   M3 monitoring {action:'get_metrics'} under ws-B (different workspaceId)
 *      -> totalRequests EQUALS M2 (process-global static metrics,
 *      MonitoringTool.ts:51-62 — cross-workspace visibility, the isolation
 *      half of CODEX-TO-MUSE-MONITORING-CONTRACT)
 *   M4 monitoring {action:'reset'} then {action:'get_metrics'} under ws-A
 *      -> reset ok=true; totalRequests=0 (destructive action flows through
 *      the same zero-friction medium path; hermetic process, in-memory
 *      only — no external effect)
 *
 * Safety: same isolated tsx method as 110/111/112/113/114 — canonical test
 * env (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
 * attribution, NO sessionId, zero network, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-115.
 * NO AUTO_APPROVE_* set at any point. No source is modified.
 *
 * Run from api/ with plain DOS CWD (never the workdir parameter: tsx.cmd is
 * a cmd.exe shim and rejects \\?\ paths):
 *   cd D:\Joe\muse-worktree\api
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   .\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-115-dispatch-probe.ts
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

  const attr = { workspaceId: 'probe-ws-115', userId: 'probe-user-115' } as any;
  const attrB = { workspaceId: 'probe-ws-115-b', userId: 'probe-user-115' } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-115-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const p0d = !!sbxRoot && String(process.env.EXTERNAL_PROJECTS_DIR || '').startsWith(path.resolve(sbxRoot).slice(0, 20));
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'}`,
      pass: p0a && p0b && !!sbxRoot, detail: `ambient=${JSON.stringify(ambient)} contained_hint=${p0d}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107/108/109/110/111/112/113/114',
    });

    // D1: echo positive control (106-P3 / 110-D1 / 111-D1 / 112-D1 / 113-D1 / 114-D1).
    const r1: any = await executeTool('echo', { text: 'probe-115' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-115',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-115')}`,
      pass: r1?.ok === true && out1.includes('probe-115'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // J1: json_query HANDLER positive — pure function.
    const rj1: any = await executeTool('json_query', { json: { a: { b: 42 } }, path: 'a.b' }, attr);
    results.push({
      case: 'J1-json-positive', expect: 'ok=true value=42',
      actual: `ok=${rj1?.ok} value=${JSON.stringify((rj1?.output as any)?.value)} error=${rj1?.error ?? 'none'}`,
      pass: rj1?.ok === true && (rj1?.output as any)?.value === 42,
      detail: 'ContentTools.ts:132-152; pure function, no FS/network',
    });

    // J2: json_query HANDLER presence guard.
    const rj2: any = await executeTool('json_query', { path: 'a.b' }, attr);
    results.push({
      case: 'J2-json-missing-guard', expect: "ok=false error='json required'",
      actual: `ok=${rj2?.ok} error=${String(rj2?.error || '').slice(0, 80)}`,
      pass: rj2?.ok === false && String(rj2?.error || '') === 'json required',
      detail: 'ContentTools.ts:135; per-file validation map: 3 of 4 guard (rss outlier)',
    });

    // G1: grep_search ALIAS -> search_text HANDLER positive on seeded file.
    let g1setup = '';
    try {
      const resolved = resolveToolPath('probe-grep-115', { workspaceId: 'probe-ws-115' });
      const inside = path.resolve(resolved).startsWith(path.resolve(sbxRoot));
      fs.mkdirSync(resolved, { recursive: true });
      const marker = 'probe-115-marker-7f3a';
      fs.writeFileSync(path.join(resolved, 'seed.txt'), `hello\n${marker} line two\nbye\n`, 'utf-8');
      g1setup = `resolved=${resolved} inside_sbx=${inside}`;
      const rg1: any = await executeTool('grep_search', { query: marker, path: 'probe-grep-115' }, attr);
      const total = Number((rg1?.output as any)?.total ?? -1);
      const matches = JSON.stringify((rg1?.output as any)?.matches ?? []);
      const logs = Array.isArray((rg1 as any)?.logs) ? (rg1 as any).logs.join(' ') : String((rg1 as any)?.logs ?? '');
      const aliasHop = logs.includes('orig=grep_search');
      results.push({
        case: 'G1-grep-alias-positive', expect: 'ok=true total>=1 match_has_marker logs_have_orig=grep_search',
        actual: `ok=${rg1?.ok} total=${total} match_has_marker=${matches.includes(marker)} logs_have_orig=${aliasHop} inside_sbx=${inside} error=${rg1?.error ?? 'none'}`,
        pass: rg1?.ok === true && total >= 1 && matches.includes(marker) && aliasHop && inside,
        detail: g1setup,
      });
    } catch (e: any) {
      results.push({
        case: 'G1-grep-alias-positive', expect: 'ok=true total>=1 match_has_marker logs_have_orig=grep_search',
        actual: `setup_threw=${String(e?.message || e).slice(0, 120)}`, pass: false, detail: g1setup,
      });
    }

    // G2: grep_search with NO query — alias resolves, handler validates.
    const rg2: any = await executeTool('grep_search', {}, attr);
    results.push({
      case: 'G2-grep-empty-query', expect: 'ok=false error=search_text needs a query...',
      actual: `ok=${rg2?.ok} error=${String(rg2?.error || '').slice(0, 90)}`,
      pass: rg2?.ok === false && String(rg2?.error || '').startsWith('search_text needs a query'),
      detail: 'requiredAny not enforced at dispatch (4th pin of OBS-111-2 class)',
    });

    // M0: monitoring read baseline under ws-A.
    const rm0: any = await executeTool('monitoring', { action: 'get_metrics' }, attr);
    const m0total = Number((rm0?.output as any)?.metrics?.totalRequests ?? -999);
    results.push({
      case: 'M0-metrics-baseline', expect: 'ok=true baseline_totalRequests=0',
      actual: `ok=${rm0?.ok} baseline=${m0total} error=${rm0?.error ?? 'none'}`,
      pass: rm0?.ok === true && m0total === 0,
      detail: 'fresh hermetic process; baseline for M1/M2 delta',
    });

    // M1: monitoring MUTATION through default medium allowance.
    const rm1: any = await executeTool('monitoring', { action: 'track', event: 'request' }, attr);
    results.push({
      case: 'M1-track-mutation', expect: 'ok=true tracked=true (no approval, no workspace gate)',
      actual: `ok=${rm1?.ok} tracked=${(rm1?.output as any)?.tracked} error=${rm1?.error ?? 'none'}`,
      pass: rm1?.ok === true && (rm1?.output as any)?.tracked === true,
      detail: 'no risk special case + permissions=[] -> zero-friction mutation path',
    });

    // M2: mutation effect visible under ws-A.
    const rm2: any = await executeTool('monitoring', { action: 'get_metrics' }, attr);
    const m2total = Number((rm2?.output as any)?.metrics?.totalRequests ?? -999);
    results.push({
      case: 'M2-mutation-effect', expect: `ok=true totalRequests=${m0total + 1}`,
      actual: `ok=${rm2?.ok} total=${m2total} error=${rm2?.error ?? 'none'}`,
      pass: rm2?.ok === true && m2total === m0total + 1,
      detail: 'live dispatch-level mutation effect (complements Codex class-level 0->1)',
    });

    // M3: SAME counter visible under ws-B — process-global isolation pin.
    const rm3: any = await executeTool('monitoring', { action: 'get_metrics' }, attrB);
    const m3total = Number((rm3?.output as any)?.metrics?.totalRequests ?? -999);
    results.push({
      case: 'M3-cross-workspace', expect: `ok=true totalRequests=${m2total} (same as ws-A)`,
      actual: `ok=${rm3?.ok} total=${m3total} error=${rm3?.error ?? 'none'}`,
      pass: rm3?.ok === true && m3total === m2total,
      detail: 'static metrics shared across workspaceIds; isolation half of monitoring contract',
    });

    // M4: reset (destructive) through the same path, then verify zero.
    const rm4a: any = await executeTool('monitoring', { action: 'reset' }, attr);
    const rm4b: any = await executeTool('monitoring', { action: 'get_metrics' }, attr);
    const m4total = Number((rm4b?.output as any)?.metrics?.totalRequests ?? -999);
    results.push({
      case: 'M4-reset-reachable', expect: 'ok=true reset=true then totalRequests=0',
      actual: `reset_ok=${rm4a?.ok} reset=${(rm4a?.output as any)?.reset} total_after=${m4total} error=${rm4a?.error ?? 'none'}`,
      pass: rm4a?.ok === true && (rm4a?.output as any)?.reset === true && rm4b?.ok === true && m4total === 0,
      detail: 'destructive action, zero-friction medium path; hermetic in-memory only',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-115-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-115-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
