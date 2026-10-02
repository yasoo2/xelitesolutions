# WIRING CHECKPOINT 122 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=5320bf27 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — ai_write_file guard-depth
## FIRST live proof + scaffold_project FIRST live proof + first live
## rate-limiter pin + dispatch-envelope map (Level 4)
ai_write_file is in the self-fix repair allowlist and is the planner's
preferred authoring tool, yet no live dispatch proof existed for it.
Its handler calls a real LLM past the guard, so every ai_write case
stays on the PRE-LLM surface: missing/blank fields return the exact
guard message with zero model calls, zero network, zero spend. No
valid path+description pair was ever sent; the positive path REMAINS
unproven by design (it needs a model call, and the zero-spend rule
holds while the provider is gated). scaffold_project is the planner's
greenfield foundation tool (local-only, no LLM) and had no live proof
at all. For each target the probe executes the REAL executeTool path.
Same isolated tsx method as 110-121: canonical test env (setup.ts:
JSON persistence, mock DB, network fetch guard), bypass OFF
(hermetic), full attribution, zero network, CWD = the sandbox dir
itself (tsx by absolute path, all imports absolute), FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-122
(run-1) and tmp/sbx-tmp-122b (run-2 FRESH dir; run-1 tree preserved
untouched). NO AUTO_APPROVE_* set at any point. No source edited;
probe runs left ZERO tracked modifications (tracked tree fully clean
after run-2; only pre-existing untracked caches). Containment
verified: fixtures + setup stores + logs + tsx cache all inside the
two sbx dirs; read-only absence checks prove nothing landed at
D:/Joe/deep122.txt, D:/Joe/sc122-refused, tmp/deep122.txt or the
worktree root. S9's joeProjects persist never flushed (debounced
timer still queued at process exit) — nothing written anywhere for
it; memory + log pins asserted on the live return. Probe:
tmp/team-consultation/muse-122-dispatch-probe.ts; receipts:
muse-122-dispatch-probe.stdout.log/.stderr.log = RUN-2 (UTF-16
via PS redirect like 110-121 — parse with ReadAllText; TSX_EXIT=0
is the primary verdict, 21/21 regex-confirmed from the JSON block),
plus .run1.stdout.log/.run1.stderr.log preserved before the rerun.

## Run-1: 18/21 (TSX_EXIT=1) — disclosed, receipts preserved
Three misses, ALL probe-expectation bugs about the ToolService
envelope, not product defects. Source re-read AFTER run-1
(ToolService.ts:878-881 + :929 + :963): the dispatch return keeps
ONLY {ok, output, logs, artifacts, error}; output defaults to null
when the handler returns none; ToolService's own start line always
precedes handler logs. A1/S4 now pin output===null + the start
line; S6 now pins the envelope strip itself as OBS-122-1. No source
touched between runs; only probe expectations + fresh sandbox.

## Run-2 result: 21/21 PASS, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- A1-ai-guard-empty: {} -> ok=false, EXACT guard message,
  logs==[1 start line 'start ai_write_file (orig=ai_write_file)'],
  output===null (ENVELOPE + GUARD + MEDIUM-REACHABILITY +
  SELF-VALIDATION pins: handler ran, required-schema enforced by
  handler not dispatch — OBS-111-2 third pin). PASS.
- A2-ai-guard-path-only: path only -> exact guard. PASS.
- A3-ai-guard-description-only: description only -> exact guard
  (normalizeRuntimeArtifactPath('') pure, no throw). PASS.
- A4-ai-guard-whitespace: blank pair -> exact guard (TRIM pin).
  PASS.
- A5-ai-guard-mixed: valid path + empty description -> exact
  guard (BOTH-fields pin: :696 ||). PASS.
- A6-ai-guard-wrote-nothing: wsA listing has no a122* entries
  after A1-A5 (NO-WRITE pin: guard precedes pack/model/write).
  PASS.
- A6b-ai-guard-null-input: null input -> exact guard (NULL pin:
  :257 {...null}=={}; handler input?.path holds). PASS.
- S1-scaffold-happy: package.json + src/index.js + null dir ->
  ok=true, created exactly [package.json, src/index.js,
  'emptydir/'], disk-exact, emptydir a real dir (plain manifest
  leaves normalizeReact unchanged). PASS.
- S2-scaffold-prefix-strip: baseDir rp122 + rp122/-prefixed keys
  -> ok=true, created [a.txt, b.txt], lands in rp122/, no
  rp122/rp122 nesting (STRIP pin :1381-1393, silent). PASS.
- S3-scaffold-partial-escape: ok122.txt + 5-level escape key ->
  ok=false, created==[ok122.txt] WITH the sibling on disk,
  errors==[1 path_outside_workspace entry], outside path absent
  (PARTIAL-WRITE pin: invalid_path non-fatal at precheck :1414,
  loop collects refusals and still writes siblings). PASS.
- S4-scaffold-base-refused: escaping baseDir -> ok=false
  path_outside_workspace, output===null (second null-output
  pin), outside absent, nothing created (BASE-REFUSAL pin
  :1398-1399, pre-validation). PASS.
- S5-scaffold-empty: {} -> ok=true, created==[] errors==[],
  base dir NOT created on disk (VACUOUS pin: base exists only
  as a parent of entries). PASS.
- S6-scaffold-fatal-precheck: {'package.json': null} -> ok=false
  exact 'authored_path_structure_conflict:target_is_directory:
  package.json', reason/repairHint ABSENT top-level
  (ENVELOPE-STRIP pin :963 -> OBS-122-1), output.errors[0]==
  error, created==[], fat122 absent (FATAL pin :1414-1427,
  aborts before mkdir — contrast S3 non-fatal). PASS.
- S7-scaffold-value-coercion: object value -> ok=true, disk
  exactly '[object Object]' (COERCION pin: non-string is
  non-fatal invalid_path, then String(content) :1448 — a model
  type-slip becomes literal file content). PASS.
- S8-scaffold-cross-workspace: ctxB scaffold -> ok=true, lands
  in wsB, absent from wsA (SCOPING pin via runWithWorkspace
  async ctx — OBS-121-2 benign path, third live pin). PASS.
- S9-scaffold-session-register: sessionId attr -> ok=true,
  output.projectDir==wsA/sess122 abs, logs carry 'registered
  active project probe-sess-122' (SESSION pin :1460-1477;
  effectiveContext spread :285 carries sessionId; persist
  queued past process exit, contained). PASS.
- A7-ai-rate-limit-live: hammer ai_write_file {} -> FIRST
  rate_limited at loop index 54 = overall call 61 (6 prior +
  54 + 1), retryAfterMs=42543 numeric >0, all 54 pre-trip
  calls the identical guard, same calendar minute (LIMITER
  pin :787-793: bucket=name, limit 60; guard-failures consume
  quota because the check precedes execute). PASS.

## OBS-122-1 (dispatch envelope strips handler-authored
## diagnostics — scaffold's repairHint never reaches the
## planner; P3 guidance loss)
S6 proves at LIVE dispatch level that ToolService.ts:963
returns ONLY {ok, output, logs, artifacts, error} (:878-881):
the scaffold fatal precheck carefully authors reason,
repairHint, path, projectRoot and conflictPath (:1414-1427),
but NONE of them survive the boundary — verified absent
top-level in the live return. What the planner/model DOES get:
the composed error code string (which embeds reason+path)
duplicated in output.errors. What is LOST: the actionable
repairHint ('Emit each destination as one file path; do not
use a file path as a directory or as a parent of another
file') plus the structured fields a repair loop could branch
on. This is a general envelope property, not a scaffold bug:
ANY handler returning diagnostic top-level keys loses them.
Blast radius is bounded (the error string is descriptive; no
silent success), but the planner's foundation tool cannot
self-correct from guidance the codebase already wrote.
Smallest fix direction (NOT implemented — audit-first,
coordinated ownership): forward a bounded `diagnostics`
object through the envelope, or adopt the convention that
handlers put machine-actionable guidance inside `output`
(scaffold already duplicates the error there; repairHint
could ride output too). Needs owner decision — verify how
many handlers rely on extra top-level keys before changing
the contract. Proposed repair-backlog item (P3 planner
guidance; cf. OBS-111-2 validation-depth class). No
unilateral edit.

## Behavior pins carried (no new OBS)
- Rate limiter FIRST live proof (A7): trips exactly at the
  61st call; calendar-minute bucket; numeric retryAfterMs;
  guard-failures consume quota — surfaced as behavior, now a
  reusable harness fact for future batteries (buckets are
  per-process; fresh process = fresh quota).
- Partial-write semantics (S3): scaffold is NOT atomic —
  ok=false can still carry created files. Callers must read
  output.created/errors, not just ok.
- Value coercion (S7): object values become '[object Object]'
  file content — a model type-slip class worth a planner-side
  note, not a product defect per se.
- Vacuous scaffold (S5): {} is success with no side effects —
  a planner no-op that reports ok:true.
- ai_write positive path REMAINS unproven (by design, zero
  spend): guard-depth only. A positive proof needs a model
  call and belongs to a provider-available cycle.
- Session persist deferred (S9): debounced write queued past
  process exit — in short-lived harnesses the registration
  is memory-only. Production long-lived processes flush
  normally; noted, not a defect.

## Verdict
- ONE backlog-grade finding (OBS-122-1: envelope strips
  handler diagnostics incl. scaffold repairHint, P3),
  proposed for the repair backlog at team ownership decision,
  alongside standing OBS-114-1, OBS-115-1/115-2, OBS-116-1/116-2,
  OBS-117-1/117-2, OBS-118-1/118-2, OBS-119-1/119-2, OBS-120-1/120-2,
  OBS-121-1/121-2. Level-4 dispatch PROVEN for 26 families (122
  adds ai_write_file guard-depth + scaffold_project first live
  proof, the first live rate-limiter pin, and the dispatch-
  envelope map incl. null-output + start-line + strip pins)
  with the gate-vs-handler split on EIGHT gate tools and all
  four risk levels live-pinned. No repairs (audit-first;
  coordinated ownership).
- 084 P4 + all F/OBS items 086-122 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-121 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120/121; this checkpoint adds the 21-case run-2
  dispatch battery + OBS-122-1; run-1 18/21 receipts preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 122 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=26 families (110-121 twenty-four + 122:
  ai_write_file guard-depth + scaffold_project first live proof
  via executeTool; ai_write positive path still unproven — needs
  a model call; delete_file handler still unproven behind the
  high gate)
AI_WRITE_POSITIVE_PROVEN=NO (by design this cycle: zero spend;
  guard-depth only)
AI_WRITE_GUARD_PROVEN=YES (A1/A2/A3/A4/A5/A6b exact-message pins
  + A6 no-write pin; pre-LLM surface fully mapped)
RATE_LIMITER_LIVE=1 (A7: ai_write bucket trips exactly at 61st
  call, calendar-minute, numeric retryAfterMs; guard-failures
  consume quota — first live limiter proof)
ENVELOPE_STRIP_LIVE=1 (S6: reason/repairHint/path/projectRoot/
  conflictPath dropped at :963; OBS-122-1 P3, proposed backlog,
  unowned)
NULL_OUTPUT_PINS=2 (A1 ai_write guard + S4 scaffold refusal;
  output===null when the handler returns none, :879)
START_LINE_PINS=1 (A1: ToolService start line precedes handler
  logs, :623/:929)
SCAFFOLD_PARTIAL_WRITE=1 (S3: ok=false WITH created files;
  callers must read output.created/errors)
SCAFFOLD_VALUE_COERCION=1 (S7: object -> '[object Object]'
  literal content)
SCAFFOLD_VACUOUS_OK=1 (S5: {} -> ok=true, no side effects)
SCAFFOLD_PREFIX_STRIP=1 (S2 behavior pin, silent)
SCAFFOLD_SESSION_REGISTER=1 (S9: projectDir + log; persist
  queued past harness exit)
WRITE_FILE_POSITIVE_PROVEN=YES (W0/W1/W2/W7; 110 had negative depth only)
DELETE_HANDLER_PROVEN=NO (X1/X2/X3 gate verdicts only; needs an
  approved-approval harness)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pins the
  run_command->shell_execute verdict)
GATE_BEFORE_GUARD_PINS=2 (T5-117 run_command + X2-121 delete_file;
  order class)
RESOLVED_NAME_RISK_PINS=2 (G1-115 grep_search + X3-121 rm_file)
FALLBACK_ESCAPE_LIVE=1 (W7-121: ws-root escape lands in projectRoot;
  OBS-121-1, proposed backlog, unowned)
REFUSAL_PINS=5 (W8 + E7, 121; S3 per-entry + S4 base, 122;
  run-1 W7 shape retained as W8)
WS_FILE_SCOPING_LIVE=YES (E9 + L4, 121; S8 scaffold, 122;
  default anchor per-ws, fallback excepted per OBS-121-1)
STRING_AS_OPTIONS_CALLS=1 (SystemTools.safePath :608; benign on the
  canonical path via async ctx, OBS-121-2 P4, proposed backlog,
  unowned; S8 third live benign pin)
FIRST_OCCURRENCE_EDIT=1 (E1-121 behavior pin; no OBS)
RAW_ERRNO_SURFACES=2 (K2-119 readHistory + L3-121 ls; class note)
ABS_PATH_IN_EDIT_ERRORS=1 (E5/E8-121 observability note; minor)
GATE_BYPASS_LIVE=2 tools (recall_memory + memorize_codebase via
  the :571-608 early-return shim; OBS-120-1, proposed backlog,
  unowned)
SHIM_SHADOW_DUPLICATES=1 family (memory; OBS-120-1)
ENVELOPE_BYPASS_LIVE=1 (S3-120 differential)
STALE_JUSTIFYING_COMMENT=1 (MemoryTool.ts header; OBS-120-1)
MEMORY_REPLACE_NOT_MERGE=1 (OBS-120-2)
MEMORY_CROSS_WORKSPACE=1 (OBS-120-2)
RISK_LEVELS_LIVE=4/4 (114; 122 re-exercises low D1 + medium
  A/S through default allowance + high via H4 gate verdict)
RISK_SPLIT=tool-x-input (unchanged; ai_write_file + scaffold_project
  both dispatch medium live in 122)
SESSION_OVERRIDE_LIVE=YES (T1-119 stands)
SCOPED_ISOLATION_LIVE=YES (S3/S4-118; W2/R2-119; E9/L4-121 file
  layer + S8-122 scaffold layer, fallback excepted per OBS-121-1)
UNSCOPED_TERMINAL_ACTIONS_REACHABLE=5/6 (OBS-118-1 + OBS-119-1,
  proposed backlog, unowned)
SILENT_NOOP_VERDICTS=5 (119 + 120-shim; OBS-119-2 + OBS-120-1)
READ_MISSING_THROWS=1 (readHistory lone reporter; K2-119; L3 ls
  surfaces raw ENOENT instead — class contrast)
WS_TOOL_OWNERSHIP_ASYMMETRY=1 (OBS-118-1 + OBS-119-1)
SHADOW_QUARTET_PINNED=4/4 (H1-H4-118 stand; H4 re-pinned in 122)
DIVERGENT_SHADOW=2 (run_command; memory family pre-gate)
GATE_BEFORE_HANDLER_EMPTY_INPUT=1 (re-pinned H4-122)
GATE_REGEX_ASYMMETRY=1 (OBS-114-1)
ALIAS_SHADOW_LAYERS=1 (OBS-115-2 class; OBS-118-2 family-complete)
MONITORING_ACTION_BLIND_MEDIUM=1 (OBS-115-1; MONITORING-010-NVIDIA
  review pending)
CACHE_ACTION_BLIND_MEDIUM=1 (OBS-116-1)
MONITORING_EVENT_SILENT_ACCEPT=1 (OBS-116-2)
PYTHON_WINDOWS_DEAD_BINARY=1 (OBS-117-1)
CONTENTTOOLS_VALIDATION_MAP=COMPLETE (OBS-115-3)
ERROR_SUBSTITUTION_PINNED=1 (:946 generic message live via R1-114)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; A1-122 third pin:
  ai_write required-schema enforced by handler message)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin) + ingress-enforcement asymmetry
  class (118) + verdict-effect asymmetry class (119) + pre-gate-
  shadow class (120) + fallback-scope class (121) + envelope-
  fidelity class (122: null-output/start-line/strip — handler
  diagnostics do not all survive dispatch)
RESOLVER_PARITY_LIVE=YES (P4-112; G1-115; 121 re-proves both
  layers resolve the same per-ws root: containPath explicit id +
  safePath async ctx; S8-122 scaffold layer agrees)
DISPATCH_LOG_ENVELOPE=PARTIAL (:623 start line + :929 handler append;
  H1-113; G1-115; A1-122 pins start-line-only shape for guard
  failures; 120 shim exception stands)
DISPATCH_RETURN_KEYS=5 (ok/output/logs/artifacts/error only, :963;
  S6-122 live proof; extra handler keys dropped)
ALIAS_TABLE_PROVEN=5 chains (110/113/115/117 four + X3-121
  rm_file->delete_file gate hop)
ORPHAN_REPIN=1 (image_generate->generate_image->unknown_tool, 110)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
READ21_R1_CLOSED=21/21 (5 write in 080 + 16 read in 104/105)
FIREWALL_R2_CLOSED=YES (106: 6/6 probe PASS, EXIT 0)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (MemoryTools.execute bodies unreachable
  via executeTool; OBS-120-1)
DUPLICATE=2 relationships (unchanged)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21 (110+111+112+113+114+115+116+117+118+119+120+121+122 run-2 probes, 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1 18/21 receipts preserved)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: ai_write_file POSITIVE path when a provider is available,
git-helper/ssh-manager/npm-arg depth from 100-102, browser smart
families beyond browser_run, ProjectPipeline/ProjectRun handler
depth — NOTE NVIDIA ACTIVE claim on pipeline/memory/planner areas,
coordinate before probing there) or the next Codex-requested bounded
scope, or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 / OBS-117-2 /
OBS-118-1 / OBS-119-2 / OBS-120-1 / OBS-120-2 / OBS-121-1 / OBS-121-2 /
OBS-122-1 ownership/repair proposals at a coordinated checkpoint. No
registry/ToolService/tool edits without ownership.
