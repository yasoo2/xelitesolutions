# Muse wiring-audit slice — memory family on exact f40 (read-only)

AGENT=MUSE
SLICE_ID=CYCLE-MEM-WIRING-F40-001
STATUS=EVIDENCE_READY
DATE=2026-10-04
SOURCE_REV=f40f6100e8083bfefeef54eb7812c3690b068048 (NVIDIA main, committed bytes via git show/grep; live dirty lane untouched)
MUSE_HEAD=2195d7ea0a1c97d74b5efb936f7428e60c0c37cd
DETAIL=tmp/wiring-memory-f40/FINDINGS.md

## Scope (bounded, non-overlapping)

Memory-family wiring on committed f40 only: tool definitions, registry,
planner catalogue/picker, ToolService dispatch, vector-store backends,
internal lesson-memory services. Supports CRITICAL-JOE-DEEP-CAPABILITY-
WIRING-AUDIT (registry reconciliation + orphan/duplication + contract
audit) and resolves the open codebase_navigator imported-not-instantiated
question onto exact bytes. No source edits, no runtime control, no overlap
with NVIDIA CLI/schema/verification lane or Codex browser/Arabic lane.

## Method

Read-only `git show f40f6100:<path>` + `git grep` from D:\Joe\xelitesolutions.
No worktree writes; no dependency on dirty bytes.

## Inventory (f40 committed)

- Tool defs: recall_memory + memorize_codebase (MemoryTool.ts, registered
  via registry.ts:262 spread) + codebase_navigator (CodebaseNavigatorTool.ts,
  registry.ts:16 IMPORT-ONLY, never instantiated).
- Stores: services/vectorDb.ts (TF-IDF, zero-dep, free) backs the registered
  pair; core/memory/VectorMemory.ts (OpenAI text-embedding-3-small on key,
  local fallback) backs ONLY the unregistered navigator.
- Internal: LongTermMemory, repair-memory, learn — consumed by AgentLoop,
  SelfFixService, SelfFixExecutionService, AgentOrchestrator.

## Findings

- M1 IMPLEMENTED_NOT_REGISTERED: codebase_navigator (f40). Full index/search
  implementation, import-only in registry. Pins C238 onto exact bytes.
- M2 SHADOW_DUPLICATE: ToolService :571-607 inline recall/memoriz handlers
  return BEFORE registry lookup (:675) — the registered execute() bodies are
  dead on the canonical path. Copies already drifted (existsSync + empty-query
  guards only in registry copy). One owner per name required.
- M3 TWO STORES / PAID GATE: paid-on-key embeddings exist ONLY behind the
  orphaned navigator → no live paid path today. Any revival must be
  security-gated (free-first/fail-closed) per the BATCH011 policy. No paid
  call made by this audit.
- M4 REGISTERED_NOT_PLANNER_VISIBLE: both memory tools have ZERO refs in
  plan-tools/tool-picker. Autonomous Joe cannot select its own memory;
  memorize runs only via env-gated startup hook, recall only via direct calls.
- M5 POSITIVE: startup auto-index defaults OFF (explicit opt-in), bounded.
- M6 SECURITY NOTE: navigator index takes absolute targetDir with NO
  workspace containment; containment + owner binding precondition any revival.
- M7 POSITIVE: LongTermMemory/repair-memory/learn genuinely wired into the
  self-fix/orchestration loop — internal by design, not orphans.

## Counts for the wiring matrix (this slice only, f40)

MEM_TOOL_DEFS=3
MEM_REGISTERED=2
MEM_PLANNER_VISIBLE=0
PARTIALLY_WIRED=2
ORPHANED=1 (+1 effective: core VectorMemory via sole orphaned consumer)
IMPLEMENTED_NOT_REGISTERED=1
REGISTERED_NOT_PLANNER_VISIBLE=2
SHADOW_DUPLICATES=1 pair
INTERNAL_WIRED=4
FULLY_WIRED=0 (planner-visible + executable bar)
UNKNOWN=0 on static wiring; runtime recall/memoriz behavior not executed here

## What was NOT claimed

No runtime execution, no Real Joe UAT, no all-tools count, no integration
authorization, no navigator revival. Dirty-lane state deliberately not used.
Findings await second-agent review per audit cross-review rule.
