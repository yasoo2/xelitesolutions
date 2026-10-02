# WIRING CHECKPOINT 098 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=e0c72936 (exact; tracked clean; api/src + web/src identical to
4e650bba and earlier — intervening commits docs/evidence only)

## Scope: prisma-path shell construction (db_schema_migrator engine=prisma)
098 traces the prisma engine path end to end: arg construction ->
handleShellCommand -> ExecutionGateway -> ExecutionEngine spawn, plus
cwd/containment/test pins. This is the 097-flagged "prisma-path shell
construction" scope. Method: source reads only (definition, handlers,
gateway, engine, firewall call sites, plan-tools gate, tests, caller
search). No tool executed, no shell spawned, no live injection probe
(attacker-shaped input is never executed as a probe), no network, no
source edited. Evidence: this file + cited lines (all paths api/src/...
in this worktree).

## Result
1. ARG CONSTRUCTION (DatabaseEnterpriseTools.ts:158-172): raw planner
   input, zero quoting/validation on the prisma path.
   `schemaArg = ['--schema=' + schemaPath]` (:160, trimmed only :129);
   `nameArgs = ['--name', name]` (:162-163, untrimmed, no charset
   check). No existence check, no resolveToolPath containment (the
   sqlite path in the SAME execute() uses resolveToolPath :21/:32 and
   discovery :29-61 — the prisma path skips all of it). `reset`
   appends `--force` (:166): non-interactive data loss, uncontained.
2. HANDLER (handlers.ts:12-51): the argv array is DESTROYED here.
   `fullCommand = 'npx ' + args.join(' ')` (:30, no quoting), sent as
   a single string via `execute(requestObject)` with `shell: true`
   (:31-43). This bypasses BOTH safe paths: the gateway's argv
   overload (ExecutionGateway.ts:42-56, whose comment explicitly
   warns that concatenation "lets shell metacharacters change the
   meaning of a supposedly tokenized arg") and the engine's
   `runArgvInternal` (shell:false, :932-941). The join replicates
   the DEPRECATED `executeLegacy` pattern (:88-100) line for line.
3. ENGINE (ExecutionEngine.ts:315-325 + 987-1000): no payload.args
   arrives, so `runCommandInternal` whitespace-splits the joined
   string (:989) and spawns with `shell: true` (:996, inherited from
   the handler's payload.options). Consequences are mechanical:
   a. SPACES BREAK: `--schema=C:\My Projects\app\schema.prisma`
      splits into two shell words; prisma receives a truncated
      `--schema=C:\My` plus a stray positional. Windows paths with
      spaces are common, not adversarial.
   b. METACHARACTERS INJECT: `&` separates commands on BOTH cmd.exe
      and sh; `; $() `` || %VAR%` apply per platform. A schemaPath
      or migration name carrying them executes arbitrary commands
      with the API server's privileges. Planner input is
      model/user-influenced, so this is a reachable injection sink,
      not a theoretical one.
4. NO SANITIZER AT ANY LAYER (verified absence): zero matches for
   sanitiz/metachar/escapeShell/quoteFor/dangerous in
   modules/services/ToolService.ts (firewall is attribution/
   permission only, per 079 trace); executionFirewall.
   validateExecution receives a caller-context string literal, not
   input content (ExecutionGateway.ts:37); the plan-cleaning gate
   covers ACTION only (plan-tools.ts:1358-1362), never schemaPath/
   name content. The catalogue purpose says "existing .prisma
   schema" (:106) but nothing enforces existence for prisma.
5. CWD = SERVER PROCESS, NOT WORKSPACE (:172 passes
   `process.cwd()`; handler only path.resolve's it :21). Every
   user's migration runs in the API server's cwd: relative
   `--schema` resolves against the server directory, and prisma
   writes migration artifacts relative to wherever it runs. Cross-
   user/cross-project contamination + wrong-directory execution.
   Contrast QualityTools/SystemTools callers, which pass projectDir/
   workDir rooted at the workspace.
6. CONTAINMENT: none on the prisma path. `--schema=` accepts
   absolute paths and `../` traversal (the `..` guard exists only in
   handleFsCommand :74, a different function). migrate/push/reset
   then read schemas and write migration dirs OUTSIDE the workspace,
   against arbitrary databases named by the schema. The sqlite
   sibling proves the intended pattern (resolveToolPath sandbox);
   prisma never got it.
7. TYPEORM/SEQUELIZE (minor wart): inputSchema advertises both
   engines (:114) and :154 accepts them, but no args branch exists,
   so they fall through to `if (!args.length) return 'Unsupported
   action'` (:169) — the ACTION is fine, the engine is unimplemented.
   Misleading error, blocks honest planner retry.
8. BLAST RADIUS (shared sink): handleShellCommand callers are the
   terminal command-router (:44), db migrator (:172), QualityTools
   x4 (:57/:96/:151/:179), SystemTools npm flows x4 (:1140/:1298/
   :1309/:1332/:1347) + raw command (:1687), and the git helper
   (:62). Every caller inherits the join+shell:true semantics; the
   engine's own quoteForCmd (:614-620) exists ONLY in the streaming
   path, which none of these callers use. Fix-at-handler heals all
   callers at once; fix-per-caller does not.
9. TESTS: NO pin on the prisma shell path. The only 'prisma' hit in
   db-schema-migrator-sqlite.test.ts is the stale-engine reroute
   (.sql + engine prisma -> sqlite, :54-56). Zero tests for spaces/
   metachars in schemaPath/name, zero containment tests, zero cwd
   tests for the migrator. npm-manager/quality tests MOCK
   handleShellCommand, so the join itself is untested anywhere
   (verified: quality-run-evidence + npm-manager mock the handler).
10. HYGIENE: MobileBuilderTool.ts:12 imports handleShellCommand and
    never calls it (sole match in file = the import). Dead import;
    note only.

## Verdict
- db_schema_migrator connectivity verdict UNCHANGED from 094
  (FULLY_WIRED: registered, offered, gated, dispatched, real
  implementation). 098 adds depth, not rewiring: the path is
  connected but its shell construction is unsafe for untrusted-
  shaped input.
- F-098-1 (new, SIGNIFICANT, not repaired): unquoted join +
  shell:true turns planner-supplied schemaPath/name into a shell
  injection sink and breaks on spaces. Chain: :160/:163 ->
  handlers.ts:30/:39 -> ExecutionEngine.ts:989/:996. No sanitizer
  at tool, handler, gateway, firewall, or plan-cleaning layers.
  Recommended direction (backlog, coordinated ownership): route
  handleShellCommand through the EXISTING argv path
  (execute(command, args) -> runArgvInternal shell:false), with the
  documented Windows .cmd-shim caveat (runArgvStreaming :595-607:
  npx needs the quoting path, not bare spawn) — i.e. adopt the
  quoteForCmd discipline for the one-shot path or reuse the
  streaming quoter. One fix heals all 12+ call sites. No
  handlers/gateway/engine edits without ownership.
- F-098-2 (new, SIGNIFICANT, not repaired): prisma path runs at
  server-process cwd with uncontained schemaPath; migrate/push/
  reset --force can read/write outside the workspace.
  Recommended direction: resolveToolPath (sandbox) + existence
  check for schemaPath, workspace-rooted cwd — the sqlite sibling
  (:19-61) is the in-file template. Ownership as above.
- F-098-3 (new, minor, not repaired): typeorm/sequelize return the
  misleading 'Unsupported action'. Recommended direction: return
  'Engine X not implemented' before the action check, or remove
  them from the advertised enum until implemented.
- OBS-098-4 (new, minor, not repaired): dead handleShellCommand
  import in MobileBuilderTool.ts:12. Hygiene; remove with any
  touched-file pass.
- OBS-098-5 (new, info, not repaired): the codebase ALREADY
  contains the safe pattern (gateway argv overload + runArgvInternal
  shell:false + quoteForCmd) AND its deprecation (executeLegacy).
  handleShellCommand is the surviving legacy-shaped bypass. The
  repair is adoption, not invention.
- Observed for future checkpoints (not 098 scope): SystemTools
  :1687 raw-command caller shape; command-router arg provenance;
  git-helper metachar exposure; QualityTools tsc fixed-arg safety
  (fixed literal argv = safe content, still joined). One family per
  checkpoint.

## Locks carried (not rerun: api/ registry/handlers/gateway/engine/
## plan-tools/DatabaseEnterpriseTools unchanged since 086; HEAD moved
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
- 084 P4 + all F/OBS items 086-097 await team review/ownership (lists in
  096/097; not repeated here to bound file growth — this checkpoint adds
  F-098-1/F-098-2/F-098-3 + OBS-098-4/5).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=7/19 (098 = prisma-path depth follow-up; roster unchanged)
SHELL_JOIN_SINK=handleShellCommand 12+ call sites share join+shell:true (verified)
INPUT_SANITIZER_COUNT=0 at tool/handler/gateway/firewall/plan-cleaning (verified absence)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=1 relationship mapped (CI-generator pair)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
SystemTools :1687 raw-command caller, or command-router arg provenance,
or the next Codex-requested bounded scope. No handler/gateway/engine/
tool edits without ownership.
