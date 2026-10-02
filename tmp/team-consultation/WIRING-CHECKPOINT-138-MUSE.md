# WIRING CHECKPOINT 138 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=be3000bd (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: RUN-EVIDENCE DURABILITY MATRIX
## FIRST live proofs that a QA-shaped finding survives the full
## persist/read-back round-trip through store compaction, plus the
## live adversarial bounds (depth, bytes, window, rotation, reconcile)
137 pinned the router-exclusion MECHANISM (route-layer-only) and the
rerank pure/async-stubbed surface. This battery pins the DURABLE
SINK underneath every QA/verification claim: a realistic
fragmentedHeader finding (EXACT producer shape per
ui-inspection.ts:745-755 + requestedVw/actualVw per :933) is
appended through the module's own exported API and read back
byte-identical (E1); deepest-first depth stepping keeps small deep
payloads whole (E2) with a live cap=10 ceiling (E3); the 16k
string slice (E4a) vs whole-payload 64KB fallback (E4b); the
head-4 + tail-496 event window at 500 (E5); receipt + receipt-event
round-trip (E6); oldest-first session scoping (E9); empty-id no-op
(E10); array/key caps via the exported test hook (E11); two-run
isolation + per-run order on the sequential path (E12); explicit
restart-reconcile of every running record, idempotent (E8); and
oldest-updatedAt rotation holding the store at exactly 100 records
(E7). The concurrent-first-write race found in run-1 is filed as
OBS-138-1 PROPOSED with verbatim evidence — NOT repaired (shared
infra, ownership-gated). NO network, NO model, NO browser, NO npm,
NO shell execution, NO spend. Same isolated tsx method as 110-137:
canonical test env (setup.ts: JSON persistence, mock DB, network
fetch guard), bypass OFF (hermetic), full attribution, CWD = the
sandbox dir itself (Set-Location INSIDE the shell), all imports
absolute, FS contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT
scoped to fresh tmp/sbx-tmp-138 (run-1) and tmp/sbx-tmp-138b
(run-2). NO DATA_DIR is set: the knowledge.ts import-time mkdir
lands in <sbx>/data AND the runEvidenceStore singleton (JsonStore
with no directory = CWD/data/db per jsondb.ts:32) lands in
<sbx>/data/db/run-evidence.json (contained; Z0 asserts both). NO
AUTO_APPROVE_* set at any point. No source edited; probe runs left
ZERO tracked modifications (tracked tree fully clean after the run;
only pre-existing untracked caches). Containment verified: fixtures
+ stores + logs + tsx cache all inside the sbx; JOE_DATA_DIR inside
the sbx; all THREE live stores byte-identical pre/post (SHA256,
in-probe Z0 + outside re-hash); zero strays outside the sbx trees;
zero 138 markers in any live store (outside Select-String scan).
Probe: tmp/team-consultation/muse-138-dispatch-probe.ts (syntax
pre-checked via transpile, 0 errors, before importing the service
graph; re-checked 0 errors after the run-2 edit); receipts:
muse-138-dispatch-probe.stdout.log/.stderr.log (UTF-16 via PS
redirect like 110-138 — marker-anchored parse MUSE138_JSON_BEGIN/END
per the 132 method fix with UTF-16 decode; TSX_EXIT=0 is the primary
verdict, 18/18 regex-confirmed from the JSON block). RUN-1 14/18
with TWO probe bugs (RG0 hash expression, E11 key-count) + ONE REAL
RACE (E12 concurrent first-write lost the runB record; E8 counted 10
not 11 downstream) — all disclosed below; RUN-2 18/18 GREEN in a
fresh sbx. Stderr carries the standard ToolRegistry
permission-default notice (same surface as 110-137) plus benign
`[WS] broadcast ... liveWssRef is null` lines (no live WS server in
the probe; expected).

## Run result: 18/18 PASS run-2, EXIT 0, failed=0, skipped=0
(Run-1: 14/18. RG0 failed: probe hashed sorted.join('|') full-64
while the 131 pin is sha256(sorted.join(',')) sliced to 16 — PROBE
bug, corrected to the exact 137 expression. E11 failed: probe
expected 1 key but the data object honestly carries 2 ('arr' + the
long key) — PROBE bug, corrected to assert both keys + the 160-char
trim on the second. E12 failed AND exposed a REAL defect: three
concurrent appends (A1,B1,A2, fired without await) LOST the runB
record (b=[], E7 pre=12 not 13) because concurrent first-writes to
DIFFERENT runs race the whole-file read-modify-write — the per-run
enqueue chain serializes same-run ops only, and JsonStore.create
reads before joining the write queue, so last-writer-wins drops a
run. E8 failed downstream (closed 10, match=false). The race is NOT
a probe artifact: E7's dynamic pre-count (12 vs 13) and E8's closed
set (10 vs 11) corroborate the loss independently. Run-2 pins the
deterministic sequential path as E12-two-run-isolation and files the
race as OBS-138-1 PROPOSED. Zero other code defects in either run.)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- RG0-registered-set: n=163 hash=40739682C4A5CB21 EQUALS the 131
  pin (equality asserted, 131->132->133->134->135->136->137->138
  unbroken; run-2 uses the exact 137 hash expression). PASS.
- E1-finding-roundtrip: same=true, missing=[] (all 11 provenance
  keys incl url/headerBox/childBoxes/requestedVw/actualVw),
  events=1. PASS.
- E2-deep-small-survives: depth-8 leaf='leaf138' intact
  (depths=[10,7,5,4] live). PASS.
- E3-deep-beyond-10-truncates: k1..k8 objects survive,
  k9='[truncated evidence value]', no throw. PASS.
- E4a-big-string-sliced: 100KB -> len=16000, prefix 'm138-xxx'
  kept. PASS.
- E4b-oversized-fallback: 10x20KB -> data='[event payload
  truncated]', record readable, maxBytes=65536. PASS.
- E6-receipt-roundtrip: status=done, receipt deep-equal,
  phase_receipt event carries projectRoot. PASS.
- E9-session-query: ids=[sess-a1, sess-a2] oldest-first,
  sess-b1 excluded. PASS.
- E10-empty-runid-noop: before=9 after=9, get=null. PASS.
- E11-compact-caps: keys=2 ('arr' + 160-char), arrLen=96
  (run-2 correction). PASS.
- E12-two-run-isolation: a=[1,2] ordered, b=[1], zero
  cross-talk (renamed run-2; race filed as OBS-138-1). PASS.
- E8-restart-reconcile: closed=11 match=true,
  status=interrupted, last=run_interrupted/api_restart,
  second pass=0. PASS.
- E5-event-window-500: len=500 head=[1,2,3,4] fifth=25
  last=520 (520 appends). PASS.
- E7-record-rotation-100: count=100 pre=13 preGone=13
  rot0/rot1 gone rot101 kept (102 creates). PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir + db/run-evidence.json 24884B)
  + live kb hash == pre (0F6483C1...) + worktree-root kb hash
  == pre (6D7A9D7E...) + live mem hash == pre (4F53CDA1...) +
  zero 138 markers in all three live stores. PASS (each hash
  ALSO re-verified OUTSIDE the probe post-run: identical;
  outside marker scan clean).

## Behavior pins carried (12 EVIDENCE pins + RG0 EQUALITY, 1 new OBS)
- QA-FINDING pin (E1): the exact fragmentedHeader producer shape
  survives append/read-back byte-identical — the QA-evidence gap
  is NOT in this store's compaction for realistic findings.
- DEEPEST-FIRST pin (E2): a small depth-8 event keeps its leaf —
  the [10,7,5,4] stepping is real, no fixed depth cliff.
- DEPTH-FLOOR pin (E3): cap=10 is the live ceiling for a fitting
  event; beyond it the marker, never a throw.
- STRING-CAP pin (E4a): one 100KB string keeps its first 16000
  chars — head preserved, tail cut.
- BYTE-BUDGET pin (E4b): 160KB compacted loses the WHOLE payload
  to '[event payload truncated]' while the record stays readable
  — overshoot is total-per-event, never per-record.
- RECEIPT pin (E6): saveRunReceipt persists BOTH the durable
  receipt (deep-equal) and a phase_receipt event carrying the
  same projectRoot — two sinks, one truth.
- SESSION pin (E9): the session question answers oldest-first
  and scoped — creation order, stable under ms ties.
- EMPTY-ID pin (E10): falsy runIds never touch the store and
  read back null — silent no-op, no phantom rows.
- ARRAY/KEY-CAP pin (E11): 150-item array -> 96, 200-char key
  -> 160 chars, sibling keys preserved — one producer cannot
  bloat durable state.
- QUEUE pin (E12): sequential appends to two runs stay isolated
  with per-run order — the deterministic path is sound; the
  CONCURRENT first-write path is OBS-138-1.
- RECONCILE pin (E8): all 11 running records closed to
  interrupted with run_interrupted/api_restart; second pass
  returns [] — explicit, idempotent, exact-set.
- WINDOW pin (E5): 520 appends keep head [1,2,3,4] + tail
  25..520 — the middle is dropped, never the ends.
- ROTATION pin (E7): 102 creates hold the store at exactly 100;
  all 13 pre-E7 + rot-0/rot-1 evicted oldest-first, rot-101
  kept — bounded, deterministic (stable sort + file order).
- RG0 EQUALITY pin: 40739682C4A5CB21 HELD across
  131->132->133->134->135->136->137->138 (any registration/
  deregistration/rename since 131 would break it).
- DISPATCH_HANDLER_PROVEN stays 111 BY DESIGN: durability-matrix
  battery (Level 4), not new tool-handler families; this battery
  adds 0 handler families and 15 contract cases (E1-E12/E5/E7/E8
  + D1/Z0 harness). No count inflation.

## New OBS
- OBS-138-1 (P2 PROPOSED, LIVE run-1 evidence): concurrent
  first-writes to DIFFERENT runs can LOSE a whole run record.
  Run-1 fired A1(runA,seq1) + B1(runB,seq1) + A2(runA,seq2)
  without await: runB's record vanished (b=[], E8 closed 10/11,
  E7 pre 12/13). Mechanism (source-traced, not repaired):
  run-evidence-store.ts:161-169 enqueue chains per runId only;
  JsonStore.create (jsondb.ts:197-203) reads the file BEFORE
  joining the serialized write queue, so two first-writes interleave
  read([])/read([])/push/write/write and the second write drops the
  first run. Impact: under concurrent Joe runs (multi-user future),
  a run's evidence can silently vanish — "missing evidence" that
  looks like "nothing happened". Repair direction (NOT done, needs
  ownership): serialize the read-modify-write per STORE (e.g. route
  create/updateOne/deleteOne through the existing writeQueue with
  the read inside, or a store-level mutex), plus a focused
  concurrent-first-write regression test; RUN-EVIDENCE-SECOND-
  WRITER-001 is test-isolation scope, NOT this race — do not
  conflate. No unilateral edit: run-evidence is shared infra.

## Verdict
- ONE live defect with durable-state effect (OBS-138-1, the
  concurrent first-write race — run-1 verbatim evidence, mechanism
  source-traced, filed PROPOSED, not repaired). Run-1 RG0/E11 were
  wrong probe expectations, corrected with verbatim log evidence.
- Run-evidence DURABILITY now has FIRST LIVE (unmocked) proofs at
  HEAD: QA-finding round-trip byte-identical, deepest-first
  stepping + cap-10 ceiling, 16k slice vs 64KB fallback,
  head-4/tail-496 window, receipt duality, session scoping,
  empty-id no-op, array/key caps, two-run isolation, exact-set
  restart-reconcile, rotation at 100.
- 084 P4 + all F/OBS items 086-137 await team
  review/ownership (138 files OBS-138-1 P2).

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-137 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/
  130/131/132/133/134/135/136/137; this checkpoint adds the
  18-case run-2-green durability battery + OBS-138-1).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes, 131)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 138 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans, 131)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live, 131)
DUPLICATE_REGISTRATION=0 (structural throw, static, 131)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 138;
  durability battery by design, zero handler inflation)
DURABILITY_MATRIX_LIVE=12 (E1/E2/E3/E4a/E4b/E6/E9/E10/E11/E12/E8/E5/E7; 138 NEW; run-2 18/18)
EXCLUSION_MECHANISM_LIVE=4 (X0/X1/X2/X3; 137)
RERANK_PURE_LIVE=6 (G0/G1/G2/G3/G4/G5; 137)
RERANK_STUBBED_LIVE=3 (G6/G7/G8; 137; zero-token stubs)
CATALOGUE_STATIC_LIVE=9 (136)
SELECTOR_CONTRACT_LIVE=11 (136)
ROUTER_CONTRACT_LIVE=5 (136)
CACHEABILITY_MATRIX_LIVE=19 (135)
REUSE_MATRIX_LIVE=8 (134)
REUSE_ROUNDTRIPS_LIVE=3 (134)
VERIFICATION_CONTRACT_LIVE=22 (12 from 132 + 10 from 133)
GATE_OPTIN_SHAPES_LIVE=8 (133)
HANDOFF_ROUNDTRIPS_LIVE=2 (133)
GATE_SHAPES_LIVE=6 (132)
ORPHANED=4 (131 correction stands; all 4 live-confirmed)
ALIAS_TABLE_ENTRIES=28 (131: all targets registered, zero keys registered)
DIVERGENT_SHADOW_LIVE=1 (run_command table-vs-hand — OBS-131-1 P3 proposed)
EXCLUDED_PHANTOM_LIVE=1 (bulk_file_generator — OBS-136-1 P4 proposed, known 131 orphan)
CONCURRENT_FIRST_WRITE_RACE=1 (runB record lost live — OBS-138-1 P2 proposed, run-1 verbatim)
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, EQUALITY HELD 131->132->133->134->135->136->137->138)
CM3_CORRECTION=OBS-134-1 PROPOSED P3 (summary wording vs Muse-lineage source+gates, doc-level)
