# WIRING CHECKPOINT 096 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=7bf1937d (exact; tracked clean; api/src + web/src identical to
8befcd70 and earlier — intervening commits docs/evidence only)

## Scope: github_actions wiring (third revived tool; carried from 095)
096 traces `github_actions` across offer -> plan-cleaning -> dispatch ->
target, plus its overlap with `ci_generate_pipeline`.
Method: source reads only (definition, registry, PRIORITY, catalogue,
keyword map, TOOL_ALIASES/dispatch, target contract + execute paths,
sibling tool + manager contracts, repo-wide reference search). No tool
executed, no network, no source edited. Evidence: this file + cited lines
(all paths api/src/... in this worktree).

## Result
1. REGISTERED: yes (registry.ts:183 safeNew; import :50). Third tool under
   the deliberate-revival comment (:177-180) — registration is deliberate
   repair, not accident. All three revived GitHub tools now mapped.
2. OFFER — keyword ONLY, weakest of the three siblings: MEANS map
   ('github actions' -> github_actions, plan-tools.ts:159). NO catalogue
   entry (repo_manager :98 and github_pr :99 have one; github_actions
   does not — OBS-096-8). Absent from PRIORITY (tool-picker.ts:13
   carries only github_create_repo for the family). Reachable via exact
   name, the single meaning-match phrase, tags (github/actions/ci-cd)
   through provider scoring, or nearest-name fallback.
3. KEYWORD FORK: MEANS maps 'ci' and 'ci/cd' to `ci_generate_pipeline`
   (:159) — a DIFFERENT tool with overlapping capability (see F-096-1).
   The tool's own description says "for CI/CD automation" yet the
   'ci/cd' phrase routes elsewhere.
4. PLAN-CLEANING: NO github_actions gate exists (only reference in
   plan-tools.ts is the :159 keyword row). No action/required-field check.
5. DISPATCH: verbatim. Zero github_actions matches in ToolService.ts
   (no rename/rate-limit branch); TOOL_ALIASES map (:212-249) read in
   full — no entry. No dispatch rescue exists for any contract gap below.
6. NO schema enforcement anywhere: ToolService.ts never references
   inputSchema (verified: zero matches), so required fields and enums
   are advisory. Every leniency below is LIVE, not theoretical.
7. TARGET GitHubActionsTool.ts (249 lines): REAL local file generator.
   No network, no token, mockSupported=false (:47). Writes
   .github/workflows/<workflowType>.yml via raw fs (:235-248).
   list_runs is honestly refused, not fabricated (:57-63).
8. REFERENCES: exactly 4 in api/src (keyword :159, name :10,
   self-mention :60, registration :183) + jest-cache transform
   artifacts only. Zero executeTool callers, zero planner artifact-set
   entries, zero test references (no unit, no lock test, no reach pin),
   zero web/src + scripts/ + services/ references (scoped search empty).
   Dynamic-plan emission is the sole intended runtime path — unpinned.

## Verdict
- github_actions: PARTIALLY_WIRED + DUPLICATE_OVERLAP (F-096-1):
  registered, keyword-offered, verbatim dispatch, real implementation —
  but contract gaps (F-096-2/F-096-3), no test pins any path, and a
  production-wired sibling generates the same file with conflicting
  semantics.
- F-096-1 (new, SIGNIFICANT, not repaired): DUPLICATE CI-generator
  capability. ci_generate_pipeline (QualityTools.ts:352-414, registered
  :205) vs github_actions: BOTH write .github/workflows/node-ci.yml.
  Semantics conflict: ci SKIPS if exists (:374-376), github_actions
  OVERWRITES unconditionally (:245). Template skew: ci pins
  checkout@v4 + setup-node@v4 (:397-399), github_actions pins v3/v3
  (:126-129) — a github_actions node-ci run silently DOWNGRADES a
  ci-generated file. Wiring asymmetry: ci is production-called
  (WebDevelopmentTools.ts:319), verify_tools-pinned (:213-227),
  reach-pinned (verify_tool_reach.ts:54) and lock-pinned
  (wiring-policy.test.ts:554); github_actions has NONE of these.
  Recommended direction (coordinated ownership): single-owner decision —
  either retire github_actions node-ci in favor of ci (keeping its
  deploy-vercel/docker-build/test-and-deploy types), or merge the
  generators with one skip/overwrite policy + one template version.
  Do NOT leave two writers fighting over node-ci.yml.
- F-096-2 (new, SIGNIFICANT, not repaired): projectPath is
  required-by-schema (:32) but execute falls back to process.cwd()
  (:72) on omission, with NO resolveToolPath containment (the tool
  never imports it; ci_generate_pipeline DOES, QualityTools.ts:370;
  resolveToolPath enforces workspace/project/builds/external roots,
  utils.ts:19-90). ToolService performs NO projectPath normalization
  (zero matches in ToolService.ts). Net: a missing projectPath writes
  .github/workflows/ into the API server CWD; a supplied absolute
  path is used raw. (Attribution still applies via permissions=
  ['write']; attribution is not containment.) Recommended direction:
  resolveToolPath(projectPath) + fail closed on empty, under ownership.
- F-096-3 (new, minor, not repaired): unknown workflowType silently
  substitutes node-ci (:105) instead of failing. With no enum
  enforcement anywhere, a typo'd type generates the wrong workflow
  without notice. Recommended direction: reject unknown types with
  the valid enum in the error, under ownership.
- OBS-096-4 (new, minor, not repaired): the honest list_runs refusal
  refers the caller to "the GitHub API / github_repo_manager"
  (:60) — but GitHubRepoManagerTool has NO run action (schema enum
  create/push/list/delete/analyze :86, switch handles create only
  :175-189). Dead-end referral. Recommended direction: point at the
  GitHub API runs endpoint only, or drop the manager half.
- OBS-096-5 (new, minor, not repaired): outputSchema declares only
  success/workflowPath (:35-41) but execute returns +workflowType
  +message (:78-84). Same drift shape as OBS-095-2.
- OBS-096-6 (new, minor, not repaired): `action` is read (:50, :57)
  but absent from inputSchema — undocumented input surface (currently
  only the honest list_runs guard consumes it).
- OBS-096-7 (new, minor, not repaired): filename interpolated from
  unsanitized workflowType (`${workflowType}.yml` :242). Traversal is
  conditional on non-enum input reaching execute — and no enforcement
  layer exists to stop it (see result 6). Closed by F-096-3's fix.
- OBS-096-8 (new, minor, not repaired): no PLANNER_TOOL_CATALOGUE
  entry — the only one of the three revived GitHub tools without it.
  Catalogue-enumerating planner paths never see it.
- Recommended direction (backlog, coordinated ownership): resolve
  F-096-1 ownership/split + F-096-2 containment + F-096-3 rejection +
  pin generate/skip-clash/token-closed paths with contract tests. No
  registry/picker/plan-tools/GitHubActionsTool/QualityTools edits
  without coordinated ownership.
- Observed for future checkpoints (not 096 scope): prisma-path shell
  construction; fullpage_shot/extract_meta empty-url behavior; the
  repo_manager create-only switch (088-territory, referenced not
  re-litigated). One family per checkpoint.

## Locks carried (not rerun: api/ registry/picker/ToolService/plan-tools/
## GitHubActionsTool/QualityTools unchanged since 086; HEAD moved only by
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
- 095: github_pr PARTIALLY_WIRED + CONTRACT_MISMATCH, F-095-1, OBS-095-2/
  OBS-095-3/OBS-095-4/OBS-095-5 open.
- 084 P4 + F-086-1 + F-088-1 + F-089-1 + F-090-1 + F-090-2obs + F-091-1 +
  F-091-2 + F-091-3 + OBS-091-4 + F-092-1 + F-092-2 + F-092-3 + OBS-092-4 +
  OBS-092-5 + F-093-1 + F-093-2 + F-093-3 + OBS-093-4 + OBS-093-5 + F-094-1
  + F-094-2 + F-094-3 + OBS-094-4 + OBS-094-5 + F-095-1 + OBS-095-2 +
  OBS-095-3 + OBS-095-4 + OBS-095-5 + F-096-1 + F-096-2 + F-096-3 +
  OBS-096-4 + OBS-096-5 + OBS-096-6 + OBS-096-7 + OBS-096-8 await team
  review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=7/19 (096 = github/CI follow-up; roster unchanged)
CLEANING_TRACE=no github_actions gate exists (verified absence)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=1 relationship mapped (CI-generator pair)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
prisma-path shell construction, or the fullpage_shot/extract_meta
empty-url behavior, or the next Codex-requested bounded scope. No
picker/registry/ToolService edits without ownership.
