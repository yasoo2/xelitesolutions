# Muse consultation response — OBSERVATION-NO-TOOL-005-MUSE
AGENT=MUSE
CONSULTATION_ID=OBSERVATION-NO-TOOL-005-MUSE
TARGET_COMMIT=2c44c72b49b8d95435bd557447ed0416af726d7f
TARGET_BASE=5f82fdee4c407536150da1c9711a3cb92dbb74bc
CANDIDATE=D:/Joe/worktrees/codex-observation-output-20261001
MUSE_HEAD=cdf920f9
UPDATED=2026-10-01 (independent inspection this cycle at exact 2c44c72b, tree verified clean)
SHARED_FILE_WRITE=ACCESS_DENIED (verified this cycle; shared file left PENDING_REVIEW for Codex verbatim import)
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES (owned helper delta approved subject to F1/F2 below; consumer routing NOT accepted — 3 FAILs correctly remain NVIDIA-owned)
RECOMMENDATION=APPROVE_WITH_CHANGES

## 1. Scope verification (exact diff 5f82fdee..2c44c72b)
- 3 files, +88/-2, tree clean at 2c44c72b, branch codex/observation-output-contract.
- Owned source: api/src/core/intelligence/requested-action.ts +10/-2 only:
  (a) targetedPageObservation (direct page-target URL preserves observation authority),
  (b) globalArabicToolDenial (bare-plural clause-end Arabic prohibition, incl. بدون-forms),
  (c) English noToolExecution widened `no` -> `(no|without)` before `(tool )?execution`.
- 2 new permanent suites, 40 lines each: request-no-tool-authority.test.ts (13 cases),
  observation-output-contract.test.ts (10 cases: 7 helper + 3 actual classifier/parser).
- No classifier/parser/planner implementation touched. Scope claim VERIFIED.

## 2. Independently reproduced evidence (this cycle, exact 2c44 source)
- RERUN: 3 focused suites (request-no-tool-authority + requested-action-authority +
  requested-answer-planner) = 100/100 PASS, EXIT 0, 96.8s. Claim corroborated.
  Receipt: tmp/team-consultation/muse-005-notool-rerun.json/.log (this worktree).
- RED receipt no-tool-red.json: 5FAIL/5PASS on 10 cases — genuine red, confirmed.
- Consumer receipt consumer-routing.json: 7PASS/3FAIL; the 3 FAILs are exactly the
  actual-consumer observation cases (isBrowser=false; project_pipeline; browser_page_fix),
  all consumer-side, none in the owned helper. Handoff to NVIDIA is CORRECT.
- Gate logs read directly: engineer-flow PASSED (terminal lines + trace), missing-name
  PASSED. gates-2c44.json lists 6 gates exit 0; remaining gates (number-to-string,
  argument-coercion, string-to-boolean, self-healing x2) were still running at read time —
  no 10/10 claim is made and none is accepted here. No live UAT claimed or inferred.
- Candidate worktree left untouched: rev-parse still 2c44c72b, status clean after my
  rerun (jest cache + outputs routed to my own worktree).

## 3. Root cause assessment: AGREE
- Global Arabic no-tool phrases and English "Without tool execution" previously did not
  set requiresAnswerOnly; 3 Arabic build requests could retain construction authority.
  The RED (5FAIL) proves the defect; the helper is the correct repair layer since
  IntentParser already consumes the answer-only signal (log shows central_answer routing
  for the 2 actual-consumer no-tool probes, which PASS).

## 4. Two genuine defects found by independent probing (REQUIRED changes)
Probes executed the ACTUAL helper via tsx against exact 2c44 source (scripts + outputs
in tmp/team-consultation/muse-005-notool-probe*.ts; committed-case controls 4/4 match).

F1 — NEW English over-fire: `\bwithout\s+(?:tool\s+)?execution\b` matches
  "without execution delays/errors" (toolless generic use):
  - "Build the app without execution delays." -> isBuild=false (WRONG, kills legit build)
  - "Create a CLI without execution errors." -> isBuild=false (WRONG)
  The `without` alternative is NEW in this diff (old regex had only `no`).
  FIX: require `tool` in the without-branch: `\bwithout\s+tool\s+execution\b`.
  Preserves the committed case (verified: "Create a calculator without tool
  execution." -> {false,true}). ("No execution plan is needed..." also over-fires but
  is PRE-EXISTING via `no (tool )?execution` — adjacent, note for later, not this batch.)

F2 — NEW Arabic under-fire: the clause-end lookahead is defeated by trailing adverbs:
  - "صمم موقعا بدون استخدام أدوات اليوم." (today) -> isBuild=TRUE (WRONG, builds
    despite explicit tool prohibition)
  - "أنشئ حاسبة. لا تستخدم الأدوات أبدا." (ever) -> isBuild=TRUE (WRONG)
  Controls at clause end ("...بدون استخدام أي أدوات." / "...لا تستخدم الأدوات.") hit
  correctly, isolating the mechanism to the `(?=\s*(?:$|[.;؛،!?]))` lookahead.
  FIX: permit a small trailing-adverb allowlist (اليوم/أبدا/ابدا/الآن/فقط...) after the
  bare plural, or replace the end-anchor with a negative lookahead for category nouns
  (المتصفح/...). Either must keep the committed scoped controls green
  ("أدوات المتصفح" singular/plural still build — verified kept).

Neither F1 nor F2 invalidates the committed RED->GREEN; both are bounded same-file
refinements with pinned regression tests owed (see §7).

## 5. Proposal errors / simpler alternatives
- No error in the observation-vs-illustrative-URL distinction: targetedPageObservation
  correctly requires a start-anchored direct target + URL; quoted/proposal URLs stay
  inert (quote-stripping verified in source lines 15-21).
- Simpler alternative considered (end-anchor removal for Arabic): REJECTED as-is —
  it would re-admit the committed scoped controls ("أدوات المتصفح") as global denials.
  The adverb-allowlist (F2) is the minimal correct refinement.
- Simpler alternative considered (revert `without` addition): REJECTED — the committed
  "Without tool execution" case is a real gap; narrowing to require `tool` (F1) keeps
  the fix without the over-fire.

## 6. Overlap / conflict / regression risks
- Overlap: NONE with Muse work (no Muse classifier/parser/helper edits in this area).
  NVIDIA retains classifier/parser/planner consumers — this review grants NO ownership
  change; the 3 consumer FAILs stay NVIDIA-owned. No competing implementation started.
- Regression risk: LOW for the owned delta (2 additive suites, 87 existing regressions
  green in rerun). F1/F2 fixes must re-run the same 100-case battery + typecheck.
- Conflict risk: NONE with frozen 635/5f (separate worktree/branch, untouched).

## 7. Maintainability / security impact
- Maintainability: neutral-positive. Regex additions carry explanatory comments;
  permanent tests pin both directions (global vs scoped vs quoted). F1/F2 fixes must
  keep that discipline (one test per new adverb/false-positive control).
- Security: F2 is the safety-relevant item — a missed global tool prohibition grants
  build authority against explicit user denial. Severity MEDIUM (requires trailing
  adverb phrasing; bare end-position denials are caught). F1 is availability-relevant
  (legit builds refused), not a bypass. No secrets/credentials involved; no provider,
  policy, persistence, or ToolService surface touched.

## 8. Required tests before integration
1. F1 regression: "without execution delays/errors" builds (isBuild=true) + committed
   "Without tool execution" still answer-only.
2. F2 regressions: trailing-adverb Arabic denials (اليوم/أبدا/الآن minimum) answer-only;
   scoped "أدوات المتصفح" still builds.
3. Re-run: 100-case battery GREEN, full API typecheck EXIT 0, then the still-pending
   AGENTS gates on the exact amended commit (no attribution of 2c44 gates to new source).
4. NVIDIA-owned: the 3 consumer observation FAILs must turn green via consumer-side
   correction (classifier isBrowser + parser browser_run routing), reviewed separately;
   helper greens must NOT be cited as consumer PASS.

## 9. Real Joe UAT
- NOT performed, NOT claimed. Official :5002/:5000 both UP this cycle but serving old
  bundles (version=no-commit-file; uptimes 2.5h/33h, predating all candidates), and
  :5002 prompt submission remains provider-gated per 20:43Z evidence. Required later:
  after reviewed integration + authorized exact-source load, submit fresh unseen
  no-tool/observation prompts through the real UI and verify answer-only behavior plus
  preserved scoped/quoted distinctions. Helper PASS ≠ UI PASS.

## 10. Verdict
APPROVE_WITH_CHANGES: the owned helper repair is real, minimal, scope-clean, and its
claimed 100/100 is independently reproduced; the 3 consumer FAILs are correctly
handed to NVIDIA, not papered over. F1 (without-execution over-fire) and F2
(Arabic trailing-adverb under-fire) are proven with mechanism and bounded fixes that
preserve all committed greens — both must land with pinned tests before integration.
No main/runtime adoption, no consumer acceptance, and no capability-superiority claim
follow from this review.

## EVIDENCE PATHS
- Candidate: D:/Joe/worktrees/codex-observation-output-20261001 @ 2c44c72b (clean)
- Diff: 5f82fdee..2c44c72b requested-action.ts + tests (inspected)
- Receipts: team/verification/observation-output-20261001/{no-tool-red,no-tool-2c44,
  consumer-routing}.json, gates-2c44.json, gate-*.log (read)
- Independent rerun: tmp/team-consultation/muse-005-notool-rerun.json/.log (100/100)
- Independent probes: tmp/team-consultation/muse-005-notool-probe.ts,
  muse-005-notool-probe2.ts (F1/F2 + controls)
