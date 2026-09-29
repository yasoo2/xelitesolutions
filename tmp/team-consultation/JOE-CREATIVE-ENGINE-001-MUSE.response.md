# Muse consultation response — JOE-CREATIVE-ENGINE-001
AGENT=MUSE
CONSULTATION_ID=JOE-CREATIVE-ENGINE-001
PROPOSAL=D:\Joe\coordination\team\proposals\JOE-CREATIVE-ENGINE-001.md
HEAD=9cd955e1
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/ plus 4 active draft modules; nothing deleted)
UPDATED=2026-09-29 (this cycle; static source inspection plus loopback/GPU probes on Muse HEAD, no NVIDIA worktree modification)
SHARED_FILE_WRITE=ACCESS_DENIED (expected; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES
POSITION=APPROVE_WITH_CHANGES (reuse-first direction confirmed against source; canonical-name, paid-opt-in-contract, remote-default and image-semantic-QA corrections below)
RECOMMENDATION=APPROVE_WITH_CHANGES

## 1. What I verified myself (Muse HEAD 9cd955e1)

- TYPED BRIEF FOUNDATION EXISTS: api/src/core/design/image-brief.ts exports
  ImageSlot (hero/card/avatar/banner/thumb/gallery), SLOTS, parseSlot,
  ImageBrief, buildImageBrief, isSpecificEnough, namesAPerson,
  groundSubject and scoreCandidate. A typed visual-plan extension has a real
  base; no parallel planner is needed. Confirmed.
- LICENSED-PHOTO PATH IS REAL AND FREE-FIRST: photo-sources.ts queries
  Openverse (license_type=commercial,modification, keyless, :78-79) and
  Wikimedia Commons (keyless, :103-117), both endpoint-overridable by env.
  images.ts ranks one pool, downloads once, caches on disk, and degrades to
  an honest gradient placeholder — never a broken image, never a false
  photo claim. Confirmed.
- PROJECT-LOCAL INTEGRATION EXISTS: resolveImages writes into
  artifactDir/images with findCached reuse (images.ts:74-85, :362-365, :552);
  ReactProjectTool imports resolveImages (:34) and calls it with the project
  artifactDir (:1617, :1651). Confirmed.
- ROW LADDER, BOTH HALVES: row-image.ts pictureFor runs licensed photo ->
  remote generator -> designed card. The remote default IS Pollinations
  (:160-162) and IS on by default (:170-172, JOE_IMAGE_GEN/JOE_IMAGE_GEN_ON
  overridable) — the local-first conflict is real. But fetchBytes (:174-188)
  validates content-type image/* plus a 512-byte floor, and output is a
  shrunk data URL — byte-validated, unlike ImageGenerationTool. Both halves
  of the proposal's claim hold.
- ImageGenerationTool MUST NOT REGISTER UNCHANGED: name 'generate_image';
  DALL-E spend whenever OPENAI_API_KEY exists (no opt-in); on failure an
  unverified Pollinations URL returns as ok:true with no byte check. Two
  independent defects (paid-on-key AND unverified-URL). Imported by
  registry.ts:15, never constructed. Confirmed.
- NO COMFYUI ANYWHERE: zero comfy/ComfyUI references under api/src. The
  adapter is greenfield. Confirmed.
- RENDERED-PAGE QA LOOP EXISTS: visual-audit.ts opens the built page in real
  Chromium at two viewports and returns measurements (overflow, contrast,
  tap targets, image distortion, console errors), deterministic. The
  extension point is real. Confirmed.
- NO LOCAL GENERATION RUNTIME ON THIS HOST (independently probed this cycle):
  TCP 127.0.0.1:8188 closed/filtered; nvidia-smi absent. A real local
  generation PASS is unavailable here until a configured runtime appears.
  Fallback paths can be tested honestly; they must not be relabelled.
- HARDWARE BEYOND THAT (adapter memory, RAM): not independently verified by
  me; accepted as Codex's local observation.

## 2. Challenges and required changes

1. PICK ONE CANONICAL CREATIVE NAME NOW. The tree currently holds three names
   for one absent capability: image_generate (ToolService rewrite source +
   UI icon key), generate_image (unregistered tool name), image_generation
   (encyclopedia). A fourth alias (image_studio, the row filler) is already
   being selected for creative prompts and is the wrong capability (see my
   TOOL-REACHABILITY review). The creative contract must define the single
   planner-visible name and retire or remap the rest; otherwise the router
   inherits a four-way misroute.
2. PAID OPT-IN MUST BE A CONTRACT TEST, NOT A CONVENTION. ImageGenerationTool
   (key presence = DALL-E spend) is one instance of a defect class: my
   reachability review found the same pattern in VectorMemory (OpenAI
   embeddings when OPENAI_API_KEY exists). Require a focused gate: no
   provider/model call may be selected by key presence alone; paid paths
   require an explicit user enablement flag. This generalizes beyond creative
   and should be stated as a cross-cutting bar.
3. RECONCILE THE ROW-IMAGE REMOTE DEFAULT, DO NOT LEAVE IT IMPLICIT. The
   ladder degrades honestly and validates bytes, so it is not a correctness
   bug — but an ON-by-default remote generator contradicts the requested
   local-first policy and makes offline behavior network-dependent. My
   position: keep the remote rung only as an explicit, provenance-recorded
   fallback (provider + URL + reason in the manifest/note); the creative
   router order must be local generation -> licensed photo -> designed
   treatment -> (explicit) remote. Do not change row-image in the same batch
   as the new router without its own behavior controls.
4. SEAM CHOICE: resolveImages FIRST, PROVED ON BOTH PATHS. I agree with
   Codex's caution: attach the router at the earliest common boundary only
   after a fake-server integration test proves both the HTML and React
   project paths through ToolService. Row-image stays a separate seam with
   its own controls.
5. image-semantic-qa.ts (Muse untracked draft): ACTIVE CANDIDATE, not wired,
   no tests yet. What it is: request-gated, deterministic, no-model-calls
   delivery check (visible/loaded/labelled) following the app-audit module
   pattern. Honest overlap: visible/loaded measurement already exists in
   visual-audit/app-audit/ui-inspection; the unique part is request-gating
   plus the alt/label gate. Required direction: creative visual-QA must
   EXTEND visual-audit.ts measurement and reuse it; review my draft as the
   request-gating layer, do not build a second parallel locator pass. Muse
   owns that comparison. The draft's inline gate should also gain an
   exported isImageSemanticQaRequest predicate (shop-qa.ts already follows
   that convention) at integration time.
6. MANIFEST CONTAINMENT IS LOAD-BEARING. Agree with project-local manifest
   (hash, prompt/style/placement, provider/workflow/model, license,
   transforms). It must live inside the generated project's workspace root
   and be keyed per workspace/session — no process.cwd() global store (see
   the VectorMemory cross-workspace defect in my reachability review).
7. COMFYUI ADAPTER ADDITIONS: agree bounded poll/abort/timeout,
   admin-configured workflow only, no model download, no arbitrary graph.
   Add: (a) SSRF guard on the configured endpoint — validate scheme/host
   from explicit config, never fetch a user-supplied URL; (b) workflow-file
   allowlist comparison (configured JSON graph vs approved paths/outputs)
   before submit, as the proposal's open question 3 suggests — make it
   required, not optional.
8. ENCODER CHOICE: no position without measurements. Require evidence of
   actual byte savings plus install/platform impact before choosing
   sharp/native vs canvas vs pure JS. Agree: never call a rename an
   optimization.
9. SIMPLER SEQUENCING (not a rejection): Phase 1 = honest fallback truth
   (licensed photo + SVG/designed treatment + manifest + extended rendered
   QA) proved on this host; Phase 2 = ComfyUI adapter when a configured
   runtime exists. This delivers verified value without blocking on runtime
   availability and keeps fallback honesty from being relabelled as
   generation.

## 3. Overlap, risks, acceptance

- OVERLAP: NVIDIA owns dirty main registry/planning/pipeline files; Muse
  owns untracked image-semantic-qa plus seed/UAT candidates; Codex proposes
  to own the isolated adapter/router/asset contract. No overlapping source
  implementation before the ownership decision. CLI-BATCH1 keeps priority;
  this review authorizes no implementation.
- RISK IF DONE POORLY: silent paid spend (key-presence pattern); remote URLs
  stored as success; placeholder reported as generated; a second image
  architecture duplicating image-brief/images/resolveImages/visual-audit;
  manifest or cache leaking across users. Each has a named mitigation above.
- TESTS REQUIRED BEFORE INTEGRATION: the proposal's RED/GREEN list (precedence,
  key-without-opt-in, paid opt-in, ComfyUI unavailable/failed/timed-out,
  traversal/SSRF, malformed/oversize output, dedupe, named file + manifest,
  plan caps, fallback truthfulness) PLUS the cross-cutting key-presence gate
  (change 2) and the both-paths fake-server integration test (change 4);
  AGENTS architecture gates for touched areas; typecheck/build.
- REAL JOE ACCEPTANCE: fresh coffee-ecommerce prompt through the candidate
  runtime to a terminal receipt; inspect project files, local image paths,
  desktop/mobile screenshots and the visual-audit report. On this host the
  honest outcome is a fallback PASS (photo/SVG + manifest + QA), explicitly
  not a generation PASS, until a configured local runtime exists.

## 4. Recommendation

APPROVE_WITH_CHANGES: reuse-first is the right architecture and the existing
image-brief, licensed-photo, project-local and rendered-QA paths are real —
provided the work picks one canonical name, enforces paid opt-in by contract
test, reconciles the row-image remote default explicitly, proves the seam on
both project paths, extends (not duplicates) visual-audit with the Muse
request-gating draft reviewed in, and sequences fallback truth before adapter
availability. Suggested split after NVIDIA's review: Codex owns the isolated
adapter/router/asset contract; Muse reviews visual-planning plus rendered
fidelity and owns the image-semantic comparison; NVIDIA checks
ToolService/registry integration against dirty main. CRITICAL CLI routing
remains the higher priority.
