# WIRING CHECKPOINT 134 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=17ec8b6e (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: LEDGER REUSE MATRIX + LIVE REUSE ROUND-TRIP (CM3 CORRECTION)
## FIRST live proofs of verification-receipt reuse semantics
Team JOE-WIRING-AUDIT-SUMMARY lists CM3 as "Ledger computes
fingerprint / Reuse early-returns on checkId match WITHOUT
fingerprint compare / Stale receipts reused" at
verification-ledger.ts:567-581. A Muse-lineage source read BEFORE
this run proves that literal description matches NO Muse-lineage
code: lines 565-582 ARE the guarded reuse block — reuse requires
prior exists + prior.result==='passed' + selection.cacheable +
fingerprint EQUALITY. No checkId-only early return exists. This
battery pins the REAL contract live: the full reuse decision matrix
(pure ledger calls, zero dispatch: R0-R7) + the gate-level
round-trip (REAL PhaseExecutor: first run 'ran' -> second run
'reused' with ZERO handler execution -> drifted third run 'ran'
again with an invalidated decision and a NEW fingerprint receipt).
Every case stays on a SAFE surface: pure ledger calls on sbx
fixture dirs, echo tasks, read_file verifier executions on ONE
seeded sbx file (G8/G10; G9 runs zero handler code — reuse path),
pre-exec rejections. Auto-build cannot trigger (echo tasks only —
PhaseExecutorTool.ts:2487 requires code tasks). NO network, NO model,
NO browser, NO npm, NO shell execution, NO spend. PhaseExecutorTool
has zero run-evidence/persistence writes of its own (source grep);
tool executions proven contained by Z0 in 110-134. Same isolated
tsx method as 110-133: canonical test env (setup.ts: JSON
persistence, mock DB, network fetch guard), bypass OFF (hermetic),
full attribution, CWD = the sandbox dir itself (Set-Location INSIDE
the shell), all imports absolute, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-134
(fresh). NO DATA_DIR is set: the knowledge.ts import-time mkdir
lands in <sbx>/data (contained; Z0 asserts the shape, 127-134
continuity). NO AUTO_APPROVE_* set at any point. No env mutation
between the live runs (environmentIdentity hashes process.env; all
deletes happen BEFORE run 1). No source edited; probe runs left
ZERO tracked modifications (tracked tree fully clean after the run;
only pre-existing untracked caches). Containment verified: fixtures +
stores + logs + tsx cache all inside the sbx; JOE_DATA_DIR inside the
sbx; all THREE live stores byte-identical pre/post (SHA256, in-probe
Z0 + outside re-hash); zero strays outside the sbx; zero 134 markers
in any live store (outside Select-String scan).
Probe: tmp/team-consultation/muse-134-dispatch-probe.ts (syntax
pre-checked via transpile, 0 errors, before importing the service
graph); receipts: muse-134-dispatch-probe.stdout.log/.stderr.log
(UTF-16 via PS redirect like 110-134 — marker-anchored parse per the
132 method fix; TSX_EXIT=0 is the primary verdict, 17/17
regex-confirmed from the JSON block). FIRST-RUN GREEN: no run-2 needed.
Stderr carries the standard ToolRegistry 21-tool
permission-default notice (same surface as 110-133) plus benign
`[WS] broadcast ... liveWssRef is null` lines (no live WS server in
the probe; expected, no fatal).

## Run result: 17/17 PASS first run, EXIT 0, failed=0
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- RG0-registered-set: n=163 hash=40739682C4A5CB21 EQUALS the 131
  pin (equality asserted, 131->132->133->134 unbroken). PASS.
- R0-reuse-identical: first=run/true second=reuse fpEqual=true
  receiptFp=c55564f66f8a reason='reused: passing receipt matches
  all relevant inputs'. PASS.
- R1-drift-invalidated: action=run fpDiffer=true
  decision=invalidated reason='invalidated: relevant content,
  configuration, arguments, ...'. PASS.
- R2-failed-never-reused: action=run reason='selected: previous
  failed result is never reusable'. PASS.
- R3-fresh-checkId: action=run cacheable=true reason='selected:
  no matching passing receipt'. PASS.
- R4-untrusted-never-cacheable: cacheable=false first=run
  second=run reason='selected: trusted workspace containment is
  unavailable, so reuse ... disabled'. PASS.
- R5-latest-receipt-wins: n=1 result=failed checkId=r5-latest-134
  (passed then failed on same checkId). PASS.
- R6-args-fingerprinted: same checkId + different args -> run +
  'invalidated: ...'. PASS.
- R7-workspace-fingerprinted: same checkId + other workspaceId ->
  run + 'invalidated: ...'. PASS.
- G8-first-run-live: ok=true status=completed vEntry ok=true/ran
  check=read_file/passed/ran logPass=true receipt=passed/9a03da0c.
  PASS.
- G9-reuse-second-run-live: ok=true status=completed vEntry
  ok=true/reused check=passed/reused logReused=true
  decision=reused msg='reused: passing receipt matches all
  relevant inputs' (same task + run-1 ledger, unchanged bytes).
  PASS.
- G10-drift-reruns-live: ok=true status=completed vEntry
  ok=true/ran check=passed/ran decision=invalidated fpNew=true
  (drifted bytes + prior ledger). PASS.
- W0-wsdir-stability: g8hash=FC055BECED70901C
  preG10hash=FC055BECED70901C stable=true. PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir) + live kb hash == pre
  (0F6483C1...) + worktree-root kb hash == pre (6D7A9D7E...) +
  live mem hash == pre (4F53CDA1...) + zero 134 markers in all
  three live stores. PASS (each hash ALSO re-verified OUTSIDE
  the probe post-run: identical; outside marker scan clean).

## Behavior pins carried (one doc-level OBS proposed, zero code defects)
- REUSE pin (R0): same checkId + passed prior + cacheable +
  EQUAL fingerprints reuses with the SAME receipt — no
  checkId-only shortcut needed or taken.
- ANTI-STALE pin (R1): changed bytes invalidate the prior
  receipt; stale proof is never reused.
- NO-FAIL-REUSE pin (R2): only passed receipts qualify;
  failures always re-run.
- FRESH pin (R3): unknown checks always run; nothing is
  conjured from other receipts.
- FAIL-CLOSED pin (R4): without trusted containment even a
  passed receipt cannot justify reuse (cacheable=false,
  nonce'd fingerprint, always run).
- LATEST-WINS pin (R5): re-recording supersedes; no ghost
  passed receipt survives beside the failure.
- ARGS-BOUND pin (R6): proof is bound to its exact arguments,
  not just its check name.
- WORKSPACE-BOUND pin (R7): one workspace can never spend
  another workspace's proof.
- FIRST-RUN pin LIVE (G8): genuine gate execution records a
  passed, fingerprinted receipt (passed/9a03da0c).
- REUSE pin LIVE (G9): identical proof inputs spend the prior
  receipt at the REAL gate — results entry {ok, reused},
  passed/reused check, 'Verification reused' log, reused
  decision; the read_file handler NEVER executes.
- INVALIDATION pin LIVE (G10): drifted bytes re-execute and
  re-record at the REAL gate; the stale receipt is superseded
  (invalidated decision + NEW fingerprint), never spent.
- STABILITY pin (W0): no side-effect writes touched the
  fingerprinted scope between the reuse runs
  (FC055BECED70901C held G8->G9).
- RG0 EQUALITY pin: 40739682C4A5CB21 HELD across
  131->132->133->134 (any registration/deregistration/rename
  since 131 would break it).
- DISPATCH_HANDLER_PROVEN stays 111 BY DESIGN: PhaseExecutor is
  orchestrator-level (Level 4/5), not a new tool-handler family;
  this battery adds 0 handler families and 11 contract cases.
  No count inflation.

## OBS-134-1 (PROPOSED, P3, doc-level — NOT a code defect)
Team JOE-WIRING-AUDIT-SUMMARY CM3 literally misdescribes the
Muse-lineage contract: it claims the ledger "early-returns on
checkId match WITHOUT fingerprint compare" producing "stale
receipts reused", citing lines 567-581. Live evidence: (a) source
read — lines 565-582 ARE the guarded block requiring prior
passed + cacheable + fingerprint EQUALITY (line 568-569);
(b) R0/R1/R4/R6/R7 LIVE — reuse only on full equality, drift/
args/workspace changes invalidate, untrusted never caches;
(c) G8/G9/G10 LIVE — real-gate reuse then drift invalidation
with superseding receipt. Risk: repair prioritization built on
CM3's literal text (P0-LEDGER-FINGERPRINT batch) would "fix" a
non-existent checkId-only shortcut in this lineage. Recommended:
reword CM3 to the guarded reuse contract (or scope it to the
exact lineage where it was observed, with file:line evidence).
No source change proposed by Muse; ownership/wording decision is
the team's. (Sibling of OBS-133-1 on CM2; same doc-level class.)

## Verdict
- ZERO code defects (all 8 reuse shapes + all 3 live gate
  shapes match the source-derived contract exactly).
- Verification-receipt reuse now has FIRST LIVE (unmocked)
  round-trip proofs at HEAD: genuine first-run receipt,
  second-run reuse with zero handler execution, drifted
  third-run invalidation with superseding receipt.
- CM3 as literally written does not describe Muse-lineage code
  (OBS-134-1 proposed for team rewording).
- 084 P4 + all F/OBS items 086-134 await team
  review/ownership (134 files one doc-level OBS).

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-133 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/130/131/132/133;
  this checkpoint adds the 17-case first-run-green reuse battery).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes, 131)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 134 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans, 131)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live, 131)
DUPLICATE_REGISTRATION=0 (structural throw, static, 131)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 134;
  orchestrator-level battery by design, zero handler inflation)
VERIFICATION_CONTRACT_LIVE=22 (12 from 132 + 10 from 133; 134 adds reuse layer below)
REUSE_MATRIX_LIVE=8 (identical/drift/failed/fresh/untrusted/latest/args/workspace, 134 NEW)
REUSE_ROUNDTRIPS_LIVE=3 (first-ran + second-reused + drift-reran, same checkId, 134 NEW)
GATE_OPTIN_SHAPES_LIVE=8 (133)
HANDOFF_ROUNDTRIPS_LIVE=2 (133)
GATE_SHAPES_LIVE=6 (132)
ORPHANED=4 (131 correction stands; all 4 live-confirmed)
ALIAS_TABLE_ENTRIES=28 (131: all targets registered, zero keys registered)
DIVERGENT_SHADOW_LIVE=1 (run_command table-vs-hand — OBS-131-1 P3 proposed)
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, EQUALITY HELD 131->132->133->134)
CM3_CORRECTION=OBS-134-1 PROPOSED P3 (summary wording vs Muse-lineage source+gates, doc-level)
