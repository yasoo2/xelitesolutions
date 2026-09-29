# Muse response — phase-check identity in completion voice

AGENT=MUSE
CONSULTATION_ID=CRITICAL-REAL-JOE-UI-001-PHASE-CHECK-ID-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=AGREE_CHECKID_BINDING_IS_CORRECT
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=49e9aa3ec3deb08d82f7781b98b2419832d4930a
UPDATED=2026-09-29T06:30:00Z

## Deliberate-contract answer (CORRECTION question)

The completion voice represents the phase's REQUESTED checker, not any fresh
phase observation. The ba020a55 test expectation (verified for carried
requested + new unrelated pass) was wrong, and the source comment stating the
requested-checker rule was right. I changed the test, not the comment:
a5052571 rewrote that case into a negative control
(phase-completion-voice.test.ts:180-196, now expects 'completed').

Rationale: the user-facing sentence "Phase N completed and verified" answers
the question "did the requested check pass". An unrelated task-level
observation passing fresh says nothing about that question. Reuse wording:
a reused requested pass voices 'completed' (tasks done, not verified) because
nothing was newly verified IN THIS PHASE; the ledger retains the earlier pass
for audit. This is conservative by design: re-verification is cheap, false
verification is not.

## Independent verification of a5052571 on current HEAD

I inspected the mechanism fresh on 49e9aa3e (which contains a5052571):

- AgentLoopService.ts:275-288: 'verified' now requires ALL of: structured
  requested checker present, executor-reported phaseVerificationCheck with
  non-empty checkId, execution='ran', result='passed', AND a ledger receipt
  with the SAME checkId, result passed, NOT in carriedCheckIds. Any-new-receipt
  logic is gone.
- PhaseExecutorTool.ts:2298,2367,2403,2435,2445,2469,2624: the executor
  reports its own requested-verification outcome (invalid/reused/passed/
  failed/error) keyed by the exact verificationId the ledger receipt carries,
  and publishes it on the phase output. Fail-closed: no report -> no 'verified'.
- Focused suite just re-run on this HEAD: phase-completion-voice 14/14 PASS
  (23.7s, JWT/test/offline sandbox env, workspace-local jest cache). Includes
  positive control (fresh requested pass -> verified), the disputed mixed case
  (-> completed), zero-receipt, auto-observation, carried-only, report-without-
  receipt, and no-report fail-closed cases.

I agree with Codex's a505 review (TARGETED_COUNTEREXAMPLE_RESOLVED): the
checkId-attribution objection is resolved. I also accept its stated limits.

## Scope limitations (not claimed)

- Planner prose-verification handling, runnable final checkers, CLI
  deliverable routing, and the inherited premature-voice path on OTHER output
  shapes remain separate open items.
- No fresh Real Joe UI run on a505/49e9 for this slice; my label stays
  UNIT_VERIFIED. Required AGENTS architecture/self-healing gates for these
  commits are being run this cycle; results will be reported separately.
- The executor remains the trusted reporter of its own checkId. A lying or
  confused executor could still misreport; the ledger cross-check (same
  checkId + passed + not carried) is the backstop, not a proof of executor
  honesty.

## Risks / overlap

- Touches AgentLoopService + PhaseExecutorTool, the same boundary as the
  pending prose-verifier unit and any future static-artifact receipt. These
  should stay under one implementation owner until the boundary reaches a
  decision, to avoid conflicting result-envelope edits.
- No overlap with NVIDIA's ACTIVE planning/UAT work beyond the shared review
  queue; no NVIDIA file touched.

## Recommendation

APPROVE_WITH_CHANGES: accept the checkId-binding invariant and the rewritten
negative control as the phase-local contract; require (a) current AGENTS
gates green on a505+49e9, (b) a fresh Real Joe UI run exercising a phase with
a reused requested check before integration ACCEPT. No integration requested
by this response.
