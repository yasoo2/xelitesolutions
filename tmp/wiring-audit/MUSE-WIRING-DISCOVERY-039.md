# MUSE WIRING DISCOVERY 039 — planner-exposure reconciliation of the 116

PROBE=tmp/wiring-audit/planexp39.mjs (read-only, dependency-free Node)
INPUT=reused filed evidence tmp/wiring-audit/fx-regcheck38/regcheck38_runA.json
FIXTURES=tmp/wiring-audit/fx-planexp39/planexp39_run{A,B}.{json,log}
AB_SHA256=024e4df827058803c3492f6e9422870180f240cdf8be7bcd9af013ff66d5dd95 (byte-identical A/B)
HEAD_MUSE=e7848642 (muse/joe-development) MAIN=read-only NVIDIA worktree (dirty preserved, untouched)
METHOD_FIX_DURING_RUN=S6/S8 scope paths corrected (modules/services/...),
S12 tool-picker added, A/B rerun green. `node <relative>` fails in this
sandbox (EISDIR lstat 'D:'); probes run via absolute script path — same bytes.

## F13 planner exposure has FOUR paths, not one (call evidence)

P1 STATIC CATALOGUE: PLANNER_TOOL_CATALOGUE (~48 names) rendered by
  plannerToolPrompt() into the ProjectPlannerTool prompt (:838/:1597).
  plan-tools.ts:199-200 documents WHY it is static: importing toolCatalog
  there would create registry->PhaseExecutor->plan-tools->toolCatalog->
  registry cycle.
P2 RETRIEVAL CATALOGUE: selectToolsFor(goal, limit=30) scores EVERY
  registered tool (name 5x + tags 3x + description 1x, IDF-weighted) and
  offers CORE_TOOLS (9, always) + scorers>0. Called via catalogueFor at
  PlanningEngine.ts:3244 (dynamicCatalogue; catalogueForAsync with sync
  fallback) and adaptive-dag-planner.ts:363. Muse-only deltas: local-disk
  browser-URL demotion (x0.2) + tool-rerank.ts LLM rerank (absent in MAIN).
P3 SINGLE-SHOT ROUTER: capabilityRoute(goal) at PlanningEngine.ts:1818
  (async with sync fallback). Fires only on ACT_VERB + score>=8 +
  distinctive-name-hit + input-fillable. ROUTER_EXCLUDED (32 names, both
  trees) is NEVER single-shot routed — exclusion, not exposure.
P4 PROVIDER FUNCTION-CALLING picker (tool-picker.ts selectToolDefsFor-
  Provider, PRIORITY_TOOL_NAMES + keyword scoring): DORMANT. Sole
  importer is system/scripts/verify_core_logic.ts; no production,
  package-script, Builder, or test caller found in scoped search.
OPEN LEAD (ckpt 40): AgentOrchestrator DETERMINISTIC_TOOLS (:31-35,
  execute-as-is) + "a second tool selector with a short hardcoded list"
  (:27-30, unidentified this pass — not local-brain/weak-model-enhancer/
  CentralAnswerTool by literal search).

## F14 the 116 split (MAIN queue=116; MUSE queue=115 in parens)

CORE_ALWAYS_OFFERED: 2 (2) — central_answer, search_files (the other 7
  CORE_TOOLS are already in the static catalogue, hence not in the queue).
LITERAL_IN_LIVE_SCOPE: 61 (60) — name literal in >=1 live planner scope
  (S2-excluded-only and S12-dormant-only do NOT count; see F15).
DORMANT_OR_EXCLUDED_ONLY: 20 (20) — no live-scope literal:
  15 only in dormant S12: archive_files, browser_action, browser_vision,
    codebase_outline, compliance_validator, dependency_graph,
    execute_python, html_extract, http_fetch, knowledge_search,
    notify_user, query_datasource, search_api, sonar_analysis, todo_write.
    NOTE: core browser tools (browser_action/vision) are in this set.
  5 only in ROUTER_EXCLUDED (exclusion, not exposure; verified their S2
    mentions are exclusion-list lines only): go_builder, java_builder,
    progressive_generator, python_builder, website_full_pipeline.
RETRIEVAL_ONLY_CANDIDATE: 33 (33, IDENTICAL both trees) — no literal in
  ANY planner scope; planner-reachable ONLY via P2 description/tag
  scoring (behavioral proof deferred to ckpt 40): api_tester,
  architect_plan, auto_refactor, business_logic_parser, cache_manager,
  chaos_test_plan, cloud_cost_estimator, dead_code_detector,
  dev_server_start, docker_swarm_ops, enterprise_platform_foundation,
  error_recovery, image_studio, inspect_symbol, large_data_seeder,
  llm_cache, load_tester, logger, memorize_codebase,
  orion_business_foundation, performance_analyzer, performance_profile,
  project_state_manager, query_optimizer, recall_memory,
  repo_diff_summary, repo_run_command, rss_fetch, secrets_scan_repo,
  shell_check_status, task_lifecycle, video_action, visual_compare.
RETRIEVAL-DEPENDENT TOTAL: 53/116 (45.7%) — 33 + 20.

## F15 scope-hit shape (MAIN; MUSE differs only where noted)

S3_PlanningEngine 46 (MUSE 45) — dominant deterministic surface.
S12_tool-picker 22 (22) — DORMANT path; 15 names depend on it solely (F14).
S2_toolCatalog 15 (15) — includes pure-exclusion mentions (not exposure).
S7_PhaseExecutorTool 15 (15). S10_capability-match 8 (8).
S9_adaptive-dag-planner 4 (6: +ask_user, +import_project, Muse-only).
S4_ProjectPipelineTool 5 (4). S6_AgentLoopService 2 =
  {joe_engineering_report, phase_executor}. S5_ProjectPlannerTool 1 =
  {project_planner} (own-name only). S8_SelfFixExecutionService 1 =
  {phase_executor}. S11_tool-rerank 0 queue literals in Muse (generic
  rerank layer, no hardcoded names — good) and absent in MAIN (expected).

## F16 tree diff is minimal and fully explained

Only 3 per-name rows differ MUSE-vs-MAIN: ask_user + import_project gain
Muse-only S9 mentions (Muse planner work); specification_verification is
MAIN-only (NVIDIA dirty) and ALREADY planner-mentioned in S3+S4 —
NVIDIA's new tool entered with planner exposure, unlike the 33.
toolCatalog.ts itself differs (MUSE 435 lines incl. local-disk demotion
+ exported inputForTool/capabilityRoute; MAIN 370 lines) but CORE_TOOLS
(9) and ROUTER_EXCLUDED (32) membership are IDENTICAL both trees.

## F17 case study: memory tools are retrieval-only

recall_memory has NO literal in any planner scope (verified repo-wide:
only ToolService.ts:571 special-case, MemoryTool.ts definition, and
tests). memorize_codebase likewise. The planner can reach Joe's memory
ONLY when P2 scoring surfaces it for a given goal — no deterministic
path, no catalogue entry, no router path. Whether P2 reliably surfaces
memory on memory-shaped goals is a ckpt-40 behavioral question; the
static fact (no literal exposure) is now pinned.

## Counts for the wiring matrix (static, MAIN live tree)

REGISTERED=164 CATALOGUE_COVERED~48 CORE_ALWAYS_OFFERED_TOTAL=9
QUEUE_NOT_IN_CATALOGUE=116:
  LITERAL_IN_LIVE_SCOPE=61 CORE_IN_QUEUE=2
  DORMANT_OR_EXCLUDED_ONLY=20 RETRIEVAL_ONLY=33
RETRIEVAL_DEPENDENT=53 EXPOSURE_PATHS=4 (1 dormant)
PLANNER_VISIBLE_NOT_EXECUTABLE=0 found this pass (all queue names are
  registered => executor-reachable per ckpt-38 F10; no inverse case seen).

## F18 cross-review note

Method + probe + A/B bytes filed in this worktree for NVIDIA/Codex
challenge. Static-literal absence is NOT a planner-invisibility verdict
(P2 scores descriptions, not name literals) — hence RETRIEVAL_ONLY_
CANDIDATE, not ORPHANED. S12-dormant verdict rests on a scoped import
search (only importer verify_core_logic.ts); a production caller via
dynamic require would overturn it — challengers: show the caller.

NEXT (checkpoint 40): behavioral P2 battery — run selectToolsFor over a
fixed diverse goal battery (fixture-contained tsx, read-only registry
import) per tree; record per-name best-rank/retrieval-count; split the 53
into RETRIEVABLE vs NEVER_RETRIEVED; identify the AgentOrchestrator
"second tool selector".
