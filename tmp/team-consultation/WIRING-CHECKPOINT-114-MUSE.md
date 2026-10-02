# WIRING CHECKPOINT 114 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=c137e382 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only)

## Scope: dispatch-reachability battery — shell input-classes, rss
## contract, browser_run gate pair + login asymmetry (Level 3)
Follow-up to 113 (next step named browser_run sensitive-text gate
via isSafeLocalBrowserQa analysis, shell curl input-class, rss_fetch
contract). For each target this probe executes the REAL executeTool
path (alias layer -> registry -> firewall -> approval gate ->
handler) with inputs each layer provably rejects BEFORE any side
effect, plus one low-risk positive whose effect is provably inert
in this hermetic process. Same isolated tsx method: canonical test
env (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic),
full attribution, NO sessionId, zero network, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-114.
NO AUTO_APPROVE_* set at any point: medium/low cases reach the
handler through the default allowance, high/critical meet the gate.
Ran from the plain DOS path, TSX EXIT 0. No source edited; probe
runs left ZERO tracked modifications (verified via git status on
api/src + web/src after run: only pre-existing untracked cache
entries). Containment tree verified: test stores + projects/
(probe-ws-114 empty workspace dir only) + tsx cache, all inside
sbx-tmp-114; nothing outside. Probe:
tmp/team-consultation/muse-114-dispatch-probe.ts; receipts:
muse-114-dispatch-probe.stdout.log/.stderr.log (same dir; UTF-16
via PS redirect like 110/111/112/113 — parse with ReadAllText;
TSX_EXIT=0 is the primary verdict, 10/10 regex-confirmed).

## Result: 10/10 PASS, EXIT 0, failed=0 (first run)
LAUNCH NOTE (methodology, not a probe verdict): the first launch
attempt failed BEFORE tsx started — tsx.cmd is a cmd.exe shim and
the tool-provided workdir arrived as a `\\?\`-prefixed path, which
cmd.exe rejects ("UNC paths are not supported"). Reran from the
plain DOS path (cd D:\Joe\muse-worktree\api); that run is the
committed receipt. Future probes: always cd to the plain path
inside the command, never rely on the workdir parameter.
- P0-preconditions: bypass=unset, isSystem=false, sbx=set. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111/112/
  113 control reproduced). PASS.
- S0-shell-critical: shell_execute {command:'sudo probe-114'} ->
  ok=false, error='approval_required', risk=critical (GATE,
  classifyToolRisk :157 \bsudo\b — FIRST critical pin; gate fires
  BEFORE the handler, so no shell spawned). PASS.
- S1-shell-curl-order: shell_execute {command:'echo curl'} ->
  ok=false, error='approval_required', risk=high (GATE, :159 curl
  branch fires BEFORE the :165-166 readOnlyDiagnostic echo-low
  exception — 'echo curl' matches the echo low pattern, so high
  PROVES branch order, not the :168 default fallthrough). PASS.
- S2-shell-low-exec: shell_execute {command:'echo probe-114-ok'}
  -> ok=true, status=success, stdout has probe text, exitCode=0
  (HANDLER positive, low via :166 -> REAL handler execution;
  handler policy :1566 blocks only 'rm -rf /' and 'sudo', so echo
  runs; success shape :1672-1676; stdout-only effect, inert).
  PASS.
- R1-rss-contract: rss_fetch {} -> ok=false, error='Tool reported
  failure without an error message' (HANDLER, ContentTools.ts:
  101-118 — NO missing-url guard, unlike http_fetch/html_extract;
  url='' flows into rss-parser parseURL, whose rejection carries
  no .message, so dispatch :946 substitutes the generic text).
  PASS (divergence pinned; see OBS-114-2).
- B1-browser-sensitive-gate: browser_run {instructionText:'enter
  the password probe-114', actions:[goto loopback]} -> ok=false,
  error='approval_required', risk=high (GATE, :179 sensitive-text
  branch; gate fires BEFORE BrowserRunTool.execute — zero browser
  launch). PASS.
- B2-browser-click-login-gate: browser_run {instructionText:
  'probe-114 click test', actions:[{type:'click',text:'login'}]}
  -> ok=false, error='approval_required', risk=high (GATE, :191
  click-text branch — instructionText matches nothing at :179, so
  high PROVES the click branch specifically). PASS.
- B3-browser-login-asymmetry: browser_run {mode:'browser_test',
  instructionText:'please login to continue probe-114',
  actions:[goto loopback]} WITHOUT sessionId -> ok=false,
  error='sessionId_required' (GATE+HANDLER: :178 safe-QA fails
  ONLY because :137 excludes 'login'; :179 omits login, so the
  input falls to :194 medium and REACHES the handler, which
  rejects pre-launch at BrowserRunTool.ts:248 — executor import
  at :350 is downstream. Zero browser launch proven by the error
  + the :245-248 trace). PASS.

## OBS-114-1 (gate regex asymmetry, browser_run — SECURITY-adjacent)
The two sensitive-text predicates DISAGREE: :137 (safe-QA
exclusion) lists login/submit/sign-in (+Arabic إرسال/تسجيل)
while :179 (high trigger) does not. Live-proven consequence:
the same word 'login' in instructionText flows MEDIUM (B3,
reaches handler) but in click-text flows HIGH (B2, gate), and
'password' flows HIGH everywhere (B1). B3 survived only because
the handler demanded sessionId — a future caller that SUPPLIES a
sessionId would execute a login-bearing browser run with loopback
QA shape and NO approval. The gate's credential-adjacency posture
is therefore input-FIELD-dependent, not word-dependent. Smallest
fix direction (NOT implemented — audit-first, coordinated
ownership): reconcile :137/:179 into ONE shared sensitive-text
predicate used by both the safe-QA exclusion and the high
trigger. Proposed repair-backlog item, P1/P2 at team decision.
No unilateral ToolService edit.

## OBS-114-2 (error-message degradation chain, rss_fetch)
R1 pins a three-stage diagnostic loss inside ONE tool call: (a)
handler has no presence guard (url='' enters the library); (b)
the library rejection carries no .message (handler's
`error: e.message` is undefined); (c) dispatch :946 substitutes
'Tool reported failure without an error message'. The operator
sees a verdict with ZERO diagnostic content — no input echo, no
layer, no URL. Contrast http_fetch/html_extract's exact 'url
required' IN THE SAME FILE (ContentTools.ts validates 2 of 3
network tools). Mitigating asset (113 OBS-113-1 holds): the
dispatch start-line envelope still records WHICH tool was
entered, so the failure stays attributable. General rule for the
matrix: presence-guard absence costs twice — wasted work (import
+ parse attempt) AND degraded diagnosis.

## OBS-114-3 (risk branch order as contract + critical==high at gate)
S1 proves :159 (curl/wget/ssh/...) SHADOWS the :165-166
readOnlyDiagnostic exception: any future addition to the :159
list silently re-gates previously-low commands, and any new low
exception must be audited against :159 first — branch ORDER is
part of the risk contract, not an implementation detail. S0 adds
the other half: critical maps to approval_required IDENTICALLY
to high at the gate (:779 requiresAll) — the critical/high
DISTINCTION currently has no gate consequence; its value is
downstream (risk output, audit, forensics). All four risk levels
are now live-pinned (low S2, medium B3/T1-113, high S1/B1/B2,
critical S0).

## Verdict
- No new SIGNIFICANT defects in the dispatch path itself; ONE
  security-adjacent OBS (114-1, gate regex asymmetry) proposed
  for the repair backlog at team ownership decision. Level-3
  dispatch PROVEN for 15 families (114 adds rss_fetch; shell
  real-execution depth + browser handler-reachability depth)
  with the gate-vs-handler split now proven on EIGHT gate tools
  and all four risk levels live-pinned. No repairs (audit-first;
  coordinated ownership).
- 084 P4 + all F/OBS items 086-114 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-113 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113; this checkpoint
  adds the 10-case dispatch battery + OBS-114-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 114 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=15 families (110-113 fourteen + 114:
  rss_fetch — live executeTool; plus shell real-execution depth
  S2 and browser pre-launch-reject depth B3 on already-counted
  families)
DISPATCH_GATE_PROVEN=8 tools (shell_execute default high, 110;
  git_ops push high, 111; deploy_project expose_port high, 112;
  delete_file name-based high, 113; shell sudo critical S0,
  shell curl-order high S1, browser sensitive-text high B1,
  browser click-text high B2 — 114)
RISK_LEVELS_LIVE=4/4 (low S2-114, medium B3-114/T1-113, high
  S1/B1/B2-114 + prior, critical S0-114)
RISK_SPLIT=tool-x-input (G1+G2 same-tool both-layers, 111;
  P1+P2/P4 second pin + gate-before-handler order, 112;
  name-based coarse branch pinned, 113; curl-shadows-low
  branch-order pin S1 + field-dependent gate split B2/B3, 114)
GATE_REGEX_ASYMMETRY=1 (:137 vs :179 login/submit/sign-in split,
  live-proven B2-vs-B3; OBS-114-1, proposed backlog, unowned)
ERROR_SUBSTITUTION_PINNED=1 (:946 generic message live via R1;
  OBS-114-2)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at
  dispatch; handlers self-validate, OBS-111-2; third pin on a
  low-risk tool via T2, 113)
VALIDATION_DEPTH_PINNED=3 layers deploy (presence/resolve+
  contain/exists/switch; P2/P3/P4, 112) + config-gate layer
  class (payments pre-import, M1, 113) + missing-presence cost
  (rss wasted-work + degraded-diagnosis, R1, 114)
RESOLVER_PARITY_LIVE=YES (in-probe resolveToolPath ==
  handler resolution, P4, OBS-112-3)
DISPATCH_LOG_ENVELOPE=YES (:623 start line + :929 handler
  append; envelope-only shape pinned live, H1, OBS-113-1)
ALIAS_TABLE_PROVEN=2 chains (shell->shell_execute gate+handler,
  110; fetch_url->http_fetch handler, 113)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10 (110+111+112+113+114 probes, 114 first-run receipts committed; launch-note disclosed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(json_query pure-function positive; monitoring read-vs-mutation
split per CODEX-TO-MUSE-MONITORING-CONTRACT at a noncritical
checkpoint; grep_search alias chain) or the next Codex-requested
bounded scope, or OBS-114-1 ownership/repair proposal at a
coordinated checkpoint. No registry/ToolService/tool edits
without ownership.
