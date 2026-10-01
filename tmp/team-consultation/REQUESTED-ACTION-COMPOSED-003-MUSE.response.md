# Muse consultation response — REQUESTED-ACTION-COMPOSED-003
AGENT=MUSE
CONSULTATION_ID=REQUESTED-ACTION-COMPOSED-003-MUSE
MUSE_HEAD=65a7e8df (review cycle; no Muse source edits for this scope)
MUSE_BRANCH=muse/joe-development
CANDIDATE_ROOT=C:/Users/home/.codex/worktrees/requested-action-composed/xelitesolutions
CANDIDATE_COMMIT=7812e96f6dffc0f87f30071c505597f0610c15f8
CANDIDATE_PARENT=535d07d8816a1c4b2924cd30783c9228fd4749fd
SHARED_FILE_WRITE=DENIED (expected: absolute path outside workspace; shared file left PENDING_REVIEW for Codex verbatim import; no STATUS change claimed)
STATUS=REVIEWED_BY_MUSE
POSITION=Experiment VERIFIED on pristine bytes (provenance byte-exact vs NVIDIA snapshot; 104/104 + tsc0 independently reproduced; 16-suite attribution 5-fixed/0-broken; quoted-spec override fixed end-to-end; polite builds recovered). But composed routing introduces 2 NEW fail-closed flips (diagnostic+answer-only, genuine-URL+answer-only), promotes the inherited V2-R3 fail-open to end-to-end pipeline routing, and the exact live diagnostic does not trigger the typed signal. REWORK with bounded C3-D1..D3 prescription + carry-over; 002 ownership still gates any adoption.
RECOMMENDATION=REWORK
UPDATED=2026-10-01 (independent exact-commit inspection + pristine-overlay test execution this cycle; candidate repo/tree untouched by reviewer: zero writes, no checkout/worktree/stash)

## Review basis (exactness)
- Commit 7812e96f verified: exactly 4 files vs 535 (requested-action.ts +typed signal; intent-classifier.ts reorder+gating; IntentParser.ts early-return+gating; consumer-contract +5 tests). 88+/20- as claimed.
- Provenance byte-verified: snapshot intent-classifier.ts (blob 1e666e1, matches actual-delta.patch) -> 7812 (6e57a02) = exactly 9+/3- (typed import, return type, answerOnly-first branch, engineering gating). Snapshot IntentParser.ts (814e6d9, matches patch) -> 7812 (7421119) = exactly 2 lines (reason-literal -> requiresAnswerOnly; engineering gated on actionCheck.isBuild). NVIDIA comment text, build-branch position, parser early-return structure, import swap all preserved byte-identical. SCOPE claim TRUE.
- Pristine overlay method (candidate tree untouched): git archive 7812/535 (api + web/src/lib) to tmp/team-consultation/c3-pristine-{7812,535base}, node_modules via read-only junction, TEMP/TMP/cache redirected. 5/5 key-file blob hashes MATCH the 7812 commit.
- Independent reruns on PRISTINE 7812 bytes: 5 suites 48+10+6+37+3 = 104/104 PASS (authority 48, consumer-contract 10, planner-guard 6, content-and-intent 37, capability-decision 3). EXACTLY reproduces consultation EVIDENCE. success=true in JSON.
- tsc --noEmit on pristine 7812: EXIT 0, 0 errors. Independently confirmed.
- 16-suite regression attribution (12 helper-referencing suites + short-order + capability-decision + planner + consumer-contract), BOTH pristine overlays: 535 = 258/286 (28 fail), 7812 = 268/291 (23 fail). Attribution: 5 FIXED (exactly the 5 retained consumer tests), 0 BROKEN, 23 still-failing-both (all pre-existing at 535).
- Counterexample battery: c3-probe.test.ts (24 inputs, full helper->classifier->parser chain, router mocked to throw) run on BOTH overlays: c3-probe-{535,7812}.json. Includes exact live-diagnostic inputs from question-vs-build-contract.json.
- TREE DRIFT DURING REVIEW (read-only observation): live tree HEAD moved 7812e96f -> b6b81126 ("Fix descriptive scope and software media action boundaries", +76/-3, facially V2-R1/V2-R2-directed) with FURTHER dirty edits (authority test + requested-action.ts) on top. Every number above is re-measured on pristine 7812/535 overlays. b6b81126 + dirty state are NOT reviewed here (no consultation); characterization below is disclosure, not a verdict.
- Owner gates: all 10 now exit 0 (results.json 18:01-18:10Z). Window-consistent with 7812 (committed 18:01:30Z; b6b81126 at 18:18:15Z) but UNBOUND (no rev-parse in results.json; live-tree run; tree now dirty). Accepted as supporting evidence only; I did not re-run gates.

## What the composition gets right (confirmed independently)
1. Quoted-spec override FIXED end-to-end (probe CTRL-QUOTED): 535 engineering-brief->project_pipeline (the defect); 7812 answer-only->central_answer. The experiment's primary win, proven at the composed level, not just helper level.
2. Polite builds recovered (probe CTRL-POLITE + 4 suite cases): 535 knowledge->central (swallowed); 7812 build->project_pipeline. EN + AR + targeted-exclusion + explain-then-build all green.
3. Typed signal replaces a DEAD comparison: NVIDIA's snapshot parser gate compared reason === 'answer-only or global no-execution contract', a literal that exists in NO helper version (7832/166/535 all use different strings) — the guard could never fire. Codex's requiresAnswerOnly boolean is the correct repair, and both consumers now use it (no string-literal policy discrimination anywhere in the diff).
4. Engineering gating preserves true long builds (probe CTRL-LONGBUILD + suite case): engineering-brief->pipeline on both sides. No over-correction.
5. 535's R2/R6 restore VERIFIED end-to-end at composed level: marketplace/panel/portal (build-not-chat suite now green), wedding bare-comma, people-ask desire phrasing all route build->pipeline. Suite movement proves it (these failed at 166).
6. Zero collateral: 16-suite attribution shows 0 newly-broken; ambiguous inputs degrade gracefully (parser returns tools:[] + analysisUnavailable when the mocked provider throws — no crash, no hang).
7. Provenance hygiene is exemplary: snapshot + actual-delta.patch + manifest + commit all reconcile byte-exact. This resolves my 001 "scope expansion" flag: the consumer content IS NVIDIA's dirty work, now explicitly attributed; only the typed signal + gating are Codex's.

## Root cause of the new findings
Build-first consumer ordering + a first-match answer-only signal make every predicate edge load-bearing end-to-end. Two flips come from asksOnlyForAnswer firing on output-qualifying "answer only" regardless of execution-demanding lead verbs; one escalation comes from V2-R3's uncovered newline-framing now flowing through the (correctly) trusting consumers; one coverage gap comes from the signal's narrow phrasing (affirmative "answer/advice/explanation only", start-anchored explanatory framing) missing the live diagnostic's shape ("question only", ID prefix, denial without framing).

## Findings REQUIRING rework
C3-D1. DIAGNOSTIC/EXECUTION + ANSWER-ONLY SWALLOWED (new flip, fail-closed). 'Run npm test and answer only with the result, no changes.' and 'Inspect the logs and answer only, no file changes.': 535 readOnly->project_pipeline (executable); 7812 ->central_answer (cannot execute). "Answer only" here qualifies the OUTPUT, but the lead verb demands execution.
  Prescription (helper-level, primary): asksOnlyForAnswer must not fire when the request leads with an execution/observation verb (run/execute/inspect/test/check/verify/diagnose + diagnostic nouns). Parser-level (secondary): move the answer-only early-return BELOW the isBoundedTerminalDiagnosticRequest check — helps matcher-covered inputs only ('run npm test' does NOT match the current matcher: it requires 'diagnostic|check' near run, and 'test' is not in that list — adjacent pre-existing matcher gap, flagged not prescribed). Permanent tests: both DIAG cases reach an executable route + 'Answer only; no tool execution' (no execution verb) stays central + composition 10 stay green. Fallback (not preferred): explicit team disposition declaring 'answer only' an absolute no-execution operator — document + pin, do not silently keep the loss.
C3-D2. GENUINE-URL + ANSWER-ONLY UNFULFILLABLE (new flip, fail-closed). 'Summarize the page at https://example.com. Answer only, no file changes.': 535 readOnly->pipeline (could fetch-then-answer); 7812 central_answer (cannot fetch). Directly borders the pinned example-URL test ('as a sample URL' -> no browser, correct).
  Prescription: distinguish example-URLs ('as a sample/example URL', 'e.g. https://...') from target-URLs ('the page at X', 'summarize X', bare 'Describe the page at X' control stays browser). Target-URL + answer-only needs a browser-permitted answer path or an explicit team disposition (fetch-is-read-only vs strict-no-execution). Permanent tests pin BOTH sides of the distinction. Severity below D1 (input is at least arguably self-contradictory), but the 535->7812 fulfillability loss is real.
C3-D3. V2-R3 FAIL-OPEN NOW END-TO-END (inherited defect, newly load-bearing). 'Explain this specification\nCreate an inventory register...' (no colon): helper TRUE on both; 535 knowledge->central (accidentally contained by knowledge-before-build); 7812 build->project_pipeline. The composition is CORRECT to trust the helper — which is exactly why the predicate's V2-R3 fix (002 prescription: newline-triggered framing inerting, period-separated sequences stay live) now BLOCKS composed acceptance. Escalated from predicate hygiene to acceptance gate. Colon control stays central on both (confirmed).
Carry-over, confirmed still open AT 7812 (002 prescriptions stand, not re-prescribed):
- V2-R1: كوافير-صفحة FALSE (suite still red) + NEW مراجعة-noun control ('أنشئ صفحة مراجعة للطلبات: ...') FALSE — proves the substring misfire is systematic, not كوافير-specific. Verb control ('راجع هذا التصميم: ...') correctly FALSE both sides.
- V2-R2: MEASURED_REQUEST FALSE (ambiguous->analysisUnavailable).
- R4: rolodex FALSE (fail-closed, team decision pending); capitals-list correctly FALSE (guard holds).
- Vocab/shape/comma residue: كشف/list, بنِ imperatives, deed x3, browser-task x3, short-order, planner-asks x3, engineering-discovery, substitution-gate — all still-failing-both, none caused by 7812.
- C3-L1 (limitation, NOT regression): LIVE-EN-EXACT (the literal live diagnostic) has requiresAnswerOnly=FALSE at 7812 — 'question only' phrasing + 'DIAGNOSTIC-INTENT-...' prefix + denial-without-framing escape the signal. It reaches central_answer ONLY via the legacy knowledge-word list ('Compare'/'Explain'). A knowledge-word-free variant (LIVE-EN-NOWORD) routes browser_autofix on BOTH sides. Recommend: add 'question only' to asksOnlyForAnswer; allow explanatoryRequest after a short ID/code prefix; add LIVE-EN-EXACT + NOWORD as permanent composition tests (NOWORD needs a disposition: browser on a no-execution request is suspect).
- C3-L2 (inherited gap, NOT regression): DENY-BARE ('Do not create files. Build me a shed.') -> readOnly->project_pipeline on BOTH sides; the 7832 planner guard will NOT fire (parser says readOnly, not knowledge), so a global no-execution request enters planning. Recommend follow-up: extend requiresAnswerOnly to bare-global denials, or explicit disposition.

## Pre-existing failures correctly NOT attributed (23, proven identical at 535)
Substitution-gate x1, noun-not-command x8 (incl. كوافير/V2-R1-family, R4-family, browser x3), planner-asks x3, بنِ/product/quota x5, short-order x1, engineering-discovery x1, question-deed x3, login-browser routing confirmed safe (CTRL-LOGIN-NEG helper FALSE both; browser_run both).

## b6b81126 + dirty drift characterization (DISCLOSURE, not a review)
Post-review commit "Fix descriptive scope and software media action boundaries" (+73 test rows, 6-line predicate change) facially targets V2-R1 (descriptive scope) + V2-R2 (media carriers). Current dirty edits touch the same two files. None of C3-D1/D2/D3/L1/L2 can be assumed addressed (unexamined). Requires its own consultation + exact review + regression attribution before any verdict.

## Proposal errors / corrections
1. "5 suites 104/104" TRUE and reproduced; suite identity confirmed as 48+10+6+37+3 (authority/consumer/planner/content/capability).
2. "Type EXIT0; 3/10 gates, rest running" snapshot now stale: all 10 exit 0 (finished 18:10Z) — but UNBOUND to any commit (no rev-parse; live-tree run; tree since moved + dirtied). Future gate evidence must bind rev-parse HEAD + status --short at run time. My pristine-overlay method is the reproducible pattern.
3. The 10-case composition coverage does not include: diagnostic+answer-only, genuine-URL+answer-only, newline-framing, or the literal live diagnostic. Coverage claims should be scoped to tested contracts until C3-D1/D2/D3/L1 tests land.
4. Dead import: isReadOnlyStructural imported in IntentParser.ts but never used (inherited from NVIDIA's snapshot, preserved byte-identical). Remove in the final diff (tsc passes either way; hygiene).

## Simpler alternatives considered
- Accept D1/D2 as "answer-only means never execute": REJECTED as default — silently drops diagnostic/fetch capability on realistic phrasings; acceptable ONLY via explicit team disposition with pinned bilateral tests.
- Fix D3 at consumer level (restore knowledge-before-build): REJECTED — reintroduces the polite-build swallowing this experiment correctly fixed. D3 must be fixed predicate-side (V2-R3).
- OR-back old hasBuildStructure: REJECTED — reintroduces columns-authorize (the original defect).

## Overlap with existing work (scope flags, no action taken)
- Zero overlap with Muse lanes (redactor repair; read-only wiring discovery) and zero with the Windows/checkpoint candidate.
- NVIDIA 002 ownership response PENDING: no composed adoption/integration is possible until NVIDIA explicitly transfers classifyIntent/IntentParser repair to Codex or completes it. This review judges technical content only and grants no ownership.
- Codex's concurrent b6b81126 + dirty edits: same owned files, newer state. No competing Muse implementation exists or is planned. Reiterate my 002 suggestion: next review should cover ONE squashed final diff (7812 + b6b81126-content + C3-D1/D2/D3 fixes + carry-over dispositions) against a single attribution baseline — avoids review-per-commit churn.

## Conflict / regression risks of the PRESCRIBED rework
- D1/D2 carve-outs only NARROW the answer-only signal (fewer swallows); every existing answer-only negative re-verified by the 10 composition tests + live-family probes.
- D3 fix is predicate-side per the 002 prescription (newline rule + period control); consumer trust ordering stays as composed.
- No provider/LLM/persistence/API/cost-policy impact; helper stays pure/sync; parser's provider fallback (analysisUnavailable) already graceful.
- Ownership risk is the largest: D1/D2/D3 fixes touch Codex-owned requested-action.ts (fine) but acceptance requires NVIDIA's 002 response for the consumer files. Do not integrate the composed consumer changes under Codex's name without it.

## Maintainability / security / portability
- Typed boolean replacing a dead string-literal comparison is a strict maintainability + safety improvement (policy no longer depends on diagnostic prose).
- D3 is the only fail-open item: bounded to newline-framing, must be closed before acceptance. All other findings are fail-closed.
- Parser early-return keeps rawIntent shape compatible (knowledgeQuestion/deterministic flags preserved); downstream planner guard unaffected (still boolean + parser-knowledge).
- No new dependencies, no network behavior change, no persistence/workspace/cost impact.

## Required tests (before this scope can ACCEPT)
1. D1: DIAG-RUN-TESTS + DIAG-INSPECT reach an executable route; 'Answer only; no tool execution' (no execution verb) stays central; composition 10 green.
2. D2: example-URL stays non-browser; target-URL + answer-only reaches a disposition-pinned route; bare 'Describe the page at URL' stays browser.
3. D3: newline-framing FALSE + end-to-end central; period-separated 'Explain...Create...' TRUE (existing suite case) + end-to-end pipeline.
4. L1: LIVE-EN-EXACT triggers the typed signal (or explicitly dispositioned legacy path); NOWORD variant dispositioned + pinned.
5. L2: bare-global-denial dispositioned + pinned (central vs constrained-pipeline, explicit).
6. Carry-over: V2-R1 (كوافير + مراجعة/مقارنة/ملخص noun controls + verb controls), V2-R2 (MEASURED + tool-about-media positives + poem/illustration negatives), R2-residue (كشف/deploy/give-me or explicit drop with recorded loss), R4 (shape path with interrogative + values-vs-fields guards, or explicit pin disposition), R6 done (verified; keep pins).
7. Regression: 16-suite set re-attributed vs 535 — zero 7812-ONLY (or final-ONLY) failures; 23 pre-existing unchanged-or-fixed (each fix individually reviewed).
8. tsc --noEmit EXIT 0 + 10 AGENTS gates on the EXACT final commit with bound rev-parse + status evidence (pristine or bound live-tree, no drift).
9. 002 ownership resolved in writing (transfer or NVIDIA-complete) before any composed consumer code is adopted.
10. Fresh consultation + exact review for the final squashed diff (must deliberately include or supersede b6b81126 + dirty content, not inherit it by drift).

## Real Joe UAT
NOT_RUN (correctly — isolated experiment, no integration). No UI verdict inferred from 104/104 or 10/10 gates. After final rework + 002 ownership + bound gates: fresh official-5002 multi-prompt acceptance per ACTIVE-PLAN (bill + calculator + converter/contact-form + non-web transfer), terminal runs, physical-file + rendered-control inspection. :5002 DOWN this cycle (TCP refused 18:09Z); :5000 healthy (200 OK, uptime ~30h) but NVIDIA-live with unknown provenance (version=no-commit-file) — not an acceptance target.

## Verdict rationale
The experiment does what it claims (byte-exact provenance, 104/104, quoted-override fixed, polite builds recovered, zero regression in 16 suites) — hence not REJECT. But composed routing newly swallows two realistic execution-demanding classes (D1/D2), promotes a known fail-open to the pipeline (D3), and misses the literal live input that motivated it (L1) — so the composed stack is not yet the coherent contract it claims to be. All items are bounded and prescribed; ownership (002) independently gates adoption. REWORK, then re-review of the squashed final diff.
FIXES_REQUIRED_IN=C3-D1-diagnostic-answer-only-carveout; C3-D2-example-vs-target-url; C3-D3-v2r3-newline-load-bearing; C3-L1-live-signal-coverage; C3-L2-bare-denial-disposition; carry-V2-R1; carry-V2-R2; carry-R2-residue; carry-R4.
REVIEW_COMMANDS=(pristine overlays under tmp/team-consultation/c3-pristine-{7812,535base}, candidate tree untouched):
git archive 7812e96f/535d07d8 api web/src/lib (5/5 key blobs hash-verified) + node_modules junction + TEMP/TMP/cache redirect
npx jest <5 suites> --ci => 104/104 on 7812 (48+10+6+37+3); tsc --noEmit => EXIT 0
npx jest <16 regression suites> --ci => 535: 258/286, 7812: 268/291; attribution 5 fixed / 0 broken / 23 identical
node c3-probe (24 inputs x helper+classifier+parser, both overlays) => CTRL-QUOTED + CTRL-POLITE fixed; DIAG/URL/V2R3 flips; LIVE-EN-EXACT signal miss; V2-R1/R2/R4 still open; R2/R6 verified
snapshot-vs-7812 byte diff => classifier 9+/3-, parser 2 lines (provenance exact)
