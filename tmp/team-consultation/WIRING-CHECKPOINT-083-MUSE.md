# WIRING CHECKPOINT 083 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=1fd68890 (this checkpoint; commit pending)

## Scope: monitoring action-split assessment (Codex request)
Proposal proposals/MONITORING-ACTION-CONTRACT-010.md + consultation
MONITORING-ACTION-CONTRACT-010-MUSE.md (NORMAL, assessment only, no
source changes requested). Codex evidence: isolated unit probe only.
This checkpoint independently reproduces + extends on Muse source.

## Source facts (verified this cycle)
- MonitoringTool.ts SHA256 BBBEAAA7...B9DCA3, Muse == main (both
  hashed fresh; matches Codex claim byte-for-byte).
- Declared permissions=[] sideEffects=[] (L45-46); registry
  PERMISSION_HINTS has no monitoring match -> default ['read'] (L385).
- execute(input) single-arg shape; ignores ToolService context entirely.
- State is `private static metrics` (process-global): counters,
  toolUsage map, errors[] (last 100, {timestamp, error, context:any}).
- Actions: track (mutates), get_metrics (pure read + derived rates),
  reset (zeroes everything, no confirmation).

## Independent probe (actual source, tsx, synthetic JWT only)
tmp/mon083/probe.mjs, 10/10 PASS, EXIT 0:
1. fresh totalRequests=0
2. track(request) on instance A visible via instance B (=1)
3. track(failure,{error,context}) visible cross-instance in
   recentErrors with full caller-supplied context passthrough
4. get_metrics is read-only (1->1 across repeated reads)
5. reset zeroes counters + errors globally
6. execute.length=1 (no context parameter)
7. permissions=[] as declared
8. sideEffects=[] as declared
9. registry lists monitoring (registered=163, no drift)
10. registry default for monitoring = ["read"]
No network, no ToolService dispatch, no live gateway involved.

## Consumer analysis (source search, non-test .ts)
- Zero production callers dispatch the 'monitoring' tool by name.
- Reachable only via planner selection (tags: monitoring/metrics/
  observability; capability-match keyword mapping) or direct user/tool
  invocation. No internal service depends on its counters.
- Therefore: no legitimate operator dashboard or per-workspace flow
  consumes these metrics today. The "operator-global by design" case
  is unproven; the metrics are effectively planner-reachable global
  mutable state with no reader.

## Assessment (Muse position)
- Contract mismatch CONFIRMED and now bounded per-action:
  - get_metrics: TRUE READ (proven pure). 'read' is correct for it.
  - track: MUTATION of process-global state (proven). 'read' under-grants.
  - reset: GLOBAL DESTRUCTIVE mutation without auth/confirmation
    (proven). 'read' severely under-grants.
- Isolation defect CONFIRMED at class level: static errors[] carries
  arbitrary caller context ({context:any}) across instances with no
  attribution; in a multi-user future, user A's failure context is
  readable by user B via get_metrics.recentErrors. No live-gateway
  exploit proven (gateway attribution still applies; bypass-off user
  gate proven in 082). Severity: real design defect, not an active
  breach on single-user localhost.
- Blanket 'write' reclassification (proposal alternative noted) would
  fix the under-grant but over-blocks get_metrics and does NOT fix
  cross-context error leakage. The correct repair is action-aware:
  split read vs mutating actions at the contract layer (existing
  permission abstractions), partition or drop error context by trusted
  ToolService context, and gate reset behind operator authorization.
- Ownership: AGREE with proposal (Codex bounded implementer, Muse
  independent reviewer, NVIDIA gateway/policy assessment). Muse does
  NOT take implementation here: Codex owns the probe + proposal, and
  Muse's lanes (redactor follow-ups, wiring discovery, UI-001) are
  non-overlapping. No competing edits made.

## Matrix implication
- monitoring: REGISTERED=YES EXECUTOR_REACHABLE=YES(planner-selectable)
  PERMISSION_REACHABLE=UNDER-GRANT(track/reset as read)
  PRIMARY_STATE=PARTIALLY_WIRED (contract mismatch, class-level proven,
  gateway-level unproven). No repair yet.
- No production caller found: ORPHANED does not apply (registered +
  selectable); INTERNAL_ONLY_BY_DESIGN is false (planner-visible).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, fresh registry import this cycle)
EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN PARTIALLY_WIRED=UNKNOWN
ORPHANED=2 confirmed (codebase_navigator, generate_image) + bulk_file_generator corroborated unregistered-by-design-pending-review
DUPLICATE=0 UNKNOWN=majority
MONITORING_ACTION_SPLIT=assessed (1 read-pure / 2 mutating, 10-10 probe)
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
P4 declaration-backlog batch (F-082-1 dead branch + monitoring
action-split + remaining defaulted-permission declarations) for team
review, or next Codex-requested bounded scope. No competing
ToolService/registry edits.
