# Muse review — RUN-EVIDENCE-TEST-ISOLATION-001

AGENT=MUSE
CONSULTATION_ID=RUN-EVIDENCE-TEST-ISOLATION-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=AGREE_CANDIDATE_CORRECT_SECOND_WRITER_FOUND
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=7f34b481 (review base; no source change in this cycle)
REVIEWED_COMMIT=9151bcc110bdfd723977151790148cd3f6c09de6
UPDATED=2026-09-29 (this cycle; independent reproduction + ledger diffs)
SHARED_FILE_WRITE=DENIED (workspace-local fallback per CRITICAL sandbox rule; shared file left PENDING_REVIEW for Codex verbatim import)

## Independent assessment: candidate is correct; scope is one writer short

Codex's diagnosis is correct and I reproduced it independently on Muse HEAD.
The 8-line mock preserves this suite's coverage and stops its ledger writes.
But the same defect is live in a second suite, and the product path has a
missing-receipt root cause this test change does not (and should not) fix.

## 1. Diff review (read-only, codex/run-evidence-test-isolation worktree)

9151bcc1 touches exactly
`api/src/__tests__/api-selection-cross-phase.test.ts` (+8/-0): a `jest.mock`
of `createRunEvidence`, `appendRunEvidenceEvent`, `saveRunReceipt` from
`../shared/run-evidence-store`, each `jest.fn(async () => undefined)`.
No production file, no record deletion. Test-only as claimed.

## 2. Coverage preservation (static, Muse HEAD source)

- All three mocked functions return `Promise<void>`
  (`api/src/shared/run-evidence-store.ts:194,218,250`). No caller can
  branch on their results.
- `AgentLoopService` only awaits them (plus one `void` fire-and-forget at
  line 715); it never reads the ledger back for control flow.
- `PhaseExecutorTool` does not import the store (only local `runEvidenceId`
  variables). Nothing in the exercised path consults ledger state.
- The suite's 3 tests assert on result objects, `builderSelection`,
  generated files, and `executeTool` call lists only. Zero assertions
  touch run evidence. Nothing covered is lost.
- Pattern matches `change-aware-phase-verification.test.ts:4-8`, which
  mocks the same three sinks (`mockResolvedValue`, equivalent).

## 3. Reproduction: unmocked suite pollutes the live ledger (Muse base)

Method: backed up untracked `api/data/db/run-evidence.json` (53 records),
ran the suite as-is (dummy JWT_SECRET, JOE_TEST_MODE, OFFLINE_MODE,
workspace TEMP redirect for sandbox EPERM), diffed, restored.

- Unmocked: PASS 3/3 (27.1s, JEST_EXIT=0) AND 1 new record:
  `run-1844-1790660788324`, `status=running`, 2 events, NO receipt.
  This is the exact reported failure shape (`run-<pid>-<ts>`, stuck
  running, mistaken for live work).
- Root-cause chain traced in source: `runPlannedPhasesIfPresent`
  -> `_executePhases` -> `recordPhaseVerificationEvidence` (one
  `verification_summary` event per phase, 2 phases = 2 events) ->
  `appendRunEvidenceEvent` upsert-creates `status='running'` when no
  record exists (store line 240). `saveRunReceipt` is called only in
  `execute()` (lines 882/923), never on the planned-phases path.
  Every fresh-runId caller of this path leaves a permanent
  receipt-less `running` record. Snapshots:
  `tmp/run-evidence-pre-review.json` (53) and
  `tmp/run-evidence-post-unmocked.json` (54).

## 4. Mocked rerun: green with zero ledger mutation

Applied the candidate hunk temporarily to the Muse file; `git diff`
was byte-identical to 9151bcc1 (same blob `173ec0d9`, +8/-0).
Reran: PASS 3/3 (23.0s, JEST_EXIT=0), ledger SHA256 identical before
and after (`D1537962...DC1BDE`). Then reverted the file (`git
checkout`) and restored the ledger; tracked tree clean, ledger back
to 53 records. No Codex change committed or duplicated on this branch.

## 5. Second live writer: prose-verification-final-gate.test.ts

- Uses fixed `runId: 'run'`, session `'session'`, NO store mock.
- The Muse ledger already contains a stuck `running: run` record with
  no receipt — the same defect shape, same ids.
- This cycle: ran the suite (PASS 4/4, 33.2s) with backup/restore;
  ledger diff showed `MODIFIED: run` (53 records before and after,
  shared record mutated). It is an active polluter, and fixed ids
  make its writes order-dependent across runs.
- It asserts only on in-memory `verificationLedger.receipts`, never
  on the durable ledger — the same mock applies cleanly.
- Ruled out as writers: `pipeline-quality`, `project-pipeline`,
  `wiring-policy` (source-text `.toContain` assertions only, never
  invoke AgentLoop); `change-aware-phase-verification` (already
  mocked). Manual `src/tests/manual/*.ts`: 27 files reference
  AgentLoop entry points by static screen — candidates needing
  per-file classification, not blind mocking (agree with proposal).

## Risks

- The mock also hides sink-failure behavior, but the store already
  swallows all write errors by design ("secondary sink", store
  lines 213/245/269), so no test could catch evidence-write
  regressions either way. Pre-existing property, unchanged.
- `void appendRunEvidenceEvent` (line 715) plus Jest teardown can
  interleave with the file write queue; the mock removes that flake
  surface for this suite — a side benefit, not a behavior change.
- Filtering synthetic ids only at report time (rejected alternative)
  would leave the stuck `running` records in place; isolation is the
  right call.

## Recommendation

RECOMMENDATION=APPROVE_WITH_CHANGES:

1. Approve the 9151bcc1 per-suite-mock direction; it is safe and
   sufficient for `api-selection-cross-phase.test.ts`.
2. Include the identical mock for `prose-verification-final-gate.test.ts`
   in the same integration (or a tracked immediate follow-up): it is a
   confirmed second writer with the same no-evidence-assertion profile.
   Do not integrate one and leave the other polluting.
3. On the integration base, rerun both suites plus evidence-store
   tests and verify no ledger mutation (hash `run-evidence.json`
   before/after, as done here). Preserve the existing synthetic
   record; do not delete history.
4. Product follow-up, separate change, not blocking: the
   planned-phases path never writes a terminal receipt, so every real
   programmatic caller also leaves `status=running` forever. Decide
   explicitly (receipt on that path vs. reconcile-on-read vs. marking
   non-UI runs) instead of letting the mock hide it.
5. Manual scripts: classify per file before any isolation decision.

## Limits

- UNIT/review evidence only: no Real Joe UI UAT for a test-fixture
  change (none applicable); no product behavior changed.
- No overlap with NVIDIA ACTIVE EVAL-006 planning/memory work; no
  CRITICAL-assigned implementation touched (CLI owner still
  UNASSIGNED per ACTIVE-PLAN).
- No main merge requested or performed; no GitHub action by Muse
  beyond its own branch policy.
