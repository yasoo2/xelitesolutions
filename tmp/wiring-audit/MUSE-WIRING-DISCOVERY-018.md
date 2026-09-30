# MUSE Wiring Discovery 018 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 18)
HEAD=25ad8378 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for runtime_services 5/5 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures created + removed by the probe; transient
loopback-only servers started + stopped by the probe with HTTP-effect checks;
NO network legs; no model legs) + static checker partition over the trunk +
pure-function verdict table over source-grounded shapes. Full trunk probe ran
2x exit-pending with 23/23 verdict-identical legs (ok + error-prefix + shape;
both runs left the probe node alive because the stopped servers kept
listening — see F124 — so both runs were terminated externally after the
EVIDENCE line and cleaned by hand; ports verified closed). Follow-up probes:
pages-approved 4/4 legs 2x exit 0 identical (AUTO_APPROVE_ALL=1, no token);
stop-mechanism probe exit 0 isolating the kill layer; direct-taskkill control
on an inert sleeper (access-denied, exit 1, survivor).
EVIDENCE=tmp/wiring-audit/trunk_runtime.mts + trunk_runtime.json (run B) +
trunk_runtime_runA.json (run A) + trunk_runtime_runA.log +
trunk_runtime_run2.log + pages_approved.mts + pages_approved_run{1,2}.log +
stop_mech.mts + stop_mech.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-017.md (build_generate LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

runtime_services = deploy_pages, deploy_project, dev_server_start,
project_run, project_stop (5). All 5 exist in the live registry; no
membership correction needed. 0/5 are task-level checkers, but
project_run is the DOCUMENTED live-gate-only checker (F130) — the
checker set is 14 task-level + 1 live-gate opt-in, not "14/14 CLOSED".

## New findings (all Muse-branch @ 25ad8378)

### F124. project_stop stopped:true while the server answers HTTP 200 (LIVE 2x, P1-008 NEW)

stop.after-static and stop.after-override -> stopped:true both runs,
while the fixture servers kept answering 200 with token content
(static.afterStop/ovr.afterStop 200 both runs) and the probe node
stayed alive minutes after (child pipes held). The stop log is on
the SUCCESS branch (`stopped pid=26328 port=4300`, run-2 logLast),
and the RUNNING record is DELETED (keys.afterStop1/afterStop2 = []
both runs) — so Joe can never retry: stop.twice/final say "no
server" while it runs.
Mechanism (resolved): killTree awaits the taskkill gateway call but
NEVER checks the result (ProjectRunTool.ts:1767), and stopServer
returns true + deletes the record even when the kill throws
(:1861-1872: the catch logs stop_failed then falls through to
delete + return true). The stop_mech isolation probe shows the
gateway layer returning success:true with data {ok:false,
exitCode:1} (taskkill failed silently under stdio:ignore) while
the server stays 200; a process.kill fallback then closes the
port (FINAL refused). A direct-taskkill control on an inert
sleeper in this sandbox also fails access-denied exit 1 with a
survivor — so the OBSERVED receipt is partly sandbox-shaped and
MUST NOT be claimed as broken-everywhere. The CODE defects are
environment-independent: unchecked kill result, delete-on-failure,
no post-kill liveness verification. Any host where taskkill fails
(permissions, hardening, EDR, stale-pid races) silently leaks a
listener and drops the only record of it. The in-code comment
(:1774-1789) already knows RESTART orphans; this is a SAME-ROUND
false receipt — stronger. Repair direction (batch): check the
kill result, verify death (port closed / pid gone) before
stopped:true, keep the record on failure for retry, prefer a
kill path that does not depend on an external binary. NOT
implemented here (audit-first; needs implementation owner +
security review).

### F125. deploy start_server returns running + URL for a dead port (LIVE 2x, P2-004 18th)

proj.start-hollow (empty fixture, port 45981) -> ok:true,
status:running, url http://localhost:45981, pid 22344 BOTH runs,
while HTTP GET refuses (hollow.get ECONNREFUSED) and only a
.pidfile exists. No health check anywhere on the path
(DeployProjectTool.ts:131-167 returns immediately after detached
spawn). Companion skews (static): default port 3000, hardcoded
localhost URL, logFile '/tmp/joe_server.log' (POSIX-only,
meaningless on Windows). Worse: .joe_server.pid is written
(:136/:153) and NEVER read anywhere in api/src — a deploy-started
server has no tool-managed stop path at all (orphan by design;
cf. F124's managed-but-unverified stop).

### F126. deploy expose_port interpolates unvalidated port into a shell (STATIC, P1-009 NEW)

`lt --port ${port}` with shell:true (DeployProjectTool.ts:192-204)
where port = input.port || 3000 (:170) with NO numeric validation
in execute(). ToolService performs NO inputSchema validation
anywhere (zero inputSchema references in ToolService.ts), so the
`type:number` declaration is decorative at the gateway. A
non-numeric port reaches a shell. Gating caveat (verified):
deploy_project + expose_port classifies high (ToolService
:147-153), so default autoSafe does NOT execute it — approval
authorizes tunneling, not arbitrary shell, but the primitive
still needs a numeric guard. Live-unprobed by design (public
tunnel + `npm install -g localtunnel` side effect + `which lt`
POSIX-only :173-190 — all code-cited, embargoed). Contrast:
dev_server_start (:456) and project_run (:1414) both coerce via
Number() || free-port — deploy_project:170 is the odd one out.

### F127. deploy package on Windows: raw ENOENT, no zip (LIVE 2x, P2-009 3rd)

proj.package-contained -> ok:false + 'Deployment failed: ENOENT
... stat ... pkg1_package.zip' both runs; pkg.zip [] (nothing
created). The `zip` binary path (DeployProjectTool.ts:221-236)
does not work on this Windows host and the surfaced error is a
raw stat ENOENT, not an actionable message. Honest direction
(ok:false), unhelpful shape. Extends the P2-009 error-evidence
family (3rd instance; cf. files-trunk zip cause-swallow).

### F128. dev_server_start missing-cwd path throws internal_exception with stack (LIVE 2x, P2-022 NEW)

devs.missing -> ok:false + 'internal_exception: Error: ENOENT
... vite.config.js at Object.writeFileSync ... at
DevServerTool.execute ...' both runs: the fallback branch writes
vite.config.js into a never-created directory
(WebDevelopmentTools.ts:527-534) with no guard, and the throw
escapes as a 500-class shape with a stack for a bad input. Same
leg proves the sandbox-force landing (path under
data/builds/workspace-default/ — F114 mechanism again) and that
nothing is left behind (builds.strays [], NEWENTRIES builds []).

### F129. dev_server_start full-start embargoed findings (STATIC + verdict mapping, MISMATCH #13 NEW)

Code-cited, live-unprobed by design (npx --yes download + 0.0.0.0
listener + 30s wait + config write): (a) binds 0.0.0.0
(:523/:526/:533, HOST env too) while project_run pins 127.0.0.1
(ProjectRunTool.ts:1619) — inconsistent bind posture for two
"start my preview" tools; (b) `npx --yes/-y` auto-downloads
(:523/:526); (c) writes vite.config.js into the project as a
side effect (:531); (d) returns ok:true WITH preview URLs even
when serverReady:false (:616) — and verificationResultFromToolResult
maps that exact source-grounded shape to PASSED (Part B
'devs started-unready' -> passed): the verifier is blind to the
tool's own explicit not-ready flag. (d) is NEW MISMATCH #13
(verdict mapping ignores explicit not-ready flags). Also static:
isProd sniffing via JWT_SECRET substring + /etc/letsencrypt +
/.dockerenv (:585-588, secret-content sniffing for env
detection) and hardcoded xelitesolutions.com + http://api:
(:594-595) portability debt.

### F130. project_run is the documented 15th checker (STATIC + L5-grade live legs; set correction)

isVerificationTool returns true for project_run ONLY under the
live-gate opt-in (verification-ledger.ts:740-747, with an
explicit rationale comment: live URL receipt after a real HTTP
answer). Prior "14/14 CLOSED" language is CORRECTED: the set is
14 task-level + 1 live-gate-only. The run.detected/run.override
legs are L5-grade evidence FOR its receipt contract (real 200 +
token + ready:true, auto port 4300 + forced 45982, PORT env
injection :1619 exercised implicitly). Bound: the F124 stop
defect and adoption semantics (stale-record ignore, PID/cwd
gate :1370-1408 — read, not live-proven here) limit lifecycle
claims, not the run receipt itself. 0/5 trunk members are
task-level or existence-gate checkers (partition table in JSON).

### F131. deploy_pages gates: approval + token > repo > backend order (LIVE 2x x 2 harnesses)

Default-deny harness: all three pages legs -> approval_required /
risk high (deploy_* classifies high, ToolService :196) — deploy
intent is gated by default (POSITIVE control). Approved harness
(AUTO_APPROVE_ALL=1, no token anywhere): missing-cwd ->
path-missing (cwd check :97 precedes auth); empty/backend/
explicit-repo -> needsConnect — proving token gate (:100)
precedes repo gate (:101) precedes backend-honesty gate
(:104-114, never reached without a token). Design note: a
planner cannot learn "backends can't run on Pages" until after
connecting. Real deploy + buildCommand override stay embargoed
(network/publish).

### F132. run/build true positives (LIVE 2x, positive controls)

proj.build-contained -> ok:true/built with dist autodetected and
the marker file verified (bld.marker == TOKEN both runs;
buildOutput truncated :125). run.detected -> ready:true on auto
port 4300 + HTTP 200 token (detectStart node-entry branch,
:456-470). run.override -> ready:true on forced 45982 + HTTP 200
token (input.command branch :1442-1443, argv launch :1607-1621,
no second shell). stop.idle/twice/final -> stopped:false
idempotent. run.empty (pre-fixture) / named-miss / missing-cwd /
no-marker -> all honest ok:false with no guess-and-run (:1331/
:1341 guards exercised). PORT/HOST env injection (:1619)
verified implicitly by both live legs.

### F133. Lifecycle/portability notes (static + live)

runKey = workspaceId || sessionId (keys.afterDetected shows
session-audit-sess — ToolService auto-assigned context); one
server per key by design (:1410-1412 stop-before-start).
RUNNING is process-local: restart orphans are already
acknowledged in-code (:1774-1789); F124 adds same-round false
receipt + record deletion (retry impossible). Deploy-started
servers are doubly orphaned (F125 pidfile). Cross-instance
stop/adoption has no persistence story (portability; cf. mission
multi-instance rule). detectStart pure-static branch runs
`npx -y serve` (:483-485, auto-download: network —
live-unprobed by design; the live leg pinned node-entry) and
the tsx branch runs `npx -y tsx` (:478, same caveat).

### F134. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 5/5 (deploy_project rank-2 behind
deploy_pages on self-name — keyword overlap). 4/5 are
ROUTER_EXCLUDED (all but dev_server_start) yet catalog-rank
high — the flag/catalog split again (exclusion is fast-path/
rerank-pool only, not selectToolsFor; router-side proof still
outstanding). deploy_project priority-listed; rate limits
4/10/15/10/20 (pages strictest — sane for a publisher).
deploy_pages sideEffects include 'internet' (accurate).
project_run/project_stop/dev_server_start sideEffects
['execute'] — no listener dimension in the vocabulary (the
0.0.0.0 bind of F129 has no declaration surface).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=8/19 fully storied (runtime_services 5/5 LEVEL-4 + static
verification-compat + checker-set correction; project_run live-gate
receipt L5-proven) — files 10/10 + browser_ui 33/33 + testing_qa 6/6 +
security 3/3 + code_understanding 16/16 + vcs_repo 11/11 +
build_generate 13/13 + runtime_services 5/5 = 97 tools
TRUNK_RUNTIME=5/5 SELECTABLE (4 rank-1, deploy_project rank-2);
23/23 live legs canonical 2x verdict-identical (3 pages + 7 deploy +
10 run/stop + 2 devs + stop.final); follow-up pages-approved 4/4
2x exit 0 identical; stop-mechanism isolation exit 0; direct-taskkill
control exit 0 (access-denied survivor); 12-shape verdict table;
fixtures removed (run nodes terminated externally after EVIDENCE —
see F124 — ports verified closed, session root empty)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=13 confirmed (NEW #13: verdict mapping ignores
explicit not-ready flags — F129d; no other new number)
EXECUTABLE_NOT_VERIFIABLE=0 on 8 swept trunks (97/97 verdict-
mappable; devs.started-unready ok:true joins as MAPPING-false-pass
(#13) — distinct from the hollow passes: the TOOL is honest
(serverReady:false), the CONSUMER is blind; deploy.start_server
running joins P2-004 hollow (F125); stop.stopped-true joins as
FALSE-RECEIPT via unchecked kill (F124)) + prior shapes (8 hollow
receipts incl. F125, dead-reuse #10, skip-blind, missing-as-clean/
error, 2 always-false-ok, F116 persistent-failure-prose)
CHECKER_SET=14 task-level + project_run live-gate-only (CORRECTED
from "14/14 CLOSED"; 0/5 trunk task-level checkers; run receipt
L5-proven by run.detected/run.override; L5 live gate proof still
pending for quality_run/auto_tester/dep_audit/secrets_scan_repo/
code_reviewer — the same 5)
P1_ITEMS=2 new (P1-008 stop verification F124; P1-009 deploy port
interpolation F126)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P1-008 (project_stop false receipt F124): check the
  kill result, verify death (port/pid) before stopped:true, keep
  the record on failure for retry, kill path not dependent on an
  external binary; companion: deploy pidfile stop path or honest
  unsupported-stop (F125).
- NEW WIRING-P1-009 (deploy expose_port port interpolation F126):
  numeric port guard (+ audit every ${} into shell:true in the
  trunk); ToolService inputSchema enforcement is the systemic fix.
- NEW WIRING-P2-022 (dev_server_start missing-cwd exception shape
  F128): guard the config write; honest bad-input error, no stack.
- NEW MISMATCH #13 (verdict blind to explicit not-ready flags
  F129d): verdictOf must honor serverReady:false (and audit sibling
  flags); dev_server bind/download/config-write review rides the
  same batch.
- EXTENDED WIRING-P2-004 (18th: deploy running-hollow F125).
- EXTENDED WIRING-P2-009 (3rd: deploy package raw ENOENT F127).
- EXTENDED empty-sideEffectsHonesty note (dev_server 0.0.0.0 bind
  has no declaration surface — F134; beyond browser P2-011).
- CORRECTED checker-set language (14 task-level + project_run
  live-gate-only — F130; run receipt L5-proven, lifecycle bounded
  by F124).
- LIFTED nothing; embargoes hold (pages real deploy + buildCommand;
  expose_port live; dev_server full start; project_run no-args on
  non-empty workspaces; detectStart npx-serve/tsx branches; all
  model-present behavior unprobed).

## Corrections to prior checkpoints

- "CHECKER_SET=14/14 CLOSED" is refined, not refuted: 14 shapes are
  task-level-closed, and project_run was always the documented 15th
  under live-gate opt-in (ledger :740-747). Prior trunks had 0
  live-gate members, so no prior trunk story changes.
- The checkpoint-18 pre-registration hypothesis 'project_stop ends
  the fixture servers' is REFUTED as a receipt claim: stopped:true
  with 200-after in both runs (F124). The OBSERVED failure is
  partly sandbox-shaped (direct taskkill access-denied control);
  the code defects (unchecked result, delete-on-failure, no
  liveness verify) are environment-independent.
- The checkpoint-18 pre-registration hypothesis 'deploy start_server
  health-checks before reporting running' is REFUTED: no check
  exists on the path (F125).
- The checkpoint-18 pre-registration hypothesis 'ToolService
  enforces inputSchema types' is REFUTED: zero inputSchema
  references in ToolService.ts (F126).

## Limits / UNKNOWNs

- 11/19 trunks still unstories; shell_terminal=4 suggested next by
  impact (planner-adjacent execution) or network_api=12;
  planning_orchestration overlaps NVIDIA-owned files — do not
  story without coordination.
- L5 live gate proof pending for quality_run/auto_tester/dep_audit/
  secrets_scan_repo/code_reviewer (same 5; project_run's receipt is
  now L5-proven, its STOP path is the open defect).
- deploy_pages real deploy + buildCommand override never executed
  (token/network/publish embargo).
- deploy expose_port never executed (public-tunnel embargo); the
  P1-009 shape is static + gateway-shape verified, live-unproven.
- dev_server_start full start never executed (download/bind embargo);
  the F129d mapping is source-grounded shape + pure function, and
  the full-start SHAPE (ok:true/serverReady:false) is code-cited.
- detectStart npx-serve + npx-tsx branches never executed
  (auto-download embargo).
- project_run adoption/reconcile paths (stale-record ignore,
  PID/cwd gate, missing-target reconcile) read, not live-proven.
- Taskkill-failure WHY beyond this sandbox (plain-host behavior)
  unprobed — the repair must verify on an unsandboxed Windows host
  AND keep the defense-in-depth (checked result + liveness verify)
  regardless of plain-host outcome.
- react/api full install+boot legs never executed (prior embargo).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (ToolService/ExecutionEngine/
  ExecutionGateway read-only cited; CLI-BATCH1 + EVAL-006 +
  registry overlap avoided — probes perform zero source edits).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: tsx.cmd breaks
under an extended-path workdir; invoke the cli directly):
  $fx='<worktree>\tmp\wiring-audit\fx-runtime' (auto-created)
  $env:REAL_TMP=$env:TEMP (capture BEFORE overriding)
  $env:TEMP=$fx\tmp; $env:TMP=$fx\tmp; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=$fx\store; $env:ARTIFACT_DIR=$fx\artifacts
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node .\node_modules\tsx\dist\cli.mjs ..\tmp\wiring-audit\trunk_runtime.mts
Expected: 5/5 SELECTABLE (deploy_project rank-2); 23/23 legs;
stop.after-* stopped:true with 200-after (F124 2x); the node
process stays alive after EVIDENCE (children survive) — terminate
the shell externally, verify 4300/45981/45982 closed, remove the
session wiring-runtime-fx tree by hand. Focused follow-ups:
  $env:AUTO_APPROVE_ALL='1' (+ same env, GITHUB_TOKEN unset)
  node .\node_modules\tsx\dist\cli.mjs ..\tmp\wiring-audit\pages_approved.mts
Expected: exit 0; 4/4 legs (empty/missing/backend/explicit-repo all
needsConnect except missing-cwd path error); fixtures removed.
  node .\node_modules\tsx\dist\cli.mjs ..\tmp\wiring-audit\stop_mech.mts
Expected: exit 0; SPAWNED/BEFORE-200/TASKKILL_RESULT
{success:true,data:{ok:false,exitCode:1}}/AFTER-200/FINAL-refused;
port verified closed by the probe itself.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied; full trunk run ~1 min warm + external terminate.
