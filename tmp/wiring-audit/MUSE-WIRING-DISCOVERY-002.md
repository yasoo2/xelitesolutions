# MUSE Wiring Discovery 002 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 2)
HEAD=e043e23c + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-29
METHOD=re-runnable probe: tmp/wiring-audit/classify.mts (exit 0)
EVIDENCE=tmp/wiring-audit/classification.json + classify-run2.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-001.md (checkpoint 1: 163 registered, 1 reported orphan)

## New findings (all Muse-branch @ e043e23c, independently executed)

### F1. FIFTH ORPHAN: grep_search is implemented, unregistered, AND name-shadowed

- `api/src/modules/tools/definitions/SystemTools.ts:1022-1043` defines a full
  `GrepSearchTool` (name='grep_search', real workspace-contained grep
  execution via safePath + executionEngine).
- Repository-wide symbol search: the class is referenced NOWHERE else — not
  even imported in registry.ts (unlike the four known orphans, which are at
  least imported).
- Its own name cannot reach it: TOOL_ALIASES maps grep_search->search_text,
  and PRIORITY_TOOL_NAMES lists grep_search (schema never shown to the model).
- PRIMARY_STATE=ORPHANED. Disposition question for the repair backlog: wire
  it (it is contained and tested-by-construction) vs retire it in favor of
  search_text (ripgrep-based?) vs keep alias-only. Do NOT decide here.
- Correction to checkpoint 1: "1 confirmed orphan" was the single fully
  traced case (bulk_file_generator); the complete defined-not-registered set
  is now 5 tool names (the other 14 literals are non-tool `name=` noise:
  app/author/description/desktop/entities/express/fullstack/mobile/next/q/
  tablet/title/viewport/visibility — verified as non-tool contexts).

### F2. Per-symbol reconciliation is now CLOSED on the Muse branch

- 182 `name` literals across 93 definition files; every one of the 163
  registered names has a static literal (registeredNoLiteral=[]). No
  factory/dynamic-name gap on this branch — the earlier 172-symbol regex gap
  from checkpoint 1 is resolved: the delta was multi-export files plus
  class-property (`name =`) vs object-literal (`name:`) declaration styles.
- 5 defined-not-registered tool names: bulk_file_generator,
  codebase_navigator, generate_image, visual_qa, grep_search.

### F3. Rewrite layer is bigger than the alias layer — and has a dead entry

- 12 single-name hard rewrites found in ToolService.executeTool
  (browser_open/get_state/snapshot->browser_run, web_search->browser_run,
  npm_build/run/start/test->npm_manager, project_scaffold->scaffold_project,
  read_file_tree->inspect_directory, github_create_repo->github_repo_manager,
  image_generate->generate_image[UNREGISTERED target]).
- 16 further multi-name `if (name === ... || ...)` conditions exist; per-case
  reading (rename vs input-shaping) is checkpoint-3 work. The 12 above are a
  lower bound, stated as such.
- ORDERING (verified in source): hard rewrites run first (ToolService
  ~:344-553), registry lookup second, TOOL_ALIASES fallback LAST and only
  `if (!tDef)` (:691-695). Consequence: web_search ALWAYS becomes browser_run
  via rewrite, so the TOOL_ALIASES entry web_search->search_api is DEAD.
  Two mappings, one winner, one corpse — the contract gate must assert a
  single winner per name, not merely "some path exists".
- Second dead-name reference: rateLimitBucketKey (:73-76) special-cases
  'visual_qa', which is unregistered — harmless today, another six-surface
  gate item (bucket keys keyed off tool names).

### F4. Dormant-21 partition (Muse branch, executed — matches Codex main-branch shape)

- REWRITE_COVERED (2): read_file_tree->inspect_directory,
  github_create_repo->github_repo_manager.
- ALIAS_COVERED (1 live + 1 dead): grep_search->search_text (live);
  web_search->search_api (DEAD — rewrite wins, see F3).
- REWRITE_BROKEN (1): image_generate->generate_image (target unregistered).
- ABSENT_NO_CANDIDATE (1): fs_glob. No registered name shares a stem.
  Closest by purpose is search_files (filename glob) — needs behavioral
  comparison before any claim of equivalence.
- ABSENT_STATIC_CANDIDATES (15): check_syntax, generate_tests,
  generate_docs, db_inspect, command_policy_check, tool_create_shell,
  shell_status, product_search, deep_research, business_logic,
  chaos_testing, cost_estimator, self_confidence, terraform_ops,
  security_scan_repo. Static stem-overlap candidates are recorded per name
  in classification.json (e.g. shell_status~shell_check_status,
  business_logic~business_logic_parser, cost_estimator~cloud_cost_estimator,
  self_confidence~self_confidence_evaluator, chaos_testing~chaos_test_plan,
  terraform_ops~{docker_swarm_ops,git_ops,kubernetes_ops},
  security_scan_repo~secrets_scan_repo). These are REVIEW LEADS, not
  equivalence verdicts: name similarity does not prove capability coverage.
  terraform_ops is the weakest (only shares the _ops suffix).

### F5. Catalogue coverage (independent 20-goal corpus, deterministic, no model)

- selectToolsFor(limit 30) selected 148/163 registered names at least once.
- 15 absent: ambiguity_resolver, ask_user, cloud_cost_estimator,
  docker_swarm_ops, execute_python, json_query, kubernetes_ops,
  llm_cache, multi_agent_debate, project_planner, rss_fetch,
  self_confidence_evaluator, task_lifecycle, template_manager,
  video_action.
- NOT dead tools: project_planner is ROUTER_EXCLUDED by design (own
  deterministic path); ask_user/llm_cache/json_query are niche by purpose.
  Each needs its own reachability story (keyword route? deterministic path?
  internal-only?) — that per-name story pass is checkpoint-3 work.
- Corpus in classify.mts CORPUS (EN+AR, build/browse/answer/repair/deploy);
  different corpus from Codex's 139/163 run, same conclusion shape: ~9%
  need per-name review, none proven dead by absence alone.

## Updated counts (Muse branch)

RAW_TOOL_DEFINITIONS=93 files / 182 name literals
REGISTERED_TOOLS=163 (0 dupes, 163/163 with execute())
DEFINED_NOT_REGISTERED=5 tool names (4 imported-never-constructed + grep_search never-imported)
HARD_REWRITES>=12 single-name (+16 multi-name conditions pending per-case reading)
DEAD_MAPPINGS=2 confirmed (web_search alias shadowed by rewrite; visual_qa rate-limit key)
CATALOGUE_COVERED=148/163 over 20-goal corpus (deterministic)
HIGH_LEVEL_CAPABILITIES=UNKNOWN (grouping pass still pending)
FULLY_WIRED/PARTIALLY_WIRED/LEGACY totals=UNKNOWN beyond items above
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery by design)

## Repair backlog candidates (PROPOSED, unactioned — appended to checkpoint-1 list)

- P1: grep_search orphan+shadow — decide wire vs retire vs alias-only
  (wire candidate: contained implementation already exists).
- P2: web_search double mapping — pick ONE winner (browser_run vs
  search_api serve different purposes: browser nav vs API search) and
  delete the loser; add a single-winner gate assertion.
- P2: image_generate broken rewrite — unchanged from checkpoint 1, waits
  for free-first creative contract (separate consultation answered).
- P2: fs_glob absent with no candidate — decide equivalent (search_files?)
  vs genuinely missing capability.
- P3: 15 absent-static-candidate dormant names — per-name behavioral
  equivalence review, not bulk action.
- P3: 15 catalogue-absent names — per-name reachability story.
- P3: multi-name rewrite conditions — per-case rename-vs-shaping audit.

## Limits / UNKNOWNs

- Static stem candidates are leads, not verdicts.
- Multi-name rewrite conditions not yet classified per case.
- No firewall/approval/pass-rate execution sweep yet.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true';
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\classify.mts
Expected: exit 0, registered=163, literals=182, definedNotRegistered=19
(5 tool + 14 noise), registeredNoLiteral=[], rewrites=12,
catalogueCoverage=148/163.
