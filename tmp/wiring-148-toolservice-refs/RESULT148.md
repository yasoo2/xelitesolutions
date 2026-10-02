# WIRING-148: ToolService tool-name reference census + recall (execution gateway)

HEAD=d468cd71 (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
census + recall diagnostics, adapted 1:1 from the proven 146 pair (only
target path + probe name changed). Registry + resolvePlannedTool +
TOOL_ALIASES + PLANNER_TOOL_CATALOGUE imported live; ToolService.ts READ
as text (never executed beyond the constant import). ZERO DISPATCH: no
executeTool, no firewall context, no network, no writes, no registry
mutation. Synthetic test-only JWT + JOE_TEST_MODE. Deterministic stdout
(canonical JSON); volatile importMs on stderr only. Census and recall
shipped together (146-style), so 148 carries no recall debt.

## Live verdict (clean pairs, byte-identical)

- Census pair run1+run2: 2x EXIT 0, SHA256 4C8F758A... identical.
- Recall pair recall1+recall2: 2x EXIT 0, SHA256 62F6938A... identical.
- Target: api/src/modules/tools/definitions/../services/ToolService.ts,
  985 lines, 51341 chars probe-read (52104 bytes on disk, multibyte
  comments), SHA256 f8608f51d5edf5ad16a95e5ba65ce0c836f63fa0a4af74fa3c3fe855537d3515.
- Registered tools: 163 (continuity with 139-147). Census vocab
  (registered ∪ aliasKeys ∪ aliasTargets ∪ catalogue ∪ colon-declared):
  203. Recall vocab (registered ∪ aliasKeys ∪ catalogue): 191.
  Colon-style declared names: 16. Equals-style def names: 165.
- Census: 53 vocab refs = 36 REGISTERED_EXACT + 13 ALIAS_KEY +
  4 DANGLING_DECLARED + 0 REGISTERED_NONEXACT + 0 DANGLING_UNDECLARED.
  nonVocab literals: 45 underscore + 48 plain (all class-audited below).
- Recall: distinctTokens=1164, recallGapCount=17 (15 ALIAS_KEY +
  2 REGISTERED_EXACT), nonVocabDefHits=0 (zero hidden def-names).
- stderr pairs differ ONLY in importMs (7057/9068, 7637/8118).
- TRUE tool-name surface = 53 census + 17 recall − 1 coincidence-only
  row (express) = 69 real refs, fully audited below.

## Recall gap audit (17/17 real, 1 coincidence site)

- 15 ALIAS_KEY gaps are the unquoted TOOL_ALIASES table keys at
  :219-248 (bash :245, cat_file :229, code_search :220, fetch_url :248,
  file_search :225, find_files :226, glob_search :227, open_file :230,
  remove_file :237, ripgrep :219, rm_file :238, search_in_files :223,
  shell :246, str_replace :241, unlink_file :239). Census caught the
  other 13 keys quoted elsewhere; union = 28/28 alias keys, zero
  overlap. The full alias table lives in THIS file (:212-249).
- shell has a second site at :160, comment prose ("broad shell approval
  gate") — coincidence per the OBS-147-2 method; the token itself is
  real via :246.
- browser_summarize :933 + browser_translate :934 — real name refs in
  the apology-only comment ("central_answer, browser_summarize and
  browser_translate all returned ok:true"). Zero dispatch. Same class
  as 147's orchestrator comment refs.

## Census dangling audit (4)

- generate_image :552 — REAL redirect target: :551 `image_generate`
  rewrites to `generate_image`, which is DECLARED
  (ImageGenerationTool.ts:5) but UNREGISTERED. Any call taking this
  path fails at :700-720 with unknown_tool. GHOST REDIRECT in the
  canonical execution path. See OBS-148-1.
- visual_qa :74 (rate-limit bucket special-case) + :562 (browser
  session injection) — real code refs to a DECLARED-but-UNREGISTERED
  tool (VisualQATool.ts:13). Both clauses are unreachable at runtime
  (unregistered names return at the :700 gate before :788/:778 use
  them; :562 sets sessionId on an input doomed to unknown_tool).
  Dead-but-present wiring. See OBS-148-3.
- codebase_navigator :562 (same session injection, same doomed-input
  status) + :198 (low-risk regex alternative in classifyToolRisk —
  unreachable, risk runs at :778 post-gate). See OBS-148-3.
- express — regex ONLY (:393 backendish flavour test for the
  scaffold_full_stack redirect). Framework word, not a tool ref —
  coincidence class (same as 144's bash/echo). Declared name in
  DatasourceTool.ts:60 is unrelated to this site.

## nonVocab audit (45 underscore + 48 plain)

Underscore literals split into exactly three classes:
- 31 REDIRECT-LAYER names: left-hand sides of the :344-553 `if (name
  === ...)` rewrite chain (browser_open/get_state/snapshot, npm_*,
  install_package, command_execute, manual_test, verify_build,
  project_scaffold, modify_file, view_file, get_file, dependency_scan,
  security_audit, run_quality, lint_project, detect_project,
  scan_project, web_pipeline, scaffold_website, read_file_tree,
  open_browser, web_browse, git_commit, git_push, github_create_repo,
  image_generate). Real ALTERNATE tool-name surface, invisible to the
  registry/resolver/catalogue vocab. 7 more chain LHS are plain words
  (audit, browse, commit, dir, exec, push, terminal :429-536), so the
  hard-coded chain covers 38 names total.
- 5 action/mode values, not tool names: browser_test :134 (input MODE
  string), extract_text/get_elements :135 + ui_audit :358/:365
  (browser ACTION types), expose_port :153 (deploy action value).
- 9 error/status/event strings: approval_required :783,
  rate_limited :792, session_forbidden :752, workspace_required :766,
  unknown_tool :701/:714/:717, tool_done :957, tool_started :805,
  tool_implementation_missing :966, run_cancelled_by_owner :971/:982.
Plain literals (48) are generic English/status words plus the 7 chain
LHS above; none is in vocab by construction and nonVocabDef=0 rules
out equals-style def collisions. Zero hidden tool refs.

## Headline: TWO alias layers, two shadowed rows

ToolService has TWO aliasing mechanisms: the TOOL_ALIASES table
(:212-249, consulted at :691-698 as fallback) and the hard-coded
if-chain (:344-553, runs FIRST). 13 names sit in BOTH. 11 agree on
target (chain adds containment/richer rewrites). TWO DISAGREE — the
chain silently overrides the table with a DIFFERENT registered tool:
- web_search: chain :368 → browser_run vs table → search_api.
  TABLE ROW SHADOWED (also makes :644's web_search status branch
  unreachable — effectiveName can never be web_search there).
- run_command: chain :429 → shell_execute vs table → terminal_manager.
  TABLE ROW SHADOWED.
Both targets are registered, so both paths "work" — but the resolver
visible to planner/audit (table) and the behavior (chain) disagree.
The 143 "28/28 aliases via dispatch path" receipt tested table
resolution, not end-to-end executeTool interception; this refines it.
See OBS-148-2. (:74's browser_open rate-limit clause is likewise
unreachable — :344 rewrites first; browser_run inherits the bucket.)

## Audit findings

- OBS-148-1 (P1, ghost redirect, PROPOSED, no code): :551-552
  image_generate → generate_image dead-ends at unknown_tool because
  generate_image is unregistered. Corroborates the CREATIVE-SAFETY
  image_generate→generate_image→unknown_tool chain with exact lines.
  Repair direction (backlog, needs owner+review): register a SAFE
  image tool or fail closed with a clear message; do NOT just
  register ImageGenerationTool (paid-on-key + unverified-URL defects
  already recorded).
- OBS-148-2 (P2, contract ambiguity, PROPOSED, no code): dual alias
  layers disagree on web_search and run_command targets; table rows
  shadowed by the if-chain. Repair direction: single source of truth
  (chain delegates to table, or table corrected to chain behavior +
  pinned test); add an end-to-end alias-parity test through
  executeTool's rewrite path, not just the table.
- OBS-148-3 (P4, record, PROPOSED, no code): pin the ToolService
  TRUE-surface baseline at HEAD d468cd71: 69 real refs (36 exact +
  28/28 alias keys + 4 dangling rows incl. 1 coincidence + 2 comment
  refs), 38-name hard-coded redirect surface, 5 dead/unreachable
  name clauses (:74 browser_open/visual_qa, :198 codebase_navigator
  alternative, :562 visual_qa/codebase_navigator injection,
  :644 web_search status). No code change; audit-only baseline.
- No registry/resolver inconsistency: every real ref resolves exact
  live (or via its documented alias). No new defect beyond the three
  OBS items above.

## Contract regression (UI-001 repair currency): ENVIRONMENT-BLOCKED

- Four jest attempts this cycle, ~50 min total, ZERO output bytes:
  cold-cache full run (33 min, single process, no workers spawned,
  terminated by owner), warm-cache retry (4 min, killed by 240s
  timeout), --listTests haste probe (150s, timeout), post-contention
  warm retry (600s timeout). All targeted the same 2 suites that
  passed 19/19 in 23s one cycle earlier (bl receipt).
- NOT a test failure: jest/haste never reached test execution (no
  workers, no cache writes, empty log). Nothing changed under api/
  between bl's green run and these stalls (only two log files at
  18:33-34, pre-dating bl). NVIDIA's own jest runs completed in the
  same window (9-worker burst observed and self-reaped; hands off —
  left untouched). Diagnosis: haste crawl wedged under box contention
  in THIS worktree; cause not fully isolated, no source implicated.
- Currency INSTEAD proven by zero-delta: git diff d8107812..d468cd71
  -- api/ = 0 lines (full delta 15 files, docs/evidence only). bl's
  19/19 PASS receipt stands on byte-identical source. Next cycle
  should re-attempt the re-run when contention is lower; do NOT
  weaken or skip it silently.
- contract-regression.log in this dir is a 0-byte placeholder from
  the killed runs (kept honestly, not faked).

## Disclosed probe misses (environment/invocation, zero source impact)

- Attempt 0 (not kept): PowerShell `>` redirect wrote UTF-16 logs;
  recall's utf8 JSON.parse choked on null bytes. Fixed: re-ran all
  four probes via cmd /c (UTF-8 bytes, matching 144-147).
- Attempt 1 (not kept): node EISDIR lstat 'D:' — PowerShell device-path
  cwd (\\?\D:\...) unresolvable by node. Fixed: drive-letter
  Set-Location / cd /d first (known UNC-workdir lesson).
- Kept runs ran AFTER both fixes. Census prefix [Config] line carries
  5 codepage-mangled bytes (·/→) identically in both logs — cosmetic,
  outside the JSON body. Stderr → arrows likewise mangled identically.
- No probe-cwd strays this run (no data//logs/ artifacts); root and
  api/data verified clean. tsx + jest temp dirs REMOVED.

## Evidence

- tmp/wiring-148-toolservice-refs/probe-svcrefs.mts (design)
- tmp/wiring-148-toolservice-refs/recall-148.mts (design)
- tmp/wiring-148-toolservice-refs/run1/run2.stdout.log (4C8F758A...,
  byte-identical) + stderr logs (importMs-only delta)
- tmp/wiring-148-toolservice-refs/recall1/recall2.stdout.log
  (62F6938A..., byte-identical) + stderr logs
- tmp/wiring-148-toolservice-refs/contract-regression.log (0 bytes,
  environment-blocked; see above, not a result)
- tmp/wiring-148-toolservice-refs/pre-data-manifest.txt (post-probe
  files-only compare = 2264/2264 files, 0 diffs)
- Tracked tree verified CLEAN (0 dirty) before the first kept run
  and after all runs. No source, runtime, worker, or NVIDIA state
  touched. Zero strays.
