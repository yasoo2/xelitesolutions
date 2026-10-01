AGENT=MUSE
CONSULTATION_ID=PHASE-OBSERVATION-INSTALLED-001-MUSE
PROPOSAL=proposals/PHASE-OBSERVATION-MODE-CONTRACT-001.md
DECISION=decisions/PHASE-OBSERVATION-MODE-CONTRACT-001.md
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=REWORK
REWORK_SCOPE=NARROW_TWO_ITEMS_ONLY
SHARED_WRITE=DENIED (absolute path outside workspace; Codex to import byte-exact, no position invented)
DATE=2026-10-01
MUSE_HEAD=5e09dec9 (muse/joe-development, tracked clean at review start)
MAIN_HEAD=e8fd9589 (14 tracked dirty files preserved, read-only)
CANDIDATE=D:\Joe\worktrees\codex-nvidia-provider-ui (read-only review; no source edits, no process stops)

## POSITION
The installed observation batch is SUBSTANTIVELY CORRECT but NOT YET
ACCEPTABLE as installed evidence. Required verdict: narrow REWORK.

Verified good (independent, exact-hash):
- Gate formula is exactly the decided one: explicit
  `projectContext?.isFinalPhase === false` AND resolved mode in
  {focused, affected} (candidate PhaseExecutorTool.ts:2361-2362).
- Install diff vs snapshot is 3 surgical hunks only (10+/5-): `||`->`??`
  mode resolution, the gate + 4-arg eligibility calls, rejected-command
  diagnostics. Ordinary-task classification (:1576, 3-arg) untouched.
- No live-run import: the ONLY opt-in call sites are :2363-2364, 4-arg,
  no 5th allowLiveRunCheck anywhere (full-file census: 1576/2131/2363).
- Byte-exact main test imports verified BOTH directions (main-side and
  candidate-side hashes equal provenance record).
- Reconciled plan-tools/ledger hunks touch only claimed producer/
  evidence functions (sanitisePlanPhases, unprovenProjectCheckIssue,
  verificationEvidenceDetails, isVerificationTool).
- Independent Muse rerun of the CURRENT 29-case suite: 29/29 PASS.
- All 13 installed-gate entries report exit 0 (owner evidence, not
  independently rerun).

Blocking gaps (2, both small):
- R1. T6 / proposal case 5 (traversal/absolute/ambiguous paths +
  missing trusted IDs) has NO batch evidence. Not in the 29-case
  suite, not in the 11-suite regression list. The fixture gateway
  already stubs outside-root rejection but no test triggers it.
- R2. Manifest hash stale for phase-output-observation.test.ts:
  manifest B39D9A28... vs actual A5A63C19... (file changed 08:55:28,
  after manifest 08:41:42 and after all gate logs).

Re-review shortcut: if the ONLY changes are R1 cases + R2 manifest
refresh, Muse re-verifies from hashes + focused log; no full re-review
needed. No UAT/main/GitHub authorization from this review.

## ROOT CAUSE (of R2 staleness, resolved by evidence)
25/26 reviewer-boundary-red at 08:53 failed on `[false, '']` (empty
mode accepted). By elimination the red-time test helper must have
dropped falsy modes (gate was already `??` since manifest 08:41, hash
C4F33E5F proven unchanged): mode '' would otherwise reject. The
08:55:28 edit fixed the helper to pass mode verbatim AND added the 3
new ordinary/parallel/recheck tests (26 -> 29 cases). No green run of
the 29-case file existed in shared evidence until this review: Muse's
independent 29/29 PASS (74s, cache/fixtures redirected to Muse tmp,
candidate source untouched) now supplies it. Post-fix green was
missing, not post-fix red.

## PROPOSAL/DECISION COMPLIANCE (T1-T11 + decision formula)
- T1 intermediate present: PASS (3 mode cases incl. undefined->affected
  fallback, + sanitizer-produced write->read link x2).
- T2 absent output: PASS (honest fail, progression stops).
- T3 final existence-only: PASS (matrix [true,*]).
- T4 planner spoof on orchestrator-final: PASS ([true,focused],
  [true,affected] rejected).
- T5 receipt cannot satisfy final: PASS (same-id pass/fail both
  re-execute quality_run exactly once).
- T6 path/gateway safety: MISSING (R1). No traversal/absolute/
  ambiguous/missing-ID case anywhere in batch evidence.
- T7 functional final: PASS (quality_run pass/fail).
- T8 resume/parallel: PASS (parallel mixed-evidence + changed-output
  recheck; restart contract covered by V5 batch suite in regression).
- T9 project_run unchanged: PASS (explicit non-opt-in case).
- T10 absent-context rejection: PASS ([undefined,undefined],
  [null,focused], [undefined,focused] all rejected).
- T11 garbage modes: PASS ('unknown',' final ','','FINAL',' focused'
  all rejected with explicit false).
- Mode precedence task-over-args: PASS (3 cases incl. ''-poisoning).
- Ordinary final reads execute without becoming proof: PASS.
- Decision formula: implemented EXACTLY (see POSITION). The
  undefined->affected fallback applies ONLY under explicit
  isFinalPhase===false; unknown FLAG still fails closed. This matches
  the ABSENT-CONTEXT-001 decision Muse already APPROVED (separate
  response, hash F3E34C36..., re-validated this cycle, zero drift).

## SIMPLER ALTERNATIVES (considered)
- Accept with T6 waived: REJECTED. Proposal case 5 and Muse T6 were
  explicit; the batch changes the gate through which paths flow.
  The stub already exists; ~4 cases close it.
- Rerun all 13 gates after R1: NOT REQUIRED. R1 touches only the new
  test file + manifest; focused suite + typecheck suffice, then
  manifest refresh. Any SOURCE change voids this shortcut.

## OVERLAP WITH EXISTING WORK
- NVIDIA dirty main producer/logging hunks: reconciled, not
  overwritten (main untouched, verified read-only). Producer-half
  ownership respected.
- Muse c71f6d81 gate: superseded in formula (explicit-false), correctly
  NOT whole-file imported; Muse live-run 5th arg correctly excluded.
- V5 ledger/resume/parallel batches: preserved in candidate; install
  diff additive only. Strict-reuse co-dependency honored (case T5).

## CONFLICT / REGRESSION RISKS
- R1 gap risk if waived: a future path-confusion regression at the new
  gate would have no pin. Close with cases, not argument.
- R2 staleness risk: reviewers/consumers hashing against the manifest
  get a false mismatch on exactly the file proving the batch. Refresh
  immediately after R1.
- No scope-creep risk observed: install diff is minimal and in-scope;
  no second pipeline, no allowlist expansion, no live-run contract.

## MAINTAINABILITY / SECURITY IMPACT
Positive when R1 lands: gate expresses exactly what it enforces,
unknown input fails closed both axes (flag AND mode), trust boundary
preserved (planner labels cannot fabricate intermediate status or
weaken a final gate). Diagnostic logging addition is bounded
(160-char command slice, no credentials). No new attack surface.

## REQUIRED TESTS (to close REWORK)
- R1a. Traversal path (../escape) observation on explicit intermediate
  -> rejected, no read_file call (mirrors existing gateway stub).
- R1b. Absolute path observation -> rejected, no read_file call.
- R1c. Ambiguous/empty path observation -> rejected.
- R1d. Missing trusted IDs (no userId/workspaceId/sessionId)
  observation -> rejected at gateway contract (or documented existing
  gate if the fixture cannot reach it -- then cite the suite).
- Then: focused suite green (expect 33/33), tsc --noEmit, manifest
  hash refresh for the test file. No weakened assertions. No source
  change expected; if one occurs, rerun the 13 installed gates.

## REAL JOE UAT (required, currently BLOCKED)
Unchanged: :5002/:5000 healthy but stale bundles
(version=no-commit-file, uptimes 38621s/65199s); :5101 down; backend
refresh approval unanswered; browser-interaction blocker unresolved.
When unblocked: fresh unseen UI prompt through real :5002 showing
intermediate read_file observation accepted AND final functional
verification executed; intermediate receipt provably not final proof.
No product PASS, no main authorization, no GitHub claim from fixtures.

## ROLE / OWNERSHIP RECOMMENDATION
- REWORK_OWNER: CODEX (R1 cases + R2 manifest, isolated candidate).
- RE-REVIEW_OWNER: MUSE (ROLE_ACCEPT=YES stands; hash+log shortcut).
- INDEPENDENT_CRITIQUE: NVIDIA (producer-half owner).
- INTEGRATION_OWNER: CODEX conditional on re-review ACCEPT + gates +
  main-hunk reconciliation + authorized :5002 UAT.
- No competing implementation. No main overwrite. No runtime refresh
  without explicit approval.

## REVIEW PROVENANCE
- Manifest: verification/phase-observation-mode-20261001/
  installed-source-manifest.json (8 files; 7/8 hash-match, 1 stale R2).
- Snapshot: snapshots/observation-install-20261001-082836 (3 .before
  files + pre-build bundle).
- Independent run: candidate api jest phase-output-observation, 29/29
  PASS, 74.385s, NODE_ENV=test, cache+fixtures under
  D:\Joe\muse-worktree\tmp\joe-muse-review (candidate untouched;
  trailing logger EPERM is sandbox teardown noise, post-result).
- Call-site census + gate formulas re-verified in current main AND
  Muse trees (zero drift vs ABSENT review).
