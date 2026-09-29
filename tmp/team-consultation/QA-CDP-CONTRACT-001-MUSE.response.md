# Muse independent review — QA-CDP-CONTRACT-001

AGENT=MUSE
CONSULTATION_ID=QA-CDP-CONTRACT-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_TEST_CONTRACT_WITH_ONE_GAP
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=49e9aa3ec3deb08d82f7781b98b2419832d4930a
REVIEWED_COMMITS=93dac596,8fe32d1f
UPDATED=2026-09-29T06:35:00Z

## What I inspected (read-only, no checkout)

- git show 93dac596 and 8fe32d1f diffs; production files at 8fe32d1f and at
  the pre-fix base 93dac596~1 / 8fe32d1f~2.
- Full AST test body (qa-instrumentation-regressions.test.ts) at 8fe32d1f.
- Muse HEAD equivalents: ui-inspection.ts (3 override sites), behaviour-audit.ts
  (download contract), app-audit.ts (probe calls); ran the 3 suites on Muse HEAD.

## Findings

1. Test-only claim VERIFIED. behaviour-audit.ts is byte-identical between
   8fe32d1f and its base; the two commits touch only test files (+4/-2, +1/-1).
   No runtime, UAT-harness, or Muse file changed.

2. Download hunk is a genuine staleness fix. Pre-fix base has NO
   `effect = downloaded` literal, so the old assertion failed on main. The base
   has exactly 2 `effect = download.succeeded() ? 'download'` sites and 2
   `!download.failed()` loop guards; the new toHaveLength(2)/toHaveLength(2)
   counts match the real success/failure contract exactly, not an overfit.

3. Probe hunk (8fe32d1f) is a genuine staleness fix. Pre-fix base app-audit.ts
   already calls probeControls(page, probeOpts('desktop:/', '/')) and a
   route-aware variant; the old exact no-arg regex failed. The relaxed prefix
   regex accepts both zero-arg and route-aware forms, which suits this test's
   purpose ("borrows the probe instead of growing its own").

4. AST mobile:false check is SOUND and currently COMPLETE. It walks the whole
   file AST, collects every CallExpression with first arg exactly
   'Emulation.setDeviceMetricsOverride', requires >=1, and for each requires a
   plain object literal with no spreads and exactly one `mobile` property set
   to false. git grep on 8fe32d1f shows ui-inspection.ts is the ONLY production
   file calling the override, so single-file scope covers every current call
   site. All 3 Muse-HEAD sites carry explicit mobile:false with no spreads.

5. Cross-branch corroboration: on Muse HEAD the same 3 suites give 2 failed /
   83 passed — the download stale literal and the no-arg probeOpts assertion.
   Same staleness, independently reproduced. (Muse HEAD still contains the
   retry-count literal, so that assertion passes here; the 2 failures are the
   download + probe ones.)

## The one gap (why APPROVE_WITH_CHANGES, not APPROVE)

The removed retry-count assertion was NOT stale: the `for (attempt < 10)` loop
exists twice on the reviewed branch. Its removal is a judgment refactor
("budget, not contract"), and it deletes the only pin on retry EXISTENCE. The
remaining assertions (ordering, finalCdp, error text) plus the AST >=1-call
check would still pass if someone deleted the entire retry path. The AST test
checks every attempt's flags but not that a retry loop exists at all.

Requested change: add a structural, count-free assertion that a retry loop
exists around an override call (e.g. AST: a ForStatement/WhileStatement whose
subtree contains a setDeviceMetricsOverride call), without pinning the bound.
That keeps Codex's valid point (10 is a budget) while retaining regression
value against full retry deletion.

Minor, non-blocking: the AST matcher only fires on a string-literal method
name; a variable-held method name would evade it. Acceptable for now — flag it
in a comment so a future refactor doesn't silently escape the contract. Also
consider a repo-wide grep guard so a future override call in a NEW file can't
bypass the single-file AST scope.

## Risks / overlap

- None with CRITICAL work, NVIDIA's UAT draft, provider runtime, or Muse
  browser implementation. Pure test-contract scope.
- Muse HEAD will need the same two staleness fixes at integration time (or a
  rebase onto them); I am NOT duplicating them here — one owner (Codex), one
  integration decision.

## Recommendation

APPROVE_WITH_CHANGES: accept both staleness fixes as correct and exactly
scoped; add the count-free retry-loop-existence assertion before integration.
No Real Joe UAT required for this test-only unit; run the 3 suites + diff-check
at integration.
