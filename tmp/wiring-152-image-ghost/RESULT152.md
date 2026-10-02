# WIRING-152 -- Image-capability ghost chain, live-verified (Muse independent)

MUSE_HEAD=2000c447 (tracked CLEAN, 0-line api/web delta; all 152 outputs new under tmp/wiring-152-image-ghost/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T17:4xZ (this cycle)
METHOD=live tsx probe (registry + TOOL_ALIASES + catalogue + resolvePlannedTool) run 2/2 EXIT 0 with byte-identical stdout; definition/registry/dispatch files READ as text. ZERO DISPATCH: executeTool never called, ImageGenerationTool.execute NEVER invoked (it can reach OpenAI/Pollinations), no network, no writes, no registry mutation. Synthetic test-only JWT_SECRET for import (no production credentials); workspace TEMP (system temp EPERM).

## TRIGGER
OBS-148-1 (P1 ghost image_generate) + BATCH-P3-001 (image tools disambiguation)
rested on source reads. Wiring-152 live-proves the FULL chain on Muse HEAD and
confirms the NVIDIA tree carries the identical chain (read-only source check).

## LIVE CENSUS (Muse HEAD; run1.result.json; run1 == run2 byte-identical)
- registered=163; membership: image_generate=false, generate_image=false, image_studio=true, image=false
- TOOL_ALIASES lookup: all four image names -> null (NO alias entry; the only image_generate path is the hard-coded executeTool redirect)
- PLANNER_TOOL_CATALOGUE image hits: 0; plan-tools.ts 'image' occurrences (case-insensitive): 0
- resolvePlannedTool live: image_generate -> {tool:null,why:unknown}; generate_image -> {tool:null,why:unknown}; image -> unknown; 'generate an image' -> unknown; 'create a hero image' -> unknown; image_studio -> {tool:image_studio,how:exact}
- Registry source: ImageGenerationTool occurrences=2 (both on the import line: `import { ImageGenerationTool } from './definitions/ImageGenerationTool'`), createTool=false, safeNew=false -> IMPORTED BUT NEVER REGISTERED (orphan)
- ImageStudioTool occurrences=3 (import x2 + createTool x1) -> registered (matches live membership)
- ToolService source: `if (name === 'image_generate') { effectiveName = 'generate_image'; }` present (ToolService.ts:551-553)
- ImageGenerationTool source: name='generate_image'; paid path (OPENAI_API_KEY + dall-e-3) present; Pollinations fallback URL present
- ImageStudioTool source: name='image_studio'; table-row picture filler via project's own entities.js (secondary tables only) -- materially different contract from generation
- Registry log live: "Registered 163 tools (71 revived)"; 21 permission defaults + 2 rate defaults (central_answer, web_page_builder) corroborated again

## PROVEN CHAIN (both lines; NVIDIA tree read-only source check identical)
1. Planner layer: zero image vocabulary -> any image request resolves 'unknown' (no catalogue, no MEANS, no alias).
2. Dispatch layer: image_generate has no TOOL_ALIASES entry; executeTool hard-redirects it to generate_image.
3. Registry layer: generate_image is not registered -> lookup misses -> unknown_tool.
4. Implementation layer: generate_image EXISTS (ImageGenerationTool.ts, paid OpenAI first, Pollinations fallback) but is unreachable through every legitimate runtime path.
5. image_studio is registered and exact-resolvable but is a table-picture filler, NOT a generator; aliasing image_generate to it would be a contract mismatch.

## CLASSIFICATION (Muse independent position)
- generate_image: ORPHANED (implemented-not-registered; 1 of the name-level cases challenging the shared IMPLEMENTED_NOT_REGISTERED=0, extends OBS-149-2)
- image_generate: DANGLING REDIRECT (hard-code to an orphan, no alias entry)
- Planner-visible image generation: NONE (0/163 reachable by planner vocabulary)
- image_studio: REGISTERED with a different contract (not a substitute)

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-148-1 P1: CONFIRMED LIVE on Muse HEAD; identical chain on NVIDIA tree. Recommend CLOSED-as-proven, superseded by OBS-152-1.
- OBS-152-1 (P2): ghost chain image_generate -> generate_image -> unknown_tool. Recommend NVIDIA (planner vocabulary + ToolService owner) choose exactly one: (a) register generate_image behind provider/cost-policy guard + catalogue/MEANS entry + planner selection tests, or (b) remove the dead redirect and the unused import. Explicitly do NOT alias image_generate -> image_studio (contract mismatch: generation vs table fill).
- OBS-152-2 (P3): paid-path hazard. generate_image.execute prefers paid dall-e-3 whenever OPENAI_API_KEY exists and silently falls back to third-party Pollinations (external URL, prompt in query string). Any registration (option a) requires provider/cost-policy review first (NVIDIA-owned scope) plus audit of the fallback's privacy/cost posture. No execution was performed to reach this finding.
- BATCH-P3-001 now has live evidence for its ROOT_CAUSE; implementation ownership stays as backloged (Muse image tools / NVIDIA review) but Muse will not patch while NVIDIA's planner/ToolService scope is actively dirty.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-bq lineage). No jest rerun needed; no wedge.
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, cycle-67 live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + pure resolution + source reads); the paid/fallback execute paths were read, never run. No new UAT (provider-blocked, see feas-bq).
- PowerShell 5.1 capture notes: npx fetch path EPERM (used local api/node_modules/.bin/tsx.cmd); Out-File -Encoding utf8 used (utf8NoBOM unavailable); run1.stdout.json carries 2 preamble + 1 trailing log lines around the JSON object (run1.result.json is the extracted pure object). Attempt-0/1 misses disclosed; final runs 2/2 EXIT 0 byte-identical.
- NVIDIA tree touched READ-ONLY (4 grep checks, 0 writes). HEAD e8fd9589, planner/executor/pipeline/EVAL-006 scope dirty, cycle-67 log live; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
