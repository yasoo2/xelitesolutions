# WIRING CHECKPOINT 110 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=8d534fe5 (exact; tracked clean before evidence writes;
api/src + web/src byte-identical to e0c72936 — intervening
commits docs/evidence only)

## Scope: dispatch-reachability battery (Level 3)
Follow-up to 109 (OBS-109-3: catalogue battery exhausted at
union=163/163; move DOWN the chain to dispatch). For one
representative tool per family this probe executes the REAL
executeTool path (alias layer -> registry -> firewall ->
approval gate -> handler) with inputs each handler provably
rejects BEFORE any side effect. Same isolated tsx method:
canonical test env, bypass OFF (hermetic), full attribution,
NO sessionId, zero network, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to
tmp/sbx-tmp-110. Ran from the plain DOS path, EXIT 0. No
source edited; probe run left ZERO tracked modifications
(verified via git status after run) and the scratch projects/
dir is EMPTY (no workspace dirs created). Probe:
tmp/team-consultation/muse-110-dispatch-probe.ts; receipts:
muse-110-dispatch-probe.stdout.log/.stderr.log (same dir).

## Result: 12/12 PASS, EXIT 0
- P0-preconditions: bypass=unset, isSystem=false. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text (106-P3
  control reproduced). PASS.
- D2-read-dispatch: read_file nonexistent path -> 'File not
  found' (handler's own error; containment passed). PASS.
- D3-write-dispatch: write_file no path -> 'filename or path
  is required' (pre-write; zero writes). PASS.
- D4-shell-gate: shell_execute {} -> approval_required,
  risk=high (GATE layer precedes handler). PASS.
- D4b-shell-handler: same + scoped AUTO_APPROVE_ALL='1' ->
  handler's 'shell_execute needs a command — nothing was
  run.' (nothing run). PASS.
- D5-terminal-dispatch: terminal_manager unknown action ->
  'Unknown action' (zero kernel calls). PASS.
- D6-unknown-name: 'muse_110_no_such_tool' -> 'unknown_tool:
  "muse_110_no_such_tool"' (routing dead end). PASS.
- D7-alias-gate: 'shell' -> 'tool alias' log + approval_
  required (alias-TABLE resolution proven; 'shell' has no
  direct rename). PASS.
- D7b-alias-handler: same + scoped approval -> handler's
  pre-exec error (full alias->handler chain). PASS.
- D8-orphan-repin: image_generate -> 'unknown_tool:
  "generate_image" — did you mean: image_studio,
  ci_generate_pipelin...' (orphan routing re-pinned). PASS.

## OBS-110-1 (model refinement): dispatch has TWO layers
High-risk tools meet the approval gate BEFORE the handler
(D4 vs D4b). approval_required proves routing + policy
evaluation (PERMISSION layer reached); only the handler's
own error proves handler wiring. The wiring matrix must
distinguish GATE-REACHED from HANDLER-REACHED for
execute/write-class tools. Not a defect — defense in depth,
correct behavior. AUTO_APPROVE_ALL is read solely by the
gate (ToolService.ts:774, sole consumer verified), so the
scoped D4b/D7b inputs (empty commands, provably inert)
prove handler wiring with zero execution risk.

## OBS-110-2 (info): alias-table path verified end-to-end
'shell' resolves via TOOL_ALIASES (log proof), passes the
firewall with attribution, meets the gate, and reaches the
handler under scoped approval. Direct renames (file_write,
read_file, web_search, ...) and table aliases are now BOTH
covered by live dispatch evidence on Muse lineage.

## OBS-110-3 (info): orphan suggestion names a wrong fix
D8's 'did you mean' offers image_studio for generate_image.
Re-affirmed: image_studio has a different table-oriented
contract and must NOT be blindly aliased (consistent with
prior Muse position and Codex creative-safety import).
The suggestion text is a UX hint, not a routing directive.

## Verdict
- No new SIGNIFICANT defects. Level-3 dispatch PROVEN for
  5 families (echo/file-read/file-write/shell/terminal) +
  routing controls (unknown/alias/orphan). No repairs
  (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-110 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-109 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109; this checkpoint adds the
  12-case dispatch battery + OBS-110-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 110 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=5 families (echo, read_file, write_file,
  shell_execute, terminal_manager — 110, live executeTool)
DISPATCH_GATE_PROVEN=shell_execute risk=high (110, approval gate)
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
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 CATALOGUE_PROBE_PINS=7+7+7 (107+108+109 probes) DISPATCH_PROBE_PINS=12 (110 probe, untracked-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to the next highest-value families
(browser_run, git_ops, npm_manager — each needs its own
pre-effect rejection input verified in source first), or the
next Codex-requested bounded scope, or F-106-1 ownership/
repair proposal at a coordinated checkpoint. No registry/
ToolService/tool edits without ownership.
