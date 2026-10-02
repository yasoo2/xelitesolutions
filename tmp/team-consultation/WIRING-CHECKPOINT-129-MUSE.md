# WIRING CHECKPOINT 129 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=3902e335 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: quality + advanced-analysis FIRST live proofs
## (Level 4) over NINE unprobed registered families
sonar_analysis (refusal only) + load_tester (refusal only) +
ci_generate_pipeline + quality_run + pattern_recognize +
auto_refactor + test_generator + performance_profile +
doc_generator. All nine were REGISTERED-but-never-live-probed
(registry-vs-probe diff this cycle: declared-name scan minus
74 executeTool names pinned by batteries 110-128; these nine
form the coherent quality/static-analysis slice).
dependency_audit is DELIBERATELY UNPROVEN (no live case): its
handler ALWAYS shells `npm audit --json` with no refusal path,
and method validation this cycle proved npm climbs past the sbx
into the live tree AND fetches advisory data over the network
(13.6s, EXIT 1, live multer advisories) — shell + upward-climb +
network needs owned gateway review first (dead_code npx
precedent). sonar/load positives DELIBERATELY UNPROVEN (npx
scanner download / fetch-loop target; the setup.ts fetch guard
throws on ALL fetch). CI-{} DELIBERATELY UNPROBED (required
unenforced + '' resolves to the DEFAULT root -> would write
.github into a live root; SS-{} class). The npx-tsc quality_run
branch DELIBERATELY UNPROVEN (would download tsc). The
doc_generator extensionless case DELIBERATELY UNPROBED
(outputPath === sourcePath -> source self-overwrite;
destructive). Pipeline/memory/planner NVIDIA-ACTIVE areas NOT
touched (recall_memory/memorize_codebase deep handlers and
ProjectRun still excluded). Every case stays on a SAFE surface:
refusal pins, pure-local static analysis, contained sbx writes
(CI/TG/AR/DG), hermetic local spawns (QR3/QR4: seeded manifests
stop the npm climb; `node` scripts only; update-notifier off).
NO network is touched, NO model is called, NO browser is
launched, NO spend. Same isolated tsx method as 110-128:
canonical test env (setup.ts: JSON persistence, mock DB,
network fetch guard), bypass OFF (hermetic), full attribution,
CWD = the sandbox dir itself (Set-Location INSIDE the shell —
a \\?\ workdir prefix breaks tsx.cmd via CMD.EXE UNC fallback,
proven by the 128 run1 env-failure receipt), all imports
absolute, FS contained via EXTERNAL_PROJECTS_DIR +
JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-129c (run-3; run-1
tree sbx-tmp-129 + run-2 tree sbx-tmp-129b preserved). NO
DATA_DIR is set: the knowledge.ts import-time mkdir lands in
<sbx>/data (contained; Z0 asserts the shape, 127/128
continuity). NO AUTO_APPROVE_* set at any point. No source
edited; probe runs left ZERO tracked modifications (tracked
tree fully clean after all runs; only pre-existing untracked
caches). Containment verified: fixtures + stores + logs + tsx
cache all inside the sbx; JOE_DATA_DIR inside the sbx; all
THREE live stores byte-identical pre/post (SHA256, in-probe Z0
+ outside re-hash); no .github/workflows/node-ci.yml in the
worktree root or api/; zero strays outside the sbx. Probe:
tmp/team-consultation/muse-129-dispatch-probe.ts; receipts:
muse-129-dispatch-probe.stdout.log/.stderr.log (UTF-16 via PS
redirect like 110-128 — strip non-JSON warn lines such as the
[ENGINE] SLOW EXECUTION notice, parse the {"probe":...} block
with ReadAllText; TSX_EXIT=0 is the primary verdict, 38/38
regex-confirmed from the JSON block) + .run1 (27/36) +
.run2 (34/37) logs preserved. RUN-3 GREEN: run-1's eight
misses were ONE probe-root bug over a GENUINE threaded-root
discovery (now WR0-pinned) plus ONE assertion-string bug;
run-2's three misses were probe-expectation bugs over GENUINE
detector/heuristic discoveries (now TG0b/PP0-pinned); all
other pins held across all runs.

## Run result: 38/38 PASS run-3, EXIT 0, failed=0
## (run-1: 27/36, EXIT 1; run-2: 34/37, EXIT 1 — receipts preserved)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS all runs.
- D0-registered-count: registered=163 (re-observed). PASS all.
- D1-echo-positive: ok=true, output has probe text. PASS all.
- H4-run-command-repin: executeTool('run_command',
  {action:'list'}) -> ok=false, error='approval_required'
  (T5-117 winner reproduced; nothing executed). PASS all.
- WR0-threaded-root: relative 'fx129b/ping129.txt' read hits
  the seed under <sbx>/projects/probe-ws-129/ -> ok=true
  (ROOT-MAPPING pin: getActiveRoot(wsId)=externalRoot/<wsId>
  in JSON/mock mode, WorkspaceService.ts:238-259). PASS
  run-2/run-3 (new in run-2; run-1 relatives missed because
  seeds were at <sbx>/fx129).
- SA0-sonar-missing-key: {} -> ok=false 'sonar_analysis
  needs a projectKey.' (no spawn). PASS all.
- SA1-sonar-blank-key: whitespace key -> same refusal
  (trim-check). PASS all.
- LT0-load-missing-url: {} -> ok=false 'load_tester needs
  an http(s) url to hit.' (no workers). PASS all.
- LT1-load-non-http-url: ftp:// URL -> same refusal
  (scheme gate). PASS all.
- CI0-ci-create: absolute sbx path -> ok=true skipped=false,
  node-ci.yml on disk (581 bytes) with 'Node.js CI' +
  'actions/checkout@v4' markers + 'created' log. PASS all.
- CI1-ci-skip: same path again -> ok=true skipped=true +
  'skipped (exists)' (never overwritten). PASS all.
- CI2-ci-escape: 'C:\Windows' -> ok=false
  'internal_exception: Error: path_outside_workspace:
  C:\Windows (Root: D:\Joe\muse...' (ENVELOPE pin: no
  handler try/catch, ToolService catch wraps the throw).
  PASS all.
- QR0-run-all-skipped: script-less dir, tasks [lint,test]
  -> ok=false status='incomplete', both skipped:true,
  error 'No requested quality checks were available...'.
  PASS all.
- QR1-run-unknown-task: tasks ['frobnicate129'] ->
  skipped:true, no rejection, status='incomplete'
  (SILENT-SKIP pin, info). PASS all.
- QR2-run-static-records: dist/index.html with the
  joe-artifact-mode meta marker, tasks [build] -> build
  passed, artifactMode='static-records', output 'Verified
  dependency-free records artifact: <entry>', zero shell,
  ok=true status='completed'. PASS run-2/run-3 (run-1
  probe asserted 'static-records' against the spaced
  'records artifact' text).
- QR3-run-npm-pass: seeded manifest + `node test129ok.js`
  (exit 0), tasks [test] -> test passed, ok=true
  status='completed' (HERMETIC-SHELL pin: real
  ExecutionGateway npm run; seeded manifest stops the npm
  upward climb). PASS all.
- QR4-run-npm-fail: `node test129fail.js` (exit 3) ->
  test failed, ok=false status='failed', error starts
  'Quality checks failed: test:'. PASS all.
- PR0-pattern-singleton: TS singleton snippet -> ok=true,
  2 Singleton hits at confidence 0.85. PASS all.
- PR1-pattern-missing-code: {} -> ok=false
  'pattern_recognize needs code to read.'. PASS all.
- PR2-pattern-unimplemented-language: language 'go' (IN
  the schema enum) -> ok=true patterns=[] (ENUM-GAP pin:
  5 enum languages, 2 implemented). PASS all.
  (OBS-129-2, P4 proposed.)
- AR0-refactor-positive: seeded dup-imports + console.log
  + if/else file -> ok=true changes=[optimize-imports,
  simplify], disk rewritten (single './b' import, zero
  console.log, ternary present). PASS run-2/run-3.
- AR1-refactor-missing-arg: {} -> ok=false 'filePath is
  required'. PASS all.
- AR2-refactor-missing-file: absolute contained miss ->
  ok=false 'File not found...' (never created). PASS all.
- AR3-refactor-rename-noop: refactorType 'rename' (IN the
  schema enum) -> ok=true changes=[] + disk byte-identical
  (DEAD-ENUM pin: no handler branch). PASS run-2/run-3.
  (OBS-129-2, P4 proposed.)
- TG0-testgen-node-positive: colon-form CJS export +
  node-runner manifest -> ok=true runner='node',
  __tests__/src129.test.js on disk with node:test +
  node:assert/strict markers, importSpecifier
  '../src129.js', testCount=2 incl 'add129 is exported'.
  PASS run-3 (run-1 root bug; run-2 shorthand seed).
- TG0b-testgen-shorthand-gap: shorthand `{ sub129 }` ->
  ok=true testCount=1 loads-only (DETECTOR-GAP pin, info:
  inner regex needs trailing , or : inside braces).
  PASS run-3 (new in run-3).
- TG1-testgen-jest-runner: scripts.test='jest' manifest ->
  runner='jest', specifier '../src129j' (ext-stripped),
  disk has '@jest/globals' + "it('mul129 is exported'".
  PASS run-3 (run-1 root bug; run-2 shorthand seed).
- TG2-testgen-ts-unsupported: .ts + node runner -> ok=true
  generated:false skipped:true reason
  test_runner_unsupported + vitest remediation + zero
  __tests__ dir (HONEST-SKIP pin: explicit skip,
  contrast dishonest-ok class). PASS run-2/run-3.
- TG3-testgen-missing-arg: {} -> ok=false 'filePath is
  required'. PASS all.
- TG4-testgen-missing-file: absolute contained miss ->
  ok=false 'File not found...'. PASS all.
- PP0-profile-positive: seeded sync-io + single loop ->
  ok=true, sync-io@line3 medium, complexity O(2^n) or
  O(n!)/50 (definition-self-match: every `function name(`
  contains `name(`), recommendations incl async/await +
  algorithmic improvements. PASS run-3 (run-1 root bug;
  run-2 asserted O(n)/90; heuristic quality, info pin,
  no OBS per AP0-128 precedent).
- PP1-profile-missing-arg: {} -> ok=false 'filePath is
  required'. PASS all.
- PP2-profile-missing-file: absolute contained miss ->
  ok=false 'File not found...'. PASS all.
- DG0-doc-positive: 2 functions + 1 class seed -> ok=true
  src129doc.md on disk (241 bytes) with '# src129doc.js'
  + '### add129' + '### Svc129Doc' markers, functions=0
  classes=1 (BROKEN-COUNTER pin: functions regex never
  matches `### <name>`; classes regex matches the `##
  Classes` SECTION header). PASS run-2/run-3.
  (OBS-129-1, P3 proposed.)
- DG1-doc-missing-arg: {} -> ok=false 'File not found:
  missing filePath' (MISLEADING-ERROR pin: missing ARG
  reported as missing FILE). PASS all.
- DG2-doc-unlisted-format: outputFormat 'txt' (outside
  the markdown/html/json enum) -> .txt written
  (ENUM-UNENFORCED pin, OBS-111-2 class). PASS run-2/3.
- DG3-doc-missing-file: absolute contained miss ->
  ok=false 'File not found...'. PASS all.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape
  EXACT (db/users.json 2B + memory dir) + live kb hash ==
  pre (0F6483C1...) + worktree-root kb hash == pre
  (6D7A9D7E...) + live mem hash == pre (4F53CDA1...) +
  zero 129 markers in all three live stores. PASS all
  (each run asserted its own sbx; run-3 tree 129c).

## Behavior pins carried (two new OBS, proposed backlog)
- OBS-129-1 (P3 proposed, LIVE): doc_generator output
  counters never count: functions regex /###\s+Function/
  cannot match the `### <name>` headers it writes (->0
  always, live proof with 2 documented functions);
  classes regex /##\s+Class/ matches the `## Classes`
  SECTION header (->1 always, even with zero classes).
  Any downstream receipt trusting these counts is
  UNSOUND (output-fidelity class). Repair direction
  (ownership-gated): count matches against the header
  patterns actually emitted, or drop the counters.
  No edit without ownership.
- OBS-129-2 (P4 proposed, LIVE, two instances): dead-enum
  class — schema promises, handler ignores, success
  reported: (1) auto_refactor refactorType 'rename' is IN
  the enum but has NO handler branch -> ok:true
  changes=[] with zero effect (AR3 live proof);
  (2) pattern_recognize language enum lists 5 languages
  but only typescript/javascript have pattern tables ->
  go/python/java return ok:true patterns=[] analyzing
  nothing (PR2 live proof). Planners selecting these
  values get silent no-ops. Repair direction: implement
  or remove the enum values, or refuse them loudly.
  Still ownership-gated.
- SA0/SA1/LT0/LT1/PR1/AR1/TG3/PP1 join the known
  OBS-111-2 no-dispatch-validation class (required
  unenforced, handlers loud). DG2 joins it too (enum
  unenforced, handler permissive). No new OBS for the
  class.
- DG1 misleading-error (missing arg reported as missing
  file) is a new error-fidelity pin; sibling tools say
  'filePath is required'. Info pin; no OBS alone (text
  quality), but it compounds verifier diagnosis.
- QR1 unknown-task silent skip is an info pin (lenient
  by construction at QualityTools.ts:222); no OBS (no
  false success: status stays 'incomplete').
- TG0b shorthand-gap + PP0 recursion-self-match are info
  pins (heuristic quality, counts/receipts stay truthful;
  AP0-128 precedent). No OBS.
- TG2 honest-skip is the CONTRAST pin for the
  dishonest-ok class: ok:true + generated:false +
  skipped:true + reason + zero writes is the shape
  AP1-128/127-2 lack. Info pin + class; no OBS (good
  behavior).
- WR0 threaded-root mapping is a new architecture pin:
  getActiveRoot(wsId)=externalRoot/<wsId> in JSON/mock
  mode; the 128 relative-path success was
  AnalysisTools-specific (cwd anchoring), not general
  threaded behavior. Future batteries must seed under
  projects/<wsId>/ for relative paths or use absolute
  paths (via projectRoot=<sbx>). Info pin + runbook
  rule; no OBS.
- CI2 internal-exception envelope is a new error-shape
  pin: tools WITHOUT a handler try/catch surface throws
  as 'internal_exception: Error: <msg>' (vs safePath
  tools returning the raw message). Verifiers matching
  exact error strings must handle both shapes. Info
  pin + class; no OBS.
- npm-upward-climb (method evidence, no live tool case):
  bare-dir `npm audit --json` climbed past the sbx into
  the live tree and fetched registry data (13.6s) — this
  is WHY dependency_audit stays deliberately unproven
  and why QR3/QR4 seed local manifests. Joins the 123
  G6 git-climb class as the npm instance. No OBS filed
  blind (tool behavior + npm semantics interaction;
  needs owned gateway review).
- doc extensionless self-overwrite (outputPath ===
  sourcePath for extensionless files) is a static note
  only — deliberately unexecuted (destructive). No OBS
  without ownership, but the repair (refuse or suffix
  when no extension present) is one line.
- sonar sources-arg containment (sources -> -Dsonar.
  sources with process.cwd()) is a static note; positive
  deliberately unproven (npx download). No OBS without
  ownership.

## Verdict
- TWO new OBS filed to the proposed backlog (129-1 P3
  live broken-counters, 129-2 P4 live dead-enum with two
  instances); nine more OBS-111-2 class instances noted
  (SA/PR/AR/TG/PP required ×8, DG2 enum), no new OBS for
  the class.
- ZERO new orphans (all nine families registered AND
  live at dispatch; ORPHANED stays 5).
- Level-4 dispatch PROVEN for 104 tool-level families
  (95 prior + 9 new: sonar_analysis refusal shapes +
  load_tester refusal shapes + ci_generate_pipeline
  create/skip/containment shapes + quality_run
  skipped/marker/hermetic-shell shapes +
  pattern_recognize positive/refusal/enum-gap shapes +
  auto_refactor write/refusal/dead-enum shapes +
  test_generator node/jest/skip/refusal shapes +
  performance_profile positive/refusal shapes +
  doc_generator write/counter/refusal shapes, with the
  gate-vs-handler split on EIGHT gate tools + the remote
  branch + the threaded-root mapping, and all four risk
  levels live-pinned). No repairs (audit-first;
  coordinated ownership).
- 084 P4 + all F/OBS items 086-129 await team
  review/ownership.

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-128 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128;
  this checkpoint adds the 38-case run-3-green quality
  battery + two OBS; run-1 27/36 + run-2 34/37 receipts
  preserved).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 129 probe log)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=104 tool-level (95 prior + 9 new in 129:
  sonar_analysis refusal + load_tester refusal +
  ci_generate_pipeline + quality_run + pattern_recognize +
  auto_refactor + test_generator + performance_profile +
  doc_generator first live proofs via executeTool incl.
  trim/scheme guards, contained CI write + idempotent skip +
  escape envelope, honest-incomplete + silent-skip + marker
  + hermetic npm pass/fail, singleton + enum-gap, refactor
  write-back + dead-enum, node/jest generation + honest-skip,
  sync-io + complexity join, doc write + broken counters;
  ai_write positive still unproven — needs a model call;
  analyze_codebase LLM summary + request_analyzer valid
  input still unproven by design — need a provider;
  secrets_scan_repo {} deliberately unprobed — would scan live
  root; dependency_audit deliberately unproven — npm climbs +
  network (method-proven); sonar/load positives deliberately
  unproven — npx download / fetch target; ci_generate {} +
  doc extensionless deliberately unprobed — live-root write /
  destructive; delete_file handler still unproven behind the
  high gate; valid browser navigations/actions intentionally
  unproven; dead_code npx + archive shell paths intentionally
  unproven)
QUALITY_ADVANCED_FAMILY_LIVE=9 (SA/LT/CI/QR/PR/AR/TG/PP/DG
  first proofs)
THREADED_ROOT_MAPPING_LIVE=1 (WR0: externalRoot/<wsId> +
  AnalysisTools-cwd-anchor contrast)
DEAD_ENUM_LIVE=2 (AR3 rename + PR2 go/python/java —
  OBS-129-2 P4 proposed)
BROKEN_OUTPUT_COUNTER_LIVE=1 (DG0: functions=0 + classes=1
  always — OBS-129-1 P3 proposed)
HONEST_SKIP_LIVE=1 (TG2: ok:true + generated:false +
  skipped:true + remediation + zero writes)
HERMETIC_SHELL_RUNNER_LIVE=1 (QR3/QR4: seeded-manifest npm
  run pass/fail via ExecutionGateway)
NPM_UPWARD_CLIMB_METHOD=1 (bare-dir audit climbed to the
  live tree + registry fetch 13.6s; why dependency_audit
  stays unproven)
ORPHANED=5 (tool-level lock UNCHANGED; helper-level dead code
  counted separately)
DEAD_HELPERS=8 (unchanged)
DEAD_REGISTERED_HANDLERS=2 (120 OBS-120-1 stands)
DUPLICATE=2 relationships (unchanged)
INPUT_SCHEMA_DISPATCH_VALIDATION=0 (no enforcement at dispatch;
  handlers self-validate, OBS-111-2; 129 adds NINE more
  instances: SA/LT/PR/AR/TG/PP required ×8 + DG2 enum;
  DG1 joins as the misleading-error instance)
VALIDATION_DEPTH_PINNED=3 layers deploy (112) + config-gate layer
  class (113) + missing-presence cost (114) + per-file sibling map
  (115) + action/event asymmetry class (116) + gate-vs-guard order
  class (117 + 121 second pin + 123 third pin) + ingress-enforcement
  asymmetry class (118) + verdict-effect asymmetry class (119) +
  pre-gate-shadow class (120) + fallback-scope class (121) +
  envelope-fidelity class (122 + 125 S1 second pin) + splitter-
  mutation class (123) + session-guard-uniformity class (124) +
  registry-miss-short-circuit class (125) + output-key-loss
  class (125) + containment-policy-divergence class (126) +
  subprocess-containment-escape class (126) + verdict-tool-receipt
  class (126) + unscoped-global-store class (127: write at
  medium + global store + import mkdir) + dishonest-ok-write
  class (127: swallowed persist reports ok:true) + recency-floor-
  precision class (127: boost defeats no-match filter) +
  import-mkdir-side-effect class (127) + cwd-store-fragmentation
  class (127: two coexisting kb files by launch dir) +
  dishonest-ok-missing-path class (128: ok:true + status error,
  sibling-gated contrast) + permission-underdeclaration class
  (128 static: zero-permission LLM/spend call) + loud-vs-silent-
  missing-arg class (128: TM3 fails closed vs KS3/KA3 silent
  wrong-shape) + finding-hygiene class (128: typed relative
  findings, zero secret bytes) + default-root-divergence class
  (128: AP-{} benign vs SS-{} dangerous) + unc-workdir-env class
  (128: \\?\ prefix breaks tsx CWD via CMD fallback) +
  threaded-workspace-root class (129: externalRoot/<wsId>
  mapping + AnalysisTools-cwd-anchor contrast) + dead-enum
  class (129: schema promises, handler ignores, success
  reported) + broken-output-counter class (129: counters
  that cannot count) + honest-skip class (129: explicit
  generated:false skip, dishonest-ok contrast) +
  hermetic-shell-runner class (129: seeded-manifest npm
  pass/fail) + npm-upward-climb class (129 method:
  bare-dir audit reaches the live tree + network) +
  internal-exception-envelope class (129: no-try/catch
  throw shape) + silent-task-skip class (129 info:
  unknown quality tasks skipped) + misleading-missing-arg
  class (129 info: DG1) + shorthand-detector-gap class
  (129 info: TG0b) + recursion-self-match class (129
  info: PP0)
DISPATCH_GATE_PROVEN=8 tools (unchanged count; H4 re-pinned)
DISPATCH_PROBE_PINS=12+8+9+10+10+12+13+15+17+15+14+25+21+25+46+26+44+15+34+38
  (110+111+112+113+114+115+116+117+118+119+120+121+122+123+124+125+126+127+128
  run-2/final probes +129 run-3; 120 run-1 7/13 + 121 run-1 23/24 + 122 run-1
  18/21 + 123 run-1 19/23 + 125 run-1 16/26 + 127 run-1 13/15 +
  128 run-1b 33/34 + 129 run-1 27/36 + run-2 34/37 receipts preserved
  (+128 run1 env-failure receipt); 124 + 126 first-run green, no run-2)
UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Extend dispatch battery to remaining highest-value families
(unprobed: recall_memory/memorize_codebase deep handlers :571-606
— NOTE NVIDIA ACTIVE claim on pipeline/memory/planner areas,
coordinate before probing there; ai_write_file POSITIVE path +
analyze_codebase LLM summary + request_analyzer valid input when
a provider is available; ProjectRun handler depth — same NVIDIA
note; dead_code npx + archive shell paths + dependency_audit
shell + sonar npx positive need owned gateway review first;
secrets_scan_repo {} + ci_generate_pipeline {} default-root
hardening are candidate ownership-gated follow-ups;
doc_generator extensionless guard is a candidate ownership-gated
one-line follow-up) or the next Codex-requested bounded scope,
or OBS-114-1 / OBS-115-1 / OBS-116-1 / OBS-117-1 / OBS-117-2 /
OBS-118-1 / OBS-119-2 / OBS-120-1 / OBS-120-2 / OBS-121-1 /
OBS-121-2 / OBS-122-1 / OBS-123-1 / OBS-125-1 / OBS-125-2 /
OBS-126-1 / OBS-127-1 / OBS-127-2 / OBS-127-3 / OBS-128-1 /
OBS-128-2 / OBS-129-1 / OBS-129-2 ownership/repair proposals at
a coordinated checkpoint. No registry/ToolService/tool edits
without ownership.
