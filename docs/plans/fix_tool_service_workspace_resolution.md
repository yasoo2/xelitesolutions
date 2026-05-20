# Implementation Plan: Fix ToolService Workspace Path Resolution

## 1. Exact Root Cause
In `ToolService.ts`, the "aliasing and normalization" layer (lines 206-390) converts relative paths (like `src/App.tsx`) into absolute paths before tool execution. This layer calls `workspaceService.getActiveRoot()` to find the base directory for resolution.

However, `getActiveRoot()` relies on `workspaceAsyncContext` (AsyncLocalStorage) to identify the current workspace. Because the aliasing layer runs **before** the tool's execution context is established via `runWithWorkspace`, the async store is empty. Consequently, `getActiveRoot()` falls back to `process.cwd()` (the `api` directory), causing relative paths to resolve incorrectly (e.g., to `api/src/App.tsx` instead of the actual workspace folder).

## 2. Current Broken Path Resolution Flow
1. `AgentLoopService` calls `executeTool` with `context.workspaceId = "my-ws"` and `input.filename = "src/App.tsx"`.
2. `ToolService.executeTool` enters the aliasing block for `file_edit`.
3. It calls `workspaceService.getActiveRoot()` (no arguments).
4. `WorkspaceService` finds no active context in `AsyncLocalStorage`.
5. It returns `C:\Users\home\xelitesolutions-2\api`.
6. `ToolService` resolves `"src/App.tsx"` relative to the `api` folder -> `C:\...\api\src\App.tsx`.
7. The `file_edit` tool receives this incorrect absolute path.
8. `fs.existsSync` fails because the file actually resides in `data/projects/my-ws/src/App.tsx`.
9. Tool returns `ok: false, error: "File not found"`.

## 3. Proposed Corrected Path Resolution Flow
1. `ToolService.executeTool` enters the aliasing block.
2. It identifies `contextWorkspaceId` (already resolved at line 141 from the `context` or `input`).
3. It calls `workspaceService.getActiveRoot(contextWorkspaceId)` (passing the explicit ID).
4. `WorkspaceService` uses the ID to look up the correct root path in its internal map.
5. It returns `C:\...\api\data\projects\my-ws`.
6. `ToolService` resolves `"src/App.tsx"` relative to the CORRECT root -> `C:\...\api\data\projects\my-ws\src\App.tsx`.
7. The tool receives the correct absolute path and succeeds.

## 4. Affected Functions in ToolService.ts
- `executeTool`: Specifically the aliasing logic for:
    - `write_file` (Line 244)
    - `file_edit` (Line 273)
    - `read_file` (Line 284)
    - `inspect_directory` (Line 367)

## 5. Normal Workspace Execution Impact
- **No Regression Risk**: This change simply provides an explicit ID to a function that already accepts it.
- If `contextWorkspaceId` is undefined, the behavior remains identical to the current state (falling back to the system root).
- It ensures that even during "pre-execution" normalization, the intended workspace is respected.

## 6. Path Safety Impact
- **Safety is Maintained**: Path safety checks (Line 258 and 263) are performed **after** resolution.
- By resolving against the correct root, we prevent accidental "jailbreaking" into the `api` source directory when an agent provides a relative path intended for a workspace.

## 7. Interaction with WorkspaceService / EXTERNAL_PROJECTS_DIR
- `WorkspaceService.getActiveRoot(id)` honors the `EXTERNAL_PROJECTS_DIR` environment variable.
- This fix ensures the system correctly navigates to the external projects directory during both manual tests and production autonomous cycles.

## 8. Affected Tools
- **`file_edit`, `read_file`, `write_file`, `inspect_directory`**: These will now correctly find files within the targeted workspace.
- **`shell_execute`**: While not using `getActiveRoot` in its aliasing layer currently, it will benefit if child processes are spawned relative to the correctly resolved workspace root.
- **`ai_write_file`**: This high-level tool will now work reliably as the underlying file operations it triggers will use correct paths.

## 9. Verification Plan
After the change, run the following tests in order:
1. `npm run guard:architecture` (Ensure no structural regressions)
2. `npm run test:self-fix:build-context` (Verify build error parsing)
3. `npm run test:self-fix:execution-safety` (Verify tool allowlist)
4. `npm run test:self-healing:failure` (Verify failure-stop path)
5. `npm run test:self-healing:success` (Verify success-repair path)
6. `node -r ts-node/register src/tests/manual/verify_self_fix_typescript_repair.ts` (Verify the new TypeScript repair logic)

## 10. New Permanent Tests
- `api/src/tests/manual/verify_self_fix_typescript_repair.ts`: This file will be committed as a permanent part of the test suite to ensure targeted TypeScript repairs never regress.
