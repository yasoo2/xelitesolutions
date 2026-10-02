# WIRING CHECKPOINT 107 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=847b807b (exact; tracked clean before evidence writes;
api/src + web/src byte-identical to e0c72936 — intervening
commits docs/evidence only)

## Scope: planner-catalogue vs registry reconciliation (NEW slice)
Team summary claims a fixed "curated 41-tool catalogue" with 32
tools intentionally not planner-visible. Muse-lineage source shows
a RETRIEVED catalogue instead (toolCatalog.ts: selectToolsFor,
limit=30 + forced CORE_TOOLS, deterministic IDF/token scoring +
AR lexicon). This batch measures planner visibility empirically
on exact HEAD bytes.

Method: isolated tsx process, canonical test env
(api/src/__tests__/setup.ts), pure scoring — zero tool
execution, zero network, zero writes. 12 diverse goals
(EN+AR: REST/db, i18n/RTL, SEO/links, AR links, tests/fix,
deploy, terminal, AR translate, responsive/a11y/checkout,
docs/OpenAPI, git/PR, perf/db). First launch failed EPERM on
tsx temp (sandbox); reran with TEMP/TMP/TMPDIR scoped to
tmp/sbx-tmp-107 — same probe bytes, EXIT 0. No source edited;
probe run left ZERO tracked modifications (verified via git
status/diff after run). Probe:
tmp/team-consultation/muse-107-catalogue-probe.ts; receipts:
muse-107-catalogue-probe.stdout.log/.stderr.log (same dir).

## Result: 7/7 PASS, EXIT 0
- Q0a-registered-count: registered=163 (re-observed;
  "Registered 163 tools (71 revived)" in probe log). PASS.
- Q0b-core-registered: all 9 CORE_TOOLS registered,
  missing=0. PASS.
- Q1-no-phantoms: every offered name ∈ registeredToolNames,
  phantoms=0 across all 12 catalogues. PASS — planner answers
  are checked against the registry (toolCatalog.ts:228) and
  the offered set is consistent with it.
- Q1b-union-coverage: union=107 distinct tools offered across
  12 goals; never_offered=56 in THIS sample. Pinned (info).
- Q2-limit-honored: all 12 catalogues ≤30
  (sizes 30,27,30,30,30,30,16,30,30,30,30,23). PASS.
- Q3-core-present: all 9 core tools present in EVERY
  catalogue (force-add branch works). PASS.
- Q4-retrievable-universe: 127 tools score >0 on ≥1 goal;
  36 score 0 on all 12. Pinned (info).

## Headline: fixed-41 claim REFUTED for Muse lineage
A single-goal cap (30) is real, but planner visibility is
goal-DEPENDENT, not a fixed list: 12 goals already union 107
distinct offered tools (>41), and 127/163 score >0 on at least
one goal. "REGISTERED_NOT_PLANNER_VISIBLE=32" cannot stand as
a Muse-lineage constant — the correct statement is
UNION≥107 (lower bound; 12-goal sample) with 56 unobserved,
not proven unreachable. Recommend the team summary carry the
retrieved-catalogue model for Muse lineage.

## OBS-107-1 (info): zero-score core tools are rescued by design
6 core tools (read/write/edit/delete/search×2) score 0 on all
12 goals yet appear in every catalogue via the CORE_TOOLS
force-add (toolCatalog.ts:208-212). The design works as
documented; no defect.

## OBS-107-2 (info): echo is planner-invisible in this sample
`echo` is registered but zero-score + never-offered: no goal
retrieves it and it is not core. Consistent with passthrough-
utility status (106 used it as a dispatch probe, not a planner
choice). No repair proposed (audit mode).

## OBS-107-3 (info): never-offered sample leans internal/orchestrator
The 56 unobserved names include project_planner,
phase_executor, ambiguity_resolver, multi_agent_debate,
self_confidence_evaluator, monitoring, alert/cache/template
managers, todo_write, file_edit_advanced — plausibly
INTERNAL_ONLY_BY_DESIGN or goal-sample gaps (e.g. no security
goal was offered to security_scanner). NOT classified
orphaned: 12 goals cannot prove unreachability. A wider goal
battery is the next step if the team wants the union closed.

## Verdict
- No new SIGNIFICANT findings. One team-summary correction
  (fixed-41 → retrieved, union≥107). No repairs (audit-first;
  coordinated ownership).
- 084 P4 + all F/OBS items 086-107 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-106 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106; this checkpoint adds catalogue
  reconciliation + OBS-107-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 107 probe log)
PLANNER_UNION_OBSERVED=107 (12-goal sample; lower bound, NOT a fixed list)
PLANNER_RETRIEVABLE_SCORE_GT0=127 (same sample)
PLANNER_UNOBSERVED_SAMPLE=56 (not proven unreachable)
PLANNER_PHANTOMS=0 (12/12 catalogues)
FIXED41_CLAIM=REFUTED (Muse lineage retrieves; union already 107)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
READ21_R1_CLOSED=21/21 (5 write in 080 + 16 read in 104/105)
FIREWALL_R2_CLOSED=YES (106: 6/6 probe PASS, EXIT 0)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DUPLICATE=2 relationships (unchanged)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7 (probe, untracked-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Wider goal battery to close the planner union, or the next
Codex-requested bounded scope, or F-106-1 ownership/repair
proposal at a coordinated checkpoint. No registry/ToolService/
tool edits without ownership.
