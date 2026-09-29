# MUSE Wiring Discovery 007 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 7)
HEAD=adf02775 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=classifyToolRisk (ToolService.ts:142-203) read in full + execute()
bodies re-read for every executed probe, then sweep3.mts live 19-probe
batch (exit 0, rerun-stable 19/19) via canonical path + targeted source reads
EVIDENCE=tmp/wiring-audit/sweep3.json + sweep3.mts + sweep3-rerun.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-006.md (partition 25/25, batch-2 19/19, risk table "next survey target")

## New findings (all Muse-branch @ adf02775, independently executed)

### F28. Risk table fully surveyed; {} census low=9 / medium=151 / high=3 / critical=0

classifyToolRisk (ToolService.ts:142-203) in full: deploy_project is
action-tiered (expose_port=high else medium); shell_execute is
command-tiered (destructive=critical, network/system=high, exact
read-only diagnostic=low, node-toolchain=medium, else high); git_ops is
op-tiered (push/commit=high else medium); browser_run is content-tiered
(sensitive text or upload/fill/evaluate/secret-type/dangerous-click=high,
narrow safe-local-QA=medium, else medium); name-regex high for
delete|deploy; name-regex medium for write/file/scaffold/npm/tester/java;
name-regex low for read/inspect/detect/analyze/echo/answer/lifecycle;
whole-input destructive scan=critical; default medium.
Mechanical {} census over all 163 registered names (sweep3.json,
transcription labeled as model): LOW 9 (analyze_codebase,
central_answer, echo, inspect_directory, inspect_symbol, project_detect,
read_file, repo_read_file, task_lifecycle); HIGH 3 (delete_file,
deploy_pages, shell_execute); MEDIUM 151 incl. the input-tiered tools at
empty input (deploy_project/git_ops/browser_run); CRITICAL 0 on {}.
Gate semantics (ToolService.ts:772-784): high/critical need
AUTO_APPROVE_ALL (default off -> approval_required pre-empts BEFORE
execute); low/medium pass under default autoSafe=true. Gate order note:
contextWorkspaceId is defaulted (ToolService.ts:336-340) so the
workspace_required branch is nearly unreachable with any session/user
context — the approval gate is the operative firewall for these probes.

### F29. Live tiering 19/19, rerun-stable across 2 runs

8 blocks with explicit risk: delete_file (high CONTROL), deploy_pages
(high), remove_file (high via alias, F30), deploy_project expose_port
(high), shell_execute {} (high), shell_execute rm -rf nonexistent
(critical), git_ops push (high), browser_run delete-text (high).
Pass-through: 5 honest ok:false (search_text CONTROL needs-query,
deploy_project {} path-required, git_ops {} `not a git command`,
browser_run {} forbidden F32, shell git-status env-fail) + 6 ok:true
(pwd, echo text probe, echo {} , task_lifecycle CONTROL, echo
destructive-text F31, read_file {} empty dir-list F33). shell
`git status` passed the
gate and failed only on this sandbox's git dubious-ownership exit 128 —
environment-specific trigger, gate verdict stands. First sweep3
invocation exited 1 with COMPLETE output (same pipe flake as sweep2);
rerun exit 0 with identical 19/19 verdicts.

### F30. Alias tiering follows the TARGET (remove_file -> delete_file -> high/block)

remove_file {} returned approval_required risk=high, identical to
delete_file. Risk is assessed on effectiveName AFTER alias resolution
(ToolService.ts:695 before :778). Good design, now live-evidenced.
No probe name in this batch was a rewrite source (verified:
ToolService.ts:256-560 contains only identity/target mappings for them).

### F31. Destructive-input scan is SHADOWED for 7+ names (order defect)

echo {text:'note: rm -rf never run'} EXECUTED (ok:true) — the line-201
whole-input destructive scan never fires for echo because the line-200
name-regex low-return precedes it. Same shadow covers central_answer,
task_lifecycle, and the four early-branch tools (deploy_project,
git_ops, browser_run, shell_execute — shell has its own cmd scan;
browser has sensitive-text; git is op-only; deploy_project is
action-only). Consequence, code-indicated: deploy_project
{action:'build_static', buildCommand:'<destructive>'} classifies MEDIUM
and buildCommand is executed via ExecutionGateway (DeployProjectTool.ts:
96-104) with NO risk-scan of its content. NOT live-probed (would execute
a destructive command by design); static finding only, fixture/review
required. New WIRING-P2-007. Own-probe-prediction correction: this
checkpoint's probe label predicted critical/block for echo from line 201
alone — the live result stands and the transcription model (which kept
the order) is confirmed.

### F32. browser_run {} -> 'forbidden', not sessionId_required (injected-identity verdict)

ToolService.ts:562-568 "Universal Browser Session Injection" copies the
CHAT sessionId into effectiveInput.sessionId for browser_run, so
execute() never sees the empty sid (BrowserRunTool.ts:248 is bypassed
for this path) and returns forbidden + "this session belongs to another
user" for an id the caller never named and that names no browser
session at all. The verdict direction (deny) is safe; the EVIDENCE is
wrong: a planner/verifier reads cross-user authz conflict where the
truth is "no browser session was addressed". New WIRING-P2-008.

### F33. read_file {} -> ok:true EMPTY directory auto-list

'' resolves through resolveToolPath to the session workspace root and
the Smart Directory Peek branch (TaskInteractionTools.ts:191-207)
returns ok:true with an empty listing (session dir newly created).
Honest content, success-shaped absence — joins the WIRING-P2-004
absence-as-success verifier note (5th instance).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; sweep3 aborts unless 163)
RISK_TABLE=SURVEYED (was: 1 live point). Census on {}: low=9, medium=151, high=3, critical=0
RISK_TIER_LIVE=19/19 rerun-stable: 8 blocks (1 critical) + 5 honest ok:false + 6 ok:true
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2 (unchanged)
CONTRACT_MISMATCHES=7 (was 5): + (6) risk-scan shadow order incl. unscanned deploy buildCommand; + (7) browser session-injection verdict
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery + bounded safe probes by design)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-007 (risk-scan shadow: reorder/extend destructive-input
  scan so early-branch + low-name tools are covered; review
  deploy_project.buildCommand execution without content scan; fixture-only,
  never live destructive).
- NEW WIRING-P2-008 (browser session-injection verdict: distinguish "no
  browser session addressed" from cross-user forbidden; keep deny-safe).
- WIRING-P2-004 extended: read_file {} empty-dir ok:true (5th
  absence-as-success instance).

## Corrections to prior checkpoints

- Checkpoint 7's own 'inspect_api -> low' reading: WRONG — the regex
  needs full tokens (inspect_directory|inspect_symbol); mechanical census
  says inspect_api is default medium. Census stands.
- Checkpoint 7's own echo/destructive probe label: WRONG (see F31) —
  live result + ordered model stand.
- Checkpoint 6 "risk table unsurveyed, 1 live point": SUPERSEDED — full
  static survey + 19 live tier points (this checkpoint).

## Limits / UNKNOWNs

- Per-trunk path/contract stories still pending (19 trunks proposed, 0 storied).
- Verification-compat sweep pending (LEVEL 5-6).
- deploy buildCommand scan gap is code-indicated, fixture-unconfirmed (never live-probe destructive).
- project_undo destructive default still code-indicated, fixture-unconfirmed.
- Fixture probes for dead_code/dependency_audit still future.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:TMP='<writable>'; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\sweep3.mts
Expected: exit 0; sweep3.json 19/19 liveRiskTiers; census 9/151/3/0;
deploy_pages + remove_file + expose_port + shell{} + push + delete-text
approval_required; shell rm -rf approval_required risk=critical; echo
destructive-text ok:true (F31 shadow); browser_run {} forbidden (F32);
read_file {} ok:true empty dir-list (F33); git-status ok:false is
sandbox git-ownership, gate passed. NOTE: do NOT pipe tsx output through
Select-Object on first run (pipe flake exits 1 with complete output);
redirect to file or rerun.
