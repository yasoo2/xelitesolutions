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

The same shard exposed an honesty failure in the capability disclosure:
a request that reached model-authored `custom` behavior was treated as if a
ready engine existed, even though its registry has no proven contract. Joe
now classifies that state as a substitution, and preserves English relative
clauses when quoting the user's subject. Focused substitution and headline
suites passed 30 tests, followed by `npx tsc --noEmit`. In a fresh local
Guest session in the Codex in-app browser, the Arabic poetry-metre request
visibly showed the pre-build disclosure in both live activity and Logs before
planning continued. The local run was then stopped to avoid spending effort
on an intentionally unsupported build.
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
- The four source-sensitive failures in that shard were independently
  diagnosed after the runtime behavior was confirmed. Their checks now follow
  function/branch boundaries rather than arbitrary character windows, and the
  admin-screen test generates both a model-backed app and a no-model app.
  The four focused suites passed 57 tests, TypeScript passed, and the rerun of
  deterministic Jest shard 1/8 completed without a reported failure. This is
  shard evidence only, not a claim that all eight shards or the full suite pass.
- GitHub Actions run 35659075334 for this PR did not start any of its three
  required jobs because the GitHub account is locked by a billing issue. The
  annotations identify that external account condition, not a code failure.
  No billing setting was changed and no blind CI rerun was requested.
- No production deployment, main-branch merge, or universal autonomy claim is part of this checkpoint. The 500-prompt objective remains incomplete.

## 2026-09-22 Capability Routing Follow-up

An in-app-browser UAT exposed two connected live failures for the Arabic
request `فحص أمني للموقع`:

1. The first run spent about 55 seconds in deep intent analysis before any
   plan, although the registry could deterministically identify
   `security_scanner`.
2. After the analysis skip was added, the short-message chat fallback and then
   an unscoped scanner invocation each caused a slow or malformed execution.

The repair is registry- and schema-driven rather than prompt-specific:

- Fuzzy action repair now requires grammatical action context, preventing an
  ordinary adjective such as `أمني` from becoming the imperative `ابني`.
- `IntentParser` carries a revalidated deterministic capability candidate past
  the deep model analysis. `PlanningEngine` resolves that candidate before
  broad browser/chat classifiers, still through the normal plan and
  `ToolService` path.
- A deterministic candidate performs only its validated capability, not a
  second loosely related registry match.
- `security_scanner` now declares its genuine one-of input contract. A
  capability with declared but unavailable inputs becomes `ask_user` with the
  missing contract instead of a malformed tool call. Explicit local filesystem
  paths are passed to filesystem-shaped tool fields.

Focused tests passed: `a-question-is-not-an-order`,
`tool-argument-contract`, `content-and-intent`, and
`the-planner-asks-the-tools` — 86 tests total. The first local browser UAT
showed `IntentParser` skipping deep analysis and the planner selecting only
`security_scanner`. The next UAT intentionally supplied no target and visibly
showed `ask_user` with the required target fields; the run ended after that
request without a scanner input error or unrelated repair loop. The UAT used
the Codex in-app browser at `http://127.0.0.1:5002/joe`; only the local
development API was restarted.

The complete AGENTS.md gate matrix passed again after this batch:
`guard:architecture`, `guard:package-scripts`,
`test:joe:engineer-flow`, all five `test:self-fix:*` variants, and both
`test:self-healing:*` variants. The latest full-engineer evidence is
`api/data/tests/full_engineer_flow/run-GctBWx/verification-evidence.json`.

Known limitation: this evidence proves deterministic selection and missing-
target handling, plus planner-level propagation of an explicit local path. It
does not claim a completed security scan of an arbitrary external site; a real
scan requires a selected trusted workspace or supplied local target.

## 2026-09-22 Records-Application Follow-up

The Codex in-app-browser UAT used the unseen request `عندي مزرعة إبل. بدي سجل
أسجل فيه بيانات الناقة: اسم الناقة والعمر والوزن`. It exposed a general
handoff defect: `hasExplicitRecordSchema()` correctly derived the three fields,
but deterministic pipeline planning reclassified the request as a static Page
and sent it to `web_page_builder`. That tool made no visible progress for one
minute, so the local run was stopped rather than spend another provider round.

`deterministicPhasesFor()` now preserves a declared record schema as an
interactive application unless the stronger system scope already applies. A
fresh local UI run visibly reached `Phase 1/1 — Application` and
`react_project`, not the Page/web-page-builder route. Its install then failed
with `npm install ... exit 1`; the canonical pipeline stopped with the explicit
`build_produced_no_bundle: npm install did not finish — exit 1` result. It did
not open a blank preview, claim a completed build, or enter an invented repair
loop. This is a verified honesty and propagation result, not a delivered app.

React delivery now requires a real `dist/index.html` only after Joe actually
attempts installation/build; the explicit scaffold-only (`skipInstall`)
contract remains a non-delivery mode rather than a false build failure. Normal
npm installation now receives a project-scoped `.joe/npm-cache` path instead
of assuming the user's profile cache is writable. The focused React, routing,
records-shape, and build-honesty suites passed after the contract correction.

The final rendered records UI could not be re-inspected in this checkpoint:
the attempted build produced no bundle, and then the Codex browser connector
reported the user unavailable. That is recorded as an environment limitation,
not browser QA success. The next live retry must verify the new scoped-cache
path, a successful bundle, and the actual preview before any delivery claim.

## 2026-09-22 Dependency-Free Records Recovery

The same unseen camel-record request exposed an environment recovery gap after
the planner and phase routing were corrected: a local-only records application
still stopped before a preview when one bounded `npm install` could not prepare
the React toolchain. Repeating that install in `project_run` would add cost
without new evidence.

`ReactProjectTool` now has a deliberately narrow, dependency-free fallback for
standalone records contracts. It writes `dist/index.html` only after an actual
install/build attempt fails, and only when the request has no backend, external
integration, workflow, relation, or image-upload contract. The artifact uses
the request-derived fields and native input types, required validation,
create/edit/remove, search, local persistence, and CSV export. It carries a
machine-readable `joe-artifact-mode=static-records` marker.

`project_run` recognizes only that marker and serves it through its existing
gateway-owned static preview server, avoiding a second `npm install` or Vite
launch. Other projects retain their regular runtime dependency checks; this is
not a general bypass for React, API, authentication, or production delivery.

Focused tests proved the fallback eligibility guards, generated field contract,
browser-script syntax, persistence/export/edit/delete code, marker detection,
and run-path selection. The React project and project-run suites were also run,
as were `tsc --noEmit`, both architecture/package guards, full engineer flow,
and the required self-fix/self-healing scripts.

No visual acceptance claim is made for this new path yet. The Codex in-app
browser connector remained unavailable, so the next live camel-record retry
must inspect the served fallback in the visible Joe browser and exercise valid
and invalid form input, persistence, edit, deletion, CSV export, and a mobile
viewport before it can count as completed UAT.

## 2026-09-22 Economical Offline Records UAT

The camel-record scenario was rerun only after each newly observed root cause
was corrected. It showed that a fallback-eligible records application still
inherited the normal five-minute idle allowance and, after that timeout, could
attempt an unnecessary native `esbuild` repair. The local recovery path now has
one 75-second absolute / 30-second idle install budget and skips native package
repair when that bounded attempt fails. Ordinary React projects retain their
existing install and repair behavior.

The same live run exposed a second boundary error: `quality_run` tried
`npm run build` after a deliberately dependency-free records artifact had been
written, then failed because Vite was not installed. The quality tool now marks
`build` passed only after it verifies the exact `dist/index.html` marker
`joe-artifact-mode=static-records`; an unmarked `dist` continues to run its
normal build script and fail honestly. The final local canonical run reached
the completed `react_project` task, passed `quality_run` (`test=passed`,
`build=passed`), and started `project_run` at `http://127.0.0.1:4300/`.

Provider availability also exposed an acceptance-cost issue. A records
collection phrase such as `سجل لتسجيل بيانات الناقة` is now proven directly
only when a real records form plus local persistence exists; a data-collection
phrase without the register verb also requires its name in generated content.
The focused test proves this path without a provider call. This is not a
blanket acceptance bypass.

Direct UAT was completed in the Codex in-app browser at
`http://127.0.0.1:4300/`: the Arabic interface showed no blank preview square;
a camel record was created, found by search, edited from weight 420 to 430,
and still existed after reload. Submitting blank required fields exposed both
the native Arabic invalid-input message and the in-app validation message. At
390px the form stacked cleanly with no overlap; the data table retained a
bounded horizontal scroll. The preview remains open in the in-app browser.

Joe's own browser watcher was not attached to that session, so its pipeline
correctly reported visual QA as not performed and did not claim delivery. This
manual in-app-browser evidence closes the observed visual defect but does not
turn the watcher integration into a passing automated Joe Browser QA result.
Focused evidence after this batch: records acceptance (29 tests with the
new case), quality-run evidence (6 tests), dependency-free records recovery
(3 focused tests), TypeScript no-emit, and `git diff --check` all passed.
