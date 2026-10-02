# WIRING CHECKPOINT 125 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=930b8de5 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — search_api pre-network guard
## (PLAN side of the B4-124 web_search divergence) + codebase_navigator
## ORPHAN #5 live discovery + task/interaction family FIRST live proofs
## (todo_write/alert_manager/ask_user/notify_user) (Level 4)
Follow-up to 124 (next step named remaining unprobed families outside
NVIDIA ACTIVE scope). Every case stays on a SAFE surface: guard
refusals, registry-miss refusals, process-local state (alerts
Map/history), or WS broadcasts with no server (safe no-op per
ws.ts:593-596). NO network is touched, NO model is called, NO browser
is launched, NO vector store is opened, NO spend. Same isolated tsx
method as 110-124: canonical test env (setup.ts: JSON persistence,
mock DB, network fetch guard), bypass OFF (hermetic), full
attribution, zero network, CWD = the sandbox dir itself (tsx by
absolute path, all imports absolute), FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-125
(two runs; tree preserved). NO AUTO_APPROVE_* set at any point. No
source edited; probe runs left ZERO tracked modifications (tracked
tree fully clean after both runs; only pre-existing untracked
caches). Containment verified: fixtures + stores + logs + tsx cache
all inside sbx-tmp-125; read-only absence checks prove nothing landed
at the worktree root or in the live api/data store. Probe:
tmp/team-consultation/muse-125-dispatch-probe.ts; receipts:
muse-125-dispatch-probe.stdout.log/.stderr.log (run-2, UTF-16 via PS
redirect like 110-124 — parse with ReadAllText; TSX_EXIT=0 is the
primary verdict, 26/26 regex-confirmed from the JSON block) plus
muse-125-dispatch-probe.run1.stdout.log/.run1.stderr.log (run-1
16/26 preserved).

## Run-1 result: 16/26 PASS, EXIT 1 (THREE disclosed findings)
- S1-search-api-no-query: handler refused correctly ('query is
  required') but MY logs=[] assertion ignored the dispatch start line
  (:623) — the same envelope lesson as 113-H1 run-1. Code right,
  expectation wrong.
- N1-N7 codebase_navigator: ALL SEVEN returned 'unknown_tool:
  "codebase_navigator" — did you mean: ...'. The tool is implemented
  (CodebaseNavigatorTool.ts) and imported (registry.ts:16) but NEVER
  REGISTERED — ORPHAN #5, same imported-never-registered class as
  visual_qa (registry.ts:14). The run-1 throw-guard/positive expects
  assumed a registered handler; they are WITHDRAWN, not fixed.
- T1-todo-write-positive: ok=true but the data payload was null —
  todo_write returns {ok:true, DATA:{acknowledged,count}} while
  dispatch picks only res.output (:879) and returns
  {ok,output,logs,artifacts,error} (:963): the data key is DROPPED
  (output=null, only the prose log survives). OBS-125-1.
- Z0-lance-presence: cascade of the orphan discovery (no handler ran,
  so no LanceDB dir exists) — re-derived as a no-effect pin.
- The other 16 cases (P0/D0/D1/H4/T2/A1-A8/U1-U3) passed on run-1
  untouched and are NOT re-derived, only re-executed.

## Run-2 result: 26/26 PASS, EXIT 0, failed=0 (after disclosed re-derivation)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- S1-search-api-no-query: {} -> ok=false, EXACT 'query is required'
  + envelope carries EXACTLY the start line 'start search_api
  (orig=search_api)' (handler added zero lines — its own return is
  logs:[]). PASS. (GUARD pin SearchApiTool.ts:34: the PLAN side of
  the B4-124 web_search divergence refuses BEFORE duck-duck-scrape
  search(); a live query is intentionally never sent — zero network.
  The dispatch side still resolves web_search->browser_run while the
  plan side resolves web_search->search_api; both halves are now
  live-pinned, the divergence stands as info-level.)
- N1-navigator-orphan: {} -> ok=false, error starts
  'unknown_tool: "codebase_navigator"' (ORPHAN #5 pin). PASS.
- N2-navigator-suggestions: the same error suggests memorize_codebase
  + analyze_codebase (MAP pin :714-717 did-you-mean: registered
  replacements exist — the orphan is a dead registration, not a
  missing-capability gap). PASS.
- N3-navigator-action-invariant: {action:'index', targetDir:<sbx>}
  -> same unknown_tool (UNREACHABLE pin: :62-115 index path never
  executes at dispatch). PASS.
- N4-navigator-context-invariant: {} WITH context sessionId ->
  same unknown_tool (DEAD-BRANCH pin :562-568 vs :714-717: the
  injection clause writes effectiveInput.sessionId for a name that
  then misses the registry — no observable dispatch effect; only
  browser_run of the three injected names is live). PASS.
- N5-navigator-search-invariant: {action:'search', query} -> same
  unknown_tool (UNREACHABLE pin: VectorMemory init/search never runs
  at dispatch for this name). PASS.
- N6-navigator-registry-scan: read-only registry array scan —
  lacks codebase_navigator AND visual_qa; HAS memorize_codebase AND
  analyze_codebase (REGISTRY pin: the dispatch miss is a genuine
  non-registration, not a shadow/alias artifact). PASS.
- N7-navigator-seed-untouched: nav-125 holds exactly the 1 seed file
  (NO-EFFECT pin: the N3 index call never globbed the dir — the
  registry miss precedes all handler work). PASS.
- T1-todo-write-payload-loss: {merge:false, todos:[1]} -> ok=true,
  output=NULL, NO data key in the dispatch result, broadcast log
  survives (CONTRACT-LOSS pin TodoWriteTool.ts:63-67 vs
  ToolService.ts:879/:963 — acknowledged/count dropped at dispatch;
  downstream output readers see null). PASS. (OBS-125-1, P2
  proposed: output-contract mismatch causing evidence loss. Source
  survey this cycle: TodoWriteTool.ts:65 is the ONLY handler
  top-level return using data: instead of output: — all other
  'data: {' hits in definitions/ are broadcast payloads or schemas.
  Single-tool scope, not a class.)
- T2-todo-write-missing: {} -> ok=false, error includes 'Failed to
  update todos:' (FAILURE pin :69-75; only the handler prefix gated
  — the TypeError wording is engine-specific). PASS.
- A1-alert-unknown-action: {} -> ok=false, EXACT 'Unknown action:
  undefined' (CONTRAST pin :114-125 vs the 124 smart-family throw
  class: caught in-handler -> exact message, vs uncaught handler
  throws -> internal_exception stack envelope — error-shape
  asymmetry class). PASS.
- A2-alert-list-empty: {action:'list'} -> ok=true, summary.total=0
  (fresh-process positive; order-gated before any create — static
  Map). PASS.
- A3-alert-create: {action:'create', name, severity} -> ok=true,
  alertId starts 'alert_' (captured for A5-A7). PASS.
- A4-alert-trigger-missing: {action:'trigger',
  alertId:'probe-125-no-such'} -> ok=false, EXACT 'Alert
  probe-125-no-such not found' (GUARD pin :169-171, in-handler
  catch). PASS.
- A5-alert-trigger: captured id -> ok=true, status=triggered. PASS.
- A6-alert-resolve: captured id -> ok=true, status=resolved. PASS.
- A7-alert-history: captured id -> ok=true, count=3
  (created+triggered+resolved). PASS.
- A8-alert-list-summary: -> ok=true, total=1, resolved=1 (full
  lifecycle visible in one summary). PASS.
- U1-ask-user-no-block: {question} -> ok=true,
  output.status='waiting_for_user_input' IMMEDIATELY (BEHAVIOR pin
  TaskInteractionTools.ts:255-270: broadcasts + returns at once —
  the 'Blocking' doc comment describes intent, not behavior; the
  agent loop must implement the pause itself). PASS.
- U2-notify-positive: {message} -> ok=true, acknowledged. PASS.
- U3-notify-no-message: {} -> ok=true, acknowledged (VALIDATION pin
  NotifyUserTool.ts:53-54: message defaults to '' despite
  required:['message'] — another OBS-111-2 no-dispatch-validation
  instance; same known class, no new OBS). PASS.
- Z0-no-handler-side-effects: lance_memory absent in sbx AND at
  root + seed dir intact (NO-EFFECT pin: unknown_tool
  short-circuits before VectorMemory init — the 5 orphan calls left
  zero vector-store trace). PASS.

## Behavior pins carried (two new OBS, both proposed backlog)
- OBS-125-1 (P2 proposed): todo_write output-contract mismatch.
  Handler returns data:{acknowledged,count}; dispatch drops every
  key except ok/output/logs/artifacts/error. Any planner, repair,
  or verification consumer reading output gets null. Repair
  direction (ownership-gated): return output:{acknowledged,count}
  from the handler (one-key fix) OR pick res.data at :879 (riskier
  — changes the dispatch contract for all tools). No edit without
  ownership.
- OBS-125-2 (P3 proposed): codebase_navigator orphan + dead
  injection branch. Implementation exists (136-line tool +
  VectorMemory/LanceDB dependency); registry imports but never
  registers it; dispatch misses; :562 injection clause for it (and
  visual_qa) never has an observable effect. Repair direction
  (ownership-gated): register it, remove the import + injection
  clause, or document intentional-internal. The did-you-mean
  replacements (memorize_codebase/analyze_codebase) need a
  capability-overlap check first — do NOT blindly register a
  duplicate.
- ORPHANED 4 -> 5 (tool-level lock broken by a live discovery, as
  designed: the lock counts, it does not freeze discovery).
- The :562 injection list is now 1-live/2-dead (browser_run live;
  visual_qa + codebase_navigator dead). Any future reader must not
  cite the injection list as proof that three tools receive
  sessions.
- Error-shape asymmetry class EXTENDED (A1): caught-in-handler
  unknown-action -> exact message; uncaught handler throw ->
  internal_exception stack envelope (124 smart family). Same KIND,
  different SHAPES — verifiers must match both.
- Output-key discipline: todo_write is the SOLE data:-at-return
  handler (surveyed all 21 'data: {' hits — rest are broadcasts or
  schemas). The :879/:963 pick is otherwise total.
- ask_user is fire-and-forget: any orchestration relying on it to
  BLOCK will overrun. The pause must live in the agent loop, and
  the 'Blocking' doc comment is misleading (doc fix unowned).
- search_api completes the B4-124 divergence map: plan->search_api
  (guard live) vs dispatch web_search->browser_run (124 live). Both
  halves pinned; divergence remains info-level (planner-path
  behavior unaffected; direct-callers only).
- alert_manager full lifecycle is process-local (static Map +
  history array): works hermetically, but will NOT survive restart
  and is NOT user-isolated (multi-user/portability map note for the
  repair backlog; no new OBS — process-local state is the known
  pre-existing pattern, e.g. terminal sessions).
- ai_write positive path REMAINS unproven (by design, zero spend).
  delete_file handler REMAINS unproven behind the high gate. Valid
  browser navigations/actions INTENTIONALLY unproven. VectorMemory
  local index/search semantics INTENTIONALLY unproven at dispatch
  (the only in-registry callers are recall_memory/memorize_codebase
  deep handlers at :571-606 — a future battery may take those).

## Verdict
- TWO new OBS filed to the proposed backlog (125-1 P2, 125-2 P3);
  no other new OBS (U3 joins the known OBS-111-2 class).
- ONE orphan promoted to dispatch-unreachable LIVE (codebase_
  navigator — a NEW discovery, not a re-pin: run-1 found it).
- Level-4 dispatch PROVEN for 73 tool-level families (68 prior + 5
  new: search_api guard + todo_write + alert_manager + ask_user +
  notify_user first live proofs via executeTool; navigator is
  orphaned so NOT handler-proven) with the gate-vs-handler split on
  EIGHT gate tools + the remote branch, and all four risk levels
  live-pinned. No repairs (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-125 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-124 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120/121/122/123/124; this checkpoint adds the 26-case
  run-2 dispatch battery + two OBS + orphan #5; run-1 16/26
  receipts preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 125 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=73 tool-level (68 prior + 5 new in 125:
  search_api pre-network guard + todo_write (payload-loss) +
  alert_manager full lifecycle + ask_user fire-and-forget +
  notify_user positive+no-validation first live proofs via
  executeTool; ai_write positive still unproven — needs a model
  call; delete_file handler still unproven behind the high gate;
  valid browser navigations/actions intentionally unproven;
  codebase_navigator VectorMemory path unreachable at dispatch)
SEARCH_API_GUARD_LIVE=1 (S1 exact query-required + envelope-only
  start line; B4-124 divergence plan half now live-pinned)
NAVIGATOR_ORPHAN_LIVE=1 (N1 unknown_tool; ORPHAN #5, run-1
  discovery; imported-never-registered class with visual_qa)
NAVIGATOR_UNREACHABLE_PINS=3 (N3/N4/N5 action+context+search
  invariants; handler guards/init/glob/LanceDB never run)
DEAD_INJECTION_BRANCHES=2 of 3 (N4 navigator half live; visual_qa
  half source-traced via 124-O1; only browser_run live)
REGISTRY_SCAN_PIN=1 (N6: navigator+visual_qa absent,
  memorize+analyze present — miss corroborated, not shadowed)
TODO_PAYLOAD_LOSS_LIVE=1 (T1 output=null, data key absent, prose
  log survives; OBS-125-1 P2 proposed)
TODO_MISSING_INPUT_LIVE=1 (T2 Failed-to-update-todos prefix)
ALERT_LIFECYCLE_LIVE=5 (A2/A3/A5/A6/A7/A8 chain: empty->create->
  trigger->resolve->history=3->summary; A4 missing-id guard exact)
ALERT_ERROR_SHAPE_LIVE=1 (A1 exact in-handler message; error-shape
  asymmetry class extended)
ASK_USER_NO_BLOCK_LIVE=1 (U1 immediate waiting_for_user_input;
  'Blocking' doc misleading — doc fix unowned)
NOTIFY_POSITIVE_LIVE=1 (U2 acknowledged)
NOTIFY_NO_VALIDATION_LIVE=1 (U3 required-message unenforced;
  OBS-111-2 class instance, no new OBS)
OUTPUT_KEY_SURVEY=1 (todo_write sole data:-at-return handler of
  21 surveyed hits; rest broadcasts/schemas)
BROWSER_SMART_SESSION_GUARD_LIVE=25/25 (124 stands)
ORPHAN_REPIN=3 (image_generate->generate_image->unknown_tool, 110;
  visual_qa->unknown_tool with did-you-mean, 124;
  codebase_navigator->unknown_tool with did-you-mean, 125 NEW)
ORPHANED=5 (tool-level lock UPDATED by live discovery; helper-level
  dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (120 OBS-120-1 stands)
DUPLICATE=2 relationships (unchanged; navigator-vs-memorize/
  analyze overlap check owed before any registration — part of
  OBS-125-2)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; 125 adds ONE more instance:
  U3 notify required-message)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin + 123 third pin) + ingress-enforcement
  asymmetry class (118) + verdict-effect asymmetry class (119) +
  pre-gate-shadow class (120) + fallback-scope class (121) +
  envelope-fidelity class (122 + 125 S1 second pin) + splitter-
  mutation class (123) + session-guard-uniformity class (124) +
  registry-miss-short-circuit class (125: unknown_tool precedes all
  handler work; injection branches can be dead) + output-key-loss
  class (125: non-output keys dropped at :879/:963)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pinned)
DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21+25+46+26
  (110+111+112+113+114+115+116+117+118+119+120+121+122+123+124+125
  run-2 probes; 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1
  18/21 + 123 run-1 19/23 + 125 run-1 16/26 receipts preserved;
  124 first-run green, no run-2)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: recall_memory/memorize_codebase deep handlers :571-606 —
the OTHER VectorMemory callers, still registered; ai_write_file
POSITIVE path when a provider is available; ProjectRun handler depth
— NOTE NVIDIA ACTIVE claim on pipeline/memory/planner areas,
coordinate before probing there) or the next Codex-requested bounded
scope, or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 / OBS-117-2 /
OBS-118-1 / OBS-119-2 / OBS-120-1 / OBS-120-2 / OBS-121-1 / OBS-121-2 /
OBS-122-1 / OBS-123-1 / OBS-125-1 / OBS-125-2 ownership/repair
proposals at a coordinated checkpoint. No registry/ToolService/tool
edits without ownership.
