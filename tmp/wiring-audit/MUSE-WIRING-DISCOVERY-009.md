# MUSE Wiring Discovery 009 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 9)
HEAD=d5f51787 + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=browser_ui trunk batch-1 declaration + self-grounded selection survey
(trunk_browser1.mts, exit 0, read-only: registry + selectToolsFor only, zero
tool executions) + targeted source reads for session-binding mechanisms
EVIDENCE=tmp/wiring-audit/trunk_browser1.json + trunk_browser1.mts (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-008.md (files trunk 10/10 storied)

## New findings (all Muse-branch @ d5f51787, independently executed/read)

### F42. browser_ui 33/33 SELECTABLE_BY_KEYWORD (32 rank-1)

All 33 trunk members rank in the keyword top-30 on self-grounded goals
(32 best-rank-1). The single non-rank-1 is `screenshot` (rank-2): on the
self-name goal "use screenshot for this task", `user_browser` scores 7.8
vs `screenshot` 7.1, because user_browser's description names 'screenshot'
as one of its actions ("open | read | screenshot | click | type | status",
UserBrowserTool.ts:19-24). Minor ranking curiosity, both selectable — not
a defect, no batch.

### F43. FIVE session-binding mechanisms in one trunk (contracts differ)

Only 4/33 declare a session-ish input (`sessionId`), 2 require it. Source
reads show session binding is split across five mechanisms:

(a) Context-derived, 25 tools (all BrowserSmartTools.ts): `browserSid(
context)` — explicit `context.browserSessionId`, else
`browser:${context.sessionId}`, else throw `browser_session_required`
(BrowserSmartTools.ts:21-27). No declared session input. The old shared
`panel-browser` fallback was deliberately removed (comment :17-20) to stop
cross-session page mutation.
(b) Input-required, 2 tools: `browser_action` (required sessionId+action,
BrowserActionTool.ts:27, `getBrowserSession(sid)` :44) and `browser_run`
(required sessionId; also subject to the ToolService injection in
WIRING-P2-008).
(c) Optional session + fallback, 2 tools: `browser_page_fix` (optional
sessionId, required url) and `browser_ui_fix` (optional sessionId, no
required; `context?.sessionId || input?.sessionId`, project lookup falls
back to a 'default' key, UiFixTool.ts:51-53).
(d) Standalone launch, 2 tools: `screenshot` + `visual_compare`
(ScreenshotTool.ts) call `chromium.launch()` via
`getChromiumLaunchOptions` — URL-in/screenshot-out, no session at all.
(e) Separate real-browser channel, 1 tool: `user_browser` drives "the
user's OWN real browser ... via the installed Joe browser [helper]"
(UserBrowserTool.ts:19) — distinct architecture from the managed sessions.

No tool is session-ambiguous at rest, but the planner-facing contracts
differ: (a) needs a context session the planner never names, (b) needs an
explicit id, (d) needs none. Per-tool winner/contract stories must record
which mechanism each name uses before LEVEL-4 live work.

### F44. browser_ui_fix {} -> honest no_project (code-indicated, unprobed live)

`browser_ui_fix` declares NO required inputs yet carries write+execute
permissions. Its execute resolves `dir` from `input.projectDir` or the
session's project entry and returns `{ok:false, error:'no_project'}` when
absent (UiFixTool.ts:60-64). Honest failure shape, code-indicated. As a
write+execute tool it was correctly NOT live-probed in this read-only
batch; any future live call needs a throwaway fixture project + an
expected no_project control first.

### F45. 25/33 declare EMPTY sideEffects, incl. state-changing tools

25 browser names (incl. browser_click, browser_fill_form, browser_action
family members — full list in trunk_browser1.json) declare `sideEffects:
[]`. Clicking/filling/navigating mutates page state, so the declaration
is planner-facing signal debt, not a behavior defect. New WIRING-P2-011
(declaration honesty for mutating tools; distinct from P2-003's
boot-defaulted permissions — this trunk has ZERO boot-defaulted names).

### F46. Permission families in trunk (all explicitly declared)

internet-only 23; internet+write 4; internet+execute 2; read-only 2;
write+execute 1 (browser_ui_fix); internet+read+write 1. No
boot-defaulted permission or rate-limit in this trunk
(trunk_browser1.json agg).

### F47. Router/priority placement: 0 excluded, 0 core-pinned, 3 priority

None of the 33 is ROUTER_EXCLUDED (all ACT-verb routable in principle);
none is CORE_TOOLS-pinned; 3 are PRIORITY_TOOL_NAMES-listed:
browser_action, browser_run, browser_vision.

### F48. browser_launch default URL + consent shape (embargo rationale confirmed)

`browser_launch` resolves its session via browserSid(context) and
defaults its target to `BROWSER_HOME_URL || https://www.google...`
(BrowserSmartTools.ts:2064+). Opening a real external URL by default is
exactly why 008 EMBARGOED it (008 fixture design stands: headless
data-URL, 30s cap, session closed after). Consent is RECORDED by
browser_consent (`grantBrowserConsent(sessionId)` :1882) but launch
itself shows no consent gate in-file — observation only, enforcement may
live in the manager; do not upgrade to a finding without reading
browser/manager consent checks.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=1/19 fully storied (files) + browser_ui batch-1 PARTIAL
(declarations + selection + session survey; live pending)
BROWSER_UI_SELECTION=33/33 SELECTABLE_BY_KEYWORD (32 rank-1, 1 rank-2)
BROWSER_UI_SESSION=5 mechanisms: context-derived 25 / input-required 2 /
optional+fallback 2 / standalone-launch 2 / separate-channel 1
BROWSER_UI_REQUIRED=29 with required inputs / 4 none (compare, consent,
launch, ui_fix)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2 (unchanged)
CONTRACT_MISMATCHES=7 confirmed (unchanged) + P2-011 PROPOSED (tool-local
declaration honesty, not a cross-boundary mismatch)
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery by design)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-011 (mutating browser tools declare empty sideEffects;
  planner-facing signal debt; declare honestly or document why inert).
- No other backlog change. F42/F43/F47/F48 are stories/observations, not
  repair items. F44 joins the "read-before-call" rule already in P2-004.

## Corrections to prior checkpoints

- None. Checkpoint 8 "browser_ui next (33 members, batch it)" is now
  batch-1 done (read-only). Live browser work still requires the
  isolated-process harness + per-tool read-before-call.

## Limits / UNKNOWNs

- browser_ui live behavior entirely unprobed (LEVEL-4 pending): 25
  context-session tools need a session fixture design; standalone pair
  needs a contained-URL design; user_browser needs its helper contract.
- browser/manager consent-enforcement read pending (F48 observation).
- Per-trunk stories: files 10/10 done; browser_ui declarations done.
- 4 EMBARGO fixture designs still unexecuted (need harness).
- Verification-compat sweep pending (LEVEL 5-6).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:TMP='<writable>'; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_browser1.mts > ..\tmp\wiring-audit\trunk_browser1.log 2>&1
Expected: exit 0; trunk_browser1.json with 33 members, 33/33
SELECTABLE_BY_KEYWORD, session partition 4-with-props/2-required,
routerExcluded 0, priorityListed 3. NOTE: redirect to file (pipe flake);
system TEMP may be sandbox-denied, use a worktree-local dir.
