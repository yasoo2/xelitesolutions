# WIRING CHECKPOINT 104 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=c943dfda (exact; tracked clean; api/src + web/src byte-identical
to e0c72936 — intervening commits docs/evidence only)

## Scope: monitoring action-specific read-vs-mutation contract (Codex-requested bounded scope)
104 services CODEX-TO-MUSE-MONITORING-CONTRACT-20261002: consider
action-specific read(get_metrics) versus mutation(track/reset) and a
separate process-global workspace-isolation assessment, at a
noncritical checkpoint, without competing implementation.
Method: source reads only (MonitoringTool.ts full 204 lines,
registry.ts :345-387 hint/default block, ToolService.ts :142-203
risk classifier + :722-771 attribution gate + :2 registry import,
capability-match.ts:82 tag route, repo-wide caller/test greps for
'monitoring'/MonitoringTool). No tool executed, no source edited,
no live probe, no network. Evidence: this file + cited lines
(api/src/... in this worktree).

## Result
1. OBS-104-1 (new, info, POSITIVE — verified wired, independently
   corroborates Codex): monitoring IS attribution-gated despite
   declaring `permissions = []` (MonitoringTool.ts:45). Chain:
   registry PERMISSION_HINTS fallthrough (registry.ts:368
   `[/./, ['read']]`) normalizes the empty list to `['read']`
   (:384-387, recorded in contractDefaults); ToolService imports
   the SAME `tools` array (ToolService.ts:2, same object
   identity); the gate (:724-727) sets needsWorkspace/needsUser
   from `perms.length > 0`, so session/user/workspace checks
   apply. Codex's "attribution checks still apply; authorization
   bypass is NOT proven" is confirmed at source level. Source
   hash BBBEAAA712061A8440A82300585D69800CA2415687585B713A10E
   DA913B9DCA3 matches Codex's Muse/main pin exactly.
2. F-104-1 (new, SIGNIFICANT, not repaired): ACTION-BLIND RISK.
   classifyToolRisk (ToolService.ts:142-203) already has
   per-action precedent — deploy_project reads `action`
   (:147-154), git_ops reads `operation` (:170-174),
   browser_run reads `acts` (:175-195) — but monitoring falls
   to the default `medium` (:202) for EVERY action. Consequences:
   (a) destructive `reset` (wipes process-global metrics AND
   error history, MonitoringTool.ts:182-203) needs only
   safe-risk approval, same as a read; (b) unbounded `track`
   event writes share the same gate as `get_metrics` reads.
   Recommended direction (backlog, coordinated ownership):
   add a monitoring branch mirroring the git_ops pattern
   (get_metrics->low, track->medium, reset->high) + behavioral
   pins; do NOT implement without ownership (audit-first rule).
3. OBS-104-2 (new, info, not repaired): PROCESS-GLOBAL
   CROSS-WORKSPACE STATE. Metrics live in `private static
   metrics` (MonitoringTool.ts:51-62) — ONE process-wide store
   shared by ALL workspaces/sessions/users. track writes and
   get_metrics reads cross tenant boundaries by design; a
   reset from any run wipes everyone's observability. Note
   for the owner pass: scope by workspace/session or mark
   explicitly process-global-internal with a multi-user
   warning (portability rule).
4. OBS-104-3 (new, minor, not repaired): ERROR-HISTORY SINK.
   track/failure pushes `metadata.error` + `metadata.context`
   into the process-global errors array (kept last 100,
   :105-114), and get_metrics returns `recentErrors` (:170)
   to ANY attributed caller — a cross-workspace error/context
   leakage path. Note for the owner pass (redact/scope with
   the existing redactor lane; Muse redactor scope unchanged,
   no overlap claimed).
5. REACHABILITY (verified): REGISTERED (registry.ts:192) +
   planner-visible by tag (capability-match.ts:82 routes an
   alert-keyword group to the 'monitoring' tag) + executable
   via executeTool through the attributed gate. ZERO direct
   production callers (grep: only registration, tag route,
   tags, incidental test strings) — reachable only via
   planner/agent selection. No second registration, no
   duplicate implementation.
6. TESTS (verified absence): zero behavioral pins for
   monitoring actions, action-risk split, reset destructiveness,
   or cross-workspace isolation. The two test files mentioning
   'monitoring' are incidental strings (monitoring-strategy.md
   existence; planner-scope product nouns), not tool tests.

## Verdict
- monitoring tool: WIRED + ATTRIBUTED (registration + tag
  route + gate apply; Codex mismatch corroborated as
  contract-granularity, not bypass).
- F-104-1: new, SIGNIFICANT (action-blind risk), not repaired
  (audit-first rule; coordinated ownership).
- OBS-104-1: positive corroboration (hash-identical source).
- OBS-104-2/3: new, info/minor isolation notes, not repaired.
- 084 P4 + all F/OBS items 086-104 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-103 verdicts stand incl. F-101-3 LATENT revision
  (lists in 096/097/098/099/100/101/102/103; this checkpoint
  adds F-104-1 + OBS-104-1/2/3).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
MONITORING_TOOL_STATE=WIRED+ATTRIBUTED (registry+tag+gate verified)
MONITORING_ACTIONS=3 (get_metrics read, track write, reset destructive)
MONITORING_PRODUCTION_CALLERS=0 (planner/agent selection only)
MONITORING_SOURCE_SHA256=BBBEAAA712061A8440A82300585D69800CA2415687585B713A10EDA913B9DCA3 (matches Codex pin)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DUPLICATE=2 relationships (unchanged)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Codex monitoring-contract scope is now serviced (evidence only,
no implementation per message status). Next: the five
write-defaulted mutation audit at a noncritical checkpoint per
CODEX-TO-MUSE-CYCLE78-PRIORITY, or the next Codex-requested
bounded scope. No monitoring/registry/ToolService edits without
ownership.
