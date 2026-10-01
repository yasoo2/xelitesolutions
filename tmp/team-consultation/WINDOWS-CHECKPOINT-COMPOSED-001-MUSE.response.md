# Muse consultation response — WINDOWS-CHECKPOINT-COMPOSED-001
AGENT=MUSE
CONSULTATION_ID=WINDOWS-CHECKPOINT-COMPOSED-001-MUSE
CANDIDATE_COMMIT=21c4caa21650e77e11ff3c797e61c73f200de96e
CANDIDATE_PARENT=67627c1dba70c15074834c5c691f991fe05ca840
MUSE_HEAD=20565e1d
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_DIRTY=tmp/LIVE-REPORT.md (modified, preserved)
SHARED_FILE_WRITE=ACCESS_DENIED (absolute path outside workspace; shared file left PENDING_REVIEW for verbatim import)
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES (bounded C1 fix + affected-suite rerun; C2/C3 documented follow-up; real-UI UAT still required)
RECOMMENDATION=APPROVE_WITH_CHANGES
UPDATED=2026-10-01 (independent inspection this cycle)

## Scope verified (independent)
- Composed diff 67627c1d..21c4caa touches EXACTLY 9 files; no other files.
  Confirmed via `git diff --name-only`: ExecutionEngine.ts, path-containment.ts,
  SystemTools.ts, ProjectRunTool.ts, handlers.ts, 3 windows-*.test.ts, docs/joe-windows-shell-cwd.md.
- Checkpoint freeze: `git diff --quiet 67627c1d 21c4caa` over the 4 frozen paths
  (PhaseExecutorTool.ts, engineering-checkpoint.ts, phase-terminal-checkpoint.test.ts,
  verification-checkpoint-proof.md) exits 0 — byte-identical, unchanged. CLAIM CONFIRMED.
- Source integrity: all 9 files at 21c4caa match the 890cc9ee+39fe5c75 union after
  CRLF normalization — 9/9 NORM-MATCH reproduced independently
  (ExecutionEngine/fallback-test/docs from 39fe5c75, other 6 from 890cc9ee).
  Raw-hash 4-match/5-EOL-only split is consistent with the recorded manifest.
- No CLI/scaffold-provenance/provider implementation in the diff. Confirmed (file list + diff read).
- Candidate tree status clean; no rebase/merge/main change observed.

## Independent test evidence (this cycle, read-only execution)
- Reran the 4 focused suites in the candidate tree with workspace TEMP/cache overrides:
  65/67 PASS. The 2 failures are BOTH `EPERM open .../api/logs/application-2026-10-01-16.log`
  (windows-fallback-cwd "plain initial cwd reaches the physical Node child";
  windows-shell-cwd "retains extended cwd for a direct Node argv launch").
  Root cause of the 2 failures is sandbox identity (muse-sbx-u1 cannot write the
  candidate's api/logs), NOT product behavior — same EPERM class as the earlier
  INSTALLED-001 independent 12/13. Owner's 67/67 in own user context is credible.
  Evidence: D:\Joe\muse-worktree\tmp\jest-ind\results.json.
- Owner gate logs spot-checked: original build-context JWT config failure preserved
  verbatim (test-self-fix-build-context.log), test-env rerun PASSED; 12 terminal
  checks exit 0 per combined-validation-summary.json. No reason to doubt; I did not
  re-run all 10 gates (cost) — stated as a limit, not as doubt.
- Preview-serialization test reviewed in source: executes the ACTUAL generated server
  source (TS + shipped dist) in a VM with HTTP/fs fixtures, allow + traversal-deny
  on plain and extended roots, and pins canonicalize-before-isWithinRoot ordering.
  Substantive, not a compilation-only check.

## Technical challenge (regression / receipt / cwd / fallback / serialization / terminal)
- C1 (REAL, bounded — receipt inconsistency): `runCommandInternal` spawn-error path
  (ExecutionEngine.ts ~1081-1089) resolves `{ok:false, error, exitCode:1}` with NO `cwd`,
  while every other path (including the new preflight rejection and the timeout path)
  carries `cwd`, and the new not-started convention is `exitCode:null` + "command not
  started". Two shapes now exist for "command never ran": preflight -> null/absent-cwd,
  spawn-error -> 1/absent-cwd. Downstream `handlers.ts` then reports `cwd:undefined`
  where it previously always reported the requested workDir, and exitCode `1` where
  the new convention says `null`. Required: include `cwd` on the spawn-error path and
  either use `null` there too or document the deliberate distinction; add one
  focused test (spawn ENOENT receipt shape). Small, no architecture change.
- C2 (diagnostic precision, DOCUMENTED): EPERM/ENOENT/non-directory collapse into
  `shell_cwd_not_directory`; docs lines 16-17 disclose this. Acceptable fail-closed
  direction for now. Follow-up: append the underlying code (e.g. `shell_cwd_not_directory:EPERM`)
  so operators can distinguish ACL from missing-path without weakening the gate.
- C3 (fail-closed LIMITATION, documented): blanket UNC + >=260 rejection can block
  legitimate network-share workspaces, deep trees, and long-path-enabled hosts.
  Documented (docs + error taxonomy); acceptable for this batch. Follow-up backlog:
  capability probe / explicit UNC allowlist instead of permanent rejection.
- C4 (observation, NOT caused by this change): the fixed relative `api/logs/` path
  EPERMs under a least-privilege service user (it broke my independent rerun the same
  way). Portability note for the log-dir configuration; do not bundle into this diff.
- Regression direction verified: in-tree `exitCode` consumers use `=== 0` checks and
  `number | null` types (log-doctor, terminal-audit, python-runtime) — `null` flows to
  the failure branch, never to false success. `cd:` message change (`no such directory`
  -> `cd: shell_cwd_*`) has NO in-tree consumer (single occurrence is the source line
  itself in the Muse tree). Terminal-checkpoint logic untouched AND its runtime inputs
  only move in the fail-closed direction (null exitCode serializes; no checkpoint
  assertion on cwd spelling found in the frozen test).
- POSIX: docs honestly state no POSIX execution result is claimed (fallback creation
  now rejects missing cwd on POSIX too — behavior change, untested there). Keep the
  POSIX test/gate as a follow-up; do not claim cross-platform coverage.

## Overlap / conflicts
- MUSE tree (20565e1d): still carries the OLD `cd: no such directory` line; Muse dirty
  state is only tmp/LIVE-REPORT.md. Zero implementation overlap with this composition.
- NVIDIA main (e8fd9589 + 14 tracked dirty, read-only inspection): dirty files are
  planning/registry/ledger/pipeline + PhaseExecutorTool; ZERO file overlap with the
  composed 9 files. No direct merge conflict from this composition. NOTE: main's dirty
  PhaseExecutorTool vs the candidate's frozen PhaseExecutorTool will need
  dirty-preserving reconciliation at integration time — that is an integration-step
  concern, not a defect of this composition.
- No competing implementation started by Muse.

## Simpler alternatives considered
- Caller-side cwd validation instead of engine preflight: rejected — engine-level
  preflight covers fallback sessions, one-shot spawn, and runCommandInternal uniformly;
  caller-side would leave gaps.
- Warn-and-continue on long/UNC paths instead of fail-closed: rejected — cmd.exe
  silently falls back to C:\Windows (the original P1-010 defect); silent wrong-cwd
  execution is worse than an honest stop.

## Maintainability / security / portability
- Security: direction is strictly safer — namespace/UNC/long/missing cwd can no longer
  silently execute in C:\Windows; containment canonicalization closes extended-prefix
  bypasses; preview server gains the same containment it previously lacked. No new
  privileged surface.
- Maintainability: single `shellWorkingDirectory` preflight reused by 3 engine paths +
  fallback cd; error taxonomy documented; tests pin behavior with real gateway/child
  evidence. Small API addition (HandlerResult.cwd/exitCode) with one producer.
- Portability: Windows-only semantics correctly gated (canonicalizeWindowsPath is a
  pass-through off win32); POSIX behavior change is documented-untested — must stay a
  follow-up, not a silent claim.

## Required tests before integration
1. C1 fix + rerun of windows-shell-cwd suite (and fallback suite for the shared helper).
2. Owner's 12 terminal gates already green on the exact composed source; after the C1
   fix, re-run at minimum: focused 4 suites + typecheck/build + engineer-flow +
   execution-safety (touched receipt surface). Full 10-gate rerun preferred if cheap.
3. Real Joe UI transfer UAT per real-ui-transfer-uat.md (NOT_RUN): multiple materially
   different prompts on authorized :5002 with exact frozen source loaded; observe
   project-run cwd/exit receipts in live output. No UI PASS from mocks/direct helpers.

## Real Joe UAT
NOT_RUN_ON_COMPOSED_COMMIT (agreed with consultation). No UI verdict inferred from
65/67 focused or owner gates. The transfer matrix (calculator / bill-split / weight
conversion + later CLI) is the correct acceptance shape.

## Root cause addressed (for the record)
cmd.exe cannot honor namespace/UNC/long cwd spellings and silently falls back
(observed: C:\Windows with exit 0); receipts previously reported requested-cwd and
synthesized exit codes. The composition fixes the general mechanism (preflight +
truthful receipts + containment parity in the preview server), not one prompt.

## Verdict rationale
The composition is what it claims to be (proven above), the fail-closed direction is
correct, regression risk is bounded and checked, and the one real defect found (C1)
is small and well-isolated. Hence APPROVE_WITH_CHANGES, not REJECT or NEEDS_EVIDENCE.
Integration still requires: C1 fix + affected gates, NVIDIA installed review, and
authorized real-UI transfer UAT. No main push/deploy authorized by this review.
