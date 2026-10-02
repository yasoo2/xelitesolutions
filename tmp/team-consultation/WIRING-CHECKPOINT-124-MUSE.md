# WIRING CHECKPOINT 124 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=b98ad0fe (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: dispatch-reachability battery — browser smart family (25/25)
## session-guard FIRST live proof + browser_run/browser_action/
## browser_vision/screenshot/visual_compare/video_action/user_browser/
## google_account/browser_ui_fix/browser_page_fix guard-depth FIRST live
## proof + visual_qa orphan dispatch re-pin + web_search dispatch-side
## divergence live pin (Level 4)
No prior checkpoint took the browser family to live dispatch: 123's
next-step note named it explicitly ("browser smart families beyond
browser_run"). 124 takes all of it to LIVE dispatch via the REAL
executeTool path. Every case stays on a SAFE surface: pre-launch guard
refusals (session/input/connection/project gates) or a read-only status
positive. NO browser is launched (liveBrowserSessionCount 0 before AND
0 after, pinned live), NO navigation is sent, NO model is called, NO
network is touched. Same isolated tsx method as 110-123: canonical test
env (setup.ts: JSON persistence, mock DB, network fetch guard), bypass
OFF (hermetic), full attribution, zero network, CWD = the sandbox dir
itself (tsx by absolute path, all imports absolute), FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-124
(single run; tree preserved). NO AUTO_APPROVE_* set at any point. No
source edited; probe runs left ZERO tracked modifications (tracked tree
fully clean after the run; only pre-existing untracked caches).
Containment verified: fixtures + stores + logs + tsx cache all inside
sbx-tmp-124; read-only absence checks prove nothing landed at the
worktree root or as puzzle_*.png (browser_action never reached page
code). Probe: tmp/team-consultation/muse-124-dispatch-probe.ts;
receipts: muse-124-dispatch-probe.stdout.log/.stderr.log (UTF-16 via PS
redirect like 110-123 — parse with ReadAllText; TSX_EXIT=0 is the
primary verdict, 46/46 regex-confirmed from the JSON block).

## Run-1 result: 46/46 PASS, EXIT 0, failed=0 (first run, no rerun needed)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required' (T5-117
  winner reproduced; divergent-shadow finding guarded; nothing
  executed). PASS.
- S-<25 smart tools> (browser_extract_data, browser_check_links,
  browser_performance, browser_seo_audit, browser_console_scan,
  browser_save_pdf, browser_readability, browser_contrast_audit,
  browser_a11y_deep, browser_extract_meta, browser_compare,
  browser_summarize, browser_ui_audit, browser_fill_form,
  browser_translate, browser_responsive_check, browser_find_text,
  browser_design_tokens, browser_click, browser_fullpage_shot,
  browser_smart_agent, browser_autofix, browser_consent,
  browser_search, browser_launch): EVERY one -> ok=false, no
  executeTool escape, error includes 'browser_session_required' AND
  the 'browserSid' stack frame (err_head='internal_exception: Error:
  browser_session_required / at browserSid (...)'). 25/25 PASS.
  (SESSION-GUARD pin: browserSid is the first execute statement in
  all 25; ToolService injects no session for these names (:562 is
  browser_run/visual_qa/codebase_navigator only); the throw is
  normalized by the ToolService catch :968-970 via formatToolError,
  which returns err.stack for Errors (:45) — hence the
  includes-assertion, never exact equality. The browserSid frame in
  the error PROVES the refusal came from the guard, not from a failed
  launch.)
- S-order-url-still-session-guarded: browser_extract_data with
  {url:'https://example.com'} -> ok=false, still
  browser_session_required (ORDER pin: input shape cannot bypass the
  first-statement guard). PASS.
- B1-browser-run-no-session: {} -> ok=false, EXACT
  'sessionId_required' (handler return BrowserRunTool.ts:247-248, no
  throw; ToolService injected nothing — no context session exists).
  PASS.
- B2-browser-open-alias: {} -> start line 'start browser_run
  (orig=browser_open)' + exact 'sessionId_required' (ALIAS pin
  :344-353: rewrite observable pre-handler; the google-fallback goto
  is built but never runs). PASS.
- B3-browser-get-state-alias: {} -> start line 'start browser_run
  (orig=browser_get_state)' + exact 'sessionId_required' (ALIAS pin
  :354-360, ui_audit action built but never runs). PASS.
- B4-web-search-dispatch-divergence: {query} -> start line 'start
  browser_run (orig=web_search)' + exact 'sessionId_required'
  (DIVERGENCE pin :368-378: DISPATCH resolves web_search->browser_run
  while PLAN resolves web_search->search_api via TOOL_ALIASES at
  plan-tools.ts:234 — second live divergent-shadow instance after
  run_command; planner-path plans never expose it because plan-tools
  rewrites first, so impact is direct-callers only — info-level, no
  new OBS). PASS.
- B5-browser-action-no-own-guard: {} -> ok=false, EXACT
  'sessionId_required' (e.message) + action_failed log
  (MANAGER-THROW pin :44/:196-198: execute(input) takes NO context
  and performs NO own sid check — getBrowserSession(undefined)
  throws pre-launch at manager.ts:1068-1069 and the tool catch
  returns the message exactly). PASS.
- B6-browser-vision-no-url: {} -> exact 'browser_vision needs a url
  to open.' PASS.
- B7-screenshot-no-url: {} -> exact 'screenshot needs a url to
  capture.' PASS.
- B8-visual-compare-no-baseline: {} -> exact 'Baseline screenshot
  not found' (existsSync gate before any read; pure file compare,
  no browser involved). PASS.
- B9-video-action-unknown: {action:'bogus-124'} -> exact 'Unknown
  action' (pre-spawn GUARD pin :56-57). PASS. (Source note only, NOT
  probed: valid actions interpolate inputFile/options into an ffmpeg
  shell string :40-60 — recorded as F-124-1 source-level, no metachar
  ever sent live.)
- C1-user-browser-status: {action:'status'} -> ok=true,
  output.connected=false (POSITIVE pin :39-42: honest no-extension
  state, nothing launched/sent). PASS.
- C2-user-browser-ext-gate: {action:'open', url} -> exact
  'extension_not_connected' (GATE pin :44-47, before sendCommand).
  PASS.
- C3-google-not-connected: {} -> exact 'google_not_connected'
  (GATE pin GoogleAccountTool.ts:55-59: isConnected before
  getAccessToken/gfetch — zero network). PASS.
- C4-ui-fix-no-project: {} -> exact 'no_project' (GUARD pin
  UiFixTool.ts:61-62, before auditBuiltApp/rebuild). PASS.
- C5-page-fix-no-url: {} -> exact 'no_url' (GUARD pin
  PageFixTool.ts:123, before getBrowserSession(PANEL_BROWSER_SID) +
  page.goto). PASS.
- O1-visual-qa-orphan: {} -> ok=false, error='unknown_tool:
  "visual_qa" — did you mean: visual_compare?' (ORPHAN pin: known
  since 072, locked ORPHANED=4 since 085 — now dispatch-unreachable
  LIVE, second orphan re-pin after image_generate/110). PASS.
- Z0-no-browser-launched: liveBrowserSessionCount 0 before AND 0
  after (NO-LAUNCH pin manager.ts:1203: the whole 46-case battery
  refused before session creation). PASS.

## Behavior pins carried (no new OBS this cycle)
- BROWSER_SMART_SESSION_GUARD_LIVE=25/25: the entire smart family
  shares one first-statement session guard and it fires uniformly at
  live dispatch. Consent behavior (grant/check) and all post-session
  behavior remain UNPROVEN (need a session harness — out of hermetic
  scope, explicitly not attempted).
- The browser family uses FOUR different no-session shapes live:
  smart-throw-normalized-to-stack (25), exact handler return
  (browser_run), manager-throw-caught-to-message (browser_action),
  exact input-guard return (vision/screenshot/compare/video/fixes).
  All fail closed; the shapes differ, the direction does not.
- browser_action context blindness (source-traced + live-consistent):
  execute(input) has NO context param, and ToolService session
  injection (:562) covers only browser_run/visual_qa/
  codebase_navigator — so browser_action can receive a session ONLY
  via input.sessionId, never via context. With a non-empty
  input.sessionId it goes STRAIGHT to getBrowserSession (no consent/
  ownership check of its own). Session-less callers are safe (live
  pin B5); session-carrying callers bypass the smart-family guard
  model entirely. Info-level map note, no OBS (no live bypass
  demonstrated — launching was out of scope).
- F-124-1 (source-level, unprobed by design): VideoActionTool
  :40-60 builds `ffmpeg -y ...` by interpolating inputFile/outputFile
  (double-quoted) and options (RAW) into a shell string passed to
  executionEngine.run. Same sink family as F-101-2/F-102-2. No
  metachar payload was or will be sent without ownership; B9 pins
  only the pre-spawn action guard.
- web_search divergence (B4) is the THIRD divergent-shadow live pin
  (run_command T5-117/OBS-118-2; memory pre-gate shadow; web_search).
  Planner-visible behavior is unaffected (plan-tools rewrites to
  search_api before dispatch); direct executeTool('web_search')
  callers get a browser_run. No planner/dispatcher edit proposed
  without ownership.
- Naming-trap map note (source-verified, no behavior claim): class
  BrowserOpenTool registers as 'browser_launch', while the INPUT name
  'browser_open' never reaches the registry (rewritten to browser_run
  at :344). Readers must not confuse the two.
- mockSessions naming resolved (cross-check from the TOOL-HTTP-OWNER
  consultation this cycle): despite the name, it is the PRODUCTION
  disk-backed local session store (chat-store.ts persists it), the
  same store sessionController reads — not a test double. The 6965d584
  local-branch session lookup therefore reads genuine session state.
- ai_write positive path REMAINS unproven (by design, zero spend).
  delete_file handler REMAINS unproven behind the high gate. Valid
  browser navigations/actions are INTENTIONALLY unproven (launching a
  real browser is out of hermetic audit scope). browser_consent
  grant semantics unproven (needs session).

## Verdict
- NO new OBS (all 46 behaviors match source-derived expects; the two
  notable shapes — B4 divergence, browser_action context blindness —
  are info-level pins in already-known classes).
- ONE orphan promoted to live-unreachable (visual_qa, second re-pin).
- Level-4 dispatch PROVEN for 68 tool-level families (33 prior +
  35 new: 25 smart + browser_run + browser_action + browser_vision +
  screenshot + visual_compare + video_action + user_browser +
  google_account + browser_ui_fix + browser_page_fix first live
  proofs) with the gate-vs-handler split on EIGHT gate tools + the
  remote branch, and all four risk levels live-pinned. No repairs
  (audit-first; coordinated ownership).
- 084 P4 + all F/OBS items 086-124 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-123 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/116/
  117/118/119/120/121/122/123; this checkpoint adds the 46-case
  first-run dispatch battery + info-level pins; no run-2 needed).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 124 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=68 tool-level (33 prior + 35 new in 124: 25
  browser-smart session guards + browser_run + browser_action +
  browser_vision + screenshot + visual_compare + video_action +
  user_browser + google_account + browser_ui_fix + browser_page_fix
  first live proofs via executeTool; ai_write positive path still
  unproven — needs a model call; delete_file handler still unproven
  behind the high gate; valid browser navigations/actions
  intentionally unproven — launching is out of hermetic scope)
BROWSER_SMART_SESSION_GUARD_LIVE=25/25 (all throw
  browser_session_required as first statement; browserSid frame in
  every normalized error; zero launch/model/network)
BROWSER_RUN_GUARD_LIVE=1 (B1 exact sessionId_required return)
BROWSER_ALIAS_PINS=2 new (B2 browser_open + B3 browser_get_state via
  the start-line orig field; K2/G1 start-line class stands)
BROWSER_ACTION_MANAGER_THROW_LIVE=1 (B5 exact e.message +
  action_failed log; no own guard, no context param — map note)
BROWSER_INPUT_GUARD_LIVE=5 (B6/B7/B8/C4/C5 exact messages)
VIDEO_ACTION_GUARD_LIVE=1 (B9 exact Unknown action; ffmpeg
  interpolation F-124-1 source-level only, unprobed by design)
USER_BROWSER_POSITIVE_LIVE=1 (C1 ok:true connected:false)
USER_BROWSER_GATE_LIVE=1 (C2 exact extension_not_connected)
GOOGLE_GATE_LIVE=1 (C3 exact google_not_connected, zero network)
NO_BROWSER_LAUNCH_LIVE=1 (Z0: sessions 0 before + 0 after)
EXCEPTION_ENVELOPE_PREFIX=1 ('internal_exception: ' precedes the
  normalized stack in the ToolService catch path — probe-reading pin)
AI_WRITE_POSITIVE_PROVEN=NO (by design: zero spend; guard-depth only)
AI_WRITE_GUARD_PROVEN=YES (122 stands)
GIT_OPS_LIVE=1 (123 stands: op-guard + status success + foreign-cwd
  exact-toplevel + argv-literal + ambient + climb)
GIT_CWD_UNCONTAINED_LIVE=1 (F-100-3 live, 123 stands)
NPM_MANAGER_LIVE=1 (123 stands)
NPM_CONTAINMENT_CONTRAST_LIVE=1 (123 stands)
DOCKER_MANAGER_LIVE=1 (123 stands)
TERRAFORM_GUARD_LIVE=2 (123 stands)
KUBECTL_GUARD_LIVE=1 (123 stands)
KUBECTL_QUOTE_STRIP_LIVE=1 (OBS-123-1 P2 stands, proposed backlog)
SWARM_GUARD_LIVE=2 (123 stands)
REMOTE_GATE_LIVE=1 (123 stands)
REMOTE_GATE_NORMALIZED=1 (OBS-100-4 downgraded, 123 stands)
GATE_BEFORE_REMOTE=1 (123 stands)
ERROR_SUBSTITUTION_LIVE=2 (114/123 stand)
RATE_LIMITER_LIVE=1 (122 A7 stands)
ENVELOPE_STRIP_LIVE=1 (122 OBS-122-1 stands)
WRITE_FILE_POSITIVE_PROVEN=YES (110 stands)
DELETE_HANDLER_PROVEN=NO (X1/X2/X3 gate verdicts only; needs an
  approved-approval harness)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pinned)
GATE_BEFORE_GUARD_PINS=3 (117/121/123 stand)
REFUSAL_PINS=7 (121/122/123 stand)
WS_FILE_SCOPING_LIVE=YES (121/122 stand; git explicitly UNSCOPED per
  123 G3/G5/G6)
GATE_BYPASS_LIVE=2 tools (120 OBS-120-1 stands)
RISK_LEVELS_LIVE=4/4 (114 stands; 124 re-exercises low D1 + medium
  browser battery + high via H4 gate verdict)
RISK_SPLIT=tool-x-input (unchanged; browser_run sensitive-action=high
  per :179-192 untested live — no sensitive action sent by design)
SESSION_OVERRIDE_LIVE=YES (119 stands)
SCOPED_ISOLATION_LIVE=YES (118/119/121/122 stand; git layer
  explicitly excepted per 123)
UNSCOPED_TERMINAL_ACTIONS_REACHABLE=5/6 (118/119 stand)
SILENT_NOOP_VERDICTS=5 (119/120 stand)
WS_TOOL_OWNERSHIP_ASYMMETRY=1 (118/119 stand)
SHADOW_QUARTET_PINNED=4/4 (118 stands; H4 re-pinned in 124)
DIVERGENT_SHADOW=3 (run_command T5-117/OBS-118-2 + memory pre-gate
  shadow + web_search B4-124: plan->search_api vs dispatch->
  browser_run; planner-path impact none, direct-callers only)
ALIAS_TABLE_PROVEN=5 chains + 3 start-line rewrites (110/113/115/117/
  121 chains stand; 124 adds B2/B3/B4 browser rewrites observable via
  the orig field)
ORPHAN_REPIN=2 (image_generate->generate_image->unknown_tool, 110;
  visual_qa->unknown_tool with did-you-mean, 124)
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (120 OBS-120-1 stands)
DUPLICATE=2 relationships (unchanged)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; 124 adds FIFTEEN more
  handler-guard instances: 25 smart session guards + B1/B5/B6/B7/B8/
  B9/C2/C3/C4/C5 — the session-guard layer is now the largest live
  validation class)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin + 123 third pin) + ingress-enforcement
  asymmetry class (118) + verdict-effect asymmetry class (119) +
  pre-gate-shadow class (120) + fallback-scope class (121) +
  envelope-fidelity class (122) + splitter-mutation class (123) +
  session-guard-uniformity class (124: one first-statement guard
  across 25 tools, four no-session shapes, all fail-closed, zero
  launch provable via the session counter)
DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21+25+46
  (110+111+112+113+114+115+116+117+118+119+120+121+122+123+124 run-1
  probes; 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1 18/21 + 123
  run-1 19/23 receipts preserved; 124 first-run green, no run-2)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: ai_write_file POSITIVE path when a provider is available,
ProjectPipeline/ProjectRun handler depth — NOTE NVIDIA ACTIVE claim
on pipeline/memory/planner areas, coordinate before probing there) or
the next Codex-requested bounded scope, or OBS-114-1 / OBS-115-1 /
OBS-116-1 / OBS-117-1 / OBS-117-2 / OBS-118-1 / OBS-119-2 / OBS-120-1 /
OBS-120-2 / OBS-121-1 / OBS-121-2 / OBS-122-1 / OBS-123-1 ownership/
repair proposals at a coordinated checkpoint. No registry/ToolService/
tool edits without ownership.
