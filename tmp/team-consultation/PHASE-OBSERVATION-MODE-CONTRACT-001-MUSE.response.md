AGENT=MUSE
CONSULTATION_ID=PHASE-OBSERVATION-MODE-CONTRACT-001-MUSE
PROPOSAL=proposals/PHASE-OBSERVATION-MODE-CONTRACT-001.md
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=APPROVE_WITH_CHANGES
SHARED_WRITE=DENIED (UnauthorizedAccess on D:\Joe\coordination\team\consultations; Codex to import byte-exact, no position invented)
DATE=2026-10-01
MUSE_HEAD=70f0304c (muse/joe-development, tracked clean)
MAIN_HEAD=e8fd9589 (14 tracked dirty files preserved, read-only)

## POSITION
APPROVE the bounded producer/consumer repair direction (executor-side
intermediate opt-in + strict final gate), WITH CHANGES: the opt-in gate must
give the orchestrator-derived final flag precedence over planner-supplied
mode labels. Bare `mode !== 'final'` (NVIDIA's proposal, identical to my own
c71f6d81 formula) has a real planner-spoof hole. Required gate:

  allow = (projectContext?.isFinalPhase !== true) && (verificationMode !== 'final')

Fail closed on final from EITHER source. No sanitizer change. No ledger
change. No live-run contract import. Implementation owner still unassigned;
Muse ACCEPTS independent installed-diff reviewer role (ROLE_ACCEPT=YES).

## ROOT CAUSE (independently verified in current source, both trees)
Producer/consumer mismatch at the verificationTask boundary, confirmed:
- PRODUCER (main plan-tools.ts:948): sanitizer calls
  isVerificationTool(verificationTool, verificationArgs, false, true) and
  emits read_file existence observations (:951-962 string/prose :1001-1003).
- LEDGER (main verification-ledger.ts:733,773-774): read_file accepted ONLY
  when allowExistenceObservation=true; comment :769-770 already documents
  "Final quality gates never opt in".
- CONSUMER (main PhaseExecutorTool.ts:2326-2327): verificationTask
  eligibility calls isVerificationTool with NO opt-in -> sanitizer-produced
  read_file observations rejected with `verification_unavailable: unsupported
  verification tool contract` -> phase partial, progression stops.
- This is the same sanitizer/gate disagreement family as UI-001 run4b
  (evidence: tmp/uat-critical-ui-run4/RESULT.md "Decisive root cause"), in a
  new shape: the sanitizer half was repaired but the gate half never was.
- FATAL SITE PRECISION: the fatal rejection is at 2326-2327, NOT at the
  ordinary-task classification :1567 (which only affects ledger selection;
  ordinary read tasks still execute). NVIDIA's review centers :1567; the fix
  must cover the :2326-2327 eligibility calls. Codex's critique on this
  point is correct.

## MODE DISCRIMINATOR (actual semantics)
- Orchestrator-derived: AgentLoopService.ts:1047
  `projectContext.isFinalPhase = phaseIndex === phases.length - 1`
  (init false at :1003). Authoritative for actual final phase. Canonical path
  ALWAYS sets an explicit boolean per phase.
- Planner-influenced: PhaseExecutor :2308-2310 resolves verificationMode as
  vTask.verificationMode || verificationArgs.verificationMode || fallback.
  Planner labels take precedence today -- this is the spoof hole: a planner
  'focused' label on the actual final phase would wrongly enable opt-in.
- Ledger mode (:1589/:2310 'final' vs 'focused'/'affected') gates receipt
  classification, NOT existence eligibility. Correct layering: eligibility at
  the executor gate, classification in the ledger.

## ATTRIBUTION CORRECTION (genuine priors, quoted)
- Genuine MUSE prior (LEDGER-...-MUSE-VERBATIM-20261001-064000): executor
  gate opt-in `verificationMode!=='final'` (c71f6d81 :2355-2357),
  "Intermediate gates execute observations; final gates fail closed...
  main stays broken after V5" without it.
- Genuine NVIDIA prior (LEDGER-...-NVIDIA): "The true at plan-tools:948 is
  the ONLY authorized true" -- sanitizer-only opt-in.
- NVIDIA's NEW review reverses these labels ("sanitizer-only (Muse)") while
  substantively ENDORSING executor opt-in + final strictness. Substantive
  convergence with Muse's genuine position is real and welcome; the label
  reversal is an error. No substantive direction dispute remains. No
  agreement on the exact gate formula yet (spoof hole open).

## PROPOSAL ERRORS / GAPS
1. NVIDIA `mode !== 'final'` == Muse c71f6d81:2355 formula: insufficient
   alone (planner-spoof hole + absent-context ambiguity). Requires
   orchestrator-precedence form above.
2. Muse c71f6d81 also passes 5th arg allowLiveRunCheck=true (:2356-2357)
   and Muse ledger has broader live-run contract -- OUT OF SCOPE for this
   batch. Reconciled main batch must import ONLY the existence-observation
   gate, never the live-run contract.
3. Proposal case 4 (intermediate receipt must not satisfy final required
   check) depends on mode-aware ledger fingerprinting (V5 scope). Require
   the test; if it fails, that sub-case rides with the ledger batch with
   an explicit pin, never silently dropped.
4. Ordinary-task :1567 call: leave 3-arg (no behavior change); document why
   (ledger-selection only, executability unaffected).

## SIMPLER ALTERNATIVES (considered)
- A1. Revert sanitizer rewrite: REJECTED (resurrects run4b build-death;
  rewrite behavior is correct).
- A2. Bare mode!==final: INSUFFICIENT (spoof hole, Codex critique valid).
- A3. RECOMMENDED: one-line orchestrator-precedence gate at :2326-2327
  only, fail-closed on final from either source. Minimal diff, no
  sanitizer/ledger/tool changes, matches already-documented ledger
  contract (:769-770).

## OVERLAP WITH EXISTING WORK
- Muse c71f6d81 (:2351-2357 + comment): prior art for the gate half.
  Reconciled batch should credit/adapt it, NOT whole-file import Muse's
  PhaseExecutor (contains broader live-run + diagnostics deltas).
- NVIDIA dirty main hunks (isSingleOutputObservationPath + 4th param +
  plan-tools:948 + logging): producer half + diagnostics. PRESERVE.
- Codex V5 ledger/resume + parallel merge batches: same files, different
  hunks (fingerprint/resume/aggregation). Coordinate sequencing; no
  whole-file overwrite in either direction.

## CONFLICT / REGRESSION RISKS
- R1. Planner downgrades real final gate (spoof): closed by required
  formula; needs explicit RED test.
- R2. Observation receipt leaks into final proof via reuse/parallel/resume:
  needs case-4/case-7 tests; V5 fingerprint dependency explicit.
- R3. Absent-context direct invocations (non-canonical): required formula
  preserves current allow behavior; pin with explicit test, do not
  silently flip to fail-closed (may break self-fix/direct paths).
- R4. Scope creep into live-run contract: forbid via review + assertion
  that project_run eligibility is unchanged by this batch.

## MAINTAINABILITY / SECURITY IMPACT
Positive, minimal: single boolean expression at one gate site, fail-closed
on final, executable through existing ledger/gateway (no new pipeline, no
new allowlist entries, no new attack surface). Trust boundary preserved:
untrusted planner labels can no longer weaken a final gate. Ledger comment
already promises this contract; the fix makes code match docs.

## REQUIRED TESTS (permanent, RED-first against current main)
T1. Intermediate present: sanitizer-emitted read_file observation accepted,
    phase continues (mirrors Codex 4-case harness case 1).
T2. Intermediate absent: observation fails honestly, progression stops.
T3. Final existence-only: read_file verificationTask on final phase
    rejected, no final success.
T4. SPOOF: planner verificationMode='focused'/'affected' on
    orchestrator-final phase (isFinalPhase=true) -> opt-in OFF, rejected.
T5. Intermediate receipt cannot satisfy required final quality/test check.
T6. Traversal/absolute/ambiguous paths + missing trusted IDs still
    rejected at existing gateway contracts.
T7. Functional final verifier (quality_run) still runs and passes;
    failure still stops / one-attempt bounded repair intact.
T8. Resume/parallel aggregation retains observation classification;
    no accidental final-proof caching.
T9. project_run eligibility UNCHANGED by this batch (no live-run import).
T10. Absent-context behavior pinned (documents A3 choice).
Then: tsc --noEmit, api build, all 10 AGENTS core gates. No weakened
assertions. Codex 4-case artifact
(verification/phase-observation-mode-20261001/actual-main-producer-executor.json)
is valid RED baseline, not GREEN proof.

## REAL JOE UAT (required, currently BLOCKED)
BLOCKED by: (1) official :5002 backend-refresh approval unanswered;
(2) rendered browser-interaction blocker unresolved (clicks leave DOM
unchanged, cause unproven). When unblocked: fresh unseen UI prompt through
real :5002 path showing intermediate phase output observed via read_file
AND final phase running functional verification; intermediate receipt
provably not accepted as final proof. No product PASS, no main
authorization, no GitHub claim from fixtures. Muse UAT history: run4b
PARTIAL (correct deliverable, honest stop); runs 31-33 BLOCKED (LLM 429/
quota at planning) -- documented in recent Muse commits, not rerun.

## ROLE / OWNERSHIP RECOMMENDATION
- IMPLEMENTATION_OWNER: CODEX (owns 4-case harness + V5/parallel context),
  bounded isolated batch, single gate site + T1-T10.
- REVIEW_OWNER: MUSE (ROLE_ACCEPT=YES, exact installed diff).
- INDEPENDENT_CRITIQUE: NVIDIA (producer-half owner).
- INTEGRATION_OWNER: CODEX conditional on installed reviews + gates +
  main-hunk reconciliation + authorized :5002 UAT.
- No competing implementation. No main overwrite. No runtime refresh
  without explicit approval.
