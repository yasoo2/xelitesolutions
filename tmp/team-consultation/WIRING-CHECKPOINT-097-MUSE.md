# WIRING CHECKPOINT 097 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=4e650bba (exact; tracked clean; api/src + web/src identical to
dc66a85a and earlier — intervening commits docs/evidence only)

## Scope: browser_extract_meta + browser_fullpage_shot wiring (from 096)
097 traces both tools across offer -> plan-cleaning -> dispatch -> target,
and settles the 096-flagged empty-url question for both.
Method: source reads only (definition, registry, PRIORITY/tag scoring,
catalogue, keyword maps, both PlanningEngine emission routes, dispatch,
target contract + shared openPage/normalizeUrl/browserSid helpers,
ToolService catch-all, repo-wide reference search). No tool executed, no
browser launched, no network, no source edited. Evidence: this file +
cited lines (all paths api/src/... in this worktree).

## Result
1. REGISTERED: both yes (registry.ts:248 extract_meta, :254
   fullpage_shot; shared import :8).
2. OFFER — three live paths, no keyword/catalogue rows:
   a. Deterministic URL+intent route (PlanningEngine.ts:2842-2870):
      urlMatch + metaIntent (:2810) -> browser_extract_meta (:2858);
      urlMatch + fullshotIntent (:2816) -> browser_fullpage_shot
      (:2853). Emitted input carries url=urlMatch[0] (:2872).
   b. Model-action route: classifyBrowserIntent (:537-586) action
      meta/fullpage/screenshot -> browserToolForAction map (:248-249)
      -> plan step. Model-supplied url must pass isLikelyUrl
      (:2772-2775, drops hallucinated non-URLs with a warning citing
      the measured punycode-hang case); tools other than
      launch/search fall through without a usable target (:2780-2791).
   c. Provider tag scoring (tool-picker.ts:59): +120 when browser
      intent (both carry the 'browser' tag). Neither is in
      PRIORITY_TOOL_NAMES (:5-18).
   d. ABSENT: no MEANS keyword rows, no PLANNER_TOOL_CATALOGUE
      entries (catalogue carries only browser_run/browser_ui_audit,
      plan-tools.ts:112-113 — OBS-097-3), no capability-match.ts
      references. capabilityRoute scoring remains eligible (a comment
      cites extract_meta scoring 24, toolCatalog.ts:420).
3. PLAN-CLEANING: NO gates for either tool (only reference-free;
   browser_run gates + NEEDS_BUILT_URL do not cover them). An empty
   url passes planning and fails at execution — honest but late
   (OBS-097-4). Both planner emission routes validate url upstream,
   so the execution guard is defense-in-depth.
4. DISPATCH: verbatim. Zero matches for either name in
   ToolService.ts (no rename/rate-limit branch, no alias). No
   dispatch rescue exists for any contract gap below.
5. TARGETS (BrowserSmartTools.ts): both REAL implementations.
   extract_meta (:646-692): navigates, evaluates meta/OG/Twitter/
   JSON-LD/outline in-page, returns message + fields. fullpage_shot
   (:1557-1595): scroll-sweeps lazy content, captures fullPage JPEG,
   publishes via publishShot, returns message + height/counts/
   screenshot href. Both declare permissions honestly (internet;
   fullpage_shot +write, pinned by tool-contract.test.ts:86-89;
   both covered by the browser-family internet assertion :74-76).
6. EMPTY-URL (096 question — SETTLED): both fail CLOSED. `url =
   input?.url || ''` then `if (!url) return {ok:false, error:
   'no_url'}` BEFORE any browser contact (extract_meta :657-658,
   fullpage_shot :1572-1573). No session opened, no navigation, no
   artifact. The empty-string case needs no repair.
7. REFERENCES: extract_meta 9 functional (definition x3, registry
   x2, planner routes x2, live-manual x2 at
   verify_browser_tools_live.ts:110/:138, rerank mention at
   tool-selection-rerank.test.ts:121) + 1 scoring comment;
   fullpage_shot 11 functional (same shape + reach pin at
   verify_tool_reach.ts:47 + honest-results pin at
   verify_honest_results.ts:79 + parallel-execution pin at
   verify_parallel_execution.ts:117). Zero executeTool callers,
   zero planner artifact-set entries, zero web/src + scripts/ +
   services/ references. Dynamic-plan emission is the sole intended
   runtime path — pinned by live-manual + (fullpage_shot) reach/
   contract tests.
8. SHARED HELPERS (verified, not re-litigated): normalizeUrl adds
   https:// when missing (:30-35), so the deterministic route's raw
   urlMatch[0] (possibly schemeless) is safe; openPage skips
   navigation on empty target (:56-57) and carries measured
   poisoned-tab recovery (:62-85); ToolService catch-all converts
   throws to `{ok:false, error:'internal_exception: ...'}`
   (ToolService.ts:968-982).

## Verdict
- browser_extract_meta: FULLY_WIRED (registered, offered via two
  validated planner routes + tag scoring, verbatim dispatch, real
  implementation, fail-closed empty-url, live-manual pins).
- browser_fullpage_shot: FULLY_WIRED (same + write-permission pin,
  reach pin, honest/parallel manual pins).
- F-097-1 (new, minor, not repaired): whitespace-only url bypasses
  the `no_url` guard. `'   '` is truthy, passes `if (!url)`, then
  normalizeUrl trims it to '' and openPage SKIPS navigation —
  so the tool silently operates on the session's CURRENT page
  instead of failing. `''` fails closed while `'   '` captures/
  extracts whatever happens to be open. The normalize-then-check
  pattern already exists in the same file (browser_compare
  :716-723). Recommended direction: `const url =
  normalizeUrl(input?.url || '')` + `if (!url)` guard, under
  ownership. Reachable only via direct/adversarial calls (both
  planner routes validate upstream); no planner/registry edits.
- OBS-097-2 (new, minor, not repaired): browserSid(context)
  (:21-27) throws `browser_session_required` OUTSIDE execute's try
  (both tools call it first, :656/:571-pattern at :1571). ToolService
  converts it to an honest `{ok:false}` (result 8), so this is error
  taxonomy (`internal_exception: ...` for a caller-side omission),
  not a defect. Family-wide pattern; note only.
- OBS-097-3 (new, minor, not repaired): no PLANNER_TOOL_CATALOGUE
  entries for either tool (or seo_audit/smart_agent) — same shape
  as OBS-096-8. Catalogue-enumerating planner paths never see them.
- OBS-097-4 (new, minor, not repaired): no plan-cleaning url gate —
  empty url fails late at execution rather than at plan validation.
  Honest but late; upstream planner validation makes this
  defense-in-depth. Note only.
- Recommended direction (backlog, coordinated ownership): F-097-1
  normalize-then-check + consider catalogue rows for the smart-tool
  family. No BrowserSmartTools/PlanningEngine/registry/picker edits
  without coordinated ownership.
- Observed for future checkpoints (not 097 scope): prisma-path
  shell construction; repo_manager create-only switch
  (088-territory, referenced not re-litigated); NEEDS_BUILT_URL
  membership (093-territory). One family per checkpoint.

## Locks carried (not rerun: api/ registry/picker/ToolService/plan-tools/
## PlanningEngine/BrowserSmartTools unchanged since 086; HEAD moved only
## by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual hazard open.
- 088: github chain coherent, F-088-1 open.
- 089: read_file_tree mapped, F-089-1 open.
- 090: grep family FULLY_WIRED at dispatch, F-090-1 + F-090-2obs open.
- 091: browser_run FULLY_WIRED, web_search fork F-091-1, F-091-2/F-091-3,
  OBS-091-4 open.
- 092: git_ops FULLY_WIRED, F-092-1/F-092-2/F-092-3, OBS-092-4/OBS-092-5 open.
- 093: browser_launch FULLY_WIRED, NEEDS_BUILT_URL 3/4 dead, F-093-1/F-093-2/
  F-093-3, OBS-093-4/OBS-093-5 open.
- 094: db_schema_migrator FULLY_WIRED, optimizer stub F-094-1/F-094-2,
  F-094-3, OBS-094-4/OBS-094-5 open.
- 095: github_pr PARTIALLY_WIRED + CONTRACT_MISMATCH, F-095-1, OBS-095-2/
  OBS-095-3/OBS-095-4/OBS-095-5 open.
- 096: github_actions PARTIALLY_WIRED + DUPLICATE_OVERLAP, F-096-1/F-096-2/
  F-096-3, OBS-096-4..8 open.
- 084 P4 + all F/OBS items 086-096 await team review/ownership (list in
  096; not repeated here to bound file growth — this checkpoint adds
  F-097-1 + OBS-097-2/3/4).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=7/19 (097 = browser smart-tool follow-up; roster unchanged)
CLEANING_TRACE=no gates for either 097 tool (verified absence)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=1 relationship mapped (CI-generator pair)
EMPTY_URL_096_QUESTION=SETTLED fail-closed for '' (both tools); whitespace edge F-097-1
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
prisma-path shell construction, or the next Codex-requested bounded
scope. No picker/registry/ToolService/planner edits without ownership.
