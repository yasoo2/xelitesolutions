# WIRING CHECKPOINT 088 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=4467a6b7 (exact; verified at probe time)

## Scope: github-name chain (read-only, second 086 family)
088 executes the 086/087 next step for ONE more gap family: offered
`github_create_repo` vs registered `github_repo_manager`. Method: source
reads only (tool-picker offer, ToolService rename layer :257/:542-546,
dispatch lookup, GitHubRepoManagerTool contract+execute, registry grep,
docs/web grep). No tool executed, no network, no source edited.
Evidence: this file + cited line numbers (Muse HEAD 4467a6b7).

## Result: best-shaped gap so far — dispatch path fully coherent
1. OFFER (picker): `github_create_repo` is in PRIORITY_TOOL_NAMES but is
   silently dropped by selectToolDefsForProvider (F-086-1 instance: `if (t)`
   with no else). The planner never receives this spelling. No docs/ or
   web/src reference exists (picker-only, same as image_generate).
2. RENAME (dispatch): if the planner emits `github_create_repo` anyway,
   ToolService renames it to `github_repo_manager` (ToolService.ts:542-546),
   sets action='create' + repoName=input.name||input.repoName. Other fields
   (description/private/token) pass through untouched: effectiveInput is a
   shallow copy of input (:257).
3. DISPATCH: `github_repo_manager` IS registered (registry.ts:181) ->
   tools.find resolves. No dead end (contrast 087 image chain).
4. TARGET CONTRACT (GitHubRepoManagerTool.ts): inputSchema requires `action`
   (enum includes 'create', :84-88); `repoName` optional string (:89-92).
   The coerced input satisfies required+enum even under strict validation.
5. TARGET IMPLEMENTATION: execute() case 'create' (:176-177) calls a REAL
   createRepo (POST /user/repos + already-exists smart recovery, :206-251).
   Not a stub, not a fabrication path.
6. RUNTIME GATE (honest): create requires a GitHub token (input.token ->
   GITHUB_TOKEN env -> user secrets, :131-145); without one it fails closed
   with github_auth_required + needsGithubAuth (:156-173), never silent
   success. Auth-gated, not broken.

## Verdict
- `github_create_repo`: PLANNER_INTENT_UNRESOLVED at offer (F-086-1 drop),
  FULLY_WIRED at dispatch (rename + registered target + compatible contract
  + honest auth gate). The rename target IS correct — the opposite of 087,
  where no safe target exists. Recommended direction (backlog, needs
  coordinated ownership before any edit): fix the OFFER side (offer the
  registered `github_repo_manager` spelling, or add a TOOL_ALIASES entry),
  keep the rename. Picker/ToolService are shared surfaces — Muse makes no
  unilateral edit.
- F-088-1 (adjacent, load-bearing reroute, NOT repaired): the tool's
  inputSchema advertises action='push' (:86) but execute()'s switch has NO
  push case (create/list/delete/analyze only; default throws 'Unknown
  action', :175-190). ToolService :547-550 reroutes github_repo_manager+push
  -> git_ops+push BEFORE dispatch, so the schema/implementation split never
  fires via ToolService. Direct in-process callers with action=push WOULD hit
  the throw. Schema/implementation/dispatch three-way split; needs
  coordinated ownership.
- Observed for future checkpoints (not 088 scope): `read_file_tree` (086
  gap) HAS a rename to inspect_directory (:511-518, dir->path coercion +
  depth default); list_files/dir family (:519-522); grep family (:526-528);
  browse/git families (:529-550). One family per checkpoint; no edits.

## Locks carried (not rerun: api/ + web/ runtime source unchanged since 086;
HEAD moved only by docs commits + 7cb7d822 web redaction, which does not
touch picker/registry/ToolService/github paths)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual Muse-lineage hazard open.
- 084 P4 + F-086-1 + F-088-1 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, locked 086, not rerun)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=2/19 (image_generate 087 + github_create_repo 088)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Contract-compare the next probable-rename family (read_file_tree ->
inspect_directory is pre-mapped at :511-518), or the next Codex-requested
bounded scope. No picker/registry/ToolService edits without coordinated
ownership.
