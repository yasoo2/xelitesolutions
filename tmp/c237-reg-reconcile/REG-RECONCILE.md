# C237 registry reconciliation — Muse HEAD (exact bytes, source-text)

MUSE_HEAD=62f8a0ec1f4891e6af458b2baaa07b205b494bda (tracked clean)
REGISTRY=api/src/modules/tools/registry.ts
REGISTRY_SHA256=912ce54942a3ced650fdac2f440f7cdd33f317eee704e226da52b95eacc1eaec
REGISTRY_HISTORY=byte-identical since 4d005cda (C212 HEAD): `git diff 4d005cda HEAD -- registry.ts` empty
DEFDIR=api/src/modules/tools/definitions (93 *.ts, tests excluded)
PROBE=tmp/c237-reg-reconcile/PROBE-c237-reg-reconcile.cjs (stdlib only, no imports)
RUNS=run1.json (raw) -> run2.json (Error/bare-fix) -> run3.json (FINAL, const-literal filter)
UPDATED=2026-10-04

## Method

1. Extract every instantiation reference from registry.ts: `new X()`, `createTool(X)`,
   `new EliteTools.X()`, `safeNew('label', () => new X())`, bare ToolDefinition
   objects, `...MemoryTools` members (parsed from MemoryTool.ts).
2. Extract every tool symbol from definitions/*.ts: `export class *Tool`, consts
   typed `ToolDefinition`, const literals carrying both `name:` and `execute:`.
   Helper functions/namespace consts (planContainsTool, AdvancedTools, ...) excluded.
3. Cross-match both directions; verify each IMPLEMENTED_NOT_REGISTERED hit has
   zero other references in api/src (class-name grep outside own file/tests).

## Counts (FINAL run3)

definitionFiles=93
exportedToolSymbols=167
registeredUniqueRefs=161
registeredInstances=163 = 55 base-new + 26 createTool + 8 elite + 70 safeNew + 2 memory + 2 bare
STATIC_163 == prior RUNTIME_163 (C212, same registry bytes) -> fully reconciled.
No null-filtered revived tool is needed to explain the count. No runtime import
was run this cycle; the equality is static-vs-prior-runtime, stated as such.

## IMPLEMENTED_NOT_REGISTERED = 5 (4 real gaps + 1 intentional)

F-C237-1 bulk_file_generator (BulkFileGeneratorTool.ts, : ToolDefinition, has execute)
  registry.ts:18 import only, never instantiated. No other api/src reference.
  ORPHANED on Muse HEAD. (NVIDIA dirty BATCH011 registers it; owner=NVIDIA.)
F-C237-2 codebase_navigator (CodebaseNavigatorTool.ts, UNTYPED literal, has execute)
  registry.ts:16 import only, never instantiated. No other api/src reference.
  ORPHANED on Muse HEAD. No revival owner assigned. Secondary nit: missing
  `: ToolDefinition` annotation (same for generate_image).
F-C237-3 generate_image (ImageGenerationTool.ts, UNTYPED literal, has execute)
  registry.ts:15 import only, never instantiated. No other api/src reference.
  ORPHANED on Muse HEAD. (NVIDIA dirty BATCH011 registers it; owner=NVIDIA;
  creative free-first contract HOLDs from BATCH011 reviews still apply.)
F-C237-4 visual_qa (VisualQATool.ts, : ToolDefinition, has execute)
  registry.ts:14 import only, never instantiated. No other api/src reference.
  ORPHANED on Muse HEAD. Confirms BATCH2-VERIFY gate finding from the other
  direction (ledger gate accepts visual_qa while execution cannot resolve it).
  (NVIDIA dirty BATCH011 registers it; owner=NVIDIA.)
F-C237-5 grep_search (SystemTools.ts) — INTENTIONAL, not a defect.
  registry.ts:329-331 comment: deliberately unregistered; ToolService redirects
  the name to search_files; a lock test protects against shadowing.
  INTERNAL_ONLY_BY_DESIGN.

## Zero-findings (explicit)

REGISTERED_WITHOUT_IMPLEMENTATION=0 (every one of 161 unique refs resolves)
DUPLICATE_INSTANTIATION=0 (no class instantiated twice)
safeNew label-vs-declared mismatches=4, COSMETIC ONLY: web_pipeline,
  dev_server, performance_profiler, documentation_generator labels differ from
  declared names, but the label feeds only the safeNew skip-warning string, not
  routing. Hygiene nits, no wiring effect.

## Reachability level (per CRITICAL audit scale)

The 4 orphaned tools sit at LEVEL 1 (source existence) on Muse HEAD: no
registry instance, no alternate class reference anywhere in api/src, so neither
planner selection nor ToolService dispatch can reach them. (String-name gate
membership for visual_qa does not create an execution path.)

## Limits

- Static source-text reconciliation on Muse HEAD only; NVIDIA dirty bytes not
  re-derived (6-file hash check this cycle shows zero drift, so prior BATCH011
  positions stand).
- Runtime tools.length not re-executed this cycle (registry bytes unchanged
  since the C212 runtime measurement; static count now equals it exactly).
- Tool-name alias layer (tool-aliases) not re-checked against these 4 names;
  an alias pointing at an unregistered tool would still fail at dispatch.
