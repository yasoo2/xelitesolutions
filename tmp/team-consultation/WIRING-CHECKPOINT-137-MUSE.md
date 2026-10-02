# WIRING CHECKPOINT 137 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=2aa3ca8f (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: ROUTER-EXCLUSION MECHANISM + RERANK PURE/ASYNC-STUBBED SURFACE
## FIRST live proofs that exclusion is route-layer-only and the model
## second-opinion layer obeys its contracts without spending a token
136 pinned the catalogue STATIC surface (core exact, blind=0, excluded
31/32 + known phantom, bridge exact), the SELECTOR contract and the
ROUTER contract (3 shy refusals, 1 positive route, 12-goal no-race).
This battery pins the MECHANISM: excluded tools ARE selectable (X0),
the sync router never lands on one even for tailor-made bait (X1/X2)
with a live 26/31 would-win count proving the filter bites, filler
honesty (X3), the rerank pure surface (digest shapes G0/G1, gate
table G2, parser shapes G3, default-on G4, kill-switch G5), tier-2
reorder + tier-3 retrieval + refusal fallthrough via in-process stubs
(G6/G7, zero network), and async-route sync-first + model-cannot-
name-excluded (G8). All 18 cases are pure scoring/routing/rerank
(zero PhaseExecutor dispatch, zero handler execution except the D1
echo control; async paths use explicit canned-JSON llmCall stubs).
NO network, NO model, NO browser, NO npm, NO shell execution, NO
spend. Same isolated tsx method as 110-136: canonical test env
(setup.ts: JSON persistence, mock DB, network fetch guard), bypass
OFF (hermetic), full attribution, CWD = the sandbox dir itself
(Set-Location INSIDE the shell), all imports absolute, FS contained
via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to fresh
tmp/sbx-tmp-137 (run-1) and tmp/sbx-tmp-137b (run-2). NO DATA_DIR is
set: the knowledge.ts import-time mkdir lands in <sbx>/data
(contained; Z0 asserts the shape, 127-137 continuity). NO
AUTO_APPROVE_* set at any point. One CONTAINED env toggle inside G5
only (JOE_TOOL_RERANK set + restored via try/finally; hermetic to
this process). No source edited; probe runs left ZERO tracked
modifications (tracked tree fully clean after the run; only
pre-existing untracked caches). Containment verified: fixtures +
stores + logs + tsx cache all inside the sbx; JOE_DATA_DIR inside
the sbx; all THREE live stores byte-identical pre/post (SHA256,
in-probe Z0 + outside re-hash); zero strays outside the sbx; zero
137 markers in any live store (outside Select-String scan). Probe:
tmp/team-consultation/muse-137-dispatch-probe.ts (syntax pre-checked
via transpile, 0 errors, before importing the service graph;
re-checked 0 errors after the run-2 edit); receipts:
muse-137-dispatch-probe.stdout.log/.stderr.log (UTF-16 via PS
redirect like 110-137 — marker-anchored parse MUSE137_JSON_BEGIN/END
per the 132 method fix; TSX_EXIT=0 is the primary verdict, 18/18
regex-confirmed from the JSON block). RUN-1 17/18 with ONE probe-goal
bug (G8, disclosed below); RUN-2 18/18 GREEN in a fresh sbx. Stderr
carries the standard ToolRegistry permission-default notice (same
surface as 110-136) plus benign `[WS] broadcast ... liveWssRef is
null` lines (no live WS server in the probe; expected).

## Run result: 18/18 PASS run-2, EXIT 0, failed=0, skipped=0
(Run-1: 17/18 — G8 failed 3 sub-pins (via empty, excl_null=false,
lowconf_null=false) with rescued=browser_compare + url=true. Root
cause was the PROBE, not the code: the null-route scan checked the
bare goal but the async calls appended ' https://example.com/rescue/
page' (token 'rescue' flipped scoring), so the SYNC router fired and
returned the sync object (no via) for all three sub-calls. G8 was
corrected to null-check the EXACT full goal string (scan widened to
8 candidates, token-neutral 'https://example.com' suffix, picked
goal now REPORTED), X0 was tightened to the observed 10/10, and
run-2 went green in a FRESH sbx. Zero code defects with live effect
in either run.)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx), rerank env unset. PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- RG0-registered-set: n=163 hash=40739682C4A5CB21 EQUALS the 131
  pin (equality asserted, 131->132->133->134->135->136->137
  unbroken). PASS.
- X0-selection-sees-excluded: 10/10 excluded targets retrieved
  (shell_execute@1 write_file@4 read_file@1 file_edit@2
  react_project@1 deploy_pages@1 central_answer@1 mobile_builder@1
  ai_write_file@1 project_run@1), 0 phantoms. PASS (tightened
  run-2 after observed 10/10).
- X1-router-never-excluded: 0/10 baits routed, 0 violations. PASS.
- X2-exclusion-sweep-31: n=31 routes=0 violations=0 would_win=26
  (e.g. deploy_pages:21.1>7.1 delete_file:12.7>7.1). PASS.
- X3-input-honesty: null 3/3 (browser_run, browser_fill_form,
  google_account) + browser_summarize filled the URL live. PASS.
- G0-digest-full: n=163 unreg=0 dup=0 sorted + format exact. PASS.
- G1-digest-excluded: n=132 leaked=0 reunion miss/extra=0. PASS.
- G2-needsRerank-pins: 6/6 truth rows exact. PASS.
- G3-parseRanking-pins: 9/9 shapes exact. PASS.
- G4-rerank-default-on: disabled=false. PASS.
- G5-killswitch: disabled + calls=0 + base-equal + restored. PASS.
- G6-tier2-stubbed: scan 4 decisive + 4 ambiguous; decisive
  calls=0 unchanged; ambiguous calls=1 top=ai_write_file (model
  top) set-equal + moved. PASS.
- G7-tier3-stubbed: zero-goal 'xyzzy plugh quux'@0; tier3 picks
  lead (calls=1); excluded write_file LEADS a selection; refused
  tier2 fell through (calls=2, top=10.6>=3 so pure-refusal
  attribution, base unchanged). PASS.
- G8-routeAsync-stubbed: sync seo_audit unchanged + calls=0;
  null-goal 'Check the thing thoroughly today please ...'
  rescued=browser_compare via=llm-rerank url=true; excluded
  pick -> null; low-conf pick -> null. PASS (run-2 correction).
- D1-echo-positive: ok=true, output has probe text. PASS.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir) + live kb hash == pre
  (0F6483C1...) + worktree-root kb hash == pre (6D7A9D7E...) +
  live mem hash == pre (4F53CDA1...) + zero 137 markers in all
  three live stores. PASS (each hash ALSO re-verified OUTSIDE
  the probe post-run: identical; outside marker scan clean).

## Behavior pins carried (zero live-effect code defects, 0 new OBS)
- SELECTION pin (X0): all 10 excluded baits retrieve their
  target (7 at rank 1) — ROUTER_EXCLUDED is invisible to the
  selector; the planner is always offered deterministic-path
  tools alongside specialists.
- ROUTE pin (X1): the same 10 baits route NOWHERE (all refused)
  — selection and routing are independent layers.
- FILTER pin (X2): on 26/31 baits an excluded tool OUTSCORES
  the entire non-excluded pool live, yet routes=0 — the
  toolCatalog:412 filter (not weak scores) enforces no-race.
  Upgrades 136-R2 from observed-0-violations to mechanistic.
- FILL pin (X3): required fields outside the fillable families
  yield honest null (3 runtime-found tools); a present URL is
  filled into url-shaped required fields live.
- DIGEST pin (G0): the tier-3 model pool is exactly 163 sorted
  unique 'name — purpose' lines — the whole described registry.
- POOL pin (G1): the async-route model pool is exactly 132 =
  163 minus the 31 resolved excluded; reunion exact both ways.
- RERANK-GATE pin (G2): top>=12+gap>=6 (or solo, or empty/zero)
  skips the model; close/weak races consult it. Exact table.
- PARSE pin (G3): contract + pick + bare-array + object-array +
  prose-wrapped shapes parse; unknown-only/garbage -> null;
  confidence clamped [0,1]. The model can never smuggle an
  unlisted name through parseRanking.
- DEFAULT pin (G4): the layer is live unless JOE_TOOL_RERANK=off.
- KILL pin (G5): 'off' short-circuits BEFORE resolveCall (0
  stub calls even with a throwing stub) and returns base
  unchanged; toggle contained via try/finally.
- TIER2 pin (G6): decisive goals cost 0 calls and return base
  untouched; ambiguous goals cost exactly 1 call and REORDER
  the same set (model top leads, nothing invented/ dropped).
- TIER3 pin (G7): top<3 retrieves (3 stub picks lead in order);
  SELECTION may surface excluded tools (write_file led live) —
  the architecture pin that ONLY the route layer excludes;
  tier2-refusal falls through to tier3 (2 calls) and double
  refusal returns base byte-identical.
- ASYNC-ROUTE pin (G8): a firing sync decision returns
  UNCHANGED with 0 stub calls; a refused goal is rescued via
  llm-rerank with filled input; a 0.99-confidence EXCLUDED pick
  yields null (pool excludes); a 0.5 pick yields null
  (routeThreshold 0.7). The model extends, never overrides.
- RG0 EQUALITY pin: 40739682C4A5CB21 HELD across
  131->132->133->134->135->136->137 (any registration/
  deregistration/rename since 131 would break it).
- DISPATCH_HANDLER_PROVEN stays 111 BY DESIGN: catalogue/
  rerank battery (Level 4), not new tool-handler families;
  this battery adds 0 handler families and 15 contract cases
  (X0/X1/X2/X3/G0/G1/G2/G3/G4/G5/G6/G7/G8/D1/Z0 harness). No
  count inflation.

## New OBS
NONE. Every observed behavior matches its source contract
(including tier-3 surfacing excluded tools into SELECTION —
consistent with X0 and the route-layer-only design, hence a
pin, not a finding). 137 files zero new OBS.

## Verdict
- ZERO live-effect code defects (G8 run-1 was a wrong probe
  goal string, corrected with verbatim log evidence; X0 run-2
  tightening is evidence-backed, re-verified in a fresh sbx).
- Router-exclusion MECHANISM + rerank pure/async-stubbed
  surface now have FIRST LIVE (unmocked, zero-token) proofs at
  HEAD: selection-sees-excluded 10/10, sync-never-excluded,
  31-sweep with 26 would-win, filler honesty, digest shapes,
  gate table, parser shapes, default-on, kill-switch, tier-2
  reorder, tier-3 retrieval + refusal fallthrough, async-route
  sync-first + model-cannot-name-excluded.
- 084 P4 + all F/OBS items 086-136 await team
  review/ownership (137 files zero new OBS).

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-136 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/
  130/131/132/133/134/135/136; this checkpoint adds the 18-case
  run-2-green exclusion/rerank battery).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes, 131)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 137 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans, 131)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live, 131)
DUPLICATE_REGISTRATION=0 (structural throw, static, 131)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 137;
  catalogue/rerank battery by design, zero handler inflation)
EXCLUSION_MECHANISM_LIVE=4 (X0/X1/X2/X3; 137 NEW; run-2 18/18)
RERANK_PURE_LIVE=6 (G0/G1/G2/G3/G4/G5; 137 NEW)
RERANK_STUBBED_LIVE=3 (G6/G7/G8; 137 NEW; zero-token stubs)
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
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, EQUALITY HELD 131->132->133->134->135->136->137)
CM3_CORRECTION=OBS-134-1 PROPOSED P3 (summary wording vs Muse-lineage source+gates, doc-level)
