/**
 * MUSE wiring audit 130 — dispatch-reachability battery: resilience + review +
 * local-feedback FIRST live proofs (Level 4) over SEVEN unprobed registered
 * families: llm_cache + error_recovery (analysis only) + code_reviewer
 * (quick + guards) + performance_analyzer + file_edit_advanced +
 * repo_run_command + shell_check_status (refusal only).
 *
 * Static audit (read-only source, BEFORE the run):
 * - ToolService.ts:142-202 classifyToolRisk: file_edit_advanced matches the
 *   medium carve-out ('file_edit'); the other six match NO carve-out ->
 *   default 'medium', allowed under default autoSafe with zero approval
 *   (pinned live: every family reaches its handler).
 * - Declared-name scan this cycle: 163 unique `name = 'X'` strings across
 *   definitions/*.ts MINUS 91 executeTool names pinned by batteries 110-129
 *   = 72 unprobed strings, of which THREE are template/seed false positives,
 *   not tools: 'my-project' (GitHubActionsTool.ts:50, TemplateManagerTool
 *   .ts:47), 'project' (ProjectPipelineTool.ts:669), 'photography-studio.png'
 *   (ReactProjectTool.ts:1384). D0b pins live that none of the three is
 *   registered, and that all seven slice names ARE registered.
 * - EliteTools.ts (8 unprobed names: dependency_graph, business_logic_parser,
 *   chaos_test_plan, compliance_validator, cloud_cost_estimator,
 *   ambiguity_resolver, multi_agent_debate, self_confidence_evaluator) are
 *   ALL getLLM-backed -> DELIBERATELY UNPROVEN (no provider; ai_write/
 *   analyze_codebase-summary/request_analyzer-valid precedent). Static note:
 *   7 of the 8 declare permissions=[] while calling a spend-bearing LLM
 *   (OBS-128-1 permission-underdeclaration class).
 * - llm_cache (LLMCacheTool.ts): pure in-process Map cache, zero network.
 *   set/get/stats/clear + unknown-action throw + oversize honest-skip
 *   (response_too_large, default 32k chars). Static note: the cache + stats
 *   are process-global statics with NO workspace/user scoping (127
 *   unscoped-global-store class); cross-workspace prompt/response bleed is a
 *   live-provable follow-up, not asserted without a two-actor probe.
 * - error_recovery (ErrorRecoveryTool.ts): attemptFix=false path is pure
 *   local (KnowledgeService.search wrapped in try/catch + regex analysis).
 *   attemptFix=true DELIBERATELY UNPROVEN: missing_dependency shells
 *   `npm install <module>` (network + writes, dependency_audit precedent)
 *   and file_not_found WRITES into getWorkspaceRoot() — which calls
 *   workspaceService.getActiveRoot() with NO workspaceId, the exact fallback
 *   AGENTS.md forbids (ToolService path-resolution rule). Static finding;
 *   no OBS filed blind, needs owned gateway review.
 * - code_reviewer (CodeReviewerTool.ts): reviewType 'quick' is fully
 *   deterministic/offline (basicReview + annotateFinding); deeper types call
 *   callLLM with a deterministic fallback on throw. PROBED: quick positive
 *   (score pin), empty-files refusal, minimumScore range refusal, '' guard
 *   tolerance (the documented model-robustness branch), projectPath escape
 *   refusal (uses getActiveRoot(context.workspaceId) — the CORRECT pattern),
 *   missing-file shape. 'detailed' DELIBERATELY UNPROVEN (callLLM timing/
 *   provider behavior unowned). NO credential-shaped seeds anywhere (BROWSER
 *   -STREAM-002 redaction-integrity lesson): the secret-finding branch is
 *   covered only by its absence from results, never by a live secret.
 * - performance_analyzer (PerformanceAnalyzerTool.ts): pure static analysis,
 *   NO workspace containment at all (absolute file read directly; default
 *   projectPath '.') — static contrast note vs code_reviewer's containment.
 *   Missing files are silently skipped (continue) yet still divide the
 *   average AND can yield a perfect 100 score.
 * - file_edit_advanced (UtilityTools.ts:333-401): all-or-nothing multi-edit
 *   (any miss -> no write). Static note: it passes context?.workspaceId (a
 *   STRING) as resolveToolPath's `options` OBJECT, so options.workspaceId is
 *   undefined and the id is silently dropped -> default-root anchoring.
 *   FE3 ({}) resolves to the existing default ROOT DIR -> readFileSync(dir)
 *   throws -> caught; read-only, safe to pin live (predict EISDIR/EPERM
 *   directory-read shape; exact text recorded).
 * - repo_run_command (RepoSelfCodingTools.ts:213-250): prefix whitelist
 *   (npm test/build/lint/typecheck, tsc --noemit, git diff/status/log) +
 *   blocked-fragment screen + assertSafeRelativePath cwd (absolute throws).
 *   getRepoRoot()=cwd (sbx in-probe). RR0 runs REAL `git status` in a
 *   shell-seeded sbx git repo (hermetic: local git, zero network).
 * - shell_check_status (SystemTools.ts:1719-1751): pure local liveness
 *   (process.kill(pid,0)). Refusal-only: the positive needs a REAL
 *   background spawn (sonar/load precedent); SS0 pins the unknown-id shape.
 *
 * Every case stays on a SAFE surface: refusal pins, pure-local analysis,
 * contained sbx writes (FE), hermetic local git (RR0, seeded repo only),
 * in-process cache ops (LC). NO network (no fetch, no npx, no audit, no
 * install), NO model (quick/deterministic paths only), NO browser, NO spend.
 * Live api/data is read-only (Z0 records hashes + asserts untouched).
 *
 * Same isolated tsx method as 110-129: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, CWD = the sandbox dir itself (Set-Location INSIDE the shell),
 * all imports absolute, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-130 (fresh; all preserved). NO
 * DATA_DIR is set: the knowledge.ts import-time mkdir lands in <sbx>/data
 * (contained; Z0 asserts the shape, 127/128/129 continuity). NO
 * AUTO_APPROVE_* set at any point. No source edited.
 *
 * Run from the SANDBOX dir (run-1: sbx-tmp-130; run-2: fresh sbx-tmp-130b):
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-130b
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-130-dispatch-probe.ts
 *
 * RUN-1 (sbx-tmp-130): 32/37 PASS, EXIT 1. FIVE misses = THREE genuine
 * behavior discoveries + TWO probe-expectation bugs (receipts preserved):
 * (1) FE0/FE1/FE2: UtilityTools.ts carries its OWN LOCAL resolveToolPath
 * (:17-32, single threaded-workspace-root only) — NOT the multi-root
 * utils.ts resolver (isolated repro: utils.ts ACCEPTS the absolute sbx
 * path, the local one throws; full stack names UtilityTools.ts:30).
 * Absolute <sbx> paths are OUTSIDE getActiveRoot(wsId), so the handler
 * call (outside its try) throws -> internal_exception envelope. Run-2
 * seeds FE fixtures under projects/<wsId>/ (WR0 reuse) and pins the
 * strict-local-resolver shape as FE4. (2) RR0: executionEngine.run()
 * returns {ok,output,error,pid,duration} with NO exitCode key (runArgv
 * HAS it), but runSafeCommand reads result.exitCode -> undefined ->
 * ok:false ALWAYS, even with perfect stdout. Run-2 pins the
 * verdict-vs-evidence split + success/failure indistinguishability
 * (RR0b). (3) RR1: 'rm -rf' input is risk-CRITICAL at the ToolService
 * layer (classifyToolRisk input scan) -> approval_required BEFORE the
 * handler whitelist. Run-2 pins the defense ordering + adds a TRUE
 * whitelist pin (RR1b, no blocked fragment). Run-2 (fresh tree
 * sbx-tmp-130b, 40 cases) corrects all five; all 32 other pins held.
 * RUN-2: 38/40 PASS, EXIT 1. Two misses are ONE probe-seed bug: FE
 * fixtures were seeded under <root>/fx130c/fx130f/ (the reviewer seed
 * dir) but threaded-relative 'fx130f/...' resolves against <root>
 * directly (WR0-129 consistent — run-1's FE4 + FE2 in-root/out-of-root
 * halves already proved the root). Run-3 (fresh tree sbx-tmp-130c)
 * seeds the FE file at <root>/fx130f/; all 38 other pins held on run-2.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
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
  const attr = { workspaceId: 'probe-ws-130', userId: 'probe-user-130' } as any;

  await executionFirewall.runInContext('muse-130-probe', async () => {
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

    const slice = ['llm_cache', 'error_recovery', 'code_reviewer', 'performance_analyzer', 'file_edit_advanced', 'repo_run_command', 'shell_check_status'];
    const junk = ['my-project', 'project', 'photography-studio.png'];
    const sliceHit = slice.filter((n) => regNames.includes(n));
    const junkHit = junk.filter((n) => regNames.includes(n));
    results.push({
      case: 'D0b-registry-reconciliation', expect: 'all 7 slice names registered + 3 junk scan strings absent',
      actual: `sliceHit=${sliceHit.length}/7 junkHit=${junkHit.length} [${junkHit.join(',') || 'none'}]`,
      pass: sliceHit.length === 7 && junkHit.length === 0,
      detail: 'LEVEL-2 pin for the slice; `name =` static-scan hygiene: template/seed strings are not tools',
    });

    const d1: any = await executeTool('echo', { text: 'probe130-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe130-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    const h4: any = await executeTool('run_command', { action: 'list' }, attr);
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required'",
      actual: `ok=${h4?.ok} error=${String(h4?.error || 'none').slice(0, 40)}`,
      pass: h4?.ok === false && String(h4?.error || '') === 'approval_required',
      detail: 'T5-117 winner reproduced (117/121/123/126/127/128/129 continuity); nothing executed',
    });

    // ---- fixture trees (fs-seeded, tool-read) ----
    const tree = path.join(sbxRoot, 'fx130');
    const seedFile = (rel: string, content: string) => {
      const f = path.join(tree, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, content, 'utf-8');
    };
    // Threaded workspace root (WR0-129 reuse): seeds for the reviewer live
    // under externalRoot/<wsId>/, the REAL threaded mapping.
    const wsDir = path.join(sbxRoot, 'projects', 'probe-ws-130', 'fx130c');
    fs.mkdirSync(wsDir, { recursive: true });
    const seedWs = (rel: string, content: string) => {
      const f = path.join(wsDir, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, content, 'utf-8');
    };

    // ---- llm_cache (in-process; order-sensitive by design) ----
    const lc0: any = await executeTool('llm_cache', { action: 'get', prompt: 'never-set-prompt-130' }, attr);
    const lc0o = (lc0?.output as any) || {};
    results.push({
      case: 'LC0-cache-miss', expect: 'ok=true cached=false hit=false (honest miss)',
      actual: `ok=${lc0?.ok} cached=${lc0o.cached} hit=${lc0o.hit}`,
      pass: lc0?.ok === true && lc0o.cached === false && lc0o.hit === false,
      detail: 'MISS pin: unknown prompt is an honest miss, not an error',
    });

    const lcResp130 = 'cached-answer-130';
    const lc1s: any = await executeTool('llm_cache', { action: 'set', prompt: 'roundtrip-130', response: lcResp130 }, attr);
    const lc1g: any = await executeTool('llm_cache', { action: 'get', prompt: 'roundtrip-130' }, attr);
    const lc1go = (lc1g?.output as any) || {};
    const lc1pass = lc1s?.ok === true && (lc1s?.output as any)?.cached === true
      && lc1g?.ok === true && lc1go.cached === true && lc1go.hit === true
      && lc1go.response === lcResp130 && lc1go.hits === 1
      && lc1go.tokensSaved === Math.ceil(lcResp130.length / 4);
    results.push({
      case: 'LC1-set-get-roundtrip', expect: 'set cached + get hit echoes response, hits=1, tokensSaved=ceil(len/4)',
      actual: `setOk=${lc1s?.ok} getOk=${lc1g?.ok} hits=${lc1go.hits} tokensSaved=${lc1go.tokensSaved}`,
      pass: lc1pass, detail: 'ROUNDTRIP pin: set->get echoes the exact response with hit accounting',
    });

    const lc2: any = await executeTool('llm_cache', { action: 'get', prompt: 'roundtrip-130', model: 'other-model-130' }, attr);
    const lc2o = (lc2?.output as any) || {};
    results.push({
      case: 'LC2-model-scoping', expect: 'same prompt + different model -> miss (key includes model)',
      actual: `ok=${lc2?.ok} cached=${lc2o.cached} hit=${lc2o.hit}`,
      pass: lc2?.ok === true && lc2o.cached === false,
      detail: 'SCOPING pin: cache key is model:prompt, not prompt alone',
    });

    const lc3: any = await executeTool('llm_cache', { action: 'set', prompt: 'big-130', response: 'x'.repeat(40000) }, attr);
    const lc3o = (lc3?.output as any) || {};
    results.push({
      case: 'LC3-oversize-skip', expect: 'ok=true cached=false skipped + reason response_too_large (honest skip)',
      actual: `ok=${lc3?.ok} cached=${lc3o.cached} skipped=${lc3o.skipped} reason=${lc3o.reason}`,
      pass: lc3?.ok === true && lc3o.cached === false && lc3o.skipped === true && lc3o.reason === 'response_too_large',
      detail: 'HONEST-SKIP pin (TG2-129 class): 40000 chars exceed the 32000 default; explicit skip shape',
    });

    const lc4: any = await executeTool('llm_cache', { action: 'stats' }, attr);
    const lc4s = ((lc4?.output as any) || {}).stats || {};
    const lc4pass = lc4?.ok === true && typeof lc4s.hitRate === 'string' && lc4s.hitRate.endsWith('%')
      && lc4s.sets >= 1 && lc4s.hits >= 1 && lc4s.misses >= 2 && lc4s.cacheSize >= 1;
    results.push({
      case: 'LC4-stats-shape', expect: 'hitRate % string + sets/hits/misses/cacheSize counters consistent',
      actual: `ok=${lc4?.ok} hitRate=${lc4s.hitRate} sets=${lc4s.sets} hits=${lc4s.hits} misses=${lc4s.misses} size=${lc4s.cacheSize}`,
      pass: lc4pass, detail: 'STATS pin: cumulative process-global counters (unscoped-store class, static note)',
    });

    const lc5: any = await executeTool('llm_cache', { action: 'frobnicate130' }, attr);
    results.push({
      case: 'LC5-unknown-action', expect: "ok=false error='Unknown action: frobnicate130'",
      actual: `ok=${lc5?.ok} error=${String(lc5?.error || 'none').slice(0, 50)}`,
      pass: lc5?.ok === false && String(lc5?.error || '') === 'Unknown action: frobnicate130',
      detail: 'LOUD-DEFAULT pin: unlisted action throws inside try -> honest error (enum unenforced at dispatch, OBS-111-2 class)',
    });

    const lc6c: any = await executeTool('llm_cache', { action: 'clear' }, attr);
    const lc6g: any = await executeTool('llm_cache', { action: 'get', prompt: 'roundtrip-130' }, attr);
    const lc6pass = lc6c?.ok === true && ((lc6c?.output as any) || {}).cleared >= 1
      && lc6g?.ok === true && ((lc6g?.output as any) || {}).cached === false;
    results.push({
      case: 'LC6-clear-verified', expect: 'clear reports cleared>=1 + prior prompt misses again (leave-clean)',
      actual: `cleared=${((lc6c?.output as any) || {}).cleared} regetCached=${((lc6g?.output as any) || {}).cached}`,
      pass: lc6pass, detail: 'CLEAR pin: cache emptied and re-miss proves it; probe leaves zero entries',
    });

    // ---- error_recovery (analysis only; attemptFix=true deliberately unproven) ----
    const er0: any = await executeTool('error_recovery', { error: 'Cannot find module "leftpad130"', attemptFix: false }, attr);
    const er0o = (er0?.output as any) || {};
    results.push({
      case: 'ER0-missing-dependency-analysis', expect: 'ok=true type=missing_dependency + npm-install suggestion + recovered=false',
      actual: `ok=${er0?.ok} type=${er0o.errorType} suggestion=${String(er0o.suggestion || '').slice(0, 30)} recovered=${er0o.recovered}`,
      pass: er0?.ok === true && er0o.errorType === 'missing_dependency' && String(er0o.suggestion || '').includes('npm install') && er0o.recovered === false,
      detail: 'ANALYSIS pin: classification + suggestion with zero mutation (attemptFix=false)',
    });

    const er1: any = await executeTool('error_recovery', { error: 'EADDRINUSE: port 5130 already in use', attemptFix: false }, attr);
    results.push({
      case: 'ER1-port-conflict-analysis', expect: 'ok=true type=port_conflict + honest non-fix suggestion',
      actual: `ok=${er1?.ok} type=${((er1?.output as any) || {}).errorType} recovered=${((er1?.output as any) || {}).recovered}`,
      pass: er1?.ok === true && ((er1?.output as any) || {}).errorType === 'port_conflict' && ((er1?.output as any) || {}).recovered === false,
      detail: 'port pattern routes to port_conflict; non-autofixable stays unrecovered',
    });

    const er2: any = await executeTool('error_recovery', { error: 'something totally novel 130 happened', attemptFix: false }, attr);
    const er2o = (er2?.output as any) || {};
    results.push({
      case: 'ER2-unknown-analysis', expect: "ok=true type=unknown + 'Manual intervention required'",
      actual: `ok=${er2?.ok} type=${er2o.errorType} suggestion=${String(er2o.suggestion || '').slice(0, 30)}`,
      pass: er2?.ok === true && er2o.errorType === 'unknown' && er2o.suggestion === 'Manual intervention required',
      detail: 'UNKNOWN pin: unmatched errors fail soft to manual-intervention, never crash',
    });

    const er3: any = await executeTool('error_recovery', { error: "ENOENT: no such file or directory, open 'ghost130.ts'", attemptFix: false }, attr);
    const er3o = (er3?.output as any) || {};
    const er3logs = JSON.stringify((er3 as any)?.logs || []);
    results.push({
      case: 'ER3-file-not-found-no-write', expect: 'ok=true type=file_not_found + recovered=false + zero create logs',
      actual: `ok=${er3?.ok} type=${er3o.errorType} recovered=${er3o.recovered} createdLog=${er3logs.includes('Created file')}`,
      pass: er3?.ok === true && er3o.errorType === 'file_not_found' && er3o.recovered === false && !er3logs.includes('Created file'),
      detail: 'NO-WRITE pin: the file-creation branch cannot fire with attemptFix=false (the true path needs owned gateway review)',
    });

    const er4: any = await executeTool('error_recovery', {}, attr);
    const er4o = (er4?.output as any) || {};
    results.push({
      case: 'ER4-missing-error-arg', expect: "ok=true type=unknown (required ['error'] unenforced, handler tolerant)",
      actual: `ok=${er4?.ok} type=${er4o.errorType}`,
      pass: er4?.ok === true && er4o.errorType === 'unknown',
      detail: 'OBS-111-2 instance: missing required arg coerces to unknown-type analysis, not a refusal',
    });

    // ---- code_reviewer (quick + guards; detailed needs a provider) ----
    seedWs('rev130.js', 'var total130 = 0;\nfunction add130(a, b) {\n  console.log("add130", a, b);\n  if (a == b) {\n    total130 = eval("a + b");\n  }\n  return a + b; // TODO 130: validate inputs\n}\nmodule.exports = { add130 };\n');
    const cr0: any = await executeTool('code_reviewer', { files: ['rev130.js'], projectPath: wsDir, reviewType: 'quick' }, attr);
    const cr0o = (cr0?.output as any) || {};
    const cr0issues = Array.isArray(cr0o.issues) ? cr0o.issues : [];
    const cr0msgs = JSON.stringify(cr0issues);
    // deterministic score: warnings(eval,var)=2*10 + infos(console.log,==,TODO)=3*3 -> 100-20-9=71
    const cr0pass = cr0?.ok === true && cr0o.overallScore === 71 && cr0o.filesReviewed === 1
      && cr0msgs.includes('eval') && cr0msgs.includes('const/let') && cr0msgs.includes('console.log')
      && cr0o.issues.every((i: any) => i.verificationStatus === 'verified' && i.evidenceEligible === true);
    results.push({
      case: 'CR0-quick-positive', expect: 'ok=true score=71 + 1 file reviewed + eval/var/log findings, all verified',
      actual: `ok=${cr0?.ok} score=${cr0o.overallScore} reviewed=${cr0o.filesReviewed} issues=${cr0issues.length}`,
      pass: cr0pass, detail: 'DETERMINISTIC-REVIEW pin: quick path is fully offline; every deterministic finding is evidence-eligible+verified',
    });

    const cr1: any = await executeTool('code_reviewer', { files: [], projectPath: wsDir, reviewType: 'quick' }, attr);
    results.push({
      case: 'CR1-empty-files-refusal', expect: "ok=false 'code_reviewer requires a non-empty files array...'",
      actual: `ok=${cr1?.ok} error=${String(cr1?.error || 'none').slice(0, 60)}`,
      pass: cr1?.ok === false && String(cr1?.error || '') === 'code_reviewer requires a non-empty files array of concrete source paths',
      detail: 'GUARD pin: empty array refused loudly before any FS touch',
    });

    const cr2: any = await executeTool('code_reviewer', { files: ['rev130.js'], projectPath: wsDir, reviewType: 'quick', minimumScore: 101 }, attr);
    results.push({
      case: 'CR2-minimum-score-range', expect: "ok=false 'code_reviewer minimumScore must be a number from 0 to 100'",
      actual: `ok=${cr2?.ok} error=${String(cr2?.error || 'none').slice(0, 60)}`,
      pass: cr2?.ok === false && String(cr2?.error || '') === 'code_reviewer minimumScore must be a number from 0 to 100',
      detail: 'RANGE pin: out-of-range threshold refused before review work',
    });

    const cr3: any = await executeTool('code_reviewer', { files: ['rev130.js'], projectPath: tree, reviewType: 'quick' }, attr);
    results.push({
      case: 'CR3-projectpath-escape', expect: "ok=false 'code_reviewer projectPath must stay within the active workspace'",
      actual: `ok=${cr3?.ok} error=${String(cr3?.error || 'none').slice(0, 65)}`,
      pass: cr3?.ok === false && String(cr3?.error || '') === 'code_reviewer projectPath must stay within the active workspace',
      detail: 'CONTAINMENT pin: absolute projectPath outside the threaded root refused (correct getActiveRoot(wsId) pattern)',
    });

    const cr4: any = await executeTool('code_reviewer', { files: ['ghost130.js'], projectPath: wsDir, reviewType: 'quick' }, attr);
    const cr4o = (cr4?.output as any) || {};
    results.push({
      case: 'CR4-missing-file-shape', expect: "ok=false 'could not review 1 requested file(s)' + missingFiles echoed",
      actual: `ok=${cr4?.ok} error=${String(cr4?.error || 'none').slice(0, 70)} missing=${JSON.stringify(cr4o.missingFiles || [])}`,
      pass: cr4?.ok === false && String(cr4?.error || '').includes('could not review 1 requested file(s)') && JSON.stringify(cr4o.missingFiles || []).includes('ghost130.js'),
      detail: 'MISSING pin: absent file is an honest failure with the name echoed (contrast PA1 silent skip)',
    });

    const cr5: any = await executeTool('code_reviewer', { files: ['rev130.js'], projectPath: wsDir, reviewType: 'quick', minimumScore: '' }, attr);
    results.push({
      case: 'CR5-empty-string-score-tolerated', expect: "ok=true ('' means unset per the documented model-robustness guard)",
      actual: `ok=${cr5?.ok} score=${((cr5?.output as any) || {}).overallScore}`,
      pass: cr5?.ok === true && ((cr5?.output as any) || {}).overallScore === 71,
      detail: 'MODEL-ROBUSTNESS pin: minimumScore "" survives as unset (no silent threshold-0 pass)',
    });

    // ---- performance_analyzer (pure static; NO containment by construction) ----
    seedFile('pa-proj/load130.js', 'const fs = require("fs");\nfunction load130(path) {\n  const text = fs.readFileSync(path, "utf-8");\n  const rows = text.split("\\n");\n  let total = 0;\n  for (let i = 0; i < rows.length; i++) {\n    for (let j = 0; j < 10; j++) {\n      if (rows[i] && rows[i].length > j) {\n        total += rows[i].length;\n      }\n    }\n  }\n  return total;\n}\nmodule.exports = { load130 };\n');
    const pa0: any = await executeTool('performance_analyzer', { files: [path.join(tree, 'pa-proj', 'load130.js')] }, attr);
    const pa0o = (pa0?.output as any) || {};
    const pa0bn = Array.isArray(pa0o.bottlenecks) ? pa0o.bottlenecks : [];
    const pa0types = JSON.stringify(pa0bn.map((b: any) => b.type));
    // complexity: 1 + if(1) + for(2) + &&(1) = 5; bottlenecks: Nested Loops + Blocking I/O
    // score = 100 - 5 - 2*5 = 85
    const pa0pass = pa0?.ok === true && pa0o.performanceScore === 85 && pa0bn.length === 2
      && pa0types.includes('Nested Loops') && pa0types.includes('Blocking I/O')
      && Array.isArray(pa0o.optimizations) && pa0o.optimizations.length >= 2;
    results.push({
      case: 'PA0-analyzer-positive', expect: 'ok=true score=85 + Nested-Loops + Blocking-IO bottlenecks + >=2 optimizations',
      actual: `ok=${pa0?.ok} score=${pa0o.performanceScore} bottlenecks=${pa0bn.length} opt=${(pa0o.optimizations || []).length}`,
      pass: pa0pass, detail: 'STATIC-ANALYSIS pin: exact complexity arithmetic + detector hits, zero shell/model',
    });

    const pa1: any = await executeTool('performance_analyzer', { files: [path.join(tree, 'no-such-130.js')] }, attr);
    const pa1o = (pa1?.output as any) || {};
    results.push({
      case: 'PA1-missing-file-silent-perfect', expect: 'ok=true bottlenecks=[] score=100 (missing input -> perfect score)',
      actual: `ok=${pa1?.ok} score=${pa1o.performanceScore} bottlenecks=${(pa1o.bottlenecks || []).length}`,
      pass: pa1?.ok === true && pa1o.performanceScore === 100 && (pa1o.bottlenecks || []).length === 0,
      detail: 'SILENT-SKIP pin (QR1-129 class, stronger): a MISSING file yields a PERFECT 100 with zero signal',
    });

    const pa2: any = await executeTool('performance_analyzer', {}, attr);
    results.push({
      case: 'PA2-missing-files-arg', expect: 'ok=false (files.length throws inside try -> caught)',
      actual: `ok=${pa2?.ok} error=${String(pa2?.error || 'none').slice(0, 50)}`,
      pass: pa2?.ok === false,
      detail: 'OBS-111-2 instance: required [files] unenforced at dispatch; crash-shaped error, exact text recorded',
    });

    // ---- file_edit_advanced (THREADED-root paths; local single-root resolver) ----
    const wsRoot = path.join(sbxRoot, 'projects', 'probe-ws-130');
    const fe0seedDir = path.join(wsRoot, 'fx130f');
    fs.mkdirSync(fe0seedDir, { recursive: true });
    fs.writeFileSync(path.join(fe0seedDir, 'multi130.txt'), 'alpha130 one\nmiddle 130\nbeta130 two\n', 'utf-8');
    seedFile('fe-proj/multi130.txt', 'alpha130 one\nmiddle 130\nbeta130 two\n');
    const fe0diskPath = path.join(fe0seedDir, 'multi130.txt');
    const fe0: any = await executeTool('file_edit_advanced', { filePath: 'fx130f/multi130.txt', edits: [{ find: 'alpha130', replace: 'ALPHA130' }, { find: 'beta130', replace: 'BETA130' }] }, attr);
    const fe0disk = fs.readFileSync(fe0diskPath, 'utf-8');
    const fe0pass = fe0?.ok === true && ((fe0?.output as any) || {}).success === true
      && fe0disk.includes('ALPHA130 one') && fe0disk.includes('BETA130 two') && !fe0disk.includes('alpha130');
    results.push({
      case: 'FE0-multi-edit-positive', expect: 'ok=true + both replacements on disk (threaded-relative path)',
      actual: `ok=${fe0?.ok} disk=${JSON.stringify(fe0disk).slice(0, 60)}`,
      pass: fe0pass, detail: 'WRITEBACK pin: non-contiguous multi-edit persists atomically; threaded-relative resolves via the LOCAL single-root resolver (run-1 absolute-<sbx> discovery corrected)',
    });

    const fe1before = fs.readFileSync(fe0diskPath, 'utf-8');
    const fe1: any = await executeTool('file_edit_advanced', { filePath: 'fx130f/multi130.txt', edits: [{ find: 'ALPHA130', replace: 'x130' }, { find: 'MISSING130', replace: 'y130' }] }, attr);
    const fe1after = fs.readFileSync(fe0diskPath, 'utf-8');
    results.push({
      case: 'FE1-partial-match-no-write', expect: "ok=false 'could not match 1' + disk byte-identical",
      actual: `ok=${fe1?.ok} error=${String(fe1?.error || 'none').slice(0, 90)} unchanged=${fe1after === fe1before}`,
      pass: fe1?.ok === false && String(fe1?.error || '').includes('could not match 1') && fe1after === fe1before,
      detail: 'ALL-OR-NOTHING pin: one miss voids the whole batch; the matched edit is NOT persisted',
    });

    const fe2: any = await executeTool('file_edit_advanced', { filePath: path.join(wsDir, 'no-such-130.txt'), edits: [{ find: 'a', replace: 'b' }] }, attr);
    results.push({
      case: 'FE2-missing-file', expect: "ok=false error='File not found' (in-root absolute miss)",
      actual: `ok=${fe2?.ok} error=${String(fe2?.error || 'none').slice(0, 90)}`,
      pass: fe2?.ok === false && String(fe2?.error || '') === 'File not found',
      detail: 'missing-file refusal after contained resolution (in-root absolute miss, never created)',
    });

    const fe3: any = await executeTool('file_edit_advanced', {}, attr);
    results.push({
      case: 'FE3-missing-filepath-arg', expect: 'ok=false (threaded-root DIR read throws inside try -> caught; read-only)',
      actual: `ok=${fe3?.ok} error=${String(fe3?.error || 'none').slice(0, 90)}`,
      pass: fe3?.ok === false,
      detail: 'OBS-111-2 instance: missing required filePath resolves to the threaded root dir; crash-shaped error, exact text recorded; zero writes (throw precedes writeFileSync)',
    });

    const fe4: any = await executeTool('file_edit_advanced', { filePath: path.join(tree, 'fe-proj', 'multi130.txt'), edits: [{ find: 'alpha130', replace: 'ALPHA130' }] }, attr);
    results.push({
      case: 'FE4-outside-threaded-root', expect: "ok=false internal_exception + 'path_outside_workspace' (in-sbx but out-of-root)",
      actual: `ok=${fe4?.ok} error=${String(fe4?.error || 'none').slice(0, 90)}`,
      pass: fe4?.ok === false && String(fe4?.error || '').includes('path_outside_workspace'),
      detail: 'LOCAL-RESOLVER pin (run-1 discovery): UtilityTools-local single-root resolver rejects what the shared multi-root resolver accepts; crash-envelope shape (proposed OBS-130-2 P3)',
    });

    // ---- repo_run_command (whitelist + cwd gate; RR0 needs the seeded git repo) ----
    const rr0: any = await executeTool('repo_run_command', { command: 'git status', cwd: 'git130' }, attr);
    const rr0o = (rr0?.output as any) || {};
    const rr0pass = rr0?.ok === false && rr0o.exitCode === undefined && String(rr0o.stdout || '').includes('README130.md');
    results.push({
      case: 'RR0-git-status-verdict-split', expect: 'ok=false + exitCode undefined + stdout HAS the README (verdict-vs-evidence split)',
      actual: `ok=${rr0?.ok} exit=${rr0o.exitCode} out=${String(rr0o.stdout || '').slice(0, 90)}`,
      pass: rr0pass, detail: 'VERDICT-SPLIT pin (run-1 discovery): engine.run() returns NO exitCode, so runSafeCommand reports failure on success; hermetic local git, zero network (proposed OBS-130-1)',
    });

    const rr0b: any = await executeTool('repo_run_command', { command: 'git log', cwd: 'git130' }, attr);
    const rr0bo = (rr0b?.output as any) || {};
    const rr0bpass = rr0b?.ok === false && rr0bo.exitCode === undefined && String(rr0bo.stderr || '').includes('does not have any commits');
    results.push({
      case: 'RR0b-failing-command-same-shape', expect: 'ok=false + exitCode undefined + stderr names the failure (indistinguishable verdict)',
      actual: `ok=${rr0b?.ok} exit=${rr0bo.exitCode} err=${String(rr0bo.stderr || '').slice(0, 90)}`,
      pass: rr0bpass, detail: 'INDISTINGUISHABLE pin: exit-128 failure shares the EXACT verdict shape of success; only stream content differs (proposed OBS-130-1)',
    });

    const rr1: any = await executeTool('repo_run_command', { command: 'rm -rf /tmp/x130' }, attr);
    results.push({
      case: 'RR1-critical-input-ordering', expect: "ok=false error='approval_required' (risk layer fires BEFORE the whitelist)",
      actual: `ok=${rr1?.ok} error=${String(rr1?.error || 'none').slice(0, 90)}`,
      pass: rr1?.ok === false && String(rr1?.error || '') === 'approval_required',
      detail: 'DEFENSE-ORDERING pin (run-1 discovery): critical input-scan verdict precedes handler whitelist/blocklist; handler never consulted',
    });

    const rr1b: any = await executeTool('repo_run_command', { command: 'python --version' }, attr);
    results.push({
      case: 'RR1b-true-whitelist-pin', expect: "ok=false error='command_not_allowed' (clean input, simply unlisted)",
      actual: `ok=${rr1b?.ok} error=${String(rr1b?.error || 'none').slice(0, 90)}`,
      pass: rr1b?.ok === false && String(rr1b?.error || '') === 'command_not_allowed',
      detail: 'TRUE-WHITELIST pin: no blocked fragment, no critical scan hit — the whitelist itself refuses',
    });

    const rr2: any = await executeTool('repo_run_command', { command: 'node -v' }, attr);
    results.push({
      case: 'RR2-safe-but-unlisted', expect: "ok=false 'command_not_allowed' (safe command outside the whitelist)",
      actual: `ok=${rr2?.ok} error=${String(rr2?.error || 'none').slice(0, 40)}`,
      pass: rr2?.ok === false && String(rr2?.error || '') === 'command_not_allowed',
      detail: 'WHITELIST-GAP pin (info): harmless diagnostics are unavailable; closed-by-default, no OBS (safe direction)',
    });

    const rr3: any = await executeTool('repo_run_command', { command: 'git status', cwd: 'D:\\Joe\\muse-worktree' }, attr);
    results.push({
      case: 'RR3-absolute-cwd-refused', expect: "ok=false error='absolute_paths_not_allowed'",
      actual: `ok=${rr3?.ok} error=${String(rr3?.error || 'none').slice(0, 50)}`,
      pass: rr3?.ok === false && String(rr3?.error || '') === 'absolute_paths_not_allowed',
      detail: 'CWD-GATE pin: absolute cwd throws in assertSafeRelativePath (thrown -> caught -> honest error)',
    });

    const rr4: any = await executeTool('repo_run_command', {}, attr);
    results.push({
      case: 'RR4-missing-command-arg', expect: "ok=false 'command_not_allowed' (empty command, handler loud)",
      actual: `ok=${rr4?.ok} error=${String(rr4?.error || 'none').slice(0, 40)}`,
      pass: rr4?.ok === false && String(rr4?.error || '') === 'command_not_allowed',
      detail: 'OBS-111-2 instance: required [command] unenforced at dispatch, handler refuses loudly',
    });

    // ---- shell_check_status (refusal only; positive needs a real bg spawn) ----
    const ss0: any = await executeTool('shell_check_status', { id: 'no-such-id-130' }, attr);
    results.push({
      case: 'SS0-unknown-id', expect: "ok=false error='Process not found'",
      actual: `ok=${ss0?.ok} error=${String(ss0?.error || 'none').slice(0, 40)}`,
      pass: ss0?.ok === false && String(ss0?.error || '') === 'Process not found',
      detail: 'REFUSAL pin: unknown id refused with zero signal-sends (positive needs owned bg-spawn review)',
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
    const zMarkers = ['m130', 'fx130', 'probe130'];
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
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 130 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127/128/129 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-130-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-130-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
