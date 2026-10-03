# RESULT — independent review of main-line 02a37c9b (Gap-A/B follow-up)

TARGET=02a37c9bc6c1ad53d1df61bc04f324807168ca26 (local main, ahead of origin, NOT pushed)
PARENT=de73cfb4ad7dbaeeb05607b049049c93e26fe172
VERDICT=NEEDS_REWORK (review-only cycle; zero Joe source delta; NVIDIA untouched)
REVIEW_FILE=tmp/team-consultation/VERIFICATION-CONTRACT-02A-001-MUSE.response.md

## Claim vs exact bytes

Commit claims: gaps 8/8, smoke 5/5, prose-regression 6/6, engineer-flow, 10 gates PASS.
Exact bytes (pristine git-archive, blob-verified): gaps 6/8, smoke 5/5, prose-regression 6/6.
The 8/8 was measured on the dirty tree, not the commit.

## RED/GREEN (3 suites, jest --runInBand, node_modules junction disclosed)

- GREEN (exact 02a37c9b): 17/19 PASS. Failing: Gap-A negative :95
  (verificationResult.message undefined — rejection path, not observation path);
  CLI routing :344 (TypeError: isCliRequest is not a function).
- RED (exact de73cfb4 + new gaps test blob f9e143ca): IDENTICAL 17/19, same 2
  failures at the same lines. The PhaseExecutor delta is behaviorally INERT on
  exact bytes.
- Receipts: vc2-green.json (16139B), vc2-red.json (16138B). Failing fullNames
  byte-identical between the two.

## Root cause (source-proven, read-only)

Committed isVerificationTool has 3 params (verification-ledger.ts:719); both
4-arg call sites (PhaseExecutor :2342-2343 new; plan-tools :948 from de73) are
TS2554 errors + runtime no-ops (extra JS arg ignored). The read_file
existence-observation relaxation never engages, so prose read_file
verifications are REJECTED (verification_unavailable), and the status='partial'
downgrade at :2430-2432 sits behind the unreachable observation branch (dead
code on exact bytes). The missing pieces exist ONLY as uncommitted NVIDIA work:
dirty verification-ledger.ts:733 (4th param allowExistenceObservation + body
:773-775) and dirty app-blueprints.ts:3231 (isCliRequest export) — observed,
not touched, must be committed by the main-lane owner.

## Agreed (real progress in test design)

6/8 tests now execute real paths (PhaseExecutor.execute, compactPhaseReceipt
called, real CLI assertions). Positive controls pass: structured verifications
still complete. Requirement (b) from the de73 review CLOSED; (a) structurally
addressed but not green.

## Still required (see response G1-G6)

Exact-bytes 8/8 via the observation path; missing hunks committed; tsc clean;
ledger passed-receipt + reuse-bypass fix; downgrade-semantics decision +
multi-phase proof; QA placeholder disposition; F4/F5; fresh Real-Joe UAT on a
reviewed runtime. :5002 = old binary (no-commit-file, uptime ~32.9h) — UAT BLOCKED.

## WIRING audit side-note

NVIDIA accepted all F1-F12 (received-reviews). JOE-* files still carry the
Codex hold (04:39, verified); re-baseline pending (NVIDIA heartbeat: NEXT).
Hold stays; no P1 catalogue integration until re-baselined + re-verified.
