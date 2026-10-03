# C221 registry-reconciliation evidence (Muse bytes)

AGENT=MUSE
CYCLE=221
DATE=2026-10-03
MUSE_HEAD=26faf93b6611e49e37301cba6e5a7c288c1c26cb (tracked clean at probe time; zero Joe source delta; evidence-only)
NVIDIA_HEAD=a10c71ab14411e682be7a7e4e5ffd07467d960ac (read-only; 19 tracked + 35 untracked = 54, unchanged, untouched)
CRITICAL=CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (Muse division: source-level wiring, planner/tool behavior)
RESULT_JSON=tmp/c221-reg-reconcile/run-result-clean.json
RESULT_SHA256=422EEFDA92B870AACB03D1766EC72A33161A8D4F7E3537C1A7AB143223E0740C (v2 probe, 2 runs byte-identical)
RUNTIME=:5002 DOWN, :5101 DOWN, :5000 API-only OK — no Real Joe UI claim; static + import evidence only, not UAT.

## Method (probe v2, deterministic, side-effect-free)

1. Imported `tools` from api/src/modules/tools/registry (read-only instantiation;
   dummy JWT_SECRET for import chain only; no tool executed, no network).
2. Statically scanned 630 api/src *.ts files (excluding node_modules/dist/__tests__/
   *.test.ts/*.spec.ts); 160 contain `execute(`.
3. Two declaration styles captured in files that also define `execute(`:
   (a) class style `name = 'xxx'` (api/src-wide);
   (b) literal style `name: 'xxx'` (modules/tools/definitions/ only).
   HTML tags stripped before matching (template/fixture false-positive control).
4. Every automated candidate manually inspected at file:line before classification.
   Static search alone never promoted to a DEAD/ORPHAN verdict without a
   repo-wide reference check.

## Proven counts (exact Muse HEAD bytes)

- REGISTERED_TOOLS=163, registryUnique=163 (import success; zero duplicate names).
- Declared implementation names found=169 (before manual false-positive exclusion).
- IMPLEMENTED_NOT_REGISTERED (verified real, after manual review)=1: `grep_search`
  (class GrepSearchTool; see classification below — deliberate-legacy, NOT a gap).
- REGISTERED_WITHOUT_IMPLEMENTATION (verified real)=0. The 4 automated misses
  (v1: architect_plan, memorize_codebase, recall_memory, todo_write) all resolve
  to real files: colon-form `name: '...'` literals + arrow-function
  `execute: async (input) =>` style (ArchitectTool.ts:8+31, MemoryTool.ts:21+60,
  TodoWriteTool.ts:5+49). Pure heuristic recall gaps, manually closed.
- Heuristic false positives excluded with evidence: 6 HTML-attribute matches in
  v1 (`<meta name="viewport">`, `<input name="who">`, form fixtures) and 7
  literal-style matches in v2 (redux `createSlice({name:'app'})` template,
  viewport presets mobile/tablet/desktop, template-list entry fullstack,
  tsconfig plugin `{name:'next'}`, docstring `npm_package:{name:"express"}`).

## Classification: `grep_search` (the one real implemented-not-registered class)

- IMPLEMENTATION: GrepSearchTool extends BaseTool, SystemTools.ts:1022-1023,
  full execute() shelling out to system grep (L1043-1109).
- REGISTRY: deliberately NOT imported (registry.ts L61-63 import list omits it;
  L329-331 comment: "grep_search stays UNregistered on purpose").
- NAME REACHABILITY: the NAME `grep_search` is FULLY_WIRED via alias, not dead:
  TOOL_ALIASES maps grep_search/grep/ripgrep/code_search/search_code/
  find_in_files/search_in_files -> search_text (ToolService.ts L212-223), and a
  hand-written one-hop redirect sends grep_search -> search_text (L523-528).
  search_text IS registered (registry.ts L219, SearchTextTool).
- PLANNER VISIBILITY: name appears in system-prompt.ts:25, tool-picker.ts:9,
  toolCatalog.ts:7-9, PhaseExecutorTool.ts:270.
- RATIONALE (source-traced): old path needed the system grep binary; search_text
  reads files in JS so stock Windows boxes work (ToolService.ts L610-612).
- PROPOSED PRIMARY_STATE: LEGACY_OR_DEAD-by-design for the GrepSearchTool
  CLASS (superseded implementation, zero repo references outside its own
  definition — verified api+web/src+services); FULLY_WIRED for the `grep_search`
  NAME (alias path). Reviewer to confirm. NO deletion proposed (audit-first rule).
- DOC DRIFT (minor, honest): registry.ts L329-331 still says the name redirects
  to "search_files"; code redirects to "search_text" since the audit fix
  (ToolService.ts L213-217 comment confirms the correction). Comment-only drift.

## Matrix input

| name | class/file | registered | alias/resolve | planner-visible | proposed state |
|---|---|---|---|---|---|
| grep_search | GrepSearchTool (SystemTools.ts:1022) | NO (deliberate) | YES -> search_text (registered) | YES (prompt/picker/catalog) | class LEGACY_BY_DESIGN; name FULLY_WIRED |
| search_text | SearchTextTool (UtilityTools) | YES L219 | n/a (target) | YES | no change |
| architect_plan / todo_write / recall_memory / memorize_codebase | literal-style defs | YES | n/a | n/a | no change (scan-gap only) |

## Limits (explicit)

- Scan covers api/src class+literal styles with an execute gate; dynamically
  constructed tool names (if any) would not be captured — none observed.
- Counts are Muse-HEAD-scoped (26faf93b), not global: global DISCOVERED/
  FULLY_WIRED/ORPHANED remain UNKNOWN.
- No runtime execution performed this cycle; reachability claims for the alias
  path rest on source-traced dispatch code + the existing lock test cited at
  registry.ts:331 (not re-run here).

REAL_JOE_PROVEN=NO (runtime :5002 unavailable; no UI run attempted).
