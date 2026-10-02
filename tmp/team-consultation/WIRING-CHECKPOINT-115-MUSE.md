# WIRING CHECKPOINT 115 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=77af23e0 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only)

## Scope: dispatch-reachability battery — json_query contract,
## grep_search alias chain, monitoring read-vs-mutation + cross-workspace
## isolation (Level 3)
Follow-up to 114 (next step named json_query pure-function positive;
monitoring read-vs-mutation split per CODEX-TO-MUSE-MONITORING-CONTRACT;
grep_search alias chain). For each target this probe executes the REAL
executeTool path (alias layer -> registry -> firewall -> approval gate ->
handler). Same isolated tsx method: canonical test env (setup.ts: JSON
persistence, mock DB), bypass OFF (hermetic), full attribution, NO
sessionId, zero network, FS contained via EXTERNAL_PROJECTS_DIR +
JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-115. NO AUTO_APPROVE_* set at
any point: all 12 cases flow through the default allowance (medium/low),
none meets the gate. Ran from the plain DOS path, TSX EXIT 0. No source
edited; probe runs left ZERO tracked modifications (verified via git
status + diff HEAD on api/src + web/src after run: only pre-existing
untracked cache entries api/src/.jest-cache/, api/src/.tmp/).
Containment tree verified: test stores + projects/probe-ws-115/
probe-grep-115/seed.txt + tsx cache, all inside sbx-tmp-115; nothing
outside. Probe: tmp/team-consultation/muse-115-dispatch-probe.ts;
receipts: muse-115-dispatch-probe.stdout.log/.stderr.log (same dir;
UTF-16 via PS redirect like 110-114 — parse with ReadAllText; the
stdout log carries ~137 bytes of registry/setup console noise before
the JSON payload; TSX_EXIT=0 is the primary verdict, 12/12
regex-confirmed from the JSON block).

## Result: 12/12 PASS, EXIT 0, failed=0 (first run)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111/112/
  113/114 control reproduced). PASS.
- J1-json-positive: json_query {json:{a:{b:42}}, path:'a.b'} ->
  ok=true, value=42 (HANDLER pure function, ContentTools.ts:
  132-152; no FS, no network; permissions=[] -> no firewall
  attribution requirement; default medium -> default allowance).
  PASS.
- J2-json-missing-guard: json_query {path:'a.b'} -> ok=false,
  error='json required' (HANDLER presence guard, ContentTools.ts:
  135). PASS (completes the per-file validation map; see OBS-115-3).
- G1-grep-alias-positive: grep_search {query:'probe-115-marker-7f3a',
  path:'probe-grep-115'} on a seed file pre-created via the REAL
  resolveToolPath -> ok=true, total=1, match has marker, dispatch
  logs contain 'orig=grep_search', resolved dir inside sbx (ALIAS+
  HANDLER: hardcoded redirect :526 resolves grep_search->search_text
  BEFORE the :623 start line and before risk classification at :778,
  which runs on 'search_text' -> default medium -> allowed;
  search_text permissions=['read'] -> attr workspaceId+userId satisfy
  the firewall; REAL file read inside containment). PASS.
- G2-grep-empty-query: grep_search {} -> ok=false, error='search_text
  needs a query ...' (HANDLER validation reached THROUGH the alias:
  requiredAny is NOT enforced at dispatch). PASS (fourth pin of the
  OBS-111-2 schema-not-enforced class).
- M0-metrics-baseline: monitoring {action:'get_metrics'} under ws-A
  -> ok=true, totalRequests=0 (fresh hermetic process). PASS.
- M1-track-mutation: monitoring {action:'track', event:'request'}
  under ws-A -> ok=true, tracked=true (HANDLER mutation through the
  default medium allowance: monitoring has NO risk special case in
  classifyToolRisk :142-203 and permissions=[]/sideEffects=[]
  (MonitoringTool.ts:45-46), so NO approval and NO workspace/user
  requirement — identical friction to the read action). PASS.
- M2-mutation-effect: get_metrics under ws-A -> totalRequests=1
  (baseline+1, live dispatch-level mutation effect; complements
  Codex's class-level 0->1). PASS.
- M3-cross-workspace: get_metrics under ws-B (different workspaceId)
  -> totalRequests=1, EQUALS ws-A (process-global static metrics,
  MonitoringTool.ts:51-62 — cross-workspace visibility). PASS.
- M4-reset-reachable: monitoring {action:'reset'} -> ok=true,
  reset=true; get_metrics after -> totalRequests=0 (destructive
  action through the same zero-friction medium path; hermetic
  in-memory only, no external effect). PASS.

## OBS-115-1 (action-blind medium + process-global counters, monitoring)
M1/M2/M4 prove at LIVE dispatch level that track (mutation), reset
(destructive) and get_metrics (read) all traverse ONE identical path:
default medium risk, no approval, no workspace/user requirement. The
registry's read-default is therefore not just a label mismatch (Codex
class-level finding, preserved) but an ENFORCED dispatch reality: the
mutation actions are reachable with read-grade friction. M3 adds the
isolation half Codex asked to assess: counters written under ws-A are
readable under ws-B with zero tenant boundary — a second workspace
observes (and via track/reset, perturbs) the first workspace's
metrics. Smallest fix direction (NOT implemented — audit-first,
coordinated ownership; MONITORING-010-NVIDIA review still pending):
action-aware risk (track/reset high or workspace-required) plus a
per-workspace metric partition or an explicit process-global
documented contract. Proposed repair-backlog item at team ownership
decision. No unilateral ToolService/registry edit.

## OBS-115-2 (alias shadow layers: hardcoded redirect + dead low branch)
G1 pins a THREE-layer alias stack with only one live path for these
names: (a) hardcoded redirect :526 catches grep_search/grep/
search_code/find_in_files BEFORE the start line; (b) TOOL_ALIASES
:692 would catch them AFTER the start line — unreachable for those
four names (but still live for ripgrep/code_search/search_in_files,
which have no hardcoded branch); (c) classifyToolRisk :198 lists
'grep_search->low' — DEAD at dispatch, because risk is always
computed post-resolution on 'search_text' (default medium). G1's
medium-allowed verdict + 'orig=grep_search' start line prove (a)+(c)
simultaneously: the name in the log is the alias, the risk is the
target's. Consequence: anyone reading :198 believes grep_search is
low-risk; the live system treats it as medium. Smallest fix direction
(NOT implemented — audit-first): reconcile into ONE alias layer and
drop the dead :198 alternative or classify pre-resolution names
explicitly. Proposed backlog item (P3/P4, ambiguity cleanup).

## OBS-115-3 (ContentTools validation map complete — rss stands alone)
J2 pins json_query's 'json required' guard (:135). Combined with 113
(http_fetch/html_extract 'url required') and 114-R1 (rss_fetch NO
guard), the file's validation map is now COMPLETE and live-proven: 3
of 4 data/network tools presence-guard, rss_fetch is the lone
outlier IN ITS OWN FILE. This strengthens the rss P2 backlog case
from "missing guard" to "inconsistent with every sibling" — the fix
is a two-line sibling-conformant guard, not a design decision. No
unilateral edit (audit-first; team ownership).

## Verdict
- No new SIGNIFICANT defects in the dispatch path itself; ONE
  security-adjacent OBS (115-1, monitoring action-blind medium +
  cross-workspace counters) proposed for the repair backlog at team
  ownership decision, alongside standing OBS-114-1 (browser gate
  regex split). Level-3 dispatch PROVEN for 18 families (115 adds
  json_query, search_text-via-alias, monitoring) with the
  gate-vs-handler split on EIGHT gate tools and all four risk
  levels live-pinned. No repairs (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-115 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-114 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114; this
  checkpoint adds the 12-case dispatch battery + OBS-115-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 115 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=18 families (110-114 fifteen + 115:
  json_query, search_text-via-grep_search-alias, monitoring — live
  executeTool; plus monitoring cross-workspace + reset depth and
  grep alias-hop log pin)
DISPATCH_GATE_PROVEN=8 tools (unchanged; 115 cases flow default
  allowance by design — no new gate pin this battery)
RISK_LEVELS_LIVE=4/4 (low/medium/high/critical pinned in 114;
  115 re-exercises low D1 + medium J/G/M through default allowance)
RISK_SPLIT=tool-x-input (G1 adds alias-vs-target split: risk follows
  the RESOLVED name, not the requested name)
GATE_REGEX_ASYMMETRY=1 (:137 vs :179 login/submit/sign-in split,
  live-proven B2-vs-B3 114; OBS-114-1, proposed backlog, unowned)
ALIAS_SHADOW_LAYERS=1 (hardcoded :526 shadows TOOL_ALIASES :692 for
  4 names; :198 grep_search->low dead at dispatch; OBS-115-2,
  proposed backlog, unowned)
MONITORING_ACTION_BLIND_MEDIUM=1 (track/reset/get_metrics identical
  zero-friction medium path; counters cross-workspace visible;
  OBS-115-1, proposed backlog, unowned; MONITORING-010-NVIDIA
  review pending)
CONTENTTOOLS_VALIDATION_MAP=COMPLETE (3 of 4 guard; rss_fetch lone
  outlier; OBS-115-3, strengthens P2 backlog case)
ERROR_SUBSTITUTION_PINNED=1 (:946 generic message live via R1-114)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; fourth pin via G2 requiredAny,
  115)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115: ContentTools 3-guarded/1-outlier)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12 (110+111+112+113+114+115 probes, 115 first-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(monitoring unknown-event silent-accept pin; python_execution /
terminal_manager depth; cache_manager read-vs-mutation split as a
second action-blind-medium candidate) or the next Codex-requested
bounded scope, or OBS-114-1 / OBS-115-1 ownership/repair proposals
at a coordinated checkpoint. No registry/ToolService/tool edits
without ownership.
