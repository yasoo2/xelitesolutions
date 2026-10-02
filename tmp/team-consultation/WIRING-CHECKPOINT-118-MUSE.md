# WIRING CHECKPOINT 118 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=88c53795 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — terminal_manager SESSION-
## SCOPED isolation depth + :429 shadow-sibling completion (Level 3)
Follow-up to 117 (next step named session-scoped terminal
isolation depth). For each target this probe executes the REAL
executeTool path (alias layer -> registry -> firewall -> approval
gate -> handler). Session identity travels in the ToolContext (the
production route path: TaskInteractionTools.ts:92-96 notes the
route puts identity in CONTEXT). Same isolated tsx method:
canonical test env (setup.ts: JSON persistence, mock DB), bypass
OFF (hermetic), full attribution, zero network, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-118.
NO AUTO_APPROVE_* set at any point. S1 spawns one real PTY and S7
kills it in-probe. Ran from the plain DOS path, TSX EXIT 0,
first run. No source edited; probe runs left ZERO tracked
modifications (verified via git status on api/src + web/src +
api/package.json after run: zero tracked dirty; only pre-existing
untracked .jest-cache/.tmp). Containment tree verified:
joe-terminal + joe-test-data-* + joe-test-store-* +
projects/probe-ws-118 + tsx cache, all inside sbx-tmp-118; nothing
outside. Result: 17/17 PASS, failed=0, first run. Probe:
tmp/team-consultation/muse-118-dispatch-probe.ts; receipts:
muse-118-dispatch-probe.stdout.log/.stderr.log (same dir; UTF-16
via PS redirect like 110-117 — parse with ReadAllText; TSX_EXIT=0
is the primary verdict, 17/17 regex-confirmed from the JSON block).

## Result: 17/17 PASS, EXIT 0, failed=0 (first run)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111/112/
  113/114/115/116/117 control reproduced). PASS.
- H1-command-execute-shadow: executeTool('command_execute',
  {action:'list'}) -> ok=false, error='approval_required'
  (hardcoded :429 rewrote to shell_execute; empty-command
  shell_execute classifies HIGH (:168 fallthrough), so the
  approval gate fires BEFORE the handler's missing-command guard
  (:1511). Sibling 1 of the T5-117 run_command pin. Nothing was
  executed). PASS.
- H2-exec-shadow: executeTool('exec', {action:'list'}) ->
  ok=false, error='approval_required' (sibling 2; `exec` is NOT
  a registered tool — no `name = 'exec'` in definitions — so
  the branch is a pure rename, table-silent). PASS.
- H3-terminal-shadow: executeTool('terminal', {action:'list'})
  -> ok=false, error='approval_required' (sibling 3; `terminal`
  is likewise unregistered). PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded). PASS.
- S0-terminal-list-empty: {action:'list'} no session -> ok=true,
  terminals=[] (fresh hermetic process; baseline). PASS.
- S1-session-create-overrides-id: create {id:'probe-118-decoy'}
  with context.sessionId='sess-A-118' -> ok=true,
  id='terminal:sess-A-118' (session OVERRIDES requestedId,
  TaskInteractionTools.ts:73-77; decoy id ignored; real PTY
  spawn; fallback=undefined). PASS.
- S2-session-list-own: list with sess-A -> ok=true,
  terminals=['terminal:sess-A-118'] (scoped filter :176-180).
  PASS.
- S3-session-list-other: list with sess-B -> ok=true,
  terminals=[] (cross-session list isolation). PASS.
- S4-session-read-other: read with sess-B -> ok=false,
  error='Terminal not found' (id derives to terminal:sess-B-118
  which does not exist; cross-session read isolation via id
  derivation). PASS.
- S5-unscoped-list-sees-session: list with NO sessionId ->
  ok=true, terminals=['terminal:sess-A-118'] (SCOPING pin:
  listTerminals('') returns ALL ids unfiltered :176-180).
  PASS.
- S6-unscoped-read-explicit-id: read {id:'terminal:sess-A-118'}
  with NO sessionId -> ok=true, history string len 0 (OWNER
  pin: the read path derives id from requestedId and never
  consults registerTerminalSessionOwner; read-only, nothing
  mutated). PASS.
- S7-session-kill: kill with sess-A -> ok=true (kernel
  killTerminal removes + kills :144-162; 'Session exit
  detected' + 'Terminal killed' logged). PASS.
- S8-session-read-after-kill: read with sess-A -> ok=false,
  error='Terminal not found' (kill verified). PASS.
- S9-final-list-empty: unscoped list -> ok=true, terminals=[]
  (cleanup verified; zero in-process residue). PASS.
- Teardown note: the node-pty conpty_console_list_agent
  'AttachConsole failed' stack appears in stderr AFTER the
  complete JSON verdict (same sandbox PTY teardown artifact as
  117 run-1; all 17 verdicts already recorded; main process
  TSX_EXIT=0). No orphaned session: S7+S8+S9 + kernel exit log
  prove the PTY died in-probe.

## OBS-118-1 (terminal_manager: WS ingress enforces ownership, tool
## ingress does not — enforcement asymmetry)
S5+S6 prove at LIVE dispatch level that the tool path's session
isolation is derivation-only: an unscoped caller lists (S5) and
reads (S6) a session terminal by naming its id explicitly. Source
trace: TaskInteractionTools.ts:71-158 never consults
terminalSessionOwnerOf/terminalOwnerOf; registerTerminalSessionOwner
(:100) is write-only bookkeeping from the tool side. The SAME
registry IS enforced on the WebSocket ingress: ws.ts:373-377
refuses terminal_input on mismatch ('Writing into a terminal that
belongs to someone else runs commands in THEIR shell. Refused, not
merely unreported.'), :395-398 refuses terminal_resize, :552 gates
broadcast fan-out. So a foreign-session WRITE is refused at the
panel socket but reachable via the tool path's write/kill actions
(write/kill owner checks: none — read was proven live S6; write
follows the identical id-derivation code path :134-150 and was
deliberately NOT executed cross-session). Smallest fix direction
(NOT implemented — audit-first, coordinated ownership): consult
the existing owner registry in the tool handler's read/write/kill/
resize paths (same refuse-on-mismatch semantics as ws.ts), or
document the tool path as intentionally privileged with its
trust boundary stated. Proposed repair-backlog item (P2 with a
security note; session-privacy scope, needs owner decision). No
unilateral tool edit. Cross-session accidents via the SCOPED path
remain prevented (S3/S4 green) — the gap is the UNSCOPED path.

## OBS-118-2 (:429 shadow family COMPLETE — 4/4 winners pinned,
## exactly 1 divergent)
H1/H2/H3/H4 prove at LIVE dispatch level that all four :429 names
(command_execute, exec, terminal, run_command) resolve to
shell_execute and meet the HIGH gate on empty input. Registry
check (no `name = '<x>'` in definitions for any of the four)
plus the TOOL_ALIASES read (:212-249) complete the family: only
run_command has a table entry (:244 terminal_manager) — the
DIVERGENT instance from OBS-117-2 — while the other three are
table-silent pure renames (consistent, no reader is misled). The
OBS-117-2 P2 backlog case is now fully evidenced: exactly one
dead/divergent table entry to reconcile (move the :429 group into
TOOL_ALIASES with shell_execute declared, or delete the dead
:244 entry). No new divergence. No unilateral ToolService edit.

## Verdict
- No new SIGNIFICANT defects in the dispatch path itself; ONE
  new backlog-grade OBS (118-1 tool-vs-WS ownership-enforcement
  asymmetry, P2 + security note) and one family-completion pin
  (118-2, strengthens the standing OBS-117-2 P2 case), proposed
  for the repair backlog at team ownership decision, alongside
  standing OBS-114-1 (browser gate regex split), OBS-115-1
  (monitoring action-blind medium), OBS-115-2 (alias shadow
  layers), OBS-116-1 (cache action-blind medium + cross-
  workspace), OBS-116-2 (monitoring event silent-accept),
  OBS-117-1 (execute_python Windows-dead binary), OBS-117-2
  (run_command divergent shadow). Level-3 dispatch PROVEN for 21
  families (118 adds session-scoped terminal depth + the full
  :429 shadow quartet; no new family count — depth, not breadth)
  with the gate-vs-handler split on EIGHT gate tools and all four
  risk levels live-pinned. No repairs (audit-first; coordinated
  ownership).
- 084 P4 + all F/OBS items 086-118 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-117 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117; this checkpoint adds the 17-case dispatch battery +
  OBS-118-1/118-2).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 118 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=21 families (110-117 + 118 session-scoped
  terminal depth + full :429 shadow quartet — live executeTool)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; :429 quartet all
  resolve to the shell_execute HIGH gate on empty input H1-H4)
RISK_LEVELS_LIVE=4/4 (low/medium/high/critical pinned in 114;
  118 re-exercises low D1 + medium S-chain through default
  allowance + high via the :429->shell_execute gate verdicts)
RISK_SPLIT=tool-x-input (unchanged; 118 re-confirms: risk follows
  the resolved tool + sessionId changes nothing — terminal_manager
  medium with and without session context)
SESSION_OVERRIDE_LIVE=YES (context.sessionId forces
  terminal:<sid>, requestedId ignored, S1)
SCOPED_ISOLATION_LIVE=YES (cross-session list S3 + read S4
  isolated via filter + id derivation)
UNSCOPED_SESSION_VISIBILITY=1 (unscoped list S5 + explicit-id
  read S6 reach session terminals; OBS-118-1, proposed backlog,
  unowned)
WS_TOOL_OWNERSHIP_ASYMMETRY=1 (ws.ts refuses foreign input/
  resize/broadcast via owner registry; tool handler consults
  neither registry; OBS-118-1, proposed backlog, unowned)
SHADOW_QUARTET_PINNED=4/4 (command_execute/exec/terminal/
  run_command all -> shell_execute live H1-H4)
DIVERGENT_SHADOW=1 (run_command only: table terminal_manager vs
  live shell_execute; OBS-117-2 + OBS-118-2, proposed backlog,
  unowned)
GATE_BEFORE_HANDLER_EMPTY_INPUT=1 (HIGH gate fires before handler
  missing-input guard; T5-117 + H1-H4 re-pin on all four names)
GATE_REGEX_ASYMMETRY=1 (:137 vs :179 login/submit/sign-in split,
  live-proven B2-vs-B3 114; OBS-114-1, proposed backlog, unowned)
ALIAS_SHADOW_LAYERS=1 (OBS-115-2 class; OBS-118-2 completes the
  :429 family with exactly 1 divergent instance)
MONITORING_ACTION_BLIND_MEDIUM=1 (OBS-115-1, proposed backlog,
  unowned; MONITORING-010-NVIDIA review pending)
CACHE_ACTION_BLIND_MEDIUM=1 (OBS-116-1, proposed backlog, unowned)
MONITORING_EVENT_SILENT_ACCEPT=1 (OBS-116-2, proposed backlog,
  unowned)
PYTHON_WINDOWS_DEAD_BINARY=1 (hardcoded `python3` argv -> ENOENT on
  stock Windows; os.tmpdir staging proven transient-only;
  OBS-117-1, proposed backlog, unowned)
CONTENTTOOLS_VALIDATION_MAP=COMPLETE (3 of 4 guard; rss_fetch lone
  outlier; OBS-115-3, strengthens P2 backlog case)
ERROR_SUBSTITUTION_PINNED=1 (:946 generic message live via R1-114)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115: ContentTools 3-guarded/1-outlier) + action/event asymmetry
  class (116: validated actions vs silent-drop events) + gate-vs-
  guard order class (117: approval gate pre-empts handler input
  guard on high-risk empty input) + ingress-enforcement asymmetry
  class (118: WS ingress refuses foreign session/user, tool
  ingress derives-only)
RESOLVER_PARITY_LIVE=YES (in-probe resolveToolPath == handler
  resolution, P4-112; re-exercised G1-115 seeding)
DISPATCH_LOG_ENVELOPE=YES (:623 start line + :929 handler append;
  envelope-only shape pinned H1-113; orig-alias hop pinned G1-115)
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
DUPLICATE=2 relationships (unchanged)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17 (110+111+112+113+114+115+116+117+118 probes, 118 first-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(in-memory-state family grouped repair proposal; execute_python
interpreter-resolution proposal; terminal write/kill owner-check
proposal detail at ownership decision) or the next Codex-requested
bounded scope, or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 /
OBS-117-2 / OBS-118-1 ownership/repair proposals at a coordinated
checkpoint. No registry/ToolService/tool edits without ownership.
