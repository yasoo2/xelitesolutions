# WIRING CHECKPOINT 095 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=dc66a85a (exact; tracked clean; api/src + web/src identical to
8befcd70 and f88b8d58 — intervening commits docs/evidence only)

## Scope: github_pr wiring (carried from 093/094)
095 traces `github_pr` across offer -> plan-cleaning -> dispatch -> target.
Method: source reads only (definition, registry, PRIORITY, catalogue,
keyword map + resolvePlannedTool, TOOL_ALIASES/dispatch renames, target
contract + execute paths, repo-wide reference search). No tool executed, no
network, no source edited. Evidence: this file + cited lines (all paths
api/src/... in this worktree).

## Result
1. REGISTERED: yes (registry.ts:182 safeNew; import :49). Revival comment
   :177-180 documents the prior unknown_tool death — registration is
   deliberate repair, not accident.
2. OFFER — catalogue + keywords, NOT priority: PLANNER_TOOL_CATALOGUE
   (plan-tools.ts:99, purpose 'open a pull request'); MEANS map
   ('pull request' + 'pr' -> github_pr, :131). Absent from PRIORITY
   (tool-picker.ts:13 carries only github_create_repo for the GitHub
   family). Reachable via exact name, meaning-match (word-boundary regex
   :249-253), tags (github/pr/pull-request) through provider scoring, or
   nearest-name fallback (:257).
3. PLAN-CLEANING: NO github_pr gate exists (no action membership check, no
   required-field check). Any action value — including schema-advertised
   'merge' — passes cleaning untouched.
4. DISPATCH: verbatim. Zero github_pr matches in ToolService dispatch/
   rename/rate-limit branches (only github_create_repo->github_repo_manager
   :542-543 and the repo_manager+push->git_ops reroute :547-550 exist).
   No TOOL_ALIASES entry for github_pr.
5. TARGET GitHubPRTool.ts (198 lines): REAL implementation. Direct
   api.github.com https calls (createPR POST :114-136, listPRs GET
   :138-157, shared githubRequest :159-197 with 2xx gate :181-189).
   Honest closed failure without token (input.token -> GITHUB_TOKEN env ->
   user secret :73-89, 'GitHub token required' :88). mockSupported=false
   (:66) — no fake-PRs fabrication path. rateLimitPerMinute=10 (:64).
6. CONTRACT SPLIT — F-095-1 (new, SIGNIFICANT): inputSchema advertises
   action enum ['create','merge','list'] (:17-21) but execute()'s switch
   handles ONLY create + list (:93-102); action='merge' falls to default
   and throws 'Unknown action: merge' (:101). Same schema-vs-implementation
   shape as F-088-1 (repo_manager advertises push, lacks push case) but
   WORSE: F-088-1 is masked by a load-bearing ToolService reroute, while
   NOTHING intercepts github_pr+merge — the throw fires on every attempt.
   A planner reading the schema (dynamic plans see tool inputSchemas) can
   legitimately emit action=merge and will always fail at runtime.
7. REFERENCES: exactly 4 in all of api/src (catalogue :99, keywords :131,
   definition name :9, registration :182). Zero planner artifact-set
   entries, zero direct executeTool('github_pr') callers, zero dedicated
   test references (no unit, no lock test, no verify_tool_reach pin).
   Dynamic-plan emission is the sole intended runtime path — unpinned.
8. OUTPUT DRIFT — OBS-095-2 (minor): outputSchema declares only
   success/prUrl (:54-60), but list returns {prs[], message} (:143-155)
   and create returns extra prNumber/message (:127-134). Consumers
   reading outputSchema alone mis-model both shapes.

## Verdict
- github_pr: PARTIALLY_WIRED + CONTRACT_MISMATCH (F-095-1): registered,
  catalogue+keyword offered, verbatim dispatch, real implementation with
  honest auth gate — but 1 of 3 schema-advertised actions always throws,
  and no test pins any path.
- F-095-1 (new, SIGNIFICANT, not repaired): schema advertises merge,
  implementation rejects merge, no dispatch rescue. Recommended direction
  (coordinated ownership): either implement the merge case (PUT
  /repos/{o}/{r}/pulls/{n}/merge — note: needs a PR-number input the
  schema lacks) or remove 'merge' from the enum + document that PR merge
  is out of scope. Do NOT leave an advertised action that always throws.
- OBS-095-2 (new, minor, not repaired): outputSchema covers neither
  actual output shape. Recommended direction: extend outputSchema to the
  observed union when F-095-1 is decided.
- OBS-095-3 (new, minor, not repaired): sideEffects ['write'] applies to
  all actions including read-only 'list'. Recommended direction: accept
  as tool-level granularity, or split read/write tools under ownership.
- OBS-095-4 (new, minor, not repaired): owner/repo interpolated into the
  API path unencoded (:122/:139); a slash-bearing owner shifts the API
  path. Recommended direction: encodeURIComponent under ownership.
- OBS-095-5 (new, minor, not repaired): https.request has no timeout
  (:160-196); outer ToolService timeout coverage for this tool UNVERIFIED.
  Recommended direction: verify outer timeout or add one under ownership.
- Recommended direction (backlog, coordinated ownership): resolve F-095-1
  merge split + OBS-095-2 output schema + pin create/list/token-closed
  paths with contract tests. No registry/picker/plan-tools/GitHubPRTool
  edits without coordinated ownership.
- Observed for future checkpoints (not 095 scope): github_actions wiring
  (third revived tool, unoffered status unknown), prisma-path shell
  construction, fullpage_shot/extract_meta empty-url behavior. One family
  per checkpoint.

## Locks carried (not rerun: api/ registry/picker/ToolService/plan-tools/
## ProjectPlannerTool/GitHubPRTool unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
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
- 084 P4 + F-086-1 + F-088-1 + F-089-1 + F-090-1 + F-090-2obs + F-091-1 +
  F-091-2 + F-091-3 + OBS-091-4 + F-092-1 + F-092-2 + F-092-3 + OBS-092-4 +
  OBS-092-5 + F-093-1 + F-093-2 + F-093-3 + OBS-093-4 + OBS-093-5 + F-094-1
  + F-094-2 + F-094-3 + OBS-094-4 + OBS-094-5 + F-095-1 + OBS-095-2 +
  OBS-095-3 + OBS-095-4 + OBS-095-5 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=7/19 (github_pr family newly mapped; PRIORITY row
itself unchanged — github_pr remains scoring/catalogue-reachable only)
CLEANING_TRACE=no github_pr gate exists (verified absence)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
github_actions wiring (third revived tool), or prisma-path shell
construction, or the fullpage_shot/extract_meta empty-url behavior, or the
next Codex-requested bounded scope. No picker/registry/ToolService edits
without ownership.
