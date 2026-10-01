# Muse deep-wiring audit checkpoint 5 — 2026-10-01 (MUSE_HEAD=1272d979)

Command: CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT.
Scope: zero-drift re-verification of checkpoint-004 orphans in BOTH current
trees + one new structural datum. No source changed. Main inspected
read-only (e8fd9589, 14 dirty files preserved, untouched).

## Fresh static evidence (today, exact grep)

- DEF_FILES_MAIN=94 (*.ts in main
  api/src/modules/tools/definitions/) vs runtime REGISTERED=163. Structural
  datum: the registry's 163 entries cannot come from definitions/ files alone
  (multi-tool modules and/or additional registration sources exist). The
  wiring matrix must count DEFINITIONS (tool-name declarations) separately
  from FILES. Next checkpoint: enumerate per-file `name:` declarations in
  both trees.
- bulk_file_generator: IDENTICAL both trees — toolCatalog entry
  (main:262, mine:327), BulkFileGeneratorTool.ts:6 `name`, PhaseExecutor
  allowlist refs (main:110+252, mine:112+254), registry.ts:18 IMPORT but
  zero createTool. IMPORTED_NOT_REGISTERED zero-drift reconfirmed.
  Do NOT register (uncontained absolute-path writes). Audit only.
- generate_image: IDENTICAL both trees — registry.ts:15 import, zero
  createTool; ToolService.ts:552 alias `image_generate -> generate_image`
  points at the unregistered name (broken alias, both trees). Single
  IMPLEMENTED_NOT_REGISTERED, no duplicate. Zero drift vs 004-C3.
- generate_image module top-imports 'openai' (004-C3 note stands):
  registration needs repair, not a one-line createTool.

## Counts (Muse position, unchanged from 004, re-verified)

ORPHANED=2 (bulk_file_generator, generate_image); DUPLICATE=0;
REGISTERED committed 163 both trees; DEF_FILES_MAIN=94 (new datum);
EXECUTABLE / FULLY_WIRED / PARTIALLY_WIRED stay UNKNOWN (firewall/executor
tracing still pending). Shared SUMMARY/REGISTER C1–C6 corrections from 004
still await Codex reconciliation — no new shared-output review this cycle.

## Still UNKNOWN (explicit)

Per-file tool-name declarations, per-tool EXECUTABLE (firewall allow/deny),
FULLY/PARTIALLY_WIRED splits, dormant-priority 16, per-tool
EXECUTABLE_NOT_VERIFIABLE survey, TEST_ONLY separation. Next checkpoints.
