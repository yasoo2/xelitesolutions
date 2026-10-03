# WIRING-169 -- Shell/terminal execution backbone census, live-verified (Muse independent)

MUSE_HEAD=48ef33b9 (tracked CLEAN at probe time; all 169 outputs new under tmp/wiring-169-shell-chain/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-03T01:4xZ (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha 8331936C...); definition/registry/dispatch/ledger/picker/planner/executor/engine files READ as text. ZERO DISPATCH: executeTool never called, no shell spawned, no files written, no commands ran, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). Same disclosed recipe as 163-167: esbuild (api/node_modules), --packages=external + NODE_PATH=api/node_modules; bundle deleted after runs, entry + logs + results + jest log preserved. Harness side effects disclosed: registry import created run/data/db/users.json (`[]`, 2 bytes, no payload), a rotation audit stub + 0-byte app log under run/logs/; the disposable run/ dir was inspected then removed. Absolute-path invocation (Set-Location to a plain path) per the 167 UNC note; esbuild flag is --packages=external (the `:external` spelling is rejected).

## TRIGGER
The shell chain is the highest-blast-radius backbone in Joe: every build, test,
install, and self-fix repair passes through it, and the open CONFLICT-WIRING-005
(BATCH-002 risk) turns on whether repo_run_command's whitelist is a real
shell boundary. Chain 169 live-proves registration, catalogue, alias, meaning
resolution, gate shapes, and the planner/executor fork surface for the six
execution tools, and re-verifies the whitelist->shell path on current HEAD.

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163 (ninth independent live count this week; "71 revived" unchanged);
  chain 6/6 registered (shell_execute, terminal_manager, npm_manager,
  repo_run_command, project_run, auto_tester). hasExecute=true for all 6;
  mockSupported=false for all 6.
- Catalogue 4/6: shell_execute, npm_manager, project_run, auto_tester.
  terminal_manager + repo_run_command NOT catalogued (same class as project_pipeline).
- auto_tester verificationUnconditional=true: the SECOND unconditional verifier
  known after browser_run (167). Declares permissions [execute] but sideEffects []
  while delegating to shell_execute (contract-mismatch class, see OBS-169-4).
- run_command: NOT registered, catalogue false, alias=terminal_manager (live
  TOOL_ALIASES hit). resolvePlannedTool('run_command') -> terminal_manager
  (how:alias) LIVE. BUT ToolService :429-431 code-redirects the RAW name
  run_command -> shell_execute at the executor layer, BEFORE the alias-table
  fallback (:691-698, which only fires when !tDef and therefore never fires
  for this name). Planner layer and executor layer DISAGREE (see OBS-169-1).
- shell_exec: unregistered, no alias, resolve -> unknown (live). Sole source
  reference is ProjectPipelineTool.ts:505 consumer-side key handling: a name
  the pipeline accepts and dispatch rejects (drift, OBS-169-6).
- shell_status / tool_create_shell / command_policy_check: unregistered, no
  alias. Present in tool-picker PRIORITY_TOOL_NAMES (:11) but the picker
  skips unregistered names (byName.get guard :44-51): dead config, fail-safe.
  Adjacent REAL tool shell_check_status IS registered (SystemTools names).
- bash: alias table -> terminal_manager WINS at the resolver (alias :234 is
  checked before MEANS :247); the MEANS bash -> shell_execute entry is
  shadowed dead config. Executor has no bash code-redirect, so the table
  fallback applies there too: consistent (terminal_manager both layers).
- TOOL_ALIASES chain hits live: run_command->terminal_manager,
  bash->terminal_manager, shell->shell_execute.
- resolvePlannedTool live, 10 phrases: 3 exact (shell_execute, npm_manager,
  terminal_manager) + 1 alias (run_command->terminal_manager) + 3 meaning-ok
  ('run the build command...'->shell_execute, 'install the npm dependencies
  ...'->npm_manager, 'open a terminal and show...'->shell_execute) + 1
  meaning-to-generator ('execute the test suite and report failures'->
  test_generator per explicit MEANS 'test suite'->test_generator: execution
  wording steered to a generator, OBS-169-5) + 2 UNKNOWN ('shell_exec' and
  the 'read the contents of package.json' CONTROL, unresolved for the 3rd
  cycle -- resolver narrowness, honestly reported).
- Gate shapes, 4/4 consistent with pinned tests: shell+`npm test` TRUE,
  shell+`npm install` FALSE, npm_manager install FALSE, auto_tester unit TRUE.
- Registry log live: "Registered 163 tools (71 revived)" (unchanged).
- registryTestRefs: 16 class-name occurrences.
- plan-tools refs: catalogue purposes + MEANS maps + npm-install-inside-shell
  blocker (:476/:538) + shell-verifier contract checks (:947/:983).
- PhaseExecutor refs: cwd-inherited set (npm/shell/terminal/auto :434),
  project_run stale-cwd guards, shell/terminal fallback + gate branches.

## SOURCE READS (Muse HEAD; ranges disclosed per file)
- ToolService.ts (:142-249 risk+aliases READ, :251-500 execute head/redirects
  READ, :670-730 dispatch/alias-fallback READ): classifyToolRisk shell branch
  (:155-169, critical/high/medium/low incl exact-diagnostic carve-out);
  TOOL_ALIASES run_command/bash/shell (:244-246); code redirects
  npm_*->npm_manager (:406-428), run_command/command_execute/exec/terminal->
  shell_execute (:429-431), manual_test/verify_build->project_detect (:432).
  Rest of file NOT read this cycle.
- plan-tools.ts (resolvePlannedTool :228-261 FULLY READ for order): exact
  (:232) -> alias (:234) -> normalised (:238) -> meaning (:247) -> nearest
  (:257). MEANS shell entries via probe refs (:133-137). Rest NOT read.
- PhaseExecutorTool.ts (:1385-1429 READ): every task tool passes
  resolvePlannedTool (:1394); unresolved -> honest skip; shell/terminal tasks
  get project_run start-fallbacks (:1404-1421). Rest NOT read.
- SystemTools.ts (ShellExecuteTool :1481-1596 FULLY READ incl redact/block/
  cwd; background path :1597-1655 READ; npm_manager :1190-1259 READ incl
  climb-guard head): shell_execute perms/sideEffects execute, rateLimit 60;
  redactCmd (:1524-1538, bearer/token/password/apikey/secret/--token/git-URL/
  PAT); naive substring block :1566 (`rm -rf /`, `sudo` -- `rm -rf
  --no-preserve-root /` does NOT contain the blocked substring, source-traced
  NOT executed, OBS-169-3); cwd via safePath + persisted-state revalidation
  (:1574-1595); background via executionEngine.execute detached (:1632);
  npm_manager perms execute/write/internet + manifest-required install guard
  (:1256-1259, positive containment). Rest of file NOT read.
- TaskInteractionTools.ts (:1-159 terminal_manager FULLY READ): contract
  {action: create|read|write|kill|list|resize} -- DIFFERENT from
  shell_execute's {command}: session id `terminal:${ownerSessionId}`,
  cwd=workspaceRoot, owner registration, write requires command, missing/
  unknown action fails closed :157. read_file/ask_user in file NOT read.
- RepoSelfCodingTools.ts (FULL FILE 281 lines READ): getRepoRoot =
  process.cwd()[/..] = JOE'S OWN SERVER TREE (:9-12); .env blocklist
  (:19-23); isAllowedCommand :66-87 = blocked-fragments + allowed-prefixes,
  NO chain/substitution rejection; runSafeCommand -> executionEngine.run
  (command, {cwd, timeout}) with NO shell option (:89-96). Combined with
  ExecutionEngine :996 this is prefix-filter -> shell:true (OBS-169-2,
  strengthens CONFLICT-WIRING-005; nothing executed).
- ExecutionEngine.ts (execute :262-294 READ, processExecution :296-336 READ,
  run/runArgv :534-574 READ, runCommandInternal :987-1000 READ): string
  commands -> runCommandInternal (:324) -> spawn(cmd, args, {shell:
  options.shell ?? true}) (:996); string path applies whitespace split
  (:989-991); NO command-content policy in execute/processExecution
  (cache/queue/trace only); runArgvInternal shell:false exists (:937) but
  repo_run_command does not use it. Rest NOT read.
- ProjectRunTool.ts (shell:true grep + :1764-1770 READ): the ONLY shell:true
  is killTree's fixed `taskkill /F /T /PID ${pid}` (pid:number) + a doc
  comment measuring consoles -- narrow surface. Rest NOT read.
- AutoTesterTool.ts (markers only + prior-cycle line refs :112/:212/:396):
  perms [execute], sideEffects [], delegates to shell_execute. Full read NOT
  done this cycle.
- tool-picker.ts (:1-51 READ): PRIORITY list incl 3 unregistered chain names
  (:11); unregistered entries skipped by the byName guard (:44-51). Rest NOT read.

## NVIDIA COMPARISON (read-only; HEAD e8fd9589 + dirty; hashes via Get-FileHash)
- 6/8 chain files BYTE-IDENTICAL both lines: SystemTools 280A2393,
  TaskInteractionTools 498E52E4, RepoSelfCodingTools 0D7BD1A0, ProjectRunTool
  DD38CBB9, ToolService F8608F51, ExecutionEngine 92959624. NVIDIA ToolService
  carries the same alias entry (:244) AND the same code redirect (:429):
  the run_command fork holds on BOTH lines.
- 2 files differ (line drift only, chain findings unaffected): plan-tools.ts
  (Muse 5EF3E108 vs NVIDIA 108E7638 -- MEANS shell entries, catalogue shell
  entries, and shell-verifier checks verified IDENTICAL on NVIDIA bytes via
  read-only grep) and AutoTesterTool.ts (Muse 521B8478 vs NVIDIA 9F5751BE --
  name/perms/sideEffects/mockSupported + 2 shell_execute delegations
  identical, line numbers drifted :396->:338).
- ALL 169 source findings hold on BOTH lines.
- HIGH_SECURITY marker: ABSENT from Muse api/src, NVIDIA api/src (full
  recurse), and team JOE-*.md -- the F10 record lives in
  BACKLOG-RECONCILIATION.md (2026-09-30 focused finding) as cited in 168;
  169 re-verifies its technical substance on current HEAD (see OBS-169-2).
- NVIDIA newest bytes re-checked: ProjectPipelineTool mtime still 10-03
  02:14, ProjectPlannerTool 09-24. NO new NVIDIA bytes -> CLI D1-D12
  NEEDS_REWORK stands as reviewed; no re-review owed. Worker untouched,
  0 writes there, no process stopped.
- :5002 /api/health this cycle: OK/LOCAL/uptime 111973s/version
  no-commit-file -> still the OLD Oct-1 binary. Fresh UAT would re-test the
  unreviewed binary: UAT remains BLOCKED.

## CLASSIFICATION (Muse independent position)
- shell_execute, npm_manager, project_run: FULLY_WIRED (registered +
  executable + catalogued + meaning-resolved + gate-consistent; shell carries
  a P3 hardening note, npm carries a positive containment guard).
- auto_tester: FULLY_WIRED with flag (registered + executable + catalogued +
  unconditional-verifier + meaning-resolved; sideEffects [] mismatch P3).
- terminal_manager, repo_run_command: PARTIALLY_WIRED (registered +
  executable + exact resolution, 0 catalogue; repo_run_command additionally
  carries SECURITY-GATED shell-boundary flags + server-tree scope).
- run_command: FORKED-ALIAS (planner -> terminal_manager via alias table;
  executor -> shell_execute via code redirect; contracts incompatible).
- shell_exec: VOCABULARY DRIFT (pipeline-accepted, dispatch-rejected).
- shell_status / tool_create_shell / command_policy_check: DEAD CONFIG
  (fail-safe: picker skips unregistered).
- run_shell_command / execute_command (+ 'terminal' as a tool NAME): TRUE
  PHANTOMS. Chain-wide: 3 exact + 1 alias + 3 meaning-ok + 1 meaning-steer
  + 2 unknown.

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-169-1 (P2): run_command planner/executor fork. Decide ONE target:
  planner sanitization + PhaseExecutor :1394 currently send it to
  terminal_manager (where shell-style args fail closed as 'Unknown action'),
  while any direct-executeTool path (self-fix repairs, nested calls, routes)
  runs it as shell_execute. Same un-bridged class as the web_search fork.
  Pin the winner with a planner/executor parity test (every alias-table name
  must resolve identically at both layers). Evidence: live how:alias +
  ToolService :429-431 vs :691-698 order + PhaseExecutor :1394, identical
  both lines.
- OBS-169-2 (SECURITY-GATED input; strengthens filed CONFLICT-WIRING-005, no
  new conflict): repo_run_command prefix-filter -> shell:true on current
  HEAD. isAllowedCommand has no chain/substitution rejection and
  runSafeCommand passes no shell option, so the whitelist text reaches
  runCommandInternal's shell:true default; getRepoRoot scopes this to Joe's
  own server tree. Repair direction (owner decision): reject shell
  metachars/chains or switch to runArgv; keep BATCH-002 SECURITY-GATED
  pending REPO-COMMAND-SHELL-BOUNDARY-001 + threat review. Evidence:
  RepoSelfCodingTools :9-12/:66-96 + ExecutionEngine :324/:996, identical
  both lines. Source-traced only, nothing executed.
- OBS-169-3 (P3): shell_execute :1566 naive substring block. `rm -rf
  --no-preserve-root /` (and similar flag-inserted variants) do not contain
  the blocked substring; the approval classifier (:157) covers rm -rf more
  broadly for ROUTING but the hard block is narrower. Harden to token-aware
  matching with negative pins. Evidence: :1566-1572 vs :157-158, identical
  both lines. Source-traced only, nothing executed.
- OBS-169-4 (P3): auto_tester sideEffects [] while executing test commands
  via nested shell_execute (:212/:338). Declare the execute sideEffect (same
  class as screenshot/monitoring). Evidence: live perTool + delegation
  lines, identical both lines.
- OBS-169-5 (P3): 'execute the test suite...' -> test_generator meaning
  steer. Execution wording is routed to a GENERATOR by explicit MEANS
  ('test suite'->test_generator). Needs planner-owner adjudication (upstream
  of this chain; flagged, not patched). Evidence: live resolveOutcomes +
  MEANS line, identical both lines.
- OBS-169-6 (P4): drift cleanup -- shell_exec pipeline ref (:505),
  3 dead picker entries (tool-picker :11), shadowed bash MEANS entry, 3 true
  phantoms; no behavior change. Evidence cited per item, identical both lines.
- BATCH note: shell backbone now has live Level-2/3 evidence (6/6
  registered, 4/6 catalogued, 1 live alias + 5 code redirects incl 1 fork,
  3 exact + 1 alias + 3 meaning-ok + 1 steer + 2 unknown, 4/4 gate pins,
  6/6 hasExecute, 5 def files + engine/gate reads with markers, picker
  fail-safe verified); Level-6 remains UNVERIFIED. One P2 + three P3 + one
  P4 proposed, plus SECURITY-GATED strengthening evidence for F10. Positive
  containment notes: npm-climb guard, terminal fail-closed, picker guard,
  shell redactCmd + cwd containment.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git status clean apart from new tmp/ evidence).
- Fresh rerun THIS cycle at HEAD 48ef33b9: prose-verification 18/18 PASS
  across 2 suites, JEST_EXIT=0, 59.5s (see jest-prose-169.log): contract +
  final-gate suites green. Invocation: Set-Location to a plain path +
  workspace TEMP/TMP + npx jest (first-try green this cycle; jest-tmp
  removed after the run, log kept).
- Gate pins ADD shell-surface evidence: install-shaped shell correctly
  rejected (npm-shape + shell-install-shape false), test-shaped shell and
  auto_tester accepted (true); no second silent-accept shape appeared.

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + redirect/alias
  adjudication + gate-shape pins + source reads); no shell spawned, no tool
  executed, no UAT (:5002 old binary, UAT BLOCKED).
- Probe limitations disclosed: (1) alias=null reflects the TOOL_ALIASES
  table only; code redirects adjudicated by source read; (2)
  resolvePlannedTool internals read for ORDER (exact->alias->normalised->
  meaning->nearest) but outcomes recorded live; (3) partial file reads
  disclosed per file above (full: RepoSelfCodingTools, terminal_manager
  class, ShellExecuteTool core, resolvePlannedTool, picker head, engine
  shell path); (4) security verdicts (whitelist bypass shape, substring
  block gap) are source-traced, NOT executed -- no payload was run;
  (5) the file-read control phrase did not resolve (3rd cycle) -- reported
  as resolver narrowness, not hidden or re-worded; (6) 'execute the test
  suite' steer reflects an EXPLICIT MEANS entry -- reported as a steer for
  planner-owner adjudication, not asserted as a bug.
- NVIDIA tree touched READ-ONLY (hashes + read-only greps, 0 writes there).
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
