# Muse wiring checkpoint 070 — composed consumer edges CONNECTED (typed signal) + 5 open contract items
MUSE_HEAD=65a7e8df
DATE=2026-10-01
SCOPE=intent-routing wiring edges harvested during REQUESTED-ACTION-COMPOSED-003 exact review (pristine 7812e96f vs 535d07d8 overlays; candidate tree untouched; live tree drifted to b6b81126+dirty mid-review, neutralized by overlay)

## Consumer edges: DISCONNECTED -> CONNECTED (pristine-verified)
7812 wires hasRequestedAction into BOTH retained consumers via a new typed boolean:
- requested-action.ts: requiresAnswerOnly = asksOnlyForAnswer || (denied && explanatoryRequest), threaded through all 7 return sites (interface RequestedBuildAction widened; boolean readers unaffected).
- intent-classifier.ts classifyIntent order now: answerOnly->central-shape FIRST; engineering && build->'engineering brief'; build->build; readOnly; knowledge; browser; ambiguous. (NVIDIA's build-before-readOnly position + comment preserved byte-identical; Codex added the typed branch + engineering gating.)
- IntentParser.parse order now: capabilityDecision(computed) -> answerOnly early-return->central_answer -> engineeringBrief && isBuild->project_pipeline -> capability/terminal-diagnostic/classifyIntent cascade (readOnly->pipeline[constrained], knowledge->central, explicitFile, build-no-external->pipeline, quickIntent, LLM deep-analysis with analysisUnavailable graceful fallback — observed, not crashed).
- Provenance: snapshot-vs-7812 byte diff = classifier 9+/3-, parser 2 lines. NVIDIA's reason-literal guard ('answer-only or global no-execution contract') proven DEAD (literal exists in no helper version); typed replacement is the correct repair.
- Planner-guard edge (7832): still CONNECTED, boolean-only, unaffected.

## End-to-end routing evidence (24-case chain probe, BOTH overlays)
FIXED at composed level: quoted-spec override (engineering->pipeline becomes answer-only->central); polite EN/AR builds + targeted-exclusion + explain-then-build (knowledge->central becomes build->pipeline); live-AR + live-simple (readOnly->pipeline becomes answer-only->central).
PRESERVED: true long builds (engineering-gated); R2/R6 (marketplace/panel/comma/desire -> build->pipeline, suite movement proves); login-negative; colon-framing; capitals-negative.
NEW FLIPS (fail-closed): diagnostic/execution-demanding + 'answer only' (run-npm-test, inspect-logs) pipeline->central; genuine-target-URL + 'answer only' pipeline->central. No composition test covers these classes.
NEW EXPOSURE (fail-open, inherited defect): colon-less newline framing helper-TRUE now flows build->pipeline at 7812 (535 accidentally contained it via knowledge-before-build). Predicate V2-R3 fix is now load-bearing for composed acceptance.
COVERAGE GAPS (not regressions): exact live diagnostic has requiresAnswerOnly=FALSE (saved only by legacy knowledge-word; knowledge-word-free variant routes browser_autofix both sides); bare global denial without explanatory framing -> readOnly->pipeline both sides (planner guard will not fire).

## Regression surface node (updated)
16 suites / 291 tests (7812) vs 286 (535): attribution = 5 fixed (exactly the retained consumer tests) / 0 newly-broken / 23 identical-pre-existing. Full map: tmp/team-consultation/c3-regress-attribution-20261001.json + c3-probe-{535,7812}.json. 104/104 + tsc0 reproduced on pristine 7812; owner 10/10 gates exit 0 but UNBOUND (no rev-parse; live-tree run; window-consistent with 7812).

## Classification delta
- intent-routing family: PARTIALLY_WIRED (consumers now connected with correct trust direction, but 5 open contract items: C3-D1 diagnostic carve-out, C3-D2 example-vs-target URL, C3-D3 newline load-bearing, C3-L1 live-signal coverage, C3-L2 bare-denial disposition; plus V2-R1/V2-R2/R4 carry-over and 002 ownership pending).
- No global count changes claimed (totals remain last-reported/UNKNOWN).

## Method node (reusable)
Chain-probe pattern: one jest file (router mocked to throw, cache cleared per case) recording helper+classifier+parser per input on BOTH overlays; graceful-degradation cases (tools:[] + analysisUnavailable) distinguish decided-vs-LLM-fallback. Second consecutive review where the live tree moved mid-review (166->535, now 7812->b6b81126+dirty); pristine-overlay + blob-hash verification neutralized both.
