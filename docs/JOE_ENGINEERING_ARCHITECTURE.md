# Joe Engineering Architecture Guardrails

This document defines the protected execution architecture for Joe. Future builders must follow these rules to avoid reintroducing unsafe or conflicting execution paths.

## Canonical Execution Path

The only approved project-building flow is:

```text
User Request
→ Request Analysis
→ ProjectPlannerTool (plan only)
→ PhaseExecutorTool (one phase at a time)
→ ToolService (policy, ownership, workspace, approval)
→ Quality Gate / Self-Fix Loop
```

## Non-Negotiable Rules

1. `ProjectPlannerTool` must never execute generated tasks.
2. `ProjectPlannerTool` must not import or call `executeTool`.
3. `ProjectPlannerTool` output must include `autoExecuted: false`.
4. `PhaseExecutorTool` is the official phase execution bridge.
5. Every tool call from agent/phase execution must pass `userId`, `workspaceId`, and `sessionId` through the trusted context object.
6. Do not rely on `input.userId` as the security source of truth.
7. Any tool that can execute or call other tools must declare execution permission/side effects.
8. Browser automation should converge on `BrowserRunTool`. Legacy browser tools must not become new canonical paths.
9. New destructive or deployment tools must be routed through `ToolService` risk classification and approval gates.
10. Do not add a new planner/executor that bypasses this path.

## Deprecated / Unsafe Patterns

Avoid these patterns:

```text
ProjectPlannerTool → executeTool(...)
AgentLoop → arbitrary tool execution without userId/workspaceId context
BrowserActionTool / BrowserVisionTool as independent canonical browser paths
Direct shell/Docker/deploy execution without ToolService policy
Absolute paths outside workspace roots
```

## Builder Checklist

Before merging changes touching agent execution, planning, tools, browser automation, or DevOps:

```text
npm run guard:architecture
```

The guard must pass. If it fails, fix the architecture instead of weakening the guard.

## Why This Exists

Joe has many powerful tools. The problem is not a lack of features; the risk is multiple execution paths competing with each other. This guardrail keeps Joe operating like an engineering organization:

```text
Plan → Execute controlled phase → Validate → Fix → Continue
```

not like an uncontrolled LLM calling random tools.
