# Muse independent review — bounded isolated image-owner test pins
AGENT=MUSE
CONSULTATION_ID=IMAGE-OWNER-NEGATIVE-PINS-20261003-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_TEST_ONLY_PINS_WITH_EXPLICIT_SCOPE_LIMITS
RECOMMENDATION=APPROVE
MUSE_HEAD=7f51785b1470fa468ecfbf2b98657761cec11830
REVIEWED_SOURCE=D:\Joe\worktrees\codex-local-bind-safety
REVIEWED_BASE_COMMIT=532fe2e147f715393a6096650fbf1e6ce72a8ffe
REVIEWED_FILE=api/verification/verify_image_project_owner.mts
REVIEWED_TEST_SHA256=D336BCD85CE351C6B4011768A271D66FFDF57CDB1C397EA986072D1582E54D89
SHARED_WRITE=DENIED_BY_SANDBOX; this fallback response carries the complete review for collector import. Shared-file STATUS change not claimed.
UPDATED=2026-10-03T15:30Z

## Scope verified (read-only, independent)
- Base HEAD matches: 532fe2e147f715393a6096650fbf1e6ce72a8ffe.
- Sole dirty tracked file is api/verification/verify_image_project_owner.mts; no production source delta.
- Get-FileHash SHA256 of the test file == D336BCD8...54D89, exactly the pinned TEST_SHA256.
- git diff --check exit 0; diff stat +40/-5, one file.
- No Muse/NVIDIA/main source, Git history, worker, runtime, or production state touched by this review.

## Independent rerun (real execution, not a log replay)
- Reran the exact pinned test bytes with tsx from the Codex worktree (node_modules is a
  junction to D:\Joe\xelitesolutions\api\node_modules; noted, not a defect).
- First attempt from the Codex cwd: all 14 contract assertions printed GREEN, but the
  harness exited 1 with EPERM opening ...\codex-local-bind-safety\api\logs\application-*.log.
  Root cause: src/shared/utils/logger.ts uses a cwd-relative logs/ path with no env override,
  and the sandbox user cannot write that foreign-tree log file. Environmental, not contractual.
- Clean rerun from a writable cwd (same test bytes, same production sources, only cwd/TEMP
  redirected): EXIT=0, 14/14 checks green:
  - 7 original acceptance checks (cross-owner deny, own allow, imported-outside allow,
    legacy outside deny / inside allow, owner stamping, cross-owner overwrite deny).
  - F1: 5 deny cases (empty caller, missing workspace, missing dir, sibling-prefix escape,
    real junction escape) all project_forbidden with fileTouched=false, scriptAttempted=false.
  - F1: Windows case-variant allow reaches the synthetic write interception (no real write).
  - F2: trusted empty-context system update preserves user-b ownership, ignores forged owner.
- Junction reality confirmed: fixture escape link is LinkType=Junction to an outside dir;
  the escape-deny pin is backed by a genuine Windows junction, not a path-string mock.

## Pins bind real production logic (not mock tautologies)
- Empty caller deny <- ImageStudioTool.ts:135 (!caller -> project_forbidden).
- Missing workspace/dir deny <- ImageStudioTool.ts:140.
- Sibling-prefix and junction escapes <- realpathSync containment at :142-148.
- Allow paths proceed to a real write attempt intercepted only by the test's fs hook.
- System-owner preservation pins writeJoeProject/runAsSystem behavior, documented as
  ownership preservation only, not user authorization. Correct framing; no overclaim.

## Root cause of the original gap (F1/F2)
Negative/executable owner-boundary paths (anonymous caller, missing workspace, real
symlink escape, case-variant allow, empty-context system semantics) previously had no
executed pins; static inspection alone could not prove the deny-before-touch ordering.
This change closes exactly that executable-evidence gap for the image-owner boundary.

## Proposal errors found
None material in this diff. Two non-blocking observations:
1. Harness fragility (pre-existing, not introduced here): the cwd-relative logger path
   makes the script exit nonzero for restricted users even when every assertion passes.
   Future reviewers will hit the same EPERM. Suggest a bounded follow-up (env-overridable
   log dir or logger-error tolerance in verification scripts), owned separately.
2. Fixture dirs intentionally retained in TEMP for inspection; acceptable, but a bounded
   retention/cleanup note would prevent slow accumulation.

## Simpler alternatives considered
None better. A pure path-string mock of the junction case would be weaker; the real
junction + real case variant is the right call for a containment boundary on Windows.

## Overlap with existing work
None conflicting. Complements IMAGE-STUDIO-PRIMARY-DATA-001 (primary/secondary table
visibility) which is a different defect on the same tool. No overlap with Muse
verification-contract lane, NVIDIA CLI producer scope, or active dirty main work.
No competing implementation created.

## Conflict / regression risks
Negligible. Test-only change; zero production delta; fixture writes confined to TEMP;
fs mocks fully restored in finally; no worker/runtime/main integration performed or
requested. No regression surface.

## Maintainability / security impact
Positive, bounded: the owner boundary now has executable deny-before-touch evidence
including a real escape attempt. No new attack surface (verification script only).
No secrets, no network, no paid calls.

## Required tests
Done by owner and independently reproduced by reviewer: 14/14 green, diff check clean.
Not required for this scope: permanent repo-suite pins (this follows the established
verification-script pattern), type/build gates (no source change), fleet checks.

## Real Joe UAT
Not applicable to an isolated contract test and not claimed. Official :5002 remains
DOWN per shared state; no live acceptance attempted or inferred.

## Explicitly still open (not approved, not closed)
F3 real fleet compatibility, F4 design disagreement, NVIDIA exact-candidate review,
broader project-entry boundary, runtime :5002 restoration, real multi-prompt UAT.
This APPROVE covers the test-only pins only: no main/Muse/NVIDIA integration, no
product PASS, no GitHub-proof claim.

## Evidence paths
- Test: D:\Joe\worktrees\codex-local-bind-safety\api\verification\verify_image_project_owner.mts
- Receipt: D:\Joe\coordination\team\verification\IMAGE-OWNER-NEGATIVE-PINS-20261003.md
- Independent rerun cwd/fixtures: D:\Joe\muse-worktree\tmp\review-tsx-temp\ (retained)
- Muse HEAD 7f51785b tracked-clean; main a10c71ab +19 dirty files preserved untouched.
