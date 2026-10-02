# WIRING CHECKPOINT 102 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=37db04c0 (exact; tracked clean; api/src + web/src byte-identical
to e0c72936 — intervening commits docs/evidence only)

## Scope: npm/git arg-caller audit + DockerManagerTool spawn shape (101 next step)
102 closes the 101-flagged "next audit step": which route fields reach
the packages.ts npm join, the project.ts git-clone arg audit, and
DockerManagerTool.ts' own spawn shape.
Method: source reads only (packages.ts, project.ts, DockerManagerTool.ts,
ExecutionEngine.ts run/dispatch :300-325/:534-552, InfrastructureTools.ts
swarm :192-241 + spawn callers, registry.ts:172, plan-tools.test.ts:35,
comment-only write-tools-contract :29-30). No tool executed, no shell
spawned, no live probe, no network, no source edited. Evidence: this file +
cited lines (all paths api/src/... in this worktree).

## Result
1. PACKAGES SEARCH (F-102-1, new, SIGNIFICANT, not repaired):
   GET /packages/search?q= (packages.ts:67-104) passes authenticated-user
   `q` (trimmed, max 100 chars, leading-dash refused :69-71) UNVALIDATED
   into spawnWithTimeout('npm', ['search', q, '--json']) (:76) -> join
   `${cmd} ${args.join(' ')}` (:28, shell:true, no payload.args) ->
   engine else-branch (ExecutionEngine.ts:323-324) -> runCommandInternal
   naive-split + shell:true. Spaces corrupt the argv shape; shell
   metachars (`;`, `&&`, `|`, `$()`, backticks, quotes) execute as the
   API server user. Authenticated command injection. The in-file
   contrast is exact: POST / install validates via strict
   isValidNpmPackageName (:15-20/:114, no spaces/metachars possible)
   before its join (:133) — the fix pattern already exists in the same
   file. Recommended direction (backlog, coordinated ownership): apply
   the name validator (or an allowlist) to `q`, or pass argv via
   payload.args; pin with metachar/space negative tests.
2. PACKAGES INSTALL (verified SAFE shape): POST / (:107-140), exactly
   2 spawn callers in file (:76, :133 — exhaustive). Install/uninstall
   name passes isValidNpmPackageName before the join; `--save-dev` is
   a fixed literal. WIRED + VALIDATED.
3. PROJECT/GIT-CLONE AUDIT (resolves 101 open item to INERT):
   project.ts:93 spawnWithTimeout has ZERO callers (verified by
   exhaustive in-file search; sole candidate route /git/clone :318
   returns DEPRECATED 400). sanitizeRepoDirName (:86) and
   maskUrlCredentials (:82) likewise have ZERO callers. The only
   ExecutionGateway usage in project.ts is inside the dead helper
   (:96). No live git-clone arg path exists in this route. The copy
   remains a DUPLICATE relationship + resurrection trap, not a live
   sink. F-101-2 scope REVISED: JOIN_THEN_SHELL x2-live
   (InfrastructureTools.ts:43, packages.ts:22) + x1-dead
   (project.ts:93).
4. DOCKERMANAGERTOOL (F-102-2, new, SIGNIFICANT, not repaired): does
   NOT use spawnWithTimeout — builds `docker ...` commands by template
   interpolation of TWO raw free-text tool inputs, `target` and
   `options` (DockerManagerTool.ts:37-53, zero validation of either),
   then executionEngine.run(command) (:55) with NO argv array -> engine
   else-branch :323-324 -> runCommandInternal naive-split + shell:true.
   Planner-controlled container/image names and "additional flags"
   reach a shell: spaces corrupt, metachars execute in Joe's server
   context. Concrete: `stop ${target}` (:44), `rm -f ${target}` (:45),
   `build ${options} -t ${target} .` (:49), `compose_up/down
   ${options}` (:50-51). 4th join-site of the same hazard family,
   distinct implementation. Wiring: REGISTERED (registry.ts:172),
   planner name-resolution pinned ('Docker'->docker_manager,
   plan-tools.test.ts:35), permissions ['execute','write'] declared,
   rateLimit 15/min — i.e. FULLY_WIRED into a hazardous sink.
   Recommended direction: runArgv(file,args) via payload.args (the
   engine's sanctioned path, :560-575) + strict target/options
   validation; pin with metachar/space negative tests.
5. SWARM RE-VERIFIED (101 exposure, exact lines): docker_swarm_ops
   stackName is trim-only (:220/:227/:231) into args (:222/:228/:232)
   -> InfrastructureTools spawnWithTimeout :236. composeFile goes
   through resolveToolPath (:221) — shape containment only, not shell
   quoting. Still F-101-2, no new F.
6. TESTS (verified): docker_manager has a NAME-resolution pin only
   (plan-tools.test.ts:35); ZERO execution/arg-shape pins for
   docker_manager, packages search shape, swarm/terraform/kubectl
   execution, or servers-route authz. write-tools-contract.test.ts
   :29-30 remains COMMENT-ONLY (String "undefined" to shell note,
   zero code references).

## Verdict
- packages install/uninstall: WIRED + VALIDATED (safe shape stands).
- packages search `q`: WIRED + INJECTION (F-102-1).
- project.ts spawn/sanitize/maskUrl trio: DEAD (zero callers each;
  /git/clone is a DEPRECATED stub).
- DockerManagerTool: FULLY_WIRED into shell sink (F-102-2).
- F-101-2: REVISED to x2-live + x1-dead; DockerManagerTool template-
  join is the 4th site, distinct implementation, new F-102-2.
- F-102-1/F-102-2: new, SIGNIFICANT, not repaired (audit-first rule;
  coordinated ownership required).
- 084 P4 + all F/OBS items 086-102 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-101 verdicts stand (lists in 096/097/098/099/100/101; this
  checkpoint adds F-102-1/2 and revises F-101-2 scope downward on
  project.ts, upward on DockerManagerTool).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
JOIN_SITES=4 (spawn x2-live + x1-dead, docker template-join x1-live)
NAIVE_SPLITTERS=4 (router:36, runCommandInternal:989, sync:1071, + router rejoin)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=7 (4 previous router/splitter/list + 3 project.ts spawn/sanitize/maskUrl)
DUPLICATE=2 relationships (CI-generator pair + spawnWithTimeout x3 copies, now 2-live+1-dead)
DOCKER_EXEC_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Terminal OwnerSession vs ssh shellStream broadcast session attribution
(101 deferred item), or the next Codex-requested bounded scope. No
packages/project/docker/kernel edits without ownership.
