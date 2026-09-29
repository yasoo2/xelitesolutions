# Muse follow-up — second synthetic run writer (implemented)

AGENT=MUSE
CONSULTATION_ID=RUN-EVIDENCE-SECOND-WRITER-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=SECOND_WRITER_ISOLATED_AND_VERIFIED
RECOMMENDATION=APPROVE_WITH_CHANGES
FIX_COMMIT=e4d3ae5890b9ff549064e5c56b4e066c39934f9e
BRANCH=muse/joe-development
UPDATED=2026-09-29 (this cycle; implement + verify, Muse worktree only)
SHARED_FILE_WRITE=DENIED (verified this cycle via write probe; shared file left PENDING_REVIEW for Codex verbatim import)

## What was done

Isolated the three run-evidence sink calls in the Muse-only suite
`api/src/__tests__/prose-verification-final-gate.test.ts` (+9/-0, no
production file touched):

jest.mock('../shared/run-evidence-store', () => ({
  createRunEvidence: jest.fn(async () => undefined),
  appendRunEvidenceEvent: jest.fn(async () => undefined),
  saveRunReceipt: jest.fn(async () => undefined),
}));

All 4 final-gate assertions are preserved byte-for-byte; the suite checks
in-memory `verificationLedger.receipts` only and never asserted on the
durable ledger, so no coverage is lost. Pattern matches Codex 9151bcc1 and
`change-aware-phase-verification.test.ts:4-8`. Codex's main-based suite was
not modified. No live Joe run was interrupted; no NVIDIA work touched.

## Evidence (Muse worktree, ledger backup/restore throughout)

- Baseline: 53 records, `run` stuck `running`, 10 events, no receipt.
  SHA256 D153796244374E605540C9D1E060E2FB8347707F3A80E5EC30AA065BA2DC1BDE.
- Before fix (unmocked): PASS 4/4 (22.2s) AND silent pollution — `run`
  grew 10 -> 12 events, hash changed to 82F807BE.... Recorded RED.
- After fix (e4d3ae58): PASS 4/4 (18.9s), JEST_EXIT=0, ledger SHA256
  identical to baseline (D1537962...). Zero mutation. Recorded GREEN.
- Neighbors: `change-aware-phase-verification`,
  `interrupted-run-recovery`, `the-record-dropped-the-half-that-answers`:
  3 suites / 20 tests PASS, ledger hash unchanged.
- `run-evidence.test.ts` (9 tests) PASSes but its own before/after
  cleanup deletes ALL live records (store lines ~42-44): after that run
  the ledger held 0 records. Restored from backup immediately; live
  ledger verified back at 53 records / D1537962.... This is pre-existing
  store-test behavior, not caused by this change, but it means the
  proposal's "rerun evidence-store tests and verify no ledger mutation"
  step requires backup/restore for that suite specifically.
- `git diff --check` clean; tracked diff is exactly the one test file.
- Snapshots: `tmp/run-evidence-pre-second-writer.json` (53),
  `tmp/run-evidence-post-unmocked-second-writer.json` (53, `run` +2 events).

## Position

The per-suite mock direction is correct for this second writer too. Both
suites (Codex 9151bcc1 + this fix) should integrate together; integrating
only one leaves the other polluting. The separate product finding stands:
`runPlannedPhasesIfPresent` never writes a terminal receipt, so every
fresh-runId programmatic caller leaves a permanent receipt-less `running`
record — decide explicitly (receipt vs reconcile-on-read vs non-UI marking)
in a separate product change, and classify the 27 manual scripts per file
before any isolation decision.

## Limits

- UNIT/test-fixture evidence only: no Real Joe UI UAT applies to a
  test-mock change; no product behavior changed.
- No overlap with NVIDIA ACTIVE EVAL-006 planning/memory work; no
  CRITICAL-assigned implementation touched (CLI owner still UNASSIGNED).
- No main merge requested or performed; push of muse/joe-development
  attempted only per standing role authorization.
- Existing stuck `run` record preserved, not deleted.
