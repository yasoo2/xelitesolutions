# WIRING CHECKPOINT 082 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=6e98f3c2 (this checkpoint; commit pending)

## Closes 079-R2: bypass-off dispatch probe (LEVEL 3, runtime)
Question from 079: the attribution firewall branch is dormant under
ENABLE_AUTH_BYPASS — is LEVEL<=3 proven under bypass-off execution?

New permanent suite api/src/__tests__/auth-gate-defaults.test.ts, 5/5 PASS
(this cycle, exact HEAD, session-identity mocked to null = no record):
1. echo carries a non-empty defaulted permission (registry link pin).
2. echo + {} bypass-off -> unauthorized (rejected pre-execution).
3. echo + {workspaceId} no user bypass-off -> unauthorized.
4. write_file + {} bypass-off -> unauthorized (no file touched; gate
   rejects before dispatch, zero side effects).
5. Control: echo + {} bypass-ON -> ok:true (executes).
Existing auth-gate.test.ts still 12/12 PASS; guard:architecture 0,
guard:package-scripts 0. No production source changed (audit mode).

Conclusion: defaulted permissions DO enforce bypass-off. The 081 batch
is no longer source-trace-only: one read-defaulted (echo) and one
write-defaulted (write_file) representative are proven through dispatch
(LEVEL 3) with the gate engaged and disengaged.

## NEW finding F-082-1: workspace_required is unreachable via empty context
ToolService.ts L336-342 auto-assigns contextWorkspaceId
(`session-<id>` or 'default-workspace') BEFORE the firewall branch
(L722-771). By L764 the workspace is always truthy, so the
`workspace_required` rejection cannot fire on this path; the live
attribution gate is the user check (`unauthorized`). My first probe
draft expected workspace_required and failed 2/5 on exactly this
mechanism; expectations corrected to real behavior, suite now 5/5.
Disposition: dead-branch + single-user-default workspace under a
bypass-off multi-user future. P2/P4 backlog candidate (consultation
required before any attribution-behavior repair; NOT repaired here).

## Consistency with auth-gate
With a session record, owner identity fills missing attribution
(auth-gate convenience, pinned). Without a record, the call is refused
(this suite). The two suites compose, no contradiction.

## Registry side evidence (import log, fresh)
Registered 163 tools (71 revived); 21 defaulted-permission names logged
— identical 21-name list as 079 (business_logic_parser ... echo ...
monitoring ... template_manager). No drift since 079.

## Matrix implication
- echo / write_file: PERMISSION_REACHABLE=DEFAULTED+ENFORCED(bypass-off);
  dispatch LEVEL 3 proven for 2 representatives.
- ToolService workspace gate: PRIMARY_STATE candidate PARTIALLY_WIRED
  (dead workspace_required branch; user gate live). No repair yet.
- No evidence this cycle changes ORPHANED/DUPLICATE counts.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, fresh import log this cycle)
EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN PARTIALLY_WIRED=UNKNOWN
ORPHANED=2 confirmed (codebase_navigator, generate_image) + bulk_file_generator corroborated unregistered-by-design-pending-review
DUPLICATE=0 UNKNOWN=majority
BYPASS_OFF_DISPATCH_PROVEN=2 representatives (echo read, write_file write)
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Monitoring action-split assessment (Codex request: read get_metrics vs
mutating track/reset + process-global isolation), or P4 declaration
backlog batch for team review. No competing ToolService/registry edits.
