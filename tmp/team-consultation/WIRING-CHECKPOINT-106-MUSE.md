# WIRING CHECKPOINT 106 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=393a36b9 (exact; tracked clean before evidence writes;
api/src + web/src byte-identical to e0c72936 — intervening
commits docs/evidence only)

## Scope: 079-R2 bypass-off dispatch probe (CLOSED this cycle)
079 left one runtime item: the attribution firewall branch
(ToolService.ts:722-785) is dormant under local ENABLE_AUTH_BYPASS
runs, so firewall reachability was LEVEL<=3 (dispatch/source),
not proven under bypass-off execution. This batch runs the
smallest safe runtime experiment through the REAL executeTool
dispatch path with the bypass OFF.

Method: isolated tsx process, canonical test env
(api/src/__tests__/setup.ts: JWT_SECRET test-only, MOCK_DB,
isolated JOE_DATA_DIR/JOE_CHAT_STORE_DIR, network fetch killed),
ENABLE_AUTH_BYPASS/AUTO_APPROVE_* deleted process-scoped,
dispatch inside executionFirewall.runInContext (orchestrator-
authorized, NON-system; isSystemContext()=false asserted).
Tool under test: `echo` (pure passthrough, SystemTools.ts:659-671,
risk 'low', zero side effects). No sessionId passed, so no
session-store lookup runs. No source edited; probe run left ZERO
tracked modifications (verified via git status/diff after run).
Probe: tmp/team-consultation/muse-106-bypass-probe.ts; receipts:
muse-106-bypass-probe.stdout.log/.stderr.log (same dir).

## Result: 6/6 PASS, EXIT 0
- P0-preconditions: bypass=unset, isSystem=false. PASS.
- P0c-echo-defaulted: echo registered, permissions=[read],
  contractDefaults has 'echo→read'. PASS — ties dispatch to the
  079 defaulting mechanism (registry.ts:365-388). Same branch
  covers all 21 defaulted tools (read AND write: enforceContract
  assigns non-empty perms to both, ToolService checks
  perms.length>0).
- P1-no-context: ok=false error=unauthorized. PASS (expectation
  CORRECTED from workspace_required after first run exposed
  F-106-1; see below).
- P2-workspace-no-user: ok=false error=unauthorized. PASS.
- P3-attributed (workspace+user): ok=true, output {text:probe-3}.
  PASS — bypass-off dispatch reaches execution for attributed
  default-grant tools.
- P4-user-no-workspace: ok=true AND intercepted console.info shows
  "[ToolService] ✅ Auto-assigned workspace context:
  default-workspace". PASS — proves the fail-open workspace leg.

## F-106-1 (SIGNIFICANT, new): workspace_required is dead code;
## unattributed workspace auto-satisfies to shared 'default-workspace'
ToolService.ts:336-342 auto-assigns contextWorkspaceId (session-
scoped, else 'default-workspace') BEFORE the firewall at :722-771.
Therefore `needsWorkspace && !contextWorkspaceId` (:764-767) can
never fire through this path: P1 and P2 both collapse to
`unauthorized`, and P4 proves a userId-without-workspace call
EXECUTES in the shared default workspace instead of being
rejected. Live attribution enforcement is the USER leg only
(unauthorized + session_forbidden). Impact today: none (single-
user local, bypass on). Impact in future multi-user mode: two
workspace-less callers with distinct userIds share one workspace
unless callers always supply workspaceId — a fail-open isolation
default, not a fail-closed gate. No repair proposed (audit-first;
ToolService ownership + AGENTS.md surgical-patch rule; needs
coordinated owner + NVIDIA review). session_forbidden leg is
SOURCE-TRACED (:750-753) but not runtime-proven here (needs live
mongoose + Session row; resolveSessionIdentity returns null
without DB — session-identity.ts:29-43).

## 079-R2 verdict: CLOSED
Firewall reachability for default-grant tools is now LEVEL 4
(focused runtime): unauthorized + attributed-execution proven
through the real path; workspace leg proven auto-satisfied
(F-106-1); session_forbidden remains LEVEL 3 (source-traced).
079 has no remaining items (R1 closed 21/21 in 080/104/105;
R2 closed here; R3 conservative-by-design, no concern).

## Verdict
- One new SIGNIFICANT finding (F-106-1). No repairs (audit-
  first rule; coordinated ownership).
- 084 P4 + all F/OBS items 086-106 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-105 verdicts stand (lists in 096/097/098/099/100/101/102/
  103/104/105; this checkpoint adds 079-R2 closure + F-106-1).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout;
  re-observed "Registered 163 tools (71 revived)" in 106 probe log)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
READ21_R1_CLOSED=21/21 (5 write in 080 + 16 read in 104/105)
FIREWALL_R2_CLOSED=YES (106: 6/6 probe PASS, EXIT 0)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DUPLICATE=2 relationships (unchanged)
FIREWALL_DEAD_BRANCHES=1 (workspace_required, F-106-1)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0 MONITORING_ACTION_TEST_PINS=0 READ16_MUTATION_TEST_PINS=0 FIREWALL_BYPASS_OFF_PINS=6 (probe, untracked-run receipts committed)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Next Codex-requested bounded scope, or F-106-1 ownership/repair
proposal at a coordinated checkpoint. No registry/ToolService/tool
edits without ownership.
