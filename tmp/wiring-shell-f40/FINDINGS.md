# Shell/terminal-execution-family wiring slice — exact NVIDIA f40 bytes (read-only audit)

EXACT_SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048 (frozen full api/src, tmp/wiring-browser-f40)
AUDIT_DATE=2026-10-04
AGENT=MUSE (independent audit lane; implementation owner NVIDIA — NO source edits)
SCOPE=L1 definitions → L2 registration → L3 planner/picker/executor/gateway refs, static only
METHOD=reused frozen f40 tree + tmp/wiring-shell-f40/refcount.py + targeted reads
NOTE=refcount "registry" group matches string names only; class-instantiation
registrations (new ShellExecuteTool()) were verified by direct grep, not the counter.

## L1 — Implemented (5 tool classes, 3 files)

| File | Class | Tool name |
|---|---|---|
| SystemTools.ts:1481 | ShellExecuteTool | shell_execute |
| SystemTools.ts:1189 | NpmManagerTool | npm_manager |
| SystemTools.ts:1719 | ShellStatusTool | shell_check_status |
| TaskInteractionTools.ts:50 | TerminalManagerTool | terminal_manager |
| RepoSelfCodingTools.ts:213 | RepoRunCommandTool | repo_run_command |

Execution backends (all roads lead to the kernel):
- shell_execute → executionEngine.execute({type:'shell',...}) (:1632 bg path;
  foreground path same engine) with workspace-root cwd + persistent
  .joe/shell_state.json CWD (:1574-1585), command-aware timeouts (30s / 300s
  long-runner), background dedupe (same command+workspace reused, EADDRINUSE
  guard), dryRun, secret redaction at emit, blocklist (rm -rf /, sudo).
- repo_run_command → executionEngine.run(command, {cwd, timeout}) via local
  runSafeCommand (:89-96), gated by isAllowedCommand prefix allowlist
  (npm test/build/lint/typecheck, tsc --noEmit, git diff/status/log) plus
  blocked-fragment denylist, cwd via assertSafeRelativePath or repo root.
- terminal_manager → terminalKernel persistent pty sessions, session-scoped
  ids (terminal:<sessionId>), no process-wide default fallback.
- shell_check_status → reads module-level backgroundProcesses Map (same
  process only), process.kill(pid,0) liveness.

## L2 — Registered (5 of 5)

- repo_run_command: registry.ts:268 (new RepoRunCommandTool()).
- shell_execute: registry.ts:319. npm_manager + shell_check_status:
  registry.ts:332-333 (the :325-331 [AUDIT] comment narrates their past
  defined-but-never-registered state and the repair — historical, not live).
- terminal_manager: registry.ts:334.
- IMPLEMENTED_NOT_REGISTERED: 0. DUPLICATE: 0.

## L3 — Planner / picker / gateway / executor / repair refs (counts: refcount.log)

shell_execute (24 prod files) — FULLY_WIRED:
- plan-tools.ts x17: purpose ('run a build/test command') + rich keyword map
  (bash/sh/terminal/cli/command → shell_execute); native-dependency guard
  (native_dependency_requires_npm_manager); REQUIRED_DEFAULTS
  {command:'npm run build'}; shell-smoke verification contract (:938-983).
- tool-picker.ts PRIORITY slot (registered → byName.get HITS; LLM-visible).
- ToolService: full risk ladder (:155-170: critical/high/medium + exact
  read-only-diagnostic low path with chaining rejection); aliases IN
  (command_execute/run_command/exec/terminal → shell_execute, :430).
- PhaseExecutor x17: cwd-inheritance set (:432), server/browser-start
  detection (:1402-1424), evidence spread (:1544/:1833/:1931), missing-script
  diagnosis (:1777), auto-build executeTool call (:2525).
- SelfFixExecutionService ALLOWED set (:14); PlanningEngine deterministic
  routes (explicit build :1128, terminal diagnostic :1162); approvals.ts
  secret redaction (:27); AgentOrchestrator + verification-ledger refs.

npm_manager (11 prod files) — FULLY_WIRED:
- plan-tools.ts x14: purpose + keyword map (npm/yarn/pnpm/package manager/
  install/dependencies); install-action guard (:475); REQUIRED_DEFAULTS
  {operation:'install'}; native-manifest toolchain question (:547).
- ToolService: 5 hallucinated-name aliases IN (npm_install/install_package/
  npm_build/npm_run/npm_test/npm_start → npm_manager with command/script
  fill, :407-425); medium risk (:197).
- PhaseExecutor: cwd inheritance (:432) + runtime-project install call
  (:1040-1045); SelfFix ALLOWED (:15); ProjectPipelineTool + ProjectRunTool
  refs.

terminal_manager (7 prod files) — PARTIALLY_WIRED (planner-discovery gap):
- PhaseExecutor: cwd inheritance (:432), start detection (:958/:1402-1424);
  ToolService alias map entry (:244-245, see S2); ProjectPlannerTool +
  AgentOrchestrator refs; toolCatalog.ts:62 documents past invisibility.
- NO plan-tools.ts keyword/purpose entry; NO tool-picker PRIORITY slot; NO
  PlanningEngine deterministic route; NO SelfFix membership. Reaches the LLM
  only via generic registry visibility, unlike shell_execute's keyword net.

repo_run_command (1 prod file = own definition) — PARTIALLY_WIRED
(registered but undiscoverable; intent needs owner disposition):
- Zero refs in plan-tools/toolCatalog/tool-picker/PlanningEngine/
  IntentParser/ToolService/PhaseExecutor/SelfFix/approvals/API routes.
- Fail-closed design (prefix allowlist + denylist + safe-relative cwd) is
  sound; the open question is INTENT: internal repo-QA utility
  (INTERNAL_ONLY_BY_DESIGN) or planner tool missing its discovery entries.
  No in-tree doc states either. Do NOT auto-expose; ask NVIDIA.

shell_check_status (2 prod files = own def + registry) — PARTIALLY_WIRED:
- Registered companion to shell_execute background jobs; no planner keyword,
  no PRIORITY slot (see S1 near-miss), no executor refs. Usable only if the
  model already knows the name. Plus S3 process-locality limit.

## Findings

- S1 (3 wasted PRIORITY slots, LOW, same class as git-slice G1):
  PRIORITY_TOOL_NAMES (tool-picker.ts:11) lists "tool_create_shell",
  "shell_status", "command_policy_check" — zero `name =` declarations
  tree-wide, so byName.get misses and the LLM never receives them.
  "shell_status" is a near-miss of registered "shell_check_status".
  Fix (NVIDIA-owned): correct to shell_check_status (closes half the
  shell_check_status discovery gap) or drop; disposition the other two.
  Do NOT touch ToolService behavior.
- S2 (alias-layer inconsistency, LOW-MEDIUM, needs owner disposition):
  TOOL_ALIASES run_command→terminal_manager (:244) is DEAD: the earlier
  [FIX] rewrite run_command→shell_execute (:430) resolves tDef first and
  the map only applies `if (!tDef)` (:691-697). Harmless but misleading.
  Worse, 'bash' routes to shell_execute via the planner keyword map yet to
  terminal_manager via direct ToolService alias (:245) — inconsistent
  targets across layers with incompatible input shapes (command vs
  action-enum). No live failure evidenced; reconcile (one target) or
  document the split. NVIDIA-owned.
- S3 (process-local background registry, portability note, not a bug today):
  backgroundProcesses is a module-level Map; bg dedupe + shell_check_status
  only see same-process jobs. Multi-instance/portable deployments lose
  bg-job visibility and dedupe. Record for production-portability; no
  action on the single-process dev runtime.
- S4 (POSITIVE — fail-closed pattern): repo_run_command's allowlist +
  denylist + safe-relative-cwd design is the right shape for autonomous
  command execution; only its intended discoverability is open.
- S5 (POSITIVE — layered defense verified): shell_execute risk ladder
  (ToolService) + tool-level blocklist + approvals-route redaction +
  tool-level emit redaction compose without contradiction on f40 bytes.

## Classification summary (shell family, f40)

- FULLY_WIRED (registered + deterministic-planner-visible, same bar as the
  git/browser slices): 2 (shell_execute, npm_manager).
- PARTIALLY_WIRED: 3 (terminal_manager — no planner keyword/priority;
  repo_run_command — registered only, intent unknown;
  shell_check_status — registered only, priority near-miss).
- IMPLEMENTED_NOT_REGISTERED: 0. DUPLICATE: 0. UNKNOWN: 0 (repo intent is
  recorded as an open disposition question, not an unknown count).

## Ownership / non-overlap

- NVIDIA dirty lane touches PlanningEngine.ts / plan-tools.ts / registry.ts
  (CLI/schema lane); this slice READS f40 bytes only and touches no live
  tree. No overlap with NVIDIA's VisualQA/containment or verification work.
- S1/S2 repair owner: NVIDIA; Muse re-reviews fixed bytes. S4 intent
  question: NVIDIA disposition. No implementation by Muse.

## Repro

python tmp/wiring-shell-f40/refcount.py  (ROOT = frozen full f40 tree)
