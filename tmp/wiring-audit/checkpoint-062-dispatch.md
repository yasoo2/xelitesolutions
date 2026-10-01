# Wiring audit checkpoint 062 — dispatch/firewall gating proven (2026-10-01, Muse)

MUSE_HEAD=e0722d54. MAIN=e8fd9589 (+dirty, read-only, untouched).
Mode: read-only discovery + fixture-contained in-process probe of the
ACTUAL ToolService.executeTool path. No servers, no network, no provider
calls. Only tool execution: `echo` (pure). All other sample tools were
stopped at the approval gate (AUTO_APPROVE_SAFE=0) so their
implementations never ran.
Probe: tmp/wiring-audit/dispatch62.mts; fixture fx-dispatch62/
(dispatch62_MUSE.json). Main re-probe: target60.mts --tree=main.

## Proven this cycle
P1. APPROVAL ALLOW/DENY IGNORES DECLARED PERMISSIONS/sideEffects.
    7/7 sample tools blocked with approval_required under
    AUTO_APPROVE_SAFE=0; recorded risk comes ONLY from
    classifyToolRisk(name,input): the 5 write-defaulted tools ->
    medium (default branch), echo + central_answer -> low (explicit
    low rule, ToolService.ts:200). No implementation code ran for
    these 7. Declarations affect ONLY the identity-presence checks
    (P2). Source: ToolService.ts:722-784; registry defaulting:
    registry.ts:384-390. This RESOLVES checkpoint-061 F-061-1's P3
    gating question for the approval half: missing sideEffects
    cannot weaken/strengthen approval — approval never reads them.
P2. IDENTITY GATING (declarations -> presence checks only).
    Missing userId -> `unauthorized` (hard). Missing workspaceId ->
    AUTO-ASSIGNED `default-workspace` ("[ToolService] Auto-assigned
    workspace context: default-workspace") and the call proceeded to
    the approval gate; the `workspace_required` branch is shadowed on
    this path. Recorded as dispatch-path behavior, NOT a defect claim;
    multi-user relevance: a missing workspace collapses to a shared
    default instead of failing closed. No repair proposed (discovery).
P3. FIREWALL SINGLE-BRAIN ENFORCED at this layer. Direct executeTool
    outside orchestrator context throws `Execution bypass detected...
    All execution must go through AgentOrchestrator.coordinate()`
    (AgentExecutionFirewall.ts:88-98). All gated legs ran inside
    runInContext (non-system), so the approval path was genuinely
    exercised, not bypassed.
P4. FULL DISPATCH PROOF (LEVEL 4) for `echo`: firewall -> registry ->
    identity -> approval -> rate-limit -> execute -> broadcast
    (null-wss no-op, harmless log) -> ok:true with exact echoed text.
    First runtime EXECUTABLE proof through the real dispatch path in
    this audit lane.
P5. MAIN TARGET RE-PROBE STILL BLOCKED by the owner's dirty syntax
    break (ProjectPipelineTool.ts TransformError `Expected "}" but
    found "]"`, now at :697 — was :698, owner edited, still broken;
    0 goals evaluated). Muse did not touch, work around, or
    substitute the owner's dirty state. Owner's lane.
P6. REGISTRY RE-CONFIRMED at this HEAD: 163 registered (71 revived),
    same 21 permission-defaulted names, same 2 rate-limited
    (central_answer, web_page_builder). Matches checkpoint 061 P2/P4.

## Finding
F-062-1 P2_WORKSPACE_AUTOASSIGN_OBSERVATION: missing workspaceId is
auto-assigned default-workspace before the workspace_required check.
Fail-open direction for identity scoping; single-user dev default,
multi-user question. Discovery only; needs team review before any
claim or repair.
F-061-1 UPDATE: approval half RESOLVED (declarations do not gate
approval); identity half now characterized (P2). Remaining: planner
visibility/selectability per tool (registry->planner exposure), and
broad EXECUTABLE (1/163 runtime-proven: echo).

## Counts (proven vs unknown — no invention)
DISPATCH_SAMPLE=7/7 reached gate, 7/7 approval-blocked under SAFE=0,
1/1 executed (echo, LEVEL 4)
DISCOVERED_TOOLS=UNKNOWN EXECUTABLE_TOOLS=UNKNOWN (1 proven: echo)
FULLY_WIRED=UNKNOWN PARTIALLY_WIRED=UNKNOWN ORPHANED=UNKNOWN
DUPLICATE=UNKNOWN REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0.
TARGET_MAIN=UNKNOWN (blocked: owner dirty syntax, re-verified).

## Next discovery step
Planner-exposure probe: for the same bounded sample, determine
planner visibility (plan-tools registry snapshot / tool-list
construction) + selection reachability, read-only. Owner: Muse lane.
No repair proposed.
