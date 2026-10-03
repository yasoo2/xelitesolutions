# Wiring reconciliation probe — SUMMARY (Muse c212, 2026-10-03)

MUSE_HEAD=4d005cdae17987b39f614e8aa6e95cb300f8e2cd (tracked clean; zero source delta)
SCOPE=Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (source-level wiring, planner/tool behavior)
METHOD=disposable jest probe (source preserved in probe-source.txt), 45-goal EN/AR corpus, 2 runs byte-identical
EVIDENCE_SHA256=8DBFD5BA6A20734BF7046E34119C952D06962DD46261A4C1A0BE8AA3361FE021 (reconciliation.json)
RUNTIME=2x jest PASS (~21.9s each), workspace-local cache (system Temp EPERM under sandbox)

## Proven counts (Muse HEAD, exact bytes)

- REGISTERED_TOOLS=163 (matches prior Muse census; corroborated again)
- STATIC_PLANNER_CATALOGUE=40 (plan-tools.ts PLANNER_TOOL_CATALOGUE, ProjectPlannerTool prompt surface)
- STATIC_DEAD=0 (all 40 registered directly; zero alias-mediated, zero duplicates)
- CORE_TOOLS=9/9 registered (central_answer, read_file, write_file, file_edit, delete_file, inspect_directory, search_files, search_text, shell_execute)
- TOOL_ALIASES=28
- RETRIEVED_UNION=158/163 surfaced at least once across the 45-goal corpus (PlanningEngine/adaptive prompt surface, limit 30/goal)
- NEVER_SURFACED_IN_CORPUS=5 (see below)
- PER_GOAL_RETRIEVED_MIN=9 (at least one goal collapsed to core-only) / MAX=30 (cap hit)

## The 5 planner-prompt-invisible candidates

cloud_cost_estimator, self_confidence_evaluator, ask_user, rss_fetch, task_lifecycle

Each is: registered (executable) + absent from the static 40 + never retrieved in 45 diverse goals.
Notable: ask_user (the user-interaction tool) and rss_fetch (whose siblings http_fetch/html_extract DID surface).
Classification: PARTIALLY_WIRED candidates (planner-invisible through both prompt surfaces on tested bytes).
NOT proven orphaned: plan-repair may still accept an exact invented name, and capabilityRoute deterministic
paths were not covered this cycle. Owner repair lane (registry/planner exposure) stays with NVIDIA; no Muse
source edit made or proposed as a patch.

## What this closes / leaves open (audit questions)

- Q3 registered count: 163 corroborated on Muse HEAD (3rd independent count).
- Q4 planner-visible: BOUNDED — 40 always-visible (static) + up-to-30/goal retrieved; union 158/163 over corpus.
- New concrete matrix input: 5 planner-invisible candidates + proof that the static 40 contain zero dead names
  on Muse HEAD (contrast with the dirty-tree visual_qa gap previously found: gate-accepts-but-execution-fails).
- Open: per-goal pick recording (which goal collapsed to 9), broader corpus, capabilityRoute coverage,
  execution-path proof for the 5 (do they run if named?), NVIDIA-tree reconciliation (read-only; owner may differ).

## Reproduce

1. Copy probe-source.txt to api/src/__tests__/zz-repro.probe.test.ts (untracked; delete after).
2. cd api; set TEMP/TMP to a workspace tmp dir (sandbox blocks system Temp).
3. npx jest src/__tests__/zz-repro.probe.test.ts --cacheDirectory=<workspace-tmp>\jest-cache
4. Expect [WIRING-RECONCILE] line + tmp/wiring-reconcile-20261003/reconciliation.json with the SHA above.
