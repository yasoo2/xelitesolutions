# MUSE Wiring Discovery 016 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 16)
HEAD=23718f74 + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for vcs_repo 11/11 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root + OS-temp + repo-root-scratch fixtures created
+ removed by the probe; NO network legs; GitHub legs are no-credential
negatives or pre-network rejections with dummy tokens only) + static
checker partition over the trunk + pure-function verdict table over
source-grounded shapes. Full trunk probe ran 2x exit 0 with identical
verdicts (43/43 legs ok/error/shape; only fixture commit SHAs differ).
A pre-normalization pilot run is preserved separately
(trunk_vcs_pilot.log/json): the sandbox user cannot read the owner's
global gitconfig/ignore, so repo-rooted git legs failed there on
dubious-ownership/ignore warnings. Runs A+B isolate git config via
empty system/global files + env-scoped safe.directory (recorded in
trunk_vcs.json gitEnv) — environment normalization, not behavior
selection: every defect below reproduces identically in both runs.
EVIDENCE=tmp/wiring-audit/trunk_vcs.mts + trunk_vcs.json (run B
machine-readable; run A preserved in trunk_vcs_runA.json) +
trunk_vcs.log (run A) + trunk_vcs_run2.log (run B) + pilot pair
(this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-015.md (code_understanding LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

vcs_repo = git_local_workflow, git_ops, github_actions, github_pr,
github_repo_manager, import_project, repo_apply_patch, repo_diff_summary,
repo_read_file, repo_run_command, repo_search (11). All 11 exist in the
live registry; no membership correction needed. 0/11 are task-level
checkers (gate opt-ins change nothing) — the 14/14 checker set stays
CLOSED with no new member.

## New findings (all Muse-branch @ 23718f74)

### F101. repo_run_command executes through cmd.exe: && chain + > redirect PROVEN live 2x (P1-005 NEW)

The tool advertises a "whitelisted repository QA command" contract
(RepoSelfCodingTools.ts:66-87 prefix allowlist + blockedFragments),
but execution travels ToolService -> executionEngine.run (string) ->
execute type 'shell' -> runCommandInternal, which whitespace-splits
and spawns with shell:true (ExecutionEngine.ts:987-1000; on Windows
Node concatenates into one cmd.exe line). Both metacharacter legs
pass the tool allowlist AND the firewall (risk medium, auto-approved
under default autoSafe) and execute:

- runcmd.chain-small ('git log --oneline -n 1 && echo VCSSAFE16')
  -> stdout = "<sha> <msg>\nVCSSAFE16\r\n" both runs: the chained
  echo RAN. ok:false is the orthogonal F102 exitCode defect.
- runcmd.redirect-shellmark ('git status --short >
  wiring-vcs-shellmark.txt') -> fileCreated:true at the JOE REPO
  root with git-status content both runs (probe-removed after;
  shellmarkRemoved:true). An arbitrary write via a read-shaped tool.

blockedFragments omits && || & > >> < | %VAR% powershell cmd and
the whole Windows LOLBIN vocabulary, so the prefix gate is a string
gate in front of a full shell. Caller-controlled input (planner /
model-composed command, possibly carrying user-request text)
reaches that shell. Repair direction (batch): argv execution
(runArgv) + strict argument validation, or shell-metacharacter
rejection before dispatch; re-tier risk to high for any
non-exact command. NOT implemented here (audit-first; needs
implementation owner + security review).

### F102. repo_run_command + repo_diff_summary ALWAYS ok:false: run() drops exitCode (MISMATCH #12 NEW, engine/tool contract)

executionEngine.run() returns {ok, output, error, pid, duration} —
NO exitCode (ExecutionEngine.ts:534-552) — while runArgv() DOES
include it (:560-575). runSafeCommand reads result.exitCode
(RepoSelfCodingTools.ts:89-96) so code is ALWAYS undefined:
- runcmd.git-status: stdout = correct full git status, yet ok:false
  + 'command_failed' both runs; outputShape HAS the exitCode key
  but the preview never carries it (undefined value dropped).
- diff.summary: status/diffStat correct, yet ok:false with NO error
  both runs — ToolService wraps it as 'Tool reported failure
  without an error message' (the P2-005 2nd instance, now
  mechanism-resolved: the "missing error" is an always-false ok,
  not a git failure).
A verifier reading ok-only marks every repo QA run failed
(fail-closed but noisy; likely spurious self-fix/PhaseExecutor
retries — mechanism flagged, not live-proven). Repair: run()
exposes exitCode like runArgv, or both tools use result.ok.
Independent of F101 (stdout proves execution either way).

### F103. github_actions workflowType path traversal + silent template substitution + uncontained writes (P1-006 NEW + P2-004 12th + P2-006 extension, LIVE 2x)

saveWorkflow joins projectPath + '.github/workflows' +
`${workflowType}.yml` with NO containment (GitHubActionsTool.ts:
235-248; execute takes NO context param — 5th no-context instance):
- actions.traversal (workflowType '../../traversal16') ->
  landedOutsideWorkflowsDir:true: FXACTIONS/traversal16.yml
  created OUTSIDE .github/workflows (workflowsDirClean:true,
  normalizedSame:true) both runs. Live path traversal, contained
  to the probe fixture.
- actions.bogus-type ('bogus-type-16') -> ok:true + file whose
  head bytes are the node-ci template: generateWorkflow silently
  falls back (|| workflows['node-ci'], :105) while reporting the
  requested type — 12th P2-004 silent-substitution instance.
- actions.outside-write (projectPath = OS-temp dir) -> ok:true +
  .github/workflows/node-ci.yml written OUTSIDE the session
  (outsideWrote:true) both runs. No resolveToolPath, no workspace
  binding. Repair: accept context, resolve + contain projectPath,
  whitelist workflowType (or reject separators), honest error on
  unknown type.

### F104. import_project opens absolute outside-workspace paths; no-URL guidance receipts as passed (P2-006 extension + F88-class constraint, LIVE 2x)

- import.outside-absolute (existing OS-temp dir) -> ok:true +
  full analysis + audit + session registration both runs:
  resolveToolPath anchors RELATIVES to the session (missing-path
  leg -> honest no_such_path) but accepts ABSOLUTE outsiders.
  Any session can open + audit + register an arbitrary local path.
- import.no-url ({request:'please import my project'}) -> ok:true
  + guidance message both runs -> verdict-table maps it 'passed'
  (12-shape table): a NO-OP ok receipts as passed. F88-class
  non-checker constraint — safe today (import_project is not a
  checker), must gate any allowlist change; 13th P2-004 instance
  counted with the guidance-pass shape.
- import.local-positive (fixture package.json test=jest, NO
  node_modules) -> ok:true, verification message =
  skipped_dependencies_missing WITHOUT executing anything both
  runs: the safe-test allowlist (isSafeTestScript) + no-install
  rule work as designed. Persistence isolated via
  JOE_CHAT_STORE_DIR=fx dir (storeEvidence key audit-sess in fx
  store only; real api/data/db untouched).

### F105. github_repo_manager push is a deliberate ToolService rewrite to git_ops; github_pr merge is a genuine dead enum (EXECUTOR_REDIRECT + MISMATCH #4 3rd instance, LIVE 2x)

- mgr.push-unknown (action push + dummy token) -> log0 'start
  git_ops (orig=github_repo_manager)', risk high ->
  approval_required pre-execution, NO network both runs. The
  schema enum 'push' NEVER reaches GitHubRepoManagerTool's switch:
  ToolService.ts:547-550 reroutes push -> git_ops+operation=push
  by design. The pre-fix hypothesis 'push falls into Unknown
  action' is REFUTED — this is a documented compatibility
  redirect, and the leg proves it end-to-end (rewrite target
  classification inherited: git.push-approval direct leg ->
  identical approval_required/high, no git spawn).
- pr.merge-unknown (action merge + dummy token) -> 'Unknown
  action: merge' both runs, NO network (throw precedes
  githubRequest): the inputSchema enum PROMISES merge but the
  switch has no case (GitHubPRTool.ts:93-102) and no rewrite
  covers it. 3rd MISMATCH #4 planner-facing dead contract: a
  planner selecting per-schema always fails. Repair rides with
  the P2-002 single-winner/contract batch (implement merge or
  drop it from the enum).

### F106. Approval-layer ordering proven: firewall precedes tool allowlist, network, and execution (LIVE 2x)

- runcmd.blocked ('rm -rf /tmp/x') -> firewall critical ->
  approval_required; the tool's own 'command_not_allowed' is
  UNREACHABLE for rm-patterns (defense in depth; ToolService.ts:
  201 whole-input scan + :778-784 gate).
- git.push-approval + mgr.push-unknown -> high -> approval with
  zero git/network side effects (fast legs): classification
  precedes execution. All other 40 legs passed the gate (2
  expected approvals, 0 unexpected; no rate-limit hit).

### F107. git_ops default cwd = local default workspace, explicit cwd honored raw incl. outside (P2-006 no-arg-root + uncontained-cwd extensions, LIVE 2x)

- git.default-cwd (no cwd) -> ok:true, status paths carry
  ../../../ (data/projects/<ws>, 3 below root) while the session
  root is data/projects/session-audit-sess: the no-arg
  getActiveRoot() fallback (GitTools.ts:107) runs git in the
  DEFAULT workspace, never the caller's session. 6th no-arg-root
  shape (default-root variant).
- git.outside-cwd (OS-temp git repo) -> ok:true both runs: cwd is
  passed raw with no containment (same input.cwd shape as the
  fallback line). status-seeded exact (untracked.txt shown);
  invalid-op honest; clone-noargs fails locally pre-network
  (usage text, fast).

### F108. git_local_workflow full positive live 2x + context binding proven

local.positive (request naming branch joe/fx-audit-16 + docs note)
-> ok:true; probe-side git verify: branch EXACTLY joe/fx-audit-16,
status empty, note exists, log1 'docs: add Joe Git validation
smoke note' (SHAs differ per fresh fixture, all else identical).
pushed:false, remotePublication not_performed. Binding proof:
local.no-import failed BEFORE the global.joeProjects['audit-sess']
entry existed and positive succeeded AFTER — the ToolService
sessionId reaches the tool's context (GitLocalWorkflowTool.ts:101)
and selects the session entry. empty-request honest. (Pilot note:
the first positive attempt failed imported_repository_not_clean
on sandbox git-ignore warnings — environment-shaped, resolved by
the git-config isolation; runs A+B are warning-free.)

### F109. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 11/11; 10/11 best-rank-1 on self-name goals.
Two divergences: (a) git_ops ranks 4th on its own name goal
(behind github_pr/github_repo_manager/git_local_workflow) — the
only non-rank-1 trunk member (selection quirk, minor);
(b) import_project is ROUTER_EXCLUDED yet catalog rank 1 —
exclusion applies to the ACT-verb fast-path/rerank pool, not
selectToolsFor (same flag/catalog split as checkpoint 8 files
tools; router-side proof still outstanding). 1/11 priority-listed
(git_ops); 0/16 router-excluded otherwise. Source<->registry
permissions match 11/11 (no new P2-003 members). Static skews
noted, not live defects: pr/mgr declare write sideEffects without
a write permission; import_project declares internet permission
without an internet sideEffect.

### F110. Positive controls + hygiene (LIVE 2x)

read.seeded AGENTS.md bytes exact; search.seeded count EXACTLY 1
(RepoSelfCodingTools.ts:214); patch.dryrun byte-preserved +
patch.real-write byte-applied (dryRunPreserved:true,
writeApplied:true); actions.seeded node-ci head exact;
pr.no-token + mgr.no-token-no-repo honest pre-network;
actions.list-runs + missing-type honest; local empty/no-import
honest; git negatives honest; fixtures removed both runs
(fixturesRemoved:true); repo-root scratch + shellmark removed;
real api/data/db store untouched; hadGithubTokenEnv recorded
(false in this sandbox).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=6/19 fully storied (vcs_repo 11/11 LEVEL-4 + static
verification-compat; no new checker) — files 10/10 + browser_ui
33/33 + testing_qa 6/6 + security 3/3 + code_understanding 16/16 +
vcs_repo 11/11 = 79 tools
TRUNK_VCS=11/11 SELECTABLE (10 rank-1, git_ops rank-4); 43/43 live
legs canonical (7 git + 3 local + 4 import + 5 read + 3 search +
4 patch + 5 runcmd + 1 diff + 2 pr + 2 mgr + 5 actions + 2 store/
shellmark evidence reads), 2x verdict-identical; 12-shape verdict
table; fixtures removed both runs
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=12 confirmed (NEW #12: ExecutionEngine.run()
drops exitCode while RepoSelfCodingTools require it — F102; #4
extends with pr-merge dead enum — F105; push-redirect hypothesis
REFUTED, it is a deliberate rewrite)
EXECUTABLE_NOT_VERIFIABLE=0 on 6 swept trunks (79/79 verdict-
mappable; import-no-url-guidance + patch-dryrun-preview join the
F88 non-checker passed-constraints — safe today, must gate any
allowlist change) + 7 evidence-hollow receipt shapes + 1
dead-reuse path (#10) + skip-blind mapping (F75) + 1
missing-path-as-clean shape (F85) + 1 missing-as-error-status
shape (F94) + 2 always-false-ok shapes (F102 runcmd/diff — noisy
fail-closed, opposite direction from the hollow passes)
CHECKER_SET=14/14 (unchanged; 0/11 trunk checkers; L5 live gate
proof still pending for the same 5)
P1_ITEMS=2 new (P1-005 shell-escape F101, P1-006 traversal F103)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-005 (repo_run_command shell-escape F101):
  argv-or-reject repair + risk re-tier + blockedFragment review.
- NEW WIRING-P1-006 (github_actions traversal/substitution/
  containment F103): context + resolve + type whitelist.
- NEW MISMATCH #12 (run()-exitCode contract F102): run() exposes
  exitCode like runArgv, or both tools use result.ok; resolves
  the P2-005 diff.summary instance mechanism (always-false, not
  git failure).
- EXTENDED MISMATCH #4 (3rd dead contract: pr merge enum F105;
  repair rides P2-002).
- EXTENDED WIRING-P2-004 (12th instance: bogus-type silent
  substitution F103; 13th: import no-URL guidance-pass F104).
- EXTENDED WIRING-P2-006 (import outside-absolute F104; actions
  outside-write + no-context F103; git_ops default-cwd +
  outside-cwd F107).
- LIFTED nothing; embargoes hold (all GitHub network legs;
  import clone path; git push/fetch/pull network ops; all
  model-present behavior unprobed).
- REDIRECT note (not a defect): github_repo_manager push ->
  git_ops rewrite (ToolService.ts:547-550) proven end-to-end
  (F105); registry-vs-execution routing must cite it.

## Corrections to prior checkpoints

- P2-005 'repo_diff_summary swallowed-cause' is now
  MECHANISM-RESOLVED: the tool is ALWAYS ok:false without error
  because exitCode is undefined (F102) — the generic wrapper
  message is a symptom of the engine contract, not a git failure.
- The checkpoint-16 pre-registration hypothesis 'repo push enum
  falls into Unknown action' is REFUTED: push is deliberately
  rewritten to git_ops before dispatch (F105).
- The checkpoint-16 pre-registration hypothesis 'chain payloads
  fail at the tool allowlist' is REFUTED: prefix-matched chains
  execute via shell (F101); only blockedFragment-listed
  substrings stop at the tool, and the firewall sees medium.
- Pilot-vs-runs note: repo-rooted git legs are user-sensitive
  (safe.directory ownership + unreadable global ignore); future
  probes against the Joe checkout must isolate git config as
  trunk_vcs.mts does, or record the sandbox shaping explicitly.

## Limits / UNKNOWNs

- 13/19 trunks still unstories; build_generate=13 suggested next
  by impact (last planner-adjacent write trunk); L5 live gate
  proof for 5 checkers remains the alternative single-method step.
- L5 live gate proof pending for quality_run/auto_tester/
  dep_audit/secrets_scan_repo/code_reviewer (5 checkers).
- All GitHub API behavior unprobed (no token, no network by
  design); github write paths (pr create, repo create/delete)
  never executed.
- git push/fetch/pull/clone network ops never executed
  (approval + usage legs only).
- import_project clone path never executed (local-folder only).
- npm/pnpm/yarn legs of repo_run_command never executed (git
  legs only; npm would run Joe's own scripts).
- Shell-escape severity beyond read/redirect legs unprobed
  (no payload beyond echo/redirect; no exfiltration attempt).
- F102 repair direction (run() gains exitCode vs tools use ok)
  undecided; needs engine-owner review (shared component).
- git_ops rank-4 cause (scoring weights) unanalyzed.
- import_project router-exclusion actual enforcement point
  unprobed (catalog/rank only).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (ToolService/ExecutionEngine read-only
  cited; CLI-BATCH1 + EVAL-006 + registry overlap avoided —
  probe performs zero source edits).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env:
  $fx='<worktree>\tmp\wiring-audit\fx-vcs' (auto-created)
  $env:TEMP=$fx\tmp; $env:TMP=$fx\tmp; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset for the no-token legs)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_vcs.mts
Expected: exit 0; 11/11 SELECTABLE (git_ops rank-4); 43/43 legs
(7 git + 3 local + 4 import + 5 read + 3 search + 4 patch +
5 runcmd + 1 diff + 2 pr + 2 mgr + 5 actions + 2 evidence reads);
run-2 verdict-identical to run-1 (only fixture commit SHAs
differ); fixtures removed; repo-root scratch + shellmark removed;
real api/data/db store untouched. Git config is isolated by the
probe itself (fx-gitenv); without it, repo-rooted legs fail on
sandbox ownership/ignore warnings (see pilot pair).
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied; git legs take ~1-2s each; full run ~3-4 min cold.
