# Codex Joe Handoff

This document is the compact source of truth for continuing Joe development in `yasoo2/xelitesolutions`.

## Mission

Joe is being transformed from a general AI tool runner into an orchestrator-driven multi-agent software engineering system. The long-term vision is a disciplined AI engineering company: planning, architecture, development, QA, repair, deployment, observability, and safety.

## Main conclusion from deep analysis

The core issue was not lack of tools. The core issues were:

- Multiple competing execution paths.
- Planner drifting toward execution.
- Weak phase orchestration.
- Treating `ok=true` as success instead of verifying completed phase status.
- No structured repair/self-fix loop.
- Risk of uncontrolled repeated attempts.
- Risk of wrong user/workspace context.
- Risk of future builders reintroducing old paths.

The fix is one canonical pipeline protected by tests.

## Canonical pipeline

```text
User request
→ ProjectPlannerTool
→ AgentLoopService orchestrator
→ PhaseExecutorTool
→ ToolService
→ QualityGate
→ RepairTicketService
→ SelfFixService
→ SelfFixExecutionService
→ rerun failed phase
→ continue if completed, otherwise stop
```

## Current confirmed architecture

### Server (Hetzner joe-server-1)
- **API**: Host OS via `systemd` (`joe-api.service`).
- **Nginx/Web/Mongo**: Docker containers.
- **Project Path**: `/root/xelitesolutions`.
- **Health Check**: Always use `/api/health`.

### ProjectPlannerTool

- Planner-only.
- Must not import/call `executeTool`.
- Must not auto-execute generated tasks.
- Must preserve planner-only/`autoExecuted: false` behavior.

### AgentLoopService

- Orchestrates planned phases.
- Runs phases sequentially through `phase_executor`.
- Applies quality gate.
- Attaches `repairTicket`, `selfFixPlan`, and `selfFixExecution` to pipeline output.
- Must stop on `partial`, `failed`, or `fatal_error` unless controlled self-fix succeeds.

A phase passes only when:

```ts
phaseResult.ok === true && phaseResult.output.status === 'completed'
```

### PhaseExecutorTool

- Executes one phase.
- Runs task tools through `ToolService`.
- Uses trusted `sessionId`, `workspaceId`, and `userId`.
- Reports `completed`, `partial`, `failed`, or `fatal_error`.
- Is not the orchestrator.

### ToolService

- Central execution/policy gateway.
- Do not bypass it for shell, file, browser, deploy, Docker, GitHub, or workspace operations.
- Important fix applied: ToolService aliasing/path normalization must pass `contextWorkspaceId` into `workspaceService.getActiveRoot(contextWorkspaceId)` when resolving workspace-relative paths. This prevents tools such as `file_edit`, `read_file`, `write_file`, and codebase memorization from resolving paths against the wrong `api` folder instead of the active project workspace.

### RepairTicketService

- Diagnostic only.
- Produces structured `phase_repair_ticket` objects.
- Does not repair.

### SelfFixService

- Decision brain only.
- Produces `self_fix_plan`.
- Current strategies:
  - `missing_file_fix`
  - `dependency_fix`
  - `build_fix`
  - `code_fix`
  - `permission_stop`
  - `manual_review`
- Detects missing files such as `MISSING_FILE: required_file.txt` and suggests `write_file`.
- Extracts TypeScript/build context from errors such as:
  - `src/App.tsx(14,7): error TS2322: ...`
  - `src/App.tsx(2,10): error TS2304: Cannot find name 'answer'.`
  - `src/App.tsx:14:7 ...`
- Has targeted repairs for:
  - `TS2322` string-to-number assignment cases.
  - `TS2322` number-to-string assignment cases.
  - `TS2304` simple missing-name return cases.

Expected `buildContext`:

```json
{
  "file": "src/App.tsx",
  "line": 14,
  "column": 7,
  "code": "TS2322",
  "message": "..."
}
```

### SelfFixExecutionService

- Executes exactly one repair attempt.
- Uses `ToolService` only.
- Requires trusted `sessionId`, `workspaceId`, and `userId`.
- Reruns the same failed phase.
- Succeeds only if rerun reaches `status === "completed"`.
- Stops on second failure.

Allowed self-fix tools:

```text
write_file
file_edit
file_edit_advanced
ai_write_file
shell_execute
npm_manager
```

Unsafe tools must be rejected by allowlist.

## Important bugs and decisions

### Misleading package scripts

`api/package.json` once had misleading duplicate scripts such as `check:self-fix-patch = eslint`, `patch:self-fix = eslint --fix`, and `guard:architecture = knip`. These were corrected. Do not reintroduce misleading scripts. `guard:package-scripts` now protects against duplicate or misleading self-fix script mappings.

### Builder reports can be unreliable

Some builder reports included invalid commit hashes or overstated success. A report is not accepted unless the commit hash exists on GitHub and the changed files are verified on `main`.

### Monkey patch test issue

The first success test monkey-patched `SelfFixService.plan`. That proved the execution path could work but did not prove native intelligence. The monkey patch was removed. `SelfFixService` now natively detects missing-file errors and suggests `write_file`.

### Full engineer flow limitation

`test:joe:engineer-flow` proves the deterministic E2E engineering infrastructure path: planner path, orchestrator, phase execution, verification, repair ticket, self-fix plan, self-fix execution, rerun, and phase continuation.

Important limitation: the current test uses a controlled mocked LLM plan for determinism. It proves Joe's infrastructure, but it does not yet prove unrestricted real-world project planning for every possible project request. A future test should reduce mocking and verify real planner behavior separately.

### Failure-stop and success-path are different

Both must stay tested:

- Failure-stop: failure → repair attempt → rerun still fails → stop safely.
- Success-path: initial failure → repair ticket → plan → repair execution → rerun succeeds → pipeline ok.

### ToolService workspace path-resolution bug

Root cause: ToolService aliasing normalized relative file paths before workspace execution context was active, so `workspaceService.getActiveRoot()` could fall back to the `api` folder. This caused self-fix TypeScript/file repair flows to fail with `File not found` even when the file existed in the project workspace.

Fix applied in commit `7c57b43b4f7c90c2ac4e75529e90e1524a4c2ab5`:

```ts
workspaceService.getActiveRoot(contextWorkspaceId)
```

instead of:

```ts
workspaceService.getActiveRoot()
```

This was intentionally a narrow patch. Do not rewrite ToolService or weaken path safety while modifying this area.

## Current important files

Read before editing:

```text
AGENTS.md
docs/CODEX_JOE_HANDOFF.md
api/package.json
api/src/modules/services/AgentLoopService.ts
api/src/modules/tools/definitions/PhaseExecutorTool.ts
api/src/modules/services/RepairTicketService.ts
api/src/modules/services/SelfFixService.ts
api/src/modules/services/SelfFixExecutionService.ts
api/src/modules/services/ToolService.ts
api/src/tests/architecture/guard_architecture.ts
api/src/tests/architecture/guard_package_scripts.ts
api/src/tests/manual/verify_joe_full_engineer_flow.ts
api/src/tests/manual/verify_self_healing_loop.ts
api/src/tests/manual/verify_self_healing_success_loop.ts
api/src/tests/manual/verify_self_fix_build_context.ts
api/src/tests/manual/verify_self_fix_execution_safety.ts
api/src/tests/manual/verify_self_fix_typescript_repair.ts
api/src/tests/manual/verify_self_fix_typescript_missing_name.ts
api/src/tests/manual/verify_self_fix_typescript_number_to_string.ts
```

## Required tests

After related changes run:

```bash
cd api
npm run guard:architecture
npm run guard:package-scripts
npm run test:joe:engineer-flow
npm run test:self-fix:build-context
npm run test:self-fix:execution-safety
npm run test:self-fix:typescript-repair
npm run test:self-fix:typescript-missing-name
npm run test:self-fix:typescript-number-to-string
npm run test:self-healing:failure
npm run test:self-healing:success
```

## Current completed state

- Planner-only `ProjectPlannerTool`.
- `PhaseExecutorTool` as controlled execution bridge.
- `AgentLoopService` phase orchestration.
- Quality gate based on `status === completed`.
- `RepairTicketService` diagnostic output.
- `SelfFixService` decision plans.
- Native missing-file repair strategy.
- TypeScript/build `buildContext` extraction.
- Targeted TypeScript repair for TS2322 string-to-number assignment.
- Targeted TypeScript repair for TS2322 number-to-string assignment.
- Targeted TypeScript repair for TS2304 simple missing-name return.
- `SelfFixExecutionService` one-attempt execution.
- Self-fix tool allowlist.
- ToolService workspace path-resolution fixed using `contextWorkspaceId`.
- Package scripts guard.
- Full engineer flow deterministic E2E test.
- Failure-stop test.
- Native success-path test.
- BuildContext extraction test.
- Execution safety test.
- TypeScript string-to-number repair test.
- TypeScript missing-name test.
- TypeScript number-to-string test.
- Package scripts for the tests.
- `AGENTS.md` added.

## Still not complete

- TypeScript/build-error repair is improving but should continue being hardened across more TypeScript error shapes.
- `test:joe:engineer-flow` is deterministic and uses a mocked LLM plan; real planner behavior still needs separate verification.
- `ai_write_file` behavior must be verified before relying on broad `build_fix` execution.
- Browser automation still needs a canonical path later.
- Deployment/production repair must remain approval-gated.
- Observability UI for repair tickets/plans/executions should be improved later.

## Next best step

Continue hardening targeted TypeScript/build repair execution safely, then add a less-mocked E2E planner test.

Recommended plan:

1. Add more TypeScript repair fixtures for common TS errors.
2. Ensure `SelfFixService` extracts correct `buildContext`.
3. Ensure repair only patches the targeted file.
4. Rerun the failed phase.
5. Pass only if phase becomes `completed`.
6. Do not use broad rewrites.
7. Do not use monkey patch unless clearly labeled as a unit test.
8. Keep ToolService path resolution narrow and context-aware.
9. Add a later E2E test that reduces LLM mocking and validates planner output quality separately.

## Absolute warnings

Do not:

- Reintroduce planner execution.
- Bypass `ToolService`.
- Weaken self-fix safety.
- Add deploy/delete/secret/GitHub push tools to self-fix without approval.
- Trust user-provided userId/workspaceId over execution context.
- Delete permanent tests after running them.
- Claim production readiness based only on architecture guard or mocked E2E.
- Treat invalid commit hashes as proof.
- Add unsafe tools to self-fix allowlist without review.
- Revert the ToolService `contextWorkspaceId` path-resolution fix.

## Codex / Antigravity startup prompt

Use this prompt for Codex or Antigravity:

```text
You are continuing Joe development in repo yasoo2/xelitesolutions.

Before editing anything, read AGENTS.md and docs/CODEX_JOE_HANDOFF.md.

Then inspect AgentLoopService, PhaseExecutorTool, RepairTicketService, SelfFixService, SelfFixExecutionService, ToolService, guard_architecture, guard_package_scripts, verify_joe_full_engineer_flow, and api/package.json.

Current goal: continue improving Joe controlled self-healing and E2E engineering reliability. Next target: harden TypeScript/build-error repair using buildContext and add a future less-mocked planner/E2E verification.

Rules:
- Do not make ProjectPlannerTool execute tools.
- Do not bypass ToolService.
- Do not weaken safety.
- One automatic repair attempt only.
- Rerun the failed phase after repair.
- Stop if rerun does not complete.
- Keep ToolService path resolution context-aware using contextWorkspaceId.
- Do not claim universal autonomy from mocked E2E tests alone.
- Add/update permanent tests.
- **Hetzner Architecture**: API is on host via systemd; do not look for a joe_api container or use PM2 for restart.

After changes run:
cd api
npm run guard:architecture
npm run guard:package-scripts
npm run test:joe:engineer-flow
npm run test:self-fix:build-context
npm run test:self-fix:execution-safety
npm run test:self-fix:typescript-repair
npm run test:self-fix:typescript-missing-name
npm run test:self-fix:typescript-number-to-string
npm run test:self-healing:failure
npm run test:self-healing:success

Report diff summary, test output, files changed, and a real GitHub commit hash.
```
