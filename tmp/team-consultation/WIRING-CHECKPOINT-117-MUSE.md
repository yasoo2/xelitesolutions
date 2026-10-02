# WIRING CHECKPOINT 117 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=eb70573f (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — execute_python handler
## contracts + missing-interpreter behavior, terminal_manager handler
## contracts + bash/run_command alias-shadow resolution (Level 3)
Follow-up to 116 (next step named python_execution/execute_python +
terminal_manager depth). For each target this probe executes the
REAL executeTool path (alias layer -> registry -> firewall -> approval
gate -> handler). Same isolated tsx method: canonical test env
(setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
attribution, NO sessionId, zero network, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-117
(plus one transient os.tmpdir() python file the handler itself owns
and deletes; snapshotted before/after). NO AUTO_APPROVE_* set at any
point. T6 spawns one real PTY and T8 kills it in-probe. Ran from the
plain DOS path, TSX EXIT 0 on run-2. No source edited; probe runs
left ZERO tracked modifications (verified via git status on api/src
+ web/src + api/package.json after run: zero tracked dirty; only
pre-existing untracked .jest-cache/.tmp). Containment tree verified:
test stores + projects/probe-ws-117 + joe-terminal + tsx cache, all
inside sbx-tmp-117; nothing outside. Run-1: 14/15 (T5 expectation
wrong — see T5 note); run-2 after ONE disclosed expectation fix:
15/15 PASS, failed=0. Probe:
tmp/team-consultation/muse-117-dispatch-probe.ts; receipts:
muse-117-dispatch-probe.stdout.log/.stderr.log (same dir; run-2
receipts; UTF-16 via PS redirect like 110-116 — parse with
ReadAllText; TSX_EXIT=0 is the primary verdict, 15/15
regex-confirmed from the JSON block).

## Result: 15/15 PASS, EXIT 0, failed=0 (run-2; run-1 14/15 disclosed)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111/112/
  113/114/115/116 control reproduced). PASS.
- PY0-python-empty: execute_python {} -> ok=false,
  error='No Python code provided.' (HANDLER guard :58-64; no spawn,
  no tmp write; handler reached via default medium allowance — both
  targets match NO classifyToolRisk special branch, ToolService.ts
  :142-203, so medium -> default allowance). PASS.
- PY1-python-missing-binary: {code:'print("hello-117")'} -> ok=false,
  error='spawn python3 ENOENT', tmp_before=0 tmp_after=0 new=[]
  (handler wrote joe_python_<Date.now()>.py to os.tmpdir() then
  ExecutionGateway.execute('python3', ...) (:66-75); `python3` is
  absent on this Windows box — verified via Get-Command pre-run,
  only C:\Python314\python.exe exists — so the engine reports
  ENOENT and the handler returns ok=false (:93-96). Tmp file
  deleted on the failure path: zero new residue). PASS.
- T0-terminal-list-empty: {action:'list'} -> ok=true, terminals=[]
  (fresh hermetic process; HANDLER list :152-155; kernel
  listTerminals('') :176-180). PASS.
- T1-terminal-unknown-action: {action:'frobnicate-117'} -> ok=false,
  error='Unknown action' (HANDLER fallthrough :157; actions ARE
  validated). PASS.
- T2-terminal-write-no-command: {action:'write'} -> ok=false,
  error='command input required' (HANDLER guard :135; no kernel
  call). PASS.
- T3-terminal-read-missing: {action:'read'} -> ok=false,
  error='Terminal not found' (no id/session -> 'default'; kernel
  readHistory throws on missing id, terminal-kernel.ts:167-170).
  PASS.
- T4-bash-alias-live: executeTool('bash', {action:'list'}) -> ok=true,
  terminals=[] (`bash` unregistered with no hardcoded branch, so
  TOOL_ALIASES :245 bash->terminal_manager applies live at :691-698;
  4th live alias chain after shell 110, fetch_url 113, grep_search
  115). PASS.
- T5-run-command-shadow: executeTool('run_command', {action:'list'})
  -> ok=false, error='approval_required' (hardcoded :429 rewrote to
  shell_execute FIRST; the table entry :244 run_command->
  terminal_manager is dead because the table only applies `if
  (!tDef)` (:691) and shell_execute IS registered. Empty-command
  shell_execute classifies HIGH (:168 fallthrough), so the approval
  gate fires BEFORE the handler's own missing-command guard
  (:1511). RUN-1 CORRECTION, disclosed: run-1 expected the handler
  guard text; the live path proved gate-before-handler on empty
  input. Either verdict proves the shadow winner — terminal_manager
  would have answered ok=true for {action:'list'}. Nothing was
  executed). PASS (run-2).
- T6-terminal-create: {action:'create', id:'probe-117'} -> ok=true,
  id='probe-117' (requestedId path, no sessionId; real PTY spawn;
  kernel.session.created logged; fallback=undefined). PASS.
- T7-terminal-read-created: read probe-117 -> ok=true,
  history_type=string history_len=0 (live read-back). PASS.
- T8-terminal-kill: kill probe-117 -> ok=true (kernel killTerminal
  removes + kills :144-162; 'Session exit detected' logged). PASS.
- T9-terminal-read-after-kill: read probe-117 -> ok=false,
  error='Terminal not found' (kill verified; session gone). PASS.
- Teardown note: run-1 printed a node-pty conpty_console_list_agent
  'AttachConsole failed' stack AFTER the complete JSON verdict
  (sandbox PTY teardown artifact; all 15 verdicts already recorded).
  Run-2 teardown was clean. No orphaned session: T8+T9 + kernel
  exit log prove the PTY died in-probe.

## OBS-117-1 (execute_python: hardcoded `python3` dead on stock Windows)
PY1 proves at LIVE dispatch level that the tool shells a literal
`python3` argv (PythonExecutionTool.ts:72) with no resolution fallback:
on a Windows box carrying only `python`, every real invocation fails
`spawn python3 ENOENT`. The planner advertises this tool for math/data
work ('precision is critical'), so on this platform the capability is
registered-but-unusable — a portability gap, not a dispatch gap.
Secondary: the handler stages code in os.tmpdir() outside workspace
containment (predictable joe_python_<Date.now()>.py name); cleanup on
both paths is now PROVEN (zero residue), so the residual is a
placement note, not a leak. Smallest fix direction (NOT implemented —
audit-first, coordinated ownership): resolve python3->python fallback
or a configured interpreter path; keep staging dir env-overridable.
Proposed repair-backlog item (P1, high-value unreachable capability
on the dev platform). No unilateral tool edit.

## OBS-117-2 (run_command: DIVERGENT shadow + gate-before-handler pin)
T5 proves at LIVE dispatch level that TOOL_ALIASES :244
(run_command->terminal_manager) is dead: the hardcoded :429 branch
(run_command->shell_execute) wins because it runs first and the table
only applies `if (!tDef)`. This EXTENDS OBS-115-2 (4 shadowed names)
with a worse variant — the two layers DISAGREE on the destination,
so a reader of the table predicts terminal_manager while dispatch
delivers shell_execute. T5 additionally pins gate-before-handler on
EMPTY input: the HIGH-risk approval gate fires before the handler's
own 'needs a command' guard, extending the OBS-112-2 order pin to the
degenerate-input case. Smallest fix direction (NOT implemented —
audit-first): single source of truth — either move run_command (and
its :429 siblings command_execute/exec/terminal) into TOOL_ALIASES
with shell_execute as the declared target, or delete the dead table
entry; both layers must agree. Proposed backlog item (P2, contract
ambiguity). No unilateral ToolService edit.

## OBS-117-3 (terminal_manager: full lifecycle proven via dispatch)
T0/T6/T7/T8/T9 prove the complete PTY lifecycle — list, create (real
spawn), read-back, kill, read-after-kill — through the REAL
executeTool path with zero friction (default medium allowance, no
approval, no sessionId). Positive wiring evidence: this family is
FULLY_WIRED at Level 3. Open edge (not probed): session-scoped id
derivation (`terminal:<sid>` when sessionId present, :73-77) and
owner isolation across sessions — no sessionId was sent by design.
Next depth step if owned: session-scoped create/list + cross-session
read attempt (expect isolation per listTerminals filter :176-180).

## Verdict
- No new SIGNIFICANT defects in the dispatch path itself; TWO
  backlog-grade OBS (117-1 execute_python Windows-dead binary;
  117-2 run_command divergent shadow) proposed for the repair backlog
  at team ownership decision, alongside standing OBS-114-1 (browser
  gate regex split), OBS-115-1 (monitoring action-blind medium),
  OBS-115-2 (alias shadow layers), OBS-116-1 (cache action-blind
  medium + cross-workspace), OBS-116-2 (monitoring event silent-
  accept). Level-3 dispatch PROVEN for 21 families (117 adds
  execute_python + terminal_manager incl. full PTY lifecycle) with
  the gate-vs-handler split on EIGHT gate tools (shell_execute
  re-exercised with an empty-input order pin) and all four risk
  levels live-pinned. No repairs (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-117 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-116 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116; this
  checkpoint adds the 15-case dispatch battery + OBS-117-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 117 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=21 families (110-116 nineteen + 117:
  execute_python + terminal_manager incl. full PTY lifecycle — live
  executeTool; plus run_command divergent-shadow winner pin)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; shell_execute
  re-exercised with empty-input gate-before-handler order pin T5)
RISK_LEVELS_LIVE=4/4 (low/medium/high/critical pinned in 114;
  117 re-exercises low D1 + medium PY/T through default allowance
  + high via the run_command->shell_execute gate verdict T5)
RISK_SPLIT=tool-x-input (unchanged; 117 re-confirms: risk follows
  the resolved tool — terminal_manager/bash medium, shell_execute
  empty-cmd high — with zero dispatch-layer special case for
  execute_python/terminal_manager)
GATE_REGEX_ASYMMETRY=1 (:137 vs :179 login/submit/sign-in split,
  live-proven B2-vs-B3 114; OBS-114-1, proposed backlog, unowned)
ALIAS_SHADOW_LAYERS=1 (+1 divergent instance: run_command table
  vs hardcoded disagree on destination, hardcoded wins live T5;
  OBS-115-2 class extended by OBS-117-2, proposed backlog, unowned)
DIVERGENT_SHADOW=1 (run_command: table terminal_manager vs live
  shell_execute; OBS-117-2, proposed backlog, unowned)
MONITORING_ACTION_BLIND_MEDIUM=1 (OBS-115-1, proposed backlog,
  unowned; MONITORING-010-NVIDIA review pending)
CACHE_ACTION_BLIND_MEDIUM=1 (OBS-116-1, proposed backlog, unowned)
MONITORING_EVENT_SILENT_ACCEPT=1 (OBS-116-2, proposed backlog,
  unowned)
PYTHON_WINDOWS_DEAD_BINARY=1 (hardcoded `python3` argv -> ENOENT on
  stock Windows; os.tmpdir staging proven transient-only;
  OBS-117-1, proposed backlog, unowned)
GATE_BEFORE_HANDLER_EMPTY_INPUT=1 (HIGH gate fires before handler
  missing-input guard; T5 extends OBS-112-2 order pin)
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
  guard on high-risk empty input)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15 (110+111+112+113+114+115+116+117 probes, 117 run-2 receipts committed, run-1 disclosed 14/15)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(session-scoped terminal isolation depth; in-memory-state family
grouped repair proposal; execute_python interpreter-resolution
proposal) or the next Codex-requested bounded scope, or OBS-114-1 /
OBS-115-1 / OBS-116-1 / OBS-117-1 / OBS-117-2 ownership/repair
proposals at a coordinated checkpoint. No registry/ToolService/tool
edits without ownership.
