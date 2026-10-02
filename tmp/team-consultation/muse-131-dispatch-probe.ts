/**
 * MUSE wiring audit 131 — REGISTRY RECONCILIATION + alias/redirection
 * mechanics (Level 2/3 + targeted Level 4). Closes the 130 open item
 * (160 static vs 163 registered) with a COMPLETE envelope:
 *
 * Static audit (read-only source, BEFORE the run):
 * - Class-style declarations (LINE-ANCHORED `^\s*name\s*=\s*'X'`, the 130
 *   method fix): exactly 160 unique across definitions/*.ts — the anchored
 *   pattern automatically excludes the 3 junk strings (my-project, project,
 *   photography-studio.png are inline/template usages, never declarations).
 *   Zero double-quoted class-style or object-style declarations exist.
 * - Of the 160: 159 registered + grep_search deliberately UNregistered
 *   (registry.ts:329-331: ToolService redirects it; a lock test protects
 *   against shadowing).
 * - Object-style `name: 'X'` true tools: 8 = 4 REGISTERED (architect_plan
 *   via bare ArchitectTool registry.ts:271; recall_memory + memorize_codebase
 *   via ...MemoryTools registry.ts:262; todo_write via revived array
 *   registry.ts:224) + 4 ORPHANS imported-but-never-registered
 *   (BulkFileGeneratorTool, CodebaseNavigatorTool, ImageGenerationTool,
 *   VisualQATool — registry.ts:14-18 import, zero uses in the body;
 *   full 160-identifier multiline-aware unused-import census pins exactly
 *   these four).
 * - DEFINED true tools = 168 (160 class-style incl. grep_search + 8
 *   object-style). REGISTERED = 163 (159 class + 4 object).
 *   IMPLEMENTED_NOT_REGISTERED = 5 (grep_search by-design + 4 true orphans).
 * - Duplicate registration is STRUCTURALLY impossible: registry.ts:406
 *   throws on a repeated name at startup (static pin, no live case).
 * - Revived = 71 (70 safeNew + TodoWriteTool), all instantiated, zero
 *   'Skipping revived' warnings in the import log (run-0 receipt).
 * - TOOL_ALIASES (ToolService.ts:212-249): 28 entries (run-1 correction:
 *   hand-counted 26 in error; live Object.keys = 28). Applies ONLY when
 *   tDef is still missing (line 691-692) AND the target is registered
 *   (line 693). Hand-redirects (lines ~405-660) run FIRST, so several
 *   table entries are shadowed: grep_search/grep/search_code/find_in_files
 *   (same target search_text — benign), file_write/create_file (same
 *   target — benign), list_files/list_directory (same target
 *   inspect_directory — benign), run_command (DIVERGENT: table says
 *   terminal_manager, hand-redirect line 429 says shell_execute — the
 *   table entry is dead AND disagrees; OBS-131-1 candidate).
 * - Risk classifier (ToolService.ts:198) references codebase_navigator
 *   (an UNREGISTERED orphan) in its 'low' carve-out — layer skew info
 *   pin (harmless: the name can never arrive with a tDef; documented).
 * - npm_install/install_package/npm_build/npm_run/npm_start/npm_test all
 *   alias to npm_manager with an EXECUTING command (install/run) — live
 *   execution would run npm (network + writes). DELIBERATELY UNEXECUTED;
 *   NM0 pins only the direct npm_manager {} missing_command guard
 *   (SystemTools.ts:1212, pre-exec refusal, read-only).
 * - NpmManagerTool permissions are ['execute','write','internet'] (properly
 *   declared — not in the defaulted class).
 * - SearchTextTool (UtilityTools.ts:139-211): query/pattern requiredAny
 *   (loud refusal without), path via LOCAL single-root resolver in
 *   try/catch (ok:false, not envelope), glob default **\/* with binary/
 *   media ignores. GS slice seeds the threaded root (WR0-129 reuse).
 *
 * Every case stays on a SAFE surface: registry reads, unknown_tool misses
 * (zero handler code runs), alias->read-only-search executions in the
 * threaded sbx root, one pre-exec guard refusal (NM0), re-pins. NO network,
 * NO model, NO browser, NO npm execution, NO spend. recall_memory/
 * memorize_codebase/architect_plan/todo_write are pinned at REGISTRY level
 * only (present + executable function) — handlers NEVER invoked (memory/
 * planner-adjacent + NVIDIA-ACTIVE memory lane; no overlap).
 *
 * Same isolated tsx method as 110-130: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, CWD = the sandbox dir itself (Set-Location INSIDE the
 * shell), all imports absolute, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-131 (fresh; reg-enum run-0
 * receipts preserved in-tree). NO DATA_DIR is set: the knowledge.ts
 * import-time mkdir lands in <sbx>/data (contained; Z0 asserts the shape,
 * 127/128/129/130 continuity). NO AUTO_APPROVE_* set at any point. No
 * source edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-131
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-131-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool, TOOL_ALIASES } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'unset',
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    DATA_DIR: process.env.DATA_DIR,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;
  process.env.npm_config_update_notifier = 'false';

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const dataDir = String(process.env.DATA_DIR || '');
  const attr = { workspaceId: 'probe-ws-131', userId: 'probe-user-131' } as any;

  await executionFirewall.runInContext('muse-131-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    const p0e = !process.env.OPENAI_API_KEY;
    const p0f = !dataDir || dataDir === sbxRoot || dataDir.startsWith(sbxRoot + path.sep);
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove+no_openai_key+data_dir_unset_or_in_sbx',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d} noOpenAI=${p0e} dataOk=${p0f}`,
      pass: p0a && p0b && p0c && !!p0d && p0e && p0f, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regNames: string[] = (tools as any[]).map((t: any) => String(t?.name || ''));
    const regCount = regNames.length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'registry count re-observed (Muse lineage)',
    });

    const sorted = [...regNames].sort();
    const setHash = createHash('sha256').update(sorted.join(',')).digest('hex').toUpperCase().slice(0, 16);
    const obj4 = ['architect_plan', 'recall_memory', 'memorize_codebase', 'todo_write'];
    const anchors = ['echo', 'search_text', 'npm_manager', 'shell_execute'];
    const objHit = obj4.filter((n) => regNames.includes(n));
    const anchHit = anchors.filter((n) => regNames.includes(n));
    results.push({
      case: 'RG0-registered-set', expect: '163 + object-4 + 4 anchors present, hash recorded',
      actual: `n=${regCount} obj4=${objHit.length}/4 anchors=${anchHit.length}/4 hash=${setHash}`,
      pass: regCount === 163 && objHit.length === 4 && anchHit.length === 4,
      detail: `SET pin: exact-set hash ${setHash} recorded for future batteries; object-style quartet present`,
    });

    for (const n of obj4) {
      const t: any = (tools as any[]).find((x: any) => String(x?.name) === n);
      const isFn = t && typeof t.execute === 'function';
      results.push({
        case: `RG1-object-${n}`, expect: 'registered + typeof execute === function (registry level only, handler NEVER invoked)',
        actual: `present=${!!t} executeFn=${isFn}`,
        pass: !!t && isFn === true,
        detail: n === 'architect_plan' ? 'bare ArchitectTool (registry.ts:271)' : n === 'todo_write' ? 'revived array (registry.ts:224)' : '...MemoryTools spread (registry.ts:262)',
      });
    }

    const noExec = (tools as any[]).filter((t: any) => typeof t?.execute !== 'function').map((t: any) => String(t?.name || '?'));
    results.push({
      case: 'RG2-all-executable', expect: 'every registered tool exposes a function execute (zero without)',
      actual: `withoutExecute=${noExec.length} [${noExec.slice(0, 5).join(',') || 'none'}]`,
      pass: noExec.length === 0,
      detail: 'REGISTERED_WITHOUT_IMPLEMENTATION=0 live pin (Muse lineage)',
    });

    const orphans = ['bulk_file_generator', 'codebase_navigator', 'generate_image', 'visual_qa'];
    for (const n of orphans) {
      const r: any = await executeTool(n, {}, attr);
      const err = String(r?.error || '');
      const logs = JSON.stringify(r?.logs || []);
      results.push({
        case: `OR-orphan-${n}`, expect: `ok=false error startsWith 'unknown_tool: "${n}"' + suggestions named`,
        actual: `ok=${r?.ok} error=${err.slice(0, 110)}`,
        pass: r?.ok === false && err.startsWith(`unknown_tool: "${n}"`) && err.includes('did you mean'),
        detail: `ORPHAN pin: imported (registry.ts:14-18) but never registered; zero handler code runs; logs=${logs.slice(0, 120)}`,
      });
    }

    // ---- grep/alias slice (threaded-root seeds, WR0-129 reuse) ----
    const wsDir = path.join(sbxRoot, 'projects', 'probe-ws-131');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, 'marker131.txt'), 'alpha\nmarker131-uniq-beta\ngamma\n', 'utf-8');

    const gs0: any = await executeTool('grep_search', { query: 'marker131-uniq-beta' }, attr);
    const gs0o: any = gs0?.output || {};
    results.push({
      case: 'GS0-grep-hand-positive', expect: 'ok=true total>=1, match file marker131.txt (hand-redirect one-hop to search_text)',
      actual: `ok=${gs0?.ok} total=${gs0o.total} files=${JSON.stringify((gs0o.matches || []).map((m: any) => m.file)).slice(0, 80)}`,
      pass: gs0?.ok === true && Number(gs0o.total) >= 1 && JSON.stringify(gs0o.matches || []).includes('marker131.txt'),
      detail: 'HAND-PATH pin: unregistered grep_search reaches the real file reader via ToolService.ts:526 (not the old filename glob)',
    });

    const gs1: any = await executeTool('ripgrep', { query: 'marker131-uniq-beta' }, attr);
    const gs1o: any = gs1?.output || {};
    const gs1logs = JSON.stringify(gs1?.logs || []);
    results.push({
      case: 'GS1-ripgrep-table-positive', expect: 'ok=true total>=1 + logs contain tool-alias line (TABLE path, no hand-redirect)',
      actual: `ok=${gs1?.ok} total=${gs1o.total} aliasLog=${gs1logs.includes('tool alias:')} `,
      pass: gs1?.ok === true && Number(gs1o.total) >= 1 && gs1logs.includes('tool alias:'),
      detail: 'TABLE-PATH pin: ripgrep has no hand-redirect, so TOOL_ALIASES (line 692) fires and logs itself',
    });

    const gs2: any = await executeTool('grep_search', {}, attr);
    results.push({
      case: 'GS2-grep-missing-query', expect: "ok=false 'search_text needs a query' (alias preserves arg validation)",
      actual: `ok=${gs2?.ok} error=${String(gs2?.error || 'none').slice(0, 60)}`,
      pass: gs2?.ok === false && String(gs2?.error || '').includes('needs a query'),
      detail: 'ARG-PRESERVATION pin: hand-redirect does not bypass handler validation',
    });

    const gs3: any = await executeTool('search_text', { query: 'marker131-uniq-beta' }, attr);
    const gs3o: any = gs3?.output || {};
    results.push({
      case: 'GS3-direct-equivalence', expect: 'direct search_text total equals aliased total (same reader)',
      actual: `direct=${gs3o.total} aliased=${gs0o.total}`,
      pass: gs3?.ok === true && Number(gs3o.total) === Number(gs0o.total) && Number(gs3o.total) >= 1,
      detail: 'ALIAS-EQUIVALENCE pin: hand + table + direct all reach the identical reader',
    });

    const aliasKeys = Object.keys(TOOL_ALIASES || {});
    const badTargets = aliasKeys.filter((k) => !regNames.includes(String((TOOL_ALIASES as any)[k])));
    results.push({
      case: 'AL0-alias-targets-registered', expect: '28 table entries, every target registered',
      actual: `entries=${aliasKeys.length} unregisteredTargets=${badTargets.length} [${badTargets.join(',') || 'none'}]`,
      pass: aliasKeys.length === 28 && badTargets.length === 0,
      detail: 'TABLE-SOUNDNESS pin: no alias points at a missing tool (line 693 guard never needs to fire)',
    });

    const liveKeys = aliasKeys.filter((k) => regNames.includes(k));
    results.push({
      case: 'AL1-alias-keys-unregistered', expect: 'zero table keys registered (a registered key would deaden its entry)',
      actual: `registeredKeys=${liveKeys.length} [${liveKeys.join(',') || 'none'}]`,
      pass: liveKeys.length === 0,
      detail: 'TABLE-LIVENESS pin: every key is genuinely unregistered, so the table CAN fire when reached',
    });

    const h4: any = await executeTool('run_command', { action: 'list' }, attr);
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required'",
      actual: `ok=${h4?.ok} error=${String(h4?.error || 'none').slice(0, 40)}`,
      pass: h4?.ok === false && String(h4?.error || '') === 'approval_required',
      detail: 'T5-117 winner reproduced (117/121/123/126/127/128/129/130 continuity); nothing executed',
    });

    const h4logs = JSON.stringify(h4?.logs || []);
    const tableSays = String((TOOL_ALIASES as any)['run_command'] || '');
    results.push({
      case: 'H4b-run-command-shadow', expect: "no 'tool alias:' in logs + table says terminal_manager (hand-redirect wins, table diverges)",
      actual: `aliasLog=${h4logs.includes('tool alias:')} tableTarget=${tableSays}`,
      pass: h4logs.includes('tool alias:') === false && tableSays === 'terminal_manager',
      detail: 'DIVERGENT-SHADOW pin (OBS-131-1): hand line 429 (shell_execute) fires first; table entry dead AND disagrees',
    });

    const nm0: any = await executeTool('npm_manager', {}, attr);
    results.push({
      case: 'NM0-npm-missing-command', expect: "ok=false error='missing_command' (pre-exec refusal, nothing runs)",
      actual: `ok=${nm0?.ok} error=${String(nm0?.error || 'none').slice(0, 40)}`,
      pass: nm0?.ok === false && String(nm0?.error || '') === 'missing_command',
      detail: 'GUARD pin: npm alias family (install/run/build/test/dev) documented static-only — live execution would run npm',
    });

    const ut0: any = await executeTool('definitely_not_a_tool_131', {}, attr);
    results.push({
      case: 'UT0-unknown-shape', expect: 'ok=false error exactly unknown_tool with no suggestions (zero shared segments)',
      actual: `ok=${ut0?.ok} error=${String(ut0?.error || 'none').slice(0, 90)}`,
      pass: ut0?.ok === false && String(ut0?.error || '') === 'unknown_tool: "definitely_not_a_tool_131"',
      detail: 'UNKNOWN pin: exact no-suggestion shape; contrasts the orphan suggestion shapes',
    });

    const d1: any = await executeTool('echo', { text: 'probe131-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe131-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    // Z0: containment — sbx shape, contained import-graph side effect,
    // live stores byte-identical to pre-run (hashes passed via env).
    const sha256 = (p: string): string => { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase(); } catch { return 'UNREADABLE'; } };
    const zSbxUsers = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'users.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zSbxMemDir = (() => { try { return fs.statSync(path.join(sbxRoot, 'data', 'memory')).isDirectory(); } catch { return false; } })();
    const zJoeData = String(process.env.JOE_DATA_DIR || '');
    const zJoeInSbx = !!zJoeData && (zJoeData === sbxRoot || zJoeData.startsWith(sbxRoot + path.sep));
    const zLiveKb = 'D:/Joe/muse-worktree/api/data/knowledge.json';
    const zLiveKbHash = sha256(zLiveKb);
    const zWsKb = 'D:/Joe/muse-worktree/data/knowledge.json';
    const zWsKbHash = sha256(zWsKb);
    const zMarkers = ['m131', 'fx131', 'probe131'];
    const zMarkerHit = (() => {
      try {
        const a = fs.readFileSync(zLiveKb, 'utf-8'); const b = fs.readFileSync(zWsKb, 'utf-8');
        const m = fs.readFileSync('D:/Joe/muse-worktree/api/data/memory/index.json', 'utf-8');
        return zMarkers.some((mk) => a.includes(mk) || b.includes(mk) || m.includes(mk));
      } catch { return true; }
    })();
    const zLiveMem = 'D:/Joe/muse-worktree/api/data/memory/index.json';
    const zLiveMemSha = sha256(zLiveMem);
    const zPreLive = String(process.env.LIVE_KB_PRE || '');
    const zPreWs = String(process.env.WSROOT_KB_PRE || '');
    const zPreMem = String(process.env.LIVEMEM_PRE || '');
    results.push({
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 131 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127/128/129/130 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-131-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-131-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
