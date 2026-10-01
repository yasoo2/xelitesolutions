AGENT=MUSE
CONSULTATION_ID=PHASE-OBSERVATION-INSTALLED-001-MUSE
PROPOSAL=proposals/PHASE-OBSERVATION-MODE-CONTRACT-001.md
DECISION=decisions/PHASE-OBSERVATION-MODE-CONTRACT-001.md
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=REWORK
REWORK_SCOPE=NARROW_REMAINING_ONLY
SUPERSEDES=tmp/team-consultation/PHASE-OBSERVATION-INSTALLED-001-MUSE.response.md @ f0b5c614 (prior REWORK R1+R2, preserved in git history, not discarded)
SHARED_WRITE=DENIED (sandbox: absolute path outside workspace; Codex to import byte-exact, no position invented)
DATE=2026-10-01
MUSE_HEAD=f0b5c614 (muse/joe-development, tracked clean at review start)
MAIN_HEAD=e8fd9589 (14 tracked dirty files preserved, read-only)
CANDIDATE=D:\Joe\worktrees\codex-nvidia-provider-ui (base a0886aa4, read-only review; no source edits, no process stops)

## POSITION
The prior Muse REWORK (R1 T6-cases + R2 manifest) stands and is now
PARTIALLY CLOSED by owner progress observed mid-review. Production source
is UNCHANGED and remains substantively accepted. Remaining narrow rework:
R1b absolute-path pin + R1d missing-trusted-ID pin (or explicit documented
rationale citing the owning suite) + manifest refresh to the final test
hash. No other changes requested. No UAT/main/GitHub authorization.

## MID-REVIEW DRIFT (pinned, not smoothed over)
- Manifest (mtime 06:02:06Z) lists test hash A5A63C19: MATCHED the file
  at review start (prior R2 fixed), then the owner edited the file at
  06:09:27Z DURING this review.
- Current test hash D8F6151B (stable across my independent run, verified
  before+after). Manifest is stale AGAIN for this file only -- expected
  while R1 lands, refresh once after R1b/R1d.
- Production files UNCHANGED, all still match manifest: PhaseExecutor
  71E0CF39..., ledger 341022A1..., plan-tools 108E7638... (re-hashed).
- New it.each block (:68-78): 5 cases -- R1a traversal x2 + R1c
  empty/whitespace/ambiguous. R1b absolute path and R1d missing IDs are
  NOT in the file (full-file grep confirms).

## INDEPENDENT MUSE RERUN (new evidence this cycle)
Candidate api jest phase-output-observation, NODE_ENV=test, cache +
fixtures redirected under D:\Joe\muse-worktree\tmp\joe-muse-review-inst2*,
candidate untouched: 34/34 PASS, 13.44s, hash D8F6151B before+after.
The 5 new R1 cases are GREEN. (Two earlier attempts failed on MY harness:
sandbox TEMP EPERM, then missing fixture parent dir -- both corrected,
no product signal.)

## PRIOR EVIDENCE RE-VALIDATED (zero drift)
- Gate formula exact at :2361-2366 (explicit false AND focused/affected;
  both requested+resolved contracts checked). Ordinary :1576 3-arg and
  checkpoint :2131 2-arg unchanged (direct read). No live-run import
  (full-file grep zero hits). AgentLoop :1003/:1047 explicit boolean;
  SelfFix :330-331 forwards projectContext. Ledger read branch narrow
  (read_file + single-path shape, :772-775).
- Byte-exact main test imports verified BOTH directions (main originals
  equal candidate copies equal provenance record).
- Independently parsed reviewer-final-regression.json: 275/275, 15
  suites, 0 fail (owner run on A5A63C19-era source; superseded by the
  D8F6151B edit for the focused file -- rerun required after R1b/R1d).
- T1-T5,T7-T11 all hold per prior review; T4 spoof matrix and T5 same-id
  re-verified by direct read of current file.

## REMAINING GAPS (the narrow rework)
R1b. Absolute-path observation case missing. R1d. Missing-trusted-ID
case missing (or cite owning suite + rationale). R2'. Manifest refresh
to final test hash after R1b/R1d. G1. Final-source gates: reviewer-
final-gates.json holds 6/13 (build, 2 guards, engineer-flow,
build-context, execution-safety); 7 remaining have no final-source
results. Note: R1b/R1d touch test-only; per prior shortcut, focused
green + tsc + manifest refresh suffice unless a SOURCE change occurs
(none so far -- production hashes unchanged).

## ROOT CAUSE / PROPOSAL ERRORS / ALTERNATIVES / OVERLAP / RISKS
Unchanged from prior review (f0b5c614), re-validated: producer/consumer
mismatch correctly repaired at the right site; no simpler alternative
(A1 revert / A2 bare mode / A3 sanitizer-only all still rejected for the
recorded reasons); NVIDIA producer hunks preserved, Muse live-run
correctly excluded, V5 strict-ledger co-dependency honored (opt-in must
never ride old checkId-only reuse); planner-spoof closed, receipt-leak
closed by T5+strictness, absent-context fail-closed accepted.

## MAINTAINABILITY / SECURITY IMPACT
Unchanged: positive, minimal, fail-closed both axes, no new attack
surface. New R1 cases strengthen the path-shape pin. isSingleOutput-
ObservationPath remains shape-check only; ToolService stays the
authorization boundary (no escape testing by either reviewer).

## REQUIRED TESTS TO CLOSE
R1b + R1d as specified in prior review; then focused suite green
(expect 36/36 if both land as 1-2 cases), tsc --noEmit, manifest hash
refresh. No weakened assertions. Then G1 remaining gates on final
source (or record which are waived-by-test-only with rationale).

## REAL JOE UAT
NOT RUN. Still BLOCKED: :5002/:5000 stale-healthy (no-commit-file),
:5101 down, refresh approval unanswered, browser-interaction cause open.
When unblocked: fresh unseen :5002 prompt showing intermediate read_file
observation accepted AND final functional verification executed.

## ROLE / OWNERSHIP
- REWORK_OWNER: CODEX (R1b/R1d + manifest, isolated candidate; R1a/R1c
  already landed green).
- RE-REVIEW_OWNER: MUSE (ROLE_ACCEPT=YES stands; hash+log shortcut).
- INDEPENDENT_CRITIQUE: NVIDIA installed review still pending per
  TEAM-STATE; Codex subagent bounded ACCEPT read, agreed except it does
  not substitute for NVIDIA or for R1b/R1d/G1.
- INTEGRATION_OWNER: CODEX conditional on re-review ACCEPT + gates +
  main-hunk reconciliation + authorized :5002 UAT.
