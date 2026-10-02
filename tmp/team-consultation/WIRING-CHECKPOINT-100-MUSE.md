# WIRING CHECKPOINT 100 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=ad6f56fd (exact; tracked clean; api/src + web/src byte-identical
to e0c72936 and earlier — intervening commits docs/evidence only)

## Scope: command-router split + git-helper arg exposure (099 next step)
100 closes the 099-flagged "next audit step": the command-router local
whitespace-split (:36) and git-helper metachar exposure
(handleGitCommand guards operation only, handlers.ts:59, args unquoted).
Method: source reads only (command-router.ts, handlers.ts, GitTools.ts,
SystemTools.ts caller + dead helpers, ExecutionEngine/ExecutionGateway
argv path, InfrastructureTools twin splitter, repo-wide caller
searches). No tool executed, no shell spawned, no live probe, no
network, no source edited. Evidence: this file + cited lines (all
paths api/src/... in this worktree).

## Result
1. ROUTER SHAPE (command-router.ts:18-114): execute() routes on
   serverId presence (:23-28): set -> executeRemote (:65-89, ssh
   gate fails closed 'Not connected' :71-73, re-verified), unset ->
   executeLocal (:33-60, naive `trim().split(/\s+/)` :36, empty
   refuses :37-39, then handleShellCommand(cmd, args, ...) :44).
   smartExecute (:94-113) is the only other entry; it is exported.
2. EXECUTELOCAL IS UNREACHABLE (verified absence): the SOLE
   commandRouter.execute caller in api/src is SystemTools.ts:1658,
   inside `if (input.serverId)` (:1657) — serverId is ALWAYS set at
   that call, so execute() ALWAYS takes the remote branch. The :26
   local branch never runs. smartExecute has ZERO callers
   repo-wide (sole match is its own definition :94). Zero tests
   pin the router (no test match for commandRouter/executeLocal).
   The :36 naive split therefore never executes in production;
   the live shell path is SystemTools.ts:1687 (command verbatim,
   empty args — 099 result 4 stands).
3. SPLIT-THEN-REJOIN WOULD BE COSMETIC ANYWAY: even if reached,
   handlers.ts:30 rejoins (`${command} ${args.join(' ')}`) before
   shell:true, so :36 is whitespace-collapse-only in effect —
   quotes/operators/newlines-as-spaces survive to the shell. The
   router neither tokenizes safely nor filters; it must never be
   read as a security boundary.
4. QUOTE-AWARE SPLITTER EXISTS BUT IS DEAD: SystemTools.ts:613
   splitCommandLine is quote-aware (quote tracking :618-637,
   backslash escapes :626-630, unterminated-quote refusal :647)
   and has ZERO callers (sole api/src match is its definition).
   Its twin in InfrastructureTools.ts:33 IS wired (kubectl path
   :166-189, empty/invalid refuse :170/:172/:175). The correct
   pattern exists in-repo; the router does not use it.
5. ALLOWSIST IS DEAD TOO: SystemTools.ts:653
   isAllowedLocalCommand (git/npm/node/tsc/eslint/ls/cat/grep/
   find) has ZERO callers (sole api/src match is its definition).
   Nothing enforces it; nothing references it.
6. ERROR-CONTRACT ASYMMETRY: executeLocal never throws (try/catch
   -> code 1, :52-59); executeRemote THROWS ('Server ID required'
   :67, 'Not connected' :72). The sole caller :1658 does not
   catch, so a not-connected serverId surfaces as a tool
   EXCEPTION, not the structured ok:false the :1670-1683 shape
   suggests. Fail-closed (no silent local fallback — 099 stands)
   but contract-inconsistent.
7. GIT MAIN PATH IS ARGV-SAFE (verified): GitOpsTool.execute
   routes the live path through runGitWithEnv
   (GitTools.ts:26-36) -> executionEngine.runArgv
   (ExecutionEngine.ts:560-575) -> runArgvInternal :932-941,
   which spawns with `shell: false` (:937, "never let a shell
   re-parse it"). The docblock :13-25 records the learned
   join-then-split lesson. Planner-controlled args CANNOT reach
   a shell through git_ops' main path. The 092 git_ops
   FULLY_WIRED verdict STANDS.
8. HANDLEGITCOMMAND IS THE UN-MIGRATED REMNANT: it guards
   operation (:59) but joins args into shell:true (:62 -> :30-
   43). Its ONLY live callers are the two fixed-arg rev-parse
   calls (GitTools.ts:119/:144, literal '--abbrev-ref HEAD').
   The metachar exposure is therefore LATENT, not live — but the
   helper is exported, the :59 guard reads as a safety promise,
   and one future dynamic-args caller re-opens injection.
9. GIT CWD HAS NO CONTAINMENT + AMBIENT DEFAULT (verified):
   GitOpsTool.execute(input) takes NO context param (contrast
   every SystemTools tool: execute(input, context?) threading
   context?.workspaceId — e.g. :708/:832/:892/:1574). Default
   cwd is workspaceService.getActiveRoot() with NO argument
   (:107/:114), deviating from the AGENTS.md explicit-workspace
   rule; input.cwd is used raw with NO safePath check
   (arbitrary absolute cwd accepted — git can run against any
   directory, inside or outside the workspace). Multi-user
   relevance: ambient root + uncontained override is exactly the
   class the file-tool fix eliminated.
10. TESTS: router zero pins (result 2). GitTools suites pin tool
    behavior, not cwd containment/ambient-default or
    handleGitCommand arg shapes (no suite references
    handleGitCommand — sole matches are definition + 2 call
    sites). kubectl splitter IS the in-repo tested pattern for
    the fix direction (result 4).

## Verdict
- command-router remote branch: WIRED (single caller, fail-closed
  ssh gate, live through shell_execute serverId flows).
- command-router executeLocal + :36 split + smartExecute:
  ORPHANED-IN-PRACTICE (unreachable: sole caller always sets
  serverId; zero callers; zero tests). Helper-level dead code,
  not tool-level orphans — counted separately below.
- SystemTools splitCommandLine (:613) + isAllowedLocalCommand
  (:653): DEAD HELPERS (zero callers each, verified repo-wide).
- handleGitCommand: PARTIALLY_WIRED remnant (live only via 2
  fixed-arg internal calls; exported latent hazard).
- git_ops: FULLY_WIRED (092 verdict re-affirmed; main path
  argv-safe, verified to spawn shell:false).
- F-100-1 (new, SIGNIFICANT, not repaired): three parsing/policy
  helpers exist, zero are wired — naive router split (dead
  branch), quote-aware splitter (dead), command allowlist
  (dead). A reader auditing "command parsing safety" finds
  three answers, all wrong. Recommended direction (backlog,
  coordinated ownership): wire ONE path — smartExecute +
  quote-aware split converged on the InfrastructureTools
  pattern, with invalid/empty tests — or DELETE executeLocal/
  :36/smartExecute/splitCommandLine/isAllowedLocalCommand so no
  reader trusts them. No third splitter.
- F-100-2 (new, SIGNIFICANT, not repaired): handleGitCommand
  joins untrusted-capable args into shell:true behind an
  operation-only guard. Latent today (2 fixed-arg callers).
  Recommended direction: migrate the 2 rev-parse calls to
  runGitWithEnv/runArgv and delete handleGitCommand; or add an
  argv variant and forbid dynamic args with a test pin.
- F-100-3 (new, SIGNIFICANT, not repaired): git_ops cwd is
  uncontained and ambient-defaulted — no context param, no-arg
  getActiveRoot (:107/:114), raw input.cwd. Deviates from the
  AGENTS.md explicit-workspace rule and the SystemTools safePath
  pattern. Recommended direction: accept context, thread
  context?.workspaceId, safePath-check input.cwd, pin with
  negative tests (outside-workspace refusal, ambient-default
  attribution). Multi-user/portability relevance per role spec.
- OBS-100-4 (new, minor, not repaired): remote-throws vs local-
  returns asymmetry; sole caller does not catch. Works
  (fail-closed) but inconsistent with structured-error style.
  Note for the owner pass (catch at :1658 -> ok:false, or make
  executeRemote return codes).
- OBS-100-5 (new, info, not repaired): the kubectl tool
  (:166-189) is the in-repo reference implementation for safe
  command shaping (refuse-empty, quote-aware split, fixed argv
  spawn, output cap :183). Router/git owner passes should
  converge on it, not invent new shaping.
- Observed for future checkpoints (not 100 scope): ssh-manager
  session lifecycle behind executeRemote; spawnWithTimeout
  (InfrastructureTools) vs ExecutionEngine authority overlap;
  remaining fix-migration audit for other handleShellCommand
  callers with dynamic args.

## Locks carried (not rerun: api/ registry/handlers/router/GitTools/
## SystemTools/ledger/engine unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-099 verdicts stand (lists in 096/097/098/099; this
  checkpoint adds F-100-1/F-100-2/F-100-3 + OBS-100-4/5 and
  re-affirms 092 git_ops FULLY_WIRED).
- 084 P4 + all F/OBS items 086-100 await team review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=7/19 (100 = router/git depth follow-up; roster unchanged)
COMMAND_ROUTER_VERDICT=PARTIALLY_WIRED (remote live, local dead)
GIT_OPS_VERDICT=FULLY_WIRED (re-affirmed, argv-safe to spawn)
ROUTER_CALLERS=1 (always-serverId) SMARTEXECUTE_CALLERS=0
ROUTER_TEST_PINS=0
HANDLEGITCOMMAND_DYNAMIC_ARG_CALLERS=0 (2 fixed-arg only; latent)
GIT_CWD_CONTAINMENT_CHECKS=0 (verified absence; ambient default)
DEAD_HELPERS_THIS_CHECKPOINT=4 (executeLocal branch, smartExecute,
  splitCommandLine@613, isAllowedLocalCommand@653; zero callers each)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DUPLICATE=1 relationship mapped (CI-generator pair)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
ssh-manager session lifecycle + spawnWithTimeout authority overlap,
or the next Codex-requested bounded scope. No router/handlers/GitTools
edits without ownership.
