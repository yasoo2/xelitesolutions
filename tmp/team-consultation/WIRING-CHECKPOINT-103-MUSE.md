# WIRING CHECKPOINT 103 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=f129a379 (exact; tracked clean; api/src + web/src byte-identical
to e0c72936 — intervening commits docs/evidence only)

## Scope: terminal OwnerSession vs ssh shellStream broadcast attribution (101/102 deferred item)
103 closes the last 101-flagged deferred item: how local PTY output,
remote ssh shell output, and builder terminal lines are attributed to
a user/session on the live socket, and whether the two terminal
creation paths pin ownership equally.
Method: source reads only (terminal-kernel.ts full, ssh-manager.ts
full, ws.ts broadcast/resolve/delivery :206-258/:367-404/:540-633/
:692-710, TaskInteractionTools.ts terminal_manager :50-159,
ToolService.ts :869/:925/:952/:979, github.ts :275-277,
test_execution_gateway.ts, repo-wide caller greps for
createTerminal/requestShell/broadcastTerminalLine/serverId). No tool
executed, no shell spawned, no live probe, no network, no source
edited. Evidence: this file + cited lines (api/src/... in this
worktree unless noted).

## Result
1. F-103-1 (new, SIGNIFICANT scope revision of F-101-3, not
   repaired): REMOTE INTERACTIVE SHELLS ARE UNREACHABLE IN
   PRODUCTION. requestShell's sole production caller is the kernel
   remote branch (terminal-kernel.ts:27, behind `if
   (options.serverId)`). createTerminal callers repo-wide
   (exhaustive grep incl. tests/manual): TaskInteractionTools.ts:82
   (inputSchema has NO serverId field; never passes one), manual
   test_execution_gateway.ts:22 (local PTY only, no serverId). No
   HTTP route calls createTerminal. The web terminal panel sends no
   serverId, so the WS serverId input/resize branches (ws.ts
   :368-391/:392-404) are wire-capable but UI-untriggered — and
   no-ops on the always-empty shellStreams map. Consequence:
   shellStreams can NEVER be populated in production; the ssh
   broadcast code (ssh-manager.ts:93-100) never runs; F-101-3's
   leak (dead `tid.includes(serverId)` cleanup + no remote kill
   path) is LATENT, not live. The F-101-3 code defect STANDS, but
   exploitability requires a future caller wiring serverId through.
   The deferred attribution comparison resolves: there is NO live
   remote broadcast traffic to attribute. Recommended direction
   (backlog, coordinated ownership): either wire serverId through
   the terminal_manager schema + tool (with owner/session pins per
   OBS-103-2 + lifecycle tests) or explicitly mark the remote-shell
   branch unsupported with a guard; do NOT leave a silently-
   unreachable privileged path. No edit in audit.
2. F-101-1 STANDS UNCHANGED (live): connect (servers.ts:160)
   populates the connections map through a live route, so the
   disconnect auth gap (servers.ts:181-190 + DELETE pre-check
   :110-112) drops REAL cross-user connections. Reachability
   qualification applies to F-101-3 only, not F-101-1.
3. OBS-103-2 (new, info, not repaired): the remote branch skips ALL
   creation pins. kernel :26-29 returns before the terminals.has
   duplicate check (:31) and before registerTerminalOwner (:68).
   A future serverId caller through the tool WOULD get the tool-
   layer session pin (TaskInteractionTools.ts:100) but NEVER the
   user-owner pin. Note for the owner pass: register the owner
   above the remote branch or duplicate it there.
4. OBS-103-3 (new, info, POSITIVE — verified wired): the local
   attribution stack is complete. Local PTY output (kernel :75)
   carries id + sessionId; creation pins BOTH registries (owner
   via kernel :68 when context userId present; session via tool
   :100); resolveEventUserId falls back terminalOwner ->
   sessionOwner -> run -> executionFirewall (ws.ts :206-258);
   delivery additionally requires a session subscription (:620)
   and drops unresolvable terminal_output (:606-609). No gap
   found on the local path.
5. OBS-103-4 (new, info, POSITIVE — verified wired):
   broadcastTerminalLine (ws.ts :692-710) is the dominant live
   terminal_output path with 15 production callers (ToolService
   x4, github route, 10 tool definitions) and is fail-closed by
   design (`if (!owner) return` :697). Sampled call sites thread
   a real session (contextSessionId at ToolService
   :869/:925/:952/:979; guarded `if (sessionId)` at github
   :277). No unattributed caller found in the sample.
6. OBS-103-5 (new, minor, not repaired): executeRemote bleeds
   every remote chunk to the API server console
   (ssh-manager.ts:145-146 process.stdout/stderr.write). Live
   path (command-router :75 <- SystemTools :1658). Remote output
   — potentially sensitive — lands in server logs. Note for the
   owner pass (route through the redacting logger or remove).
7. OBS-103-6 (new, info, not repaired): the sessionId-fallback-
   to-id shape is SHARED by local (kernel :75 `ownerSessionId
   || id`) and remote (ssh :94 `options?.sessionId ||
   terminalId`) broadcast. With an empty owner session the id
   (`terminal:<sid>` or 'default') misses the bare-sid
   sessionOwner/run maps, leaving only the firewall fallback
   then the fail-closed drop. Consistent across both paths;
   availability note for ownerless terminals, not a leak.
8. TESTS (verified absence): zero behavioral pins for terminal
   owner/session attribution, broadcast delivery filtering,
   remote-shell lifecycle, or executeRemote console bleed.

## Verdict
- Local PTY broadcast: WIRED + ATTRIBUTED (double pin +
  subscription gate + fail-closed drop).
- broadcastTerminalLine path: WIRED + FAIL-CLOSED (15 live
  callers sampled clean).
- Remote ssh shell broadcast: DEAD (zero production creators;
  code present but unreachable).
- F-101-3: REVISED live -> LATENT (defect stands,
  untriggerable without a future serverId caller).
- F-101-1: STANDS live (unaffected by this revision).
- F-103-1: new, SIGNIFICANT (reachability revision),
  not repaired (audit-first rule; coordinated ownership).
- OBS-103-2..6: new, info/minor, not repaired.
- 084 P4 + all F/OBS items 086-103 await team review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## infra/tools/routes/ws unchanged since 086; HEAD moved only by
## docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-102 verdicts stand EXCEPT F-101-3 revised live -> latent
  (lists in 096/097/098/099/100/101/102; this checkpoint adds
  F-103-1 + OBS-103-2..6).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=8/19 (unchanged)
TERMINAL_BROADCAST_PATHS=3 (local PTY live, broadcastTerminalLine live x15, ssh remote DEAD)
REMOTE_SHELL_PRODUCTION_CREATORS=0 (exhaustive grep)
JOIN_SITES=4 (spawn x2-live + x1-dead, docker template-join x1-live)
NAIVE_SPLITTERS=4 (router:36, runCommandInternal:989, sync:1071, + router rejoin)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked (tool-level; helper-level dead code counted separately)
DEAD_HELPERS=8 (7 previous + remote-shell creation path, distinct from F-101-3 leak code)
DUPLICATE=2 relationships (CI-generator pair + spawnWithTimeout x3 copies, now 2-live+1-dead)
TERMINAL_ATTRIBUTION_TEST_PINS=0 PACKAGES_SEARCH_SHAPE_PINS=0 DOCKER_EXEC_TEST_PINS=0 INFRA_EXEC_TEST_PINS=0 SERVERS_AUTHZ_TEST_PINS=0
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
All 101-deferred items are now closed (packages/project/docker in
102, attribution in 103). Next: the next Codex-requested bounded
scope, or the five write-defaulted mutation audit at a noncritical
checkpoint per CODEX-TO-MUSE-CYCLE78-PRIORITY. No
terminal/ssh/ws/tool edits without ownership.
