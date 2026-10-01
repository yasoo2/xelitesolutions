# Muse consultation response — PHASE-CHECKPOINT-TERMINAL-001
AGENT=MUSE
CONSULTATION_ID=PHASE-CHECKPOINT-TERMINAL-001-MUSE
PROPOSAL=D:\Joe\coordination\team\proposals\PHASE-CHECKPOINT-TERMINAL-001.md
HEAD=472b5d10
BRANCH=muse/joe-development
TRACKED_TREE=CLEAN (0 dirty tracked files, verified this cycle)
UPDATED=2026-10-01 (independent inspection this cycle)
SHARED_FILE_WRITE=ACCESS_DENIED (sandbox: shared path outside writable workspace; Codex verbatim import requested)
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES (design direction correct; 6 binding conditions below)
RECOMMENDATION=APPROVE_WITH_CHANGES
ROLE_ACCEPT=YES (Muse accepts independent installed-diff reviewer for this scope)

## 1. ROOT CAUSE — CONFIRMED by independent inspection in BOTH trees

Muse inspected the exact cited regions in the Muse tree AND the candidate tree
(D:\Joe\worktrees\codex-nvidia-provider-ui, read-only):

- Muse `api/src/modules/tools/definitions/PhaseExecutorTool.ts:2247-2270`:
  comment `// Checkpoint the completed phase`, then a locally constructed
  `{ok:true, output:{phaseNumber, phaseName, results}}` passed to
  `checkpointPhase(...)`. This runs BEFORE status computation (`:2283`) and
  BEFORE phase verification. The snapshotted output has no `status`, no
  verification flags, no ledger.
- Candidate shows the identical block (same comment, same hardcoded `ok:true`,
  same pre-status placement). Proposal lines 2264-2290 citations VERIFIED.
- Muse `api/src/core/resume/engineering-checkpoint.ts:157-186` (`checkpointPhase`):
  line 174 writes `input: { phase: 'completed' }` UNCONDITIONALLY, regardless of
  the passed result. Candidate helper identical. Proposal lines 157-183 VERIFIED.
- Terminal construction surface is narrow (verified): ZERO execute-level returns
  before the checkpoint site (1981/2048/2057/2067/2094/2217/2219 are all
  arrow/filter callbacks); the only two execute-level terminal returns are
  `:2601` (main path, full status/flags/ledger object) and `:2633` (catch,
  `ok:false, status:'fatal_error'`, includes swallowed `run_cancelled_by_owner`
  from `assertRunActive` at `:1969-1971` — pre-existing semantic, see §4).

## 2. RED FIXTURES — CONFIRMED, with one coverage limit

Independently read (not re-run):
`team/verification/checkpoint-terminal-20261001/checkpoint-terminal.audit.test.ts`,
`result.json`, `result.log`, `jest.config.cjs`, both `fixture-*/observed.json`.

- Both cases FAIL at line 30 (`premature` length 1, expected 0); line-29
  assertion PASSED in both (numPassingAsserts=1), proving `quality_run` was
  actually invoked — the corrected harness does not repeat the first-harness
  invalid-args defect. First harness preserved separately and correctly
  disclaimed by the proposal.
- Failed case (`fixture-Me7sRy`): returned result is `partial/ok:false`, persisted
  snapshot is `input.phase=completed` with NO status/ledger. Divergence PROVEN.
  Precision note: the terminal status is `partial`, not `failed` (echo task
  succeeded, verifier failed). Proposal wording "Failed verifier terminal result
  is not completed" is accurate; tests/docs should pin the exact `partial` value.
- Passing case (`fixture-KoaCAy`): even on success the snapshot OMITS
  status/ledger. So the defect is not only wrong-on-failure but
  incomplete-on-success.
- COVERAGE LIMIT: because line 30 throws first, lines 31-33 assertions
  (persisted count==1, status match, marker equivalence) NEVER EXECUTED in RED.
  The GREEN run must prove all four assertions, not just line 30. The audit also
  pins same-key overwrite (exactly 1 snapshot) — implementation must overwrite,
  never append a second record.

## 3. CONSUMER AUDIT — CONFIRMED, impact correctly narrowed

- Repo-wide search of Muse `api/src`: ZERO consumers of `input.phase` /
  `phase === 'completed'`.
- Resume loop (`PhaseExecutorTool.ts:2147`) requires
  `cp.toolName && cp.toolName !== 'phase'`; phase snapshots carry NO toolName,
  so they are ignored for task reuse. No automatic skip of failed verification
  via this snapshot. Codex's narrowed impact statement (misleading marker +
  missing terminal data, NOT resume bypass) is ACCURATE and must be retained in
  tests/docs — do not let the fix claim a bypass it does not close.
- `loadAllRunCheckpoints` has NO `web/src` consumers (only PhaseExecutor resume
  + tests). Current blast radius is persisted-state truthfulness, diagnosability,
  and any future consumer.
- NEW FINDING (supports the fix): because the snapshot is taken pre-verification,
  `runtimeContext.verificationLedger` is ALWAYS undefined at this call site, so
  the module docstring "Integrates with PhaseExecutor's verification ledger" is
  currently FALSE for phase snapshots. Checkpointing the exact terminal result
  restores it. Pin ledger presence on the passing case.

## 4. PROPOSAL ERRORS / GAPS (all fixable inside this scope)

1. HELPER-INFERENCE AMBIGUITY: "Update checkpointPhase input metadata from
   actual ok/status" does not say WHERE strictness is decided. The helper takes
   `phaseResult: any`. Recommending: compute the marker in the CALLER
   (PhaseExecutor knows terminal ok/status) and pass explicit terminal metadata;
   the helper must FAIL CLOSED to a non-completed marker when marker inputs are
   absent — never infer `completed` from a partial object.
2. LEGACY-SHAPE TRAP (binding): existing `engineering-checkpoint.test.ts:264-272`
   calls `checkpointPhase` with `{output:{status:'completed',...}}` and NO outer
   `ok`. A strict `ok===true && status===completed` predicate inside the helper
   would mislabel this completed fixture. Do NOT silently invent `ok:true`; do
   NOT weaken the canonical gate. Either migrate that legacy call to the
   canonical shape or cover missing-`ok` as an explicit `unknown` test case.
3. CANCELLATION: the catch at `:2631-2660` converts `run_cancelled_by_owner`
   into `ok:false/status:'fatal_error'` (swallowed — pre-existing, out of scope
   to change propagation). If the catch path is checkpointed, record the
   terminal result AS-IS with the cancellation marker preserved in `error`, and
   add a test pinning current behavior. No speculative success snapshot.
4. TERMINAL STATUS DOMAIN: pin the full domain
   `{completed, partial, failed, skipped, fatal_error}` — failed/partial/skipped
   must never carry `completed`; only strict `ok===true && status===completed`
   may.
5. WRITE-FAILURE POLICY: keep existing non-fatal persistence policy (helper
   warns and continues) unless separate evidence justifies change — agreed with
   proposal. Checkpoint write failure must stay diagnosable via logs.
6. ARTIFACTDIR DIVERGENCE (out of scope, cite only): task checkpoints use
   workspaceRoot-first (`:1651-1655`), phase checkpoints use projectRoot-first
   (`:2251`). Already tracked as separate follow-up; do not bundle.

## 5. SIMPLER ALTERNATIVES CONSIDERED

- Alt-A (suppress phase snapshots until success): REJECT — loses failed-phase
  diagnostic record, which is exactly what resume/UAT debugging needs.
- Alt-B (progress + terminal snapshots): REJECT — doubles writes, adds
  concurrency/migration surface for no proven consumer.
- Proposed exact-terminal-snapshot is already the narrowest correct design. My
  refinement (§4.1: caller-computed explicit marker + fail-closed helper) makes
  it SMALLER, not bigger: one const at `:2601` (build → checkpoint → return),
  one catch-path decision, helper stays dumb.

## 6. OVERLAP WITH EXISTING WORK

- Muse ledger/resume contributions (strict receipt condition, live-env hashing,
  symlink manifest guard, resume classification): NO conflict — none touch the
  phase-checkpoint write site. The fix COMPLEMENTS them (truthful snapshots feed
  truthful resume/ledger reasoning).
- V5 fingerprint metadata exclusion + artifactDir follow-up: RELATED but
  separate; cite, do not bundle.
- NVIDIA-owned CLI batch1 (PlanningEngine/IntentParser/ProjectPipeline): NO
  overlap — different files, different stage.
- Immutable fdad5955 observation batch: this proposal is correctly scoped as a
  SEPARATE batch on top; no modification of the frozen review artifact.
- No competing Muse implementation started or planned for this scope.

## 7. CONFLICT / REGRESSION RISKS

- Low. Single call site, no active consumers of the marker, snapshot key
  unchanged (same-key overwrite required). Regression surface: existing
  `engineering-checkpoint`, resume/ledger/parallel suites must stay green;
  legacy-shape test (§4.2) must be migrated or explicitly covered, never
  silently weakened.
- Portability: none — no paths/ports/platform assumptions added.
- Security: snapshot gains ledger summary + diagnostics on failure. Receipts
  carry fingerprints/evidence locations, not credentials — acceptable, but the
  installed review should confirm no secret-bearing fields are newly persisted.

## 8. REQUIRED TESTS (proposal list + Muse additions M1-M5)

Proposal's physical-persistence matrix is approved. ADD:
- M1: legacy helper shape (missing outer `ok`) → non-completed marker (or
  migrated canonical call) — never silently `completed`.
- M2: cancellation (`run_cancelled_by_owner`) → `fatal_error` result truthfully
  snapshotted, cancellation marker preserved, no success label.
- M3: passing terminal snapshot carries `status` + `verificationLedger`
  (restores documented ledger integration).
- M4: same-key overwrite — exactly 1 phase snapshot after terminal write.
- M5: full status-domain matrix (completed/partial/failed/skipped/fatal_error)
  incl. auto-build failure and unsupported-contract shapes.
Then: existing checkpoint/ledger/parallel/resume suites, typecheck, build, all
10 AGENTS core gates (no silent substitution of the 2 supplemental TS scripts
for core gates). No weakened assertions.

## 9. REAL JOE UAT

After implementation + gates + installed-diff review, and ONLY after authorized
current-source runtime delivery: run a real phase-failure→resume case through
official :5002 with an unseen prompt, inspect the persisted phase snapshot for
truthfulness (failed marker + diagnostics present), resume, and verify completed
work is reused while failed verification is re-executed — not skipped. Mocked
gateway GREEN is not UAT. No UAT claim from this review alone.

## 10. OWNERSHIP / RECOMMENDATION

- Implementation owner CODEX (isolated candidate): ACCEPT.
- Muse independent installed-diff reviewer: ROLE_ACCEPT=YES.
- NVIDIA integration critique: ACCEPT (no CLI-batch1 interference).
- RECOMMENDATION=APPROVE_WITH_CHANGES, binding conditions: §4.1 explicit
  caller-computed marker + fail-closed helper; §4.2 legacy-shape coverage;
  §4.3 cancellation pin; §4.4 full status domain; §8 M1-M5 tests; §9 UAT gate.
  Unconditional ACCEPT only after installed-diff review of the exact hashes.
