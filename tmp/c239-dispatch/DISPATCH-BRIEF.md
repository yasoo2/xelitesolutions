# C239 — navigator dispatch-side reachability (Muse HEAD 9e65e3dd)

## Question
C237 proved `codebase_navigator` is IMPLEMENTED_NOT_REGISTERED (import-only).
C238 proved the implementation itself executes keyless with correct ranking.
This slice answers the dispatch-side question: what does the REAL
`ToolService.executeTool` path do when the planner emits `codebase_navigator`?

## Static trace (ToolService.ts, Muse HEAD)
- L675: `tools.find(t => t.name === effectiveName)` — MISS (not registered).
- L691-697: alias fallback — MISS (no `codebase_navigator` entry in
  TOOL_ALIASES, L212-249).
- L700-719: returns `{ ok:false, error:'unknown_tool: "codebase_navigator" ...' }`
  with closest-name suggestions (shared-segment match, max 5).
- L562: session-injection branch fires for navigator BEFORE the miss, but its
  only effect is mutating `effectiveInput`, which is discarded on the miss
  path — dead but harmless today.
- L198: risk-low classification never applies (no execution reached).
- Broadcast (L626) is gated on `contextSessionId`; trace (L259) on
  `context.traceId`; firewall gate (L252-253) throws outside orchestrator
  context — the probe omits session/trace and wraps calls in
  `runInContext`, matching the C220 pattern.

## Dynamic probe
PROBE-c239-dispatch.ts (tsx, keyless, synthetic test-only JWT per
api/src/__tests__/setup.ts pattern, disposable fixture + worktree-local TEMP):
1. registryMiss / aliasMiss — same predicates as L675/L692.
2. Negative control — direct `executeTool` outside orchestrator context must
   THROW at the firewall (proves the gate precedes dispatch).
3. Real dispatch — `runInContext` + `executeTool('codebase_navigator', ...)`
   must return ok:false with `unknown_tool: "codebase_navigator"` head.
4. Positive control — `search_text` over a disposable 1-file fixture through
   the same path must return ok:true and see the fixture (proves the harness
   itself can reach execution, so the negative is not a harness artifact).

## Result — PROBE-OK (run4, 2026-10-04T00:23Z, receipt work/run.json)
- registryTotal=163, registryMiss=MISS, aliasMiss=NO-ALIAS.
- Negative control: direct `executeTool` outside orchestrator context THROWS
  `Execution bypass detected` (firewall gate precedes dispatch).
- Real dispatch (`runInContext` + `executeTool('codebase_navigator',...)`):
  `ok:false`, `unknown_tool: "codebase_navigator" — did you mean:
  memorize_codebase, analyze_codebase, codebase_outline?` — identical across
  4 runs (23:31/23:42/00:02/00:23Z), deterministic.
- Positive control: `search_text` through the SAME path returns ok:true and
  sees the planted fixture (wsRoot
  `D:\Joe\muse-worktree\data\projects\default-workspace`, unique subdir,
  removed after) — the negative is not a harness artifact.

CONCLUSION: EXECUTOR_REACHABLE(codebase_navigator)=NO on Muse HEAD. The miss
is honest (named error + closest suggestions), fail-closed, and consistent
with the C237 IMPLEMENTED_NOT_REGISTERED=4 census. The L562 session-injection
and L198 risk-low references are dead-but-harmless while unregistered.

## Incidental wiring finding (not repaired — audit-first)
UtilityTools.ts carries its OWN local `resolveToolPath` (L17-32) requiring
paths strictly inside `getActiveRoot(wsId)` with a bare
`path_outside_workspace` error — STRICTER than the shared
`api/src/modules/tools/utils.ts` rule (workspace+project+builds+external).
Runs 2-3 hit this (`directory`-vs-`path` contract + repo-outside fixture,
then bare containment refusal). Candidate for the shared repair backlog
(containment-rule normalization); needs owner triage, no Muse patch.

## Provenance of runs
- run1: probe imported TOOL_ALIASES from wrong module + missed JWT guard —
  corrected to ToolService import + repo setup.ts synthetic env pattern.
- run2: wrong `directory` arg + OS-tmp fixture (fixture/ kept as evidence).
- run3: `unauthorized` — ToolService needsUser gate (L768) needs userId.
- run4: GREEN with probe userId + self-located ws fixture.
