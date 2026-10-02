# WIRING CHECKPOINT 119 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=a6f8fb61 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — terminal_manager UNSCOPED
## write/kill/resize reachability + silent-noop verdict pins (Level 3)
Follow-up to 118 (OBS-118-1 conjectured write/kill reachability
from the shared id-derivation path and deliberately did NOT execute
them cross-session). This probe closes the conjecture with
OWNED-PROBE-ONLY effects: the single PTY in the hermetic process is
the probe's own (T0 baseline proves empty before create), it is
resized once (R1, harmless) and killed in-probe (K1, intended
teardown). For each target the probe executes the REAL executeTool
path (alias layer -> registry -> firewall -> approval gate ->
handler). Same isolated tsx method: canonical test env (setup.ts:
JSON persistence, mock DB), bypass OFF (hermetic), full
attribution, zero network, FS contained via EXTERNAL_PROJECTS_DIR +
JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-119. NO AUTO_APPROVE_* set
at any point. Ran from the plain DOS path, TSX EXIT 0, first run.
No source edited; probe runs left ZERO tracked modifications
(verified via git status on api/src + web/src + api/package.json
after run: zero tracked dirty; only pre-existing untracked
.jest-cache/.tmp). Containment tree verified: joe-terminal +
joe-test-data-* + joe-test-store-* + projects/probe-ws-119 + tsx
cache, all inside sbx-tmp-119; nothing outside (plus two
__PSScriptPolicyTest_* files the sandbox PS host drops into $sbx
because TEMP pointed there — host artifact, not probe output).
Result: 15/15 PASS, failed=0, first run. Probe:
tmp/team-consultation/muse-119-dispatch-probe.ts; receipts:
muse-119-dispatch-probe.stdout.log/.stderr.log (same dir; UTF-16
via PS redirect like 110-118 — parse with ReadAllText; TSX_EXIT=0
is the primary verdict, 15/17 regex-confirmed: 15x "pass": true,
0x "pass": false, 1x "failed": 0 from the JSON block; logger lines
interleave on stdout so ConvertFrom-Json needs the JSON slice).

## Result: 15/15 PASS, EXIT 0, failed=0 (first run)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111/112/
  113/114/115/116/117/118 control reproduced). PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- T0-terminal-list-empty: unscoped list, fresh process -> ok=true,
  terminals=[] (baseline; also proves TID_NEVER unheld, which is
  the W3/K0 safety precondition). PASS.
- T1-session-create: create with context.sessionId='sess-A-119'
  -> ok=true, id='terminal:sess-A-119' (session forces id :73-77;
  real PTY spawn; fallback=undefined; killed in-probe by K1).
  PASS.
- W1-unscoped-write-no-command: write {id:TID_A} no command, no
  session -> ok=false, error='command input required'
  (WRITE-GUARD pin: handler :135 reached unscoped with an explicit
  id — no owner gate stands before it; nothing executed). PASS.
- W2-scopedB-write-no-command: write no command with sess-B ->
  ok=false, error='command input required' (guard is
  id-independent; same verdict for derived-missing id). PASS.
- W3-unscoped-write-missing-id: write WITH command to never-
  existing 'terminal:never-119' -> ok=true, output 'Input sent
  via kernel' (SILENT-WRITE pin: kernel sendInput :106-110
  returns silently on a missing id; verdict indistinguishable
  from a delivered write; kernel log line 'Attempted input to
  non-existent terminal' in the receipt confirms the silent path;
  nothing executed — no PTY holds the id per T0). PASS.
- R1-unscoped-resize-owned: resize {id:TID_A, 81x31} unscoped ->
  ok=true (RESIZE pin: handler :141-145 has no validation and no
  owner consult; kernel resized the OWNED probe PTY; harmless,
  killed in-probe). PASS.
- R2-scopedB-resize-missing: resize with sess-B (derives to
  missing terminal:sess-B-119) -> ok=true, 'Resized via kernel'
  (SILENT-RESIZE pin: kernel :125-126 silent on missing — the
  SAME verdict as R1's real resize). PASS.
- K0-unscoped-kill-never-id: kill 'terminal:never-119' unscoped
  -> ok=true, 'Terminal killed via kernel' (SILENT-KILL pin:
  kernel :149-150 silent on missing; a kill verdict alone is not
  evidence of effect). PASS.
- K1-unscoped-kill-owned: kill {id:TID_A} unscoped -> ok=true
  (KILL pin: kernel removeTerminal + kill :152-161 ran on the
  OWNED probe PTY via the UNSCOPED path; distinguished from K0's
  silent no-op by K2). PASS.
- K2-session-read-after-kill: read with sess-A -> ok=false,
  error='Terminal not found' (kill verified; readHistory
  :167-171 throws — the ONLY terminal action that reports a
  missing id instead of silent-ok). PASS.
- K3-final-list-empty: unscoped list -> ok=true, terminals=[]
  (cleanup verified; zero in-process residue). PASS.
- Teardown note: the node-pty conpty_console_list_agent
  'AttachConsole failed' stack appears in stderr AFTER the
  complete JSON verdict (same sandbox PTY teardown artifact as
  117 run-1 and 118; all 15 verdicts already recorded; main
  process TSX_EXIT=0). Kernel log sequence in the receipt
  (create -> input-received/warn -> resize 81x31 -> killed ->
  exit code) matches the case order exactly. No orphaned
  session: K1+K2+K3 + kernel exit log prove the PTY died
  in-probe.

## OBS-119-1 (OBS-118-1 COMPLETE — all terminal actions reachable
## unscoped with an explicit id; kill proven live on the owned PTY)
W1+R1+K1 prove at LIVE dispatch level what 118 conjectured from
source: the tool handler's write (:134-139), resize (:141-145)
and kill (:147-150) paths consult neither terminalSessionOwnerOf
nor terminalOwnerOf — TaskInteractionTools.ts:71-158 contains no
registry read on any path — so an unscoped caller naming a
session terminal's id explicitly reaches every action: list (S5-
118), read (S6-118), write-guard (W1), resize (R1), kill (K1).
Create is session-forcing by design (:73-77), not a gap. The WS
ingress asymmetry from OBS-118-1 therefore covers the FULL action
set: ws.ts refuses foreign terminal_input/resize/broadcast while
the tool path derives-only on all six actions. This strengthens
(not replaces) the standing OBS-118-1 P2 + security-note backlog
case: one fix direction (consult the existing owner registry in
the tool handler with ws.ts refuse-on-mismatch semantics, or
document the tool path as intentionally privileged with its
trust boundary stated) now covers read AND write AND kill. No
unilateral tool edit; needs owner decision. Scoped-path
accidents remain prevented (S3/S4-118 + W2/R2 guard/no-op pins)
— the gap is the UNSCOPED path only, and no foreign PTY was
touched: every 119 mutation hit the probe's own PTY.

## OBS-119-2 (terminal verdicts are effect-blind on missing ids —
## read is the lone reporter; silent-accept class)
W3+R2+K0 prove at LIVE dispatch level that write/resize/kill to a
missing id all return ok=true with success-worded messages
('Input sent' / 'Resized' / 'Terminal killed via kernel') while
doing nothing (kernel :106-110, :125-126, :149-150 silent
returns). Only readHistory throws 'Terminal not found' (:167-
171, K2). So for 3 of 6 terminal actions the caller cannot
distinguish "action applied" from "no such terminal" — an
observability asymmetry in the same silent-accept class as
OBS-116-2 (monitoring event silent-accept). Smallest fix
direction (NOT implemented — audit-first, coordinated
ownership): return ok=false 'Terminal not found' from the three
silent kernel paths (matching readHistory), or document the
fire-and-forget contract per action. Proposed repair-backlog
item (P2 observability; needs owner decision — the silent
no-op may be load-bearing for the panel's kill-after-exit
cleanup at :78-83, which deliberately ignores cleanup errors).
No unilateral kernel edit.

## Verdict
- No new SIGNIFICANT defects in the dispatch path itself; ONE
  OBS completion (119-1 closes the 118-1 conjecture live and
  widens its fix scope to all actions) and ONE new backlog-grade
  OBS (119-2 effect-blind verdicts, P2 observability), proposed
  for the repair backlog at team ownership decision, alongside
  standing OBS-114-1 (browser gate regex split), OBS-115-1
  (monitoring action-blind medium), OBS-115-2 (alias shadow
  layers), OBS-116-1 (cache action-blind medium + cross-
  workspace), OBS-116-2 (monitoring event silent-accept),
  OBS-117-1 (execute_python Windows-dead binary), OBS-117-2
  (run_command divergent shadow), OBS-118-1 (tool-vs-WS
  ownership-enforcement asymmetry). Level-3 dispatch PROVEN for
  21 families (119 adds unscoped write/kill/resize depth +
  silent-noop verdict pins; no new family count — depth, not
  breadth) with the gate-vs-handler split on EIGHT gate tools
  and all four risk levels live-pinned. No repairs (audit-first;
  coordinated ownership).
- 084 P4 + all F/OBS items 086-119 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-118 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118; this checkpoint adds the 15-case dispatch battery +
  OBS-119-1/119-2).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 119 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=21 families (110-118 + 119 unscoped
  write/kill/resize depth + silent-noop verdict pins — live
  executeTool)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pins the
  run_command->shell_execute HIGH gate verdict)
RISK_LEVELS_LIVE=4/4 (low/medium/high/critical pinned in 114;
  119 re-exercises low D1 + medium T/W/R/K-chain through default
  allowance + high via H4 gate verdict)
RISK_SPLIT=tool-x-input (unchanged; 119 re-confirms: risk follows
  the resolved tool; sessionId changes nothing)
SESSION_OVERRIDE_LIVE=YES (context.sessionId forces
  terminal:<sid>, T1; S1-118 decoy-id variant stands)
SCOPED_ISOLATION_LIVE=YES (S3/S4-118; W2/R2-119 add guard/no-op
  pins for write/resize)
UNSCOPED_TERMINAL_ACTIONS_REACHABLE=5/6 (list S5 + read S6 + write
  W1 + resize R1 + kill K1, all with explicit id; create is
  session-forcing by design; OBS-118-1 + OBS-119-1, proposed
  backlog, unowned)
SILENT_NOOP_VERDICTS=3 (write W3 + resize R2 + kill K0 return
  ok=true on missing ids; OBS-119-2, proposed backlog, unowned)
READ_MISSING_THROWS=1 (readHistory lone reporter; K2)
WS_TOOL_OWNERSHIP_ASYMMETRY=1 (full action set: ws.ts refuses
  foreign input/resize/broadcast; tool handler consults neither
  registry on any path; OBS-118-1 + OBS-119-1, proposed backlog,
  unowned)
SHADOW_QUARTET_PINNED=4/4 (H1-H4-118 stand; H4 re-pinned in 119)
DIVERGENT_SHADOW=1 (run_command only; OBS-117-2 + OBS-118-2 + H4
  re-pin, proposed backlog, unowned)
GATE_BEFORE_HANDLER_EMPTY_INPUT=1 (re-pinned H4-119)
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
  handlers self-validate, OBS-111-2)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115: ContentTools 3-guarded/1-outlier) + action/event asymmetry
  class (116: validated actions vs silent-drop events) + gate-vs-
  guard order class (117: approval gate pre-empts handler input
  guard on high-risk empty input) + ingress-enforcement asymmetry
  class (118: WS ingress refuses foreign session/user, tool
  ingress derives-only) + verdict-effect asymmetry class (119:
  ok=true verdicts that did nothing vs the lone throwing read)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15 (110+111+112+113+114+115+116+117+118+119 probes, 119 first-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(in-memory-state family grouped repair proposal; execute_python
interpreter-resolution proposal; terminal owner-check + silent-
verdict repair proposals at ownership decision) or the next
Codex-requested bounded scope, or OBS-114-1 / OBS-115-1 /
OBS-116-1 / OBS-117-1 / OBS-117-2 / OBS-118-1 / OBS-119-2
ownership/repair proposals at a coordinated checkpoint. No
registry/ToolService/tool edits without ownership.
