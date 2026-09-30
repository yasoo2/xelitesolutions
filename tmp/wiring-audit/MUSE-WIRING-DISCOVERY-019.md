# MUSE Wiring Discovery 019 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 19)
HEAD=19692487 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for shell_terminal 4/4 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures created + removed by the probe; harmless
commands only: echo, node -e exit/print/cwd, bounded 10s self-exiting
sleepers reaped via status, npm --version, one session pty with echo-only
write; NO network legs; no model legs) + static checker partition over the
trunk + pure-function verdict table over source-grounded shapes. Full trunk
probe ran 3x with 25/25 verdict-identical legs across the two filed runs
(ok + error-prefix; runs A/B archived as JSON). Follow-up shell_cwd probe
5/5 legs 2x identical. No live process survived: sleepers self-exited and
were reaped, the pty was killed, fixtures removed, ports untouched.
EVIDENCE=tmp/wiring-audit/trunk_shell.mts + trunk_shell_run{A,B}.json +
trunk_shell_run{1,2}.log + shell_cwd.mts + shell_cwd_run{A,B}.json +
shell_cwd_run{1,2}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-018.md (runtime_services LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

shell_terminal = npm_manager, shell_check_status, shell_execute,
terminal_manager (4). All 4 exist in the live registry (the registry
comment confirms npm_manager + shell_check_status were revived by an
earlier audit fix — this story verifies they are now reachable). 0/4 are
task-level checkers.

## New findings (all Muse-branch @ 19692487)

### F135. shell_execute runs in C:\Windows while the receipt claims the session dir (LIVE 2x + 2x, P1-010 NEW)

pwd.node (node prints process.cwd(), cwd=session fixture dir) ->
stdout `C:\Windows` BOTH follow-up runs, while the receipt's cwd field
is the session fixture dir. exit3.nocwd/exit3 legs show the mechanism:
cmd.exe prints `'\\?\D:\...' CMD.EXE was started with the above path
as the current directory. UNC paths are not supported. Defaulting to
Windows directory.` — then RUNS the command there. The receipt still
reports ok + cwd=<session dir> (echo leg: exitCode 0, token in stdout).
Mechanism (resolved): sessionRoot arrives as a `\\?\`-prefixed extended
path in this environment (WorkspaceService.externalRoot derives from
process.cwd(); EVIDENCE lines show sessionRoot=`\\?\D:\...`), and
nothing normalizes it before spawn: safePath/resolveToolPath pass the
`\\?\` path through (utils.ts:82-84 path.resolve preserves the prefix),
and cmd.exe cannot start in it. The OBSERVED wrong-dir execution is
environment-triggered (a `\\?\` root), but the CODE defects are
environment-independent: no extended-prefix normalization before spawn,
no post-spawn cwd verification, and the receipt asserts a cwd that was
never honored. Any host that produces a `\\?\` root (long-path handling,
sandbox-like launchers, virtualized CWD) silently runs every shell
build/test/verify step in the wrong directory: relative-path WRITES
would land in C:\Windows, and relative-path READS test the wrong tree.
F124-class receipt-vs-reality defect, stronger blast radius (it covers
ALL shell_execute traffic, not one lifecycle path). Repair direction
(batch P1-010): normalize extended prefixes at the path boundary
(getActiveRoot/externalRoot strip + prefix-aware isWithinRoot
comparison beside the existing case-insensitivity logic) AND normalize
the spawn cwd in shell_execute/handleShellCommand; verify on a plain
(non-`\\?\`) host AND keep the normalization regardless. NOT
implemented here (audit-first; needs implementation owner + review).

### F136. shell_execute normalizes every exit code to 0/1 (SOURCE + live shape, P2-024 NEW)

SystemTools.ts builds `exitCode: r.ok ? 0 : 1` — the real code is
discarded at the tool layer. All live legs confirm the shape:
exitCode is 0 on success, 1 on every failure (exit-3 attempt, missing
cwd, UNC failure). A clean live isolation (exit 3 with no stderr
noise) is IMPOSSIBLE in this environment because every shell cwd is
`\\?\` (F135), so this is source-proven + shape-confirmed, not
live-isolated. Sibling of F102 (repo_run_command exit=undefined):
the shell layer destroys exit-code fidelity in the opposite direction
(collapse instead of absence). Verifiers and self-fix cannot
distinguish "tests failed (1)" from "crashed (134)" from "killed (137)".

### F137. safePath rejects a plain D:\ cwd that IS inside the `\\?\` root (LIVE 2x, P1-010 same batch)

exit3.plain (cwd spelled as plain `D:\...pkg`) ->
`path_outside_workspace: D:\... (Root: \\?\D:\...)` BOTH runs. The
identical directory spelled with the `\\?\` prefix is ACCEPTED (but
executes in the wrong dir, F135). Combined effect: under a `\\?\` root
there is NO cwd spelling that both passes containment AND executes in
the right directory. Root cause (same as F135): path.resolve preserves
the `\\?\` prefix and isWithinRoot (utils.ts:82-101) compares
prefix-blind — the function already special-cases Windows
case-insensitivity with an explanatory comment, but has no
extended-prefix normalization. Repair rides P1-010.

### F138. shell missing-cwd failure blames cmd.exe, not the cwd (LIVE 2x, P2-009 4th)

shell.cwd-missing -> ok:false + `spawn C:\WINDOWS\system32\cmd.exe
ENOENT`, durationMs 19, BOTH runs. The message reads as "cmd.exe is
missing"; the actual defect is "the requested cwd does not exist".
No pre-spawn cwd existence check (contrast the tool's own state-file
guard, which validates a persisted cwd on the way back in). Honest
direction (ok:false), misleading shape. 4th instance of the P2-009
error-evidence family (cf. deploy package raw ENOENT F127).

### F139. dryRun receipts map PASSED (pure function + source shape, MISMATCH #14 NEW)

Part B 'shell dryrun' ({ok:true, output:{dryRun:true,...}}) ->
verdictOf PASSED. dryRun is a legitimate preview feature and the TOOL
is honest (it says dryRun:true); the CONSUMER is blind — a dry-run
observation can satisfy a behavior check that never executed anything.
Sibling of MISMATCH #13 (verdict blind to serverReady:false, F129d).
Fix direction is verifier-side (a dry-run receipt must not close a
behavior check), same batch class as #13.

### F140. Firewall preempts tool guards on the canonical path (LIVE 2x, layered-defense note)

shell.nocmd / shell.missingbin -> approval_required/high;
shell.blocked-sudo / shell.overblock (`echo sudo`) -> approval_required/
critical; bare `cd` (both cwd spellings) -> approval_required — ALL
before tool code runs, BOTH runs. Positives: unknown-binary gating and
sudo-keyword gating WORK through the real gateway (default-deny holds).
Notes: (a) the tool-level `rm -rf /`/sudo substring block
(SystemTools.ts:1566) is UNREACHABLE via the default-deny path for
sudo-containing commands — layered defense now depends on the firewall
classification staying; (b) `echo sudo` blocked = keyword overblock
(fail-closed, negligible cost); (c) read-only `cd` needs approval
(fail-closed). No repair proposed; recorded so a future "the tool
blocks sudo" claim is not confused with "the firewall blocks sudo".

### F141. bg + status + npm + terminal lifecycle true positives (LIVE 2x)

shell.bg1 -> background id+pid; shell.bg2-reuse (same command+workspace)
-> already_running with the SAME id (dedup works); status.running ->
running:true; status.unknown -> honest 'Process not found';
status.after (post-12s-sleep) -> running:false with uptime (natural-exit
reap works; no leaked process, no orphan record). npm.missing ->
missing_command; npm.refused (install into non-package dir) ->
npm_install_target_is_not_a_package (the npm-climbs guard HOLDS, no
network touched); npm.version -> real `11.16.0` (npm_manager executes
a real npm on Windows through the shell:true path). terminal_manager:
create (real pty, pid, NOT fallback) -> list shows it -> write echo ->
read history CONTAINS the token (write→read EFFECT proven through a
real PowerShell pty, PSReadLine frames visible) -> kill -> read-after-kill
honest 'Terminal not found'. Terminal CWD is the session root (the
ONE WORLD invariant holds). 0/4 trunk members are task-level checkers
(partition table in JSON); background/already_running map `incomplete`
(sane — a started-but-unobserved process does not verify).

### F142. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 4/4, all rank-1 on self-name (the revived
npm_manager/shell_check_status are now genuinely selectable — the
earlier audit fix is VERIFIED live, not just registered).
shell_check_status is among the 21 permission-defaulted tools (->read
at boot; same systemic family as summary finding #4). node DEP0190
fires on the shell path (child process with shell:true + args — the
handleShellCommand pattern; pre-existing, note for the P1-010 owner).
[ENGINE] SLOW EXECUTION logs 1-4s for echo/node/npm on Windows
(perf note, not a defect). `executedOn:local` present on shell
receipts; serverId remote path stays embargoed (code-cited only).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=9/19 fully storied (shell_terminal 4/4 LEVEL-4 + static
verification-compat + checker-set 0/4; bg/status/npm/terminal lifecycles
L5-grade legs) — files 10/10 + browser_ui 33/33 + testing_qa 6/6 +
security 3/3 + code_understanding 16/16 + vcs_repo 11/11 +
build_generate 13/13 + runtime_services 5/5 + shell_terminal 4/4 = 101 tools
TRUNK_SHELL=4/4 SELECTABLE rank-1; 25/25 live legs canonical 3x total,
filed runs A/B verdict-identical (ok + error-prefix); follow-up
shell_cwd 5/5 legs 2x identical; 12-shape verdict table; fixtures
removed (sleepers self-exited + reaped, pty killed, session root clean)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=14 confirmed (NEW #14: verdict mapping ignores
dryRun flag — F139; no other new number)
EXECUTABLE_NOT_VERIFIABLE=0 on 9 swept trunks (101/101 verdict-
mappable; dryrun-ok joins as MAPPING-false-pass (#14) — distinct
from hollow receipts: the TOOL is honest (dryRun:true), the CONSUMER
is blind; exit-code collapse (F136) is evidence-fidelity loss, not a
verdict-mapping defect)
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/4 trunk task-level checkers)
P1_ITEMS=1 new (P1-010 extended-prefix path handling F135+F137)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-010 (extended-prefix path handling F135+F137): strip /
  normalize `\\?\` prefixes at the path boundary (getActiveRoot /
  externalRoot / resolveToolPath comparison beside the existing
  case-insensitivity logic) + normalize the spawn cwd in
  shell_execute/handleShellCommand; verify on a plain host AND keep the
  normalization regardless; companion: post-spawn cwd assertion or
  receipt honesty (never claim a cwd that was not honored).
- NEW WIRING-P2-024 (exit-code fidelity F136): preserve real exit codes
  through shell_execute (and audit sibling collapses); verifiers keep
  working when codes are present.
- NEW MISMATCH #14 (verdict blind to dryRun F139): verdictOf must not
  let a dry-run receipt close a behavior check; rides the #13 batch.
- EXTENDED WIRING-P2-009 (4th: shell missing-cwd spawn ENOENT F138).
- LIFTED nothing; embargoes hold (npm registry installs; serverId
  remote path; destructive commands beyond the documented block legs;
  long-lived background servers; interactive terminal use; all
  model-present behavior unprobed).

## Working hypotheses (formed at source-read, before first run)

- 'bg reuse dedups by command+workspace' — CONFIRMED (same id, F141).
- 'npm install into a non-package dir is refused without network' —
  CONFIRMED (F141).
- 'exit codes are normalized to 0/1' — CONFIRMED by source + live
  shape (F136).
- 'cwd is honored as given' — REFUTED: `\\?\` cwd executes in
  C:\Windows (F135), plain cwd is rejected (F137).
- 'missing cwd yields a cwd-shaped error' — REFUTED: spawn-ENOENT
  blames cmd.exe (F138).
- 'the tool-level sudo block fires through the canonical path' —
  REFUTED as the operative layer: the firewall preempts with
  approval_required/critical first (F140).
- 'dryRun receipts fail verification' — REFUTED: they map PASSED
  (F139).

## Limits / UNKNOWNs

- 10/19 trunks still unstories; network_api=12 or database_data=6
  suggested next by size; planning_orchestration overlaps NVIDIA-owned
  files — do not story without coordination.
- F135/F137 `\\?\` trigger is environment-shaped (this sandbox's
  process CWD virtualizes to extended form); the code defects
  (prefix-blind compare, unnormalized spawn cwd, asserted-but-unhonored
  receipt cwd) are environment-independent. A plain-host run would show
  green legs but must NOT close P1-010 without the normalization.
- F136 has no clean live isolation here (every shell cwd is `\\?\`);
  source + receipt-shape evidence only.
- Tool-level sudo/rm-rf block verified by code read only (firewall
  preempts on the canonical path); direct-import bypass legs were
  deliberately NOT run (methodology: canonical path only).
- npm install/registry behavior never executed (network embargo).
- serverId remote execution never executed (router embargo).
- Terminal interactive shells beyond echo unprobed.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (planning/registry/memory/pipeline overlap
  avoided — probes perform zero source edits; CLI-BATCH1 review duty
  retained, no committed NVIDIA diff exists yet to review).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: the sandbox CWD arrives as
`\\?\`-prefixed, which node cannot resolve relatively — reset the
process directory and invoke node with ABSOLUTE paths):
  [System.IO.Directory]::SetCurrentDirectory('D:\Joe\muse-worktree\api')
  $fx='<worktree>\tmp\wiring-audit\fx-shell' (auto-created)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node D:\Joe\muse-worktree\api\node_modules\tsx\dist\cli.mjs D:\Joe\muse-worktree\tmp\wiring-audit\trunk_shell.mts
Expected: 4/4 SELECTABLE rank-1; 25 legs, 12 ok; pwd-equivalent legs
show wrong-dir execution (F135); node process exits 0 by itself.
Follow-up:
  node <same tsx> D:\Joe\muse-worktree\tmp\wiring-audit\shell_cwd.mts
Expected: exit 0; 5/5 legs (2 approval_required, pwd C:\Windows,
plain-path rejection, nocwd UNC failure); fixtures removed.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1 min.
