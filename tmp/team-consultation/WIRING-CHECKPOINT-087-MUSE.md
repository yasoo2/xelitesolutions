# WIRING CHECKPOINT 087 — MUSE (2026-10-01T23:58Z)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=0600e4780cd215941543a3c961ada30cc4f94b3e (exact; verified at probe time)

## Scope: image-name 3-way contract comparison (read-only)
087 executes the 086 next step for ONE gap family: offered
`image_generate` vs registered `image_studio` vs orphaned `generate_image`.
Method: source reads only (tool-picker.ts, ToolService.ts rename layer +
dispatch lookup + TOOL_ALIASES table, both ImageGenerationTool defs,
ImageStudioTool contract, registry grep in both trees, docs/web grep).
No tool executed, no network, no source edited.
Evidence: this file + cited line numbers (Muse HEAD 0600e478 unless noted).

## Result: full chain mapped; NO safe blind-alias target exists
1. OFFER (picker): `image_generate` is in PRIORITY_TOOL_NAMES
   (tool-picker.ts:13) but is silently dropped by
   selectToolDefsForProvider (lines 44-51, `if (t)` with no else) because
   it is not registered. The planner never receives this spelling
   (F-086-1 instance). No docs/ or web/src reference exists.
2. RENAME (dispatch): if the planner emits `image_generate` anyway,
   ToolService hard-renames it to `generate_image` (ToolService.ts:551-553,
   "[GHOST TOOL FIX]" block).
3. DEAD-END (dispatch, honest): `tools.find('generate_image')` misses
   (unregistered in BOTH Muse and candidate registries: import L15, no
   createTool entry, image_studio only L306); TOOL_ALIASES has no image
   entry (28 entries, none image-related, L212-249). Result: honest
   `unknown_tool` error with near-suggestions (ToolService.ts:700-720).
   The near-suggestion logic WOULD offer image_studio (shared segment
   "image") — a hint, not a dispatch.
4. ORPHAN (direct-import only): the `generate_image` implementation is
   reachable ONLY by direct in-process import, never via ToolService.
   Muse-lineage shape is the UNSAFE legacy: silent DALL-E call on mere
   OPENAI_API_KEY presence (ImageGenerationTool.ts:42-58) + unfetched
   pollinations URL returned as ok:true (:60-62). Candidate-tree shape is
   fail-closed (CREATIVE-SAFETY-BATCH-001). Registry-only dispatch
   (ToolService.ts:675) is what keeps the legacy shape out of planner
   reach — verified, not assumed.

## Contract comparison: image_studio is NOT an alias candidate
- image_studio (registered): fills pictures of a BUILT SYSTEM table
  (inputs table/context/limit/redo; photo-archive/generator/card ladder
  over secondary-model rows; perms internet+write).
- image_generate intent ({prompt, size} ad-hoc single image): a DIFFERENT
  capability (generation vs table-fill) with a DIFFERENT input/output
  shape. Blind-aliasing would execute the wrong capability with coerced
  args, not fix the gap.
- generate_image orphan: closest spelling, but unregistered + (in Muse
  lineage) unsafe. No safe dispatch target exists today for EITHER
  spelling.

## Dispositions and ownership
- `image_generate` priority entry: STALE_OR_FUTURE. Keep the spelling ONLY
  if a future asset-contract tool (JOE-CREATIVE-ENGINE-001) adopts it;
  otherwise remove the stale priority entry. Picker is shared surface —
  Muse makes no unilateral edit; needs coordinated ownership (proposal
  scratch: PRIORITY-STALE-ENTRY-001, not yet filed).
- ToolService rename image_generate->generate_image: HARMLESS_TODAY
  (dead-ends honestly), but it points a live rename at an orphaned name;
  revisit when the priority entry is dispositioned. No edit this cycle.
- Muse-lineage legacy generate_image: RESIDUAL_DIRECT_IMPORT_HAZARD
  (see CREATIVE-SAFETY-BATCH-001-MUSE.response.md ADDENDUM_087).
  Main-lineage repair needs its own coordinated ownership; this batch is
  NO_MAIN_INTEGRATION and Muse makes no overlapping edit.
- 086 locks untouched and not rerun (no source change since 086; HEAD
  moved only by docs commits da408fc6->0600e478). 084 P4 + F-086-1 still
  await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, locked 086, not rerun)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=1/19 (image_generate chain fully traced)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (generate_image is one; dispatch-unreachable VERIFIED)
DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Contract-compare the next probable-rename family (read-only), or the next
Codex-requested bounded scope. No picker/registry/ToolService edits
without coordinated ownership.
