# C233 catalogue-gap slice — sample classification (Muse HEAD 6c30b2c8, clean tree)

Source: runtime probe tmp/c233-catalogue-gap/probe-result.json + direct source reads below.
Scope: 14/123 gap tools traced (11%). Full-gap classification remains UNKNOWN.

## Counts (runtime, exact-source bound)

- REGISTERED_TOOLS = 163 (revived 71) — registry.ts `tools.length` at import
- PLANNER_CATALOGUE = 40 — plan-tools.ts PLANNER_TOOL_CATALOGUE.length
- GAP = 123 (registered minus catalogue, sorted list in probe-result.json)
- catalogueUnregistered = 0 (catalogue ⊆ registry; also pinned by plan-tools.test.ts:673-681)
- gapExactAccepted = 123/123 via resolvePlannedTool how='exact'
- Registry self-report cross-check: 21 permission-defaulted + 2 rate-limit-defaulted —
  IDENTICAL to NVIDIA's runtime observation, reproduced here on Muse's clean tree.

## Mechanism (file:line evidence)

| Step | File:line | Catalogue consulted? |
|---|---|---|
| Catalogue definition (deliberately short, prompt-size rationale) | plan-tools.ts:73-77 | — |
| Planner prompt ("the ONLY values allowed") | plan-tools.ts:1697-1706 | YES (prompt text only) |
| Planner prompt inclusion (2 sites) | ProjectPlannerTool.ts:838,1597 | via plannerToolPrompt() |
| Sanitizer resolution (accepts ANY registered name first) | plan-tools.ts:228-232 | NO |
| sanitisePlanPhases task + verification resolution | plan-tools.ts:531,864 | NO |
| PhaseExecutor task dispatch | PhaseExecutorTool.ts:1394 | NO |
| ToolService registry lookup | ToolService.ts:675,696 | NO |
| Permanent test pins catalogue ⊆ registry only | plan-tools.test.ts:673-681 | one direction only |

VERDICT: catalogue = SOFT PROMPT HINT, not an enforcement boundary.
"123 not in catalogue" measures prompt-shaping scope, NOT reachability.
All 123 are Level-3 reachable (resolver/executor contract); Level-4 execution
proven only where focused tests/probes exist. The audit's "architecture
limitation, not wiring defect" is directionally correct but understates:
non-catalogue tools ARE planner-emittable and executor-reachable today.

## MEANS alternate-visibility channel (probe, how=meaning/normalised)

- docker -> docker_manager (meaning)
- kubernetes -> kubernetes_ops (meaning)
- terraform -> terraform_manager (meaning)
- ci -> ci_generate_pipeline (meaning)
- github actions -> github_actions (normalised)
- MEANS map: plan-tools.ts:127-163 (routes to non-catalogue tools incl. docker_manager,
  kubernetes_ops, terraform_manager, github_actions, ci_generate_pipeline)

## Sample classification (14 tools)

| Tool | Class | Evidence |
|---|---|---|
| project_planner | ORCHESTRATOR_INTERNAL_BY_DESIGN | ProjectPipelineTool.ts:1467 production caller; planner-only per AGENTS.md; manual-eval callers only otherwise |
| phase_executor | ORCHESTRATOR_INTERNAL_BY_DESIGN | AgentLoopService.ts:1181 canonical; SelfFixExecutionService.ts:323,520 rerun |
| central_answer | ALTERNATE_PRODUCTION_PATH | AgentOrchestrator.ts:700 instant-answer path (not via plan emission) |
| docker_manager | MEANS_VISIBLE | plan-tools.ts:158; probe docker->docker_manager/meaning |
| terminal_manager | ALIAS_VISIBLE + EXECUTOR_PRIVILEGED | ToolService.ts:244-245 aliases (run_command/bash); PhaseExecutor.ts:434,960,1030 cwd set |
| shell_check_status | COMPANION | backgroundProcesses companion in SystemTools.ts:1719-1749; exact-accepted |
| ask_user | UX_CHANNEL | broadcast user_input_request, TaskInteractionTools.ts:238-271; exact-accepted; no orchestrator caller |
| task_lifecycle | UX_CHANNEL | broadcast task_update, TaskLifecycleTool.ts:6-45; exact-accepted; no orchestrator caller |
| browser_action | NICHE_WIRED (session-gated) | atomic ops need sessionId, BrowserActionTool.ts:10-37; exact-accepted; no orchestrator caller |
| image_studio | NICHE_WIRED (domain-gated) | needs session project w/ entities.js, ImageStudioTool.ts:124-137; manual-test caller only |
| execute_python | NICHE_WIRED | isolated compute, PythonExecutionTool.ts:10-24; exact-accepted; no orchestrator caller |
| rss_fetch | NICHE_WIRED | network fetch, ContentTools.ts:91-120; exact-accepted |
| cloud_cost_estimator | NICHE_WIRED | LLM-judge, EliteTools.ts:170-199; exact-accepted |
| self_confidence_evaluator | NICHE_WIRED (vocabulary-brittle) | LLM-judge, EliteTools.ts:260-287; exact-accepted; consistent w/ c225 recall finding |

GENUINELY_UNREACHABLE in sample: 0. LEGACY_OR_DEAD in sample: 0.

## Notes / risks (not defect findings)

- Prompt/executor contradiction: plannerToolPrompt() says ONLY-catalogue while the
  resolver accepts all registered. A model that obeys the prompt under-uses 123 tools;
  a model that names one anyway executes it. Recommend Codex/NVIDIA disposition:
  either harden the prompt claim or document the catalogue as advisory.
- Name-collision observation: 'browser_action' is also a WS event-type string
  (api/src/api/ws.ts:524, browser/telemetry.ts:315, browser/types.ts:118).
  Tool dispatch keys off registry names so no routing defect is claimed; flagged
  as a confusion risk for future tracing.
- No JOE-* shared audit file was modified (Codex hold respected). This is
  independent Muse-lane evidence for the audit owner to reconcile.
