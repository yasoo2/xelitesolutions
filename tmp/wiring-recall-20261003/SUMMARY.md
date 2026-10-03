# Adversarial-recall probe — SUMMARY (Muse c225, 2026-10-03)

MUSE_HEAD=c41b6996 (tracked clean at probe time; zero Joe source delta)
SCOPE=Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (planner/tool retrieval behavior)
METHOD=disposable tsx probe (PROBE-recall.ts; pure retrieval scoring + registry reads; no execution/network/providers), 2 runs byte-identical
EVIDENCE_SHA256=4E6F770487CB821188AC8020E5040D8633881CC4610648B1F5BAC8F47BF3FBAB (adversarial-recall.json; pass1 copy identical)
RUNTIME=2x tsx PASS; synthetic JWT env (config gate); workspace-local TEMP (system Temp EPERM under sandbox)
NOTE=jest path unusable in this env (ts-jest cannot load typescript module despite api/node_modules/typescript present); tsx used instead. Disposable jest probe removed; no suite impact.

## Question

c212 found 5 registered tools never surfaced across a 45-goal corpus.
Are they orphaned — or merely niche (retrievable under matching goals)?

## Result: 9/10 adversarial goals recall their target at rank 1-2

| target | goal 1 | goal 2 |
|---|---|---|
| cloud_cost_estimator | rank 1 (13.2) | rank 2 (12.2) |
| self_confidence_evaluator | rank 1 (7.0) | ABSENT (0.0) — stem miss, see below |
| ask_user | rank 1 (6.2) | rank 1 (19.3) |
| rss_fetch | rank 1 (16.2) | rank 1 (10.0) |
| task_lifecycle | rank 1 (9.2) | rank 1 (7.9) |

Negative controls (2 generic goals): all 5 targets ABSENT (rank -1) under both —
the probe discriminates (targets surface only under matching goals, not everywhere).
capabilityRoute: null on all 12 goals (deterministic path shy by design; recorded, not a defect).

## Classification update (Muse HEAD, exact bytes)

- cloud_cost_estimator, ask_user, rss_fetch, task_lifecycle: NICHE-BUT-WIRED
  (registered + rank-1 retrievable under matching goals + absent under generic
  goals). The c212 "never surfaced" label was a corpus-coverage artifact, now
  corrected with positive evidence. NOT orphaned.
- self_confidence_evaluator: WIRED-BUT-BRITTLE. Recalled rank 1 on the
  exact-vocabulary goal ("Evaluate your confidence...") but scores 0 on the
  natural paraphrase ("How confident are you...") because retrieval has no
  stemming: term 'confident' is not a substring of name/tags/desc
  ('confidence'). Goal-2 top-5 matched 'code' instead (dead_code_detector 5.3,
  codebase_outline 4.7, ...). Concrete retrieval vocabulary-brittleness
  instance, evidenced end-to-end (terms + scores + winners).
- Design note (no owner decision made): ask_user (blocking user interaction)
  and task_lifecycle (agent-loop UI status) are agent-loop-internal in spirit
  yet catalogue-exposed with no exclusion list (selectToolsFor filters only on
  name+description presence). INTERNAL_ONLY_BY_DESIGN candidacy is an owner
  decision; current state is documented as exposed-and-retrievable.

## What this closes / leaves open (audit questions)

- Q4 planner-visible: BOUNDED FURTHER — all 5 c212 candidates are retrievable;
  0 remain planner-invisible on tested bytes. No proven orphans in this set.
- New concrete matrix input: 4x NICHE-BUT-WIRED + 1x WIRED-BUT-BRITTLE with
  a named mechanism (stem mismatch confident/confidence).
- Open: retrieval stemming/synonym improvement (planner/retrieval owner lane;
  no Muse patch per audit-first + ownership); NVIDIA-tree reconciliation;
  execution-path proof already exists for all 5 (c220/c222: 5/5 dispatch YES,
  10/10 Level-4 resolved).

## Reproduce

1. cd D:\Joe\muse-worktree; set TEMP/TMP to a workspace tmp dir.
2. set JWT_SECRET=<any synthetic value> (satisfies shared/config gate; no auth performed).
3. node api/node_modules/tsx/dist/cli.mjs tmp/wiring-recall-20261003/PROBE-recall.ts
4. Expect [ADVERSARIAL-RECALL] line + tmp/wiring-recall-20261003/adversarial-recall.json
   with SHA256 4E6F7704...FBAB (registry 163; Muse HEAD c41b6996).
