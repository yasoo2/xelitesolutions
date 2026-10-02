# WIRING CHECKPOINT 093 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=e4981e0d (exact; tracked clean; source identical to 950c819b —
intervening commits docs/evidence only)

## Scope: browser_open / NEEDS_BUILT_URL cleaning trace (092 next step)
093 traces the legacy `browser_open` name and the NEEDS_BUILT_URL url-injection
set across offer -> plan-cleaning -> dispatch -> target. Method: source reads
only (priority offer + catalogue + MEANS/aliases, resolvePlannedTool,
adaptPlannedArgs/adaptPlannedArgsFromDescription, PhaseExecutor resolve order,
dispatch rename-ifs, registry, target contracts + execute heads, in-repo caller
search, lock tests). No tool executed, no network, no source edited. Evidence:
this file + cited lines (all paths api/src/... in this worktree).

## Result
1. OFFER: `browser_open` is UNREGISTERED — no `name = 'browser_open'` exists
   anywhere (the class named BrowserOpenTool registers as `browser_launch`,
   BrowserSmartTools.ts:2060-2064). It is therefore absent from PRIORITY
   (browser_run/action/vision only, tool-picker.ts:5-18), from
   PLANNER_TOOL_CATALOGUE (browser_run :112, browser_ui_audit :113 only),
   from TOOL_ALIASES (no browser entries, ToolService.ts:212-249), and from
   provider scoring (unregistered names are never scored). `browser_launch`
   IS registered (registry.ts:259) but is NOT in priority/catalogue — offered
   via scoring only (tags include 'browser', +120 when wantsBrowser, :59).
2. PLAN-CLEANING: resolvePlannedTool('browser_open') has no exact / alias /
   normalised hit, so it falls to the MEANS contains-loop (`browser` ->
   browser_run, plan-tools.ts:247-253) and returns {browser_run, meaning}.
   Same fate for NEEDS_BUILT_URL siblings `browser_screenshot` and
   `browser_extract` (both unregistered; real tools are browser_fullpage_shot
   :1558, browser_extract_data :168, browser_extract_meta :647).
3. DEAD INJECTION ENTRIES: PhaseExecutor resolves FIRST (:1394) and adapts
   the RESOLVED name (:1402 `toolName = resolved.tool`, :1499-1500), so
   NEEDS_BUILT_URL's entries for browser_open/browser_screenshot/
   browser_extract (plan-tools.ts:1291) can NEVER fire on the canonical path
   — resolvePlannedTool can never return those names (F-093-2). Only
   `browser_ui_audit` (registered :902, catalogue :113) is a live member.
4. SILENT URL DROP + RECOVERY: after resolution the plan's top-level `url`
   is silently dropped — browser_run's schema has NO top-level url
   (BrowserRunTool.ts:111-141; url exists only as actions[].url :122).
   plannedArgsIssue would reject a bare-url task (instructionText/actions
   required, :1325-1348), but adaptPlannedArgsFromDescription recovers
   description -> instructionText (:1581-1589). Net effect: "open URL X"
   becomes an agentic browser run on the description text, not a navigation
   to X (F-093-1, same fork CLASS as F-091-1/F-092-1: path-dependent meaning).
5. DISPATCH: direct executeTool('browser_open') renames to browser_run and
   unshifts {goto, url}; empty url + no actions -> google.com goto
   (ToolService.ts:344-353). DEFENSIVE-ONLY: zero in-repo direct callers
   (searched api/src for executeTool('browser_open')). The canonical planner
   emits `browser_launch` instead (PlanningEngine :966/:2649/:2834/:2974
   with {url, request, readContent}; routing map :234; fallback :3377; the
   `browser_open_*` strings there are task IDs, not tool names).
6. TARGET browser_launch (BrowserSmartTools.ts:2060-2125): REAL — live-stream
   kick, openPage, title/readContent/screenshot evidence, honest
   page_content_empty/open_failed errors. url optional with BROWSER_HOME_URL
   or google default (:2086). By design needs no NEEDS_BUILT_URL injection.
7. REAL SHOT/EXTRACT TOOLS UNINJECTED (F-093-3): browser_extract_data
   requires url (:172) and fails honest bare `no_url` (:179); it is NOT in
   NEEDS_BUILT_URL, so a plan with empty args fails at execution instead of
   receiving the built preview URL — inconsistent with the set's evident
   purpose. browser_fullpage_shot / browser_extract_meta likewise outside
   the set (their empty-url behavior NOT traced this checkpoint).
8. DEAD RATE-LIMIT BRANCH (OBS-093-4): the `name === 'browser_open'`
   alternative (ToolService.ts:74) is unreachable — the bucket key is
   computed from post-rename effectiveName (:788), which can never be
   'browser_open'. Direct browser_open calls land in the browser_run bucket.
   (Also a harmless trailing space in the key template :75.)
9. INTENT LABEL, NOT A TOOL (OBS-093-5): context-engine.ts:147
   `secondary = 'browser_extract'` is follow-up-intent metadata (decl :28)
   with no tool-dispatch consumer found. Likewise the 'browser_screenshot'
   strings in ws.ts:523 / BrowserSmartTools.ts:44 / WebPageBuilderTool.ts:2063
   are UI broadcast-event types, not tool references.
10. LOCK TESTS: ZERO tests reference browser_open/browser_screenshot/
    browser_extract as tools (wiring-policy.test.ts:184 is a comment only).
    The dispatch rename, google fallback, dead NEEDS_BUILT_URL entries and
    the MEANS reroute are all UNPINNED. NEEDS_BUILT_URL injection is pinned
    ONLY for browser_ui_audit (quality-phase-address.test.ts,
    pipeline-quality.test.ts, verify_pipeline_quality.ts).

## Verdict
- browser_launch: FULLY_WIRED (registered, deterministic-planner-emitted
  with compatible args, direct dispatch, real implementation, honest
  errors). Offer caveat: scoring-path only, not in PRIORITY/catalogue.
- browser_open: PLAN-PATH-DIVERGENT (F-093-1) + DISPATCH-DEFENSIVE.
  Unregistered name, not an orphaned tool.
- browser_screenshot / browser_extract: DEAD-NAME entries (F-093-2).
- browser_ui_audit: live NEEDS_BUILT_URL member (injection path intact).
- builtPreviewUrl (:1228-1253: live-url then dist/index.html fallback, ''
  when no build) and hasFreshBuilderAudit (:1255-1259) unchanged; consumer
  is effectively ui_audit only.
- F-093-1 (new, SIGNIFICANT, not repaired): plan-path browser_open means
  "agentic run on description" while dispatch-path means "goto url".
  Recommended direction (coordinated ownership): either map browser_open ->
  browser_launch at cleaning (name-preserving, keeps url), or remove the
  MEANS `browser` catch for multiword browse names so plans fail honestly,
  + pin. Do NOT silently keep the substitution.
- F-093-2 (new, SIGNIFICANT, not repaired): 3 of 4 NEEDS_BUILT_URL members
  are unregistered dead names. Recommended direction: replace with the real
  registered names (or delete the dead entries with a comment), + pin each
  member's injection behavior.
- F-093-3 (new, minor, not repaired): real shot/extract tools outside the
  set; extract_data fails bare no_url instead of receiving the built preview.
  Recommended direction: decide membership deliberately per tool + pin.
- OBS-093-4/OBS-093-5: dead rate-limit alternative; intent-label/event-type
  names that look like tools but are not. Pin-or-remove, no behavior change
  without ownership.
- Recommended direction (backlog, coordinated ownership): resolve F-093-1
  mapping + F-093-2 set membership + F-093-3 per-tool decision + pin the
  rename/fallback/reroute. No picker/registry/ToolService/plan-tools edits
  without coordinated ownership.
- Observed for future checkpoints (not 093 scope): github_pr wiring,
  db_schema_migrator action gate (:1358-1363), fullpage_shot/extract_meta
  empty-url behavior. One family per checkpoint.

## Locks carried (not rerun: api/ registry/picker/ToolService/plan-tools/
## BrowserSmartTools/BrowserRunTool/PlanningEngine unchanged since 086;
## HEAD moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual hazard open.
- 088: github chain coherent, F-088-1 open.
- 089: read_file_tree mapped, F-089-1 open.
- 090: grep family FULLY_WIRED at dispatch, F-090-1 + F-090-2obs open.
- 091: browser_run FULLY_WIRED, web_search fork F-091-1, F-091-2/F-091-3,
  OBS-091-4 open.
- 092: git_ops FULLY_WIRED, F-092-1/F-092-2/F-092-3, OBS-092-4/OBS-092-5 open.
- 084 P4 + F-086-1 + F-088-1 + F-089-1 + F-090-1 + F-090-2obs + F-091-1 +
  F-091-2 + F-091-3 + OBS-091-4 + F-092-1 + F-092-2 + F-092-3 + OBS-092-4 +
  OBS-092-5 + F-093-1 + F-093-2 + F-093-3 + OBS-093-4 + OBS-093-5 await team
  review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=6/19 (unchanged; 093 is a cleaning-trace follow-up,
not a new priority family)
CLEANING_TRACE=browser_open/NEEDS_BUILT_URL mapped (1 live member of 4)
ALIASES=28 ALIAS_BROKEN=0 (F-093-1 is a MEANING fork, not a broken alias)
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
github_pr wiring, or db_schema_migrator action gate, or the next
Codex-requested bounded scope. No picker/registry/ToolService edits
without ownership.
