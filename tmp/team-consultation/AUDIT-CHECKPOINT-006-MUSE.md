# Muse deep-wiring audit checkpoint 6 — 2026-10-01 (MUSE_HEAD=db51125e)
Command: CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (Muse discovery lane).
Scope: corrected re-baseline of the 047 implemented-not-registered census at
CURRENT heads, both trees. Read-only; zero source edits anywhere. Main tree
read-only (e8fd9589 + dirty work preserved, untouched).
PROBE=tmp/wiring-audit/census06.cjs; FIXTURES=tmp/wiring-audit/fx-census06/
census06_{a,b}.json (2 runs BYTE-IDENTICAL apart from run tag).

## Method fix vs 047 (the withdrawn-claim failure mode)
047 used `git grep` for tree-wide refs; it fails under sandbox git-ownership
and its empty result was misread as "exactly ONE reference". 006 replaces it
with a Node file-walk over api/src/**/*.ts (own file excluded). Symbol refs
and TOOL-NAME refs are reported SEPARATELY — conflating them caused the
withdrawn grep_search orphan claim (053).

## F6-1 headline counts: zero drift at export level
- MUSE exported=200 unref=31; MAIN exported=201 unref=31. IDENTICAL to 047
  (at 88e27a54). Docs-only commits since; export surface stable.
- MAIN+1 = SpecificationVerificationTool (registered; correctly absent from
  unref). Dirty-registration attribution unchanged.

## F6-2 GrepSearchTool: symbol-DEAD, name-REACHABLE (both trees, identical)
- Symbol `GrepSearchTool`: treeRefs=0 outside SystemTools.ts (006 walk).
- Tool NAME `grep_search`: reachable via TOOL_ALIASES -> 'search_text'
  (ToolService.ts:217) + hand-redirect (:526) + risk tier (:198); registry
  comment "stays UNregistered on purpose" (Muse :329, main :331).
- Classification CONFIRMED: INTENTIONAL_ALIAS, not ORPHANED. 047's
  IMPLEMENTED_NOT_REGISTERED=1 stays WITHDRAWN. The full GrepSearchTool
  class body (incl. execute() with safePath) is retained-but-unwired
  implementation weight — P4 backlog candidate (remove or justify; audit
  does NOT delete).

## F6-3 generate_image escapes this census BY DESIGN (tracked separately)
registry.ts IMPORTS ImageGenerationTool (symbol referenced) but never
registers it (005: IMPORTED_NOT_REGISTERED, both trees, zero drift).
Symbol-census "referenced" != registered. Live implemented-not-registered
case UNCHANGED (005 evidence stands, not re-run this cycle).

## F6-4 dead-helper signal (new, non-tool, both trees identical)
6 non-tool consts with treeRefs=0: LLM_GENERATION_DEADLINE_MS,
sessionConfig, PERMISSIONS, authConfig, useApp, isToday. Dead-helper P4
cleanup candidates. NEVER counted as tool orphans.

## F6-5 heuristic false positive (documented, not hidden)
`PROJECT_DIR_NAME_MAX_LENGTH` (ReactProjectTool.ts const) flagged
tool-shaped: chunk-splitting over-matches on multi-export files (picks up a
later `name:'viewport'` + `execute`). treeRefs=4 (used internally). The
tool-shape heuristic needs per-declaration AST scoping before any verdict
use. No finding derived from it.

## Counts (Muse position, corrected census)
EXPORTED_SYMBOLS: MUSE=200 MAIN=201 (re-verified executed, deterministic).
TOOL_SHAPED_UNREF (symbol): 1 per tree (GrepSearchTool) — reclassified
INTENTIONAL_ALIAS via name-level alias evidence, NOT orphaned.
IMPLEMENTED_NOT_REGISTERED (tool-name level): 1 live shared case
(generate_image, via 005 import-without-registration evidence).
NON_TOOL_UNREF: 30 per tree (29 referenced helpers + ... ; 6 with zero
tree refs are dead-helper candidates).
ORPHANED tool count stays 0 from this census method; audit-wide ORPHANED=2
(bulk_file_generator, generate_image) from 004/005 stands (registry-level
evidence, unaffected by this symbol census).
EXECUTABLE / FULLY_WIRED / PARTIALLY_WIRED stay UNKNOWN (firewall/executor
tracing still pending). Dormant-16 still UNLOCATED (006 out of scope).

## Next discovery step
Per-tool EXECUTABLE leg: firewall allow/deny + executor dispatch tracing
for the registered set (closes EXECUTABLE_NOT_VERIFIABLE survey); or
dormant-16 regeneration from main U004 reference. Owner: Muse lane.
