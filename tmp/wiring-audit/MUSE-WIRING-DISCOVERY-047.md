# MUSE WIRING DISCOVERY 047 — implemented-not-registered census (both trees)

PROBE=tmp/wiring-audit/unreg47.cjs (static text scan, zero Joe imports; v2 adds class/const kind)
FIXTURES=tmp/wiring-audit/fx-unreg47/unreg47_{a,b}.json (2x runs byte-identical apart from run tag)
HEAD_MUSE=88e27a54 MAIN=e8fd9589 working tree (read-only, dirty preserved, untouched)
ENV=no source edits anywhere, no provider calls
METHOD=per tree: every `export class|const` in api/src/modules/tools/definitions checked
for word-boundary reference in api/src/modules/tools/registry.ts (catches named imports,
member access, bare refs; named-import-only registry confirmed — no namespace enumeration).

## F48 census counts
MUSE exported=200 unref=31; MAIN exported=201 unref=31. MAIN+1 = SpecificationVerificationTool
(registered, ckpt45 F46 — correctly absent from unref). 29/31 unref per tree are helper consts
(deadlines, catalogues, config shapes, stores) — correctly excludable, not tools.

## F49 grep_search is IMPLEMENTED_NOT_REGISTERED on both trees (new orphan finding)
- SystemTools.ts:1022 `export class GrepSearchTool`, name='grep_search', full input/output
  schemas, execute() with safePath containment. Complete implementation.
- Tree-wide references: exactly ONE (its own export) on Muse HEAD (verified git grep).
- registry.ts imports SystemTools by NAME (registry.ts:61-63: EchoTool, FileEditTool,
  ShellExecuteTool, WriteFileTool, ScaffoldProjectTool, LsTool, NpmManagerTool,
  ShellStatusTool, DeleteFileTool) — GrepSearchTool not imported, zero mentions.
- Same unref result on MAIN working tree (probe) — shared-main finding, not Muse-only drift.
- OVERLAP: registered `search_text` (SearchTextTool, registry.ts:219 revived) and
  `search_files` (UtilityTools) cover the same ground → ORPHANED with DUPLICATE overlap.
- CLASSIFICATION: ORPHANED (implementation exists, no legitimate runtime path).
  Per audit safety rule: NOT registered, NOT deleted this cycle. Repair-backlog input:
  P3 (compare grep_search vs search_text/search_files execute bodies; keep one file-search
  seam or justify both) — owner UNASSIGNED, no implementation started.
- RUNTIME_LOGICAL_SOURCE_TOOLS (PhaseExecutorTool.ts:240) is a Set constant, not a tool —
  correctly excluded from the orphan count.

## Counts (this checkpoint)
EXPORTED_SYMBOLS_MUSE=200 MAIN=201; TOOL_SHAPED_UNREF=1 per tree (grep_search);
NON_TOOL_UNREF=30 per tree (helpers + 1 Set const); IMPLEMENTED_NOT_REGISTERED=1 (shared).
UNKNOWN=execute-body diff grep_search vs search_text (bounded follow-up, not run this cycle).
