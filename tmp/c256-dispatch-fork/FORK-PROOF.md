# C256 — F5 web_search dispatch-fork executable proof (BATCH-012 decision support)

MUSE_HEAD=0caa3bb0b495432691f923e2bd82f244c764fcb6 (bytes under test; api/ tree 15ba6509)
DATE=2026-10-04
METHOD=tmp/c256-dispatch-fork/probe-web-search-fork.mts via tsx (real imports:
plan-tools.ts + registry.ts). Synthetic test-only JWT, workspace TEMP.
Side-effect-free: name resolution + committed-byte reads only. executeTool
NEVER called; no browser launched; no provider/network use.

## CLAIM (proven)
The bare tool name `web_search` resolves to TWO different registered tools
depending on entry path — a genuine plan-time/executor-time contract fork:

- Plan-time (sanitizer): web_search -> search_api (TOOL_ALIASES, how=alias).
- Executor-time (direct executeTool): web_search -> browser_run (inline
  rewrite at ToolService.ts:368, BEFORE registry lookup and alias fallback).

## EXECUTABLE RESULTS (probe.log; DONE pass=5 fail=0)
- A1 plan-time-alias: resolvePlannedTool('web_search') =
  {"tool":"search_api","how":"alias"} — PASS
- A2 sanitizer-rewrite: sanitisePlanPhases rewrites task.tool web_search ->
  search_api with note "[plan] «web_search» → search_api" — PASS
  (executableTasks=2: kept search task + honest doc-conversion note; no drop)
- A3 registry: search_api=true, browser_run=true, web_search=false,
  total=163 — PASS (163 confirmed on Muse HEAD: "Registered 163 tools
  (71 revived)")
- A4 dispatch-order: rewrite@17699 < lookup@33759 < aliasFallback@34651 in
  committed ToolService.ts bytes — PASS (executor rewrite precedes both the
  tDef lookup and the TOOL_ALIASES fallback, so the static alias
  web_search->search_api is DEAD at executor time)
- A4 dead-status-branch: status branch "effectiveName === 'web_search'"
  present @31604 but unreachable (effectiveName can never be web_search
  there) — PASS (corollary confirming the rewrite always fires first)
- A5 contracts (informational): search_api.required=["query"] vs
  browser_run.required=["sessionId"] — the fork is NOT benign: different
  arg contracts, different cost (API call vs full browser session),
  different evidence shapes.

PowerShell reported exit 1: its stderr-to-error wrapping of ToolRegistry
console notices (same precedent as the a4fd probe), not a probe failure.
Binding verdict is the probe's own DONE pass=5 fail=0.

## SOURCE ANCHORS (Muse HEAD)
- api/src/modules/services/ToolService.ts:247 TOOL_ALIASES web_search->search_api
- api/src/modules/services/ToolService.ts:368 executor rewrite web_search->browser_run
- api/src/modules/services/ToolService.ts:644 unreachable web_search status branch
- api/src/modules/services/ToolService.ts:675 tDef lookup; :691-698 alias fallback (fires only if unregistered)
- api/src/core/orchestrator/plan-tools.ts:228-261 resolvePlannedTool (alias leg :234-235)
- api/src/core/orchestrator/plan-tools.ts:739 sanitizer persists r.tool
- api/src/modules/tools/registry.ts:151 search_api; :228 browser_run; NO web_search

## SCOPE / LIMITS (honest)
- Executor leg is LEVEL-3 dispatch-structure proof (byte-order + registry
  membership on real imports), NOT a live executeTool run — running it would
  launch a real browser session. No implementation change proposed or made.
- Canonical sanitized path runs search_api; ANY unsanitized/direct web_search
  execution (raw PhaseExecutor input, legacy callers, test harnesses) runs
  browser_run instead. Owner decision (BATCH-012) still required: choose one
  canonical endpoint and align the other layer; Muse makes no registry/
  dispatch edit (NVIDIA owns plan-tools/registry dirty scopes).
- Generalizes: same probe shape applies to the other 4 dispatch variants in
  BATCH-013 and any future alias-vs-rewrite claim.
