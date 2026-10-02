# WIRING CHECKPOINT 116 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=2a38f428 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only)

## Scope: dispatch-reachability battery — cache_manager read-vs-mutation
## + cross-workspace isolation, monitoring unknown-event silent-accept
## vs unknown-action rejection (Level 3)
Follow-up to 115 (next step named monitoring unknown-event
silent-accept pin and cache_manager read-vs-mutation split as a second
action-blind-medium candidate). For each target this probe executes the
REAL executeTool path (alias layer -> registry -> firewall -> approval
gate -> handler). Same isolated tsx method: canonical test env
(setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
attribution, NO sessionId, zero network, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-116.
NO AUTO_APPROVE_* set at any point: all 13 cases flow through the
default allowance (medium/low), none meets the gate. Ran from the plain
DOS path, TSX EXIT 0. No source edited; probe runs left ZERO tracked
modifications (verified via git status on api/src + web/src +
api/package.json after run: zero tracked dirty). Containment tree
verified: test stores + projects/ + tsx cache, all inside sbx-tmp-116;
nothing outside. Probe:
tmp/team-consultation/muse-116-dispatch-probe.ts; receipts:
muse-116-dispatch-probe.stdout.log/.stderr.log (same dir; UTF-16 via
PS redirect like 110-115 — parse with ReadAllText; the stdout log
carries ~137 bytes of registry/setup console noise before the JSON
payload; TSX_EXIT=0 is the primary verdict, 13/13 regex-confirmed
from the JSON block).

## Result: 13/13 PASS, EXIT 0, failed=0 (first run)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111/112/
  113/114/115 control reproduced). PASS.
- C0-cache-stats-baseline: stats {action:'stats'} -> ok=true,
  sets=0, hits=0, misses=0, cacheSize=0 (fresh hermetic process;
  setup/registry import pre-populates nothing). PASS.
- C1-cache-set-mutation: {action:'set', key:'k116', value:'v116'}
  -> ok=true, success=true (HANDLER mutation through the default
  medium allowance: cache_manager has NO dispatch-layer special case
  — zero 'cache_manager' matches in ToolService.ts — and
  permissions=[]/sideEffects=[] (CacheManagerTool.ts:47-48), so NO
  approval and NO workspace/user requirement — identical friction
  to the read actions). PASS.
- C2-cache-get-effect: get k116 -> ok=true, hit=true, value='v116'
  (HANDLER read, :98-130; the read also bumps process-global
  stats.hits — reads are not side-effect-free). PASS.
- C3-cache-cross-workspace: get k116 under ws-B -> ok=true,
  hit=true, value='v116'; stats under ws-B -> sets=1 (process-global
  static Map + stats, :54-61 — ws-A's entry AND counters visible
  under a different workspaceId). PASS.
- C4-cache-unknown-action: {action:'frobnicate-116'} -> ok=false,
  error='Unknown action: frobnicate-116' (HANDLER default branch
  :84-85 throws -> caught :88-95; actions ARE validated). PASS.
- C5-cache-clear-destructive: clear -> ok=true, cleared=1; then get
  k116 -> ok=true, success=false, hit=false (destructive action
  through the same zero-friction medium path; hermetic in-memory
  only, no external effect). PASS.
- N0-metrics-baseline: get_metrics -> ok=true, all 6 counters 0
  (fresh hermetic process; baseline for the silent-accept proof).
  PASS.
- N1-track-unknown-event: track {event:'frobnicate-116'} -> ok=true,
  tracked=true, event echoed (trackEvent switch :94-144 has NO
  default case: unknown events fall through silently yet return
  tracked=true — SILENT ACCEPT). PASS.
- N2-unknown-event-no-effect: get_metrics -> all 6 counters EQUALS
  the N0 snapshot (totalRequests still 0; accepted-but-dropped:
  tracked=true with zero counter movement). PASS.
- N3-monitoring-unknown-action: {action:'frobnicate-116'} -> ok=false,
  error='Unknown action: frobnicate-116' (execute switch default
  :79-80 throws; actions validated, events not — the asymmetry
  pin). PASS.

## OBS-116-1 (cache_manager: second action-blind medium + cross-workspace)
C1/C2/C5 prove at LIVE dispatch level that set (mutation), clear
(destructive) and get/stats (reads) all traverse ONE identical path:
default medium risk, no approval, no workspace/user requirement —
the same enforced dispatch reality as monitoring OBS-115-1, now in a
second tool. C3 adds the isolation half: entries written under ws-A
are readable under ws-B and the sets counter is shared — a second
workspace observes (and via set/delete/clear, perturbs) the first
workspace's cache. Extra edge: even the read path mutates global
stats (get bumps hits/misses), so no cache_manager call is
side-effect-free despite sideEffects=[]. Smallest fix direction (NOT
implemented — audit-first, coordinated ownership): action-aware risk
(set/delete/clear high or workspace-required) plus a per-workspace
cache partition or an explicit process-global documented contract.
Proposed repair-backlog item at team ownership decision. No
unilateral ToolService/registry edit.

## OBS-116-2 (monitoring event silent-accept: evidence-integrity gap)
N1/N2 vs N3 pin a contract asymmetry INSIDE one tool: unknown ACTIONS
are rejected ('Unknown action'), unknown EVENTS are accepted-but-
dropped (tracked=true, zero effect). Consequence for an observability
tool: a typo'd event name ('sucess') silently vanishes while the
caller reads tracked=true and believes the observation was recorded
— evidence-integrity failure in the exact tool that vouches for
system behavior. Smallest fix direction (NOT implemented —
audit-first): a default case returning ok=false 'Unknown event'
(sibling-conformant with the action default two lines above), or an
explicit documented accept-and-drop contract with a dropped counter.
Proposed backlog item (P2, contract/evidence integrity).

## OBS-116-3 (sibling-skeleton family: one ownership decision)
C4/N3 show cache_manager and monitoring share the identical handler
skeleton (permissions=[], process-global statics, action switch with
default-throw). The event-switch-without-default is the lone
silent-drop in the pair's contract surface — a two-line
sibling-conformant fix, not a design decision. Together with
OBS-115-1/115-3, three findings now point at ONE family (in-memory
state tools with action-blind medium + global statics + uneven
validation) needing ONE ownership decision, not three separate
triages. Proposed as a single grouped backlog item.

## Verdict
- No new SIGNIFICANT defects in the dispatch path itself; TWO
  security/evidence-adjacent OBS (116-1 cache action-blind medium +
  cross-workspace cache; 116-2 monitoring event silent-accept)
  proposed for the repair backlog at team ownership decision,
  alongside standing OBS-114-1 (browser gate regex split) and
  OBS-115-1 (monitoring action-blind medium). Level-3 dispatch
  PROVEN for 19 families (116 adds cache_manager; monitoring depth
  extended with event-contract pins) with the gate-vs-handler split
  on EIGHT gate tools and all four risk levels live-pinned. No
  repairs (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-116 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-115 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115; this
  checkpoint adds the 13-case dispatch battery + OBS-116-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 116 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=19 families (110-115 eighteen + 116:
  cache_manager — live executeTool; plus monitoring unknown-event
  silent-accept/no-effect + unknown-action contrast pins)
DISPATCH_GATE_PROVEN=8 tools (unchanged; 116 cases flow default
  allowance by design — no new gate pin this battery)
RISK_LEVELS_LIVE=4/4 (low/medium/high/critical pinned in 114;
  116 re-exercises low D1 + medium C/N through default allowance)
RISK_SPLIT=tool-x-input (unchanged; 116 re-confirms: risk follows
  the resolved tool with zero dispatch-layer special case for
  cache_manager/monitoring)
GATE_REGEX_ASYMMETRY=1 (:137 vs :179 login/submit/sign-in split,
  live-proven B2-vs-B3 114; OBS-114-1, proposed backlog, unowned)
ALIAS_SHADOW_LAYERS=1 (hardcoded :526 shadows TOOL_ALIASES :692 for
  4 names; :198 grep_search->low dead at dispatch; OBS-115-2,
  proposed backlog, unowned)
MONITORING_ACTION_BLIND_MEDIUM=1 (track/reset/get_metrics identical
  zero-friction medium path; counters cross-workspace visible;
  OBS-115-1, proposed backlog, unowned; MONITORING-010-NVIDIA
  review pending)
CACHE_ACTION_BLIND_MEDIUM=1 (set/delete/clear/get/stats identical
  zero-friction medium path; entries+counters cross-workspace
  visible; reads mutate global stats; OBS-116-1, proposed backlog,
  unowned)
MONITORING_EVENT_SILENT_ACCEPT=1 (unknown events tracked=true with
  zero effect while unknown actions are rejected; OBS-116-2,
  proposed backlog, unowned)
ACTION_VALIDATED_EVENT_NOT=1 (the N1-vs-N3 asymmetry; evidence-
  integrity gap in the observability tool)
CONTENTTOOLS_VALIDATION_MAP=COMPLETE (3 of 4 guard; rss_fetch lone
  outlier; OBS-115-3, strengthens P2 backlog case)
ERROR_SUBSTITUTION_PINNED=1 (:946 generic message live via R1-114)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115: ContentTools 3-guarded/1-outlier) + action/event asymmetry
  class (116: validated actions vs silent-drop events)
RESOLVER_PARITY_LIVE=YES (in-probe resolveToolPath == handler
  resolution, P4-112; re-exercised G1-115 seeding)
DISPATCH_LOG_ENVELOPE=YES (:623 start line + :929 handler append;
  envelope-only shape pinned H1-113; orig-alias hop pinned G1-115)
ALIAS_TABLE_PROVEN=3 chains (shell->shell_execute gate+handler,
  110; fetch_url->http_fetch handler, 113; grep_search->search_text
  handler + orig-hop log pin, 115)
ORPHAN_REPIN=1 (image_generate->generate_image->unknown_tool, 110)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
READ21_R1_CLOSED=21/21 (5 write in 080 + 16 read in 104/105)
FIREWALL_R2_CLOSED=YES (106: 6/6 probe PASS, EXIT 0)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DUPLICATE=2 relationships (unchanged)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13 (110+111+112+113+114+115+116 probes, 116 first-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(python_execution/execute_python + terminal_manager depth;
in-memory-state family grouped repair proposal) or the next
Codex-requested bounded scope, or OBS-114-1 / OBS-115-1 / OBS-116-1
ownership/repair proposals at a coordinated checkpoint. No
registry/ToolService/tool edits without ownership.
