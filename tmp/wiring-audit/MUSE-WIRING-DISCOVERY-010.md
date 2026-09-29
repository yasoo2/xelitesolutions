# MUSE Wiring Discovery 010 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 10)
HEAD=0a0af4b7 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=browser_ui LEVEL-4 live batch per session mechanism
(trunk_browser_live1.mts 22 cases + trunk_browser_live2.mts 4 tool legs,
exit 0 each, canonical ToolService.executeTool via firewall runInContext;
rerun-stable where noted) + read-before-call for every executed tool
EVIDENCE=tmp/wiring-audit/trunk_browser_live{1,2}.json + .mts (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-009.md (browser_ui batch-1)

## Launcher / isolation (read this first)

F57. This sandbox has NO Playwright bundled chromium (chromium_headless_
shell-1208 absent), so run 1 of live1 failed all launch legs honestly
(browser_launch_failed / browser_unavailable with full cause — itself an
honest-infra-failure proof). Rerun used the documented explicit override
BROWSER_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\
chrome.exe. The probe records launcher={headless:true, hasUserDataDir:
false} and asserts ephemeral flags before EVERY launch
(USE_USER_BROWSER_PROFILE=USE_SYSTEM_CHROME=BROWSER_PERSISTENT_PROFILE=0,
ARTIFACT/SESSION/CONSENT/PROFILE dirs under probe sandbox, approval gate
active, ENABLE_AUTH_BYPASS unset). Binary reuse is NOT profile reuse:
no userDataDir is passed in ephemeral mode, no user profile is read,
written, or cloned. Missing bundled chromium is environment, not a
product defect (manager.ts:677 even suggests the override).

## New findings (all Muse-branch @ 0a0af4b7, live unless marked)

### F49. Standalone-launch pair LEVEL-4 GREEN (canonical, rerun-stable)

screenshot {url:data-URL,title AuditSeven} -> ok:true, 10237-byte PNG at
the reported path (verified on disk, then deleted by the probe;
cleaned:true). screenshot {} -> honest 'needs a url'. visual_compare
self -> match:true diff 0; grown (+64 appended bytes) -> match:true
diff 0.62%; missing files -> honest not-found. The grown case PROVES
the comparison is a byte-size heuristic, not pixel analysis
(ScreenshotTool.ts:244-249): same bytes match, +0.6% size still matches
at threshold 0.1. Two same-size different-pixel images would also
"match" (code-indicated, not staged — staging it needs crafted PNGs).
Code-indicated, NOT probed: `filename` joins unsanitized under
process.cwd()/screenshots (traversal-shaped input never sent).

### F50. browser_action LEVEL-4 GREEN via canonical path, no approval gate

goto data-URL -> ok:true; extract_text returns the page marker
(hasMarker:true); evaluate '40+2' -> 42 (value42:true). internet+
execute with a data-URL classifies PASS under the active gate — risk is
input-dependent (contrast sweep3 browser delete-text HIGH). data-URLs
pass normalizeUrlForGoto unchanged PROVIDED the payload avoids its
substring label table ('GOD MODE' contains-match would rewrite e.g. a
payload mentioning 'amazon' to https://amazon.com — code-indicated at
url.ts:93-99, payload kept label-free; real planner URLs with such
substrings are at risk — noted, not separately batched).

### F51. browser_run.goto REJECTS data-URLs (fresh session, 2/2 reruns)

browser_run [goto data-URL, extract_text] on a fresh owned session ->
ok:false navigation_failed 'invalid URL', pageUrl about:blank
(trunk_browser_live2.json run_goto_data_fresh). The same URL works in
browser_action (F50). The two input-required siblings DIVERGE on URL
vocabulary. (live1's marker-true on this leg was cross-contamination
from the reused session — caught and corrected by the fresh-session
rerun; the JSON keeps both with this note.)

### F52. browser_run DISCARDS extract_text results (output-contract defect)

browser_run [goto loopback-URL, extract_text] -> ok:true with pageUrl
+ title LoopSeven proven, but output keys are ONLY
sessionId/pageUrl/title/screenshotHref/summary/missingSecrets; summary
is generic ('Check browser window for results.'); the page marker is
absent ANYWHERE in output (hasMarkerAnywhere:false, raw capture in
run_extract_raw). The extract action executes and its result is
unreachable to planner/verifier. browser_action.extract_text DOES
return text (F50). New CONTRACT_MISMATCH #8 + WIRING-P2-012.

### F53. browser_launch contained positive (loopback fixture server)

With BROWSER_HOME_URL=http://127.0.0.1:<ephemeral>/ (probe-owned
server, loopback only): browser_launch -> ok:true, sessionUrl +
sessionTitle LoopSeven verified on the live session, session closed
after (2/2 reruns). EMBARGO on browser_launch is LIFTED for the
contained-http case only. BUT about:blank is IMPOSSIBLE: openPage ->
normalizeUrl mangles it to 'https://about:blank' (honest open_failed,
protocol error, live1). The whole (a) family funnels URLs through
normalizeUrl, which has no data:/about:/file: vocabulary — 22 of 25
context-derived tools therefore cannot be pointed at contained URLs
today. WIRING-P2-013. The loopback-fixture-server pattern unblocks
their future LEVEL-4 batch.

### F54. run_empty canonical shape CONFIRMS P2-008 (second live shape)

browser_run {} via canonical path -> forbidden ( NOT sessionId_
required), rerun-stable 3/3 across live1 runs + live2 context. The
ToolService session injection (ToolService.ts:562-568) fills
sessionId before execute()'s guard (BrowserRunTool.ts:248), so the
unnamed-session case is misreported as a foreign-session case. Appended
to WIRING-P2-008 evidence (deny direction safe; verdict wrong).

### F55. Consent story CLOSED (was F48 observation)

Live: isPersistentBrowserMode()=false, hasBrowserConsent(x)=true in
ephemeral mode; enforcement is PlanningEngine's persistent-mode gate
(PlanningEngine.ts:2488-2496) + the consent tool's record path — NOT
in browser_launch, correctly so (nothing to consent to in ephemeral
mode). browser_consent {} -> consent:false/needsConsent:true (no
browser launched); consent with sessionless context -> fail-closed
internal_exception browser_session_required (stack string surfaces in
`error` — observability note, not a defect). No batch.

### F56. Closed-port negative is honest but port-9-shaped

browser_find_text {http://127.0.0.1:9/} -> fast honest failure, but
Chrome reports ERR_UNSAFE_PORT (port 9 is blocklisted), not
connection-refused. Zero external traffic either way. Fixture-design
note: use ephemeral ports for refused-connection negatives, not :9.

### F58. user_browser fails closed without the extension (2 legs)

status -> ok:true connected:false; open(data-URL) -> honest
extension_not_connected. No browser touched, no helper traffic. The
separate-channel mechanism is verified fail-closed at rest; helper-
present behavior remains unprobed (no extension in sandbox).

### F59. (c)-family pre-browser legs honest (canonical, live)

browser_ui_fix {} -> no_project (pure fs check, no browser, no writes).
browser_page_fix {} -> no_url (no browser launched). Positives NOT
probed (see F60).

### F60. browser_page_fix IGNORES session binding (code-indicated)

PageFixTool.execute takes input.sessionId but drives
getBrowserSession(PANEL_BROWSER_SID) unconditionally (PageFixTool.
ts:133) — the shared panel session — then goto + live style injection
on it. This reintroduces the exact cross-session page mutation that
browserSid's no-shared-fallback rule was written to prevent
(BrowserSmartTools.ts:16-20). It also forces https:// (url :124, no
contained vocabulary) and writes the CSS patch under process.cwd()/
data/artifacts (:262-266). Positive deliberately NOT probed (shared
session + external URL + file write). WIRING-P1-004 (session-
ownership bypass in a write tool). UiFixTool only WATCHES the panel
session (audit display, :72/:106) — different, not implicated.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; both probes abort
unless 163)
TRUNK_STORIES=1/19 fully storied (files) + browser_ui batch-2 PARTIAL
(11/33 with LEVEL-4 points: screenshot, visual_compare, browser_action,
browser_run, browser_launch, browser_consent, browser_find_text,
browser_page_fix, browser_ui_fix, user_browser + launcher/consent
stories; 22 (a)-tools pending via the loopback-fixture pattern)
BROWSER_UI_LIVE=live1: 22 cases (launcher + control + 20 legs) exit 0,
no timeouts, zero direct legs needed (no approval gates hit on browser
inputs — contrast files trunk); live2: 4 tool legs exit 0 (Q1-Q4),
Q1-Q3 rerun-identical across 2 runs (ports differ, verdicts same)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=8 confirmed (new: browser_run extract-result
swallow) + P2-008 second live shape + P2-013/P1-004 filed
REAL_JOE_PROVEN=no new UAT (focused runtime probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-004 (page_fix shared-session drive; isolation defect).
- NEW WIRING-P2-012 (browser_run extract-result swallow; output contract).
- NEW WIRING-P2-013 (normalizeUrl contained-URL vocabulary gap).
- NEW WIRING-P2-014 (standalone QA pair fidelity: byte-size heuristic
  labeled 'visual'; screenshot filename/directory containment review).
- EXTENDED WIRING-P2-008 evidence (forbidden-on-{} second shape).
- LIFTED browser_launch EMBARGO for contained-http only (fixture-server
  pattern); external-URL launch remains unprobed by design.

## Corrections to prior checkpoints

- 009/F44: ui_fix {} no_project is now LIVE-proven (was code-indicated).
- 009/F48: consent observation RESOLVED as designed behavior (F55).
- 008 embargo list: browser_launch partially lifted (see above).
- live1 run-1 launch failures were missing-chromium environment, not
  product verdicts; superseded by Chrome-binary rerun (both kept: run-1
  log overwritten by rerun per probe design — first-failure shape
  quoted in F57 from observation, not from a kept file).

## Limits / UNKNOWNs

- 22/25 (a)-tools still need LEVEL-4 (loopback pattern ready).
- user_browser helper-present path unprobed (no extension available).
- page_fix/ui_fix positives unprobed (shared session / build+write).
- browser_run instructionText->model path unprobed (needs provider).
- visual_compare same-size-different-pixel case unstaged.
- Verification-compat sweep still pending (LEVEL 5-6).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last check.

## Reproduction

From api/ with process-only test env:
  $fx='<worktree>\tmp\wiring-audit\fx-browselive' (any writable dir)
  $env:TEMP=$fx; $env:TMP=$fx; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:BROWSER_HEADLESS='true'; $env:USE_USER_BROWSER_PROFILE='0';
  $env:USE_SYSTEM_CHROME='0'; $env:BROWSER_PERSISTENT_PROFILE='0'
  $env:BROWSER_EXECUTABLE_PATH='<installed Chrome/Chromium>'
  (omit only if Playwright bundled chromium is installed)
  $env:ARTIFACT_DIR="$fx\artifacts"; $env:BROWSER_SESSION_DIR="$fx\sessions";
  $env:BROWSER_CONSENT_DIR="$fx\consent"; $env:BROWSER_PROFILE_DIR="$fx\profiles";
  $env:BROWSER_PROFILE_CLONE_DIR="$fx\clones"
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_browser_live1.mts
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_browser_live2.mts
Expected: exit 0 both; live1 BROWSELIVE_DONE cases=22 direct=0
timeouts=none; live2 BROWSELIVE2_DONE; JSON verdicts per F49-F60.
Probes remove their fixture files/sessions; delete $fx after (live2
removes its own fx-browselive2; live1's $fx is yours to remove).
NOTE: redirect to file (pipe flake); system TEMP may be sandbox-denied.
