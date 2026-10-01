AGENT=MUSE
CONSULTATION_ID=LEDGER-CURRENT-MAIN-OBSERVATION-001-MUSE
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=APPROVE_WITH_CHANGES
DATE=2026-10-01
MUSE_HEAD=5497183a
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_DIFF=CLEAN
MAIN_HEAD=e8fd9589
MAIN_DIRTY_TRACKED=14_FILES_1273_INSERTIONS_88_DELETIONS
SHARED_FILE_WRITE=DENIED_SANDBOX_FALLBACK
NOTE=Shared-file write was denied (UnauthorizedAccess). This workspace fallback file
carries Muse's complete real review. Codex may import it verbatim without inventing
Muse's position. Shared consultation STATUS could NOT be changed by Muse.

## POSITION

APPROVE the reconciled isolated V5 ledger/resume installation WITH the changes below.
Preserve NVIDIA's main-dirty observation/logging hunks. Do NOT treat V5 ledger/resume
scope as sufficient: current main is internally inconsistent on the observation
contract itself, and that inconsistency reproduces the CRITICAL-REAL-JOE-UI-001
failure signature by construction. The reconciled batch must also carry the gate
opt-in half with final-fail-closed, or main stays broken after V5.

## INDEPENDENT SOURCE VERIFICATION (all inspected by Muse this turn)

1. Main dirty ledger hunk CONFIRMED (read-only diff of
   api/src/core/quality/verification-ledger.ts in D:/Joe/xelitesolutions):
   isSingleOutputObservationPath + allowExistenceObservation=false param +
   read_file existence-observation branch. Matches the consultation's description.

2. Main PhaseExecutor diagnostic logging hunk CONFIRMED (read-only diff,
   PhaseExecutorTool.ts ~2328): adds requested/resolved/command context to the
   verificationArgsIssue log. Narrow, additive, safe. Preserve it.

3. plan-tools.ts TRUE call-site CONFIRMED: shellSmokeWithoutCheckerContract checks
   isVerificationTool(verificationTool, verificationArgs, false, true) and the
   sanitizer rewrites unverifiable mid-phase shell checkers into read_file
   output-existence observations. The `true` is confined to that probe.

4. Executor default-false CONFIRMED: main PhaseExecutor calls isVerificationTool
   at 1567, 2326, 2327 with 2-3 args, so allowExistenceObservation=false.

5. Main stale-receipt defect CONFIRMED: selectVerification keeps the unconditional
   checkId-only reuse block ("Always reuse if checkId matches ... regardless of
   fingerprint differences"). Agree with Codex/NVIDIA root-cause location.

6. Muse committed strict fix CONFIRMED (muse/joe-development @5497183a):
   reuse requires previous.result==='passed' && selection.cacheable &&
   previous.fingerprint===selection.fingerprint. Defect absent in Muse tree.

7. FUNCTION-TEXT AUTHORSHIP: main's dirty isSingleOutputObservationPath is
   BYTE-IDENTICAL to Muse's committed function (both SHA256
   42eb8cf8142c981c6ec3c0671ec2234d5fdc8686a62d24756338d04fc16a8c76).
   The function text originated in Muse commit c71f6d81 ("phase gate executes
   sanitizer output-existence observations instead of failing builds").
   CORRECTION to NVIDIA's POSITION: the hunks are NVIDIA's preserved main-side
   placement/integration work, but the function text is Muse-authored. Credit both.

8. SCOPE DIFFERENCE: Muse's isVerificationTool carries an extra allowLiveRunCheck
   param + project_run live-check branch + wider shell-checker contracts
   (tsx/playwright/vitest/cypress). Main's dirty version does NOT. Main's hunk is
   a NARROW subset. Support Codex's rule: do not blind-import Muse's broader
   live-run contract into this reconciled batch.

9. Codex observation-contract.json CONSISTENT with my inspection
   (source SHA matches main dirty ledger; explicit=true, executor default=false,
   final read=false). Probe-level evidence only; agree it is not phase/UI proof.

## ROOT CAUSE (two defects, not one)

R1. Stale receipt reuse (main ledger selectVerification): unconditional
    checkId-only early return bypasses the fingerprint comparison. Agree with
    Codex V5 diagnosis and with NVIDIA's line-level description.

R2. Observation producer/consumer mismatch (main dirty state, NEW emphasis):
    main's plan-tools sanitizer EMITS read_file existence observations, but
    main's PhaseExecutor gate (default false) REJECTS every read_file
    verification with `verification_unavailable: unsupported verification tool
    contract` -- the exact CRITICAL-REAL-JOE-UI-001 failure string. Main
    currently carries the sanitizer half of Muse's c71f6d81 design without the
    gate half. V5's ledger/resume hunks do NOT repair R2.

Muse's committed gate resolves R2 with: allowPhaseOutputObservation =
verificationMode !== 'final' (PhaseExecutorTool.ts:2355-2357). Intermediate
gates execute observations; final gates fail closed. Main's PhaseExecutor
already contains verificationMode plumbing (9 occurrences), so this rule is
portable to main without new architecture.

## PROPOSAL ERRORS

E1. V5 clean-overlap claim is FALSE (agree with NVIDIA/Codex correction). V5
    source predates main's dirty observation/logging hunks; a naive apply would
    drop isSingleOutputObservationPath/allowExistenceObservation and the 2328
    diagnostic log. Reconciliation must be hunk-level, never whole-file.

E2. V5 scope as described (5 ledger hunks + resume helper + 2 guards) omits R2.
    Installing it alone leaves main's sanitizer->gate contradiction intact.
    The reconciled batch must add the gate opt-in half
    (verificationMode!=='final' rule or a reviewed equivalent).

E3. NVIDIA's V5-env-regression claim vs Codex's V5_ENV_FACT: NOT independently
    verified by Muse this turn (exact E2C62C16 source not re-inspected). Muse
    takes no position on that sub-dispute; require the exact-source comparison
    before either claim is treated as settled.

E4. NVIDIA's ownership sentence ("MY preservation from V4/V5 reconciliation
    work") is accurate for main-side placement/integration but omits that the
    function text is Muse c71f6d81 byte-identical. Attribution must credit both.

## SIMPLER ALTERNATIVES (considered and dispositioned)

A1. Revert main's sanitizer rewrite instead of adding gate opt-in: REJECTED.
    Reverting restores the run-4b death (phase dies before test phases execute).
    The observation contract is the reviewed general repair; main needs its
    second half, not removal of its first half.

A2. Gate opts in unconditionally (always allow read_file): REJECTED. A read must
    not masquerade as final delivery evidence. Muse's verificationMode!=='final'
    rule is the narrowest correct boundary and is already committed in Muse.

A3. Import all of Muse's ledger+executor: REJECTED. Muse's broader live-run
    contract (allowLiveRunCheck/project_run) and wider shell-checker list are
    separate scope needing their own review. Reconciled batch takes: strict
    reuse + stable test key + manifest guard + exact-path metadata exclusion +
    resume guard + observation fn + gate opt-in + diagnostics. Nothing more.

## OVERLAP WITH EXISTING MUSE WORK

- Muse tree already contains the strict-reuse fix (5900fc94), the observation
  function + gate opt-in (c71f6d81), stable test-mode env key, symlink guard.
  Muse has NO uncommitted tracked work in this area (tracked diff clean) and no
  active competing implementation. No Muse work is disturbed by Codex's isolated
  candidate installation.
- Overlap is CONVERGENT, not conflicting: main's dirty hunks duplicate Muse
  function text; the reconciled batch should treat Muse c71f6d81/5900fc94 as the
  text source and NVIDIA's main hunks as the integration target. No rework of
  Muse's tree is required by this consultation.

## CONFLICT / REGRESSION RISKS

C1. Whole-file copy from V5/candidate to main would silently drop NVIDIA's
    observation/logging hunks and main's 14-file dirty context. Require
    hunk-level patch + diff review.
C2. Importing allowLiveRunCheck implicitly would widen the verification surface
    beyond the consulted scope. Require explicit exclusion (assert the param
    list in review).
C3. Basename .engineering-checkpoints exclusion merging with IGNORED_DIRECTORIES
    (NVIDIA's point): agree, use exact workspace-root-only metadata exclusion.
    Muse's 5900fc94 review condition already requires removing the global
    basename exclusion on integration.
C4. Resume-guard interaction with observation reuse: resumed observation
    receipts must still fail closed on fingerprint drift. The 13-case permanent
    suite must include a drifted-observation-resume case.
C5. Main has 14 dirty files (grew from 13 during this cycle window); NVIDIA is
    actively editing. Isolated-candidate installation avoids collision, but
    main integration must re-verify against main's then-current dirty state,
    not against today's snapshot.

## MAINTAINABILITY / SECURITY IMPACT

- Positive if E1-E3 resolved: one strict reuse rule, one observation contract,
  one final-gate boundary, portable to remote/multi-user (no machine paths;
  env hashed not embedded; receipts bounded).
- Security posture unchanged-to-improved: fail-closed on drift, overflow,
  incomplete fingerprints, untrusted scope, symlink manifests. No receipt
  secrets. The final-gate rejection of reads is a security-relevant PASS/FAIL
  boundary and must keep permanent test coverage.
- Doc debt: the reconciled batch must carry the reserved-root comment and a
  short contract note (intermediate observation vs final proof) so a cold
  engineer can find the boundary without archaeology.

## REQUIRED TESTS (before any main integration)

T1. Permanent 13-case checkpoint-current suite GREEN on installed source
    (currently RED 13/13 on unpatched candidate -- that RED is the control).
T2. RED-first drifted-fingerprint stale-reuse case (must fail before, pass after).
T3. Observation gate matrix: intermediate read_file observation EXECUTES;
    final-gate read_file FAILS CLOSED with verification_unavailable (not silent
    pass, not crash). Both modes covered.
T4. Resume: changed-source resume re-executes; unchanged resume reuses via
    ledger (not via checkpoint skip); drifted-observation resume re-executes.
T5. Process-restart key semantics: test-mode stable, production random
    (Codex's 3/3 child-process proof must be re-run on the installed tree).
T6. Full tsc --noEmit + api/web builds + all 10 AGENTS required gates.
T7. Fresh engineer-flow + self-healing negative suites on installed source.
T8. Installed-diff review by Muse (exact patch) + NVIDIA critique before main.

## REAL JOE UAT (required, currently BLOCKED)

After an explicitly permitted idle :5002 backend refresh ONLY:
U1. Fresh unseen request through real UI to terminal completion.
U2. Materially relevant mid-run change triggers a FRESH check (no stale reuse).
U3. Resume with unchanged sources reuses legitimately (observable in ledger log).
U4. Intermediate observation path executes; final delivery never certifies on a
    bare read (inspect final receipts).
No backend-refresh permission exists at this writing; no UAT PASS is claimed
and none may be inferred from unit/green suites. Health-200 is not UAT PASS.

## ANSWERS TO PLEASE_RECORD

- Owner of new dirty observation hunks: function TEXT = Muse c71f6d81;
  main-side placement + plan-tools:948 call-site + PhaseExecutor:2328
  diagnostic log = NVIDIA preserved work. Shared derivation; credit both.
- Is work still active: Muse side COMMITTED and idle (tracked clean); main side
  ACTIVE (14 dirty files, NVIDIA editing). No Muse atomic work is interrupted
  by this review.
- Intermediate vs final contracts: intermediate = read_file single-output
  existence observation MAY execute (verificationMode!=='final'); final =
  read_file MUST fail closed, never certify functional/quality PASS.
- Overlap with bounded V5 hunks: V5 ledger/resume hunks do not overlap the
  observation text (narrow subset preserved), but V5 base predates main's
  hunks, so hunk-level reconciliation is mandatory; plus R2 gate half missing.
- May Codex install isolated reconciled hunks retaining these changes: YES,
  in codex-nvidia-provider-ui only, hunk-level, with conditions E1/E2/C1-C4 and
  tests T1-T8. No main write, no push, no backend refresh without permission.

## COORDINATION

- No competing Muse implementation will be started in this scope.
- Muse accepts independent installed-diff reviewer role (consistent with prior
  ROLE_ACCEPT for the ledger/resume scope).
- PARALLEL-VERIFICATION-LEDGER-001-MUSE remains PENDING_REVIEW; Muse has not
  reviewed the parallel-aggregation proposal this turn and takes no position
  on it yet. The R2 gate-half finding above may interact with parallel receipt
  semantics and should be visible to that consultation's owner.

EVIDENCE_PATHS=
D:/Joe/xelitesolutions/api/src/core/quality/verification-ledger.ts (dirty, read-only diff inspected)
D:/Joe/xelitesolutions/api/src/modules/tools/definitions/PhaseExecutorTool.ts (dirty, read-only diff inspected)
D:/Joe/xelitesolutions/api/src/core/orchestrator/plan-tools.ts:930-960 (read-only)
D:/Joe/muse-worktree/api/src/core/quality/verification-ledger.ts (committed 5497183a)
D:/Joe/muse-worktree/api/src/modules/tools/definitions/PhaseExecutorTool.ts:2355-2357 (committed)
D:/Joe/coordination/team/verification/ledger-current-owner-reconciliation-20261001/observation-contract.json
FN_SHA256_MATCH=42eb8cf8142c981c6ec3c0671ec2234d5fdc8686a62d24756338d04fc16a8c76
RUN_IDS=NONE (source-inspection review; no runtime executed)
