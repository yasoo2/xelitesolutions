# Registry census — Muse cycle 196 (CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT)

SOURCE_TREE=D:\Joe\muse-worktree (Muse-owned)
SOURCE_HEAD=ace38e2065228b3f11121cdb87b0824a22d04b92 (tracked clean; `git status` shows only untracked tmp/evidence)
METHOD=tsx runtime import of registry.ts + PLANNER_TOOL_CATALOGUE (LEVEL 2: registration; process-only JWT_SECRET=dummy, no network, no providers)
PROBE=tmp/wiring-196-regcensus/census.ts + import-check.js (plain node, static)
EVIDENCE_LEVEL=LEVEL_2_REGISTRATION (not executability, not planner selection, not Real Joe)

## Counts (exact, reproduced this cycle)

REGISTERED_COUNT=163 (registry log: "Registered 163 tools (71 revived)")
PLANNER_CATALOGUE_ENTRIES=40 (unique 40)
CATALOGUE_NOT_REGISTERED=0 (every catalogue entry resolves to a registered tool)
REGISTERED_NOT_IN_CATALOGUE=123 (163 - 40; full list: registered-not-in-catalogue.txt)
DEFINITION_FILES=93 (api/src/modules/tools/definitions/*.ts)
DEF_FILES_NOT_IMPORTED_BY_REGISTRY=1 (react-app-templates.ts — template helper module, no Tool export; INTERNAL_HELPER, not orphaned)
IMPORTED_IDENTIFIERS=161 (registry.ts import region)
IMPORTED_BUT_NOT_IN_ARRAYS=4 (BulkFileGeneratorTool, CodebaseNavigatorTool, ImageGenerationTool, VisualQATool)
PERMISSION_DEFAULTED_AT_LOAD=21 (registry enforceContract log; matches audit-079 21-tool trace)
RATE_LIMIT_DEFAULTED_AT_LOAD=2 (central_answer, web_page_builder)

## Named findings

F1. IMPLEMENTED_NOT_REGISTERED x4 on this HEAD (imported by registry.ts, absent from revivedTools/baseTools arrays, absent from runtime registered names):
  - bulk_file_generator (BulkFileGeneratorTool) — KNOWN from Codex main-tree finding; independently reproduced here.
  - generate_image (ImageGenerationTool) — KNOWN (BATCH011 dirty registration exists only in NVIDIA worktree, not here).
  - visual_qa (VisualQATool) — KNOWN (same as above).
  - codebase_navigator (CodebaseNavigatorTool) — NEW: complete implementation (name/inputSchema/outputSchema/permissions/execute index+search, 121 lines). No registration, no catalogue entry.
  Receipts: registered-names.txt (163), imported-not-in-arrays.txt (4).
  SECURITY: CodebaseNavigatorTool.execute(index) accepts absolute targetDir with no visible workspace containment (same class as bulk_file_generator). DO NOT blind-register; needs security-gated backlog entry + consultation before exposure. No fix implemented this cycle (NVIDIA owns BATCH011-adjacent registration lane; no competing patch).

F2. PLANNER_CATALOGUE_COVERAGE=40/163 (24.5%). All 40 catalogue entries are registered (0 dangling), but 123 registered tools have no catalogue entry. This bounds the "planner-visible" claim: AT MOST 40 tools are catalogue-visible on this HEAD (fewer if the planner filters further; not tested here). Corroborates the retained "40 planner-catalogue gap" without re-counting NVIDIA's dirty tree.

F3. image_studio IS registered here (line 84 of registered-names.txt); image_generate alias is NOT a registered name. Any image_generate->generate_image->unknown_tool chain diagnosis remains valid on this HEAD.

F4. revivedTools header reads "previously defined but never registered" (71 revived) — a prior orphan-revival pass is already absorbed in this count. The 4 in F1 are the CURRENT residual of that class on this HEAD.

## Limits (explicit)

- Static file census only proves import presence, not runtime dispatch, permission routing, contract validity, or Real Joe reachability (LEVEL 3-6 NOT run).
- Counts are Muse-HEAD-specific (ace38e20); NVIDIA dirty main (a10c71ab + 17-file dirty per cycle-194) WILL differ (BATCH011 trio registered there). Do not mix counters across trees.
- Planner visibility tested ONLY via PLANNER_TOOL_CATALOGUE membership; tool-rerank/capability-match/selection logic not exercised.
- No Joe source modified; no tests added (audit-first rule); no registration performed.

## Files

- tmp/wiring-196-regcensus/census.ts (probe; needs JWT_SECRET dummy + workspace TEMP under sandbox)
- tmp/wiring-196-regcensus/import-check.js (static import-vs-array check)
- tmp/wiring-196-regcensus/registered-names.txt (163 sorted names)
- tmp/wiring-196-regcensus/catalogue-tools.txt (40)
- tmp/wiring-196-regcensus/catalogue-not-registered.txt (empty)
- tmp/wiring-196-regcensus/registered-not-in-catalogue.txt (123)
- tmp/wiring-196-regcensus/def-files-not-imported.txt (1)
- tmp/wiring-196-regcensus/imported-not-in-arrays.txt (4)

## Next (proposed, not started)

- N1: file codebase_navigator under JOE-ORPHAN-AND-LEGACY-REGISTER with SECURITY-GATED recommendation (coordinator import; Muse cannot write shared team files from sandbox).
- N2: LEVEL 3 spot-checks (dispatch reachability) for a small sample of the 123 registered-not-catalogued tools, read-only/fixture-contained.
- N3: NVIDIA exact-diff review of N1 before any registration; no Muse implementation in NVIDIA's registration lane.
