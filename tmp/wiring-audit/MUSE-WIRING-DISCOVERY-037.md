# MUSE Wiring Discovery 037 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT
# (E3 from checkpoint 036: AST-filtered declared-tool enumeration)

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 37)
HEAD=f254b7d9 + this checkpoint (survey/docs only, no source edits)
DATE=2026-09-30
METHOD=AST scan (TypeScript compiler API via tsx, workspace TMPDIR redirect)
  over api/src/modules/tools/definitions/*.ts in BOTH trees (NVIDIA read-only).
  Buckets: A=tool classes (extends BaseTool / implements ToolDefinition /
  transitive same-file subclass), B1=object literals in exported const arrays,
  B2=top-level `export const X = { name }`, C=tool-heritage classes without a
  literal name, D=other literal name fields (values recorded). Filed runs A/B
  exit 0, JSON SHA256-identical.
EVIDENCE=tmp/wiring-audit/astdecl37.mts +
  tmp/wiring-audit/fx-astdecl37/astdecl37_run{A,B}.json +
  astdecl37_run{A,B}.log (this worktree)
AB_SHA256=67F532B1E8CB76A6301B182DBF354949A7DB0539E9AF2F659F48D40526C2ACD0
CASECHECK=tmp/wiring-audit/fx-astdecl37/casecheck.cjs (node: /g=174, /gi=193)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=checkpoint 36 (regex upper bound 192/193, filed in d98c5dc5).

## F1 headline counts (AST-filtered, both trees)
- MUSE (93 files scanned, 92 with decls): 168 DISTINCT declared tool names
  = 160 class-declared (bucket A) + 8 object-declared (bucket B: 2 array +
  6 top-level const). Zero duplicate names. Bucket D (non-tool literal
  name fields) = 103 occurrences / 93 distinct: 88 display/template/seed
  strings ("Classic edition", Arabic labels, etc.) + 5 nested snake_case
  non-tools (desktop/mobile/tablet viewport presets, 'next' TS-plugin
  name, 'fullstack' preset) — see F4.
- MAIN (94 files scanned, 93 with decls): 169 DISTINCT = 161 classes + 8 objects.
- Delta Muse-vs-main is exactly +1 name on main: `specification_verification`
  (NVIDIA dirty, uncommitted) — consistent with checkpoints 33/36. Committed
  trees agree at 168.
- `react-app-templates.ts` carries no tool declarations and no literal name
  fields in either tree: a template/data file living in definitions/,
  correctly excluded from all counts.
- Bucket C (dynamic-name tool classes) = exactly one entry in both trees:
  `PublicApiDiscoveryTools.ts::ApiDiscoveryTool`, VERIFIED as an abstract
  intermediate base (extends BaseTool, no name, never instantiated). Not a
  missing tool.

## F2 method correction made during this checkpoint (filed, not hidden)
The first probe revision used strict direct heritage (extends BaseTool only)
and MISSED 3 real tools: SearchPublicApisTool/inspect_api/validate_api
extend the abstract ApiDiscoveryTool instead of BaseTool directly
(157 classes first run -> 160 after the transitive-subclass fix, both trees).
Lesson for NVIDIA cross-review: any heritage-based scan must follow
intermediate abstract bases or it undercounts by the subclass fan-out.

## F3 fourth declaration shape: top-level const objects (B2)
Six tools declare as `export const X[: ToolDefinition] = { name: '...' }`
instead of classes; a class-only scan misses all six:
  architect_plan, bulk_file_generator, codebase_navigator, generate_image,
  todo_write, visual_qa (same six in both trees).
NOTE: `bulk_file_generator` is DECLARED here. Codex's read-only finding
(CODEX-BULK-FILE-GENERATOR-WIRING-20260930: imported by registry.ts but
absent from registered names + writes user-supplied absolute paths without
workspace containment) is therefore a REGISTERED-vs-DECLARED gap, not a
missing-implementation gap. AUDIT_FIRST: no registration attempted; the
containment defect must be repaired BEFORE any wiring change (P0 backlog).

## F4 regex upper bound from checkpoint 36 is now RESOLVED, not just bounded
Checkpoint 36 reported 192/193 DISTINCT regex names as an upper bound with
explicit false-positive suspects. Full reconciliation at current HEAD
(Muse tree), verified by re-running the old expression in node:
- Case-SENSITIVE regex: 174 distinct = 168 AST tools + 5 nested snake_case
  non-tools + 1 template-string artifact. The 5: desktop/mobile/tablet
  (viewport presets nested inside a BrowserSmartTools tool class),
  'next' (TS-plugin name inside an Orion template object),
  'fullstack' (preset inside TemplateManagerTool). The 1: 'app' inside a
  redux code SAMPLE (template string, MobileBuilderTool.ts:447) — matched
  as text, not an AST node. 168+5+1=174 EXACT.
- Checkpoint-36's filed 192 came from PowerShell Select-String, which is
  case-INSENSITIVE by default: `[a-z0-9_]` also matched capitalized display
  strings ('Basic', 'Pro', ...). Node /gi at current HEAD gives 193 — a
  1-name delta vs filed 192 across different HEADs/engines, UNRESOLVABLE
  from filed evidence (the old run kept counts only, not the name list).
  Immaterial: it does not affect the AST count.
- Bucket-D method fix filed during this checkpoint: the first revision
  suppressed ANY name field nested inside a tool class (walk-up rule) and
  hid the 5 nested snake values; the fix suppresses only DIRECT members of
  counted declarations (node.parent rule). otherOcc 70 -> 103 correct.
The bound collapses to the exact count: 168/169 at literal-name level.
Computed-name declarations would still escape; none observed (bucket C
holds only the abstract base).

## F5 relation to JOE-WIRING-AUDIT-SUMMARY "167" claim
The shared summary claims "167 distinct literal named class/object
declarations" over 94 files (main, older reference HEAD). This checkpoint
independently reproduces the layer with a FILED method and finds 169 on
main (168 committed + 1 dirty spec_verification). The old scan's method was
never filed, so the +1 committed delta (168 vs 167) cannot be attributed
exactly yet: candidates are (a) the 3 transitive subclasses if the old scan
missed them while counting 2 extra elsewhere, (b) drift between reference
HEADs, (c) a B1/B2 boundary difference. Owed: attribute the 1-name delta by
re-running this filed probe at the summary's reference HEAD. This checkpoint
does NOT overwrite the shared summary (sandbox) — import + reconcile.

## F6 relation to the 164 registered count (next step, not a verdict)
MAIN 169 declared - 164 runtime-registered = 5 declared-but-unregistered
NAME candidates (upper bound; registered count is Codex-observed runtime log,
not re-probed here). bulk_file_generator is one confirmed member of this
class. The remaining 4 are UNATTRIBUTED until the per-name pass runs.
NEXT (checkpoint 38): per declared name — registered? (registry.ts static
imports + safeNew/createTool/new/namespace/array sites), planner-visible?
(PLANNER_TOOL_CATALOGUE), executor-reachable? (ToolService dispatch) — to
convert the 5 into classified IMPLEMENTED_NOT_REGISTERED / alias /
false-positive verdicts. Registry boot (/api/tools probe) stays out of scope
until a runtime is available; static dispatch evidence first.

## F7 cross-review note
Method + probe + A/B bytes are filed in this worktree for NVIDIA/Codex
independent re-run (same-tree determinism check) and for the old-167
attribution. No NVIDIA/Main file was modified (read-only scan). No Muse
source file was modified (probe + docs only).
