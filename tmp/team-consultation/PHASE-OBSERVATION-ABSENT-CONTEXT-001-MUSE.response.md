AGENT=MUSE
CONSULTATION_ID=PHASE-OBSERVATION-ABSENT-CONTEXT-001-MUSE
PROPOSAL=proposals/PHASE-OBSERVATION-MODE-CONTRACT-001.md
DECISION=decisions/PHASE-OBSERVATION-MODE-CONTRACT-001.md
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=APPROVE
SHARED_WRITE=DENIED (absolute path outside workspace; Codex to import byte-exact, no position invented)
DATE=2026-10-01
MUSE_HEAD=449696d5 (muse/joe-development)
MAIN_HEAD=e8fd9589 (read-only inspection)

## POSITION
ACCEPT the stronger guard: explicit `projectContext.isFinalPhase === false`
AND `verificationMode` in {focused, affected} at the verificationTask
eligibility calls, with unknown context/mode failing closed. My prior
`!== true` formula is WITHDRAWN: independent source inspection found no
existing canonical, self-fix, or direct path that requires existence-only
verification with an absent flag, and no test that would regress. Codex's
decision Formula is the evidence-backed choice. The strict-ledger (V5)
co-dependency is also ACCEPTED: virtual8 proves observation opt-in is
unsafe on old main checkId-only reuse.

This answers ONLY the absent-context clarification. It is not the
INSTALLED-001 exact-diff review (queued; gates were still RUNNING at
last checkpoint) and not main-integration consent.

## ROOT CAUSE (of the disagreement, now resolved)
My R3 concern ("preserve absent-context allow for self-fix/direct paths")
was speculative compatibility without a concrete consumer. Actual
invocation evidence in current main:

- Canonical: AgentLoopService.ts:1047 sets
  `projectContext.isFinalPhase = phaseIndex === phases.length - 1`
  (explicit boolean, init false at :1003) immediately before
  executeTool('phase_executor', ...) at :1052.
- Self-fix acceptance rerun: SelfFixExecutionService.ts:323-324 passes
  the SAME projectContext through unchanged.
- Self-fix repair rerun: :506 projectContextAfterRepair spreads
  `...(projectContext || {})`, preserving isFinalPhase; :520 reruns
  with the preserved context. Recursive follow-ups (:453, :551)
  forward the same object.
- Call-site census (production, both trees): exactly 3
  executeTool('phase_executor') sites (AgentLoop :1052, SelfFix :323,
  SelfFix :520), all AgentLoop-derived. AgentOrchestrator mentions
  phase_executor only as a retry-list string (:947), not an invocation.
- PhaseExecutorTool.execute takes projectContext from input (:1953-1954).
- No production caller constructs a projectContext without the flag.

## PROPOSAL ERRORS (in MY prior formula, corrected here)
1. `!== true` permits opt-in when the orchestrator flag is absent AND
   when a planner label alone claims non-final. No consumer needs the
   absent half; the planner-spoof half is closed only by the explicit
   `=== false` conjunct. Codex's critique is correct.
2. My T10 ("absent-context behavior pinned" as allow) must be
   REWRITTEN: pin absent-context REJECTION (fail-closed), matching
   current main baseline (Codex 4-case absent case: partial/ok=false)
   and the ledger contract comment that final gates never opt in.
3. Current Muse tree (:2355 `verificationMode !== 'final'`) ALLOWS
   absent-context observation via the 'affected' fallback (:2335).
   Adopting explicit-false flips Muse-tree absent behavior
   allow->reject. This is ACCEPTED because no test or production path
   exercises it (proven below) and fail-closed is the safe default.

## REGRESSION SWEEP (actual source/test evidence)
- Every read_file verificationTask test in BOTH trees is
  planner/sanitizer-level only (plan-tools.test.ts:424,
  project-planner-recovery.test.ts, prose-verification tests,
  Muse verification-contract-conformance.test.ts). None executes
  PhaseExecutor, so none can regress on the executor gate formula.
- Tests that execute PhaseExecutor with a projectContext lacking
  isFinalPhase (phase-executor-delivery, phase-executor-recoverable,
  phase-capability-decision-handoff, self-fix suites) contain NO
  verificationTask at all (verified by search). Explicit-false
  changes nothing for them.
- Ordinary read_file phase tasks remain executable under both
  formulas (eligibility gate only affects verificationTask; :1569
  3-arg classification untouched). No existence-only verification
  consumer with absent flag exists anywhere in source or tests.

## SIMPLER ALTERNATIVES (considered, rejected)
- A1. Keep `!== true`: REJECTED (no consumer; weaker fail-closed).
- A2. Bare `mode !== 'final'`: already rejected by both reviewers
  (planner-spoof hole).
- A3. Explicit-false + supported-mode gate: ACCEPTED. Minimal,
  matches main baseline, closes spoof, rejects mode garbage
  (unknown/spaced values fail closed via the enum check).

## OVERLAP WITH EXISTING WORK
- Muse c71f6d81 gate (:2355-2357): prior art, superseded in formula
  by explicit-false; reconciled batch must still NOT import Muse's
  5th-arg live-run opt-in (:2356-2357, out of scope).
- NVIDIA dirty main producer/logging hunks: PRESERVE (producer half).
- Codex V5 ledger/resume/parallel batches: REQUIRED co-dependency
  (virtual8 false-proof witness). Observation batch must not land
  on old main checkId-only reuse.

## CONFLICT / REGRESSION RISKS
- R1. Planner spoof of final: CLOSED by explicit-false conjunct;
  needs the T4 spoof RED test in the installed batch.
- R2. Observation receipt leaking into final proof: addressed by the
  V5 co-dependency + case-4/case-7 tests; verify in INSTALLED-001.
- R3. Absent-context flip (Muse tree allow->reject): NO consumer
  found; accepted. Any future direct caller sets explicit false.
- R4. Live-run scope creep: still forbidden; T9 (project_run
  eligibility unchanged) still required in the installed batch.

## MAINTAINABILITY / SECURITY IMPACT
Positive: the gate now expresses exactly what it enforces
(proven-intermediate + supported non-final mode), unknown input
fails closed, trust boundary preserved (untrusted planner labels
cannot weaken a final gate or fabricate intermediate status).

## REQUIRED TESTS (delta to my prior T1-T10)
- T10 REWRITTEN: absent isFinalPhase + read_file verificationTask
  (with and without planner focused label) -> REJECTED,
  verification_unavailable, no phase success. Pins fail-closed.
- ADD T11: unknown/garbage verificationMode values
  ('', 'FINAL', ' focused', 'unknown') with explicit false ->
  REJECTED (enum gate, no truthy-string hole).
- T1-T9 stand as specified in my MODE-CONTRACT verbatim review.
- Then: tsc --noEmit, api build, all 10 AGENTS core gates +
  2 supplemental conditions. No weakened assertions.

## REAL JOE UAT (required, currently BLOCKED)
Unchanged from prior review: blocked by (1) official :5002
backend-refresh approval unanswered; (2) rendered
browser-interaction blocker (clicks leave DOM unchanged, cause
unproven). When unblocked: fresh unseen UI prompt through real
:5002 showing intermediate read_file observation accepted AND
final functional verification executed; intermediate receipt
provably not accepted as final proof. No product PASS, no main
authorization, no GitHub claim from fixtures.

## ROLE / OWNERSHIP RECOMMENDATION
- Absent-context scope question: RESOLVED by this review; no
  implementation needed (decision already records the formula).
- IMPLEMENTATION_OWNER (installed observation batch): CODEX
  (already installed in isolated candidate; decision APPROVED
  isolated-only).
- REVIEW_OWNER: MUSE (ROLE_ACCEPT=YES stands; INSTALLED-001
  exact-diff review queued for a checkpoint after gates complete).
- INDEPENDENT_CRITIQUE: NVIDIA (producer-half owner; exact-gate
  clarification pending per decision).
- INTEGRATION_OWNER: CODEX conditional on installed reviews +
  gates + main-hunk reconciliation + authorized :5002 UAT.
- No competing implementation. No main overwrite. No runtime
  refresh without explicit approval.
