# MUSE Wiring Discovery 021 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 21)
HEAD=90fba4a4 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for observability 5/5 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures + one outside-session worktree-tmp
fixture created + removed by the probe; NO network legs; no model legs) +
static checker partition over the trunk + pure-function verdict table over
source-grounded shapes. Full trunk probe ran 2x filed runs A/B with 45/45
legs verdict-identical (ok + error-prefix + output-shape, verdictDiffs=0).
No live process survived; no stray files (session root clean, outside dir
removed).
EVIDENCE=tmp/wiring-audit/trunk_obs.mts + trunk_obs_run{A,B}.json +
trunk_obs_run{1,2}.log (this worktree; runs 1/2 = filed A/B)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-020.md (database_data LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

observability = alert_manager, logger, monitoring, performance_analyzer,
performance_profile (5). All 5 exist in the live registry. 0/5 are
task-level checkers. Naming note: registry.ts:210 labels the profiler
safeNew 'performance_profiler' but the instance name is
'performance_profile' (AdvancedTools.ts:594) and the label is cosmetic —
the registered callable name is performance_profile. No finding.

## New findings (all Muse-branch @ 90fba4a4)

### F152. performance_analyzer reads OUTSIDE the session root + follows traversal (LIVE 2x, P1-011 NEW)

pa.abs-outside (absolute path to a worktree-tmp file OUTSIDE the session
root) -> ok:true + performanceScore 97 BOTH runs: the tool read and
analyzed a file outside the session. pa.traversal (files:['../nasty.js'],
projectPath:<session>/wiring-obs-fx/sub) -> ok:true + score 84 with
nasty.js bottlenecks BOTH runs: `..` escapes the declared projectPath.
Mechanism: `path.isAbsolute(file) ? file : path.resolve(projectPath,
file)` + bare fs.existsSync/readFileSync, NO resolveToolPath, NO escape
check (PerformanceAnalyzerTool.ts:64-68). Contrast leg: performance_profile
REFUSES the SAME outside file with `path_outside_workspace ... (Root:
\\?\...session-audit-sess)` BOTH runs (resolveToolPath-contained,
AdvancedTools.ts:619). The tool declares permissions ['read'], is
SELECTABLE rank-1, and the gateway permits the call — the read side is
entirely uncontained. Only probe-created fixtures were read; no other
files were touched. Repair direction (batch P1-011): route file
resolution through resolveToolPath with the session workspace context
(same as the profiler) + reject escapes with a sentence. NOT implemented
here (audit-first). Severity P1: planner-reachable uncontained read.

### F153. performance_analyzer missing-file + empty-array return ok:true score 100, shape-identical to clean (LIVE 2x, MISMATCH #16 NEW + P2-029 NEW)

pa.missing (nonexistent path) -> ok:true + score 100 + bottlenecks []
BOTH runs (missing files are silently `continue`d, :66). pa.empty
(files:[]) -> ok:true + score 100 BOTH runs. Both receipts are
shape-identical to pa.clean (ok:true + score 99 + bottlenecks []) — the
caller cannot distinguish "analyzed and clean" from "never analyzed".
The verdict table maps 'analyzer missing-file'=>passed. A behavior check
built on this tool ("no perf regressions") closes PASSED on zero
evidence. Repair direction (batch P2-029): include analyzedFiles/skipped
counts in the output + verdict must not pass a behavior check on zero
analyzed files.

### F154. monitoring track returns tracked:true for events it ignores (LIVE 2x, MISMATCH #17 NEW + P2-030 NEW)

mo.track-unknown (event:'definitely_not_an_event') -> ok:true +
{success:true, event, tracked:true} BOTH runs — but mo.metrics shows
totalRequests=1 (only the real legs counted): the switch has no default
(MonitoringTool.ts:94-144) so unknown events are silently dropped while
the receipt claims tracked:true. The verdict table maps
'monitor unknown-event'=>passed. Repair direction (batch P2-030): return
tracked:false + the accepted event list (or explicitly accept-and-count
custom events).

### F155. performance_analyzer {} throws a raw TypeError (LIVE 2x, rides P2-029)

pa.nofiles ({}) -> ok:false + 'Cannot read properties of undefined
(reading 'length')' BOTH runs: `files.length` with no input guard
(:57), and the gateway did not enforce required:['files']. Same
input-guard class as F150. Consequence today is an ugly error, not false
success. Repair rides P2-029 (same tool): reject missing files with a
sentence before analysis.

### F156. alert_manager lifecycle honest; trigger receipt aliases the live object (LIVE 2x, note)

al.create/trigger/resolve/list/history all honest BOTH runs
(lifecycle: created -> triggered -> resolved, listTotal 1,
historyCount 3). al.trigger-bad -> ok:false 'not found'. al.noaction ->
'Unknown action: undefined' (required:['action'] unenforced by tool and
gateway — input-guard note, same family as F150/F155, no batch: harmless
error). al.create-noname accepted with name:'' (recorded as observed).
Observation: trigger output.alert is a LIVE reference to the stored
object — the filed comparison read triggerStatus 'resolved' after the
later resolve leg mutated it. Serialized receipts (outputPreview, filed
JSON) are fine; in-process consumers see mutation. One-line note for a
future receipt-snapshot pass, no batch.

### F157. logger/monitoring/alert stores are process-global, unpersisted, session-blind (LIVE behavior + CODE-CITED, P2-031 NEW)

Live: lg.clear -> clearedCount 2 -> stats zero; mo.reset2 -> zeros;
al.list sees everything created. Code-cited: all three stores are
`private static` with NO sessionId/userId field in any method
(AlertManagerTool.ts:72-89, LoggerTool.ts:65-71,
MonitoringTool.ts:51-62) — one session's clear/reset wipes EVERYONE's
state, list/query leak across sessions, and a process restart loses all
alerts/logs/metrics. Cross-session impact is code-cited (single probe
process; no exploit attempted). Repair direction (batch P2-031):
session-scope the three stores (or persist them with owner binding) —
at minimum document them as process-local dev-only semantics so no
verification story depends on them surviving restart or isolating
tenants. Sub-notes for the batch owner (no separate batches): logger
declares permissions ['write'] but writes only memory (over-declaration,
same family as checkpoint-20 finding #4); alert history is UNBOUNDED (no
cap vs logger 10k / monitor-errors 100); monitoring averageBuildTime
divides by successfulRequests (nonsense average when build_time is
tracked without successes — live avgBuild=120/1 consistent).

### F158. performance_profile honest + contained (LIVE 2x, positive)

pp.ok -> issues[] + memoryEstimate + complexity on the clean fixture;
pp.nofield -> 'filePath is required'; pp.nonexistent -> 'File not
found'; pp.abs-outside -> REFUSED path_outside_workspace — ALL both
runs. Minor note for the batch owner: the not-found error echoes the
absolute \\?\ session path (error-path disclosure; same file, no new
batch).

### F159. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 5/5, all rank-1 on self-name. No router
exclusions, no priority listings on this trunk. alert_manager->write +
monitoring->read remain in the 21 boot permission-defaulted tools (boot
list UNCHANGED at 21; same systemic family as summary finding #4).
`[ToolService] Auto-assigned workspace context: session-audit-sess`
fired on legs (context propagation visible). performance_profile
declares ['read','execute'] though it only reads + analyzes (execute
over-declaration, recorded).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=11/19 fully storied (observability 5/5 LEVEL-4 + static
verification-compat + checker-set 0/5) — 107 + 5 = 112 tools
TRUNK_OBS=5/5 SELECTABLE rank-1; 45/45 live legs canonical 2x filed
verdict-identical (verdictDiffs=0); 15-shape verdict table; fixtures
removed (session root clean, outside dir removed)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=17 confirmed (NEW #16: analyzer vacuous-ok F153;
NEW #17: monitor unknown-event tracked:true F154)
EXECUTABLE_NOT_VERIFIABLE=0 on 11 swept trunks (112/112 verdict-
mappable; vacuous-ok + false-tracked join as MAPPING-false-pass
(#16, #17))
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/5 trunk task-level checkers)
P1_ITEMS=1 new (P1-011 uncontained analyzer read F152) | P2_ITEMS=3
new (P2-029 analyzer receipt+guard F153+F155, P2-030 monitor tracked
honesty F154, P2-031 observability store scoping F157)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-011 (performance_analyzer uncontained read F152):
  resolve files through resolveToolPath with session workspace context
  (profiler pattern) + reject escapes with a sentence. Security batch:
  needs owner + reviewer + focused negative tests (outside-absolute,
  traversal, missing) + regression that in-session analysis still works.
- NEW WIRING-P2-029 (analyzer receipt+guard F153+F155): analyzed/skipped
  counts in output + verdict must not pass on zero analyzed + reject
  missing files with a sentence.
- NEW WIRING-P2-030 (monitor tracked honesty F154): tracked:false +
  accepted-event list for unknown events (or explicit custom-event
  support).
- NEW WIRING-P2-031 (observability store scoping F157): session-scope
  or persist alert/logger/monitoring stores; document process-local
  semantics meanwhile. Cross-session impact is code-cited, not
  live-probed — owner confirms with a two-context test.
- LIFTED nothing; embargoes hold (cross-session live probing; any
  non-fixture file reads).
- NOTE for the P1-011 owner: the profiler (same trunk) is the
  in-repo containment pattern — reuse it, do not invent a new one.

## Working hypotheses (formed at source-read, before first run)

- 'analyzer refuses outside files' — REFUTED: ok:true + score 97 (F152).
- 'analyzer refuses traversal' — REFUTED: ok:true + nasty bottlenecks (F152).
- 'profiler refuses the same outside file' — CONFIRMED: path_outside_workspace (F152/F158).
- 'missing file fails loudly' — REFUTED: ok:true score 100 (F153).
- 'empty files array is rejected' — REFUTED: ok:true score 100 (F153).
- 'unknown monitor events are rejected' — REFUTED: tracked:true, counted nowhere (F154).
- 'missing files field is rejected with a sentence' — REFUTED: raw TypeError (F155).
- 'missing action is rejected with a sentence' — REFUTED: 'Unknown action: undefined' (F156 note).
- 'alert lifecycle is honest' — CONFIRMED (F156).
- 'logger query/stats reflect only logged entries' — CONFIRMED (F157 live part).
- 'clear/reset wipe everything in-process' — CONFIRMED (F157 live part).
- 'stores are session-scoped' — REFUTED by code: no sessionId anywhere (F157).
- 'all five are selectable by self-name' — CONFIRMED rank-1 (F159).

## Limits / UNKNOWNs

- 8/19 trunks still unstories; memory_knowledge overlaps
  NVIDIA-claimed files and planning_orchestration is NVIDIA-owned —
  do not story without coordination. Suggested next: interaction=8
  (central_answer needs model embargo care) or infra_ops=6 (likely
  honest-unavailable legs) or documentation/media/network/language
  trunks.
- F152 impact beyond fixtures is UNKNOWN by design (only
  probe-created files were read; no /etc/passwd-class probing, no
  other-session reads attempted).
- F157 cross-session impact is code-cited, not live-probed (single
  probe process).
- alert trigger-reference aliasing (F156) serializes fine; in-process
  consumer impact UNKNOWN.
- monitoring averageBuildTime semantics with zero successes UNKNOWN
  (code divides by `successfulRequests || 1`).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (probes perform zero source edits;
  CLI-BATCH1 review duty retained, no committed NVIDIA diff exists
  yet to review).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: the sandbox CWD arrives as
`\\?`-prefixed, which node cannot resolve relatively — reset the
process directory and invoke node with ABSOLUTE paths):
  [System.IO.Directory]::SetCurrentDirectory('D:\Joe\muse-worktree\api')
  $fx='<worktree>\tmp\wiring-audit\fx-obs' (auto-created)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node D:\Joe\muse-worktree\api\node_modules\tsx\dist\cli.mjs D:\Joe\muse-worktree\tmp\wiring-audit\trunk_obs.mts
Expected: 5/5 SELECTABLE rank-1; 45 legs, 31 ok; pa.abs-outside ok with
score ~97; pa.traversal ok with nasty bottlenecks; pp.abs-outside
refused path_outside_workspace; mo.track-unknown tracked:true with
metrics unchanged; cleanup=ok; node process exits 0 by itself.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1 min.
