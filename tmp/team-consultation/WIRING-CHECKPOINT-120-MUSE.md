# WIRING CHECKPOINT 120 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=25c35b66 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — memory family FIRST live
## proof (recall_memory + memorize_codebase) + ToolService shim shadow
## (Level 4)
Prior coverage was match-layer only (065: recall_memory NOT surfaced
by capableTools for a remember-preference phrasing) plus catalogue
mentions (076/077/108). No live dispatch proof existed for either
tool. For each target the probe executes the REAL executeTool path.
New containment method this battery: the probe runs with process CWD
= the sandbox dir itself (tsx invoked by absolute path, all imports
absolute), because vectorDb resolves its store against
process.cwd() ('data/memory', vectorDb.ts:19-20). P0 pins
cwd_in_sbx, which forces the index file into the sandbox; the REAL
api/data/memory/index.json (pre-run SHA256 4F53CDA1..., 2 bytes)
re-hashes IDENTICAL after both runs. Same isolated tsx method
otherwise: canonical test env (setup.ts: JSON persistence, mock DB,
network fetch guard), bypass OFF (hermetic), full attribution, zero
network, FS contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT
scoped to tmp/sbx-tmp-120. NO AUTO_APPROVE_* set at any point. No
source edited; probe runs left ZERO tracked modifications (verified
via git status on api/src + web/src + api/package.json after run-2:
zero tracked dirty; only pre-existing untracked
api/src/.jest-cache + api/src/.tmp). Containment tree verified:
data/ (vector store) + joe-test-data-*/joe-test-store-* (setup.ts)
+ logs/ + memfix120/memfix120b fixtures + tsx cache, all inside
sbx-tmp-120; nothing outside. Probe:
tmp/team-consultation/muse-120-dispatch-probe.ts; receipts:
muse-120-dispatch-probe.stdout.log/.stderr.log = RUN-2 (UTF-16
via PS redirect like 110-119 — parse with ReadAllText; TSX_EXIT=0
is the primary verdict, 14/14 regex-confirmed from the JSON block),
plus .run1.stdout.log/.run1.stderr.log preserved before the rerun.

## Run-1: 7/13 (TSX_EXIT=1) — disclosed, receipts preserved
Passes: P0/D0/D1/H4/M1/R1/R3. Fails: M0+R0 (REAL product finding —
see OBS-120-1; expectations were written against the registered
MemoryTool.ts guards, but the canonical path never reaches them),
R2 (PROBE BUG: query 'qqqzzz-nomatch-120' tokenizes to
{qqqzzz,nomatch,120} and '120' is shared with every fixture
filename, score 0.09 > 0.05 — fixed to digit-free tokens), M2
(PROBE BUG: expected singular '1 file', message is always plural —
fixed), R5+M3 (cascades of M2's expectation bug, both green in
run-2). No source touched between runs; only probe expectations +
one added case (S3).

## Run-2 result: 14/14 PASS, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (control
  reproduced; logs stashed for S3). PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- M0-memorize-missing-dir: memorize {directory:<sbx>/no-such-dir-120}
  -> ok=true, 'Successfully indexed 0 files into Deep Memory.'
  (SHIM pin: ToolService.ts:583-608 has no missing-dir guard; glob
  with a nonexistent cwd yields no files without throwing —
  otherwise the :605 catch would return ok=false; the registered
  MemoryTool.ts:88-90 guard is shadowed; nothing indexed but the
  verdict is success). PASS (run-2 re-pin).
- M1-memorize-fixture: memorize {directory:<sbx>/memfix120} under
  ws-A -> ok=true, 'Successfully indexed 2 files' (shim path;
  vectorDb clear + addDocument per file; store=<sbx>/data/memory
  per P0 cwd pin; logs stashed for S3). PASS.
- R0-recall-empty-query: recall {query:''} -> ok=true, 'No relevant
  memory found.' (SHIM pin: ToolService.ts:571-581 has no
  empty-query guard; search('') tokenizes empty -> []; the
  registered MemoryTool.ts:45-47 guard is shadowed; nothing
  searched but the verdict is success). PASS (run-2 re-pin).
- R1-recall-hit-cross-workspace: recall {query:'quokka zephyr
  filament'} with ctxB on workspace probe-ws-120b -> ok=true,
  output contains 'alpha-120' + 'quokka' (HIT pin + CROSS-
  WORKSPACE pin: memorized under ws-A, recalled under ws-B;
  vectorDb is a process-global singleton :138 with no workspace
  key; Jaccard>0.05 on alpha-only tokens). PASS.
- R2-recall-miss: recall {query:'qqqzzz nomatch wwww'} -> ok=true,
  'No relevant memory found.' (shim :577 empty-result branch;
  zero doc overlap with digit-free tokens). PASS.
- R3-recall-limit-one: recall {query:'memfixcommon', limit:1} ->
  ok=true, output has NO '\n---\n' separator (both fixture docs
  match the shared token above 0.05, slice(0,1) :124-127
  truncates to one block — limit-contract pin). PASS.
- M2-rememorize-replaces: memorize {directory:<sbx>/memfix120b}
  (single gamma file, disjoint tokens) -> ok=true, 'Successfully
  indexed 1 files' (always-plural message, both copies;
  vectorDb.clear() :96 runs on every memorize). PASS.
- R5-recall-stale-after-replace: recall quokka-family again ->
  ok=true, 'No relevant memory found.' (REPLACE-NOT-MERGE pin:
  prior alpha/beta docs wiped by M2's clear(); gated on M2 ok).
  PASS.
- M3-index-file-contained: <sbx>/data/memory/index.json parses,
  exactly 1 doc, metadata.filePath='gamma-120.md' (post-M2 state
  on disk; proves the CWD-scoped store). PASS.
- S3-envelope-differential: echo logs CONTAIN 'start echo'
  (registered path :623) while memorize M1 logs contain NO
  'start ' line at all (memorize_logs_len=0) — live proof the
  :571-608 early return fires before :623, hence before
  attribution :764, approval :772 and rate limit :787. PASS.

## OBS-120-1 (ToolService memory shim SHADOWS the registered
## handlers and bypasses envelope/attribution/approval/rate-limit —
## stale MemoryTool.ts comment; P1 gate-bypass + dead guards)
M0+R0+S3 prove at LIVE dispatch level that executeTool for
recall_memory/memorize_codebase never reaches the registry: the
ToolService.ts:571-608 "Deep Memory Handlers" special case returns
early with its own copy of the logic. Consequences: (a) the honest
guards in the REGISTERED MemoryTools.execute bodies (:45-47 empty
query, :88-90 missing dir) are DEAD CODE on the canonical path —
only a direct t.execute caller (registry audit, orchestrator direct
path) would see them; (b) the shim has NEITHER guard, so a missing
dir reports ok=true 'indexed 0 files' and an empty query reports
ok=true 'No relevant memory found' — success verdicts for no-ops,
in the same silent-accept class as OBS-116-2/OBS-119-2; (c) the
early return precedes the :623 dispatch envelope (S3: zero log
lines), the :764/:768 workspace/user attribution checks, the :772
approval gate and the :787 rate limit — memorize_codebase, which
CLEARS and rewrites the whole store, runs with no risk
classification, no approval and no audit line; (d) the MemoryTool.ts
header comment ("The bodies now live here... a missing argument
earns an honest sentence rather than a TypeError") is STALE — the
first half happened (bodies were COPIED, not moved) while the
ToolService original was never removed, so the honest sentence is
false on the canonical path. This is WORSE than the run_command
divergent shadow (OBS-117-2/118-2), which at least resolves through
the gate. Smallest fix direction (NOT implemented — audit-first,
coordinated ownership): delete the ToolService shim so the single
registered implementation (with guards) serves all callers, or
move the shim AFTER the gates with the guards added; correct the
stale comment; add negative tests (missing-dir/empty-query honest
failures + envelope presence). Proposed repair-backlog item (P1
gate-bypass on a mutating tool + P2 honest-verdict; needs owner
decision — verify no caller depends on the pre-gate behavior
before removal). No unilateral ToolService edit.

## OBS-120-2 (memorize is REPLACE-not-merge + memory is
## cross-workspace visible — memory isolation class)
M2+R5+M3 prove at LIVE dispatch level that every memorize run
starts with vectorDb.clear() (:96): re-indexing one directory
SILENTLY DESTROYS all previously indexed memory (no merge, no
warning in the output — 'Successfully indexed N files' reads as
additive). R1 proves the store is process-global with no workspace
key: ws-B recalls what ws-A memorized. Same isolation class as
OBS-116-1 (cache action-blind medium + cross-workspace) and the
monitoring cross-workspace counters. Smallest fix direction (NOT
implemented — audit-first, coordinated ownership): per-workspace
namespacing or an explicit replace-vs-merge parameter with the
destructive default documented; at minimum surface 'replaced X
prior docs' in the output. Proposed repair-backlog item (P2
isolation/observability; needs owner decision). No unilateral edit.
Source-noted but UNPINNED (no live case): the filename bonus at
vectorDb.ts:118-119 compares the whole basename stem against
individual query tokens, so it can only fire for single-token
stems — multi-token stems (e.g. 'alpha-120') never match. Needs a
live score-differential pin before becoming an OBS.

## Verdict
- ONE significant dispatch finding (OBS-120-1: shim shadow +
  gate bypass, P1) and ONE backlog-grade OBS (120-2: replace-
  not-merge + cross-workspace memory, P2), proposed for the
  repair backlog at team ownership decision, alongside standing
  OBS-114-1 (browser gate regex split), OBS-115-1 (monitoring
  action-blind medium), OBS-115-2 (alias shadow layers),
  OBS-116-1 (cache action-blind medium + cross-workspace),
  OBS-116-2 (monitoring event silent-accept), OBS-117-1
  (execute_python Windows-dead binary), OBS-117-2 (run_command
  divergent shadow), OBS-118-1 (tool-vs-WS ownership-enforcement
  asymmetry), OBS-119-2 (effect-blind terminal verdicts). Level-4
  dispatch PROVEN for 22 families (120 adds the memory family —
  first live proof — with shim-shadow + replace/cross-workspace
  pins) with the gate-vs-handler split on EIGHT gate tools and
  all four risk levels live-pinned. No repairs (audit-first;
  coordinated ownership).
- 084 P4 + all F/OBS items 086-120 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-119 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119; this checkpoint adds the 14-case run-2 dispatch
  battery + OBS-120-1/120-2; run-1 7/13 receipts preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 120 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=22 families (110-119 + 120 memory family
  first live proof via executeTool — shim path, not registered
  handler)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pins the
  run_command->shell_execute HIGH gate verdict)
GATE_BYPASS_LIVE=2 tools (recall_memory + memorize_codebase via
  the :571-608 early-return shim; OBS-120-1, proposed backlog,
  unowned)
SHIM_SHADOW_DUPLICATES=1 family (memory: ToolService copy serves
  dispatch, registered copy serves direct callers only; OBS-120-1,
  proposed backlog, unowned)
ENVELOPE_BYPASS_LIVE=1 (S3 differential: shim path emits zero log
  lines vs echo's :623 start line; OBS-120-1)
STALE_JUSTIFYING_COMMENT=1 (MemoryTool.ts header claims the
  ToolService special case was removed; it was copied, never
  removed; OBS-120-1)
MEMORY_REPLACE_NOT_MERGE=1 (M2+R5+M3; OBS-120-2, proposed backlog,
  unowned)
MEMORY_CROSS_WORKSPACE=1 (R1: ws-B recalls ws-A's index; OBS-120-2,
  proposed backlog, unowned)
RISK_LEVELS_LIVE=4/4 (low/medium/high/critical pinned in 114;
  120 re-exercises low D1 + high via H4 gate verdict; memory tools
  carry NO consulted rating — shim returns pre-gate)
RISK_SPLIT=tool-x-input (unchanged; 120 adds the pre-gate-shim
  exception class: 2 tools never reach classifyToolRisk)
SESSION_OVERRIDE_LIVE=YES (T1-119 stands)
SCOPED_ISOLATION_LIVE=YES (S3/S4-118; W2/R2-119)
UNSCOPED_TERMINAL_ACTIONS_REACHABLE=5/6 (OBS-118-1 + OBS-119-1,
  proposed backlog, unowned)
SILENT_NOOP_VERDICTS=5 (write W3 + resize R2 + kill K0 on missing
  ids, 119; memorize-missing-dir M0 + recall-empty-query R0,
  120-shim; OBS-119-2 + OBS-120-1, proposed backlog, unowned)
READ_MISSING_THROWS=1 (readHistory lone reporter; K2-119)
WS_TOOL_OWNERSHIP_ASYMMETRY=1 (OBS-118-1 + OBS-119-1, proposed
  backlog, unowned)
SHADOW_QUARTET_PINNED=4/4 (H1-H4-118 stand; H4 re-pinned in 120)
DIVERGENT_SHADOW=2 (run_command, OBS-117-2 + OBS-118-2 + H4 re-pin;
  memory family, OBS-120-1 — worse: pre-gate; both proposed
  backlog, unowned)
GATE_BEFORE_HANDLER_EMPTY_INPUT=1 (re-pinned H4-120)
GATE_REGEX_ASYMMETRY=1 (OBS-114-1, proposed backlog, unowned)
ALIAS_SHADOW_LAYERS=1 (OBS-115-2 class; OBS-118-2 family-complete)
MONITORING_ACTION_BLIND_MEDIUM=1 (OBS-115-1, proposed backlog,
  unowned; MONITORING-010-NVIDIA review pending)
CACHE_ACTION_BLIND_MEDIUM=1 (OBS-116-1, proposed backlog, unowned)
MONITORING_EVENT_SILENT_ACCEPT=1 (OBS-116-2, proposed backlog,
  unowned)
PYTHON_WINDOWS_DEAD_BINARY=1 (OBS-117-1, proposed backlog,
  unowned)
CONTENTTOOLS_VALIDATION_MAP=COMPLETE (3 of 4 guard; rss_fetch lone
  outlier; OBS-115-3, strengthens P2 backlog case)
ERROR_SUBSTITUTION_PINNED=1 (:946 generic message live via R1-114)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; memory shim validates
  nothing at all)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115: ContentTools 3-guarded/1-outlier) + action/event asymmetry
  class (116: validated actions vs silent-drop events) + gate-vs-
  guard order class (117: approval gate pre-empts handler input
  guard on high-risk empty input) + ingress-enforcement asymmetry
  class (118: WS ingress refuses foreign session/user, tool
  ingress derives-only) + verdict-effect asymmetry class (119:
  ok=true verdicts that did nothing vs the lone throwing read) +
  pre-gate-shadow class (120: early-return shim serves dispatch
  with no guards/envelope/gates while the guarded registered copy
  stands unreachable)
RESOLVER_PARITY_LIVE=YES (in-probe resolveToolPath == handler
  resolution, P4-112; re-exercised G1-115 seeding)
DISPATCH_LOG_ENVELOPE=PARTIAL (:623 start line + :929 handler append;
  envelope-only shape pinned H1-113; orig-alias hop pinned G1-115;
  120 adds the documented EXCEPTION: shim-served tools emit zero
  lines — S3)
ALIAS_TABLE_PROVEN=4 chains (shell->shell_execute gate+handler,
  110; fetch_url->http_fetch handler, 113; grep_search->search_text
  handler + orig-hop log pin, 115; bash->terminal_manager handler,
  117)
ORPHAN_REPIN=1 (image_generate->generate_image->unknown_tool, 110)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
READ21_R1_CLOSED=21/21 (5 write in 080 + 16 read in 104/105)
FIREWALL_R2_CLOSED=YES (106: 6/6 probe PASS, EXIT 0)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (MemoryTools.execute bodies unreachable
  via executeTool; OBS-120-1 — counted separately from DEAD_HELPERS
  because the registry advertises them as live)
DUPLICATE=2 relationships (unchanged; the memory shim/registered
  pair is classified DIVERGENT_SHADOW, not DUPLICATE, because only
  one copy serves dispatch)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14 (110+111+112+113+114+115+116+117+118+119+120 run-2 probes, 120 run-1 7/13 receipts preserved)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(in-memory-state family grouped repair proposal; execute_python
interpreter-resolution proposal; terminal owner-check + silent-
verdict + memory-shim repair proposals at ownership decision) or
the next Codex-requested bounded scope, or OBS-114-1 / OBS-115-1 /
OBS-116-1 / OBS-117-1 / OBS-117-2 / OBS-118-1 / OBS-119-2 /
OBS-120-1 / OBS-120-2 ownership/repair proposals at a coordinated
checkpoint. No registry/ToolService/tool edits without ownership.
