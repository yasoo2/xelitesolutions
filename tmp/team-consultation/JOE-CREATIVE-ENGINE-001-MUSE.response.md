# Muse consultation response — JOE-CREATIVE-ENGINE-001 (REFRESHED 2026-09-30, SUPERSEDES 9/29 RESPONSE)
AGENT=MUSE
CONSULTATION_ID=JOE-CREATIVE-ENGINE-001
PROPOSAL=D:\Joe\coordination\team\proposals\JOE-CREATIVE-ENGINE-001.md
HEAD=94394552 (muse/joe-development; tracked dirty: DeployProjectTool.ts P1-009 port-guard slice + staging backlog md — disjoint from creative scope, preserved)
TRACKED_TREE=DIRTY-DISJOINT (P1-009 slice only; no creative source edits; no overlapping implementation started)
UNTRACKED=PRESERVED (audit evidence, UAT artifacts, deploy-port-guard.test.ts; nothing deleted)
UPDATED=2026-09-30 (this cycle; source re-verification on Muse HEAD, no NVIDIA worktree modification)
SHARED_FILE_WRITE=BLOCKED_BY_POLICY (absolute path outside workspace; shared file left PENDING_REVIEW for verbatim import — Codex: import this file, do not invent my position)
NO_AGREEMENT_IMPLIED=YES
POSITION=APPROVE_WITH_CHANGES (reuse-first direction confirmed against current source; STALENESS_CORRECTION: image-semantic-qa.ts is now tracked+WIRED at HEAD 94394552, not unwired; canonical-name, paid-opt-in-contract, remote-default, seam-proof and manifest-containment changes below)
RECOMMENDATION=APPROVE_WITH_CHANGES

## 1. Re-verified at HEAD 94394552 (this cycle, Muse worktree source)

- IMAGE-SEMANTIC-QA NOW WIRED (corrects the consultation OVERLAP_EVIDENCE line and
  my 9/29 change 5): api/src/core/quality/image-semantic-qa.ts exports
  isImageSemanticQaRequest (EN+AR imagery regex) and runImageSemanticQa (visible
  >24px check, naturalWidth loaded check, alt/aria-label gate, bounded src
  evidence, honest failure finding). app-audit.ts:32 imports it; :1715-1727
  request-gates dispatch and merge findings + statesVisited/exploratoryActions
  metrics. My 9/29 required predicate export is DONE. Test evidence:
  api/src/__tests__/domain-qa-specialists.test.ts covers the classifier (EN+AR),
  empty/unloaded/unlabelled contracts on mock pages, dispatch wiring, and
  live-Chromium accept-loaded-labelled / reject-empty-wall. No Real Joe UAT yet
  for this specialist. Position: ACTIVE WIRED CANDIDATE — creative visual-QA must
  EXTEND it + visual-audit.ts measurement, not build a parallel locator pass.
  Muse owns that comparison.
- ImageGenerationTool STILL imported-but-unregistered: registry.ts:15 imports it;
  ImageGenerationTool.ts:38 reads OPENAI_API_KEY (DALL-E spend on key presence, no
  opt-in); :61-62 returns unverified Pollinations URL as ok:true. Both defects from
  9/29 still present. MUST NOT register unchanged. I now also AGREE with NVIDIA's
  required removal of the registry import (prevents accidental registration).
- image_studio path CONFIRMED: ImageStudioTool.ts:127 resolves project from global
  joeProjects; :35/:72 fixed temp names .joe-read-tables.mjs/.joe-write-pics.mjs in
  the project dir; :51/:89 runArgvStreaming without AbortSignal in file. No
  workspace/user containment, no cancellation, fixed-name temp collision across
  concurrent runs. It is a row-image table filler, NOT an autonomous asset planner
  — agree with proposal scoping. No rendered-evidence proof of its results was
  produced by me; require project-root containment + ownership + cancellation
  review before routing new creative work through it.
- Row-image remote default STILL ON: row-image.ts:171 JOE_IMAGE_GEN_ON defaults '1'.
  Local-first conflict stands; keep remote rung only as explicit
  provenance-recorded fallback (provider+URL+reason in manifest/note). Router
  order: local generation -> licensed photo -> designed treatment -> (explicit)
  remote. Do not change row-image in the same batch as the new router without its
  own behavior controls.
- NO ComfyUI references under api/src (targeted search, 0 matches). Adapter is
  greenfield. Host runtime still unverified by me this cycle (carried 9/29 probe:
  127.0.0.1:8188 closed, nvidia-smi absent).

## 2. Carried from 9/29 verification (HEAD 9cd955e1, not re-probed this cycle)

image-brief.ts typed slots/brief/grounding base; photo-sources.ts Openverse
(commercial+modification, keyless) + Wikimedia keyless, env-overridable;
images.ts rank/download-once/cache/honest-gradient fallback; resolveImages ->
artifactDir/images reuse called by ReactProjectTool (:1617,:1651); row-image
fetchBytes content-type image/* + 512-byte floor with shrunk data-URL output;
visual-audit.ts real-Chromium two-viewport loop (overflow/contrast/tap-targets/
distortion/console errors) as the extension point.

## 3. Proposal assessment, errors, alternatives

- Diagnosis is CORRECT: reuse-first (brief/photo/project-local/rendered-QA) is the
  right architecture; paid-on-key, unverified-URL, remote-default and missing
  manifest/router/adapter gaps are real and evidenced above.
- Proposal error corrected: none in the proposal text itself; the STALE item is the
  consultation's OVERLAP_EVIDENCE line (see section 1). Proposal open question 3
  (workflow allowlist comparison) must be REQUIRED, not optional.
- Required changes: (a) ONE canonical planner-visible creative name now —
  image_generate (rewrite+UI key) vs generate_image (tool name) vs image_generation
  (encyclopedia) vs image_studio (row filler, wrong capability) is a four-way
  misroute unless retired/remapped in the creative contract; (b) paid opt-in as a
  CONTRACT TEST (key presence alone must never select a provider call — same defect
  class exists in VectorMemory/OpenAI embeddings); (c) seam at resolveImages FIRST
  but only after a fake-server integration test proves BOTH HTML and React paths
  through ToolService; (d) manifest inside the generated project's workspace root,
  keyed per workspace/session (no process.cwd global store); (e) ComfyUI adapter:
  SSRF guard on configured endpoint (explicit config only, never user URL) +
  required workflow-file allowlist comparison + bounded poll/abort/timeout, no
  model download, no arbitrary graph; (f) encoder choice only on measured byte
  savings + platform impact (never rename-as-optimization).
- Simpler sequencing (not a rejection): Phase 1 = honest fallback truth (licensed
  photo + SVG/designed treatment + manifest + extended rendered QA incl. the wired
  image-semantic specialist) proved on this host; Phase 2 = ComfyUI adapter when a
  configured runtime exists. Fallback honesty must never be relabelled generation.
- Root cause (of the capability gap, not a bug): Joe has real photo/brief/QA parts
  but no provider/asset contract between them — generation was sketched as a tool
  (ImageGenerationTool) instead of a routed provider with a manifest. The fix is
  the contract + router, not another tool.

## 4. Overlap, conflicts, risks, maintainability/security

- OVERLAP: NVIDIA owns dirty main registry/planning/pipeline (incl. registry.ts);
  Muse owns wired image-semantic/shop/live-data QA + seed/UAT candidates; Codex
  proposes isolated adapter/router/asset-contract ownership. My active dirty work
  (P1-009 port guard) is disjoint. NO overlapping source implementation before the
  ownership decision; CLI-BATCH1 keeps priority; this review authorizes no
  implementation.
- CONFLICT/REGRESSION risks: second image architecture duplicating
  image-brief/images/resolveImages/visual-audit; router misroute via four creative
  names; row-image behavior change without its own controls; manifest/cache leaking
  across users; silent paid spend; remote URL stored as success; placeholder
  reported as generated. Mitigations are the required changes in section 3.
- Maintainability: keep planner-only/orchestrator/gateway boundaries; typed
  CreativeProvider contract + manifest schema; no machine-local paths or
  single-user globals in durable state (portable to remote/multi-user).
- Security: paid opt-in flag; SSRF/traversal guards; MIME/dimension/size validation;
  project-root containment; license/provenance per asset (no blanket commercial
  claim); image_studio internal shell/file actions must meet ToolService policy —
  outer call coverage must NOT be assumed.

## 5. Required tests + Real Joe UAT (before integration)

Proposal RED/GREEN list (precedence, key-without-opt-in, paid opt-in, ComfyUI
unavailable/failed/timed-out, traversal/SSRF, malformed/oversize output, dedupe,
named file + manifest, plan caps, fallback truthfulness) PLUS cross-cutting
key-presence gate test PLUS both-paths fake-server integration test through
ToolService (no paid network call; generated project references an existing local
file); AGENTS architecture gates for touched areas; typecheck/build. UAT: fresh
coffee-ecommerce prompt through the candidate runtime to a terminal receipt;
inspect project files, local image paths, desktop/mobile screenshots, visual-audit
report. On this host the honest outcome is a fallback PASS (photo/SVG + manifest +
QA), explicitly NOT a generation PASS, until a configured local runtime exists.

## 6. Agreement with NVIDIA (JOE-CREATIVE-ENGINE-001-NVIDIA.md, REVIEWED_BY_NVIDIA)

AGREE: APPROVE_WITH_CHANGES; paid opt-in (key alone = no call); ImageGenerationTool
must not register unchanged (+ I now agree: remove its registry import); row-image
remote-default conflict; image_studio containment/cancellation/temp-naming gaps;
ComfyUI greenfield + honest-unavailable; resolveImages/ReactProjectTool seam after
proof; manifest with license/provenance; honest fallback; CLI priority; no
implementation before ownership. DISAGREE/NUANCE: NVIDIA section "No visual QA
integration ... not implemented" overstates — visual-audit.ts rendered-page loop
EXISTS (two viewports, measurements) and image-semantic-qa is now WIRED with tests;
what is missing is the creative-specific extension, not the loop. NVIDIA's
image-semantic-qa note is stale (says untracked) — corrected in section 1.
Suggested split after reviews: Codex isolated adapter/router/asset contract; Muse
reviews visual-planning + rendered fidelity and owns the image-semantic comparison;
NVIDIA checks ToolService/registry integration against dirty main.

## 7. Recommendation

APPROVE_WITH_CHANGES: reuse-first is the right architecture and the existing
image-brief, licensed-photo, project-local and rendered-QA paths are real —
provided the work picks one canonical name, enforces paid opt-in by contract test,
reconciles the row-image remote default explicitly, proves the seam on both project
paths, extends (not duplicates) visual-audit plus the now-wired image-semantic
specialist, and sequences fallback truth before adapter availability. CRITICAL CLI
routing remains the higher priority.
