AGENT=MUSE
CONSULTATION_ID=PARALLEL-VERIFICATION-LEDGER-001-MUSE
PROPOSAL=proposals/PARALLEL-VERIFICATION-LEDGER-001.md
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES (base aggregation scope AND expanded 3-contract scope)
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=d5d314a4
MUSE_BRANCH=muse/joe-development
REVIEWED_AT=2026-10-01 (Muse cycle; inspected Muse tree d5d314a4 + shared evidence, no Codex/NVIDIA source edits)
SHARED_FILE_WRITE=DENIED_BY_SANDBOX (absolute path outside workspace); this fallback file is the authoritative Muse review for Codex import. Do not mark shared STATUS changed until Codex imports.

## Independent source verification (Muse tree d5d314a4, api/src/modules/tools/definitions/PhaseExecutorTool.ts)

All three claimed defects REPRODUCE in Muse's own tree by direct source read:

1. SNAPSHOT_OVERWRITE CONFIRMED — line 2237: `verificationLedger = pr.verificationLedger;`
   inside `for (const pr of parallelResults)`. Every Promise.all branch receives the same
   baseline ledger (line 2231) and returns a full snapshot; the loop overwrites in order,
   so an echo/non-verification branch returning the baseline erases a sibling's receipt.
   Ledger module itself (selectVerification/recordVerification/compactVerificationLedger)
   is not the defect site; the defect is orchestration-layer aggregation. Agree with
   NVIDIA/Codex on this placement.

2. DUPLICATE_SCHEDULING CONFIRMED — `detectParallelGroups` (1148-1225) emits a `noDeps`
   group (1166-1172) AND a same-tool group (1208-1222) containing identical stepIds with
   no cross-dedup; `buildExecutionGroups` (1271-1280) pushes EVERY parallel group with
   >1 tasks and marks processed, but never filters already-processed ids when adding a
   subsequent parallel group. Same stepIds therefore execute twice. Confirmed by read;
   consistent with Codex trace (3 quality_run calls vs 2).

3. REQUIRED_STOP_BYPASS CONFIRMED — `executeSingleTask` line 1871:
   `else if (!verificationSelection && (task.priority === 'high' || task.required === true))`.
   A failed verifier HAS verificationSelection, so the required/retry branch is skipped
   and control falls to line 1897 `shouldBreak: false`. Required metadata is bypassed
   exactly as Codex/NVIDIA state.

## Independent evidence verification (shared artifacts, read-only)

- verification/parallel-verification-ledger-20261001/red-results.json: 4 total / 1 pass /
  3 fail — matches claimed 3failed/1passed RED.
- required-failure-red.json: 4 total / 0 pass / 1 fail (1 selected case, 3 unexecuted) —
  matches claimed selected-case RED.
- merge-experiment-results.json: 8/8 PASS, Scope=UNINSTALLED_PURE_MERGE_EXPERIMENT,
  UsesActualLedgerCompaction=true — matches claimed prototype limits (not integration).

## ROOT_CAUSE (Muse statement)

Three linked orchestration-layer defects in PhaseExecutorTool, plus one additional
aggregation defect found by this review:

- R1 duplicate scheduling (detectParallelGroups + buildExecutionGroups, above).
- R2 snapshot-overwrite aggregation (line 2237).
- R3 required-failure stop bypass (line 1871 guard + 1897 fallthrough).
- R4 (NEW, found by Muse): line 2241 `if (pr.shouldBreak) { shouldBreak = true; break; }`
  breaks the aggregation loop EARLY, discarding later settled branches' ledgers/results.
  Even with a merge helper, honoring break before merging all settled branches loses
  evidence. The contract "merge all settled branches before honoring stop" must cover R4.

## PROPOSAL_ERRORS / gaps (not rejections)

- P1: R4 (early break drops settled evidence) is implied by "merge all settled branches"
  but not named as a separate line-2241 defect. Name it and fix it in the same batch.
- P2: lines 2238-2239 (`apiSelection = pr.apiSelection; capabilityDecision =
  pr.capabilityDecision;`) repeat the last-write-wins pattern. The proposal scopes to the
  ledger only. Either extend the merge contract to these two fields or record an explicit
  justification that last-write-wins is safe for them. Do not leave them unexamined.
  (Note line 2240 already merges phaseDelivery via mergePhaseDeliveryEvidence — precedent
  for merge-at-aggregation.)
- P3: Codex's required-stop framing ("executeSingleTask must return shouldBreak=true")
  risks disturbing the delicate failure-recording branches (recoverable/diagnostic/retry
  paths at 1864-1896) whose continue-semantics preserve evidence for self-fix. Prefer the
  group-level alternative below.
- P4: NVIDIA's expanded review cites "line ~1567" for all three sites; actual sites in
  current source are 1148-1291 (scheduling), 1871/1897 (required bypass), 2237/2241
  (aggregation). Cosmetic only; substance of NVIDIA's review is correct.

## SIMPLER_ALTERNATIVES (Muse recommendation)

- A1 (required-stop): do NOT add required-branches inside executeSingleTask's failure
  ladder. Instead, at group level (both sequential loop ~2206 and parallel aggregation
  loop ~2234): after collecting a task/branch result, if `task.required === true &&
  !result.ok` then set shouldBreak AFTER merging/collecting that group's settled
  evidence. One check, both loops, zero disturbance to recording/retry semantics.
- A2 (dedup): two-line-class fix — (a) in buildExecutionGroups, filter pg.stepIds to
  unprocessed ids before forming groupTasks and only push groups with >1 REMAINING
  tasks; (b) in detectParallelGroups, exclude noDeps members from same-tool groups (or
  vice versa — prefer keeping same-tool grouping, it carries more scheduling intent).
  Either (a) alone stops double execution; (b) removes the redundant group at the source.
  Do both; each is independently testable.
- A3 (merge placement — resolves NVIDIA vs Codex-critic disagreement): adopt Codex's
  latest synthesis which this review endorses: a PURE merge function that imports and
  reuses `compactVerificationLedger` (no duplicated cap/normalization logic), called by
  PhaseExecutor aggregation with (baseline, branchLedgers[]). Pure = unit-testable and
  portable (Codex-critic requirement); owned/called at orchestration boundary (NVIDIA
  requirement). Both positions are satisfied; no further placement debate needed.
- A4 (merge contract, endorsed with one addition): baseline captured before Promise.all;
  per-branch deltas relative to baseline; counters baseline+sum(non-negative deltas) with
  saturating overflow + incomplete flag; baseline decisions kept once + branch suffixes;
  no-op branch cannot erase; distinct checkIds preserved; same-check actual failure
  defeats reusable pass; differing passing fingerprints fail closed (drop/mark
  incomplete, never pick a winner); invalidated baseline must not be resurrected by a
  stale no-op branch. ADDITION: cap-eviction cumulative accounting must be asserted by a
  dedicated test (111 executions / 96 retained shape from the prototype) because
  compaction interacts with delta summation non-obviously.

## OVERLAP_WITH_EXISTING_WORK

- Muse ledger work (5900fc94 strict receipt condition / live-env hashing / symlink
  manifest guard; c71f6d81 read-observation function; LEDGER-OBSERVATION review
  conditions at d5d314a4): all ledger-MODULE contracts. This proposal is
  ORCHESTRATION-layer (scheduling/aggregation/stop). No file-level conflict; the merge
  helper must PRESERVE Muse's strict-condition semantics by reusing compaction rather
  than reimplementing receipt comparison. No competing Muse implementation exists or is
  started by this review.
- NVIDIA dirty main (PhaseExecutorTool logging/observation hunks, plan-tools): preserved
  and untouched by this review; the isolated Codex candidate must rebase/reconcile
  against them at integration time, not overwrite. No overlap with NVIDIA's
  IntentParser/PlanningEngine/registry dirty work.
- Codex isolated candidate (ledger/resume V5 + 13 resume tests + 4 parallel tests):
  this proposal extends that scope. Muse accepts REVIEW_OWNER for the installed diff;
  implementation stays CODEX isolated candidate only.

## CONFLICT / REGRESSION RISKS

- C1: Merge helper must never resurrect an invalidated baseline receipt via a stale
  branch snapshot — requires the explicit invalidation test (prototype case exists;
  must become permanent).
- C2: Same-checkId concurrent conflict resolution must fail closed in BOTH directions
  (pass-vs-fail AND pass-vs-pass-different-fingerprint). Pass-vs-pass is the subtle one;
  silent winner-picking would create reusable false PASS.
- C3: Counter overflow path (saturating + incomplete) must be reachable by test, not
  dead code.
- C4: Dedup changes execution COUNT for currently-double-executed steps; any test or
  downstream consumer that accidentally depends on double execution will shift. Run the
  full phase/executor regression surface, not just the new cases.
- C5: Required-stop at group level changes phase outcomes from partial-complete to
  stopped-early for required failures — intended, but AgentLoop/self-fix callers must
  be re-verified against the new stop shape (no silent reinterpretation of stopped as
  completed).
- C6: Dead code `groupTasksForParallelExecution` (defined line 1231, zero callers in
  Muse tree) and dead `visited` set (line 1150) add confusion next to the live path.
  FLAG ONLY — do not delete during this repair (audit rule); remove in a later
  reviewed cleanup with the orphan register updated.

## MAINTAINABILITY / SECURITY IMPACT

- Positive: fix is bounded to PhaseExecutorTool + one pure helper; no ledger-module
  rewrite; no new registries, services, or config.
- Must keep: deterministic merge order (branch index order), no wall-clock or random
  input to merge, no secrets in receipts, fail-closed conflicts.
- The pure helper MUST reuse compactVerificationLedger; duplicating cap/normalization
  logic would create a second ledger truth and a future divergence defect. Review gate:
  reject any installed diff that reimplements compaction.
- Portability: no platform-specific behavior in merge/dedup/stop; safe for
  remote/multi-user (per-run ledgers, no shared mutable state).

## REQUIRED_TESTS (installed source, Codex isolated candidate)

Permanent, red-first where the defect is still open:
- T1 verifier+echo in EITHER order preserves the receipt (2 cases).
- T2 two independent verifications preserve BOTH receipts; each execution counted once;
  nonempty baseline counted once (not per branch).
- T3 failed-first branch retains settled sibling evidence (order-independent).
- T4 same-checkId pass/fail → failure wins (no reusable pass).
- T5 same-checkId pass/pass with differing fingerprints → fail closed (no receipt
  usable as pass; incomplete flagged).
- T6 no-op branch cannot resurrect an invalidated baseline pass.
- T7 cap eviction: cumulative executions retained in accounting while receipts bounded
  (prototype 111/96 shape as permanent test).
- T8 overflow / negative-delta → saturating counters + incomplete flag.
- T9 duplicate scheduling: same stepIds in noDeps+same-tool input execute ONCE
  (gateway call count assertion, not just receipt assertion).
- T10 required=true failed verifier: later groups do NOT execute; settled group
  evidence IS collected (assert both halves).
- T11 required=true in SEQUENTIAL groups stops subsequent groups (A1 covers both loops).
- T12 existing 43 ledger/phase regressions + 13 resume cases + 4 parallel cases GREEN.
- T13 full AGENTS gates: guard:architecture, guard:package-scripts,
  test:joe:engineer-flow, all test:self-fix:* + test:self-healing:* suites,
  tsc --noEmit, api build. (Per AGENTS.md — planner/phase/self-fix/ToolService change.)
- T14 engineer-flow + self-healing negative suites on installed source (required-stop
  changes stop shapes; C5).
- No test weakening: the 3 parallel RED + required RED stay failing until the fix; the
  merge prototype's 8 cases must be re-expressed as permanent installed tests, not
  cited as passing evidence while uninstalled.

## REAL_JOE_UAT (required before integration; currently BLOCKED)

BLOCKED by: (a) official :5002 backend-refresh authorization still unanswered;
(b) provider/LLM outage evidence in recent Muse run30-32 (429s at planning).
When unblocked, on authorized :5002 runtime with the installed fix:
- U1: fresh unseen prompt producing parallel verification+non-verification tasks in one
  phase → both receipts present in run evidence; phase completes honestly.
- U2: fresh unseen prompt with a required verification that fails → later phase work
  stops; settled evidence visible; Joe reports stopped (not completed, not silent).
- U3: changed-source resume after U1-shape run → fresh execution recorded (no stale
  reuse), unchanged checks reused with ledger-reuse log.
- Direct PhaseExecutor calls, mocked planners, and the merge prototype do NOT satisfy
  U1-U3. No main merge, no GitHub-hash claim, no product PASS until U1-U3 pass with
  independent verification.

## OWNERSHIP / DECISION (TWO_AGENT_CONTINUITY record)

- IMPLEMENTATION_OWNER=CODEX (isolated candidate only; atomic batch: dedup + merge +
  required-stop + R4 break-order; no main writes).
- REVIEW_OWNER=MUSE (installed-diff review; this file is design review, not installed
  acceptance). ROLE_ACCEPT=YES for installed-diff review.
- CRITIQUE=NVIDIA (independent; baseline + expanded positions already recorded, no
  fabrication; NVIDIA placement preference satisfied by A3).
- INTEGRATION_OWNER=CODEX only after T1-T14 + U1-U3 + actual installed reviews from
  Muse and NVIDIA + current-main observation-hunk reconciliation.
- CODEX_REVIEW_ON_RETURN=REQUIRED (Codex authored the proposal; an independent
  Codex-critic pass on the installed diff is required in addition to worker reviews).
- REVERSIBLE=YES (isolated candidate; no main/production action authorized here).

## CONDITIONS (why APPROVE_WITH_CHANGES, not APPROVE)

1. Fix R4 (merge all settled before break) in the same atomic batch.
2. Resolve P2 (apiSelection/capabilityDecision overwrite) by merge or recorded
   justification.
3. Implement required-stop at group level (A1), not inside executeSingleTask branches.
4. Merge helper reuses compactVerificationLedger (reject duplicated normalization).
5. T1-T14 permanent and green on installed source before any integration proposal.
6. No main merge / API refresh / production action authorized by this review.

## LIMITS OF THIS REVIEW

- Source inspection: Muse tree d5d314a4 (PhaseExecutorTool.ts lines cited) + shared
  proposal/consultations/verification JSONs. Codex isolated candidate source and
  NVIDIA dirty PhaseExecutor hunks were NOT re-read line-by-line this cycle; prior
  reconciled hashes and NVIDIA's own attribution are relied on for those.
- No tests executed by Muse this cycle for this review; test evidence cited is
  Codex-produced shared artifacts verified for counts only (see above).
- This review covers design + expanded scope. Installed-diff ACCEPT requires a
  separate review of the actual installed patch.
- CRITICAL human commands (REAL-JOE-UI-001 + DEEP-CAPABILITY-WIRING-AUDIT) retain
  priority; this consultation consumed the safe checkpoint without starting any
  competing implementation. No Muse/NVIDIA/Codex work was modified, stopped, or
  restarted for this review.
