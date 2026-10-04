# Muse F1 follow-up review — exact amended Arabic denial bytes

AGENT=MUSE
CONSULTATION_ID=CODEX-ARABIC-AUTHORITY-F1-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=F1_CLOSED_EXACT_BYTES_VERIFIED__69_OF_70_RERUN__GATES_AND_BUILD_RECEIPTS_VERIFIED__C2_C5_STILL_GATE_INTEGRATION
RECOMMENDATION=APPROVE
REVIEW_DATE=2026-10-04
MUSE_HEAD=07ecab34 (muse/joe-development; verified this cycle via git log)
MUSE_BRANCH=muse/joe-development
CANDIDATE=D:\Joe\worktrees\codex-readonly-browser-20261004 (detached f40 + 21 copied dirty files + arabic delta + F1 amendment)
SHARED_WRITE=DENIED (expected: absolute shared path outside workspace; this fallback stands for verbatim import)

## Scope actually inspected (read-only; no candidate/NVIDIA/main writes, no runtime control)

- candidate-arabic-f1-source.json (8 pins) + owned-arabic-f1-authority.patch (cumulative).
- Current requested-action.ts guard sites (both) + full function flow lines 86-349.
- Current arabic-authority-constraints.test.ts (10 cases).
- Owner logs: arabic-f1-red.log, arabic-f1-focused.log, arabic-f1-gate-results.json,
  all 10 gate logs (tails of engineer-flow + self-healing-success read in full),
  arabic-f1-build.log + arabic-f1-build-result.json.
- Independent byte verification script: tmp/codex-arabic-f1-review/verify-f1-pins.cjs.
- Independent 4-suite jest rerun on exact bytes (CWD/cache/TEMP redirected to
  muse-worktree scratch; zero candidate-tree writes, re-proven by post-run pins):
  tmp/codex-arabic-f1-review/muse-rerun-f1-70.log.
- Independent 15-case probe (9 assert + 1 shape + 5 observe) on exact bytes:
  tmp/codex-arabic-f1-review/probe-f1.test.ts, muse-probe-f1.log.
- Standing: NVIDIA HEAD re-confirmed f40f6100 read-only this cycle.

## Byte verification — amendment is exactly what was requested, nothing more

- 8/8 F1 pins match current candidate bytes.
- requested-action.ts: current minus the two literal `وصف\s+فقط|` insertions
  (exactly 2 occurrences, one per explicitArabicDenial site) hashes to
  3BCF65EF... == pre-F1 pin. The ONLY source change is the two insertions.
- arabic test: current minus the one new case line hashes to F7B333D1... ==
  pre-F1 pin. The ONLY test change is the one pin case.
- Both guard sites confirmed carrying وصف\s+فقط (site 1 effective, site 2
  unreachable defense-in-depth per base-review R2 — still true, harmless).
- Post-run re-hash: 8/8 pins unchanged. My runs wrote nothing to the candidate.

## What I independently verified GREEN on exact amended bytes

1. F1 case `وصف فقط ثم ابني متجر` now denies (denial:true/aff:false). F1 CLOSED.
2. Bare `وصف فقط` denies; all 9 prior arabic cases still pass (10/10 suite).
3. Independent 4-suite rerun: 69 passed / 1 failed / 70 total (exit 1 only from
   the known inherited failure). Matches owner 69/70 exactly.
4. Sole failure is the inherited English Recording case
   ('Record expenses with amount, category, date'), same test, same assertion
   as base review. No new failure introduced by F1.
5. RED provenance genuine: arabic-f1-red.log shows the new case failing
   aff:true/denial:false pre-fix with the other 9 filtered (skipped), matching
   the consultation's description.
6. Positive controls hold (no overreach): both Arabic explain-then-build cases
   stay affirmative; EN negative-constraints build stays affirmative; EN and AR
   quoted denials stay affirmative (quote-awareness preserved).
7. Mtime chain coherent RED->FIX->PIN->GATES->BUILD: test 16:13Z, red 16:20Z,
   source fix 17:12Z, pins 17:13Z, first gate 17:17Z, last gate + build 17:50Z.
8. All 10 gate receipts exit 0 with PASS verdicts (engineer-flow full 9-check
   PASS incl. tasks.ts repair; self-healing-success PASSED). Owner receipts
   verified, not independently rerun (same standard as base review).
9. Build exit 0, dist 5.8mb. No global-denial weakening: change only ADDS
   denials in the fail-closed direction for the bare-وصف subset.

## Method notes for the team (reusable)

- Running candidate jest with CWD inside the candidate tree crashes with EPERM
  on api/logs/application-*.log for non-owner users (winston DailyRotateFile,
  path is CWD-relative). Fix: run from a writable scratch CWD with
  --config <candidate>/api/jest.config.js; do NOT use --rootDir override (it
  breaks rootDir:'src' + preset resolution and yields babel import errors).
- Tee-Object log capture writes UTF-16; read back with -Encoding Unicode or
  use Out-File -Encoding utf8.

## Non-blocking boundaries observed (same class as base R1; record, do not gate F1)

- B1: definite-article `الوصف فقط ثم ابني متجر` stays AFFIRMATIVE (not covered).
- B2: imperative variant `صف فقط ثم ابني متجر` stays AFFIRMATIVE (not covered).
- B3: punctuation `وصف فقط، ثم ابني متجر` DENIES (covered, good).
- B4: R1 diacritized `بدون تَنْفِيذ` still affirmative via explain-then-build —
  unchanged, still open as recorded in base review.
- B1/B2/B4 are unlisted-shape fail-open boundaries of the pre-existing
  subset-design, not regressions (pre-F1 behavior identical). A follow-up
  normalization/coverage scope may close them; not required for this delta.

## Root cause / proposal assessment

- Root cause of F1 (base review) confirmed again by RED log: bare وصف فقط set
  isAnswerOnly but explicitArabicDenial omitted it, so the affirmative
  build-verb+container path overrode the denial. Fix addresses the exact cause
  at the exact guard. No proposal error found; no simpler alternative exists
  (one alternative regex per site is already minimal).
- No overlap with Muse work (review only, no implementation written or
  planned). No conflict/regression risk beyond the assessed fail-closed
  subset: only inputs containing bare وصف فقط change outcome, toward denial.
- Maintainability/security: +2 regex alternatives + 1 test; no new authority,
  no new execution path, no secret/config handling. Negligible impact.

## Required tests / Real Joe UAT

- Focused: 4-suite 70-case matrix (done, 69/70 both sides) + 15-case probe
  (done, 15/15) + 10 gates + build (owner receipts verified).
- Full typecheck on amended bytes: NOT re-verified this cycle (base v2 full
  type had 8 pre-existing diagnostics in verification-contract-gaps.test.ts;
  F1 touches no types — regex literal + test case — but the receipt was not
  re-read here; owner may cite arabic-v2 type log only as unchanged-scope
  evidence, not as amended-byte proof).
- Real Joe UAT: Codex-owned after integration (C5). Not attempted here.

## Conditions update (base C1-C5 + F1)

- F1 (وصف فقط): CLOSED by this review.
- C1 (gates+build on amended bytes): PASS RECEIPTS present and verified 10/10
  + build. Independent gate rerun not done; focused 70 independently rerun.
- C2 (inherited failures disposition: Recording + commerce + type): still OPEN.
- C3 (21-file re-manifest at integration): still owed; integrate
  dirty-preserving, never whole-tree copy.
- C4 (Muse re-review of integrated bytes): REQUIRED, not done.
- C5 (source-bound loading + official5002 UAT): REQUIRED, Codex-owned.
- RECOMMENDATION=APPROVE covers the F1 amended bytes only. Integration of the
  candidate remains gated on C2-C5. No competing implementation. No UAT
  attempted. NVIDIA live lane preserved, untouched.
