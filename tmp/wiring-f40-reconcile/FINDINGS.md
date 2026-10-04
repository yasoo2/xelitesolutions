# Wiring audit: IMPLEMENTED-vs-REGISTERED on exact f40 bytes (Muse, read-only)

AGENT=MUSE
DATE=2026-10-04
EXACT_SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048
SUBTREE=api/src/modules/tools (git-archive to scratch; NVIDIA tree untouched)
METHOD=static parse: registry.ts registration positions
  (new X / createTool(X) / safeNew('..',()=>new X) / bare const refs / spreads)
  vs exported name+execute tool classes in definitions/*.ts
PROBE=reconcile.cjs + dupcheck.cjs (this dir); raw output=reconcile.json,
  RECONCILE-REPORT.md

## Verified counts (commit-scoped, NOT dirty-scoped)

DEFINITION_FILES=93
TOOL_CLASS_SYMBOLS=167 (exported class/const with tool name + execute member)
REGISTERED_SYMBOLS=162
RUNTIME_TOOL_NAMES_COMMITTED=163
  (162 symbols; MemoryTools spread contributes recall_memory+memorize_codebase)
IMPLEMENTED_NOT_REGISTERED=5 (all explained, see below)
REFERENCED_NOT_IMPLEMENTED=0
DUPLICATE_TOOL_NAMES=0

The 163 runtime count REPRODUCES the historical "163 committed" figure
exactly (162 registered symbols + 1 extra MemoryTools member).

## The 5 unregistered (f40 commit)

| tool name | symbol | status |
|---|---|---|
| bulk_file_generator | BulkFileGeneratorTool (const obj) | BATCH011: registered in NVIDIA dirty WIP (registry.ts:290), not in f40 commit |
| generate_image | ImageGenerationTool (const obj) | BATCH011: registered in NVIDIA dirty WIP (registry.ts:289), not in f40 commit |
| visual_qa | VisualQATool (const obj) | BATCH011: registered in NVIDIA dirty WIP (registry.ts:288), not in f40 commit |
| codebase_navigator | CodebaseNavigatorTool (class) | imported-not-instantiated in registry.ts:16; revival pending ownership/safety review (no action this cycle) |
| grep_search | GrepSearchTool (class) | DELIBERATE: registry comment + ToolService redirect to search_files; lock test protects. INTERNAL_ONLY_BY_DESIGN |

Dirty-tree projection (read-only grep, NOT runtime-proven):
163 + 3 BATCH011 const objects = 166 runtime names.
CORRECTION: my prior BATCH011 note said "167 dirty registry"; static recount
says 166. Owner runtime log line still owed to close the +/-1.

## Limits (explicit)

- Static registration only. Planner catalogue, alias maps, executor dispatch,
  firewall/permission reachability and verification compatibility are separate
  layers and are NOT covered by these counts.
- Dirty WIP is owner work in progress; only read-only grep was used, no
  dirty-tree test execution, no edits, no review verdict on uncommitted bytes.
- No provider calls, no runtime start/stop, no UAT. No RealJoe proof claimed.
- Probe artifacts fixed during development (block-bleed const match,
  MemoryTools self-double-count, `new Error`/`new T` generics) — final
  numbers above are post-fix; method notes retained in reconcile.cjs.
