# Cycle 258 — exact-source registry/wiring counts (Muse HEAD)

SOURCE_HEAD=182c256ee1b3c4927eff27e4b0c47070fc006407
SOURCE_BRANCH=muse/joe-development
METHOD=tsx import of api/src/modules/tools/registry.ts + plan-tools.ts
  (synthetic test-only JWT_SECRET, no network, no runtime mutation)
PROBE=tmp/c258-reg-probe/probe.ts

## Results (Muse HEAD, exact source)
REGISTERED_TOOLS=163 (71 revived; registry log line corroborates)
WITH_EXECUTE=163/163
UNIQUE_NAMES=163 (0 duplicates; registry throws on dup)
PLANNER_CATALOGUE_LEN=40
CATALOGUE_REGISTERED=40/40
CATALOGUE_NOT_REGISTERED=0
REGISTERED_NOT_PLANNER_VISIBLE=123 (163-40; static set difference)
DEFAULTED_PERMISSIONS=21 (business_logic_parser, chaos_test_plan,
  compliance_validator, cloud_cost_estimator, ambiguity_resolver,
  multi_agent_debate, self_confidence_evaluator, project_planner,
  central_answer, web_page_builder, form_inbox, echo, shell_check_status,
  ask_user, json_query, alert_manager, cache_manager, monitoring,
  project_state_manager, request_analyzer, template_manager)
DEFAULTED_RATE_LIMIT=2 (central_answer, web_page_builder)
UNKNOWN_PERMISSIONS=0

## Cross-corroboration
The 21/2 default counts EXACTLY match NVIDIA's independent runtime
observation (ToolRegistry 21 tools defaulted permissions, 2 defaulted rate
limits). Same registry code, two agents, static + runtime legs agree.

## Scope limits (honest)
- LEVEL 2 (registration) + catalogue-overlap evidence only.
- execute() presence is static; per-tool dispatch/execution NOT proven here.
- FULLY_WIRED/PARTIALLY_WIRED/ORPHANED counts remain UNKNOWN (need
  per-capability path tracing + runtime experiments per audit standard).
- Counts are Muse-HEAD specific; main/NVIDIA-dirty counts need separate
  provenance (NVIDIA owns main-side verification/CLI scopes).

## Related checks this cycle
- smoke-verification-rewrite: 5/5 PASS (Muse HEAD)
- guard:architecture: PASS; guard:package-scripts: PASS
- :5002/:5000 both UNREACHABLE (no listeners) — Real Joe UAT BLOCKED,
  restoration owned by Codex/human.
