# MUSE wiring discovery checkpoint 050 (2026-10-01, HEAD d5d314a4)

Scope: bounded static corroboration while real-UI run33 executed. No source edits.

## 1. bulk_file_generator: IMPLEMENTED_NOT_REGISTERED corroborated (Muse tree)

- `api/src/modules/tools/registry.ts:18` imports `BulkFileGeneratorTool`.
- Zero `safeNew('bulk_file_generator', ...)` entries in registry.ts (71 safeNew total).
- Name also present in `api/src/core/orchestrator/toolCatalog.ts` and referenced in
  `PhaseExecutorTool.ts`; implementation at `api/src/modules/tools/definitions/BulkFileGeneratorTool.ts`.
- Matches Codex's main-tree finding. Disposition: IMPLEMENTED_NOT_REGISTERED.
- Do NOT register: `BulkFileGeneratorTool.ts:61` resolves user-supplied absolute paths
  directly (`path.isAbsolute(file.path) ? file.path : ...`) and writes via
  `fs.writeFileSync` at :71. Workspace-containment review required before any
  registration. Security-flagged, preserved as-is per audit rules.

## 2. Dead scheduling code flagged (not deleted)

- `PhaseExecutorTool.groupTasksForParallelExecution` (line 1231): 0 callers in
  `api/src` (repo-wide search). Live path is `buildExecutionGroups` (called :2127).
- `detectParallelGroups`: dead `visited` set (line 1150, never read).
- Disposition: candidate for JOE-ORPHAN-AND-LEGACY-REGISTER; deletion requires a later
  reviewed decision. Flagged in Muse's PARALLEL-VERIFICATION-LEDGER-001 review (C6).

## 3. Census stability

- registry.ts safeNew count = 71 (same family as run32 live "Registered 163 tools
  (71 revived)"; remaining registrations via other paths — unchanged shape).
- api/src + web/src drift f85966bb..d5d314a4 = ZERO (docs/tmp only) — running :5101
  bundle matches HEAD for run33.

## Evidence

- Static reads at d5d314a4; live :5101 log line "[ToolRegistry] 21 tool(s) declared
  no permissions" preserved in tmp/uat-critical-ui-run33/api-5101.err (untracked).
- No tests run for this checkpoint (read-only corroboration); no counts changed.
