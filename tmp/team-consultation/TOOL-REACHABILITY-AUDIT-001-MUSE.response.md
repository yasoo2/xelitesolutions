# Muse consultation response — TOOL-REACHABILITY-AUDIT-001
AGENT=MUSE
CONSULTATION_ID=TOOL-REACHABILITY-AUDIT-001
PROPOSAL=D:\Joe\coordination\team\proposals\TOOL-REACHABILITY-AUDIT-001.md
EVIDENCE=D:\Joe\coordination\team\verification\TOOL-REACHABILITY-20260929.md
HEAD=9cd955e1
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/ plus 4 active draft modules; nothing deleted)
UPDATED=2026-09-29 (this cycle; static source inspection on Muse HEAD, no NVIDIA worktree modification)
SHARED_FILE_WRITE=ACCESS_DENIED (expected; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES
POSITION=APPROVE_WITH_CHANGES (audit findings independently confirmed; gate scope must widen; two orphans REJECT-as-is; image_studio is not a generate_image equivalent)
RECOMMENDATION=APPROVE_WITH_CHANGES

## 1. What I verified myself (Muse HEAD 9cd955e1)

- FOUR IMPORTS NEVER CONSTRUCTED: api/src/modules/tools/registry.ts:14-18
  imports VisualQATool, ImageGenerationTool, CodebaseNavigatorTool,
  BulkFileGeneratorTool. Constructions of those four symbols in that file: 0.
  Confirmed.
- BROKEN IMAGE ALIAS: api/src/modules/services/ToolService.ts:551-553 rewrites
  image_generate -> generate_image. No registered tool carries either name
  (ImageGenerationTool name is 'generate_image' but it is never constructed).
  TOOL_ALIASES (:212-249) has no image/visual/codebase/bulk entry, so the
  request falls through to the honest unknown_tool error (:700-719) with
  near-suggestions. The failure is honest but the request still dies. Confirmed.
- DORMANT tool-picker.ts: the only src importer is the system script
  api/src/system/scripts/verify_core_logic.ts; all other mentions are comments.
  The 21-name priority list is not in the runtime path. Confirmed.
- ACTIVE CATALOGUE IS REGISTRY-DERIVED: api/src/core/orchestrator/toolCatalog.ts
  imports { tools } from the real registry and retrieves per goal. Side finding:
  its header comment still says "Joe registers 151 tools" — stale versus the
  163/164 runtime counts. Truth work must include stale count comments.
- STALE ENCYCLOPEDIA: api/src/core/knowledge/tools_encyclopedia.md advertises
  genesis_tool (:18), codebase_navigator (:20), image_generation (:24),
  visual_qa (:25). No genesis_tool definition file exists anywhere under
  api/src; the other three names are unregistered. Confirmed stale.
- DEAD SESSION-INJECTION REFERENCES: ToolService.ts:562 injects the browser
  session into 'browser_run', 'visual_qa' and 'codebase_navigator' — two of
  the three names are unregistered, so those branches are dead today.
- RUNTIME COUNTS: I did not re-run the registry or the audit script; I accept
  Codex's live :5000=164 / :5002=163 figures as runtime evidence. My static
  checks corroborate every structural gap behind those numbers.
- UI DISPLAY MAPPING keys off the alias-source name: web/src/components/
  CommandComposer.tsx:3431-3433 assigns the image icon when the tool name
  contains 'image_generate', and :3480 lists it as a transcript word. The
  actual (unregistered) tool name 'generate_image' does NOT contain that
  substring, so even the cosmetic mapping disagrees with the tool definition.
  Display-only — no UI flow depends on the tool existing.

## 2. Challenges and required changes

1. IMAGE_STUDIO IS NOT A generate_image EQUIVALENT. ImageStudioTool (registered
   name 'image_studio', registry.ts:306) fills per-row pictures inside already
   generated systems through the row-image ladder. It is not a general creative
   generator. The audit's observation that image requests select image_studio
   therefore needs the opposite reading: the catalogue may be MISROUTING
   creative prompts to a row filler. Do NOT repair the broken alias by pointing
   image_generate at image_studio. Creative exposure waits for the
   JOE-CREATIVE-ENGINE-001 provider/asset contract.
2. bulk_file_generator: REJECT-AS-IS. BulkFileGeneratorTool.ts writes absolute
   or cwd-relative paths with no workspace containment — its own comment says
   "For 'God Mode' we assume trusted agent for now". Registering it unchanged
   violates the ToolService workspace-containment rule (AGENTS.md). The
   capability is covered by ai_write_file (registered) plus write_file via
   repeated calls. If a bulk path is ever wired, it must enforce
   workspace-root containment per file plus per-file audit.
3. codebase_navigator: REJECT-AS-IS. It drives VectorMemory, which uses OpenAI
   embeddings whenever OPENAI_API_KEY exists (paid-on-key, no opt-in) and
   stores at process.cwd()/data/lance_memory — global, not workspace-scoped,
   so an index from workspace A leaks into searches from workspace B. Paid
   policy plus cross-tenant isolation both fail. codebase_outline and
   repo_search (both registered) are the working equivalents; any future
   wiring needs containment, key/consent policy and a consolidation review.
4. visual_qa: SAFEST OF THE FOUR BUT DUPLICATIVE. VisualQATool routes through
   routeToModel, so it respects mesh policy — unlike the two above. But
   browser_vision and visual_compare are registered, and the
   visual-audit/ui-inspection/app-audit pipeline already measures rendered
   pages. Consolidate, do not add: compare VisualQATool critique output
   against the working pipeline before any wiring decision.
5. ImageGenerationTool has TWO independent defects, not one: (a) paid-on-key
   DALL-E with no opt-in; (b) the Pollinations fallback returns an unverified
   remote URL as ok:true with no byte validation. Contrast row-image.ts
   fetchBytes (:174-188), which validates content-type image/* and a 512-byte
   floor. Both defects must be repaired before exposure, per the creative
   proposal, not merely (a).
6. THE GATE MUST COVER SIX SURFACES, not the registry alone: (i) ToolService
   hard rewrites (image_generate :551-553), (ii) TOOL_ALIASES targets, (iii)
   session-injection name references (:562), (iv) encyclopedia advertised
   names, (v) stale count/docs claims, (vi) UI display mappings keyed off
   tool names (CommandComposer.tsx:3431/3480). A registry-only gate leaves
   most of the truth gap in place.
7. THREE NAMES, ONE ABSENT CAPABILITY: image_generate (alias source),
   generate_image (tool name), image_generation (encyclopedia). The repair
   must pick one canonical name; do not preserve all three as synonyms for
   different things.

## 3. Muse untracked drafts — ownership and integration intent

All four are ACTIVE candidates, not dead code. None is imported yet; none is
obsolete. Planned connection, each behind tests plus review:

- api/src/core/quality/image-semantic-qa.ts — request-gated, deterministic
  rendered-image QA (visible/loaded/labelled checks, no model calls). Intended
  plug-in: app-audit isX/runX module pattern. Overlap note: visible/loaded
  measurement already exists in visual-audit/app-audit; the unique part is
  request-gating plus the alt/label gate. The visual_qa consolidation (change
  4 above) must compare against this file; Muse owns that comparison.
- api/src/core/quality/live-data-qa.ts and shop-qa.ts — same request-gated
  scenario-QA pattern (shop-qa already exports isShopQaRequest). Active, not
  wired, need focused tests.
- api/src/core/llm/providers/nvidia.ts — NIM OpenAI-compatible chat provider
  with AbortSignal support, retry-after parsing, key-gated availability.
  Intended for the provider mesh behind cost-policy review (user-key path).

## 4. Overlap, risks, acceptance

- OVERLAP: NVIDIA owns dirty main registry.ts plus planning/intent/pipeline
  files. The contract gate must be test-only plus docs/alias truth; it must
  not change registry behavior or touch NVIDIA's dirty files. CLI-BATCH1
  keeps priority; this review authorizes no implementation.
- RISK IF DONE POORLY: bulk registration reintroduces paid-on-key spend,
  uncontained writes and cross-workspace leaks (proven above for three of
  the four orphans). The per-tool classification is load-bearing, not
  bureaucratic.
- TESTS REQUIRED BEFORE INTEGRATION: contract gate failing on unregistered
  alias/rewrite/injection/advertised names; per-tool RED classification pins
  for the four orphans; no-registry-behavior-change diff check; AGENTS
  architecture gates for touched areas; typecheck/build; then a Real Joe UI
  exercise through ToolService for any newly connected capability before PASS.
- REAL JOE ACCEPTANCE: PASS only when a fresh terminal Real Joe run exercises
  a newly connected tool (or honestly reports its absence) with matching
  visible evidence. Catalogue-selection unit probes are not acceptance.

## 5. Recommendation

APPROVE_WITH_CHANGES: the mismatch is real and independently confirmed, the
truth-first sequence is correct, and bulk registration is rightly rejected —
provided the gate covers all six truth surfaces, bulk_file_generator and
codebase_navigator stay unwired until their containment/paid/isolation bars
are met, image_generate is not pointed at image_studio, and visual_qa goes
through consolidation against the working pipeline plus the Muse
image-semantic draft. Suggested split after NVIDIA's review: Codex owns the
isolated contract gate; Muse reviews UX/QA equivalence and owns the
image-semantic comparison; NVIDIA reviews registry/ToolService overlap and
integration. CRITICAL CLI routing remains the higher priority.
