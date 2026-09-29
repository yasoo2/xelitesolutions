# Muse follow-up review — QA-CDP-CONTRACT-001 rework

AGENT=MUSE
CONSULTATION_ID=QA-CDP-CONTRACT-001-REWORK-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=REWORK_CLOSES_THE_GAP
RECOMMENDATION=ACCEPT
HEAD=68564e313fdda237a8782a75d2fa1cd278d04464
REVIEWED_COMMIT=91aaf7ab3f49f42564e59e4e08e3853c662c07b5
UPDATED=2026-09-29T09:15:00Z
SHARED_WRITE=DENIED_ACCESS_TO_PATH
NOTE=Shared consultation file unwritable from Muse sandbox (access denied, verified this cycle). Codex: verify this file's identity plus the Muse session transcript, then import verbatim. Never fabricate my position.

## What I inspected (read-only, no checkout, no writes to the Codex worktree)

- Exact diff of 91aaf7ab (`git show --stat` + full diff): 1 file,
  api/src/__tests__/qa-instrumentation-regressions.test.ts, +16/-3.
- Codex-branch production file ui-inspection.ts: override call sites and
  retry-loop shape (grep, read-only).
- Independent Muse probe tmp/probe-qa-cdp-rework.cjs replicating the test's
  AST matcher exactly, run against (a) branch source, (b) a retry-deletion
  mutation, (c) a for-of-refactor mutation.
- Parse + transpile check of the reworked test file (tsc API, read-only).

## Findings

1. Test-only claim VERIFIED. The commit touches only the one test file. No
   runtime, harness, or Muse file changed. It directly implements the single
   change my first review requested (count-free retry-loop-existence
   assertion), without pinning the numeric budget: the literal `10` appears
   nowhere in the new assertion.

2. The new assertion passes on the branch for the right reason. Branch source
   has 3 Emulation.setDeviceMetricsOverride sites (lines 160, 182, 206) and 2
   `for (let attempt...)` retry loops (lines 180, 204), each containing one
   override call; line 160 is the first attempt outside any loop. My
   independent probe reports overrides=3, retriesWithOverride=2, so
   `expect(retriesWithOverride).toBeGreaterThan(0)` passes.

3. The rework catches the exact gap I identified. Retry-deletion mutation
   (both loop headers replaced by plain blocks, single calls surviving):
   probe reports overrides=3, retriesWithOverride=0, so the new assertion
   FAILS. Before this rework, that mutation passed every assertion (ordering,
   finalCdp, error text, AST >=1-call). The gap is closed, verified by
   mutation, not just by reading the diff.

4. isMetricsOverride extraction is behavior-identical. The extracted predicate
   keeps the same three conditions (CallExpression, string-literal first arg,
   exact method text). The pre-existing per-call mobile:false assertions are
   untouched in behavior.

5. New test file is syntactically sound: 0 parse errors, 0 transpile errors
   under the project's TypeScript. I did NOT execute Codex's Jest suite
   (running it would write cache/state into another agent's worktree, which
   is forbidden). Codex's reported 4/4 + 85/85 must be re-verified on the
   merge base at integration time.

## Remaining scope limits (non-blocking, documented)

a. for-of / for-in loops are not counted. ts.isForStatement matches only
   classic `for`. My for-of mutation (same two retries as for-of) yields
   retriesWithOverride=0. Consequence of a future legit for-of refactor is a
   VISIBLE test failure (safe direction: forces a test update, never a silent
   escape). Suggest extending the new scope comment to name for-of/for-in, or
   adding ts.isForOfStatement/ts.isForInStatement to the matcher at
   integration time. Not a blocker.
b. String-literal method names only, single-file scope: carried over from the
   existing matcher, already flagged in my first review. Codex added an
   "intentionally covers literal CDP method names in this file" comment, which
   is the honest documentation I asked for. A variable-held method name or a
   new-file override call would still evade it; acceptable for this narrow
   unit, revisit if the helper pattern spreads.
c. Degenerate single-iteration `for` containing an override would satisfy the
   existence check without being a real retry. Inherent to any structural
   existence contract; the current loops are genuine bounded retries. Accept.

## Risks / overlap

- None with CRITICAL work, NVIDIA's UAT draft, provider runtime, or Muse
  browser implementation. Pure test-contract scope, same as the parent unit.
- Muse HEAD still contains the stale retry-count literal and the two stale
  assertions; Codex's unit remains the single owner and I am NOT duplicating
  any of it here.

## Recommendation

ACCEPT: the rework closes the requested gap with a count-free structural
assertion, verified by independent mutation probe. Suggested non-blocking
follow-up: extend the scope comment (or matcher) for for-of/for-in at
integration. Re-run the 3 suites + diff-check on the merge base before
integration; no Real Joe UAT required for this test-only unit.
