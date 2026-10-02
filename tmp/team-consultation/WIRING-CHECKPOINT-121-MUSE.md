# WIRING CHECKPOINT 121 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=9c593095 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — file_edit FIRST live proof +
## ls FIRST live proof + write_file positive depth + delete gate-verdict
## depth + containment-fallback map (Level 4)
file_edit is in the self-fix repair allowlist and is the core mutation
tool of autonomous engineering, yet no live dispatch proof existed for
it (110 covered read_file/write_file at negative depth only). ls had no
live proof at all; delete_file was gate-pinned only (113). For each
target the probe executes the REAL executeTool path. Same isolated tsx
method as 110-120: canonical test env (setup.ts: JSON persistence,
mock DB, network fetch guard), bypass OFF (hermetic), full
attribution, zero network, CWD = the sandbox dir itself (tsx by
absolute path, all imports absolute), FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-121
(run-1) and tmp/sbx-tmp-121b (run-2, FRESH dir because E1 consumes
its find text; run-1 tree preserved untouched). NO AUTO_APPROVE_* set
at any point. No source edited; probe runs left ZERO tracked
modifications (tracked api/src + web/src + api/package.json clean
after run-2; only pre-existing untracked api/src/.jest-cache +
api/src/.tmp). Containment verified: fixtures + W7 fallback file +
setup stores + logs + tsx cache all inside the two sbx dirs; read-only
absence checks prove nothing landed at tmp/w7-fallback-121.txt,
tmp/w8-refused-121.txt or D:/Joe/e7-refused-121.txt. Probe:
tmp/team-consultation/muse-121-dispatch-probe.ts; receipts:
muse-121-dispatch-probe.stdout.log/.stderr.log = RUN-2 (UTF-16
via PS redirect like 110-120 — parse with ReadAllText; TSX_EXIT=0
is the primary verdict, 25/25 regex-confirmed from the JSON block),
plus .run1.stdout.log/.run1.stderr.log preserved before the rerun.

## Run-1: 23/24 (TSX_EXIT=1) — disclosed, receipts preserved
Single failure W7: probe used a 3-level escape, which from
<sbx>/projects/probe-ws-121 lands in tmp/ (OUTSIDE projectRoot) and
is CORRECTLY refused. PROBE BUG (depth arithmetic), not a product
finding — the refusal itself behaved exactly per the multi-root rule.
Fixed to 2 levels (allowed, sbx-root landing); the 3-level shape kept
as new refusal pin W8. No source touched between runs; only probe
expectations + one added case (W8) + fresh sandbox.

## Run-2 result: 25/25 PASS, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- W0-seed-target: write_file fe121-target.txt (LF, repeated beta
  line) -> ok=true, on disk under projects/probe-ws-121, ABSENT
  from my-workspace (per-ws-root pin). PASS.
- W1-seed-crlf: write_file CRLF content -> ok=true, disk exactly
  'one121\r\ntwo121\r\nthree121' (trim keeps endings). PASS.
- W2-seed-hidden: write_file '.hidden121' -> ok=true, dotfile on
  disk. PASS.
- W7-fallback-lands-in-sbx-root: write_file
  '../../w7-fallback-121.txt' -> ok=true, lands in <sbx> ROOT,
  absent from wsA (FALLBACK pin: projectRoot=<sbx> when CWD=sbx
  allows the 2-level escape; contained but outside the ws root).
  PASS.
- W8-deep-escape-refused: write_file '../../../w8-refused-121.txt'
  -> ok=false 'path_outside_workspace: ...', tmp/ path absent
  (REFUSAL pin on the write path, pre-mkdir). PASS.
- E1-edit-happy-first-occurrence: file_edit find 'beta121 line
  two' (substring of lines 2 AND 3) -> ok=true,
  output.success=true; disk line 2 replaced, line 3 intact
  (FIRST-OCCURRENCE pin: String.replace :773). PASS.
- E2-edit-alias-fields: search/new_string -> ok=true, disk has
  ALIASED, lacks EDITED (gated on E1). PASS.
- E5-edit-text-not-found: unknown text -> ok=false 'Text to
  replace not found in <WSABS>. Looked for: zzz-no-such-text-121.
  The file has 3 lines and none of them opens with that text.'
  (HONEST-MISS pin; abs path re-pins the ToolService pre-rewrite;
  nothing written; gated on E1). PASS.
- E9-edit-cross-workspace-miss: ctxB edit of fe121-target.txt ->
  ok=false 'File not found' (SCOPING pin: ctxB resolves
  projects/probe-ws-121b). PASS.
- L1-ls-sorted-no-hidden: ls '.' -> ok=true, entries exactly
  [fe121-crlf.txt, fe121-target.txt] (sorted, dotfile excluded;
  gated on W2). PASS.
- X1-delete-gate-file-intact: delete_file {path target} ->
  approval_required, file still on disk (GATE-PRECEDES-HANDLER
  pin). PASS.
- X3-delete-alias-gate: rm_file {path target} ->
  approval_required, file still on disk (RESOLVED-NAME-RISK pin).
  PASS.
- E3-edit-missing-find: -> ok=false 'file_edit needs the text to
  find (`find`).' (GUARD pin :707; silent-prepend class closed).
  PASS.
- E4-edit-missing-filename: -> ok=false 'file_edit needs a
  filename to edit.' (GUARD pin :706; EISDIR-on-root class
  closed). PASS.
- E6-edit-crlf-keeps-endings: LF 2-line find vs CRLF file ->
  ok=true, disk exactly 'one121\r\nTWO121\r\nTHREE121'
  (NORMALIZATION pin :749; gated on W1). PASS.
- E7-edit-deep-escape-refused: '../../../../e7-refused-121.txt' ->
  ok=false 'path_outside_workspace: ...', D:/Joe/ path absent
  (REFUSAL pin on the edit path, ToolService pre-dispatch).
  PASS.
- E8-edit-directory-refused: filename '.' -> ok=false '<wsA-abs>
  is a folder, not a file.' (DIRECTORY pin :716-718; abs path
  re-pins the pre-rewrite). PASS.
- L2-ls-hidden-visible-on-request: includeHidden:true -> entries
  include '.hidden121' (gated on W2). PASS.
- L3-ls-missing-dir: 'no-such-dir-121' -> ok=false, error has
  ENOENT (raw-errno surfaces, :1016-1018). PASS.
- L4-ls-cross-workspace-empty: ctxB ls '.' -> ok=true, no fe121
  entries, wsB dir exists (READ-SCOPING pin). PASS.
- X2-delete-gate-before-guard: delete_file {} ->
  approval_required, NOT 'needs a path' (GATE-BEFORE-GUARD pin:
  :772 precedes :831; second pin of the T5-117 order class).
  PASS.

## OBS-121-1 (multi-root fallback undercuts per-workspace file
## isolation — ws roots advisory, not enforced; P2)
W7 proves at LIVE dispatch level that a 2-level '../..' write escapes
the per-workspace root and lands in projectRoot — allowed BY DESIGN
per the utils.ts:28-30 comment ("inside the workspace, the project,
the builds directory or the external root is allowed"). But the
per-workspace design INTENT (WorkspaceService.ts:239-241: "so a local
guest cannot inspect or overwrite another account's generated
project") assumes ws roots isolate accounts — and W7 shows any
workspace can write OUTSIDE its root into projectRoot/externalRoot,
where another workspace (or a no-wsId explorer read) can see it. E9+L4
prove the DEFAULT anchor is correctly per-ws; the fallback chain is
the hole. In production projectRoot is the repo tree, so this is a
live ws-escape hatch into shared/build-visible locations (same
isolation class as OBS-120-2 memory cross-workspace and OBS-116-1
cache). Smallest fix direction (NOT implemented — audit-first,
coordinated ownership): narrow the fallback for ws-scoped callers
(root + buildsDir only when a workspaceId is present), or document
the fallback as intentional with the isolation caveat; add negative
tests (ws write with '..' stays inside or fails loudly). Proposed
repair-backlog item (P2 isolation; needs owner decision — verify no
legitimate flow depends on the projectRoot fallback, e.g. builds
landing beside artifacts, before narrowing). No unilateral edit.

## OBS-121-2 (safePath drops the explicit workspaceId — correct
## scoping currently depends on ambient async context; P4 robustness)
SystemTools.ts:608 calls resolveToolPath(p, workspaceId) with the id
as a BARE STRING where ResolvePathOptions is expected, so
options.workspaceId is undefined and resolution falls back to
workspaceAsyncContext (utils.ts:33 + WorkspaceService.ts:216-220).
On the canonical path this is BENIGN — executeTool wraps the handler
in runWithWorkspace(contextWorkspaceId) (:863-865), and E9+L4 prove
live that scoping works — but any direct handler caller outside
runWithWorkspace silently resolves to the shared local root instead
of the caller's workspace. The ToolService containPath layer already
does it correctly (:64-71: { workspaceId }). Smallest fix direction
(NOT implemented — audit-first): pass { workspaceId } in safePath;
one-line, behavior-preserving on the canonical path, verified by
re-running E9/L4. Proposed repair-backlog item (P4 hygiene; needs
owner decision). No unilateral edit.

## Behavior pins carried (no new OBS)
- First-occurrence-only edit (E1): models assuming replace-all get
  silent partial application — surfaced as behavior, not defect.
- Raw ENOENT from ls (L3): second pin of the raw-errno class
  (cf. K2-119 readHistory); honest but unnormalized.
- Abs-path leak into user-facing edit errors (E5/E8): miss/directory
  messages name the absolute ws path — observability note, minor.
- delete_file handler REMAINS unproven (high gate, hermetic): X1/X2/X3
  pin the gate side only; handler proof needs an approved-approval
  harness, not bypass.

## Verdict
- TWO backlog-grade findings (OBS-121-1: fallback undercuts ws
  isolation, P2; OBS-121-2: string-as-options async-dependence, P4),
  proposed for the repair backlog at team ownership decision,
  alongside standing OBS-114-1, OBS-115-1/115-2, OBS-116-1/116-2,
  OBS-117-1/117-2, OBS-118-1/118-2, OBS-119-1/119-2, OBS-120-1/120-2.
  Level-4 dispatch PROVEN for 24 families (121 adds file_edit + ls
  first live proof, write_file positive depth, delete gate-verdict
  depth, and the containment-fallback map) with the gate-vs-handler
  split on EIGHT gate tools and all four risk levels live-pinned. No
  repairs (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-121 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-120 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120; this checkpoint adds the 25-case run-2 dispatch
  battery + OBS-121-1/121-2; run-1 23/24 receipts preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 121 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=24 families (110-120 twenty-two + 121:
  file_edit + ls first live proof via executeTool; write_file
  positive depth; delete_file gate side only — handler still
  unproven behind the high gate)
WRITE_FILE_POSITIVE_PROVEN=YES (W0/W1/W2/W7; 110 had negative depth only)
DELETE_HANDLER_PROVEN=NO (X1/X2/X3 gate verdicts only; needs an
  approved-approval harness)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 + X1/X2/X3 re-pin
  the run_command->shell_execute and delete_file/rm_file verdicts)
GATE_BEFORE_GUARD_PINS=2 (T5-117 run_command + X2-121 delete_file;
  order class)
RESOLVED_NAME_RISK_PINS=2 (G1-115 grep_search + X3-121 rm_file)
FALLBACK_ESCAPE_LIVE=1 (W7: ws-root escape lands in projectRoot;
  OBS-121-1, proposed backlog, unowned)
REFUSAL_PINS=3 (W8 write path + E7 edit path, 121; run-1 W7 shape
  retained as W8)
WS_FILE_SCOPING_LIVE=YES (E9 write-miss + L4 read-empty + W0
  my-workspace-absence; default anchor per-ws, fallback excepted)
STRING_AS_OPTIONS_CALLS=1 (SystemTools.safePath :608; benign on the
  canonical path via async ctx, OBS-121-2 P4, proposed backlog,
  unowned)
FIRST_OCCURRENCE_EDIT=1 (E1 behavior pin; no OBS)
RAW_ERRNO_SURFACES=2 (K2-119 readHistory + L3-121 ls; class note)
ABS_PATH_IN_EDIT_ERRORS=1 (E5/E8 observability note; minor)
GATE_BYPASS_LIVE=2 tools (recall_memory + memorize_codebase via
  the :571-608 early-return shim; OBS-120-1, proposed backlog,
  unowned)
SHIM_SHADOW_DUPLICATES=1 family (memory; OBS-120-1)
ENVELOPE_BYPASS_LIVE=1 (S3-120 differential)
STALE_JUSTIFYING_COMMENT=1 (MemoryTool.ts header; OBS-120-1)
MEMORY_REPLACE_NOT_MERGE=1 (OBS-120-2)
MEMORY_CROSS_WORKSPACE=1 (OBS-120-2)
RISK_LEVELS_LIVE=4/4 (114; 121 re-exercises low D1 + medium
  W/E/L through default allowance + high via H4/X1/X2/X3 gate
  verdicts)
RISK_SPLIT=tool-x-input (unchanged; 121 adds second gate-before-
  guard pin + second resolved-name pin)
SESSION_OVERRIDE_LIVE=YES (T1-119 stands)
SCOPED_ISOLATION_LIVE=YES (S3/S4-118; W2/R2-119; E9/L4-121 file
  layer, fallback excepted per OBS-121-1)
UNSCOPED_TERMINAL_ACTIONS_REACHABLE=5/6 (OBS-118-1 + OBS-119-1,
  proposed backlog, unowned)
SILENT_NOOP_VERDICTS=5 (119 + 120-shim; OBS-119-2 + OBS-120-1)
READ_MISSING_THROWS=1 (readHistory lone reporter; K2-119; L3 ls
  surfaces raw ENOENT instead — class contrast)
WS_TOOL_OWNERSHIP_ASYMMETRY=1 (OBS-118-1 + OBS-119-1)
SHADOW_QUARTET_PINNED=4/4 (H1-H4-118 stand; H4 re-pinned in 121)
DIVERGENT_SHADOW=2 (run_command; memory family pre-gate)
GATE_BEFORE_HANDLER_EMPTY_INPUT=1 (re-pinned H4-121)
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
  handlers self-validate, OBS-111-2; file_edit/ls/delete_file all
  self-validate live in 121)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin) + ingress-enforcement asymmetry
  class (118) + verdict-effect asymmetry class (119) + pre-gate-
  shadow class (120) + fallback-scope class (121: per-ws default
  anchor with a permissive multi-root fallback + async-dependent
  id threading)
RESOLVER_PARITY_LIVE=YES (P4-112; G1-115; 121 re-proves both
  layers resolve the same per-ws root: containPath explicit id +
  safePath async ctx)
DISPATCH_LOG_ENVELOPE=PARTIAL (:623 start line + :929 handler append;
  H1-113; G1-115; 120 shim exception stands)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=12 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25 (110+111+112+113+114+115+116+117+118+119+120+121 run-2 probes, 120 run-1 7/13 + 121 run-1 23/24 receipts preserved)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: ai_write_file contract depth, scaffold_project,
git-helper/ssh-manager/npm-arg depth from 100-102, browser smart
families beyond browser_run, ProjectPipeline/ProjectRun handler
depth) or the next Codex-requested bounded scope, or OBS-114-1 /
OBS-115-1 / OBS-116-1 / OBS-117-1 / OBS-117-2 / OBS-118-1 / OBS-119-2 /
OBS-120-1 / OBS-120-2 / OBS-121-1 / OBS-121-2 ownership/repair
proposals at a coordinated checkpoint. No registry/ToolService/tool
edits without ownership.
