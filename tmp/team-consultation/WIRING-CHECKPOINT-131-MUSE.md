# WIRING CHECKPOINT 131 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=8461ac95 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: REGISTRY RECONCILIATION + alias/redirection mechanics
## FIRST live proofs (Level 2/3/4) — closes the 130 open item
DEFINED true tools (definitions/*.ts, both declaration shapes,
zero double-quoted declarations of either shape):
- class-style anchored `^\s*name\s*=\s*'X'`: exactly 160 (the
  anchored pattern automatically excludes the 3 junk strings —
  my-project/project/photography-studio.png are inline/template
  usages, never declarations; METHOD FIX vs 130's unanchored 163).
- object-style `name: 'X'` true tools: exactly 8 (4 registered +
  4 orphans; other `name:` strings are finding-titles/headers).
- DEFINED = 168. REGISTERED = 163 (159 class + 4 object).
  IMPLEMENTED_NOT_REGISTERED = 5: grep_search BY_DESIGN
  (registry.ts:329-331 + ToolService redirect + lock test) + 4
  TRUE orphans (BulkFileGeneratorTool, CodebaseNavigatorTool,
  ImageGenerationTool, VisualQATool — imported registry.ts:14-18,
  zero body uses; full 160-identifier multiline-aware
  unused-import census pins exactly these four).
- REGISTERED_WITHOUT_IMPLEMENTATION = 0 (RG2 live: every
  registered tool exposes function execute).
- DUPLICATE_REGISTRATION = 0 structurally (registry.ts:406
  throws at startup; static pin).
- Revived = 71 (70 safeNew + TodoWriteTool), all instantiated,
  zero 'Skipping revived' warnings (run-0 receipt).
Every case stays on a SAFE surface: registry reads,
unknown_tool misses (zero handler code runs), alias ->
read-only-search executions in the threaded sbx root, one
pre-exec guard refusal (NM0), re-pins. NO network, NO model, NO
browser, NO npm execution (the npm alias family documented
static-only: every alias carries an EXECUTING command), NO
spend. recall_memory/memorize_codebase/architect_plan/todo_write
pinned at REGISTRY level only — handlers NEVER invoked
(memory/planner-adjacent + NVIDIA-ACTIVE memory lane; no
overlap). Pipeline/memory/planner NVIDIA-ACTIVE areas NOT
touched. Same isolated tsx method as 110-130: canonical test env
(setup.ts: JSON persistence, mock DB, network fetch guard),
bypass OFF (hermetic), full attribution, CWD = the sandbox dir
itself (Set-Location INSIDE the shell), all imports absolute, FS
contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped
to tmp/sbx-tmp-131b (run-2; run-1 tree sbx-tmp-131 + reg-enum
run-0 receipts preserved). NO DATA_DIR is set: the knowledge.ts
import-time mkdir lands in <sbx>/data (contained; Z0 asserts the
shape, 127/128/129/130 continuity). NO AUTO_APPROVE_* set at any
point. No source edited; probe runs left ZERO tracked
modifications (tracked tree fully clean after all runs; only
pre-existing untracked caches). Containment verified: fixtures +
stores + logs + tsx cache all inside the sbx; JOE_DATA_DIR inside
the sbx; all THREE live stores byte-identical pre/post (SHA256,
in-probe Z0 + outside re-hash); zero strays outside the sbx.
Probe: tmp/team-consultation/muse-131-dispatch-probe.ts;
receipts: muse-131-dispatch-probe.stdout.log/.stderr.log (UTF-16
via PS redirect like 110-131 — parse the pretty-printed JSON
block with ReadAllText + LastIndexOf('{'); TSX_EXIT=0 is the
primary verdict, 24/24 regex-confirmed from the JSON block) +
.run1 (23/24) logs preserved. RUN-2 GREEN: run-1's single miss
was ONE probe-expectation bug (AL0 hand-counted 26 alias entries,
live Object.keys = 28); all 23 other pins held.

## Run result: 24/24 PASS run-2, EXIT 0, failed=0
## (run-1: 23/24, EXIT 1 — receipt preserved)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS all runs.
- D0-registered-count: registered=163 (re-observed). PASS all.
- RG0-registered-set: n=163 + object-4 + 4 anchors, set hash
  40739682C4A5CB21 STABLE across run-1/run-2 (exact-set pin
  recorded for future batteries). PASS all.
- RG1-object-architect_plan: present + execute is function
  (bare ArchitectTool, registry.ts:271; handler never invoked).
  PASS all.
- RG1-object-recall_memory: present + execute is function
  (...MemoryTools, registry.ts:262; handler never invoked).
  PASS all.
- RG1-object-memorize_codebase: present + execute is function
  (handler never invoked). PASS all.
- RG1-object-todo_write: present + execute is function
  (revived array, registry.ts:224; handler never invoked).
  PASS all.
- RG2-all-executable: 0 registered tools without function
  execute. PASS all.
- OR-orphan-bulk_file_generator: ok=false 'unknown_tool:
  "bulk_file_generator" — did you mean: repo_read_file,
  ai_write_file, progressive_generator, file...' PASS all.
- OR-orphan-codebase_navigator: ok=false 'unknown_tool:
  "codebase_navigator" — did you mean: memorize_codebase,
  analyze_codebase, codebase_outline?' PASS all.
- OR-orphan-generate_image: ok=false 'unknown_tool:
  "generate_image" — did you mean: image_studio,
  ci_generate_pipeline?' PASS all.
- OR-orphan-visual_qa: ok=false 'unknown_tool: "visual_qa" —
  did you mean: visual_compare?' PASS all.
- GS0-grep-hand-positive: threaded-root marker found via
  'grep_search', total>=1, file marker131.txt (one-hop
  hand-redirect ToolService.ts:526 to the real reader, not
  the old filename glob). PASS all.
- GS1-ripgrep-table-positive: total>=1 + logs contain
  'tool alias:' (ripgrep has NO hand-redirect, so TABLE path
  ToolService.ts:692 fires and logs itself). PASS all.
- GS2-grep-missing-query: {} -> ok=false 'search_text needs
  a query' (alias preserves arg validation). PASS all.
- GS3-direct-equivalence: direct search_text total EQUALS
  aliased total (hand + table + direct reach the identical
  reader). PASS all.
- AL0-alias-targets-registered: 28 entries, 0 unregistered
  targets (run-1 expected 26 — probe count bug, corrected).
  PASS run-2 (target-half passed run-1 too).
- AL1-alias-keys-unregistered: 0 table keys registered (every
  key is genuinely unregistered, so the table CAN fire when
  reached). PASS all.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required'
  (T5-117 winner reproduced; nothing executed). PASS all.
- H4b-run-command-shadow: NO 'tool alias:' in logs + table
  says terminal_manager (hand-redirect line 429 shell_execute
  fires first; table entry dead AND disagrees). PASS all.
  (OBS-131-1, P3 proposed.)
- NM0-npm-missing-command: direct npm_manager {} -> ok=false
  'missing_command' (pre-exec refusal; nothing runs). PASS all.
- UT0-unknown-shape: ok=false error EXACTLY 'unknown_tool:
  "definitely_not_a_tool_131"' (zero shared segments -> zero
  suggestions). PASS all.
- D1-echo-positive: ok=true, output has probe text. PASS all.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape
  EXACT (db/users.json 2B + memory dir) + live kb hash ==
  pre (0F6483C1...) + worktree-root kb hash == pre
  (6D7A9D7E...) + live mem hash == pre (4F53CDA1...) +
  zero 131 markers in all three live stores. PASS all
  (each run asserted its own sbx; run-2 tree 131b).

## Behavior pins carried (one new OBS, proposed backlog)
- OBS-131-1 (P3 proposed, LIVE): divergent duplicate alias for
  run_command. TOOL_ALIASES['run_command']='terminal_manager'
  but the hand-redirect (ToolService.ts:429) maps run_command->
  shell_execute FIRST, so the table entry NEVER fires (H4b live
  proof: no 'tool alias:' log). Same-name/same-target shadows
  (grep/file/list families) are benign duplication; THIS one
  DISAGREES about the destination. A reader trusting the table
  mispredicts the execution path. Repair direction
  (ownership-gated): delete the table entry or the hand branch
  so exactly one maps run_command. No edit without ownership.
- codebase_navigator risk-carve-out (ToolService.ts:198) is a
  layer-skew INFO pin: the risk layer names an unregistered
  orphan. Harmless (the name can never arrive with a tDef;
  unknown_tool fires first) but a future registrar must know
  the carve-out pre-exists. No OBS alone.
- ORPHAN CORRECTION (evidence-backed, 131): the 085 lock enumerated
  EXACTLY these four (generate_image, codebase_navigator,
  bulk_file_generator, visual_qa); 125's "4->5" incremented for
  codebase_navigator's first LIVE pin, double-counting a name
  already in the lock. Distinct tool-level orphans = 4, now ALL
  live-confirmed (generate_image/110 via alias + 131 direct,
  visual_qa/124, codebase_navigator/125, bulk_file_generator/131
  FIRST live pin — previously static-only since AUDIT-004).
  ORPHANED corrects 5 -> 4. generate_image corroborates the
  CREATIVE-SAFETY review (image_generate->generate_image->
  unknown_tool). No repair without ownership (revival needs the
  safeNew treatment + permission review + planner-visibility
  decision, esp. generate_image's OpenAI/paid path and
  bulk_file_generator's write scope).
- grep_search BY_DESIGN pin: defined (160) + imported? NO —
  grep_search is NOT imported in registry.ts at all (only its
  class file defines it); unregistered ON PURPOSE with a live
  redirect + lock test. The 5th non-registered definition is
  the healthy contrast case for the 4 true orphans.
- AL0/AL1 are info pins + class: alias TABLE soundness (all 28
  targets registered) + liveness (zero keys registered). The
  audit's registry-reconciliation row for aliases is now
  COMPLETE on Muse lineage.
- RG0 set-hash 40739682C4A5CB21 is the exact-set pin: any
  future registration/deregistration/rename changes it. Info
  pin + method.
- Anchored-scan method fix is a METHOD pin: future static
  scans use `^\s*name\s*=` (declarations only) — junk-free by
  construction (160 exact, no caveat list).
- GS0/GS1/GS3 hand-vs-table-vs-direct triple is an info pin +
  class: three dispatch spellings, one reader, with the log
  line distinguishing the path taken. Future alias work can
  reuse the triple shape.
- NM0 missing_command is an info pin: the npm family's ONLY
  safe live surface (direct {}, pre-exec). All six npm_*
  aliases remain static-only until an owned hermetic-npm
  review exists.
- UT0 exact-shape is an info pin: the no-suggestion unknown
  envelope (contrasts the orphan suggestion envelopes).
- RG1 registry-only treatment of the object quartet is a
  SCOPE pin: recall_memory/memorize_codebase handler behavior
  stays NVIDIA-lane; architect_plan/todo_write await a
  coordinated slice. No OBS.

## Verdict
- ONE new OBS filed to the proposed backlog (131-1 P3 live
  divergent-shadow alias); zero new OBS-111-2 instances (this
  battery's shapes are registry/alias mechanics, not arg
  validation).
- FOUR true orphans ALL live-confirmed (ORPHANED corrects 5 -> 4
  at Muse tool level — 125 double-count fixed, see pin above;
  IMPLEMENTED_NOT_REGISTERED = 5 incl. by-design grep_search;
  DEFINED=168 exact on Muse lineage; bulk_file_generator first
  live pin, other three re-pinned).
- Registry-reconciliation row COMPLETE for definitions/ +
  registry.ts + TOOL_ALIASES + hand-redirects on Muse lineage
  (Level 2/3 done; Level-4 handler dispatch stays 111 families
  — this battery adds 0 new handler families by design).
- 084 P4 + all F/OBS items 086-131 await team
  review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-130 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/130;
  this checkpoint adds the 24-case run-2-green reconciliation
  battery + one OBS; run-1 23/24 receipt preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 131 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live)
DUPLICATE_REGISTRATION=0 (structural throw, static)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 131;
  recall/memory/architect/todo registry-only by scope)
ORPHANED=4 (CORRECTED from carried 5: 125 double-counted
  codebase_navigator; the 085 four all live-confirmed, bulk first-live in 131)
ALIAS_TABLE_ENTRIES=28 (all targets registered, zero keys registered)
DIVERGENT_SHADOW_LIVE=1 (run_command table-vs-hand — OBS-131-1 P3 proposed)
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, stable run-1/run-2)
