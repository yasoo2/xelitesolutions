# Wiring reconciliation probe — SUMMARY (Muse 2026-10-04, HEAD e1b01c16)

MUSE_HEAD=e1b01c16d8335ed7e65f7c82cfd34970531995f6 (tracked clean before this evidence; zero Joe source delta)
SCOPE=Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (source-level wiring, planner/tool behavior)
METHOD=tsx probe (probe-registry.ts, committed; runner-independent re-implementation of the c212 jest probe),
same exact 45-goal EN/AR corpus, same static-catalogue/alias reconciliation. Evidence: reconciliation.json.
RUNTIME=tsx EXIT 0, synthetic random JWT_SECRET (test-only, in-process guard only), workspace-local TEMP.
No provider calls, no servers started/stopped, no NVIDIA writes, no secrets.

## Proven counts (Muse HEAD, exact bytes)

- DEFINITION_FILES=93 (api/src/modules/tools/definitions/*.ts)
- REGISTRY_IMPORTED_DEF_MODULES=92; NEVER_IMPORTED=1: react-app-templates.ts (exports no *Tool class — benign template module)
- REGISTERED_TOOLS=163 (4th corroboration; runtime import, names unique, 0 missing-name entries)
- REGISTERED_WITH_EXECUTE=163, WITH_DESCRIPTION=163, WITH_INPUTSCHEMA=163
- DEFAULTED_PERMISSIONS=21, DEFAULTED_RATELIMIT=2, UNKNOWN_PERMISSIONS=0 (registry self-report)
- STATIC_PLANNER_CATALOGUE=40 (PLANNER_TOOL_CATALOGUE), DUPES=0, DEAD=0, VIA_ALIAS=0
- CORE_TOOLS=9/9 alive; TOOL_ALIASES=28
- RETRIEVED_UNION_45=158/163; NEVER_SURFACED=5 (same set as c212)
- PER_GOAL_MIN=9 / MAX=30; COLLAPSED_GOAL='Remember my preferences for later' (core-only)

## Independent second method (static structure vs runtime)

Top-level baseTools entries: 63 direct `new` + 26 createTool() + 1 bare (ArchitectTool)
+ ...MemoryTools (2) + ...revivedTools (70 safeNew + 1 TodoWriteTool = 71) = 163.
Static structure count EQUALS runtime registered count exactly. No hidden/duplicate path.

## Replication vs c212 (HEAD 4d005cda)

All counts IDENTICAL (163/40/28/158, same 5, same 9/30 bounds). git diff 4d005cda..HEAD
over registry.ts + plan-tools.ts + toolCatalog.ts + definitions/ is EMPTY, so identical
results are expected; the replication proves runner-independent determinism (jest -> tsx),
not new product behavior. No wiring change on the Muse line between the two HEADs.

## The 5 planner-prompt-invisible candidates (unchanged)

ask_user, cloud_cost_estimator, rss_fetch, self_confidence_evaluator, task_lifecycle

Registered + executable + absent from static 40 + never retrieved in the 45-goal corpus.
Per c225, targeted retrieval DOES surface all 5 (vocabulary-brittle, not orphaned).
Classification input for JOE-CAPABILITY-WIRING-MATRIX: PARTIALLY_WIRED (planner-prompt
visibility gap), NOT ORPHANED. Repair-lane ownership stays with NVIDIA; no Muse patch.

## New vs c212 (what this cycle adds)

1. L1 definition-file coverage: 93 files / 92 imported / 1 benign gap (react-app-templates.ts).
2. Registered-tool contract presence: 163/163 execute+description+schema; 21/2/0 defaults.
3. Per-goal pick recording (c212 follow-up): full perGoal map in reconciliation.json;
   collapsed goal identified ('Remember my preferences for later').
4. Static-structure second method: 63+26+1+2+71=163 matches runtime exactly.
5. Runner independence: tsx reproduces jest results byte-for-value on identical sources.

## Limits (do not over-claim)

- Muse-HEAD-scoped only; NVIDIA dirty tree may differ (owner reconciles).
- Retrieval is corpus-bound (45 goals); capabilityRoute deterministic paths not covered here.
- Execution-path proof (ToolService dispatch per tool) not covered; registry presence + execute()
  presence is necessary, not sufficient, for EXECUTABLE.
- No product PASS; both CRITICALs remain OPEN.

## Reproduce

1. cd api; set JWT_SECRET to any random test-only value; set TEMP/TMP under workspace tmp.
2. node_modules/.bin/tsx ../tmp/wiring-audit-20261004/probe-registry.ts > raw.txt 2> err.log
3. Extract between __EVIDENCE_JSON_BEGIN__ / __EVIDENCE_JSON_END__; compare with reconciliation.json
   (note: PowerShell `>` writes UTF-16; decode accordingly).
