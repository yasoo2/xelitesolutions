# WIRING-147: recall recheck for the 144/145 censuses (executor + orchestrator)

HEAD=d8107812 (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
recall diagnostics, one per target, adapted 1:1 from the proven
recall-146.mts (only target path + census-log path + probe name changed).
Registry + resolvePlannedTool + TOOL_ALIASES + PLANNER_TOOL_CATALOGUE
imported live; target files READ as text (never imported, never executed).
Census logs REUSED from 144/145 (not re-run): zero api/src delta since
674fcca7 (git-verified) and both target SHAs re-verified byte-identical to
the census records (executor 81512cc9..., orchestrator 24e28a43...).
ZERO DISPATCH: no executeTool, no firewall context, no network, no writes,
no registry mutation. Synthetic test-only JWT + JOE_TEST_MODE.
Deterministic stdout (canonical JSON); volatile importMs on stderr only.
Closes OBS-146-2 (recall recheck owed for 144/145).

## Live verdict (clean pairs, byte-identical)

- Executor pair ex1+ex2: 2x EXIT 0, SHA256 5CEF87F7... identical.
- Orchestrator pair or1+or2: 2x EXIT 0, SHA256 5E969229... identical.
- Registered tools: 163 (continuity with 139-146). Recall vocab
  (registered ∪ aliasKeys ∪ catalogue): 191. Equals-style def names: 165.
- Executor: censusNames=46 (matches 144), distinctTokens=1426,
  recallGapCount=1: `shell` (ALIAS_KEY -> shell_execute).
- Orchestrator: censusNames=3 (matches 145), distinctTokens=1494,
  recallGapCount=3: browser_run, central_answer, read_file (all
  REGISTERED_EXACT live).
- Equals-style nonVocab def-name hits: 0 for BOTH targets (same
  clean result as 146). Zero hidden def-names.

## Executor gap audit: `shell` is all-coincidence (verified by direct read)

All 6 bare-word sites are the English word "shell", not tool references:

- :177 JSDoc prose: "a finite shell command" (preview-server doc).
- :195-196 comment: "Chained shell commands remain ordinary shell work".
- :947 `cross-env-shell` npm package token inside the
  NON_LOCAL_SCRIPT_COMMANDS shell-binary allowlist — same coincidence
  class as 144's bash/echo rows in this exact set.
- :1018 JSDoc prose: "Before any planned shell/terminal npm script".
- :1816 comment: "A shell test command that produced an executed test
  report" (adjacent :1821 references shell_execute as a real quoted
  tool name — already in the 144 census).
- Resolves live via the documented shell->shell_execute alias, but
  spelling-match is not semantics: none of the 6 sites invokes,
  dispatches, compares, or names the tool.

Executor TRUE surface UNCHANGED by recall: 0 new real refs, 0 new
dangling, 0 new dispatch. OBS-144-1 (TRUE dangling = 2,
bulk_file_generator + visual_qa) STANDS, now recall-verified.

## Orchestrator gap audit: 3 REAL name refs, all comment/doc prose

- browser_run :791 — Arabic code comment ("until browser_run reaches
  the visible page", browserSessionId handoff note). Real name ref,
  zero dispatch.
- central_answer :653 + :669 — code comments describing the answer
  tool's language-measurement role. Real name refs, zero dispatch.
- read_file :245 — JSDoc for honest-completion wording ("prose
  behavior -> read_file existence"). Real name ref, zero dispatch.
- All 3 resolve REGISTERED_EXACT live (browser_run + read_file also
  inCatalogue; central_answer registered but catalogue-absent, same
  as its registry-only status elsewhere).

Orchestrator TRUE surface = 6 (3 census + 3 recall): phase_executor
:1181 dispatch, joe_engineering_report :1489 dispatch, code_reviewer
receipt handling (:109/:118/:377), browser_run :791 comment,
central_answer :653/:669 comments, read_file :245 doc. The 145 "no
hidden fourth dispatch target" claim HOLDS — recall adds prose refs
only, zero new dispatch.

## Audit findings

- OBS-147-1 (P4, record, PROPOSED, no code): SUPERSEDE OBS-145-1 —
  pin the orchestrator tool-reference baseline at HEAD d8107812 with
  TRUE set = 6 (class split above: 2 dispatch + 1 receipt-handling +
  3 comment/doc prose). OBS-145-1's "exactly 3" is now known to carry
  the bare-word blind spot; keep it preserved as history, cite 147
  as the corrected baseline.
- OBS-147-2 (P4, method, PROPOSED, no code): hyphen-fragment tokens
  (cross-env-shell -> `shell`) resolve through real aliases but are
  a noise class, not refs. Recall verdicts on alias-key tokens must
  be context-audited before counting; spelling+resolution alone
  over-counts. Applied here (shell audited to 0 real).
- OBS-146-2 is CLOSED by this cycle (both 144 and 145 recall-rechecked
  with clean pairs + full context audits). OBS-146-1 (planner baseline
  TRUE=34) already shipped with its own recall and needs no recheck.
- No new wiring defect. Registry <-> resolver <-> executor/orchestrator
  refs remain consistent; every real ref resolves exact live (or via
  the documented edit_file/shell aliases where genuinely invoked).

## Contract regression (UI-001 repair currency, this cycle)

- jest src/__tests__/prose-verification-contract.test.ts +
  src/__tests__/smoke-verification-rewrite.test.ts: 2 suites,
  19/19 PASS, EXIT 0 (log: contract-regression.log in this dir).
- Focused/internal evidence only, not REAL_JOE_UI PASS. The GENERAL
  sanitizer repair (plan-tools.ts:863 `if (v)` + PhaseExecutor prose
  parity) stands on HEAD with zero source delta since.

## Disclosed probe misses (environment/invocation, zero source impact)

- Attempt 0 (not kept): tsx died EPERM creating its IPC dir under the
  sandbox user's inherited TEMP (not writable). Fixed: workspace-local
  TEMP/TMP (tmp/tsx-temp-147, REMOVED after the runs).
- Attempt 1 (not kept): dropped the `cd /d` and cmd aborted on the
  redirect ("Access is denied" in C:\Windows); the shown node error
  was the STALE attempt-0 stderr file, tsx never ran. Lesson recorded:
  keep `cd /d` drive-letter first AND read post-run files only.
- Attempt 2 (not kept): census-log path had one `../` too many
  (ENOENT wiring-144... at root). Fixed in both scripts before any
  kept run; registry import line in that attempt already showed 163
  tools / 21 defaulted / 2 rate-set, matching 141-146.
- Kept runs ex1/ex2/or1/or2 ran AFTER all three fixes; their logs are
  the evidence. stderr pairs differ ONLY in importMs (volatile).
  Stdout carries the same 2 prefix lines before canonical JSON.

## Evidence

- tmp/wiring-147-recall-recheck/recall-147-executor.mts (design)
- tmp/wiring-147-recall-recheck/recall-147-orchestrator.mts (design)
- tmp/wiring-147-recall-recheck/ex1/ex2.stdout.log (5CEF87F7...,
  byte-identical) + stderr logs
- tmp/wiring-147-recall-recheck/or1/or2.stdout.log (5E969229...,
  byte-identical) + stderr logs
- tmp/wiring-147-recall-recheck/contract-regression.log (19/19 PASS)
- tmp/wiring-147-recall-recheck/pre-data-manifest.txt (api/data
  pre-run manifest; post-probe AND post-jest files-only compare =
  2264/2264 files, 0 diffs)
- Tracked tree verified CLEAN (0 dirty) before the first kept run
  and after all runs. api/data untouched, proven twice. No source,
  runtime, worker, or NVIDIA state touched. tsx + jest temp dirs
  REMOVED. Contained data/+logs/ dirs under the evidence dir only
  (probe-cwd artifacts: db/, memory/, users.json, one audit json).
