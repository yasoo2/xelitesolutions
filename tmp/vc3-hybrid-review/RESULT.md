# vc3 hybrid experiment — RESULT (MUSE, 2026-10-03)

## Question
Re-baselined audit files claim verification-contract-gaps 8/8 PASS / BATCH-010 DONE,
attributed to commits de73cfb4/02a37c9b. vc2 proved 6/8 on exact 02a37c9b bytes
(T1+T8 FAIL) with the delta behaviorally inert. Is 8/8 measurable anywhere, and
what exactly is the delta?

## Method (read-only toward NVIDIA tree)
- Base: vc2-pristine-02a = exact-02a37c9b bytes (blob-verified in vc2).
- Overlay: ONLY 2 files copied read-only from NVIDIA dirty working bytes:
  verification-ledger.ts (adds isVerificationTool 4th param allowExistenceObservation
  + read_file existence-observation body) and app-blueprints.ts (adds isCliRequest
  export). No other dirty file. No NVIDIA file touched.
- node_modules junctioned from muse api (disclosed, same as vc2).
- Suite: verification-contract-gaps only. Cache/tmp redirected to Muse workspace.

## Result
8/8 PASS, 1 suite, 182.8s. Receipt: vc3-hybrid.json (numTotalTests 8,
numPassedTests 8, numFailedTests 0).

## Conclusion
The 2 uncommitted hunks are exactly and solely the delta between 6/8 (exact
commit bytes, vc2 GREEN) and 8/8. The audit files' "8/8 PASS / DONE (8/8 PASS)"
is a DIRTY-TREE number misattributed to commits. F7 NOT fixed. T1 greens via
the observation path; T8 via the real export. Hybrid is not the full dirty
tree — it isolates precisely the G2 dependency claim.
