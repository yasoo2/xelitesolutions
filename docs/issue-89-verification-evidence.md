# Issue 89 Verification Checkpoint

Date: 2026-09-21. Status: local review checkpoint, not issue acceptance.

## Implementation

- Bounded verification receipts and cumulative accounting in the existing orchestrator/phase path.
- Source/configuration/workspace/environment/runtime-target fingerprints, with framed file contents and keyed target identity.
- Focused/affected/final selection, failed-check reruns, and separate final gates.
- Fail-closed verification tool eligibility; ambiguous shell commands are ordinary uncached work, not acceptance checks.
- Measured execution/queue/idle/retry evidence and the existing benchmark's efficiency comparison.
- Associated live-evaluation repairs include navigation supersession/diagnostics, masked screenshots, requested field/board contracts, and acceptance reporting. This accumulated patch is broader than ledger implementation alone.

## Verification

- All ten AGENTS.md commands passed. Local report: `api/data/tests/final-matrix-20260917-155745/report.json`; summed measured duration 138671 ms. These gates precede only the later narrow history-navigation patch and its tests.
- Canonical trace: `api/data/tests/full_engineer_flow/run-fEKguv/verification-evidence.json`. Mocked planner with real tool execution: one initial smoke check, failed build, one repair/build rerun, final smoke/build once each. This is not unrestricted agent autonomy.
- `npm run test:joe:prompt-benchmark -- --verification-only`: five naive executions versus four aware executions, one reuse, identical correctness verdicts. Timing is recorded, not used as a flaky speed assertion.
- Four ledger/phase/planner/command-contract suites passed 89 tests. API `npx tsc --noEmit` passed.
- Latest accumulated affected-suite run: 30 suites passed; one suite had an obsolete assertion requiring mobile title truncation (500 passed, 1 failed). Updated that assertion to require readable wrapping; its entire 11-test suite then passed. Only this test changed afterward. Reports: `api/data/tests/issue89-affected-tests.json` and `issue89-header-regression.json`.
- `npx tsx src/tests/manual/verify_generated_header_fit.ts`: eight actual Chromium cases passed at widths 320, 390, 820, 1280, including an unbroken long name. Initial sandbox launch was denied; approved local execution succeeded. Evidence: `api/data/tests/header-fit-1789651122887`.
- Three browser navigation suites passed 12 tests. `verify_live_navigation_history.ts` used real authenticated local routes/browser: newer Back/Refresh returned 200, superseded goto returned 409, normal forward history passed, preview restored with 200. Forward-overlap is controlled route coverage, not claimed real-browser overlap.
- `git diff --check` passed at the recorded checkpoints.

## Live Acceptance

`npx tsx src/tests/manual/verify_joe_prompt_ui_acceptance.ts` passed on the eligibility/fingerprint revision. Run `run-1789650211953`, elapsed 156371 ms, one final verification selected/passed, no reuse. Report: `api/data/tests/joe-ui-acceptance/2026-09-17T13-03-17-263Z/report.json`.

The same library checkout request passed invalid-input rejection, creation, reload persistence, filtering, returned control, native date input, mobile width, and heading fit. Zero page exceptions/server failures; only Gravatar 404. Desktop/mobile screenshots were inspected. The later history-navigation patch was validated separately without regenerating the application.

On 2026-09-21, the normal Joe UI ran a compact reading-queue request through
`ProjectPlannerTool -> AgentLoopService -> PhaseExecutorTool -> ToolService`.
It completed two phases, proved 14/14 requested criteria, performed a real
SQLite write/read, and passed exploratory Browser QA at 100/100 across six
discovered states. The final `quality_run` recorded the selected scripts and
their outcomes: `test=passed`, `build=passed`, and unavailable `lint` and
`typecheck` were explicitly skipped. This run initially exposed an opaque
final-quality failure; the tool now retains the trusted session for nested
commands and reports unavailable or failed checks explicitly. Direct Codex
in-app-browser inspection also confirmed that the requested finished control
is rendered as a real switch rather than an unstyled native checkbox.

The current AGENTS.md matrix passed after that repair: architecture and package
guards, full engineer flow, build-context, execution-safety, three TypeScript
repair shapes, and both self-healing outcomes. The Issue 89 permanent suites
passed 84 tests. Its deterministic efficiency comparison measured five naive
executions versus four change-aware executions, with the same verdict and one
safe reuse.

Review then found one fail-open edge: an exception thrown by the automatic
build check was logged as a skip. It now becomes a recorded failed verification,
marks the phase partial, and is covered by
`npx jest --runInBand src/__tests__/windows-reality.test.ts src/__tests__/verified-execution-outcomes.test.ts`
(12 tests passed) and `npx tsc --noEmit` (passed). The complete AGENTS.md
matrix was rerun after this correction and passed:
`guard:architecture`, `guard:package-scripts`,
`test:joe:engineer-flow`, all five `test:self-fix:*` variants, and
both `test:self-healing:*` variants.

The first deterministic Jest shard exposed an actual Windows failure in page
version restore: the implicit Unix path `/tmp/joe-artifacts` resolved to an
unwritable `C:\\tmp` path. A shared `artifactRootDir()` now honors an
explicit `ARTIFACT_DIR` and otherwise uses `os.tmpdir()`, and page building,
the local artifact route, browser state, project preview/repair, and related
tools use that same root. The focused `artifact-root` and
`version-history` suites passed 13 tests; the checkout toggle boundary suite
passed 7 tests after its assertion was moved from the thin RecordsApp wrapper
to the rendered RecordsView component.
After restarting only the local development API from this branch, its
`/artifacts/joe-ver-restore.html` route returned HTTP 200 and the restored
artifact opened in the Codex in-app browser. No production service was changed.

## Review And Limits

The existing development task independently identified and statically confirmed repairs for cumulative accounting, non-verification tool acceptance, non-check CLI modes, and history-navigation ownership. It did not run duplicate tests or grant full acceptance. Generated templates/blueprints were not exhaustively reviewed.

- Generic presentation and awkward domain labels remain. Functional acceptance does not prove visual originality.
- Earlier intermittent preview timeout did not recur in the last two UAT runs, but its original root cause is not proven repaired.
- Direct Codex in-app-browser inspection on 2026-09-22 opened the generated
  reading queue at `http://127.0.0.1:4874/`. It exposed a real
  `switch` for the finished state and no unstyled native checkbox. This is
  current user-visible evidence; it does not replace broader visual-originality
  evaluation.
- Script eligibility is not a sandbox for arbitrary package-script contents. ToolService remains the execution/policy gateway.
- Environment/runtime identities conservatively invalidate across process restart.
- Local raw reports are not automatically tracked; reproducible permanent tests and this summary do not replace GitHub CI or reviewer acceptance.
- A complete Jest run first exposed two baseline defects: a CSS test that
  depended on declaration order, and a partial child-process mock that lacked
  EventEmitter cleanup. Both focused regressions now pass after narrow fixes.
  The subsequent silent full-suite retry exceeded the local time budget without
  a final result and was stopped; it must be completed in CI or by the
  supervisor before merge.
- The first of eight deterministic Jest shards was rerun after the checkout
  correction. It still reports unrelated pre-existing failures in substitution
  messaging, internal source-string assertions, project-edit route ordering,
  and local-brain expectations. These are not treated as a passing full suite;
  each requires an independent diagnosis before final acceptance.
- GitHub Actions run 35659075334 for this PR did not start any of its three
  required jobs because the GitHub account is locked by a billing issue. The
  annotations identify that external account condition, not a code failure.
  No billing setting was changed and no blind CI rerun was requested.
- No production deployment, main-branch merge, or universal autonomy claim is part of this checkpoint. The 500-prompt objective remains incomplete.
