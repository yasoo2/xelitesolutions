# WIRING CHECKPOINT 135 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=fd1295a6 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: LEDGER CACHEABILITY MATRIX + NARROWING + CAPS
## FIRST live proofs of when a selection is cacheable at all
134 pinned the reuse decision matrix (passed+cacheable+equal-fp
reuses; drift/args/workspace invalidate; untrusted never caches).
This battery pins the OTHER half of the contract: the four
cacheable=false gates (missing/ambiguous narrowing, browser
revision, overflow, incomplete links), explicit-path narrowing
semantics (single-resolve, bystander-drift immunity, narrowed
drift invalidation, boundary maps, final-mode bypass), and the
bounded-ledger caps (96 receipts / 192 decisions / cumulative
accounting). All 22 cases are pure ledger calls on sbx fixture
dirs (zero PhaseExecutor dispatch, zero handler execution
except the D1 echo control). NO network, NO model, NO browser,
NO npm, NO shell execution, NO spend. Same isolated tsx method
as 110-134: canonical test env (setup.ts: JSON persistence,
mock DB, network fetch guard), bypass OFF (hermetic), full
attribution, CWD = the sandbox dir itself (Set-Location INSIDE
the shell), all imports absolute, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to fresh
tmp/sbx-tmp-135 (run-1) and tmp/sbx-tmp-135b (run-2). NO
DATA_DIR is set: the knowledge.ts import-time mkdir lands in
<sbx>/data (contained; Z0 asserts the shape, 127-135
continuity). NO AUTO_APPROVE_* set at any point. No env
mutation between the live selects (environmentIdentity hashes
process.env; all deletes happen BEFORE case 1). No source
edited; probe runs left ZERO tracked modifications (tracked
tree fully clean after the run; only pre-existing untracked
caches). Containment verified: fixtures + stores + logs + tsx
cache all inside the sbx; JOE_DATA_DIR inside the sbx; all
THREE live stores byte-identical pre/post (SHA256, in-probe
Z0 + outside re-hash); zero strays outside the sbx; zero 135
markers in any live store (outside Select-String scan).
Probe: tmp/team-consultation/muse-135-dispatch-probe.ts (syntax
pre-checked via transpile, 0 errors, before importing the
service graph; re-checked 0 errors after the run-2 edit);
receipts: muse-135-dispatch-probe.stdout.log/.stderr.log
(UTF-16 via PS redirect like 110-135 — marker-anchored parse
per the 132 method fix; TSX_EXIT=0 is the primary verdict,
22/22 regex-confirmed from the JSON block). RUN-1 21/22 with
ONE probe-expectation error (I1, disclosed below); RUN-2
22/22 GREEN in a fresh sbx. Stderr carries the standard
ToolRegistry 21-tool permission-default notice (same surface
as 110-134) plus benign `[WS] broadcast ... liveWssRef is
null` lines (no live WS server in the probe; expected).

## Run result: 22/22 PASS run-2, EXIT 0, failed=0, skipped=0
(Run-1: 21/22 — I1 expected an inside-junction to stay
cacheable; observed cacheable=false. Root cause was the PROBE,
not the code: on this platform lstatSync(junction).
isSymbolicLink()===true (verified outside the probe on the
run-1 fixture), so junctions trip both the ancestor-walk
containment check and the direct lstat link check — always
conservative, fail-closed safe. I1 re-pinned to the observed
safe contract and run-2 went green in a FRESH sbx. Zero code
defects in either run.)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- RG0-registered-set: n=163 hash=40739682C4A5CB21 EQUALS the 131
  pin (equality asserted, 131->132->133->134->135 unbroken). PASS.
- N0-missing-explicit-denied: cacheable=false first=run
  second=run reason='selected: declared verification paths were
  missing or ambiguous...' (passed receipt NOT reused). PASS.
- N1a-ambiguous-explicit-denied: dual-resolving explicit (both
  workspaceRoot- and root-relative candidates exist) ->
  cacheable=false + missing-or-ambiguous reason. PASS.
- N1b-disambiguated-cacheable: nested copy removed ->
  cacheable=true + relevantPaths exactly ['x135.txt']. PASS.
- N2-outside-explicit-conservative: existing-but-outside
  absolute path -> cacheable=false + rel ['.'] + unrelated
  in-scope drift changes fp (whole-scope fallback). PASS.
- N3a-narrowed-ignores-outside-drift: narrowed single file,
  bystander drift -> reuse with SAME fp. PASS.
- N3b-narrowed-drift-invalidates: narrowed-file drift -> run +
  invalidated reason. PASS.
- N4-incomplete-boundary-denied: incomplete boundary map ->
  cacheable=false + rel ['.'] (zero explicit paths). PASS.
- N4b-complete-boundary-narrows: complete boundary ->
  cacheable=true + rel exactly ['only135.txt']. PASS.
- F0-final-bypasses-narrowing: final + missing explicit ->
  cacheable=true + rel ['.'] + second select reuses. PASS.
- B0-browser-no-revision-denied: browser_navigate w/o
  target+revision -> cacheable=false + no-trusted-target
  reason. PASS.
- B1-browser-with-revision-reuses: pinned target+revision ->
  cacheable=true + second select reuses (pure-string, zero
  network). PASS.
- O0-overflow-never-reusable: 65MB scope -> cacheable=false +
  budget reason + fp1 != fp2 (Date.now nonce). PASS.
- I0-outside-junction-denied: outside junction ->
  cacheable=false + unsupported-links reason. PASS.
- I1-inside-junction-still-denied (run-2 correction): inside
  junction -> cacheable=false + unsupported-links reason
  (junctions read as symlinks; always conservative). PASS.
- C0-receipt-cap-evicts-oldest: 100 records -> 96 receipts;
  first cap135-004, last cap135-099. PASS.
- C1-decision-cap-evicts-oldest: 200 selects -> 192
  decisions; first dec135-008. PASS.
- C2-accounting-survives-eviction: executions=100 with 96
  receipts + accounting.complete=true. PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir) + live kb hash == pre
  (0F6483C1...) + worktree-root kb hash == pre (6D7A9D7E...) +
  live mem hash == pre (4F53CDA1...) + zero 135 markers in all
  three live stores. PASS (each hash ALSO re-verified OUTSIDE
  the probe post-run: identical; outside marker scan clean).

## Behavior pins carried (zero code defects, zero new OBS)
- MISSING-NARROW pin (N0): an unresolvable declared path
  disables narrowed reuse entirely (run/run despite a passed
  receipt).
- AMBIGUOUS-NARROW pin (N1a): two candidates for one declared
  path resolve to null — never pick one silently.
- SINGLE-RESOLVE pin (N1b): one candidate narrows to exactly
  that file.
- OUTSIDE-CONSERVATIVE pin (N2): unsafe declared paths widen
  to the whole project (rel ['.'], fp covers bystander drift),
  never narrow silently.
- NARROWED-SCOPE pin (N3a): narrowed proof covers exactly the
  narrowed file; bystander drift cannot invalidate it.
- NARROWED-DRIFT pin (N3b): narrowed proof still invalidates
  when its own file changes.
- BOUNDARY-COMPLETE pin (N4): an incomplete boundary map
  disables narrowed reuse even with zero explicit paths.
- BOUNDARY-NARROW pin (N4b): a complete boundary narrows to
  exactly its paths.
- FINAL-WHOLE-SCOPE pin (F0): final mode fingerprints the
  whole scope and never narrowing-blocks (missing declared
  paths do not stop caching; whole-scope fp still guards).
- BROWSER-REVISION pin (B0/B1): visual proof is reusable only
  with a pinned target+revision; unpinned browser checks
  always re-run.
- OVERFLOW pin (O0): over-budget fingerprints are
  non-deterministic by construction (Date.now nonce), so
  reuse is impossible, not merely disabled.
- OUTSIDE-LINK pin (I0): a link escaping the scope disables
  reuse (fail-closed).
- INSIDE-LINK pin (I1, corrected): junctions read as symlinks
  via lstat on this platform, so EVERY junction disables
  reuse — conservative by construction (safe direction; the
  run-1 expectation was the error, disclosed).
- RECEIPT-CAP pin (C0): 100 records -> 96 kept, oldest-first
  eviction; the ledger is a bounded reuse cache.
- DECISION-CAP pin (C1): 200 selects -> 192 kept,
  oldest-first eviction.
- ACCOUNTING pin (C2): replacement/eviction cannot erase
  cumulative cost counters (executions=100 with 96 receipts).
- RG0 EQUALITY pin: 40739682C4A5CB21 HELD across
  131->132->133->134->135 (any registration/deregistration/
  rename since 131 would break it).
- DISPATCH_HANDLER_PROVEN stays 111 BY DESIGN: pure-ledger
  battery (Level 4), not a new tool-handler family; this
  battery adds 0 handler families and 19 contract cases. No
  count inflation.

## Verdict
- ZERO code defects (all 4 cacheability gates + all 9
  narrowing shapes + both caps + accounting match the
  source-derived contract exactly; I1 run-1 was a wrong probe
  expectation, corrected with platform evidence).
- Ledger cacheability now has FIRST LIVE (unmocked) proofs at
  HEAD: missing/ambiguous/outside narrowing denial,
  single-resolve narrowing, bystander immunity, boundary maps,
  final bypass, browser revision gating, overflow
  non-determinism, junction conservatism, and bounded caps.
- No new OBS filed (no doc/code mismatch observed; I1 was a
  probe error, not a contract defect).
- 084 P4 + all F/OBS items 086-134 await team
  review/ownership (135 files zero new OBS).

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-134 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/130/131/132/133/134;
  this checkpoint adds the 22-case run-2-green cacheability battery).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes, 131)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 135 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans, 131)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live, 131)
DUPLICATE_REGISTRATION=0 (structural throw, static, 131)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 135;
  pure-ledger battery by design, zero handler inflation)
CACHEABILITY_MATRIX_LIVE=19 (N0/N1a/N1b/N2/N3a/N3b/N4/N4b/F0/B0/B1/O0/I0/I1/C0/C1/C2 + P0/D0/RG0/D1/Z0 harness, 135 NEW; run-2 22/22)
REUSE_MATRIX_LIVE=8 (134)
REUSE_ROUNDTRIPS_LIVE=3 (134)
VERIFICATION_CONTRACT_LIVE=22 (12 from 132 + 10 from 133; 135 adds the cacheability layer above)
GATE_OPTIN_SHAPES_LIVE=8 (133)
HANDOFF_ROUNDTRIPS_LIVE=2 (133)
GATE_SHAPES_LIVE=6 (132)
ORPHANED=4 (131 correction stands; all 4 live-confirmed)
ALIAS_TABLE_ENTRIES=28 (131: all targets registered, zero keys registered)
DIVERGENT_SHADOW_LIVE=1 (run_command table-vs-hand — OBS-131-1 P3 proposed)
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, EQUALITY HELD 131->132->133->134->135)
CM3_CORRECTION=OBS-134-1 PROPOSED P3 (summary wording vs Muse-lineage source+gates, doc-level)
