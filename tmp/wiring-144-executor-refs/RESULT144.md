# WIRING-144: executor tool-name reference census (PhaseExecutorTool.ts)

HEAD=674fcca7 (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
census: registry + resolvePlannedTool + TOOL_ALIASES imported live (same
as 143); the executor file is READ as text (never imported, never
executed). Every quoted tool-shaped literal AND every vocabulary-matching
regex token in the file is resolved live through the executor's OWN
resolver. ZERO DISPATCH: no executeTool, no firewall context, no network,
no writes, no registry mutation. Synthetic test-only JWT + JOE_TEST_MODE.

## Live verdict (clean pair run1+run2, 2x EXIT 0, byte-identical SHA256 42C55530...)

- Executor file: 2663 lines (python-verified), sha 81512cc9...,
  153062 bytes on disk (CRLF).
- Registered tools: 163. Vocabulary (registered ∪ aliases ∪ catalogue ∪
  static `name:` hits): 203.
- Referenced vocabulary names in the executor: 46 =
  REGISTERED_EXACT 40 + ALIAS_KEY 2 + DANGLING_DECLARED 4 +
  REGISTERED_NONEXACT 0 + DANGLING_UNDECLARED 0.
- Non-vocabulary literals, fully listed: 9 underscore + 60 plain.
  Underscore: code_fix, current_run, expose_port, fatal_error,
  node_modules, npm_install_failed, regenerate_engine,
  run_cancelled_by_owner, stale_run_dropped — all run-state/status
  words, zero legacy tool names (no image_generation-class strings).
  Plain 60: all status/schema/shell words (completed, failed, partial,
  npm, node, utf8, ...), zero toolish names. Full lists in the logs.

## Dangling verdict: the 141 set is COMPLETE for this file

- TRUE dangling tool refs = exactly 2, both already known:
  bulk_file_generator (quoted :112/:254, write-list membership) and
  visual_qa (regex :1737/:2047/:2051, verification gates). No third
  dangling name hides anywhere in the 2663-line executor.
- The other 2 DANGLING_DECLARED rows are PROVEN coincidences, audited
  by exact line context: 'app' is a regex token at :146 matching the
  English word in run-descriptions (`project|app|application|server`),
  and 'next' is a regex token at :170-171 matching the Next.js npm
  package. Their `declaredIn` hits are schema/plugin `name:` noise
  (MobileBuilderTool.ts:447 `name: 'app'` field; Orion fixture :186
  `{ name: 'next' }` compiler plugin), not tool declarations.
- Alias rows: grep_search :270 is a SEMANTIC reference — it sits in the
  runtime-artifact-source set with the explicit comment "Legacy
  declaration; the registered search path is intentionally redirected
  elsewhere." bash :946 is coincidental (NON_LOCAL_SCRIPT_COMMANDS
  shell-binary allowlist, not a tool dispatch).
- Of the 40 REGISTERED_EXACT, 39 sit in tool-list/dispatch/verification
  contexts; echo is the proven-coincidental one (sole line :947, same
  shell-command set as bash). Rows carry line numbers for audit; the
  census classifies spelling+registration, not semantics.

## Audit findings

- OBS-144-1 (P4, record, PROPOSED, no code): pin the executor dangling
  baseline for this file at HEAD 674fcca7 — TRUE set = 2
  (bulk_file_generator, visual_qa); coincidental lookalikes = app, next,
  bash, echo with the contexts above. Any future "executor references
  unknown tool X" claim against this file must reproduce this census
  before opening a wiring defect. Feeds OBS-141-2 (P2 repair decision
  still open, owner unassigned, NVIDIA-overlapping scope untouched).
- No new wiring defect. Registry <-> resolver <-> executor-refs are
  consistent: every TRUE executor tool reference resolves exact live
  (or is one of the 2 known dangling), and no legacy/renamed tool name
  survives anywhere in the executor source.
- Methodology caveat (disclosed, bounds the static half): the naive
  `name: 'xxx'` static pattern matched only 16 names across the
  definitions dir and most are schema/plugin noise — real tool
  definitions use other declaration forms (140b remains the authority
  for def-sites). declaredIn is corroborating-only here; the bulk/
  visual_qa dangling verdicts rest on 140 (import/def-site evidence) +
  141 (live unknown_tool dispatch), not on this pattern.

## Disclosed probe misses (environment/design, zero source impact)

- Attempt 0 (not kept): probe resolved the definitions dir against the
  process cwd (tmp subdir) → ENOENT after the live imports succeeded.
  Fixed BEFORE any kept run: resolve from import.meta.url.
- First clean pair (2x EXIT 0, EC9C5E25, SUPERSEDED): verdicts identical
  to the kept pair, but non-vocabulary plain literals were counted (60)
  not listed — insufficient for the completeness claim. Probe patched
  to list them; kept run1/run2 are the rerun pair (42C55530).
- Ad-hoc PowerShell `Get-Content | Measure-Object -Line` reported 2526
  lines for the executor; the probe's 2663 is independently confirmed
  by python split. The 2526 is an ad-hoc counting artifact, not cited.
- One ad-hoc inspection command failed on `$_.`-quoting (output noise
  only); contexts were read via file reads instead. Zero evidence impact.
- stderr pair differs ONLY in importMs (volatile timing, stderr-only).
  Registry default notes identical to 141/142/143 (21 defaulted, 2
  rate-set). Stdout carries the same 2 prefix lines before canonical JSON.

## Evidence

- tmp/wiring-144-executor-refs/probe-execrefs.mts (census design)
- tmp/wiring-144-executor-refs/run1/run2.stdout.log (42C55530..., byte-identical) + stderr logs
- Tracked tree verified CLEAN (0 dirty) before the first kept run and
  after all runs. api/data untouched (latest writes Oct 1). No source,
  runtime, worker, or NVIDIA state touched. tsx cache dir REMOVED. Zero
  strays outside tmp/ (only pre-existing issue86/jest-cache + the
  pre-existing `tmp/cache-tsx-143 ` path remain).
