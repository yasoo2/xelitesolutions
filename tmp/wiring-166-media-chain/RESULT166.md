# WIRING-166 -- Media/image wiring census, live-verified (Muse independent)

MUSE_HEAD=01b6bf23 (tracked CLEAN at probe time; all 166 outputs new under tmp/wiring-166-media-chain/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-03T00:2xZ (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha 5E7CBDDB...); definition/registry/dispatch/ledger/picker/planner/executor files READ as text. ZERO DISPATCH: executeTool never called, no files written, no commands ran, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). Same disclosed recipe as 163/164/165: esbuild 0.27.3, packages:'external' + NODE_PATH=api/node_modules; bundle + build script deleted after runs, entry + logs + results + jest log preserved. Harness side effects disclosed: the registry import created cwd-relative data/ + logs/ bootstrap dirs (empty users.json + log-audit stub, verified secret-free, then removed); jest cache/tmp dirs also removed after the run.

## TRIGGER
The creative-safety review (CREATIVE-SAFETY-BATCH-001) reported image_generate->generate_image->unknown_tool
as an orphan chain and flagged a direct-import paid-generation hazard in the Muse lineage. Both needed
live adjudication on current bytes, plus the reachability of image_studio (registered tool with a
table-oriented contract) and the adjacent video_action tool.

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163 (seventh independent live count this week); chain 1/2 registered (image_studio ONLY).
  generate_image NOT registered. Adjacent 1/1 registered (video_action). hasExecute=true for both
  registered; mockSupported=false for both.
- generate_image is IMPORTED in registry.ts:15 but never instantiated (no safeNew/createTool) while
  ImageStudioTool (:27/:306) and VideoActionTool (:102/:166) are both imported AND instantiated.
  Imported-but-not-registered: one line away from dispatch, unlike bulk_file_generator (0 registry refs).
- REDIRECT image_generate: registered false, catalogue false, alias null. ToolService.ts:551-552
  code-redirects image_generate->generate_image (inside the "[GHOST TOOL FIX]" block), i.e. a redirect
  whose TARGET is unregistered: any plan naming image_generate dies unknown_tool at dispatch.
  tool-picker.ts:13 lists image_generate among candidate names the model may emit. Dead path is complete:
  picker can emit -> redirect rewrites -> dispatch fails. No PhaseExecutor refs, no plan-tools refs.
- Phantoms (8 candidates): create_image/generate_picture/make_image/image_create/picture_generator/
  image_editor/generate_video/video_generator -> ALL TRUE PHANTOMS (0 registration/alias/catalogue).
- PLANNER_TOOL_CATALOGUE: 0 media hits. image_studio and video_action are registered but NOT catalogued
  (same class as project_pipeline in 165). plan-tools.ts contains ZERO occurrences of image|picture|photo|
  video (Select-String count 0): no MEANS keys, no catalogue purposes, no sanitizer/mapper/redirect refs.
- TOOL_ALIASES media hits: 0 table entries for any chain/adjacent/redirect/phantom name.
- resolvePlannedTool live, 10 phrases: 1 exact (image_studio) + 1 nearest-ok CONTROL
  ('take a screenshot of the homepage'->screenshot, proves the resolver works generally) + 8 UNKNOWN:
  exact-name 'generate_image', redirect-name 'image_generate', and all 6 natural media phrases
  ('generate an image of a sunset...', 'create a logo image...', 'fill in the missing product
  pictures...', 'generate a product video...', 'edit this photo...', 'draw a diagram...').
  The planner cannot reach ANY media tool by meaning; only exact 'image_studio' resolves.
- Gate shapes, 3/3 FALSE: genimage/studio/video shapes. Correct: none is a verifier; ledger census
  unchanged (no media name accepted).
- Registry log live: "Registered 163 tools (71 revived)" (unchanged) + same 21-name defaulted list.
- registryTestRefs: 8 class-name occurrences (3 imports + 2 instantiations + 3 surrounding matches).

## SOURCE READS (Muse HEAD)
- ImageGenerationTool.ts (65 lines, sha 03BC9008, object-literal def): execute reads OPENAI_API_KEY and
  calls dall-e-3, else falls back to a seeded URL (lines beyond 60 not re-read this cycle; contract from
  head read). Top-level `import OpenAI from 'openai'` CONFIRMS the direct-import paid hazard on current
  bytes: merely importing the module loads the paid SDK. 0 workspace-identity markers
  (workspaceId/sessionId/userId/resolveToolPath/getActiveRoot all 0); mockSupported declared true.
  Mitigated ONLY by non-registration.
- ImageStudioTool.ts (191 lines, sha 62649361, FULL READ): class tool, perms internet+write. Session-
  scoped via global joeProjects[sessionId] (workspaceId 0/userId 0); writes `.joe-read-tables.mjs` INTO
  the target project dir and a Date.now()-named temp file (predictable temp name); 25s
  Promise.race WITHOUT child cancellation (IMAGE-STUDIO-PRIMARY-DATA C-conditions: unique-tempnames +
  child-cancellation CONFIRMED still open on current bytes). entities.js-only table enumeration
  (primary/secondary split from that review unchanged in this read).
- VideoActionTool.ts (80 lines, sha 6140B8CF, FULL READ): builds `ffmpeg -y ${args}` by STRING
  INTERPOLATION of inputFile/outputFile/options and calls executionEngine.run(command). run() -> execute
  type 'shell' without argv -> runCommandInternal -> spawn(..., { shell: true }) by DEFAULT
  (ExecutionEngine.ts:987-996). Shell metacharacters in options/inputFile/outputFile are interpreted;
  the `custom` action passes options verbatim (arbitrary args by design; trim/extract_frame also pass
  options raw). A safe argv path EXISTS (runArgvInternal, :322) and is NOT used here. Currently
  exact-name-only reachable (unregistered-from-planner-view: no catalogue, no MEANS), which bounds
  exposure but does not fix the sink.
- ToolService redirect block (:541-553) read in full: image_generate->generate_image sits with the
  github ghost-fix redirects; github targets resolve, this one does not.

## NVIDIA COMPARISON (read-only; HEAD e8fd9589 + dirty; TRUE state via `git -C`)
- 4/4 chain files BYTE-IDENTICAL both lines: ImageGenerationTool 03BC9008, ImageStudioTool 62649361,
  VideoActionTool 6140B8CF, tool-picker A9C74909. ToolService:551 image_generate redirect PRESENT on
  NVIDIA side too. ALL 166 source findings hold on BOTH lines. No e8-blob extraction needed (files
  clean on NVIDIA = e8; tracked-clean on Muse).
- NVIDIA dirty mtimes re-checked this cycle: newest is ProjectPipelineTool 10-03 02:14 local, BEFORE
  last cycle's 02:39 check -> NO new NVIDIA bytes since 165. CLI D1-D12 NEEDS_REWORK stands as
  reviewed; no re-review owed. Worker untouched, no files written there, no process stopped.
- :5002 /api/health this cycle: OK/LOCAL/uptime 106547s/version no-commit-file -> still the OLD
  Oct-1 binary. Fresh UAT would re-test the unreviewed binary: UAT remains BLOCKED.

## CLASSIFICATION (Muse independent position)
- image_studio: PARTIALLY_WIRED (registered + executable + exact-name resolution, BUT 0 catalogue,
  0 MEANS, 0 natural-phrase resolution; session-scoped with open temp/cancellation conditions).
- video_action: PARTIALLY_WIRED (same reachability shape; additionally a shell-injection sink).
- generate_image: ORPHANED + IMPORTED + REDIRECT-TARGET + PICKER-LISTED (implemented + registry-
  imported + ToolService redirect target + tool-picker candidate, BUT unregistered: no dispatch path).
  Third orphan shape after visual_qa (ledger-accepted-but-unregistered) and bulk (referenced-but-
  unregistered): this one is wired at BOTH ends with the middle missing.
- image_generate: REDIRECT-TO-ORPHAN (unregistered name with a live code redirect to an unregistered
  target; picker-emittable).
- create/generate/make/image_create/picture_generator/image_editor/generate_video/video_generator:
  TRUE PHANTOMS.
- Chain-wide: exact-name-only resolution (1 exact + 1 control-ok + 8 unknown); catalogue is absent
  for the whole chain (0 hits); the ledger accepts 0/3; plan-tools and PhaseExecutor carry 0 refs.

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-166-1 (P1): dead picker->redirect->orphan path. tool-picker.ts:13 can emit image_generate;
  ToolService :551-552 rewrites to generate_image; dispatch dies unknown_tool. Decide ONE: (a) register
  generate_image deliberately (lazy-load openai, workspace containment, paid-guard, catalogue/MEANS
  decision) or (b) REMOVE the redirect + picker listing so the name fails fast at the planner instead
  of deep in dispatch. Pin the winner with a redirect-target parity test (every ToolService ghost-fix
  target must resolve to a registered tool OR a documented redirect chain). Evidence: live
  redirectStatus + resolveOutcomes + registry :15 + ToolService :551-552 + picker :13, identical both
  lines.
- OBS-166-2 (P2): video_action shell injection. String-interpolated command + shell:true default +
  verbatim `custom` options. Route through runArgvInternal (exists, :322) with an argv array; add a
  negative pin with shell metacharacters in options/inputFile/outputFile; do NOT catalogue until
  contained. Evidence: VideoActionTool :37-62 + ExecutionEngine :315-325 + :987-996, identical both
  lines.
- OBS-166-3 (P2): media meaning-blindness. 8/10 UNKNOWN incl exact names; catalogue 0 hits; plan-
  tools 0 media words. After 166-1/166-2: either catalogue image_studio/video_action + MEANS keys, or
  pin exact-only invocation + document. Evidence: live 10-phrase matrix + catalogueChainHits [] +
  plan-tools grep count 0.
- OBS-166-4 (P3): ImageStudio open C-conditions (from IMAGE-STUDIO-PRIMARY-DATA review, reconfirmed):
  predictable Date.now() temp name + no child cancellation on the 25s race + session (not workspace/
  user) scoping. Reconcile with that review's conditions before any catalogue addition. Evidence:
  ImageStudioTool :33-56 full read, identical both lines.
- OBS-166-5 (P3): ImageGenerationTool top-level openai import. Lazy-load inside execute if ever
  registered; a mock-capable tool must not require the paid SDK at import time. Evidence: :2 import,
  identical both lines.
- OBS-166-6 (P4): phantom vocabulary hygiene (8 names).
- BATCH note: media chain now has live Level-2/3 evidence (1/2 + 1/1 registered, 0 catalogued,
  0 table aliases + 1 code redirect to an orphan, 1 exact + 1 control-ok + 8 unknown, 3/3 gate pins,
  2/2 hasExecute, 3 def files read with markers, picker 1 ref, plan-tools 0 media words); Level-6
  remains UNVERIFIED. One P1 + two P2 + two P3 + one P4 proposed, all review input.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git status clean apart from new tmp/ evidence).
- Fresh rerun THIS cycle at HEAD 01b6bf23: prose-verification 18/18 PASS across 2 suites,
  JEST_EXIT=0, 66.7s (see jest-prose-166.log): contract + final-gate suites green.
- Gate pins ADD media-surface evidence: no media name is ledger-accepted under any flag combo (no
  second silent-accept shape); the dead image_generate path dies BELOW the ledger (dispatch layer),
  so gate-level tests cannot see it -- needs the dispatch-level pin (OBS-166-1).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + redirect/alias adjudication + gate-shape pins
  + ledger census + source reads); no media tool executed, no UAT (:5002 old binary, UAT BLOCKED).
- Probe limitations disclosed: (1) alias=null reflects the TOOL_ALIASES table only; code redirects
  adjudicated by source read; (2) resolvePlannedTool 'meaning' internals not traced -- outcomes only;
  (3) ImageGenerationTool lines 60-65 fallback skimmed, not audited; (4) shell-injection verdict is
  source-traced (interpolated string + shell:true default), NOT executed -- no payload was run.
- NVIDIA tree touched READ-ONLY (hashes + git -C reads + read-only greps, 0 writes there).
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
