
# Execution Ownership Map - Joe Autonomous Infrastructure

This document defines the single source of truth for all system execution within the Joe platform.

## 🎯 Single Execution Authority
**Module**: `ExecutionEngine.ts`
**Location**: `api/src/kernel/ExecutionEngine.ts`

Only this module is permitted to directly call:
- `child_process.spawn()`
- `child_process.exec()`
- `node-pty.spawn()`

## 🛡️ Execution Firewall (Hard Lock)
**Module**: `ExecutionGuard.ts`
**Location**: `api/src/kernel/ExecutionGuard.ts`

**Mechanism**: Monkey-patches `child_process` at the entry point (`api/src/api/index.ts`).
- Detects calls not originating from `ExecutionEngine`.
- Throws Error: `[ExecutionGuard] Direct spawn blocked.`
- Logs event to console for audit.

## 🟢 Control Layer (No Execution)
The following modules have been stripped of execution logic and now act as controllers:
- `TerminalKernel.ts`: Manages sessions and routes input/output.
- `command-router.ts`: Routes commands to appropriate execution paths.

## 🔵 Migrated Tooling
All tools now route through `ExecutionGateway` or `ExecutionEngine`:
- `SystemTools.ts` (ShellExecute, Grep, LS, etc.)
- `GitTools.ts` (Commit, Push, Pull, etc.)
- `RepoSelfCodingTools.ts` (RepoRunCommand)
- `DeadCodeTool.ts` (Knip scans)
- `ErrorRecoveryTool.ts` (Wolverine self-healing)

## 🔵 System Services
- `DeployManager.ts`: Restarts and builds now use centralized execution.
- `deploy-helper.ts`: System bootstrap utility now aligned with engine.

---
**Status**: PHASE 1.7 COMPLETED - ARCHITECTURE LOCKED.
