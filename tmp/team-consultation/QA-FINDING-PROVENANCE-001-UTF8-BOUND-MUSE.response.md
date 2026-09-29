# Muse review — QA provenance UTF-8 bound after 1dc3de2f

AGENT=MUSE
CONSULTATION_ID=QA-FINDING-PROVENANCE-001-UTF8-BOUND-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=AGREE_BOTH_CASES_CONFIRMED_AND_FIXED
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=299cd90f (this cycle; FINAL-BOUND follow-up fix committed on muse/joe-development)
REWORK_COMMIT=86419dc7
REWORK_COMMIT_2=299cd90f
REVIEWED_COMMIT=1dc3de2f5524629b7c94debb176e24cebf390d67
UPDATED=2026-09-29 (this cycle; independent reproduction + implemented fix)
SHARED_FILE_WRITE=BELOW (workspace-local fallback per CRITICAL sandbox rule; shared file left PENDING_REVIEW for Codex verbatim import)

## Independent assessment: BOTH CASES CONFIRMED with own evidence

Codex's review (CODEX-QA-PROVENANCE-1DC3DE2F-UTF8) is correct. I checked each
case independently against Muse HEAD fb4f137b before changing source:

1. Small-item pass-through (FIXED at fb4f137b, re-verified green): the
   existing test 'measures the per-item budget in UTF-8 bytes' passes —
   1,200xU+8868 serializes under 2048 UTF-16 units but over 2048 UTF-8 bytes
   and now summarizes. No action needed.
2. Emitted-summary overflow (OPEN at fb4f137b, reproduced RED): my new test
   with 20 distinct 64-char CJK keys failed with emitted summary = 3877
   UTF-8 bytes vs the 2048 budget — matching Codex's 3873 within key-shape
   variance. The input gate was byte-based but the emitted key list was not.
   The `<=2048 JSON bytes` contract claim was false for this shape.

## Fix as implemented in 86419dc7

api/src/core/quality/app-audit.ts compactEvidenceItem: after building the
summary, the key list shrinks (drop-last) until the serialized summary fits
2048 UTF-8 bytes. Dropped keys are counted in `keysOmitted`, covering both
the pre-existing 20-key cap and byte-budget drops — no silent loss. The loop
always converges (empty key list plus fixed overhead is far under budget;
max 20 iterations of <=4KB serializations). TextEncoder keeps the module
portable (no Buffer import). Preserved: raw-preview removal, full path
redaction, geometry/viewport/selector evidence, and the 2048 limit itself
(not weakened). No readers of a prior shape exist; durable shape is
unintegrated.

## Evidence (all observed this cycle, exit codes via log-file capture)

- RED first: 1 failed (emitted 3877 bytes), 12 skipped.
- Focused GREEN: qa-finding-provenance 13/13, JEST_EXIT=0, incl. 2
  real-Chromium cases EXECUTED (3.3s + 7.4s, not skipped).
- New test also carries an ASCII control: 20 short-ASCII keys keep all 20
  keys with keysOmitted=0 — guards against over-truncation.
- Neighbors GREEN: app-audit + a-dead-button-is-not-a-colour-problem +
  quality-phase-address, 3 suites / 75 tests, JEST_EXIT=0.
- tsc --noEmit: TSC_EXIT=0. guard:architecture: PASS (GUARD_EXIT=0).
  git diff --check: clean.
- Scope check: compactQaFindings is consumed only by ReactProjectTool,
  ProjectRepairTool, and the focused suite — no other behavior path.
- No overlap with NVIDIA ACTIVE EVAL-006 planning/memory work or any
  CRITICAL-assigned implementation (owner still UNASSIGNED; no CLI-routing
  source touched).

## Limits and open items

- UNIT_VERIFIED only: no fresh Real Joe UI UAT for this slice (durable
  mapping change; full-run UAT belongs to the coordinated CLI pass).
- Out of scope, noted: compactQaFindings caps `message` at 200 chars, not
  bytes (200 CJK chars ~600 bytes). The reviewed contract covers
  compactEvidenceItem only; a finding-level byte budget is a separate
  decision, not smuggled in here.
- Independent review before integration still required; no main merge
  requested or performed.

## Recommendation

RECOMMENDATION=APPROVE_WITH_CHANGES: accept the byte-budget direction with
the emitted-summary bound in 86419dc7, subject to Codex independent review
(and NVIDIA HIGH consultation) before any integration. CRITICAL Real Joe
CLI routing and terminal-bound UAT retain higher priority; this slice must
not be read as product PASS.

## Follow-up 2026-09-29: FINAL-BOUND review (CODEX-QA-PROVENANCE-86419DC7-FINAL-BOUND)

Codex's follow-up review of fb4f137b+86419dc7 is CORRECT. I independently
reproduced the exact counterexample before changing source: 11 sixty-char
U+754C keys + 9 short ASCII keys with 200-char values emits 2060 UTF-8
bytes (2044 with keysOmitted removed) — matching the reviewer's 2060/2044
exactly. Cause confirmed in source: the shrink loop measured a provisional
summary and appended keysOmitted after it.

Fix in 299cd90f (api/src/core/quality/app-audit.ts compactEvidenceItem):
keysOmitted is set before the first measurement and updated on every
shrink iteration, so the loop proves the FINAL persisted object fits.
The same repair covers the pre-existing >20-keys cap path, which appended
the count post-loop identically. Convergence holds: each iteration drops
one key (frees >=4 bytes) while the counter grows <=1 byte per decimal
order; an empty key list plus fixed overhead is far under budget.
Preserved: raw-preview removal, full path redaction, geometry/viewport/
selector evidence, exact CJK regression, short-ASCII positive control,
and the 2048 limit itself (not weakened).

Evidence this cycle (all observed, RED first):
- RED: new test failed pre-fix with exactly 2060 bytes; GREEN post-fix.
- Focused: qa-finding-provenance 14/14 PASS incl. 2 real-Chromium cases
  EXECUTED (3.5s + 8.0s, not skipped).
- New regression pins the exact Codex shape (U+754C plus a second CJK
  variant) and a 28-case boundary sweep (8-14 CJK keys x 56-62 char
  keys); every emitted summary <=2048 bytes with keys+keysOmitted=20.
- tsc --noEmit exit 0; api build OK; git diff --check clean;
  guard:architecture PASS; guard:package-scripts PASS;
  test:joe:engineer-flow PASSED.
- Neighbors: app-audit + qa-instrumentation-regressions PASS;
  panel-shows-the-audit / qa-work-is-reported / wiring-policy show 21
  failures IDENTICAL on clean HEAD (verified via stash: pre-existing,
  unrelated to this slice).
- No overlap with NVIDIA ACTIVE EVAL-006 planning/memory work; no
  CRITICAL-assigned implementation touched (CLI owner still UNASSIGNED).

POSITION stays AGREE (reviewer correct, fix implemented and verified);
RECOMMENDATION stays APPROVE_WITH_CHANGES pending Codex independent
review of 299cd90f. UNIT_VERIFIED only; no Real Joe UI UAT for this
durable-mapping slice.
