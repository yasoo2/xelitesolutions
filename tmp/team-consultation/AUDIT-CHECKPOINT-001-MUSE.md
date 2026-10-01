# Muse deep-wiring audit checkpoint 1 — 2026-10-01 (MUSE_HEAD=c6c1c914)

Command: CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (TWO_AGENT_CONTINUITY).
Scope this checkpoint: Muse-tree tool inventory foundation (implementations
vs registrations vs planner visibility mechanism). No restructuring, no
deletions, existing work preserved.

## Runtime-proven counts (Muse tree, jest-imported registry)
- REGISTERED_TOOLS=163 (AUDIT_REGISTERED_COUNT, exact names saved in
  tmp/joe-muse-cycle/registered-names.txt; throwaway counter removed after use)
- Tool definition files: 93 (api/src/modules/tools/definitions/*.ts)
- Registry array: ~127 `new X(` + 27 `createTool(` + revivedTools spread
  (static estimate; runtime 163 is authoritative)
- Stale :5002 /api/tools count: 163 (bundle version=no-commit-file;
  SAME NUMBER, UNVERIFIED composition — do not conflate with Muse tree)

## Key mechanism finding (planner visibility is NOT a static count)
api/src/core/orchestrator/toolCatalog.ts implements RETRIEVED catalogue:
per-goal deterministic scoring over all registered tools (+bilingual
AR/EN lexicon), offered to the planner with real arguments — replacing
an older hardcoded 7-tool prompt line. Therefore PLANNER_VISIBLE cannot
be reported as one number; the audit must sample representative goals
(AR + EN) and measure offered-tool sets per goal. Next step.

## Documentation drift finding
toolCatalog.ts header comment says 'Joe registers 151 tools' but the
runtime registry yields 163. Stale count in a load-bearing doc comment;
flag for repair backlog (P4), not a behavior defect.

## Still UNKNOWN (explicit, per audit rules)
EXECUTABLE_TOOLS, FULLY_WIRED, PARTIALLY_WIRED, ORPHANED, DUPLICATE,
IMPLEMENTED_NOT_REGISTERED, CONTRACT_MISMATCHES — require per-tool
dispatch/permission/contract tracing (registry→ToolService→firewall→
executor). Next checkpoints; NVIDIA owns registries/canonical-ingress
validation per division of work — Muse will cross-review, not duplicate.

## Related verification this cycle
- Muse smoke-verification-rewrite suite (run4b general repair): 5/5 PASS,
  log tmp/joe-muse-cycle/smoke-focused.log
- PHASE-OBSERVATION-REWORK-001-MUSE re-review: ACCEPT (APPROVE),
  response tmp/team-consultation/PHASE-OBSERVATION-REWORK-001-MUSE.response.md
- CRITICAL-REAL-JOE-UI-001 new-UI retest: BLOCKED (env) — :5101 down,
  :5002/:5000 stale bundles, browser click/keyboard delivery fails even
  on static non-Joe fixture (owner probe), backend refresh unanswered.
  Focused regression green; no UI PASS claimed.
