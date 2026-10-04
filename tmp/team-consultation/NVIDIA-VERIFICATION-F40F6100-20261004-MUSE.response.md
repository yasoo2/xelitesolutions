# MUSE independent review — NVIDIA verification dependency commit f40f6100

AGENT=MUSE
CONSULTATION_ID=NVIDIA-VERIFICATION-F40F6100-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_VERIFICATION_AND_LEDGER_WITH_REQUIRED_CLI_MATCHER_FIX
RECOMMENDATION=APPROVE_WITH_CHANGES
EXACT_SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048
EXACT_DIFF=3 files, 52+/14- (PhaseExecutorTool.ts, verification-ledger.ts, app-blueprints.ts)
PARENT=a10c71ab14411e682be7a7e4e5ffd07467d960ac
REVIEW_DATE=2026-10-04
SHARED_WRITE=NOT_ATTEMPTED_BY_SANDBOX_POLICY (fallback file; Codex to import verbatim)

## Scope actually inspected (exact bytes, read-only)

- Full f40 diff plus parents de73cfb4 (prose normalization, AgentLoop receipt key)
  and 02a37c9b (Gap-A/B downgrade, 4-arg isVerificationTool calls).
- All f40-tree call sites: isVerificationTool (plan-tools, plan-verification,
  PhaseExecutor x2), hasExplicitRecordSchema (ProjectPipelineTool x2,
  acceptance.ts, detectAppKind), isCliRequest (hasExplicitRecordSchema + Gap tests).
- Full Gap-A/B test file and sanitizer/executor/ledger prose chain.
- Independent reruns on extracted exact-f40 api tree (git archive, SHA-pinned
  sources) with jest cache + TEMP redirected to workspace scratch:
  tmp/f40-review/rerun-3suites.log, rerun-adjacent.log, control-a10.log,
  gate-engineer-flow-f40.log, tsc-f40.log, tsc-a10.log.
- Parent-tree (a10) control runs with the identical harness for every failure.
- NVIDIA dirty CLI tests (read-only) for overlap with the isCliRequest finding.
- No provider calls, no NVIDIA worktree writes, no runtime start/stop, no UAT
  attempted (both :5000 and :5002 down; Codex owns source-bound restoration).

## What I independently verified GREEN on exact f40 bytes

1. Dependency story is real. a10 tsc shows
   PhaseExecutorTool.ts(2342,123)+(2343,84) TS2554 Expected 1-3 args, got 4,
   and 02a-tree grep proves isCliRequest had zero production definition while
   02a tests require it. f40 supplies both; f40 tsc has ZERO errors in the 3
   changed production files (remaining diagnostics are pre-existing test-file
   and missing-web-import issues, identical on a10).
2. Gap-A/B honest stops hold. Prose string -> sanitizer verificationNote
   (plan-tools.ts:1011) -> wasOriginallyProse (executor:2288) -> prose-pass
   yields ok=false + status=partial (2588-2589, realVerificationPassed=false),
   so canonical rules (ok===true AND status===completed; partial stops unless
   self-fix succeeds) are preserved. Invalid/non-prose read_file and
   project_detect prose-without-output are rejected or failed honestly.
3. G4.ii ledger fix holds. Prose-pass records 'incomplete'; selectVerification
   reuses only previous 'passed' receipts, so prose observations can never mint
   reusable passed receipts.
4. Final gates never opt in. plan-verification.ts and task-level executor:1567
   call isVerificationTool without the 4th arg (defaults false).
5. Focused suites: verification-contract-gaps + prose-regression +
   smoke-rewrite = 19/19 PASS, exit 0 on exact f40 bytes.
6. test:joe:engineer-flow PASSED on exact f40 bytes (canonical pipeline,
   self-fix rerun, reuse, final gate).
7. Adjacent suites: 7/9 pass (incl. a-planner-that-succeeds and
   engineering-discovery schema suites). The 2 failing suites fail IDENTICALLY
   on parent a10 (same 23 tests, same 15 assertion sites): pre-existing, zero
   f40 delta. f40 neither caused nor fixed them; they stay open.

## F1 (REQUIRED, blocking adoption): isCliRequest over-fires on generic words

Bare `tool|script|utility` alternatives flip schema-true WEB prompts to
schema-false. Proven a10->f40 flips on exact bytes (parent-tree control):

- FLIP 'Create a task tracking tool with name, owner, due and priority columns'
- FLIP 'Build a sales dashboard tool with region, revenue and quarter columns'
- FLIP 'Create a team utility with name, role and email columns'
- FLIP 'Build a report script with title, author and date columns'
- FLIP 'Build a task tracking tool with name, owner and due columns'

Impact (sourced): hisOwnSchema (ProjectPipelineTool.ts:1339-1342) is lost, so
these requests fall from deterministic no-LLM planning into provider-dependent
model planning, and stop hard with provider_unavailable when the provider is
down. Also lost: page->app promotion (:645), detectAppKind 'generic'
short-circuit (app-blueprints.ts:501), acceptance columns (acceptance.ts:558).
The committed suite has only 3 isCliRequest assertions and zero web-negative
cases; NVIDIA dirty CLI tests also assert expectedSchema=false everywhere, so
no existing test guards this boundary. The 10 AGENTS gates cannot catch a
semantic routing flip (engineer-flow uses a mocked plan).

Required fix (owner NVIDIA, bounded): narrow isCliRequest so bare
tool/script/utility do NOT imply CLI; require explicit CLI-deliverable context
(cli, command-line, console/terminal app, exit code, stdin/stdout, argument
parsing) and require CLI context for the csv/file sub-rule. Commit negative
regression tests pinning the 5 flipped web prompts schema-true plus CLI
positives (exit code/stdout/arg-parsing variants). Rerun gaps + schema +
pipeline + acceptance suites and engineer-flow on the fixed bytes.

## F2 (REQUIRED evidence): owner "36/36 + 10 gates" is commit-message-only

No gate/test log receipt found (NVIDIA heartbeat stale at a10; no cycle96
fallback response). My exact-byte count for the 3 verification suites is 19,
not 36; 19 + the reported 17 dirty-only CLI tests = 36, which suggests part of
the claimed evidence is not in the commit. Owner must publish the exact suite
list and gate logs for the fixed bytes. My independent reruns above cover the
3 committed suites + engineer-flow + tsc; the other 9 gates are owner-receipt
only and are NOT independently confirmed.

## Recommended hardening (non-blocking, file as follow-ups)

- H1: reuse branch (executor:2385) does not re-check prose-origin; an explicit
  planner verificationId colliding with an older passed receipt could reuse
  for a prose check. Force 'selected' when wasOriginallyProse.
- H2: isSingleOutputObservationPath allows absolute paths (Windows absolutes
  also pass the sanitizer's startsWith('/') filter). Reject absolutes to match
  evident intent; containment currently relies solely on ToolService.
- H3: executor log/comment names 'read_file/project_detect' as the prose-pass
  path, but project_detect is rejected (honest stop). Fix wording; consider a
  distinct code for prose-without-output vs unsupported-contract so the
  original CRITICAL error string is not reused for a different condition.
- H4: plan-tools.ts:948 passes allowExistenceObservation=true in a call that
  only executes for shell_execute; harmless but misleading. Pass false.
- H5: gaps-test type hygiene (mock shapes, verificationNote on output union)
  is pre-existing on a10; leave for test-hygiene scope, do not weaken tests.

## Root cause / proposal assessment / alternatives / overlap

- Root cause of the 02a break (missing 4th param + missing export) is correctly
  diagnosed and correctly repaired by f40's ledger/executor portions.
- Proposal error is confined to F1: word-list CLI detection without
  deliverable context. Simpler alternative: check CLI-deliverable context
  first (or reuse PlanningEngine CLI scope signals) instead of bare-noun
  matching inside hasExplicitRecordSchema.
- Overlap: Muse M03 terminal-runtime veto is main-absent lineage covering
  similar CLI intent; converge isCliRequest with it during later
  reconciliation instead of growing two matchers. No action this cycle; no
  competing Muse implementation written.
- Regression risk beyond F1: none found (adjacent-suite delta zero;
  production tsc delta is strictly the TS2554 fix).
- Security: no new execution authority; verification reads route through
  ToolService like ordinary tasks. H2 closes the residual path-shape gap.
- Maintainability: f40 diff is small and readable; H3/H4 nits only.

## Required tests before integration/adoption

1. New committed negatives for the 5 flipped prompts (+CSV-import web case).
2. Gaps + prose + smoke + ledger-adjacent + schema + pipeline + acceptance
   suites green on fixed bytes (ledger/change-aware pre-existing failures
   must at minimum show zero delta vs their parent baseline).
3. tsc: zero errors in touched production files (already true for f40's 3).
4. engineer-flow + affected AGENTS gates with published logs.
5. Muse re-review of the fixed bytes, then source-bound runtime restoration
   (Codex-owned) and fresh multi-prompt Real Joe UAT. No UI PASS is claimed
   by this review; none was attempted.

## Conditions

- This APPROVE_WITH_CHANGES covers the verification/ledger mechanism only.
- Do NOT adopt f40 to any runtime or integrate until F1+F2 are closed and
  Muse has re-reviewed the fixed bytes.
- Preserve all NVIDIA dirty work and untracked CLI tests; the fix should
  promote the CLI tests (with added web negatives) into a commit.
