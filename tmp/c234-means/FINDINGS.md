# C234 MEANS-map audit slice — full enumeration (Muse HEAD 9df7dd8e)

SOURCE_HEAD=9df7dd8e9185245e69e7b24ab2a509a4e2a702a5 (muse/joe-development, tracked clean at start)
DATE_UTC=2026-10-03
PROBE=tmp/c234-means/means-probe.mts (committed; read-only, resolves names, executes no tools)
RESULT=tmp/c234-means/probe-result.json (100 keys x direct+contains resolutions)
SCOPE=Muse lane (planner/tool behavior, source-level wiring). Zero NVIDIA-scope edits.
Precedent: c233 sampled 5 MEANS routes; this cycle enumerates all 100 keys + 27 targets.

## Method

- MEANS entries extracted from plan-tools.ts:127-163 source text (map is module-private).
- Runtime: tsx import of plan-tools.ts + registry with synthetic process-local
  JWT_SECRET + MOCK_DB=true (test-startup precedent; no network/DB touched by
  resolvePlannedTool; no real credentials).
- Per key: resolvePlannedTool(key) [direct] + resolvePlannedTool("my <key> setup")
  [contains-branch].
- Registry observed at import: 163 tools (71 revived) — matches c233/c106.

## Counts (runtime, exact-source bound)

- MEANS_KEYS=100, DISTINCT_TARGETS=27, REGISTERED=163, CATALOGUE=40
- DANGLING_TARGETS=0 (every MEANS target is registered; :247/:250 guards hold)
- DIRECT_HIT=98/100 resolve to the MEANS target with how=meaning
- CONTAINS_HIT=98/100 ("my <key> setup" reaches the MEANS target via meaning)
- GAP_VISIBLE_VIA_MEANS=5/123 (all 5 verified members of the c233 gap list):
  docker_manager<=docker; kubernetes_ops<=kubernetes; terraform_manager<=terraform;
  github_actions<="github actions"; ci_generate_pipeline<=ci,ci/cd
- The other 118 gap tools have NO MEANS route (exact/alias/normalised/nearest only).

## M-1 (benign): 'bash' shadowed by alias -> terminal_manager

- Direct: bash -> terminal_manager how=alias (NOT shell_execute).
- Mechanism: TOOL_ALIASES bash (ToolService.ts:245) wins at plan-tools.ts:234-235,
  before the meaning branch (:247). MEANS bash->shell_execute (:134) is dead text
  for the direct path. Contains probe ("my bash setup") DOES reach shell_execute.
- Behavior delta: one-shot shell_execute vs privileged managed terminal_manager.
  Routing subtlety, recorded; no defect claimed without planner-emission evidence.

## M-2 (benign): 'github actions' resolves via normalised, same target

- Direct: "github actions" -> github_actions how=normalised (:237-238 runs first).
- Same tool as the MEANS target; no behavior delta.

## F-C234-1 (NEW, needs owner disposition): contains-branch first-match-wins
## misroutes "react native" prose -> react_project (web) instead of mobile_builder

- "my react native setup" -> react_project how=meaning.
- Mechanism: Object.entries(MEANS) order — 'react' (:149) precedes 'react native'
  (:155); the :249-253 loop returns the FIRST word whose regex matches, and
  'react' matches inside "react native". Exact key 'react native' still works.
- Impact class: a plan naming a mobile target in prose form gets a React+Vite
  WEB builder. Planner-routing defect lead; NOT repaired (audit-first).

## F-C234-2 (NEW, same class): "github actions" prose -> github_repo_manager

- "my github actions setup" -> github_repo_manager how=meaning.
- Mechanism: 'github' (:128) precedes 'github actions' (:159) in first-match order.
- Impact class: CI prose routes to repo manager. Same disposition path as F-C234-1.

## Ownership / overlap

- plan-tools.ts is in NVIDIA's ACTIVE dirty scope (19-file dirty list). Muse
  proposes NO repair here: implementation owner should be NVIDIA (or Codex-coordinated
  after NVIDIA's plan-tools work lands); Muse stays independent reviewer.
- No JOE-* shared audit file modified (Codex hold respected).

## Residuals (explicitly NOT covered)

- 'nearest' fallback branch (:257-258) untested — may surface more gap tools.
- Whether a model planner ever EMITS these MEANS keys (prompt only shows the 40).
- F-106-1, F-C234-1, F-C234-2 await team review/ownership; no repairs (audit-first).

## Appendix: registry default lists observed verbatim at probe import

- permission-defaulted (21): business_logic_parser->read, chaos_test_plan->read,
  compliance_validator->read, cloud_cost_estimator->read, ambiguity_resolver->read,
  multi_agent_debate->read, self_confidence_evaluator->read, project_planner->read,
  central_answer->read, web_page_builder->write, form_inbox->read, echo->read,
  shell_check_status->read, ask_user->read, json_query->read, alert_manager->write,
  cache_manager->write, monitoring->read, project_state_manager->write,
  request_analyzer->read, template_manager->write
- rate-limit-defaulted (2): central_answer, web_page_builder
- Counts identical to c233/NVIDIA observation; names preserved here for the audit.
