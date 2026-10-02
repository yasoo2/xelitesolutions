# WIRING-140: per-file tool yield + definition-site map at Muse HEAD

HEAD=14bcd25e (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
registry import (synthetic test-only JWT, JOE_TEST_MODE, workspace TEMP
redirect; no network, no writes) + static quoted-literal attribution.

## Live numbers (probe v1, 2x EXIT 0, byte-identical SHA256 D711344B...)
- definitionFiles: 93 · registeredTools: 163 · uniqueNames: 163/163
- Registry line: `[ToolRegistry] Registered 163 tools (71 revived).`
- unattributedNames: 0 (every registered name is quoted in >=1 def file)
- zeroYieldFiles: 5 (see below)
- multiFileQuotedNames: 53 (references, NOT duplicate definitions — see 140b)

## Definition sites (probe 140b, 2x EXIT 0, identical 6263B640...)
- exactlyOneDefSite: 163/163 · zero: 0 · multi: 0
- DUPLICATE_REGISTRATION=0 live-confirmed (registry also throws on dup).
- The 53 multi-file hits are dispatch lists, executeTool calls, planner
  `tool:` fields, output suggestions, and comments (bounded excerpts in log).
  Notable: EliteTools.ts:290 documents an already-removed `ai_write_file`
  duplicate — dedup provenance, not a live defect.

## Per-file definition fan-out (probe 140d, 2x EXIT 0, identical 3D75A93F...)
- definingFiles: 88/93 · mappedDefSites: 163
- Top: BrowserSmartTools.ts 25, SystemTools.ts 9, EliteTools.ts 8,
  QualityTools.ts 6, AdvancedTools.ts 5, RepoSelfCodingTools.ts 5,
  UtilityTools.ts 5, ContentTools.ts 4. Full 93-entry table in pfd1 log.

## Zero-definition files (5) — the registration gap
| File | Declared name | Registered? | Imported by registry? |
|---|---|---|---|
| BulkFileGeneratorTool.ts:6 | bulk_file_generator | NO (proven: zero-yield + self-quote) | YES (:18) |
| CodebaseNavigatorTool.ts:9 | codebase_navigator | NO | YES (:16) |
| ImageGenerationTool.ts:5 | generate_image | NO | YES (:15) |
| VisualQATool.ts:13 | visual_qa | NO | YES (:14) |
| react-app-templates.ts (352884 B) | n/a (template data) | n/a | n/a |

IMPLEMENTED_NOT_REGISTERED=4 at this HEAD (imported but unregistered).
Proposed dispositions (audit-first, NO code change this cycle):
- generate_image: ORPHANED-NEEDS_REPAIR (paid DALL-E spend on key presence,
  no opt-in; unverified URL ok:true) — do NOT register as-is.
- bulk_file_generator: ORPHANED-NEEDS_REPAIR (absolute-path writes, no
  containment; orphan register O2) — do NOT register as-is.
- visual_qa: UNKNOWN_REQUIRES_INVESTIGATION — executor holds 3 dispatch
  branches for it (PhaseExecutor :1737/:2047/:2051 `visual_qa$` regexes).
- codebase_navigator: UNKNOWN_REQUIRES_INVESTIGATION — zero references
  outside its own file + registry import.

## Executor dangling references (unregistered names in dispatch logic)
- bulk_file_generator: PhaseExecutorTool.ts:112 (write-tools list), :254.
- visual_qa: PhaseExecutorTool.ts:1737/:2047/:2051 (verification regexes).
- Fail direction (unknown_tool? silent skip?) NOT probed — see OBS-140-3.

## Shared-matrix corrections (this tree; matrix generated 2026-10-01, other tree)
- Matrix RECONCILIATION claims IMPLEMENTED_NOT_REGISTERED=0. At Muse HEAD
  it is 4. OBS-140-1 (P3, doc): pin reconciliation rows per-tree+commit
  (extends OBS-139-1); do not assert global zeros.
- Matrix line 50 lists `image_generation` as a registered example. The name
  occurs NOWHERE under api/src/modules/tools at this HEAD (definitions +
  registry grep, 0 hits) → not registered here. OBS-140-2 (P4, doc):
  correct or per-tree-pin the example list.
- OBS-140-3 (P2, wiring, proposed 141 probe): resolve the 4 unregistered
  names + any revived-alias shape through executeTool in a fixture and
  record fail direction; still no code change.

## Disclosed probe misses (environment/design, zero source impact)
- npx tsx tried a registry fetch → EPERM on foreign npm cache. Fixed: use
  api/node_modules/.bin/tsx.cmd directly (exists post-npm-ci).
- tsx IPC mkdir EPERM on C:\Users\home Temp. Fixed: TEMP/TMP redirect to
  tmp/cache-tsx (6.5MB, removed after runs; method recorded here).
- PowerShell `>` writes UTF-16 (unreadable to file tools). Fixed: cmd /c
  byte redirect for all receipts.
- probe-declared.mjs run-1 (static, EXIT 0): naive `name:` pattern
  over-matches (222 hits incl. schema/field/template names like
  'viewport'/'description'). Design miss, SUPERSEDED by live-grounded
  140b/140d. Kept as evidence, not cited as a count.

## Evidence
- tmp/wiring-140-file-yield/probe.mts + run1/run2.stdout.log (D711344B) +
  run1/run2.stderr.log (registry default notes only)
- tmp/wiring-140-file-yield/probe-defsites.mts + def1/def2.stdout.log
  (6263B640) + stderr logs
- tmp/wiring-140-file-yield/probe-perfile-defs.mts + pfd1/pfd2.stdout.log
  (3D75A93F) + stderr logs
- tmp/wiring-140-file-yield/probe-declared.mjs + decl1 logs (superseded miss)
- Tracked tree verified CLEAN (0 dirty) before and after all runs. No
  source, runtime, worker, or NVIDIA state touched. Zero strays outside tmp/.
