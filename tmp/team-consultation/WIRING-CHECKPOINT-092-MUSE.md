# WIRING CHECKPOINT 092 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=950c819b (exact; tracked clean, verified at probe time)

## Scope: git families (091 next step)
092 contract-compares the git renames: `git_commit`/`commit` and
`git_push`/`push` -> `git_ops` with FORCED operation (ToolService.ts:532-539),
`github_create_repo` -> `github_repo_manager` + action=create + repoName
coercion (:542-546), and `github_repo_manager`+action=push -> `git_ops`
operation=push (:547-550). Method: source reads only (priority offer +
provider selection, PLANNER_TOOL_CATALOGUE, resolvePlannedTool + TOOL_ALIASES
+ MEANS + ARG_SYNONYMS + REQUIRED_DEFAULTS, rename-ifs, registry, target
contracts + execute heads, risk call-site ordering, in-repo caller search,
lock tests). No tool executed, no network, no source edited. Evidence: this
file + cited lines.

## Result
1. OFFER: `git_ops` IS in PRIORITY_TOOL_NAMES (tool-picker.ts:11), IS
   registered (registry.ts:176), and IS in PLANNER_TOOL_CATALOGUE
   (plan-tools.ts:97) — the planner gets the real def three ways.
   `github_repo_manager` IS registered (:181) and IS in the catalogue
   (:98), but is NOT in PRIORITY — offered via catalogue/scoring, not
   the priority fast-path. `github_create_repo` IS in PRIORITY (:13) but
   is UNREGISTERED, so selectToolDefsForProvider silently drops it
   (:44-51 `byName.get(name); if (t)`) — the exact dead-priority-entry
   mechanism as web_search in 091. `git_commit`/`commit`/`git_push`/
   `push` appear in no offer surface.
2. PLAN-CLEANING (resolvePlannedTool :228-260; key() :194 maps `_`->space;
   MEANS :127-131; no git names in TOOL_ALIASES :212-249):
   - `git_commit` -> k='git commit' -> MEANS direct hit -> {git_ops,
     meaning}. SURVIVES, but operation comes from ARG_SYNONYMS
     (operation<-action/op/subcommand/verb :1193) or REQUIRED_DEFAULTS
     status (:1210) — cleaning does NOT inject operation=commit.
   - `git_push` -> k='git push' -> MEANS contains-loop `git` (:249-253)
     -> {git_ops, meaning}; same status-default behavior.
   - bare `commit` / bare `push` -> {tool:null, why:'unknown'} (no MEANS
     key, no contains hit, no nearest single) — die at cleaning.
   - `github_create_repo` -> contains-loop `github` -> {github_repo_
     manager, meaning}. SURVIVES, but cleaning injects NO action default
     (no REQUIRED_DEFAULTS entry) — the plan's own args must carry it.
   - `Git` -> {git_ops, meaning} is PINNED (plan-tools.test.ts:24-25).
3. DISPATCH: rename-ifs :532-550 fire only on the literal name reaching
   executeTool. Plan-cleaned git_commit/git_push arrive as `git_ops`, so
   the renames NEVER fire for them (see F-092-1). In-repo static direct
   callers of git_commit/commit/git_push/push/github_create_repo: ZERO
   (searched api/src for executeTool('<name>')) — all five renames are
   DEFENSIVE-ONLY today: harmless compat with no live in-repo path.
4. FORCED vs GUARDED coercion: the git renames overwrite
   `effectiveInput.operation` UNCONDITIONALLY (:534/:538), unlike
   read_file_tree's `== null` guards (:513-517). A direct caller passing
   {operation:'status'} to `git_push` gets push. Plausibly by-design (the
   name IS the operation) — but unpinned; record + pin, don't silently
   change (OBS-092-5).
5. RISK ORDERING CORRECT: classifyToolRisk is called :778 with POST-rename
   effectiveName/effectiveInput, so git_push/git_commit land in the
   git_ops branch (:170-174) and correctly classify 'high'. A pre-rename
   call site would have been an approval bypass; it is not.
6. TARGET git_ops (GitTools.ts:39): REAL implementation — operation
   required (:52; add/commit/push/pull/clone/fetch/status), op charset
   guard (:28), askpass auth with Windows .bat fix (:71-104), push
   upstream auto-recovery (:116-129), explicit NEVER-force-push policy
   (:131-138). git_ops itself: FULLY_WIRED.
7. TARGET github_repo_manager (GitHubRepoManagerTool.ts:76): real for
   create/list/delete/analyze (:176-186 + honest github_auth_required
   :156-173). BUT schema advertises action enum ['create','push','list',
   'delete','analyze'] (:86) while the switch has NO push case — direct
   class invocation with action=push throws `Unknown action: push`
   (:188-189). The :547-550 reroute to git_ops is LOAD-BEARING (F-092-3).
   Auth surface also shifts across the reroute (tool token input ->
   git_ops session/user secrets + cwd).
8. LOCK TESTS: NO pins for the five alias names, the forced-operation
   overwrite, or the push reroute (wiring-policy.test.ts has no git-name
   entries; only the `Git`-meaning pin + token/auth tests exist). The
   092 family + F-092-1/F-092-3 below are UNPINNED.

## Verdict
- git_ops: FULLY_WIRED (priority + catalogue offer, dispatch, compatible
  contract, real implementation, correct post-rename risk).
- github_repo_manager: FULLY_WIRED for create/list/delete/analyze; push
  is REROUTED (works ONLY via executeTool -> git_ops; direct class call
  throws). Schema advertises what the class cannot do.
- git_commit/git_push: PLAN-PATH-DIVERGENT (F-092-1). Reachable from plans
  via MEANS but with the WRONG operation (status, not commit/push).
- commit/push bare: UNREACHABLE-but-HARMLESS (plan->null, dispatch->0
  callers). Unregistered names, not orphaned tools.
- github_create_repo: UNREGISTERED-DROPPED at provider offer (dead
  priority entry), plan-cleanable via MEANS, dispatch-renamed with arg
  injection. Partially wired; provider path never sees it.
- F-092-1 (new, SIGNIFICANT, not repaired): same-name-different-operation
  fork by path. Plan-path `git_commit` -> git_ops/operation=status
  (cleaning rewrote the name, rename never fires, default :1210);
  direct executeTool('git_commit') -> git_ops/operation=commit (forced
  :534). Same for push (status vs push). A plan that says git_commit
  produces a status check, not a commit — silent semantic substitution,
  the same fork CLASS as F-091-1 (there: different tool; here: different
  operation). Recommended direction (coordinated ownership): inject the
  operation at cleaning for these MEANS hits, or remove the MEANS hits
  so plans fail honestly, + pin.
- F-092-2 (new, minor, not repaired): github_create_repo arg injection
  (action=create, repoName=input.name||input.repoName :543-545) exists
  ONLY on the dispatch path; plan-cleaned calls rely on plan args for
  the required `action`. Same one-path-injection shape; lower stakes
  (missing action fails honestly on required-field check).
- F-092-3 (new, SIGNIFICANT, not repaired): schema/implementation split
  for action=push — schema enum promises it, class throws, dispatch
  reroute silently delivers a DIFFERENT tool (git_ops) with a different
  auth/cwd surface. Three contracts disagree about one action. Recommended
  direction: either implement push in-class (and decide whether the reroute
  stays), or remove push from the enum and document the reroute as the
  contract, + pin the reroute.
- OBS-092-4 (observation): git_ops cwd defaults to getActiveRoot() WITHOUT
  contextWorkspaceId (:107/:114) — the same standing-rule pattern as the
  spec-tool N5 area. Exploitability NOT traced; no defect claimed.
- OBS-092-5 (observation): forced-overwrite (git) vs guarded (read_file_tree)
  coercion inconsistency. Plausibly intentional; pin before changing.
- Recommended direction (backlog, coordinated ownership): resolve F-092-1
  operation injection + F-092-3 push contract + pin all five resolutions
  and the forced overwrite. No picker/registry/ToolService/plan-tools
  edits without coordinated ownership.
- Observed for future checkpoints (not 092 scope): browser_open /
  NEEDS_BUILT_URL cleaning trace (carried from 091), github_pr wiring,
  db_schema_migrator action gate (:1358-1363). One family per checkpoint.

## Locks carried (not rerun: api/ registry/picker/ToolService/plan-tools/
## GitTools/GitHubRepoManager unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual hazard open.
- 088: github chain coherent, F-088-1 open.
- 089: read_file_tree mapped, F-089-1 open.
- 090: grep family FULLY_WIRED at dispatch, F-090-1 + F-090-2obs open.
- 091: browser_run FULLY_WIRED, web_search fork F-091-1, F-091-2/F-091-3,
  OBS-091-4 open.
- 084 P4 + F-086-1 + F-088-1 + F-089-1 + F-090-1 + F-090-2obs + F-091-1 +
  F-091-2 + F-091-3 + OBS-091-4 + F-092-1 + F-092-2 + F-092-3 + OBS-092-4
  + OBS-092-5 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=6/19 (image 087 + github 088 + read_file_tree 089 + grep 090 + browse 091 + git 092)
ALIASES=28 ALIAS_BROKEN=0 (F-092-1 is an OPERATION fork, not a broken alias)
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
browser_open/NEEDS_BUILT_URL cleaning trace, or github_pr wiring, or the
next Codex-requested bounded scope. No picker/registry/ToolService edits
without ownership.
