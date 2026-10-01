# Muse wiring checkpoint 068 — intent-classification fan-out (from exact review)
MUSE_HEAD=2c480ed3
DATE=2026-10-01
SCOPE=intent-classification wiring edges (evidence harvested during REQUESTED-ACTION-CANDIDATE-001 exact review; no new test runs for this checkpoint)

## New capability node (Codex candidate 7832da83, isolated tree)
- api/src/core/intelligence/requested-action.ts: pure predicate hasRequestedAction (no imports).
  Imported-by (verified): intent-classifier.ts (hasBuildStructure delegation), PlanningEngine.ts
  (additive answer-only guard). Tested-by: 3 permanent suites (22+6+5).
  Wiring: predicate->planner-delegation CONNECTED; predicate->classifyIntent-ordering and
  predicate->IntentParser.parse NOT connected (retained NVIDIA scope; 5/5 FAIL pins the gap).
  Post-commit WIP drift observed (uncommitted, read-only): build-first reorder + parser
  answer-only block expand into retained files — flagged in review, not silently adopted.

## looksLikeBuild fan-out (verified static, candidate tree == baseline for these files)
PlanningEngine.looksLikeBuild == isBuildRequest.isBuild (PlanningEngine.ts:279-280).
Static call sites in PlanningEngine.ts: lines 569, 1048, 1078, 1084, 1283, 1528, 1795, 1853,
2068, 2342, 3179 (alias), 3278, 3315, 3341 (14 sites incl. alias).
Direct isBuildRequest users: PlanningEngine.looksLikeBuild, IntentParser.quickIntent,
IntentParser.parse. hasBrowserStructure also consumes hasBuildStructure (classifier:73-76).
PlanningEngine does NOT call classifyIntent directly (verified: zero call sites).
Consequence (proven by 21-failure regression set): hasBuildStructure behavior change
propagates to capabilityPlan routing, quickIntent fast path, and scope decisions.

## Classification delta
- intent-classification family: PARTIALLY_WIRED (predicate connected via delegation + guard;
  ordering/parser consumers disconnected; rework R1-R6 prescribed in
  REQUESTED-ACTION-CANDIDATE-001-MUSE.response.md).
- No global count changes claimed by this checkpoint (totals remain last-reported/UNKNOWN).

## Method note (evidence integrity)
- Candidate-tree jest runs hit sandbox EPERM on default TEMP; reran with TEMP/TMP redirected
  to workspace tmp + --cacheDirectory in workspace. Candidate tree received ZERO writes
  (verified via git status before/after; only pre-existing Codex WIP dirt observed, untouched).
- Baseline A/B done via bytes-exact git-show materialization in node (PowerShell string
  round-trip corrupts Arabic patterns — verified failure mode, corrected mid-review).
