# WIRING CHECKPOINT 132 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=accc694c (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: VERIFICATION-CONTRACT LIVE RE-VERIFICATION (Level 4)
## FIRST unmocked gate battery — direct UI-001 repair evidence
The GENERAL planner/sanitizer/gate repair (2958a7ec + eae0eb2e) that
closed the run-4b/run-1790611029070 killer class was pinned 12/12 by
jest with a MOCKED ToolService. This battery re-pins the same contract
LIVE at HEAD: real registry, real dispatch, real filesystem, real gate,
zero mocks. 6 sanitizer cases (HEAD-currency + fresh-prose generality)
+ 6 live gate cases (real PhaseExecutor + REAL ToolService).
Every case stays on a SAFE surface: pure sanitizer calls, echo tasks,
ONE read_file verifier execution on a seeded sbx fixture, pre-exec
rejections (G3/G4/G5 run zero handler code). Auto-build cannot trigger
(echo tasks only — PhaseExecutorTool.ts:2487 requires code tasks). NO
network, NO model, NO browser, NO npm, NO shell execution, NO spend.
PhaseExecutorTool has zero run-evidence/persistence writes of its own
(source grep); tool executions proven contained by Z0 in 110-132.
Same isolated tsx method as 110-131: canonical test env (setup.ts:
JSON persistence, mock DB, network fetch guard), bypass OFF (hermetic),
full attribution, CWD = the sandbox dir itself (Set-Location INSIDE the
shell), all imports absolute, FS contained via EXTERNAL_PROJECTS_DIR +
JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-132 (fresh). NO DATA_DIR is set:
the knowledge.ts import-time mkdir lands in <sbx>/data (contained; Z0
asserts the shape, 127-132 continuity). NO AUTO_APPROVE_* set at any
point. No source edited; probe runs left ZERO tracked modifications
(tracked tree fully clean after the run; only pre-existing untracked
caches). Containment verified: fixtures + stores + logs + tsx cache all
inside the sbx; JOE_DATA_DIR inside the sbx; all THREE live stores
byte-identical pre/post (SHA256, in-probe Z0 + outside re-hash); zero
strays outside the sbx.
Probe: tmp/team-consultation/muse-132-dispatch-probe.ts;
receipts: muse-132-dispatch-probe.stdout.log/.stderr.log (UTF-16 via PS
redirect like 110-132 — parse the pretty-printed JSON block with a
MARKER-ANCHORED parse: IndexOf the probe name, then LastIndexOf('{')
BEFORE it; bare LastIndexOf('{') lands mid-JSON and fails — METHOD FIX
vs the 131 header note. TSX_EXIT=0 is the primary verdict, 17/17
regex-confirmed from the JSON block). FIRST-RUN GREEN: no run-2 needed.

## Run result: 17/17 PASS first run, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- RG0-registered-set: n=163 hash=40739682C4A5CB21 EQUALS the 131
  pin (stronger: equality asserted, not just recorded). PASS.
- SC0-fresh-prose-rewrite: NEVER-BEFORE-USED prose ('Confirm the
  nightly report queue drains and every chart tile renders') +
  produced app132/entry.js -> tool=read_file path=app132/entry.js
  gate=true noteHas=true vnTask=true dwng=read_file. PASS.
- SC0b-historical-string-regression: exact :5002 killer string
  ('Verify the technical stack is correctly implemented') ->
  tool=read_file path=app/index.js gate=true. PASS.
- SC1-echo-only-injection-interaction: prose + echo-only ->
  tool=read_file path=ping132/docs/01-status_ping.md gate=true
  (the injected documenting write_file anchors the rewrite). PASS.
- SC2-toolless-object-normalised: {task} + produced file ->
  emitted tool=read_file path=app132/entry.js (rewritten, never
  raw passthrough). PASS.
- SC4-structured-preserved: valid read_file checker preserved
  as-is (tool + path identical). PASS.
- SC5-empty-normalised: '' -> undefined. PASS.
- G0-prose-completes-live: ok=true status=completed completed=1
  results=1 unavail=false check=false (fresh prose, real dispatch).
  PASS.
- G1-absent-parity-live: ok=true status=completed results=1
  unavail=false check=false — identical shape to G0. PASS.
- G2-structured-read-passes-live: ok=true status=completed
  vEntry ok=true exec=ran logPass=true check=read_file/passed/ran
  (real read of marker132.txt, a fixture existing ONLY in this
  run's fresh sbx). PASS.
- G3-nonchecker-object-rejected-live: ok=false status=partial
  logUnavail=true vEntry ok=false err=verification_unavailable:
  unsupported verification... PASS.
- G4-final-read-fails-closed-live: ok=false status=partial
  logUnavail=true (isFinalPhase:true). PASS.
- G5-toolless-object-rejected-live: ok=false status=partial
  logUnavail=true vEntry ok=false. PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir) + live kb hash == pre
  (0F6483C1...) + worktree-root kb hash == pre (6D7A9D7E...) +
  live mem hash == pre (4F53CDA1...) + zero 132 markers in all
  three live stores. PASS (each hash ALSO re-verified OUTSIDE
  the probe post-run: identical).

## Behavior pins carried (zero new OBS — pure verification battery)
- KILLER-CLASS pin LIVE (G0): the run-4b shape (prose verifier +
  successful tasks) completes with real dispatch and records NO
  receipt — first UNMOCKED proof (jest pinned it mocked).
- PARITY pin LIVE (G1): prose receives exactly absent-verifier
  semantics (same ok/status/results-length, no check key).
- POSITIVE pin LIVE (G2): a valid structured checker executes for
  real ('ran', not ledger reuse) and records a passed receipt.
- HONEST-REJECTION pin LIVE (G3): object-shaped non-checkers fail
  the phase OPENLY (partial + unavailable) instead of completing
  silently. No silent-pass path at the gate.
- FAIL-CLOSED pin LIVE (G4): final mode disables the existence-
  observation opt-in; a bare read at a final gate is rejected.
- ASYMMETRY pin LIVE (G5 + SC2): strings DEGRADE (skip the gate,
  complete on tasks) while tool-less OBJECTS REJECT (enter the
  gate via typeof-object, fail closed). This is WHY the sanitizer
  must normalise tool-less objects first — SC2 proves it does.
  Designed behavior, not a defect: no OBS.
- GENERALITY pin (SC0): fresh wording takes the identical rewrite
  path as the observed string — the repair is general, not a
  prompt shortcut.
- INJECTION pin (SC1): echo-only phases observe the injected doc
  (ping132/docs/01-status_ping.md) — documents the sanitizer/
  injection interaction live.
- RG0 EQUALITY pin: 40739682C4A5CB21 HELD across 131->132 (any
  registration/deregistration/rename since 131 would break it).
- MARKER-ANCHORED-PARSE method fix: bare LastIndexOf('{') fails
  on pretty JSON with nested objects; anchor on the probe-name
  marker first. Future batteries use this (info pin + method).
- DISPATCH_HANDLER_PROVEN stays 111 BY DESIGN: PhaseExecutor is
  orchestrator-level (Level 4/5), not a new tool-handler family;
  this battery adds 0 handler families and 12 contract cases.
  No count inflation.

## Verdict
- ZERO new OBS (all six gate shapes + six sanitizer shapes match
  the source-derived contract exactly; G5 asymmetry is designed).
- The GENERAL verification-contract repair now has FIRST LIVE
  (unmocked) proofs at HEAD: prose completes, absent parity,
  structured passes with receipt, non-checkers reject honestly,
  finals fail closed, tool-less objects reject.
- 084 P4 + all F/OBS items 086-132 await team
  review/ownership (132 files none).

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-131 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/130/131;
  this checkpoint adds the 17-case first-run-green contract battery).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes, 131)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 132 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans, 131)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live, 131)
DUPLICATE_REGISTRATION=0 (structural throw, static, 131)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 132;
  orchestrator-level battery by design, zero handler inflation)
VERIFICATION_CONTRACT_LIVE=12 (6 sanitizer + 6 gate, FIRST unmocked, 132)
GATE_SHAPES_LIVE=6 (prose/absent/structured-read/nonchecker/final/toolless)
ORPHANED=4 (131 correction stands; all 4 live-confirmed)
ALIAS_TABLE_ENTRIES=28 (131: all targets registered, zero keys registered)
DIVERGENT_SHADOW_LIVE=1 (run_command table-vs-hand — OBS-131-1 P3 proposed)
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, EQUALITY HELD 131->132)
