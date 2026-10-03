# WIRING-167 -- Browser observation/fix backbone census, live-verified (Muse independent)

MUSE_HEAD=25dcca82 (tracked CLEAN at probe time; all 167 outputs new under tmp/wiring-167-browser-chain/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-03T00:4xZ (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha 3B94ADC1...); definition/registry/dispatch/ledger/picker/planner/executor files READ as text. ZERO DISPATCH: executeTool never called, no browser launched, no files written, no commands ran, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). Same disclosed recipe as 163/164/165/166: esbuild (api/node_modules), packages:'external' + NODE_PATH=api/node_modules; bundle + build script deleted after runs, entry + logs + results + jest log preserved. Harness side effects disclosed: registry import touched a 0-byte cwd-relative logs/application-2026-10-03-03.log stub (0 chars verified, no payload); data/db/users.json mtime untouched (2026-09-27); jest cache/tmp dirs removed after the run. Absolute-path invocation required: sandbox cwd is a \\?\ UNC path that node/cmd cannot resolve relatively (EISDIR lstat 'D:' + "UNC paths are not supported"); Set-Location to a plain path fixed the jest run.

## TRIGGER
The browser chain is Muse's strength lane (browser/UI intelligence) and the backbone every Real Joe
UAT depends on: open -> observe -> screenshot -> QA -> fix. Chain 164 proved visual_qa orphaned at
the ledger layer; 167 re-proves the whole backbone live (registration, catalogue, meaning resolution,
redirects, gates) and adjudicates the loose browser vocabulary (browser_open/get_state/snapshot/
web_search/extract/screenshot) plus the exact-name security posture of the screenshot writers.

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163 (eighth independent live count this week); chain 5/6 registered (browser_action,
  browser_run, browser_vision, screenshot, browser_page_fix). visual_qa NOT registered (orphan
  reconfirmed, third cycle). Adjacent 2/2 registered (browser_smart_agent, visual_compare).
  hasExecute=true for all 7 registered; mockSupported=false for all 7.
- visual_qa is IMPORTED in registry.ts:14 but never instantiated (no safeNew/new), while
  BrowserActionTool (:79/:162), BrowserVisionTool (:80/:163), ScreenshotTool (:94/:164),
  BrowserRunTool (:3/:228), PageFixTool (:5/:234), UiFixTool (:4/:232) are imported AND
  instantiated. Same orphan shape as generate_image (imported-not-instantiated), unlike bulk (0 refs).
- CORRECTION: browser_ui_fix (my 8th phantom candidate) is REGISTERED=true (live probe). It is a
  real tool in UiFixTool.ts (:28, instantiated :232) that my filename pre-scan missed. True
  phantoms are 7/8: open_browser/click_button/take_screenshot/browse_web/fix_webpage/check_website/
  view_page -> ALL false/false/null.
- HEALTHY REDIRECT FAMILY (contrast with 166): browser_open, browser_get_state, browser_snapshot,
  web_search are all UNREGISTERED plan-emitted names with LIVE ToolService code redirects to
  browser_run (:344/:354/:361/:368, each synthesizing goto/ui_audit actions). No definitions file
  declares any of the four as a tool name (grep 0). PlanningEngine emits browser_open plans
  (:960/:2647/:2832/:2972/:3375); BrowserSmartTools :2061-2062 documents the alias ("name is
  'browser_launch' NOT 'browser_open' because ToolService aliases browser_open -> browser_run").
  Redirect target IS registered: the healthy shape. browser_open additionally sits in a ToolService
  :74 special-case with browser_run and visual_qa.
- VOCABULARY DRIFT: browser_extract / browser_screenshot appear as NEEDS_BUILT_URL entries
  (plan-tools.ts:1291), a context-engine secondary label (:147), and ws broadcast event types
  (ws.ts:523, BrowserSmartTools.ts:44, WebPageBuilderTool.ts:2063) -- but no tool, no redirect,
  no registration. Real tools are browser_extract_data / browser_extract_meta (both registered).
- PLANNER_TOOL_CATALOGUE: chain hits 2 (browser_run, browser_ui_audit). browser_action/vision/
  screenshot/page_fix/smart_agent/visual_compare/ui_fix NOT catalogued (same class as project_pipeline).
- TOOL_ALIASES: 0 chain hits (alias=null for all 7 registered + 8 phantom candidates).
- resolvePlannedTool live, 10 phrases: 3 exact (browser_action, browser_page_fix, screenshot) +
  2 meaning-ok ('open the homepage in a browser and summarize...'->browser_run,
  'run browser QA on the preview and fix any failures'->browser_run) + 1 nearest-ok
  ('take a screenshot of the dashboard'->screenshot) + 1 MISROUTE ('click the login button on the
  homepage'->auth_builder via meaning: a browser-click intent hijacked by an auth builder) +
  3 UNKNOWN (exact 'visual_qa', 'check this page for visual defects and layout problems', and the
  'read the contents of package.json' CONTROL). The control did NOT resolve: the resolver is
  narrow (positive proof rests on 3 exact + 3 meaning/nearest, honestly reported, not hidden).
- Gate shapes, 3/3 FALSE: action/vision/pagefix shapes. Correct: none is a verifier. browser_run
  verificationUnconditional=true (the chain's catalogued verifier tool; ledger census unchanged).
- Registry log live: "Registered 163 tools (71 revived)" (unchanged).
- registryTestRefs: 17 class-name occurrences (6 imports + 6 instantiations + 5 surrounding).
- plan-tools refs: browser_run catalogue entry + MEANS keys (cypress/playwright/selenium/browser->
  browser_run; lighthouse/accessibility->browser_ui_audit) + strict browser_run action-shape
  validation (non-array/empty/missing-type/unsupported-type all rejected pre-browser, correct).

## SOURCE READS (Muse HEAD; partial reads disclosed per file)
- VisualQATool.ts (106 lines, sha D54694B6, FULL READ): object-literal def, perms read+internet,
  sideEffects [], mockSupported true, rateLimit 5. execute: fs.existsSync + readFileSync on
  input.imagePath with NO workspace containment (any absolute path readable, mitigated ONLY by
  non-registration); routeToModel vision call; JSON.parse on regex-extracted {...} (throw caught
  -> ok:false, fail-closed, fine). Description promises "GPT-4o-Vision" but routes via generic
  routeToModel (doc drift).
- BrowserVisionTool.ts (82 lines, sha 2323718F, FULL READ): perms internet+read+write, sideEffects
  write (declared). Validates non-empty url (prior audit fix, comment cites it); writes
  screenshots/ under process.cwd() with a Date.now() name (predictable temp + cwd-relative, not
  workspace-bound). No scheme check (file:// passes to page.goto -- local-file rendering note).
- BrowserActionTool.ts (head 70/201 lines, sha 70D495DE): session-scoped getBrowserSession(sid) +
  touchSession; sessionId+action required; goto carries a port-open safeguard for local URLs;
  action enum includes evaluate/click_coordinates/solve_visual_puzzle (execute perm declared).
  Lines 71-201 NOT read this cycle.
- BrowserRunTool.ts (head 80/443 lines, sha EC524E9C): canAccessBrowserSession + session/user
  secrets imported; artifactRootDir; localLivePreviewFor localhost-only guard + PORT env;
  namesAnExternalTarget default-inverted with documented WeatherGo-noun-list audit history.
  Lines 81-443 NOT read this cycle.
- ScreenshotTool.ts (lines 1-134 of 269, sha E5D7B004): perms ['read'], sideEffects [] BUT WRITES
  a file to screenshots/ (contract mismatch, same class as the monitoring observation). filename
  taken RAW from input and path.join'ed (:75-85): '../' traversal escapes screenshotsDir
  (source-traced, NOT executed -- no payload was run). Broadcasts /screenshots/<filename> URL.
  Lines 135-269 incl VisualComparisonTool NOT read this cycle.
- PageFixTool.ts (head 70/303 lines, sha 97B80B80): honest-scope doc (CSS patch for unowned pages,
  inject-preview-measure-save); in-page MEASURE() sampling; mockSupported declared. Rest NOT read.
- UiFixTool.ts (head 60 lines, sha C64E63E6): name browser_ui_fix :28, perms write+execute,
  mockSupported false, sessionKey sanitized, joeProjects[session] dir resolution. Rest NOT read.

## NVIDIA COMPARISON (read-only; HEAD e8fd9589 + dirty; TRUE state via `git -C`)
- 7/7 chain files BYTE-IDENTICAL both lines: BrowserAction 70D495DE, BrowserRun EC524E9C,
  BrowserVision 2323718F, Screenshot E5D7B004, PageFix 97B80B80, VisualQA D54694B6,
  UiFix C64E63E6. NVIDIA ToolService carries the same redirect family (:74/:344/:354/:361/:368).
  ALL 167 source findings hold on BOTH lines. No e8-blob extraction needed (files clean both sides).
- NVIDIA newest bytes re-checked: requested-action.ts 10-03 02:32 == hash 91C75403... (UNCHANGED
  since 165's note), ProjectPipelineTool 02:14. NO new NVIDIA bytes -> CLI D1-D12 NEEDS_REWORK
  stands as reviewed; no re-review owed. Worker untouched, 0 writes there, no process stopped.
- :5002 /api/health this cycle: OK/LOCAL/uptime 108374s/version no-commit-file -> still the OLD
  Oct-1 binary. Fresh UAT would re-test the unreviewed binary: UAT remains BLOCKED.

## CLASSIFICATION (Muse independent position)
- browser_run: FULLY_WIRED (registered + executable + catalogued + meaning-resolved + verifier-
  accepted + healthy redirect target; session-secret guarded per head read).
- browser_action, browser_vision, screenshot, browser_page_fix, browser_smart_agent,
  visual_compare, browser_ui_fix: PARTIALLY_WIRED (registered + executable + exact-or-nearest
  resolution, 0 catalogue; screenshot additionally carries contract/security flags).
- visual_qa: ORPHANED + IMPORTED + GATE/POLICY-REFERENCED (registry-imported :14, ToolService :74
  special-case, PhaseExecutor browser_|visual_qa$ regex :369-371, ledger-accepted per 164 -- same
  166 class: wired at both ends with the middle missing).
- browser_open/get_state/snapshot/web_search: REDIRECT-TO-REGISTERED (unregistered plan names,
  live healthy redirects to browser_run; the positive pattern).
- browser_extract/browser_screenshot: VOCABULARY DRIFT (referenced names, no tool/redirect).
- 7 names: TRUE PHANTOMS. Chain-wide: 3 exact + 3 meaning/nearest + 1 misroute + 3 unknown.

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-167-1 (P1): visual_qa orphan with gate/policy references (registry :14 import, ToolService
  :74, PhaseExecutor :369-371, ledger-accepted). Decide ONE: (a) register deliberately (contain
  imagePath to the workspace, keep rateLimit 5, catalogue/MEANS decision) or (b) REMOVE all
  references so the name fails fast at the planner. Pin the winner with a gate/policy parity test
  (every gate- or policy-named tool must be registered OR the gate must not name it). Evidence:
  live census + registry :14 + ToolService :74 + PhaseExecutor :369-371, identical both lines.
- OBS-167-2 (P2): screenshot filename traversal + write-with-read-perms. Sanitize filename
  (basename + strict allowlist) or drop user-supplied filenames; declare the write sideEffect.
  Negative pins for '../' and absolute subpaths; do NOT catalogue until contained. Evidence:
  ScreenshotTool :57-58 + :75-85, identical both lines. Source-traced only, nothing executed.
- OBS-167-3 (P2): 'click the login button' -> auth_builder meaning misroute. A browser-click
  intent is hijacked by a builder. Needs resolver/MEANS adjudication by the planner owner
  (upstream of this chain; flagged, not patched). Evidence: live resolveOutcomes matrix.
- OBS-167-4 (P3): resolver narrowness (exact visual_qa + visual-defects phrase + file-read
  control all unknown; only browser_run carries browser meaning). After 167-1/167-2: catalogue
  decision or pin exact-only + document. Evidence: live 10-phrase matrix + catalogue hits.
- OBS-167-5 (P3): cwd-relative screenshots/ + Date.now names (vision + screenshot tools).
  Workspace-bound artifact dir + unique temp names (same class as ImageStudio C-conditions).
  Evidence: BrowserVisionTool :57-63 + ScreenshotTool :80-85, identical both lines.
- OBS-167-6 (P4): vocabulary drift (browser_extract/browser_screenshot names, GPT-4o-Vision doc
  line, 7 phantoms) + VisualQATool uncontained-read note folded into 167-1 option (a).
- BATCH note: browser backbone now has live Level-2/3 evidence (5/6 + 2/2 registered, 2
  catalogued, 0 table aliases + 4 healthy code redirects, 3 exact + 3 meaning/nearest + 1
  misroute + 3 unknown, 3/3 gate pins, 7/7 hasExecute, 7 def files read with markers, picker
  2 refs, plan-tools MEANS + strict action validation); Level-6 remains UNVERIFIED. One P1 +
  two P2 + two P3 + one P4 proposed, all review input. The browser_open family is the healthy
  redirect pattern to cite for OBS-166-1.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git status clean apart from new tmp/ evidence).
- Fresh rerun THIS cycle at HEAD 25dcca82: prose-verification 18/18 PASS across 2 suites,
  JEST_EXIT=0, 188.4s (see jest-prose-167.log): contract + final-gate suites green. Invocation
  note: sandbox \\?\ UNC cwd breaks node-relative/npm-cmd resolution; Set-Location to a plain
  path + workspace TEMP/TMP + npm test was the working recipe (3 failed attempts preserved in
  cycle transcript, final green log kept).
- Gate pins ADD browser-surface evidence: action/vision/pagefix shapes correctly rejected (3/3
  false); browser_run stays the chain's only unconditional verifier (no second silent-accept
  shape); visual_qa dies BELOW the ledger (dispatch layer), so gate tests cannot see it --
  needs the registry/gate parity pin (OBS-167-1).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + redirect/alias adjudication + gate-shape
  pins + ledger census + source reads); no browser launched, no tool executed, no UAT (:5002 old
  binary, UAT BLOCKED).
- Probe limitations disclosed: (1) alias=null reflects the TOOL_ALIASES table only; code redirects
  adjudicated by source read; (2) resolvePlannedTool internals not traced -- outcomes only;
  (3) partial file reads disclosed per file above (full: VisualQA/Vision; head: Action/Run/
  Screenshot/PageFix/UiFix); (4) traversal verdict is source-traced (raw input into path.join),
  NOT executed; (5) the file-read control phrase did not resolve -- reported as resolver
  narrowness, not hidden or re-worded post hoc; (6) phantom-list pre-scan error (browser_ui_fix)
  corrected by live evidence and disclosed.
- NVIDIA tree touched READ-ONLY (hashes + git -C reads + read-only greps, 0 writes there).
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
