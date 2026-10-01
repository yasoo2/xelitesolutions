# Muse wiring checkpoint 069 — requested-action v2 internals + regression surface
MUSE_HEAD=2ccc12d6
DATE=2026-10-01
SCOPE=intent-classification wiring edges harvested during REQUESTED-ACTION-TRANSFER-002 exact review (pristine 166bea99 overlay; candidate tree untouched)

## Predicate internal edges (v2, verified on pristine bytes)
requested-action.ts @166bea99 adds 5 internal gates inside hasRequestedAction:
- quote/blockq stripper -> denied/loop (single-quote bounded, contraction-safe; '>' lines stripped)
- denied matcher -> early FALSE ('global no-execution contract'; bare-global vs qualified-scoped)
- answerOnly matcher -> early FALSE ('answer-only contract'; split from denied)
- descriptiveBody latch -> clause skip (framing-verb + colon; NEW misfire edge: unanchored
  Arabic verbs match inside صفحة/مراجعة/مقارنة/ملخص nouns — proven by كوافير TRUE->FALSE)
- object-split -> objectHead -> artifact/nonSoftware-carrier/reference gates (fixes R1-class
  + anaphora; NEW veto edge: قصيدة-topic + non-carrier اداة -> FALSE on MEASURED_REQUEST)
Reason-string edge: 'global no-execution contract'/'answer-only contract' literals are
compared by NVIDIA's SEPARATE dirty draft (composition conflict, external to candidate);
inherited planner guard consumes boolean only (PlanningEngine.ts:752) — verified compatible.

## Fan-out confirmation (unchanged from 068)
- isBuildRequest -> hasBuildStructure -> hasRequestedAction: pure passthrough (pristine-verified).
- predicate -> classifyIntent-ordering / IntentParser.parse: STILL DISCONNECTED
  (consumer-contract 5/5 FAIL on pristine v2, identical to 7832).
- planner guard edge: CONNECTED, boolean-only, 6/6 green.

## Regression surface node (new)
13 suites / 279 tests form the measured contract surface around the predicate:
v2 vs 7832 attribution = 3 fixed (R1-class negatives) / 2 newly-broken (V2-R1, V2-R2) /
28 identical-pre-existing (R2/R4/R6 vocab+shape+comma family + P-family). Full map:
tmp/team-consultation/v2-failing-list.txt + v2-regress-attribution-20261001.json.

## Classification delta
- intent-classification family: PARTIALLY_WIRED (unchanged label; predicate internals
  improved 10/10 transfer + R1/R3, but 2 new regression edges + consumers disconnected).
- No global count changes claimed (totals remain last-reported/UNKNOWN).

## Method node (reusable)
Pristine-overlay exact review: git archive <commit> api web/src/lib -> reviewer tmp +
read-only node_modules junction + TEMP/TMP/cache redirect. Detected + neutralized a
mid-review HEAD move (166bea99->535d07d8); manifest 4/4 verified on overlay bytes.
