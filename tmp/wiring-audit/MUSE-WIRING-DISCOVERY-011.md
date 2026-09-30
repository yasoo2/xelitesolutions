# MUSE Wiring Discovery 011 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 11)
HEAD=97be9d43 + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=browser_ui LEVEL-4 batch-3: remaining 22 (a)-family tools + browser_vision
+ browser_find_text positive/negative, one probe-owned loopback fixture server
(trunk_browser_live3.mts, 30 legs, exit 0, canonical ToolService.executeTool
via firewall runInContext; 28/28 verdict-identical across 2 full runs + 3rd
run spot-identical with 2 added legs) + read-before-call for every executed
tool (all 22 executes in BrowserSmartTools.ts + BrowserVisionTool.ts) +
code-trace of the ToolService honesty rewrite + router resolve sites
EVIDENCE=tmp/wiring-audit/trunk_browser_live3.json + .mts + .log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-010.md (browser_ui 11/33 LEVEL-4)

## Launcher / isolation (same model as 010/F57)

Ephemeral headless only: BROWSER_HEADLESS=true, USE_USER_BROWSER_PROFILE=
USE_SYSTEM_CHROME=BROWSER_PERSISTENT_PROFILE=0 asserted before EVERY leg,
ARTIFACT/SESSION/CONSENT/PROFILE dirs under a probe-run sandbox dir,
approval gate active (AUTO_APPROVE_ALL/SAFE unset, ENABLE_AUTH_BYPASS
unset), loopback-only traffic (127.0.0.1 fixture server, ephemeral port),
all sessions closed + server stopped + all probe-created artifact files
verified then removed by the probe. BROWSER_EXECUTABLE_PATH override used
(no bundled chromium in sandbox — environment, not product). Zero legs hit
an approval gate; zero direct (non-canonical) legs.

## New findings (all Muse-branch @ 97be9d43, live 2/2+ unless marked)

### F61. (a)-family 22/22 LEVEL-4 GREEN via canonical path (trunk now 33/33)

One contained leg per tool against the flawed /audit fixture (no
lang/viewport/charset, 2x h1, dup ids, tabindex, aria-hidden focusable,
h1->h3 skip, no-alt + missing imgs, unlabeled input, empty link,
low-contrast text, console error, table, form, click-marker button):

- seo 48/100, 7 issues, lang+canonical+https flags fire (exact score
  predicted from code: 4 warn + 3 info).
- a11y 58/100, focusables 10, all 5 seeded defects detected (dup ids,
  tabindex, aria-hidden focusable, heading skip, missing nav).
- contrast 24 checked, exactly 1 fail = the seeded LowContrastSeed span.
- console errorCount 3: SeedConsoleErrorEight captured + img-missing in
  netFails (count-split unrecorded — evidence-shape note, §Limits).
- links total 4, broken 1 = /gone only (skip/empty-hash resolve 200).
- perf wallMs + resourceCount numeric; readability 41 words + title.
- meta title/lang''/jsonld 1/og 1/outline 3 (missing lang reported '').
- extract kind=table count=2 firstName=alpha + CSV verified on disk
  (28B, contains alpha) then removed by probe.
- tokens 2 backgrounds/2 fonts/5 sizes + shot; responsive 60/100 with
  viewport issue fired + 3/3 viewport screenshots.
- uiaudit 10/100, 8 issues, viewport+console flags, reused:false.
- uiaudit {} -> honest no_url naming the session (fail-closed, pre-browser).
- compare before/after: 3 changes, CmpBeta detected, pctChanged 0.4,
  composite shot; baseline leg1 baseline:true, leg2 pctChanged 0
  changes 0 (deterministic re-capture diffs to exactly zero).
- fill cityname filled + nosuchfield missed, submitted:false; submit leg
  submitted:true and navigated (loopback /audit?cityname=...).
- click FlipMarker button: urlChanged:false, contentChanged:true.
- click no-text -> no_target; fullpage height + title + shot.
- save_pdf PDF verified on disk (76KB, %PDF) then removed.
- autofix 8 fixes (lang/viewport/charset/alt/labels/h1/desc/links),
  corrected HTML verified on disk (contains lang="en") then removed.
- vision PNG verified on disk (31KB) then removed — standalone launch
  honors BROWSER_EXECUTABLE_PATH (see F64).
- search with contained engine=loopback /fx-search: typedLive:true,
  submitted:true, resultsUrl contained, 2/2 SeedResult parsed,
  answerLen 0 (model best-effort empty, ok still true — see F62).

### F62. Model-fallback trio reports ok:false via the ToolService honesty rewrite

summarize/translate/smart_agent all returned ok:false with the router's
no-provider prose as `error` — WHILE carrying full computed output
(summarize sumLen 252 + screenshot; translate target+7 blocks;
smart_agent scores 75/54/70 + 8 findings). Traced end to end:

1. routeToModel's no-provider path RESOLVES (not throws) with
   PROVIDER_FAILURE_PREFIX prose (intelligent-router.ts:2201/2778/
   2789/2794 — `return`, all four sites).
2. Tool try/catch never fires; non-empty check passes, so the tool-level
   deterministic fallbacks (summarize :885-888, translate :1203-1205,
   smart_agent :1714) are DEAD on this path — they trigger only on
   empty/short model text. Tool returns ok:true with the apology as
   summary/translation/brief.
3. ToolService isApologyOnly(output) (shared/utils/honestResult.ts:
   52-65: text fields contain the prefix + none of 17 ARTIFACT_KEYS —
   url/screenshot explicitly excluded) flips ok=false, error=apology
   (ToolService.ts:940-944, logs honest_result=apology_only).

So honesty here is load-bearing on the central text scan: without it the
apology would flow as step data (the file's own comment cites this
history). Two consequences: (a) smart_agent's 8 findings + 3 lens
scores are computed then discarded — real deterministic work the
planner never sees; (b) search escapes the flip (it reads .content off
the resolved STRING -> '' so no apology text lands in output) and
returns ok:true with real results + empty answer — coherent, since its
results are the deliverable, but the asymmetry is now evidenced.
New CONTRACT_MISMATCH #9 (router resolve-vs-throw vs tool
try/catch+empty-fallback) + WIRING-P2-015.

### F63. Responsive per-viewport hasViewportMeta evaluated but dropped

responsive_check computes hasViewportMeta per viewport and scores on it
(our 60 = viewport penalty + overflow), but the per-viewport output
objects omit the flag (BrowserSmartTools.ts:1297 maps only
name/w/h/overflowX/tiny/smallFonts/wide/screenshot). The detection
surfaces only via score/issues. (My probe's first check read the flag
off the output and got undefined — check artifact, not a tool defect;
the contract omission itself is real.) WIRING-P2-016.

### F64. browser_vision is a THIRD standalone-launch tool (F43 corrected)

009/F43 partitioned 25+2+2+2+1=32, leaving vision unclassified. Read +
live: vision ignores context entirely (execute(input), no browserSid),
chromium.launch()es directly, passes its URL RAW to goto (no
normalizeUrl — data-URLs would work, unlike the (a) family), and writes
process.cwd()/screenshots/screenshot_<ts>.png (fixed name — no user
filename, so no traversal vector, but the cwd-relative dir is the same
portability note as P2-014(b)). Corrected partition: (a) 25 / (b) 2 /
(c) 2 / (d) 3 / (e) 1 = 33. P2-014 extended to cover vision's dir.

### F65. find_text fully closed (positive + both negatives live)

Positive: count=1/snippets=1/highlighted=1 + shot on the fixture;
{url} without query -> no_query; closed-port honest failure was 010.
Body-enforced no_url/no_query (:1326-1327) both proven.

### F66. Compare baselines are process-global (observation)

browser_compare keeps baselines in (global).joeCompareBaselines keyed by
bare URL — shared across users/sessions in one process, refreshed on
every diff call. No failure observed (leg2 diff-then-refresh behaved),
but a second user's first call on the same URL would diff against the
first user's baseline instead of capturing its own. WIRING-P2-017
(session-scope or document).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=2/19 fully storied (files 10/10 + browser_ui 33/33 LEVEL-4:
25 (a) + 2 (b) + 2 (c) + 3 (d) + 1 (e); per-tool rows in matrix)
BROWSER_UI_LIVE3=30 legs exit 0, 0 timeouts, 0 approval gates, 0 direct
legs; 28/28 verdict-identical across runs 1+2 (ports/timestamps/scores
normalized for compare AND exact scores identical: seo 48/7, a11y 58,
contrast 94/1, console 3, links 4/1, responsive 60, uiaudit 10, smart
75/54/70, compare 3/0.4, base2 pct 0); run 3 added findtext x2 (green)
with key legs spot-identical; 19 artifact files created + all removed
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=9 confirmed (new #9: router resolve-vs-throw vs
tool empty-fallback; honesty depends on ToolService text scan) + P2-016
tool-local omission + P2-017 session-scope observation
REAL_JOE_PROVEN=no new UAT (focused runtime probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-015 (model-fallback contract: router resolve-vs-throw;
  dead tool fallbacks; smart_agent partial-output loss).
- NEW WIRING-P2-016 (responsive per-viewport hasViewportMeta dropped).
- NEW WIRING-P2-017 (compare process-global baselines session-scope).
- EXTENDED WIRING-P2-014 (vision cwd screenshots dir joins the review).
- LIFTED nothing; no new embargoes. find_text positive closes its row.

## Corrections to prior checkpoints

- 009/F43: session-mechanism partition corrected — (d) standalone-launch
  has 3 members (screenshot, visual_compare, browser_vision), not 2;
  vision classified (was the uncounted 33rd). Partition now sums to 33.
- 009/F44 + matrix TOOL-browser_ui_fix row: unchanged (repair body still
  deliberately unprobed — write+execute+build needs a fixture project).
- 010 limits "22/25 (a)-tools pending": CLOSED — 22/22 live in this
  checkpoint; find_text positive also closed (was the last (a) gap).
- Probe-check correction (mine, not product): live3's first responsive
  check read hasViewportMeta off per-viewport output where the tool
  never puts it; the tool behavior (score/issues) is correct.

## Limits / UNKNOWNs

- browser_run instructionText->model path still unprobed (needs provider).
- Model-present behavior of summarize/translate/smart_agent/search-answer
  unprobed (no provider in sandbox; offline shapes fully evidenced).
- user_browser helper-present path unprobed (no extension available).
- page_fix positive + ui_fix repair body deliberately unprobed (shared
  session / build+write; fixture design owed).
- console errorCount=3 count-split (console vs page vs net) unrecorded —
  seeded signals both captured; split is a minor evidence-shape gap.
- visual_compare same-size-different-pixel case still unstaged.
- Verification-compat sweep still pending (LEVEL 5-6).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $fx='<worktree>\tmp\wiring-audit\fx-browselive3run' (any writable dir)
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
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_browser_live3.mts
Expected: exit 0; BROWSELIVE3_DONE legs=30 timeouts=0; JSON verdicts per
F61-F66 (scores: seo 48/7, a11y 58, contrast 94/1, console 3, links 4/1,
responsive 60, uiaudit 10, smart 75/54/70, compare 3/0.4, base2 pct 0;
trio ok:false with provider error + full output; search ok:true typed).
Probes remove fixture files/sessions/artifacts; delete $fx after.
NOTE: redirect to file (pipe flake); system TEMP may be sandbox-denied.
