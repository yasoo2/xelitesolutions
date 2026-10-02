# WIRING CHECKPOINT 112 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=6efbff4f (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only)

## Scope: dispatch-reachability battery, families 9-11 (Level 3)
Follow-up to 111 (next step named deploy_project action-split,
docker_manager, image_studio). For one representative tool per
family this probe executes the REAL executeTool path (alias layer
-> registry -> firewall -> approval gate -> handler) with inputs
each layer provably rejects BEFORE any side effect. Every
expectation was derived from source BEFORE the run and confirmed
on the FIRST run. Same isolated tsx method: canonical test env
(setup.ts: JSON persistence, mock DB), bypass OFF (hermetic),
full attribution, NO sessionId, zero network, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to
tmp/sbx-tmp-112. NO AUTO_APPROVE_* set at any point: every
handler case reaches the handler through the default medium-risk
allowance, and every asserted error return precedes the effect in
source. Ran from the plain DOS path, TSX EXIT 0. No source
edited; probe run left ZERO tracked modifications (verified via
git status on api/src + web/src after run). Containment tree
verified: test stores + projects/probe-ws-112/probe-app-112
(empty) + tsx cache, all inside sbx-tmp-112; nothing outside.
Probe: tmp/team-consultation/muse-112-dispatch-probe.ts;
receipts: muse-112-dispatch-probe.stdout.log/.stderr.log (same
dir; UTF-16 via PS redirect like 111 — parse with ReadAllText;
TSX_EXIT=0 is the primary verdict, 9/9 regex-confirmed).

## Result: 9/9 PASS, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (110/111
  control reproduced). PASS.
- P1-deploy-gate: deploy_project {expose_port, port:99999} ->
  approval_required, risk=high (GATE; invalid port never
  reached handler validation — GATE-before-HANDLER order
  pinned). PASS.
- P2-deploy-handler-missing-path: build_static, no path ->
  'Project path is required...' (HANDLER :91-93,
  pre-resolve). PASS.
- P3-deploy-handler-notfound: build_static +
  probe-no-such-dir-112 -> 'Project path not
  found: ...' (HANDLER :108-110 exists-check,
  pre-switch). PASS.
- P4-deploy-handler-unknown-action: unknown action +
  probe-app-112 pre-created EMPTY via the REAL
  resolveToolPath (same function + workspaceId as the
  handler) -> 'Unknown action: ...' + entries=0 +
  inside_sbx=true (HANDLER :274; no build/spawn/tunnel;
  resolved=D:/Joe/muse-worktree/tmp/sbx-tmp-112/projects/
  probe-ws-112/probe-app-112). PASS.
- K1-docker-handler: docker_manager {unknown action} ->
  'Unknown action' (HANDLER :52; before
  executionEngine.run; no subprocess; default medium
  reaches handler). PASS.
- I1-image-handler: image_studio {} ->
  'This session has no system with tables...' (HANDLER
  :130-137; empty joeProjects/default session; before
  readTables/picturesFor; no FS writes, no network;
  default medium reaches handler; dispatch has no
  'internet' special-case, ToolService.ts:722-785).
  PASS.

## OBS-112-1 (risk split, second live pin): deploy is (action x input)
P1+P2/P4 prove BOTH layers on the SAME tool: deploy_project
expose_port meets the approval gate (high), deploy_project
build_static/unknown-action reaches the handler (medium) —
decided by classifyToolRisk reading the action, not by the tool
name (ToolService.ts:147-153; the generic /(delete|deploy)/
high branch at :196 never fires for it because the specific
branch returns first). Second same-tool both-layers pin after
git_ops (111). P1 additionally pins GATE-before-HANDLER
ordering: the handler-invalid port 99999 was never validated
because the gate fired first.

## OBS-112-2 (validation depth varies by family)
Deploy's handler has THREE ordered pre-effect layers (presence
:91 -> resolve/contain :100 -> exists :108 -> switch :113),
each pinned live by P2/P3/P4. Docker and image fail at their
first meaningful check (switch default / session-system
guard). The wiring matrix should record validation DEPTH per
(tool, input-class), not just handler-reachable: a tool that
reaches its handler is not uniformly one rejection away from
its effect.

## OBS-112-3 (methodology, resolver parity proven executable-side)
P4's setup called the REAL resolveToolPath with the handler's
workspaceId in-probe: the call reached the action switch
('Unknown action'), NOT 'Project path not found' — proving
in-probe and handler path resolution are byte-identical, and
inside_sbx=true proves containment. This retires the 110/111
residual question of whether probe-side path reasoning matches
handler-side resolution: for workspace-relative inputs, it
does, live-proven.

## Verdict
- No new SIGNIFICANT defects. Level-3 dispatch PROVEN for
  11 families (110: echo/file-read/file-write/shell/terminal
  + 111: browser/git/npm + 112: deploy/docker/image) with
  the gate-vs-handler split now proven input-sensitive on
  TWO tools (git_ops, deploy_project) and gate-before-handler
  ordering pinned. No repairs (audit-first; coordinated
  ownership).
- 084 P4 + all F/OBS items 086-112 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-111 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111; this checkpoint
  adds the 9-case dispatch battery + OBS-112-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 112 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=11 families (110: echo, read_file,
  write_file, shell_execute, terminal_manager + 111:
  browser_run, git_ops, npm_manager + 112: deploy_project,
  docker_manager, image_studio — live executeTool)
DISPATCH_GATE_PROVEN=3 tools (shell_execute default high,
  110; git_ops push high, 111; deploy_project expose_port
  high, 112 — approval gate)
RISK_SPLIT=tool-x-input (G1+G2 same-tool both-layers, 111;
  P1+P2/P4 second pin + gate-before-handler order, 112)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at
  dispatch; handlers self-validate, OBS-111-2)
VALIDATION_DEPTH_PINNED=3 layers deploy (presence/resolve+
  contain/exists/switch; P2/P3/P4, 112)
RESOLVER_PARITY_LIVE=YES (in-probe resolveToolPath ==
  handler resolution, P4, OBS-112-3)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12+8+9 (110+111+112 probes, untracked-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to the next highest-value families
(payments/http_fetch medium-path contract; task_lifecycle;
 remaining high-risk tools needing gate pins), or the next
Codex-requested bounded scope, or F-106-1 ownership/repair
proposal at a coordinated checkpoint. No registry/
ToolService/tool edits without ownership.
