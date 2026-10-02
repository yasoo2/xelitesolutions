# WIRING CHECKPOINT 099 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=a1750fcb (exact; tracked clean; api/src + web/src byte-identical
to e0c72936 and earlier — intervening commits docs/evidence only)

## Scope: shell_execute raw-command path (SystemTools :1687 caller)
099 traces the :1687-flagged raw-command caller end to end: input intake
-> blocklist -> dryRun -> cwd containment -> background dedup/launch ->
serverId route -> handleShellCommand(command, [], ...) -> gateway/engine,
plus shell_state persistence, shell_check_status, the verification
charset gate, and test pins. This is the first 098-flagged "next audit
step" scope. Method: source reads only (SystemTools.ts, handlers.ts,
command-router.ts, verification-ledger.ts, registry.ts, ToolService.ts,
shell-visible.test.ts, caller searches). No tool executed, no shell
spawned, no live probe, no network, no source edited. Evidence: this
file + cited lines (all paths api/src/... in this worktree).

## Result
1. INTAKE (SystemTools.ts:1504-1522): `command` trimmed (:1507),
   empty refuses without execution (:1511, audit-driven). cwd/timeout/
   background/dryRun parsed; command-aware default timeout
   (long-runners 300s, else 30s, :1518-1520). Dry run echoes redacted
   text and returns WITHOUT executing (:1559-1564) — true dry path.
2. BLOCKLIST (SystemTools.ts:1566-1572): exactly TWO case-sensitive
   substrings on the raw string — 'rm -rf /' and 'sudo'. No
   normalization of any kind: no lowercasing, no whitespace folding,
   no charset check. Passes by construction: `SUDO ...`, `rm  -rf /`
   (double space/tab), `rm -rf /*`, `rm -rf ~`, `rm -rf $HOME`,
   drive/root variants. False-positive by construction: ANY command
   containing the substring 'sudo' (even `echo sudo`) is blocked.
   Zero test pins on the blocklist (verified: shell-visible.test.ts
   has no blocklist/containment case).
3. CWD CONTAINMENT (:1574-1595): SOLID. Root from
   workspaceService.getActiveRoot(context.workspaceId) (:1574 via
   :564-579, explicit-workspace form per AGENTS.md rule); persisted
   state re-validated on the way back in (:1583-1595, refusal not
   crash via safePath :607-611 -> shared resolver :598-599, whose
   docblock records the fixed absolute-path hole :581-597). This is
   the layer that actually bounds the raw shell, not the blocklist.
4. RAW SINK (:1687): handleShellCommand(command, [], workDir,
   timeoutVal, false, sessionId). With empty args, handlers.ts:30
   yields fullCommand = command VERBATIM, then shell:true (:31-43).
   So the planner/user string reaches a real shell unquoted — BY
   DESIGN for a shell tool; the containment boundary is cwd (:3)
   plus gateway attribution, not content filtering. Contrast the
   npm callers (:1140/:1298/:1309/:1332/:1347) which pass fixed
   argv and only suffer the join cosmetically.
5. BACKGROUND (:1598-1655): module-local Map (:18) — process-local
   state, lost on restart, shared across users/sessions in-process
   (no owner/session key on entries). Dedup reuses only exact
   trimmed-command + resolved-cwd matches (:1607-1628 via
   sameBackgroundInvocation :70-72). Launch is detached:true +
   stdio:'ignore' with NO exit handler (:1632-1637); entries GC'd
   only when a later dedup scan or status check finds the pid dead
   (:1608-1610, :1741-1743). Liveness = process.kill(pid,0)
   (:60-68, :1736), which false-positives across PID reuse — a
   recycled pid can read "alive" and be "reused"/reported.
6. NO KILL PATH (verified absence): zero matches for kill/
   terminate/shell_kill in SystemTools.ts besides the two liveness
   probes. No tool stops, cancels, or times out a background
   process it started; shell_check_status (:1719-1751) only reads
   the map (registered :333, real read implementation). A runaway
   `background:true` launch outlives the run with no tool remedy.
7. SHELL_STATE LOOP UNWIRED (verified absence): exactly ONE
   repo-wide match for shell_state (this read at :1575; caches/
   dist/tmp excluded). NOTHING ever writes `.joe/shell_state.json`,
   yet the tool description promises "persistent CWD state" (:1483)
   and :1576-1581 reads it. The read branch is dead in practice;
   every invocation without explicit cwd falls back to the
   workspace root. Either a writer (cd tracking) was never built
   or it was removed; the description was not updated.
8. SERVERID ROUTE (:1657-1684): commandRouter.execute with
   workingDirectory=workDir; remote requires sshManager connected
   else throws 'Not connected' (command-router.ts:71-73) — FAILS
   CLOSED, no silent local fallback. Local router path splits on
   whitespace (:36) — only reached for serverId flows, not :1687.
9. VERIFICATION CHARSET (verification-ledger.ts:748-776): strict
   allowlist, sanitizer+gate AGREE (both call isVerificationTool):
   expansion-free single invocation (:752 rejects quotes/operators/
   `<` — the run-4b shape), help/version/list flags rejected
   (:754), npm/pnpm/yarn restricted to test|lint|build|typecheck|
   check|guard scripts (:758-763), node/tsx require --test
   (:766-767), npx checkers pinned (playwright/cypress/vitest/tsx/
   tsc --noEmit/eslint/jest, :768-775). This is the coherent
   planner->gate contract the UI-001 repair relies on; shell raw
   execution itself is intentionally NOT so restricted.
10. REGISTRY/DISPATCH: ShellExecuteTool registered (:319) and
    ShellStatusTool registered (:333); ToolService reaches them via
    the generic registry path (its only ShellExecuteTool mention is
    a policy comment :161, no special-case). Planner-visible: YES —
    shell-visible.test.ts pins routing ("routes directly to
    shell_execute" x2, diagnostic/build classification). Execution
    authority stays with ToolService per the ledger comments.
11. TESTS (shell-visible.test.ts, 30 tests): pins broadcast-to-owner,
    echo-before/result-after order, CRLF normalization, secret
    redaction in echo, terminal-panel retention, and planner routing.
    ZERO pins on: blocklist shapes, cwd containment/refusal,
    shell_state read/write, background dedup/reuse/GC, kill absence,
    PID reuse, serverId closed-fail. Verification charset IS pinned
    separately (verification-ledger/contract suites).

## Verdict
- shell_execute: FULLY_WIRED (registered, ToolService-dispatched,
  planner-routed, gated for verification, real implementation,
  workspace-contained cwd). The raw-to-shell flow is the tool's
  contract, not a wiring break.
- shell_check_status: FULLY_WIRED (registered, real map read).
- F-099-1 (new, SIGNIFICANT, not repaired): the :1566 blocklist is
  two unnormalized case-sensitive substrings. Documented bypass
  shapes pass silently; 'sudo'-containing innocuous commands are
  refused. Unpinned by tests. Recommended direction (backlog,
  coordinated ownership): normalize (case/whitespace) + anchor the
  dangerous shapes (rm -rf against /, /*, ~, drive roots) + negative
  tests; or delete the blocklist and state cwd-containment as THE
  boundary so no reader infers content filtering that is not there.
- F-099-2 (new, SIGNIFICANT, not repaired): shell_state.json has a
  reader and no writer (verified repo-wide absence). "Persistent
  CWD state" is currently unwired. Recommended direction: either
  implement the writer (persist on cd-carrying commands) with the
  existing re-validation, or correct the tool description to
  workspace-root default. Ownership as above.
- F-099-3 (new, SIGNIFICANT, not repaired): background launches are
  unkillable, process-local, cross-user-visible, and PID-reuse-
  confusable. No kill tool, no owner key, no exit handler, restart
  loses the map while children survive. Recommended direction:
  owner/session-keyed entries + a bounded kill/stop tool through
  ToolService + exit reaping; document the local-only limitation
  until then. Multi-user/portability relevance per role spec.
- OBS-099-4 (new, minor, not repaired): dedup is exact-string-only;
  near-duplicate launches (flag reorder, same target) still spawn.
  EADDRINUSE protection is narrow. Note for the owner pass.
- OBS-099-5 (new, info, not repaired): layering is real but uneven:
  cwd containment solid, verification charset strict and coherent,
  redaction correctly display-only, blocklist thin, background
  lifecycle absent. A reader auditing "shell safety" must check all
  five layers; no single line tells the story.
- Observed for future checkpoints (not 099 scope): command-router
  local whitespace-split (:36) for serverId flows; npm-caller fixed-
  argv safety under the join; git-helper metachar exposure
  (handleGitCommand guards operation only :59, args unquoted).

## Locks carried (not rerun: api/ registry/handlers/SystemTools/
## verification-ledger/command-router unchanged since 086; HEAD moved
## only by docs/evidence commits; REGISTERED=163 Muse-lineage)
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
- 094: db_schema_migrator FULLY_WIRED (connectivity), optimizer stub F-094-1/
  F-094-2, F-094-3, OBS-094-4/OBS-094-5 open.
- 095: github_pr PARTIALLY_WIRED + CONTRACT_MISMATCH, F-095-1, OBS-095-2/
  OBS-095-3/OBS-095-4/OBS-095-5 open.
- 096: github_actions PARTIALLY_WIRED + DUPLICATE_OVERLAP, F-096-1/F-096-2/
  F-096-3, OBS-096-4..8 open.
- 097: extract_meta + fullpage_shot FULLY_WIRED, empty-url settled,
  F-097-1, OBS-097-2/3/4 open.
- 098: prisma-shell sink documented, F-098-1/F-098-2 SIGNIFICANT,
  F-098-3, OBS-098-4/5 open.
- 084 P4 + all F/OBS items 086-098 await team review/ownership (lists in
  096/097/098; not repeated here to bound file growth — this checkpoint
  adds F-099-1/F-099-2/F-099-3 + OBS-099-4/5).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=7/19 (099 = shell raw-command depth follow-up; roster unchanged)
SHELL_EXECUTE_VERDICT=FULLY_WIRED SHELL_CHECK_STATUS_VERDICT=FULLY_WIRED
BLOCKLIST_SUBSTRINGS=2 (both bypass/false-positive shapes documented, 0 test pins)
SHELL_STATE_WRITERS=0 (verified absence repo-wide; reader at :1575 dead in practice)
BG_KILL_PATHS=0 (verified absence; liveness probes only)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=1 relationship mapped (CI-generator pair)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Command-router local split + git-helper arg exposure, or the next
Codex-requested bounded scope. No SystemTools/handlers/ledger edits
without ownership.
