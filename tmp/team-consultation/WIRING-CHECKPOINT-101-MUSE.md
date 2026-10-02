# WIRING CHECKPOINT 101 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=7fa99f3c (exact; tracked clean; api/src + web/src byte-identical
to e0c72936 — intervening commits docs/evidence only)

## Scope: ssh-manager session lifecycle + spawnWithTimeout authority overlap (100 next step)
101 closes the 100-flagged "next audit step": the ssh-manager session
lifecycle behind executeRemote, and the spawnWithTimeout
(InfrastructureTools) vs ExecutionEngine authority overlap.
Method: source reads only (ssh-manager.ts, command-router.ts,
terminal-kernel.ts, servers.ts routes, ServerConfigModel,
InfrastructureTools.ts, ExecutionGateway.ts, ExecutionEngine.ts
shell paths, packages.ts/project.ts twins, registry.ts, tool-picker.ts,
plan-tools.ts, test-dir search). No tool executed, no shell spawned,
no live probe, no network, no source edited. Evidence: this file +
cited lines (all paths api/src/... in this worktree).

## Result
1. SSH LIFECYCLE MAP (all call sites verified repo-wide): connect <-
   servers.ts:160 (auth'd, userId-scoped findOne :139); executeRemote
   <- command-router.ts:75 (live remote branch; 100 verdict stands,
   sole caller SystemTools.ts:1658 always sets serverId, re-verified);
   requestShell/sendInput <- terminal-kernel.ts:27/:101 (remote
   interactive shells); disconnect <- servers.ts:111/:184;
   testConnection <- servers.ts:222. Manager is a process-global
   singleton keyed by bare serverId with NO userId scoping
   (ssh-manager.ts:13-16/:205-214) — it trusts callers for
   authorization.
2. F-101-1 (new, SIGNIFICANT, not repaired): POST
   /api/servers/:id/disconnect (servers.ts:181-190) performs NO auth
   check (no auth?.sub read, no userId scoping — compare every
   sibling route :17-22/:46-51/:75-81/:134-142/:196-204) and
   disconnects ANY id. Additionally DELETE disconnects BEFORE the
   ownership check (:110-112 before :114-118): deleting another
   user's id returns 404 AFTER their session is already dropped.
   Cross-user session teardown in both paths. Recommended direction
   (backlog, coordinated ownership): require auth + findOne
   ({_id,userId}) before disconnect in both routes; pin with
   negative cross-user tests. Multi-user relevance per role spec.
3. F-101-2 (new, SIGNIFICANT, not repaired): THREE
   `spawnWithTimeout` copies (InfrastructureTools.ts:43,
   packages.ts:22, project.ts:93) all join
   `${cmd} ${args.join(' ')}` into payload.command with NO
   payload.args and shell:true -> engine :321-325 else-branch ->
   runCommandInternal (:987-1000) naive-splits AGAIN (:989, the
   fourth naive splitter: router :36, :989, sync :1071) then
   spawns shell:true (:996). Planner/route-controlled args with
   spaces corrupt; metachars execute (the engine's own DEP0190
   comment :625-633 admits exactly this hazard class for
   shell:true). Concrete live exposures: docker_swarm_ops
   stackName (trim-only free text -> :222/:228/:232); terraform
   `-var k=v` (:104) and `-chdir=<path>` (:99, Windows paths with
   spaces); kubectl fullArgs (:180); npm package args via
   packages.ts:133. REVISION OF 100 OBS-100-5: the kubectl path is
   NOT argv-safe — quote-aware split followed by rejoin-into-shell
   is split-then-reparse, not tokenization; the in-repo reference
   claim is DOWNGRADED to input-validation shape only
   (empty/invalid refusal :170/:172/:175 stands). The true argv
   pattern remains git_ops via payload.args -> runArgvInternal
   shell:false (:321-322/:932-941). Recommended direction: pass
   argv via payload.args, dedupe to ONE helper, pin with
   metachar/space negative tests.
4. F-101-3 (new, SIGNIFICANT, not repaired): remote shell leak,
   two compounding defects. (a) disconnect's stream cleanup
   `tid.includes(serverId)` (ssh-manager.ts:168) NEVER matches:
   terminal ids are `terminal:<sessionId>`
   (terminal-kernel.ts:179) and never contain the Mongo serverId,
   so stream.end() never runs and entries leak. (b) killTerminal
   (terminal-kernel.ts:144-162) only handles the local `terminals`
   map, but remote terminals return early at :28 and are never
   registered there — remote shells have NO kill path at all.
   After disconnect, requestShell for the same terminalId returns
   early (:82 "already has a shell") while the connection is gone
   -> sendInput writes to a dead stream silently. Recommended
   direction: key shellStreams by serverId+terminalId (or track
   an explicit mapping), route remote kill through sshManager,
   pin with connect->shell->disconnect->reshell lifecycle tests.
5. OBS-101-4 (new, minor, not repaired): executeRemote accepts
   options.timeout (:134) but the execCommand call (:143-147)
   never forwards it; remote commands run unbounded while
   command-router passes context.timeout (:80) believing it
   applies. Note for the owner pass (Promise.race enforcement or
   documented removal of the parameter).
6. OBS-101-5 (new, minor, not repaired): maxConnections=10 is
   process-global, not per-user (:16/:23-25); one user can fill
   it and block all others ("Maximum connections reached").
   Multi-user relevance. Note for the owner pass (per-user quota
   or idle/LRU eviction).
7. OBS-101-6 (new, info, not repaired): connect reads
   fs.readFile(serverConfig.keyPath) (:44) with no containment
   check; keyPath is user-stored free text (ServerConfigModel
   :18, no validation). Bounded (content used only as key
   material), but any API-readable path is attempted. Note:
   safePath-check or restrict to a keys directory.
8. OBS-101-7 (new, info, not repaired): connect failure path
   (:62-71) never disposes the `ssh` object; testConnection does
   (:237). Minor handle-leak asymmetry note.
9. OBS-101-8 (new, info, not repaired): PRIORITY_TOOL_NAMES lists
   "terraform_ops" (tool-picker.ts:16) but the registry registers
   "terraform_manager" (registry.ts:173) — the priority lookup
   byName.get (:45) misses, so the priority slot is dead (tool
   still reachable via the general selection path; plan-tools
   :158 maps the name correctly). Same family as the standing
   57-offered/38-resolved/19-unresolved priority reconciliation.
10. INFRA REGISTRY (verified, no orphan): terraform_manager :173,
    kubernetes_ops :174, docker_swarm_ops :175, docker_manager
    :172 (separate DockerManagerTool.ts) — all registered.
    getWorkspaceRoot ambient default (InfrastructureTools.ts:7-14,
    no-arg + cwd fallback) is a supporting instance of the F-100-3
    class, not a new F.
11. TESTS (verified absence): zero behavioral pins for ssh session
    lifecycle, spawnWithTimeout join shape, terraform/kubectl/
    swarm execution, or servers-route authorization.
    write-tools-contract.test.ts mentions kubernetes_ops/
    terraform_manager in a COMMENT ONLY (:29-30, zero code
    references); sentinel/wiring-policy matches are unrelated
    fixtures. Router zero pins (100 result 2) still stands.

## Verdict
- ssh remote branch: WIRED (connect/execute/shell/disconnect all
  reachable; fail-closed ssh gate re-affirmed).
- servers.ts connect/test/get/put: WIRED + userId-scoped.
- servers.ts disconnect route + DELETE pre-check disconnect:
  AUTHORIZATION GAP (F-101-1).
- spawnWithTimeout x3 + runCommandInternal :989/:996: JOIN-THEN-
  SHELL hazard (F-101-2); engine argv path itself is sound.
- ssh shell-stream lifecycle: LEAKED (F-101-3, no kill path).
- F-101-1/F-101-2/F-101-3: new, SIGNIFICANT, not repaired
  (audit-first rule; coordinated ownership required).
- OBS-101-4/5/6/7/8: new, minor/info, not repaired.
- 100 OBS-100-5 kubectl reference claim: REVISED (see result 3).
- Observed for future checkpoints (not 101 scope): packages.ts
  npm-arg caller audit (which route fields reach the join);
  project.ts git-clone arg audit; DockerManagerTool.ts own
  spawn shape; terminal OwnerSession vs ssh shellStream
  broadcast session attribution.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools unchanged since 086; HEAD moved only by docs/evidence
## commits; REGISTERED=163 Muse-lineage)
- 086-100 verdicts stand (lists in 096/097/098/099/100; this
  checkpoint adds F-101-1/2/3 + OBS-101-4..8 and revises
  OBS-100-5 downward).
- 084 P4 + all F/OBS items 086-101 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (101 adds terraform_ops miss; roster unchanged)
SSH_LIFECYCLE_VERDICT=WIRED with AUTHZ_GAP (F-101-1) + LEAK (F-101-3)
SPAWN_HELPER_VERDICT=JOIN_THEN_SHELL x3 copies (F-101-2)
NAIVE_SPLITTERS=4 (router:36, runCommandInternal:989, sync:1071, + router rejoin)
SSH_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DUPLICATE=2 relationships mapped (CI-generator pair + spawnWithTimeout x3)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
packages.ts/project.ts arg-caller audit + DockerManagerTool spawn
shape, or the next Codex-requested bounded scope. No
servers/ssh/kernel/infra edits without ownership.
