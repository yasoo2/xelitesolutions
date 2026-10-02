# WIRING CHECKPOINT 136 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=c4c2aca7 (exact; tracked api/src + web/src clean before and
after evidence writes; api/src + web/src byte-identical to
e0c72936 — intervening commits docs/evidence only; verified via
empty `git log e0c72936..HEAD -- api/src web/src api/package.json`
this cycle, and repair-tip a5052571 confirmed ancestor of e0c72936)

## Scope: PLANNER-CATALOGUE STATIC SURFACE + SELECTOR/ROUTER CONTRACT
## FIRST live proofs of what the catalogue CAN see and HOW it chooses
107/108/109 pinned the DYNAMIC union (selectToolsFor over 42 goals
-> COMPLETE 163/163, no phantoms at limit 30, core present,
retrievable universe). This battery pins the OTHER half: the STATIC
surface (CORE_TOOLS exact set, description-blindness = ZERO on this
lineage, ROUTER_EXCLUDED 31/32 resolve + 1 known-orphan phantom,
registeredToolNames bridge exact), the SELECTOR contract
(determinism, score-desc/name-asc ordering, limit floor at 9 for
limit<9, empty/whitespace collapse to core, AR lexicon beyond core,
adversarial boundedness, case folding, render bridge), and the
ROUTER contract (3 shy refusals, 1 live positive route to
browser_seo_audit 16.1 over runner-up browser_extract_meta, 0
never-race violations over 12 EN/AR goals). All 27 cases are pure
catalogue scoring/routing (zero PhaseExecutor dispatch, zero
handler execution except the D1 echo control). NO network, NO
model, NO browser, NO npm, NO shell execution, NO spend. Same
isolated tsx method as 110-135: canonical test env (setup.ts: JSON
persistence, mock DB, network fetch guard), bypass OFF (hermetic),
full attribution, CWD = the sandbox dir itself (Set-Location
INSIDE the shell), all imports absolute, FS contained via
EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to fresh
tmp/sbx-tmp-136 (run-1) and tmp/sbx-tmp-136b (run-2). NO
DATA_DIR is set: the knowledge.ts import-time mkdir lands in
<sbx>/data (contained; Z0 asserts the shape, 127-136
continuity). NO AUTO_APPROVE_* set at any point. No env
mutation between the live cases. No source edited; probe runs
left ZERO tracked modifications (tracked tree fully clean after
the run; only pre-existing untracked caches). Containment
verified: fixtures + stores + logs + tsx cache all inside the
sbx; JOE_DATA_DIR inside the sbx; all THREE live stores
byte-identical pre/post (SHA256, in-probe Z0 + outside re-hash);
zero strays outside the sbx; zero 136 markers in any live store
(outside Select-String scan). Probe:
tmp/team-consultation/muse-136-dispatch-probe.ts (syntax
pre-checked via transpile, 0 errors, before importing the
service graph; re-checked 0 errors after the run-2 edit);
receipts: muse-136-dispatch-probe.stdout.log/.stderr.log
(UTF-16 via PS redirect like 110-136 — marker-anchored parse
MUSE136_JSON_BEGIN/END per the 132 method fix; TSX_EXIT=0 is
the primary verdict, 27/27 regex-confirmed from the JSON
block). RUN-1 26/27 with ONE probe-expectation error (S2a,
disclosed below); RUN-2 27/27 GREEN in a fresh sbx. Stderr
carries the standard ToolRegistry permission-default notice
(same surface as 110-135) plus benign `[WS] broadcast ...
liveWssRef is null` lines (no live WS server in the probe;
expected).

## Run result: 27/27 PASS run-2, EXIT 0, failed=0, skipped=0
(Run-1: 26/27 — S2a asserted all 32 ROUTER_EXCLUDED entries
resolve live; observed 31 + phantom bulk_file_generator. Root
cause was the PROBE, not the code: bulk_file_generator is the
known 131 true orphan (imported registry.ts:18, never added to
tools[]), so the exclusion entry can never match ranked[] (built
from registered tools only) — zero routing effect today. S2a
re-pinned to the observed contract (32 static + phantom ==
{bulk_file_generator}) and run-2 went green in a FRESH sbx.
The dangling entry is filed as OBS-136-1 P4 below. Zero code
defects with live effect in either run.)
- P0-preconditions: bypass=unset, isSystem=false, sbx=set,
  cwd_in_sbx=true, noAA=true, noOpenAI=true, dataDir unset
  (Intended: unset-or-in-sbx). PASS.
- D0-registered-count: registered=163 (re-observed). PASS.
- RG0-registered-set: n=163 hash=40739682C4A5CB21 EQUALS the 131
  pin (equality asserted, 131->132->133->134->135->136
  unbroken). PASS.
- S0-core-static: CORE_TOOLS==9 pinned names + all registered
  live. PASS.
- S1a-blind-static: blind=0 via tools[] AND via the
  registeredToolNames bridge (agreement) — fully-described
  registry, nothing the all-filter drops. PASS.
- S1b-blind-filter: blind=0 vacuous branch (no blind tool to
  prove the filter/scored asymmetry on; the asymmetry path is
  source-traced for attacker/orphan review). PASS.
- S2a-router-excluded-static (run-2 correction): n=32 static +
  31 resolve + phantom=={bulk_file_generator} (known 131
  orphan; OBS-136-1 P4). PASS.
- S2b-core-router-overlap: overlap==7 + routable core exactly
  [search_files,search_text]. PASS.
- S3-bridge-equality: registeredToolNames set == registry keys
  set exactly (only_registry=0, only_bridge=0). PASS.
- C0-determinism: same goal twice -> identical 30-name
  sequences. PASS.
- C1-ordering: score-desc/name-asc holds on EN (30), AR (30)
  and blank (9) goals, 0 violations. PASS.
- C2a-limit-floor-1: limit=1 -> exactly the 9 core (core loop
  unconditional). PASS.
- C2b-limit-floor-0neg: limit=0 and limit=-5 -> 9 each, no
  crash. PASS.
- C2c-limit-large: limit=500 -> n=43 (scoring-bounded, well
  under 163), 0 phantoms. PASS.
- C3a-empty-goal: '' -> exactly the 9 core set. PASS.
- C3b-whitespace-goal: '   ' identical to empty. PASS.
- C4-arabic-lexicon: AR broken-links goal -> n=30, top3 =
  browser_check_links:26.7, browser_ui_audit:12.2,
  browser_fullpage_shot:11.3 (lexicon fired far beyond core).
  PASS.
- C5-adversarial: injection-text goal -> n=30, core present,
  0 phantoms, no throw. PASS.
- C6-case-insensitive: GOAL vs goal -> identical sequences.
  PASS.
- C7-render-bridge: 30 rendered lines == 30 selected, every
  name present in the prompt block. PASS.
- R0a-short-refusal: 'Hi' -> null. PASS.
- R0b-empty-refusal: '' -> null. PASS.
- R0c-no-verb-refusal: plain AR question -> null (stays a
  conversation). PASS.
- R1-positive-route: SEO audit + URL -> browser_seo_audit,
  registered, url filled, score=16.1,
  runnerUp=browser_extract_meta (the exact source-comment
  scenario, live). PASS.
- R2-no-race: 3/12 routes (seo_audit x2, translate x1), 0
  violations — every target registered + NOT excluded. PASS.
- D1-echo-positive: ok=true, output has probe text. PASS.
- Z0-containment: JOE_DATA_DIR in sbx + <sbx>/data shape EXACT
  (db/users.json 2B + memory dir) + live kb hash == pre
  (0F6483C1...) + worktree-root kb hash == pre (6D7A9D7E...) +
  live mem hash == pre (4F53CDA1...) + zero 136 markers in all
  three live stores. PASS (each hash ALSO re-verified OUTSIDE
  the probe post-run: identical; outside marker scan clean).

## Behavior pins carried (zero live-effect code defects, 1 new OBS)
- CORE-EXACT pin (S0): the always-on-table set is exactly
  these 9 names and all resolve live.
- FULLY-DESCRIBED pin (S1a/S1b): blind=0 — every registered
  tool passes the selectToolsFor name+description filter on
  this lineage; no catalogue-blind registered tool exists.
- EXCLUDED-31/32 pin (S2a, corrected): the never-race set is
  32 static with 31 resolving; the 1 phantom is the known 131
  orphan bulk_file_generator (OBS-136-1 P4, dangling until the
  orphan-revival decision; zero routing effect today).
- CORE-ROUTABLE pin (S2b): only search_files + search_text are
  both always-offered and router-reachable.
- BRIDGE-EXACT pin (S3): the planner-answer check function
  agrees exactly with the registry in both directions.
- DETERMINISM pin (C0): retrieval is pure — no model, no
  randomness, no per-request cost.
- ORDER pin (C1): best-first is structural across EN/AR/blank.
- LIMIT-FLOOR pin (C2a/C2b): limit<9 still yields all 9 core;
  latent only (no in-tree caller passes <9; min observed 12).
- SCORE-BOUND pin (C2c): limit=500 yields 43 — scoring, not
  the cap, bounds the list; scale invents nothing.
- EMPTY/WHITESPACE pin (C3a/C3b): blank input collapses to
  the core, never to nothing, never a crash or a guess.
- LEXICON pin (C4): the AR request retrieves specialists
  (check_links 26.7 top) — the bilingual bridge works live.
- ADVERSARIAL pin (C5): hostile prose is scored as text; the
  catalogue stays bounded (30), core-bearing, phantom-free.
- CASE pin (C6): retrieval folds case before scoring.
- RENDER pin (C7): the prompt block carries exactly the
  selected tools — none dropped between selection and render.
- SHY pins (R0a/R0b/R0c): fragments, empties and verb-less
  questions never route.
- ROUTE pin (R1): clear act verb + distinctive name hit +
  fillable input routes exactly one specialist, live.
- NO-RACE pin (R2): 0 violations over 12 EN/AR goals — the
  router never lands on a deterministic-path tool.
- RG0 EQUALITY pin: 40739682C4A5CB21 HELD across
  131->132->133->134->135->136 (any registration/
  deregistration/rename since 131 would break it).
- DISPATCH_HANDLER_PROVEN stays 111 BY DESIGN: pure-catalogue
  battery (Level 4), not a new tool-handler family; this
  battery adds 0 handler families and 24 contract cases. No
  count inflation.

## OBS-136-1 (P4, proposed, hygiene/reconciliation)
ROUTER_EXCLUDED carries bulk_file_generator, which is not
registered (known 131 orphan: imported registry.ts:18, never
added to tools[]). Zero routing effect today (ranked[] is
built from registered tools only), so this is NOT a routing
defect. Action at the coordinated orphan-revival decision:
either register the tool (exclusion then applies as intended)
or drop the dangling entry. No unilateral edit (ownership-
gated like all registry-adjacent changes).

## Verdict
- ZERO live-effect code defects (S2a run-1 was a wrong probe
  expectation, corrected with registry evidence; the phantom
  is a known orphan with zero routing effect).
- Planner-catalogue static surface + selector/router contract
  now have FIRST LIVE (unmocked) proofs at HEAD: core exact,
  blind=0, excluded 31/32 + known phantom, bridge exact,
  determinism, ordering, limit floor, empty collapse, AR
  lexicon, adversarial bound, case fold, render bridge, 3 shy
  refusals, 1 positive route, 12-goal no-race sweep.
- 1 new OBS filed (OBS-136-1 P4 dangling exclusion entry).
- 084 P4 + all F/OBS items 086-135 await team
  review/ownership (136 files one P4 OBS).

## Locks carried (not rerun: api/ registry/router/terminal/kernel/
## memory/vectordb/infra/tools/routes/ws unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086-135 verdicts stand (lists in 096/097/098/099/100/101/
  102/103/104/105/106/107/108/109/110/111/112/113/114/115/
  116/117/118/119/120/121/122/123/124/125/126/127/128/129/
  130/131/132/133/134/135; this checkpoint adds the 27-case
  run-2-green catalogue battery).

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
DEFINED_TOOLS=168 (Muse lineage, definitions/*.ts both shapes, 131)
REGISTERED_TOOLS=163 (Muse-lineage, re-observed in 136 probe log)
IMPLEMENTED_NOT_REGISTERED=5 (grep_search by-design + 4 true orphans, 131)
REGISTERED_WITHOUT_IMPLEMENTATION=0 (RG2 live, 131)
DUPLICATE_REGISTRATION=0 (structural throw, static, 131)
PLANNER_UNION_OBSERVED=163 (42-goal sample; COMPLETE 163/163, 109)
DISPATCH_HANDLER_PROVEN=111 tool-level (unchanged by 136;
  pure-catalogue battery by design, zero handler inflation)
CATALOGUE_STATIC_LIVE=9 (S0/S1a/S1b/S2a/S2b/S3 + D0/RG0/D1/Z0 harness, 136 NEW; run-2 27/27)
SELECTOR_CONTRACT_LIVE=11 (C0/C1/C2a/C2b/C2c/C3a/C3b/C4/C5/C6/C7; 136 NEW)
ROUTER_CONTRACT_LIVE=5 (R0a/R0b/R0c/R1/R2, 136 NEW)
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
REGISTRY_SET_HASH=40739682C4A5CB21 (exact-set pin, EQUALITY HELD 131->132->133->134->135->136)
CM3_CORRECTION=OBS-134-1 PROPOSED P3 (summary wording vs Muse-lineage source+gates, doc-level)
