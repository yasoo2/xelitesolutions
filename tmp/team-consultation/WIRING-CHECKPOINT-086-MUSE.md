# WIRING CHECKPOINT 086 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=da408fc69514176d199cea1de8a345cc0dbf6250 (exact; verified at probe time)

## Scope: priority-offered vs registry vs alias reconciliation (read-only)
086 generalizes W73-5 (shell_status) to the full PRIORITY_TOOL_NAMES list in
api/src/core/llm/tool-picker.ts: for each of 57 offered names, is it
registered, aliased-to-registered, or a GAP? Plus: do all TOOL_ALIASES targets
resolve? Method: tmp/wiring086/probe.mjs via tsx, synthetic test-only
JWT_SECRET, TEMP/cache redirected to workspace; registry+picker imports (no
tool executed), alias-table parse from ToolService source, no network.
Evidence: tmp/wiring086/{probe.mjs,results.json,raw.txt,stderr.txt}.

## Result: 38/57 reachable, 19 GAPS, 28/28 aliases resolve
- offered=57 (PRIORITY_TOOL_NAMES length).
- aliases=28 parsed from exported TOOL_ALIASES; ALL 28 targets registered
  (no broken alias).
- GAPS (not registered, not aliased): read_file_tree, fs_glob, check_syntax,
  generate_tests, generate_docs, db_inspect, command_policy_check,
  tool_create_shell, shell_status, product_search, github_create_repo,
  image_generate, deep_research, business_logic, chaos_testing, cost_estimator,
  self_confidence, terraform_ops, security_scan_repo.
- None of the 19 exists as an implemented name anywhere in definitions/ or
  registry.ts (exact-name search, zero hits).

## Gap classification (name-stem hypothesis, NOT proven synonymy)
Probable-rename, same-stem registered tool exists (12; each needs contract
comparison before any alias/repair decision):
  shell_status->shell_check_status (KNOWN W73-5, locked again this cycle)
  business_logic->business_logic_parser
  chaos_testing->chaos_test_plan
  cost_estimator->cloud_cost_estimator
  self_confidence->self_confidence_evaluator
  terraform_ops->terraform_manager
  security_scan_repo->security_scanner
  generate_tests->test_generator/auto_tester
  image_generate->image_studio (registered) / generate_image (orphaned def)
  github_create_repo->github_repo_manager (weak hypothesis)
  read_file_tree->inspect_directory (weak hypothesis)
  fs_glob->search_files (weak hypothesis)
No same-stem registered tool (7; stale priority entries or missing
capability; each needs investigation, not blind aliasing):
  check_syntax, generate_docs (swagger_docs is API-docs-only, partial at best),
  db_inspect (db_schema_migrator is a different capability),
  command_policy_check, tool_create_shell, product_search, deep_research.

## Mechanism finding F-086-1 (observability, not repaired this cycle)
selectToolDefsForProvider silently skips unregistered priority names
(tool-picker.ts lines 44-51: `if (t)` with no else/warning), so this drift is
invisible at runtime: priority intent is lost without a log. Recommended
action (backlog, needs ownership before edit): warn-on-skip + periodic
priority/registry reconciliation test. No source edited this cycle; no
competing picker/registry/ToolService change.

## Matrix implication
- 19 names stay PLANNER_INTENT_UNRESOLVED (new precise bucket; subset of the
  broader UNKNOWN). Not yet PLANNER_VISIBLE_NOT_EXECUTABLE: the planner never
  receives these spellings (dropped before the provider call), but may still
  emit these natural spellings, which then have no dispatch path.
- 085 locks untouched and not rerun (no source change since 085; HEAD moved
  only by docs commits 4a009610->da408fc6).
- 084 P4 batch unchanged, still awaiting team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, fresh import this cycle)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (unchanged since 085) DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Contract-compare the 12 probable renames (read-only, one family at a time),
or the next Codex-requested bounded scope. No picker/registry/ToolService
edits without coordinated ownership. P4 + F-086-1 await team review.
