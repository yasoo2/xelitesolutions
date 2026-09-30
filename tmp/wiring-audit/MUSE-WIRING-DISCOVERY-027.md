# MUSE Wiring Discovery 027 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 27)
HEAD=ebf2daa0 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=P1-012 consumer-survey completion: the 3 remaining
executionEngine.run() consumers queued by 026/F202 (DeadCodeTool.ts:65,
ErrorRecoveryTool.ts:146, RepoSelfCodingTools.ts:90) live-checked via
the canonical path (registry entry, 163 verified; ToolService.executeTool
inside firewall runInContext; session ctx audit-sess/audit-user) with
fixture-owned shims (knip/npx/npm .cmd shims, git-initialized fixture;
created + removed by the probe; zero network by design) + runArgv
direct control + static checker partition over the 4 surveyed names +
pure-function verdict table over source-grounded shapes. Full probe ran
2x filed runs A/B with 7/7 legs verdict-identical (ok + error-prefix +
key compare fields, verdictDiffs=0; decl + verdict table also
byte-stable). One pilot run preceded the filed pair and is reported
honestly below (real-npx resolution behavior; no shim change to tool
command strings). No live process survived; no stray files (session/
default/api roots re-verified clean, FX removed, PATH restored). No
source edits; architecture + package-scripts guards re-verified green.
EVIDENCE=tmp/wiring-audit/p1012_survey.mts + p1012_run{A,B}.json +
p1012_run{A,B}.log + p1012_run1.log (pilot) + compare_p1012_runs.py
(this worktree; A/B filed)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-026.md (media_images LEVEL-4)

## Scope (cross-cutting survey, not a trunk)

dead_code_detector, error_recovery, repo_run_command,
repo_diff_summary (4). All 4 exist in the live registry, all 4
SELECTABLE_BY_KEYWORD rank-1 both goals, none router-excluded, none
priority-listed. They share one root: they consume
executionEngine.run(string), which reports ok:true on nonzero exit and
omits exitCode (026/F202, WIRING-P1-012/F102). This checkpoint closes
the 026-open question for each: INHERIT the lie, HONEST despite it,
or a THIRD shape.

## New findings (all Muse-branch @ ebf2daa0)

### F206. error_recovery inherits engine false-success: Wolverine heals nothing, reports healed (LIVE 2x, EXTEND P1-012)

er.autoinstall-shim (Cannot find module 'shim-pkg-abc123',
attemptFix:true, fixture npm.cmd shim exits 3, zero network, zero
writes) -> output {recovered:true} + log 'Wolverine successfully
healed the error!' BOTH runs. The install never ran (shim only
prints + exits 3); the failure is real and the receipt is inverted.

Root (source-pinned): autoInstallDependency checks `result.ok`
alone (ErrorRecoveryTool.ts:146-150); run() returns ok:true for
the exit-3 shim. Control leg er.analyze-only (attemptFix:false)
correctly yields recovered:false + missing_dependency with no
execution, proving the lie enters exactly at the autofix step.

Blast radius: the SELF-HEALING tool cannot detect its own repair
failure — a diagnosis loop will believe the dependency was
installed and move on. This is the 3rd LIVE instance of the filed
WIRING-P1-012 root (1st: docker_manager 023/F169; 2nd: video_action
026/F202). Verdict-mapping note: ok:true + recovered:false ALSO
maps to `passed`, so the gate cannot see an unhealed recovery
either way — the P1-012 repair must make recovered:false
unreachable-on-failure AND the owner should consider a
recovered-aware check shape (follow-up, not this batch).

Repair direction stays P1-012's: run() must honor data.ok like
runArgv + surface exitCode; this consumer additionally needs no
code change once the engine is honest (it already branches on ok).
Regression: exit-3 npm shim => recovered:false + no healed log.

### F207. repo_run_command + repo_diff_summary: INVERTED failure on success (LIVE 2x, F102 twin)

rr.git-status (allowlisted 'git status --short' in a
git-initialized fixture, offline-safe) -> ok:false +
error 'command_failed' + output.exitCode null BOTH runs, while the
direct runArgv control of the SAME command returns ok:true +
exitCode 0. rd.summary (read-only git status/diff at the real repo
root, no writes by construction) -> ok:false with status content
present, same root.

Root (source-pinned): runSafeCommand reads result.exitCode
(RepoSelfCodingTools.ts:90-95), which run() NEVER returns (F102);
callers test `code === 0` (:236, :271), and undefined === 0 is
false — so these tools report failure even when the command
succeeds. This is the false-FAILURE twin of F202's false-success:
same omitted field, opposite receipt. (Codex independently
reproduced the rr shape on main; this is the Muse-branch
canonical-path instance with a same-run exit-0 control.)

Repair direction: same F102 fix (surface exitCode); these two
consumers need no code change once the engine reports it, but
their contract tests (expecting exitCode + ok:true on git status)
must be added by the owner. Regression: git status in a clean
fixture => ok:true + exitCode 0.

### F208. dead_code_detector: HONEST despite the engine (LIVE 2x, pattern)

dc.json-ok (knip shim prints valid JSON, exit 0) -> ok:true with
parsed summary {totalIssues:0} BOTH runs. dc.bad-output (shim
prints text, exit 3 — the engine reports ok:true) -> ok:false +
'knip produced output that is not JSON, so nothing was scanned:
fixture-knip: sim...' + output.scanned:false BOTH runs.

Root (source-pinned): the tool parses result.output as JSON and
treats parse failure as not-scanned (DeadCodeTool.ts:73-114),
never trusting result.ok. This is the content-inspection pattern
026 predicted: consumers that validate output CONTENT survive the
engine lie. Model for consumer hardening elsewhere; no repair
needed in this tool for P1-012 (it stays correct before AND after
the engine fix — owner re-runs these two legs post-repair as a
no-regression pin).

### F209. Pilot method note: real npx ignores loose fixture-local .bin (RETAINED)

The pilot ran the dc legs against real npx with only a loose
fixture node_modules/.bin/knip.cmd present. Real npx did NOT use
it: both legs attempted a registry fetch of knip, which failed on
sandbox npm-cache EPERM (nothing downloaded, nothing installed;
one failed fetch attempt, disclosed here, not repeated). Filed
runs A/B therefore resolve `npx` through a fixture npx.cmd shim
(process-only PATH prepend, NPX_FX_KNIP dispatch); the tool's REAL
command string still executes through a real shell. Consequence
for owners: on machines WITHOUT knip, DeadCodeTool degrades to
honest ok:false scanned:false (pilot-proven), but only AFTER an
npx fetch attempt (network + latency). A local-resolve precheck
before shelling to npx would remove that cost — P4 observation
for the repair backlog, not a defect claim.

## Survey completion table (WIRING-P1-012 consumers, 5/5 live)

consumer (call site) | live verdict 2x | receipt on nonzero exit
docker_manager (023/F169) | INHERITS (false success) | ok:true
video_action (026/F202) | INHERITS (false success) | ok:true+success:true
dead_code_detector (027/F208) | HONEST (content check) | ok:false scanned:false
error_recovery (027/F206) | INHERITS (false healed) | recovered:true
repo_run_command (027/F207) | INVERTED (false failure) | ok:false command_failed
repo_diff_summary (027/F207) | INVERTED (false failure) | ok:false

The P1-012/F102 repair is now UNBLOCKED on consumer evidence:
2 inheritors need the engine fix to become honest (no consumer
code change required — both branch on ok/recovered correctly
given a truthful engine); 1 honest consumer pins no-regression;
2 inverted consumers become honest once exitCode is surfaced.
Standing 026 guidance repeats: shell_execute contract tests move
first (consumers RELYING on always-true ok must be found before
landing), then the engine fix, then these legs re-run as
regression pins.

## Limits / non-claims

- Filed dc legs pin the tool's output-shape handling, NOT real-npx
  resolution (F209). No claim about npx behavior on other machines.
- er leg proves lie-inheritance for the missing_dependency path
  only; file_not_found auto-create was not executed (writes real
  files at workspace root — outside fixture containment).
- rr/r
...[truncated 2279 chars]