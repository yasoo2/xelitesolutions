# AGENTS.md — Permanent Joe Development Rules

This file is the first source of truth for any AI coding agent, Codex session, Builder, Antigravity session, or human developer working on the Joe autonomous software engineering system.

Repository: `yasoo2/xelitesolutions`

## Server Architecture (Hetzner joe-server-1)

- **API**: Runs on Host OS via `systemd` (`joe-api.service`). Listening on `8080`.
- **Nginx/Web/Mongo**: Run in Docker containers.
- **Nginx Proxy**: Routes `/api/*` to `host.docker.internal:8080`.
- **Project Path**: `/root/xelitesolutions`.
- **Health Check**: Always use `/api/health`.

## Mission

Joe is an autonomous, multi-agent software engineering platform. The target architecture is not a simple chat assistant. Joe must behave like a disciplined engineering organization:

- Product/PM thinking
- Architecture planning
- Controlled phase execution
- Quality gates
- Repair diagnosis
- One-attempt self-fix
- Verification and stop conditions
- Strong workspace/user isolation
- No unsafe autonomous destructive actions

## Canonical execution pipeline

The approved pipeline is:

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

Do not introduce competing execution paths unless they are explicitly documented and guarded.

## Non-negotiable architecture rules

- `ProjectPlannerTool` is planner-only. It must never import or call `executeTool` and must never auto-execute generated tasks.
- `AgentLoopService` is the orchestrator. Do not turn it back into an uncontrolled random LLM tool loop.
- `PhaseExecutorTool` is the bridge between plans and execution. It must execute one phase at a time through `ToolService`.
- `ToolService` is the policy and execution gateway. Do not bypass it for shell, file, browser, deploy, Docker, GitHub, or workspace actions.
- **Restart Rule**: Use `systemctl restart joe-api.service` for API updates. Never use `docker restart joe_api` or `pm2`.
- **Path Resolution**: Workspace-relative paths must be resolved with `workspaceService.getActiveRoot(contextWorkspaceId)`.
6. A phase passes only when `phaseResult.ok === true` and `phaseResult.output.status === "completed"`.
7. `partial`, `failed`, and `fatal_error` must stop progression unless controlled self-fix succeeds.
8. `RepairTicketService` is diagnostic. It creates structured repair tickets; it does not repair.
9. `SelfFixService` is the decision brain. It creates a `self_fix_plan`; it does not execute directly.
10. `SelfFixExecutionService` may execute only one repair attempt, through `ToolService`, then rerun the same failed phase.
11. If the rerun does not return `status === "completed"`, Joe must stop and return the ticket/plan/execution result.
12. No deploy, delete, secret, credential, production push, server mutation, or dangerous operation may be added to self-fix without explicit approval and guardrails.
13. Do not weaken safety checks to make a test pass.
14. Do not claim success without a real commit hash and verifiable files on GitHub `main`.
15. Avoid large full-file rewrites of critical files such as `AgentLoopService.ts` or `ToolService.ts`; use surgical patches when possible.
16. Do not revert the ToolService workspace path-resolution fix. Workspace-relative paths must be resolved with `workspaceService.getActiveRoot(contextWorkspaceId)` where applicable.

## Current self-healing rules

Self-healing is intentionally strict:

- One attempt only.
- Tool allowlist only.
- Trusted `sessionId/workspaceId/userId` required.
- Repair tool must run through `ToolService`.
- Same failed phase must be rerun after repair.
- Rerun must produce `status === "completed"`.
- Second failure means stop.

Allowed self-fix repair tools currently include:

```text
write_file
file_edit
file_edit_advanced
ai_write_file
shell_execute
npm_manager
```

Unsafe tools must be rejected by `SelfFixExecutionService`.

## ToolService workspace path-resolution rule

ToolService path aliasing must respect the explicit workspace context.

When resolving workspace-relative paths in the aliasing/path normalization layer, use:

```ts
workspaceService.getActiveRoot(contextWorkspaceId)
```

Do not fall back to:

```ts
workspaceService.getActiveRoot()
```

when `contextWorkspaceId` is already available.

This prevents tools like `file_edit`, `read_file`, `write_file`, `ai_write_file`, and codebase-memory flows from accidentally resolving paths against the `api` folder instead of the active project workspace.

## Full engineer flow verification

`test:joe:engineer-flow` is the current permanent E2E infrastructure verification. It proves the canonical pipeline can plan, orchestrate, execute, verify, self-heal, rerun a failed phase, and continue to the next phase.

Important limitation: this test currently uses a controlled mocked LLM plan to make the E2E scenario deterministic. It proves Joe's engineering infrastructure path, not unrestricted real-world project planning for every possible request. Do not claim universal production-grade autonomy from this test alone.

## Required tests after related changes

Run these after any architecture, planner, phase execution, repair, self-fix, ToolService, package-script, or workspace-path change:

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

If any test is missing or broken, fix the test or the implementation. Do not delete permanent verification tests after using them.

## Current development direction

The next priority is improving build/TypeScript repair safely and gradually increasing E2E realism:

- `SelfFixService` already extracts `buildContext` from TypeScript/build errors.
- TypeScript repair now has permanent verification paths for TS2322 string-to-number, TS2322 number-to-string, and TS2304 missing-name cases.
- `test:joe:engineer-flow` verifies the deterministic full pipeline.
- Future fixes should use `buildContext.file`, `line`, `column`, `code`, and `message` to make narrow repairs.
- The repair must not rewrite unrelated files.
- After repair, rerun only the failed phase.
- Stop if the rerun does not complete.
- Continue hardening across more TypeScript/build error shapes.
- Add a later E2E test with less mocking to test real planner behavior separately.

## Builder/Codex/Antigravity completion requirements

When finishing a task, provide:

1. Real git diff summary.
2. Exact tests run and output summary.
3. Real commit hash that exists on GitHub.
4. Any files changed.
5. Any known risk or limitation.

If a commit hash cannot be verified on GitHub, it is not accepted as proof.
