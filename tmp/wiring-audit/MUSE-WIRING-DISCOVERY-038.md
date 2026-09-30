# MUSE WIRING DISCOVERY 038 — per-name static registration/catalogue/dispatch pass

PROBE=tmp/wiring-audit/regcheck38.mjs (read-only, dependency-free Node)
INPUT=reused filed evidence tmp/wiring-audit/fx-astdecl37/astdecl37_runA.json
FIXTURES=tmp/wiring-audit/fx-regcheck38/regcheck38_run{A,B}.{json,log}
AB_SHA256=2c42cd52f63780d92dcee0983957ca407a0cb512fd91971d5afef420a91bc972 (byte-identical A/B)
HEAD_MUSE=ffaeb342 (muse/joe-development) MAIN=read-only NVIDIA worktree (dirty preserved, untouched)
METHOD_FIX_DURING_RUN=object-tools first missed bare-identifier registration
(ArchitectTool,); file-base-identifier check added, A/B rerun green.

## F8 static registered counts EXACTLY match all prior counts

- MAIN: 164/169 statically registered = Codex-observed runtime `/api/tools` 164. EXACT.
- MUSE: 163/168 statically registered = checkpoint-33 committed agreement 163. EXACT.
- MAIN delta vs MUSE is exactly +1: `specification_verification` (NVIDIA dirty,
  imported + createTool'd at registry.ts:37/:295 — verified read-only).
- Registration-site model used: `new X()` / `createTool(X)` / `safeNew(..new X)`
  / `new EliteTools.X()` / bare `X,` / `...MemoryTools` / `...revivedTools` /
  safeNew name-labels. Import lines excluded.

## F9 the checkpoint-37 "5 candidates" are now fully attributed (identical both trees)

IMPLEMENTED_NOT_REGISTERED (import-only in registry.ts, verified by hand):
1. bulk_file_generator (BulkFileGeneratorTool.ts) — registry import only
   (MUSE:18, MAIN:18). Independently corroborates Codex runtime finding
   (absent from registered names) + Codex workspace-containment warning.
   DO NOT simply register; needs containment repair first.
2. codebase_navigator (CodebaseNavigatorTool.ts) — import only (MUSE:16, MAIN:16).
3. generate_image (ImageGenerationTool.ts) — import only (MUSE:15, MAIN:15).
   Consistent with backlog note "unregistered paid-on-key image tool".
4. visual_qa (VisualQATool.ts) — import only (MUSE:14, MAIN:14).

INTENTIONAL_BY_DESIGN (documented, must NOT be "repaired" by registering):
5. grep_search (SystemTools.ts:GrepSearchTool) — not imported at all; registry
   comment (MUSE:329-331) says deliberately unregistered; ToolService
   TOOL_ALIASES maps grep_search→search_text (same for grep/ripgrep/code_search/
   search_code/find_in_files/search_in_files). Name IS dispatch-reachable via
   alias; class shadowing is a field-proven fix protected by a lock test.

None of the 5 appears in PLANNER_TOOL_CATALOGUE either (consistently invisible,
not planner-visible-but-broken). No PLANNER_VISIBLE_NOT_EXECUTABLE case here.

## F10 dispatch model: registered ⟺ executor-reachable (static)

ToolService.executeTool resolves generically via
`tools.find(t => t.name === effectiveName)` (ToolService.ts:675/696, both
trees) after TOOL_ALIASES rewriting (28 keys, byte-identical both trees).
There is no second per-tool dispatch table to reconcile. Per-name DISP is
therefore DERIVED from REG, recorded as via-registry / unreachable-static /
alias-covered — no per-name dispatch fiction.

## F11 catalogue coverage is narrow (REGISTERED_NOT_IN_CATALOGUE, caveated)

- MAIN: 116/164 registered names absent from plan-tools.ts text;
  MUSE: 115/163. Catalogue covers ~48 names.
- specification_verification (new, dirty, registered) is already an example:
  reg=true cat=false — catalogue was not updated with the registration.
- CAVEAT (no verdict yet): catalogue-literal-absence ≠ planner-invisible.
  Alternate planner exposure (orchestrator deterministic lists, model-driven
  selection, PhaseExecutor contracts) is NOT checked in this pass. These 116
  are REGISTERED_NOT_IN_CATALOGUE, a work-queue for checkpoint 39, not a
  planner-invisibility verdict.

## Counts for the wiring matrix (static, MAIN live tree)

DECLARED=169 REGISTERED_STATIC=164 IMPLEMENTED_NOT_REGISTERED=4
INTENTIONAL_UNREGISTERED_ALIAS_COVERED=1 CATALOGUE_COVERED≈48
ALIAS_SPELLINGS=28 DISPATCH_TABLES_EXTRA=0

## F12 cross-review note

Method + probe + A/B bytes filed in this worktree for NVIDIA/Codex challenge.
Static 164 == runtime 164 is a two-method corroboration, not a proof that every
one of the 164 executes correctly — execution/contract evidence stays per-tool
future work. Registry boot (/api/tools probe) still out of scope until a
runtime is reachable from this sandbox (both :5101 and :5002 unreachable here).

NEXT (checkpoint 39): planner-exposure reconciliation for the 116 —
orchestrator deterministic tool lists + modelConfig/agentLoop selection paths,
to split REGISTERED_NOT_IN_CATALOGUE into PLANNER_VISIBLE_BY_OTHER_PATH vs
genuinely planner-invisible.
