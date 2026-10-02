# WIRING CHECKPOINT 111 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=bb07ccf8 (exact; tracked clean before evidence writes;
api/src + web/src byte-identical to e0c72936 — intervening
commits docs/evidence only)

## Scope: dispatch-reachability battery, families 6-8 (Level 3)
Follow-up to 110 (next step named browser/git/npm). For one
representative tool per family this probe executes the REAL
executeTool path (alias layer -> registry -> firewall ->
approval gate -> handler) with inputs each layer provably
rejects BEFORE any side effect. Every expectation was derived
from source BEFORE the run and confirmed on the FIRST run.
Same isolated tsx method: canonical test env (setup.ts: JSON
persistence, mock DB), bypass OFF (hermetic), full
attribution, NO sessionId, zero network, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to
tmp/sbx-tmp-111. NO AUTO_APPROVE_* set at any point: every
handler case reaches the handler through the default
medium-risk allowance. Ran from the plain DOS path, TSX EXIT
0. No source edited; probe run left ZERO tracked
modifications (verified via git status after run). One empty
workspace root dir (probe-ws-111/, ZERO files inside) was
auto-created inside containment by workspace resolution —
see OBS-111-3 correction. Probe:
tmp/team-consultation/muse-111-dispatch-probe.ts; receipts:
muse-111-dispatch-probe.stdout.log/.stderr.log (same dir).

## Result: 8/8 PASS, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110-D1
  control reproduced). PASS.
- B1-browser-handler-noscid: browser_run {} ->
  'sessionId_required' (HANDLER, before auth/session/
  browser work). PASS.
- B2-browser-handler-forbidden: browser_run
  {sessionId:'probe-111-no-such-session'} -> 'forbidden'
  (HANDLER auth layer; read-only JSON-store lookup,
  nothing created). PASS.
- G1-git-gate: git_ops {operation:'push'} ->
  approval_required, risk=high (GATE layer). PASS.
- G2-git-handler: git_ops {operation:''} ->
  'invalid_git_operation' (HANDLER; runGitWithEnv regex
  rejects '' BEFORE spawn; no subprocess). PASS.
- N1-npm-handler: npm_manager {} -> 'missing_command'
  (HANDLER; before safePath/workspace/spawn). PASS.

## OBS-111-1 (model refinement): risk is (tool x input)
G1+G2 prove BOTH layers on the SAME tool: git_ops push meets
the approval gate (high), git_ops '' reaches the handler
(medium) — decided by classifyToolRisk reading the input, not
by the tool name alone. Same split holds for shell_execute
(cmd-sensitive: critical/high/medium/low branches) and
browser_run (actions/text-sensitive). The wiring matrix must
record gate-vs-handler per (tool, input-class), not per tool.
Medium/low reach the handler under the DEFAULT gate
(autoSafe=true when unset); only high/critical meet
approval_required. Not a defect — calibrated defense in
depth, now live-proven on 3 more families.

## OBS-111-2 (contract note): inputSchema is planner-facing only
ToolService.ts contains ZERO inputSchema/ajv/validation
consumers (verified via grep this cycle): dispatch never
validates input against the declared schema. required fields
(sessionId, operation, command) do not gate dispatch —
handlers self-validate instead (sessionId_required,
missing_command, invalid_git_operation). DISPATCH layer and
SCHEMA layer are independent; a malformed input reaches the
handler whenever risk allows. Planner-visible requiredness
must not be mistaken for dispatch enforcement.

## OBS-111-3 (methodology correction, fail-honest)
110's "projects/ EMPTY (no workspace dirs created)" was
overstated: workspace resolution auto-creates the (empty)
workspace root dir (WorkspaceService mkdirSync sites, e.g.
:252/:283). 110's own sbx-tmp-110/projects contains
probe-ws-110/, and this run created probe-ws-111/ — verified
ZERO files inside (recursive listing empty). Containment HELD
(everything inside sbx-tmp-111; zero tracked modifications),
but the correct claim is "zero files written; one empty
auto-created workspace root". 110's verdicts are otherwise
unaffected.

## Verdict
- No new SIGNIFICANT defects. Level-3 dispatch PROVEN for
  8 families (110: echo/file-read/file-write/shell/terminal
  + 111: browser/git/npm) with the gate-vs-handler split now
  proven input-sensitive on a single tool. No repairs
  (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-111 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-110 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110; this checkpoint adds
  the 8-case dispatch battery + OBS-111-1/2/3, and corrects
  110's empty-dir phrasing via OBS-111-3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 111 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=8 families (110: echo, read_file,
  write_file, shell_execute, terminal_manager + 111:
  browser_run, git_ops, npm_manager — live executeTool)
DISPATCH_GATE_PROVEN=2 tools (shell_execute default high,
  110; git_ops push high, 111 — approval gate)
RISK_SPLIT=tool-x-input (G1+G2 same-tool both-layers, 111)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at
  dispatch; handlers self-validate, OBS-111-2)
ALIAS_TABLE_PROVEN=1 chain (shell->shell_execute gate+handler, 110)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8 (110+111 probes, untracked-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to the next highest-value families
(deploy_project action-split: expose_port=high vs build=medium
is the sharpest remaining risk-split pin; docker_manager;
image_studio contract probe — each needs its pre-effect
rejection input verified in source first), or the next
Codex-requested bounded scope, or F-106-1 ownership/repair
proposal at a coordinated checkpoint. No registry/
ToolService/tool edits without ownership.
