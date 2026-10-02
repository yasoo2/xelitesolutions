/**
 * MUSE wiring audit 116 — dispatch-reachability battery: cache_manager
 * read-vs-mutation + cross-workspace isolation, monitoring unknown-event
 * silent-accept vs unknown-action rejection (Level 3).
 *
 * Follow-up to 115 (next step named monitoring unknown-event silent-accept
 * pin and cache_manager read-vs-mutation split as a second
 * action-blind-medium candidate). For each target this probe executes the
 * REAL executeTool dispatch path (alias layer -> registry -> firewall ->
 * approval gate -> handler). Every expectation below was derived from
 * source BEFORE the run:
 *
 *   C0 cache_manager {action:'stats'} (fresh process)
 *      -> ok=true, stats.sets=0, stats.hits=0, stats.misses=0, cacheSize=0
 *      (BASELINE guard: CacheManagerTool.ts:54-61 statics start zeroed;
 *      proves setup/registry import does not pre-populate cache.)
 *   C1 cache_manager {action:'set', key:'k116', value:'v116'}
 *      -> ok=true, output.success=true
 *      (HANDLER mutation, CacheManagerTool.ts:132-143; permissions=[]/
 *      sideEffects=[] (:47-48), NO dispatch-layer special case (zero
 *      'cache_manager' matches in ToolService.ts) -> default medium
 *      allowance, identical friction to the read actions.)
 *   C2 cache_manager {action:'get', key:'k116'}
 *      -> ok=true, hit=true, value='v116'
 *      (HANDLER read effect, :98-130; also increments process-global
 *      stats.hits — the read path mutates global stats.)
 *   C3 cache_manager {action:'get', key:'k116'} under ws-B
 *      -> ok=true, hit=true, value='v116'; plus {action:'stats'} under
 *      ws-B -> stats.sets>=1
 *      (process-global static Map/stats, :54-61 — ws-A's entry AND
 *      counters visible under a different workspaceId: second
 *      cross-workspace pin after monitoring M3-115.)
 *   C4 cache_manager {action:'frobnicate-116'}
 *      -> ok=false, error='Unknown action: frobnicate-116'
 *      (HANDLER default branch :84-85 throws -> caught :88-95. Actions
 *      ARE validated; contrast with N1 event silent-accept.)
 *   C5 cache_manager {action:'clear'}
 *      -> ok=true, cleared>=1; then {action:'get', key:'k116'}
 *      -> ok=true, success=false, hit=false
 *      (destructive action through the same zero-friction medium path;
 *      :159-170. Hermetic in-memory only, no external effect.)
 *   N0 monitoring {action:'get_metrics'} (fresh process)
 *      -> ok=true, totalRequests=0 + full zero snapshot
 *      (BASELINE guard for the N1/N2 silent-accept proof.)
 *   N1 monitoring {action:'track', event:'frobnicate-116'}
 *      -> ok=true, tracked=true
 *      (trackEvent switch :94-144 has NO default case: unknown events
 *      fall through silently yet return tracked=true — SILENT ACCEPT.)
 *   N2 monitoring {action:'get_metrics'}
 *      -> every counter EQUALS the N0 snapshot (totalRequests still 0)
 *      (proves the N1 accept had ZERO effect: accepted-but-dropped.)
 *   N3 monitoring {action:'frobnicate-116'}
 *      -> ok=false, error='Unknown action: frobnicate-116'
 *      (execute switch default :79-80 throws. Actions validated,
 *      events not — the asymmetry pin.)
 *
 * Safety: same isolated tsx method as 110/111/112/113/114/115 — canonical
 * test env (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic),
 * full attribution, NO sessionId, zero network, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-116.
 * NO AUTO_APPROVE_* set at any point. No source is modified.
 *
 * Run from api/ with plain DOS CWD (never the workdir parameter: tsx.cmd is
 * a cmd.exe shim and rejects \\?\ paths):
 *   cd D:\Joe\muse-worktree\api
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   .\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-116-dispatch-probe.ts
 */
import * as path from 'path';
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

  const attr = { workspaceId: 'probe-ws-116', userId: 'probe-user-116' } as any;
  const attrB = { workspaceId: 'probe-ws-116-b', userId: 'probe-user-116' } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-116-probe', async () => {
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
      pass: regCount === 163, detail: 'Muse-lineage pin from 107/108/109/110/111/112/113/114/115',
    });

    // D1: echo positive control (106-P3 / 110-D1 / 111-D1 / 112-D1 / 113-D1 / 114-D1 / 115-D1).
    const r1: any = await executeTool('echo', { text: 'probe-116' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-116',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-116')}`,
      pass: r1?.ok === true && out1.includes('probe-116'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // C0: cache stats baseline (fresh process).
    const rc0: any = await executeTool('cache_manager', { action: 'stats' }, attr);
    const s0 = (rc0?.output as any)?.stats ?? {};
    results.push({
      case: 'C0-cache-stats-baseline', expect: 'ok=true sets=0 hits=0 misses=0 cacheSize=0',
      actual: `ok=${rc0?.ok} sets=${s0.sets} hits=${s0.hits} misses=${s0.misses} cacheSize=${s0.cacheSize} error=${rc0?.error ?? 'none'}`,
      pass: rc0?.ok === true && s0.sets === 0 && s0.hits === 0 && s0.misses === 0 && s0.cacheSize === 0,
      detail: 'fresh hermetic process; baseline for C1/C2/C5 deltas',
    });

    // C1: cache set MUTATION through default medium allowance.
    const rc1: any = await executeTool('cache_manager', { action: 'set', key: 'k116', value: 'v116' }, attr);
    results.push({
      case: 'C1-cache-set-mutation', expect: 'ok=true success=true (no approval, no workspace gate)',
      actual: `ok=${rc1?.ok} success=${(rc1?.output as any)?.success} error=${rc1?.error ?? 'none'}`,
      pass: rc1?.ok === true && (rc1?.output as any)?.success === true,
      detail: 'no risk special case + permissions=[] -> zero-friction mutation path',
    });

    // C2: read-back effect under ws-A.
    const rc2: any = await executeTool('cache_manager', { action: 'get', key: 'k116' }, attr);
    results.push({
      case: 'C2-cache-get-effect', expect: "ok=true hit=true value='v116'",
      actual: `ok=${rc2?.ok} hit=${(rc2?.output as any)?.hit} value=${JSON.stringify((rc2?.output as any)?.value)} error=${rc2?.error ?? 'none'}`,
      pass: rc2?.ok === true && (rc2?.output as any)?.hit === true && (rc2?.output as any)?.value === 'v116',
      detail: 'CacheManagerTool.ts:98-130; read also bumps global stats.hits',
    });

    // C3: SAME entry + counters visible under ws-B.
    const rc3a: any = await executeTool('cache_manager', { action: 'get', key: 'k116' }, attrB);
    const rc3b: any = await executeTool('cache_manager', { action: 'stats' }, attrB);
    const s3 = (rc3b?.output as any)?.stats ?? {};
    results.push({
      case: 'C3-cache-cross-workspace', expect: "get-under-B hit=true value='v116' + stats-under-B sets>=1",
      actual: `get_ok=${rc3a?.ok} hit=${(rc3a?.output as any)?.hit} value=${JSON.stringify((rc3a?.output as any)?.value)} stats_ok=${rc3b?.ok} sets=${s3.sets} error=${rc3a?.error ?? rc3b?.error ?? 'none'}`,
      pass: rc3a?.ok === true && (rc3a?.output as any)?.hit === true && (rc3a?.output as any)?.value === 'v116' && rc3b?.ok === true && Number(s3.sets) >= 1,
      detail: 'static Map/stats shared across workspaceIds; 2nd cross-workspace pin after M3-115',
    });

    // C4: unknown ACTION rejected by handler.
    const rc4: any = await executeTool('cache_manager', { action: 'frobnicate-116' }, attr);
    results.push({
      case: 'C4-cache-unknown-action', expect: "ok=false error='Unknown action: frobnicate-116'",
      actual: `ok=${rc4?.ok} error=${String(rc4?.error || '').slice(0, 90)}`,
      pass: rc4?.ok === false && String(rc4?.error || '') === 'Unknown action: frobnicate-116',
      detail: 'CacheManagerTool.ts:84-85 default throws; actions validated (contrast N1)',
    });

    // C5: clear (destructive) through the same path, then verify miss.
    const rc5a: any = await executeTool('cache_manager', { action: 'clear' }, attr);
    const rc5b: any = await executeTool('cache_manager', { action: 'get', key: 'k116' }, attr);
    results.push({
      case: 'C5-cache-clear-destructive', expect: 'clear ok=true cleared>=1 then get hit=false',
      actual: `clear_ok=${rc5a?.ok} cleared=${(rc5a?.output as any)?.cleared} get_ok=${rc5b?.ok} hit=${(rc5b?.output as any)?.hit} success=${(rc5b?.output as any)?.success} error=${rc5a?.error ?? 'none'}`,
      pass: rc5a?.ok === true && Number((rc5a?.output as any)?.cleared) >= 1 && rc5b?.ok === true && (rc5b?.output as any)?.hit === false,
      detail: 'destructive action, zero-friction medium path; hermetic in-memory only',
    });

    // N0: monitoring metrics baseline (fresh process).
    const rn0: any = await executeTool('monitoring', { action: 'get_metrics' }, attr);
    const m0 = (rn0?.output as any)?.metrics ?? {};
    const n0snap = {
      totalRequests: Number(m0.totalRequests ?? -999),
      successfulRequests: Number(m0.successfulRequests ?? -999),
      failedRequests: Number(m0.failedRequests ?? -999),
      llmCalls: Number(m0.llmCalls ?? -999),
      cacheHits: Number(m0.cacheHits ?? -999),
      cacheMisses: Number(m0.cacheMisses ?? -999),
    };
    const n0allzero = Object.values(n0snap).every((v) => v === 0);
    results.push({
      case: 'N0-metrics-baseline', expect: 'ok=true all_6_counters=0',
      actual: `ok=${rn0?.ok} snap=${JSON.stringify(n0snap)} error=${rn0?.error ?? 'none'}`,
      pass: rn0?.ok === true && n0allzero,
      detail: 'fresh hermetic process; baseline for N1/N2 silent-accept proof',
    });

    // N1: track UNKNOWN event — silent accept expected.
    const rn1: any = await executeTool('monitoring', { action: 'track', event: 'frobnicate-116' }, attr);
    results.push({
      case: 'N1-track-unknown-event', expect: 'ok=true tracked=true (silent accept, no default case)',
      actual: `ok=${rn1?.ok} tracked=${(rn1?.output as any)?.tracked} event=${(rn1?.output as any)?.event} error=${rn1?.error ?? 'none'}`,
      pass: rn1?.ok === true && (rn1?.output as any)?.tracked === true,
      detail: 'MonitoringTool.ts:94-144 switch has no default: falls through, still tracked=true',
    });

    // N2: the N1 accept changed NOTHING.
    const rn2: any = await executeTool('monitoring', { action: 'get_metrics' }, attr);
    const m2 = (rn2?.output as any)?.metrics ?? {};
    const n2snap = {
      totalRequests: Number(m2.totalRequests ?? -999),
      successfulRequests: Number(m2.successfulRequests ?? -999),
      failedRequests: Number(m2.failedRequests ?? -999),
      llmCalls: Number(m2.llmCalls ?? -999),
      cacheHits: Number(m2.cacheHits ?? -999),
      cacheMisses: Number(m2.cacheMisses ?? -999),
    };
    const n2same = JSON.stringify(n2snap) === JSON.stringify(n0snap);
    results.push({
      case: 'N2-unknown-event-no-effect', expect: `ok=true counters_unchanged_vs_N0 ${JSON.stringify(n0snap)}`,
      actual: `ok=${rn2?.ok} snap=${JSON.stringify(n2snap)} same_as_N0=${n2same} error=${rn2?.error ?? 'none'}`,
      pass: rn2?.ok === true && n2same,
      detail: 'accepted-but-dropped: tracked=true with zero counter movement',
    });

    // N3: unknown ACTION rejected (contrast with N1 event silent-accept).
    const rn3: any = await executeTool('monitoring', { action: 'frobnicate-116' }, attr);
    results.push({
      case: 'N3-monitoring-unknown-action', expect: "ok=false error='Unknown action: frobnicate-116'",
      actual: `ok=${rn3?.ok} error=${String(rn3?.error || '').slice(0, 90)}`,
      pass: rn3?.ok === false && String(rn3?.error || '') === 'Unknown action: frobnicate-116',
      detail: 'MonitoringTool.ts:79-80 default throws; actions validated, events not',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-116-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-116-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
