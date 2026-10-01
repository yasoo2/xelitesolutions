# Muse deep-wiring audit checkpoint 3 — 2026-10-01 (MUSE_HEAD=472b5d10)

Command: CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (TWO_AGENT_CONTINUITY).
Scope this checkpoint: zero-drift re-verification + fresh focused PASS on the
sanitizer/gate contract (supports CRITICAL-REAL-JOE-UI-001 fix evidence).
Method: read-only source inspection + 2 focused jest suites in Muse tree.
No source changed (audit/review-only cycle).

## Runtime-proven results (Muse tree @ 472b5d10)
- bulk_file_generator still IMPORTED_NOT_REGISTERED (zero drift):
  imported registry.ts:18 (sole reference in that file), defined
  BulkFileGeneratorTool.ts:5-6, catalogued toolCatalog.ts:327,
  PhaseExecutor-allowlisted (:112, :254), but NO register call.
  Do NOT register (known uncontained absolute-path writes). Audit only.
- smoke-verification-rewrite.test.ts: 5/5 PASS (27.8s, fresh this cycle).
  Sanitizer smoke->observation rewrite behavior holds at Muse HEAD.
- engineering-checkpoint.test.ts: 12/12 PASS (fresh this cycle). Baseline
  for the pending PHASE-CHECKPOINT-TERMINAL-001 scope; the legacy
  checkpointPhase call without outer `ok` (:264-272) is recorded as a
  binding review condition (see terminal review §4.2), not weakened.

## Fix-presence cross-check (UI-001, read-only both trees)
- Smoke->observation rewrite present in main plan-tools.ts (:945/:960)
  AND Muse plan-tools.ts (:926/:936). smoke-verification-rewrite.test.ts
  exists in both trees (untracked in main worktree = present on disk,
  NOT committed to main history — "integrated" means working tree, not
  a main commit; precision for handoff integrity).
- Runtimes: :5002 OK (uptime ~11.8h, version=no-commit-file = unknown
  provenance), :5000 OK (~19h, same), :5101 DOWN. Ollama up, 3 models;
  no api/.env in Muse tree. Fresh Real-Joe-UI retest still BLOCKED (env).

## Still UNKNOWN (explicit)
EXECUTABLE_TOOLS, FULLY_WIRED, PARTIALLY_WIRED, ORPHANED, DUPLICATE,
IMPLEMENTED_NOT_REGISTERED (beyond bulk), CONTRACT_MISMATCHES — need
registry->ToolService->firewall->executor tracing. Next checkpoints.
Shared team outputs (MATRIX/ARCHITECTURE/REGISTER/SUMMARY/BACKLOG) do
not exist yet; Muse fragments stay in-commit for Codex reconciliation.

## Env note for future cycles
Sandbox user cannot realpath C:\Users\home\AppData\Local\Temp (EPERM):
run jest with $env:TEMP/TMP redirected into the workspace plus an
explicit --cacheDirectory. Both suites above used that workaround.
