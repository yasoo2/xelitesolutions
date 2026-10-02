# WIRING CHECKPOINT 133 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=357134d0 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: GATE OPT-IN MATRIX + SANITIZER->GATE HANDOFF (CM2 CORRECTION)
## FIRST live proofs of the producer->consumer loop
Team JOE-WIRING-AUDIT-SUMMARY lists CM2 as "Sanitizer emits read_file
with allowExistenceObservation=true / PhaseExecutor calls
isVerificationTool without allowExistenceObservation / Intermediate
observations rejected". A whole-api/src grep BEFORE this run proves
that literal description matches NO Muse-lineage code: the opt-in
flags exist ONLY as gate-side parameters (verification-ledger.ts:733
predicate + PhaseExecutorTool.ts:2355-2357 call site with mode-derived
allowPhaseOutputObservation). NO sanitizer or other producer emits an
allowExistenceObservation arg anywhere. And 132 G2 already proved an
intermediate observation ACCEPTED live. This battery pins the REAL
contract: the full gate opt-in matrix (pure predicate, zero dispatch)
+ the HANDOFF round-trip 132 left open (sanitizer emission fed into
the REAL gate at both intermediate and final modes).
Every case stays on a SAFE surface: pure predicate calls (SC6-SC13
run ZERO handler code — including the shell_execute SHAPE checks,
which never execute), echo tasks, ONE read_file verifier execution
each on a seeded sbx fixture (G6/G7 share the seeded file; G7 runs
zero handler code — pre-exec rejection), pre-exec rejections.
Auto-build cannot trigger (echo tasks only —
PhaseExecutorTool.ts:2487 requires code tasks). NO network, NO model,
NO browser, NO npm, NO shell execution, NO spend. Distinct verifier
descriptions per G-case keep ledger selections fresh ('ran', not
reuse). PhaseExecutorTool has zero run-evidence/persistence writes of
its own (source grep); tool executions proven contained by Z0 in
110-133. Same isolated tsx method as 110-132: canonical test env
(setup.ts: JSON persistence, mock DB, network fetch guard), bypass
OFF (hermetic), full attribution, CWD = the sandbox dir itself
(Set-Location INSIDE the shell), all imports absolute, FS contained
via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-133
(fresh). NO DATA_DIR is set: the knowledge.ts import-time mkdir lands
in <sbx>/data (contained; Z0 asserts the shape, 127-133 continuity).
NO AUTO_APPROVE_* set at any point. No source edited; probe runs left
ZERO tracked modifications (tracked tree fully clean after the run;
only pre-existing untracked caches). Containment verified: fixtures +
stores + logs + tsx cache all inside the sbx; JOE_DATA_DIR inside the
sbx; all THREE live stores byte-identical pre/post (SHA256, in-probe
Z0 + outside re-hash); zero strays outside the sbx; zero 133 markers
in any live store (outside Select-String scan).
Probe: tmp/team-consultation/muse-133-dispatch-probe.ts (syntax
pre-checked via transpile, 0 errors, before importing the service
graph); receipts: muse-133-dispatch-probe.stdout.log/.stderr.log
(UTF-16 via PS redirect like 110-133 — marker-anchored parse per the
132 method fix; TSX_EXIT=0 is the primary verdict, 15/15
regex-confirmed from the JSON block). FIRST-RUN GREEN: no run-2 needed.
Stderr carries only the standard ToolRegistry 21-tool
permission-default notice (same surface as 110-132, no fatal).

## Run result: 15/15 PASS first run, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- RG0-registered-set: n=163 hash=40739682C4A5CB21 EQUALS the 131
  pin (equality asserted, 131->132->133 unbroken). PASS.
- SC6-read-single-optin-true: lower=true upper=true
  (case-insensitive name). PASS.
- SC7-read-single-optin-false: plain=false marked=false (opt-in
  FALSE rejects even when explicitlyMarked). PASS.
- SC8-read-multi-rejected: two distinct path values + opt-in ->
  false. PASS.
- SC9-read-empty-rejected: empty=false blank=false. PASS.
- SC10-read-traversal-rejected: path=false filePath=false
  (dot-dot via either key). PASS.
- SC11-project-run-live-optin: optin=true nooptin=false
  (predicate only, zero runs started). PASS.
- SC12-shell-static-shapes: 'npm test' -> true; 'rm -rf /',
  'npm --help', piped command -> false (PURE SHAPE CHECK, zero
  execution). PASS.
- SC13-unknown-rejected: unknown=false echo=false with ALL
  flags true. PASS.
- G6-handoff-roundtrip-live: emitted=read_file/handoff133.txt
  hasFlagArg=false ok=true status=completed vEntry ok=true
  exec=ran logPass=true check=read_file/passed/ran. PASS.
- G7-final-handoff-fails-closed-live: ok=false status=partial
  logUnavail=true (SAME sanitizer emission as G6). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir) + live kb hash == pre
  (0F6483C1...) + worktree-root kb hash == pre (6D7A9D7E...) +
  live mem hash == pre (4F53CDA1...) + zero 133 markers in all
  three live stores. PASS (each hash ALSO re-verified OUTSIDE
  the probe post-run: identical; outside marker scan clean).

## Behavior pins carried (one doc-level OBS proposed, zero code defects)
- OPT-IN pin (SC6): the intermediate gate opt-in accepts a
  single-output observation (name match case-insensitive).
- FINAL-PARITY pin (SC7): no flag combination certifies a read
  without the existence opt-in — not even explicitlyMarked.
- SINGLE-PATH pin (SC8) + NONEMPTY pin (SC9) + TRAVERSAL pin
  (SC10): the opt-in never blesses multi-path, path-less, or
  escaping reads — the single-output guard holds on every key.
- LIVE-RUN pin (SC11): project_run certifies iff the gate's
  live-run opt-in is set; the predicate alone starts nothing.
- STATIC-CHECKER pin (SC12): only expansion-free test-shaped
  shell commands certify; destructive/help/piped shapes never
  do — pinned WITHOUT executing anything.
- CLOSED-WORLD pin (SC13): untrusted tool names never certify
  under ANY flag combination.
- HANDOFF pin LIVE (G6): the producer->consumer loop closes for
  real — genuine sanitizer output (fresh prose, never-before-used
  wording) completes at the REAL intermediate gate with a
  ran/passed receipt. The opt-in lives GATE-SIDE (mode-derived),
  not in the emitted args (hasFlagArg=false).
- HANDOFF-FAIL-CLOSED pin LIVE (G7): the SAME emission fails
  closed at a final gate — mode-derived opt-in cannot be
  smuggled via args.
- RG0 EQUALITY pin: 40739682C4A5CB21 HELD across 131->132->133
  (any registration/deregistration/rename since 131 would break it).
- DISPATCH_HANDLER_PROVEN stays 111 BY DESIGN: PhaseExecutor is
  orchestrator-level (Level 4/5), not a new tool-handler family;
  this battery adds 0 handler families and 10 contract cases.
  No count inflation.

## OBS-133-1 (PROPOSED, P3, doc-level — NOT a code defect)
Team JOE-WIRING-AUDIT-SUMMARY CM2 literally misdescribes the
Muse-lineage contract: it claims the sanitizer EMITS an
allowExistenceObservation flag arg and the gate calls WITHOUT the
opt-in, concluding "Intermediate observations rejected". Live
evidence: (a) whole-api/src grep — no producer emits that arg;
(b) gate source PhaseExecutorTool.ts:2355-2357 — gate passes
mode-derived opt-in itself; (c) 132 G2 + 133 G6 LIVE — intermediate
observations ACCEPTED with ran/passed receipts. Risk: repair
prioritization built on CM2's literal text would "fix" a
non-existent producer/consumer split. Recommended: reword CM2 to
the gate-side opt-in contract (or scope it to the exact lineage
where it was observed, with file:line evidence). No source change
proposed by Muse; ownership/wording decision is the team's.

## Verdict
- ZERO code defects (all 8 predicate shapes + both handoff shapes
  match the source-derived contract exactly).
- The sanitizer->gate HANDOFF now has FIRST LIVE (unmocked)
  round-trip proofs at HEAD: genuine emission accepted at
  intermediate gates, rejected at final gates.
- CM2 as literally written does not describe Muse-lineage code
  (OBS-133-1 proposed for team rewording).
- 084 P4 + all F/OBS items 086-133 await team
  review/ownership (133 files one doc-level OBS).

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-132 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/130/131/132;
  this checkpoint adds the 15-case first-run-green handoff battery).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes, 131)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 133 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans, 131)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live, 131)
DUPLICATE_REGISTRATION=0 (structural throw, static, 131)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 133;
  orchestrator-level battery by design, zero handler inflation)
VERIFICATION_CONTRACT_LIVE=22 (12 from 132 + 10 new: 8 predicate + 2 handoff, 133)
GATE_OPTIN_SHAPES_LIVE=8 (single/multi/empty/traversal/project-run/shell-static/unknown/marked, 133 NEW)
HANDOFF_ROUNDTRIPS_LIVE=2 (intermediate-accept + final-reject, same emission, 133 NEW)
GATE_SHAPES_LIVE=6 (prose/absent/structured-read/nonchecker/final/toolless, 132)
ORPHANED=4 (131 correction stands; all 4 live-confirmed)
ALIAS_TABLE_ENTRIES=28 (131: all targets registered, zero keys registered)
DIVERGENT_SHADOW_LIVE=1 (run_command table-vs-hand — OBS-131-1 P3 proposed)
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, EQUALITY HELD 131->132->133)
CM2_CORRECTION=OBS-133-1 PROPOSED P3 (summary wording vs Muse-lineage source+gates, doc-level)
