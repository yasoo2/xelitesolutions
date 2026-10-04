# Memory-family wiring slice — exact NVIDIA f40 bytes (read-only audit)

EXACT_SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048 (NVIDIA main, committed bytes via git show/grep; live dirty lane untouched)
AUDIT_DATE=2026-10-04
AGENT=MUSE (independent audit lane; implementation owner NVIDIA — NO source edits)
SCOPE=L1 definitions → L2 registration → L3 planner/picker/executor/API refs + store backends, static only
METHOD=read-only `git show f40f6100:<path>` + `git grep` from D:\Joe\xelitesolutions

## L1 — Implemented (3 tool defs + 4 memory modules)

| File | Export | Tool name / role |
|---|---|---|
| definitions/MemoryTool.ts | MemoryTools[0] | recall_memory |
| definitions/MemoryTool.ts | MemoryTools[1] | memorize_codebase |
| definitions/CodebaseNavigatorTool.ts | CodebaseNavigatorTool | codebase_navigator |
| modules/services/vectorDb.ts | VectorDbService | TF-IDF store (backs recall/memoriz) |
| core/memory/VectorMemory.ts | VectorMemory | OpenAI/local-embedding store (backs navigator) |
| core/memory/long-term-memory.ts | LongTermMemory | profile/lesson service |
| core/memory/repair-memory.ts + learn.ts | repairMemory / extractProfileLearnings | self-fix lesson store + helpers |

## L2 — Registered (2 of 3)

- recall_memory + memorize_codebase: registry.ts:262 via `...MemoryTools` spread.
- codebase_navigator: registry.ts:16 IMPORT-ONLY. Zero instantiation/registration
  refs in registry.ts. IMPLEMENTED_NOT_REGISTERED (pins the C238 main
  observation onto exact f40 bytes).

## L3 — Planner / executor / API refs

- plan-tools.ts + tool-picker.ts: ZERO matches for memory/memoriz/navigator
  (case-insensitive). Neither registered memory tool is planner-visible:
  no catalogue purpose, no keyword, no PRIORITY slot.
  REGISTERED_NOT_PLANNER_VISIBLE = 2.
- memorize_codebase internal consumer: api/src/api/index.ts:150, inside
  `ENABLE_STARTUP_AUTO_INDEXING === 'true'` gate (default OFF). Env-gated,
  honest opt-in.
- recall_memory prod callers: NONE found outside ToolService dispatch
  (only manual test verify_tool_registry_audit.ts:111-114 pins it).
- tools_encyclopedia.md:20 documents codebase_navigator as if available —
  doc/runtime mismatch (tool unregistered).
- ToolService.ts:198 classifies codebase_navigator risk 'low'; :562 includes
  it in browser-session injection. Two execution-layer carve-outs for a tool
  that can never arrive (unknown_tool at lookup). Dangling, harmless today.

## Findings

- M1 IMPLEMENTED_NOT_REGISTERED (f40): codebase_navigator. Full implementation
  (index/search over VectorMemory, chunked, 100KB skip), import-only in
  registry. Do NOT blindly register: see M3 + M6.
- M2 SHADOW_DUPLICATE (f40): ToolService.ts:571-607 inline recall_memory /
  memorize_codebase handlers `return` BEFORE the registry lookup at :675, so
  on the canonical executeTool path the MemoryTool.ts execute() bodies are
  dead code. Same free TF-IDF backend, but the copies already drifted: the
  registry memorize has an existsSync honest-error guard the inline copy
  lacks; the registry recall has an empty-query guard the inline copy lacks
  (inline passes undefined query into vectorDb.search). One implementation
  must own each name; the other must delegate or go. NVIDIA-owned.
- M3 TWO VECTOR STORES, one paid-capable (f40): services/vectorDb.ts is
  TF-IDF, zero-dependency, FREE. core/memory/VectorMemory.ts uses OpenAI
  text-embedding-3-small whenever OPENAI_API_KEY exists (local hash fallback
  otherwise). Its SOLE prod consumer is the orphaned navigator, so NO live
  paid path exists today — but registering the navigator as-is would open a
  paid-on-key path with no free-first/fail-closed gate. Any revival must be
  security-gated exactly like the BATCH011 creative ruling. No paid call was
  made or is claimed by this audit.
- M4 REGISTERED_NOT_PLANNER_VISIBLE (f40): recall_memory + memorize_codebase.
  Autonomous Joe can never select its own memory tools; memorize runs only via
  the env-gated startup hook, recall only via direct/API calls. The memory
  capability is connected but not Joe-reachable. Planner-exposure owner: NVIDIA.
- M5 POSITIVE: startup auto-index defaults OFF (explicit env opt-in), with
  bounded extensions + node_modules/dist/.git ignores. No surprise cost.
- M6 SECURITY NOTE for any navigator revival: index takes an absolute
  targetDir with NO workspace containment (containPath covers file tools,
  not this path) and search returns absolute host paths. Containment +
  trusted-owner/workspace binding are preconditions, same class as the
  BATCH2 visual/bulk conditions. No revival implemented or proposed here.
- M7 POSITIVE (internal wiring): LongTermMemory consumed by AgentLoopService,
  SelfFixService, SelfFixExecutionService, AgentOrchestrator; repairMemory by
  SelfFixService, SelfFixExecutionService, AgentOrchestrator; learn.ts by
  long-term-memory. INTERNAL_ONLY_BY_DESIGN and genuinely wired — not orphans.

## Classification summary (memory family, f40)

- MEM_TOOL_DEFS=3, MEM_REGISTERED=2, MEM_PLANNER_VISIBLE=0
- PARTIALLY_WIRED=2 (recall_memory, memorize_codebase: registered+executable,
  planner-invisible; memorize has one env-gated internal caller)
- ORPHANED=1 (codebase_navigator) + 1 effective (core VectorMemory, sole
  consumer orphaned)
- IMPLEMENTED_NOT_REGISTERED=1, REGISTERED_NOT_PLANNER_VISIBLE=2,
  SHADOW_DUPLICATES=1 pair, CONTRACT_DRIFTS=2 (guards), DOC_MISMATCHES=1
- INTERNAL_WIRED=4 (LongTermMemory, repair-memory, learn, services/vectorDb)
- FULLY_WIRED=0 (autonomous-Joe reachability bar: planner-visible + executable)

## Ownership / non-overlap

NVIDIA dirty lane touches long-term-memory.ts, registry.ts, plan-tools.ts,
PlanningEngine.ts — this slice used committed f40 bytes ONLY and re-verifies
nothing against dirty state. Muse records findings ONLY. Repair owners:
NVIDIA (M1/M2/M4 registration+planner, M3/M6 gating if revival is ever
approved). Muse re-reviews fixed bytes. No competing implementation.

## Repro

git -c safe.directory=D:/Joe/xelitesolutions -C D:\Joe\xelitesolutions grep -n \
  'recall_memory\|memorize_codebase\|codebase_navigator' f40f6100 -- 'api/src' \
  ':!*__tests__*' ; git show f40f6100:api/src/modules/services/ToolService.ts | sed -n '560,610p;670,680p'
