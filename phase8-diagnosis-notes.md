# Phase 8 diagnosis and rerun notes

## Root cause confirmed
The visible Joe Logs showed the exact failure in the previous run:
`[PhaseExecutor] Task 1/3: "Deploy to hosting" — executing tool: deploy_project`
followed by `deploy_project — approval_required`. The failure happened before tasks 2/3 and 3/3, so Phase 8 ended at 0/3 and the honest report was 7/8 phases.

## Fix applied locally
`api/src/modules/services/ToolService.ts` now classifies `deploy_project` by action: local `build_static`, `start_server`, and `package` return `medium` and use the safe approval path; only `expose_port` returns `high` and remains blocked without explicit all-risk approval.

`api/src/core/orchestrator/plan-tools.ts` now tells the planner to use local build/start/package for verification and never use `expose_port` or publish externally unless explicitly requested and approved.

`api/src/__tests__/auth-gate.test.ts` adds regression tests proving local deploy actions do not return `approval_required`, while public port exposure still does.

## Verification before rerun
API build passed. Targeted Jest run passed: 11 suites, 106 tests. Workspace root remained `/home/ubuntu/xelitesolutions-review/data/projects/my-workspace`.

## Real UI rerun
After restarting API on port 5002 from the new dist, the exact 17,919-character `web/public/nexus-prompt.txt` was loaded into Joe's visible textarea from `/nexus-prompt.txt` and submitted using the normal Send button.

The rerun visibly progressed through:
- Phase 1 Architecture & Stack Decision: 2/2, verified.
- Phase 2 Backend Core: 4/4, verified.
- Phase 3 Backend Domain APIs: 4/4, verified.
- Phase 4 AI Agent Orchestration & Workflow Engine: 4/4, verified.
- Phase 5 Frontend Foundation: 4/4, verified.
- At the latest browser view, Phase 6 Frontend Feature Pages was running after 40 visible steps.

The rerun is still active; do not claim Phase 8 success until the visible Logs show Phase 8 tasks and a final run report.

## Constraints
No external deployment was attempted. Do not modify UI design. All Git changes must go to main only; do not add `web/public/nexus-prompt.txt` because it is intentionally untracked.

## Interruption observed during rerun
At 15:57 the API process that had served the rerun was no longer present and port 5002 was closed, while the browser retained a stale 45-step view. The API log ended during repeated LLM7/OpenAI/DuckAI/DeepSeek/Pollinations retries, with no application crash or OOM clue in the log/kernel output. API was restarted from the same dist and `/api/health` returned OK at 15:57:46. The retained UI run must not be counted as completed; a fresh chat and exact prompt submission are required after backend restart.

## Fresh rerun result after API restart
The exact `nexus-prompt.txt` was submitted through a new Joe chat after API health recovered. The run finished honestly with `NEXUS Phases: 0/8 executed and verified`; the failed phase was **Foundation & Architecture (tasks: 4/4)**. The API log records `AgentOrchestrator Node project_pipeline failed` followed by `Final verification_failed for project_pipeline`; no `approval_required` appears in this run. The generated files are present (models/auth/api/routes/websocket/frontend pages, 25+ files), so the remaining blocker is verification acceptance/phase accounting, not file generation. The browser initially showed stale/blank state because WebSocket clients were 0 during backend restart, but after reload it displayed the final honest failure.
