# MUSE Wiring Discovery 006 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 6)
HEAD=b90ba5e7 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=all 25 no-required execute() bodies read first, then sweep2.mts live {}
batch (exit 0, rerun-stable 19/19) via canonical path + targeted source reads
EVIDENCE=tmp/wiring-audit/sweep2.json + sweep2.mts (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-005.md (census 163, batch-1 8/9, merge v1)

## New findings (all Muse-branch @ b90ba5e7, independently executed)

### F19. No-required partition complete: 25/25 execute() bodies read

Classification (rationale per name in this doc; live results in sweep2.json):

- SAFE_TO_PROBE({}) 18: delete_file, browser_compare, browser_consent,
  browser_ui_fix, project_undo, project_repair, image_studio,
  repo_diff_summary, engineering_discovery, project_stop, form_inbox,
  orders_read, security_scanner, joe_engineering_report, ls,
  analyze_project, search_text, project_detect.
- BOUND (LLM call inside, timeout-guarded) 1: analyze_codebase.
- EMBARGOED (no live call) 4: memorize_codebase (unconditional
  vectorDb.clear, registry MemoryTool.ts:96 AND inline ToolService.ts:591),
  deploy_pages (workspace-root default + cross-workspace token fallback,
  gh-pages push on success), project_run (starts servers/binds ports from
  workspace-root/active-project default), browser_launch ({} opens a real
  browser to google.com/BROWSER_HOME_URL).
- NEEDS_FIXTURE (explicit-input probes only, never {}) 2:
  dead_code_detector (npx knip in Joe's own repo root, uncontained),
  dependency_audit (npm audit in Joe's own repo root + registry network).

Batch-2 live result: 19/19 calls returned (no timeouts, no throws),
rerun-stable across 2 runs. 8 honest ok:false with specific causes;
7 ok:true reads/absences; 1 approval gate; 1 wrapper-swallowed cause;
1 honest offline LLM failure; 1 honest guard rejection.

### F20. Approval gate pre-empts execute: delete_file {} -> approval_required

delete_file {} returned ok:false error=approval_required output={risk},
NOT the execute()-body 'needs a path' refusal. Mechanism:
ToolService.ts:778-784 classifyToolRisk() rates high/critical and blocks
pre-execution unless AUTO_APPROVE_ALL/session auto-approve; autoSafe
defaults TRUE for lower risk (line 777). Meanwhile project_undo,
project_repair, browser_ui_fix (all write+execute) sailed through to
their no_project honest fails — so gating is per-tool RISK, not uniform
by permission. First live approval-gate evidence in this audit; the exact
risk table (classifyToolRisk) is the next survey target, not surveyed here.

### F21. Swallowed-cause wrapper, 2nd instance: repo_diff_summary

repo_diff_summary {} -> ok:false 'Tool reported failure without an error
message', output={status,diffStat,stderr}. The tool returns ok:false with
NO error field when git exits nonzero (RepoSelfCodingTools.ts:264-279);
a wrapper substitutes the generic message and the real cause (in
output.stderr) never surfaces as `error`. Same shape as batch-1 rss_fetch.
TRIGGER HERE IS ENVIRONMENT-SPECIFIC (this sandbox's git fails with
dubious-ownership exit 128 — verified), but the WRAPPER BEHAVIOR is a
real product evidence-quality defect: any future git failure anywhere
reports the same content-free message. WIRING-P2-005 (new).

### F22. deploy_pages: no input gate + cross-workspace token fallback

On {} the tool defaults cwd to the workspace root, then resolveRepoAndToken
(DeployPagesTool.ts:60-70) falls back from the session workspace to
getAllWorkspacesForLookup() — ANY connected workspace. Success path runs
builds and pushes gh-pages. EMBARGOED live (permanent external mutation);
static-only finding. A scoped fixture with a fake token store is the only
safe future probe. New WIRING-P1-003 (token-scope review) + note under
WIRING-P0-001 (execution-path family).

### F23. dead_code_detector: uncontained root + dead autoFix input

- execute() ignores context entirely: workDir = getWorkspaceRoot() (Joe's
  own repo) unless explicit projectPath (DeadCodeTool.ts:46-52), then runs
  `npx knip` there (network fetch possible, long runtime). NEEDS_FIXTURE.
- autoFix:boolean is DECLARED in inputSchema but never read in execute():
  a planner can pass autoFix:true believing cleanup happened; nothing does.
  Planner-facing dead input — contract mismatch class. New WIRING-P2-006.

### F24. dependency_audit: uncontained root + network on {}

execute() runs `npm audit --json` (5-min budget) in getWorkspaceRoot()
when no path given (QualityTools.ts:89-96), ignoring session context.
NEEDS_FIXTURE. Same uncontained-root class as F23.

### F25. security_scanner: requiredAny IS enforced — checkpoint-6 correction

Static pre-read predicted {} would scan process cwd (the exact hazard its
own comment warns about). LIVE: ok:false 'requires a non-empty files
array or an existing project target containing source files' — a guard
below the pre-read window enforces the one-of contract. The static
prediction was WRONG; the live result stands. (This is why the audit
probes rather than asserts from partial reads.) No gap; honest tool.

### F26. Absence-as-success shape (4 tools, honest but ok:true)

project_stop (stopped:false), orders_read (no-API-project message),
form_inbox (empty message), browser_consent (needsConsent:true) all return
ok:true for ABSENCE, distinguished only by message/flags. Each message is
honest; but a planner/verifier checking only ok:true treats absence as
success. Verifier note for the LEVEL 5-6 sweep, not a tool defect. Also:
project_undo {} in a session WITH snapshots would default-restore the
latest (ProjectUndoTool.ts:98-100 preferSurgical); probe saw no_project
(empty session). Destructive-default CONFIRMATION needs a fixture — do
not claim it as proven, only as code-indicated. Both notes join
WIRING-P2-004's schema/execute family.

### F27. analyze_codebase: honest offline failure, no hang, no cost

{} -> ok:false with an Arabic provider-unavailable message (Ollama/Internet
guidance), output={summary}. routeToModel failed fast under OFFLINE_MODE
(IntelligentRouter honest-error lines in probe stderr); no 20s timeout
consumed, no model spend. The BOUND classification held.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; sweep2 aborts unless 163)
NO_REQUIRED_PARTITION=25/25 execute() bodies read: 18 SAFE + 1 BOUND + 4 EMBARGO + 2 FIXTURE
EMPTY_INPUT_HONESTY_BATCH2=19/19 returned, rerun-stable: 8 honest ok:false + 7 ok:true reads/absences + 1 approval gate + 1 swallowed-cause + 1 honest offline fail + 1 guard rejection
EMPTY_INPUT_TOTAL=28/34 no-required-or-batch1 tools live-probed (batch1 9 + batch2 19; 6 embargo/fixture excluded by rule)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2 (unchanged)
APPROVAL_GATE=first live evidence (1 pre-emption; risk-tiered, table unsurveyed)
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery + bounded safe probes by design)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-003 (deploy_pages token-scope review: cross-workspace
  fallback + no input gate; fixture-only future probe).
- NEW WIRING-P2-005 (ok:false-without-error wrapper: surface output.stderr/
  cause instead of generic message; 2 instances: rss_fetch, repo_diff_summary).
- NEW WIRING-P2-006 (dead input + uncontained roots: dead_code_detector
  autoFix never read; dead_code_detector + dependency_audit ignore session
  context for execution root).
- WIRING-P2-004 extended: absence-as-success verifier note (4 tools) +
  project_undo default-restore code-indicated (fixture to confirm).

## Corrections to prior checkpoints

- Checkpoint 5 "25 no-required need review-then-call": DONE — all 25
  reviewed, 19 probed live, 6 excluded with stated rationale.
- Checkpoint 6 own static pre-read "security_scanner {} scans cwd":
  REFUTED live — guard rejects honestly. Method note kept: probe, don't
  assert from partial reads.
- Checkpoint 5 repro note tsx path: actual binary is
  api/node_modules/.bin/tsx.cmd (run from api/ as .\node_modules\.bin\tsx.cmd).
- First sweep2 invocation exited 1 with COMPLETE output (pipe flake);
  rerun exit 0 with identical 19/19 verdicts. Exit-0 + rerun-stable is the
  recorded result; the flake is noted, not hidden.

## Limits / UNKNOWNs

- Risk table (classifyToolRisk) unsurveyed — 1 live data point only.
- deploy_pages/project_run/browser_launch/dead_code/dependency_audit live
  behavior unprobed by design (fixture work future).
- project_undo destructive default code-indicated, fixture-unconfirmed.
- Per-trunk path/contract stories still pending (19 trunks proposed, 0 storied).
- Verification-compat sweep pending (LEVEL 5-6).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:TMP='<writable>'; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\sweep2.mts
Expected: exit 0; sweep2.json 19/19 liveEmptyInputBatch2; delete_file
approval_required; repo_diff_summary wrapper message (its git trigger is
sandbox-specific); security_scanner guard rejection; analyze_codebase
honest offline fail. NOTE: system TEMP may be sandbox-denied; use a
worktree-local dir.
