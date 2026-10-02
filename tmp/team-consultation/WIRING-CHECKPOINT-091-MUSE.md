# WIRING CHECKPOINT 091 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=f88b8d58 (exact; verified at probe time)

## Scope: browse family (fifth 086 gap) + adjacent renames
091 executes the 090 next step for the browse family: `browse` /
`open_browser` / `web_browse` -> `browser_run` (ToolService.ts:529-531).
Same-block siblings mapped in the same pass: `web_search` (:368-377),
`browser_open` (:344-353), `browser_get_state` (:354-360),
`browser_snapshot` (:361-367). Method: source reads only (picker offer,
resolvePlannedTool, rename-ifs + TOOL_ALIASES table, registry, target
contracts + execute heads, lock tests, in-repo caller search). No tool
executed, no network, no source edited. Evidence: this file + cited lines.

## Result
1. OFFER (picker): `browser_run` IS in PRIORITY_TOOL_NAMES
   (tool-picker.ts:13) and IS registered (registry.ts:228) — the planner
   gets the real def directly. No F-086-1 drop for the real tool.
   `browse`/`open_browser`/`web_browse` are NOT in the priority list, NOT
   registered, NOT in TOOL_ALIASES. The planner never sees them; only
   LLM-parametric emission could produce them.
2. PLAN-CLEANING (plan-tools.ts:228-260): resolvePlannedTool checks
   registered-first (:232), then TOOL_ALIASES (:234), then MEANS. Traced
   for `browse`: unregistered, no alias entry, MEANS has only `browser`
   (:162), not `browse`; nearest (:257-258) requires exactly one
   substring match — traced to {tool:null, why:'unknown'}. A planned
   `browse` dies at cleaning (dropped/honest-fail upstream); the
   rename-if never sees it from the plan path. Siblings share the exact
   mechanism (same unregistered/no-alias/no-MEANS state).
3. DISPATCH: rename-if :529-531 maps all three names to `browser_run`
   with NO arg coercion (contrast browser_open's goto injection below).
   In-repo static direct callers of browse/open_browser/web_browse/
   browser_open/web_search: ZERO (searched api/src for
   executeTool('<name>')). The browse rename is therefore DEFENSIVE-ONLY
   today: harmless compat with no live in-repo path. Empty-actions
   direct-call behavior NOT traced (BrowserRunTool.execute read only to
   :270: sessionId_required + context-authoritative auth first) — no
   claim made.
4. TARGET (BrowserRunTool): registered, REAL implementation (session
   guards :248-268, context-over-body userId, per-session rate bucket
   :74/:788, sessionId invariant :562). browser_run itself: FULLY_WIRED
   (offered + dispatched + real + auth-guarded).
5. SIBLING COERCIONS (mapped, not verdicts): browser_open normalizes
   url/input -> goto action, defaults to google.com when empty (:344-353);
   get_state/snapshot inject {type:'ui_audit'} (:354-367). Whether
   resolvePlannedTool('browser_open') survives cleaning (NEEDS_BUILT_URL
   lists it, plan-tools.ts:1291) NOT traced — 092 or backlog.
6. LOCK TESTS: NO pins for browse/web_search/browser_open names in
   wiring-policy.test.ts (only grep/file pins at :44-57 per 090). The
   091 family + the F-091-1 fork below are UNPINNED.

## Verdict
- browser_run: FULLY_WIRED (direct offer + dispatch + compatible
  contract + real implementation + honest auth failures).
- browse/open_browser/web_browse: UNREACHABLE-but-HARMLESS (plan->null,
  dispatch->0 callers, rename retained as compat). Not counted as
  orphaned TOOLS (they are unregistered names, not implementations).
- F-091-1 (new, SIGNIFICANT, not repaired): `web_search` resolves to
  DIFFERENT tools per path. TOOL_ALIASES says search_api (:247);
  rename-if says browser_run (:368-377, query->goto(agentSearchUrl)+wait
  coercion). Ordering proof: rename runs before lookup; alias fallback
  (:691-698) fires only if !tDef. So plan-cleaned `web_search` ->
  search_api (real DDG scrape, SearchApiTool.ts:30-61, output
  {results:[{title,url,description}]}, internet-only, fast) while direct
  executeTool('web_search') -> browser_run (real Chromium, output
  {pageUrl,title,dom,screenshotHref,...}, needs session+auth, slow).
  Same name, different tool/latency/permissions/evidence-shape per path:
  verification sees different evidence for the "same" tool depending on
  which path produced it. Referenced in only 3 places (picker list entry
  dropped as unregistered; rename; dead status :644). No test pins
  either target. Recommended direction (coordinated ownership): one
  canonical target + pin + align/remove the other.
- F-091-2 (new, minor dead code, not repaired): rateLimitBucketKey's
  `browser_open` disjunct (:74) is unreachable — rename :344 always
  fires first and the call site (:788) uses post-rename effectiveName.
  Harmless (calls land in the browser_run session bucket correctly).
- F-091-3 (new, cosmetic dead code, not repaired): status branch
  effectiveName==='web_search' (:644) unreachable — rename :368 always
  fires first. web_search calls display "Using the browser…".
- OBS-091-4 (observation): BrowserRunTool schema requires only
  ['sessionId'] with the instructionText/actions anyOf COMMENTED OUT
  (:141-142), while plan-tools REJECTS plans with empty
  instruction+actions (:1332-1333). Schema lax, plan strict. Direct
  empty-actions outcome untraced; no defect claimed.
- Recommended direction (backlog, coordinated ownership): decide the
  canonical web_search target (F-091-1) + pin browse/web_search
  resolutions + remove or annotate the two dead branches. No
  picker/registry/ToolService edits without coordinated ownership.
- Observed for future checkpoints (not 091 scope): git families
  (:532-539 commit/push + :547-550 github push->git_ops with forced
  operation coercion). One family per checkpoint; no edits.

## Locks carried (not rerun: api/ registry/picker/ToolService/UtilityTools
## + plan-tools/PlanningEngine alias consumers + BrowserRunTool/SearchApiTool
## unchanged since 086; HEAD moved only by docs/evidence commits;
## REGISTERED=163 Muse-lineage)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual hazard open.
- 088: github chain coherent, F-088-1 open.
- 089: read_file_tree mapped, F-089-1 open.
- 090: grep family FULLY_WIRED at dispatch, F-090-1 + F-090-2obs open.
- 084 P4 + F-086-1 + F-088-1 + F-089-1 + F-090-1 + F-090-2obs + F-091-1 +
  F-091-2 + F-091-3 + OBS-091-4 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=5/19 (image 087 + github 088 + read_file_tree 089 + grep 090 + browse 091)
ALIASES=28 ALIAS_BROKEN=0 (web_search fork is a TARGET fork, not a broken alias)
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Contract-compare the git families (:532-539 commit/push->git_ops with
forced operation, :547-550 github push reroute), or the
browser_open/NEEDS_BUILT_URL cleaning trace, or the next Codex-requested
bounded scope. No picker/registry/ToolService edits without ownership.
