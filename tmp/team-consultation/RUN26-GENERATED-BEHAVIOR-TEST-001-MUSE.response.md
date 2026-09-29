# Muse consultation response — RUN26-GENERATED-BEHAVIOR-TEST-001
AGENT=MUSE
CONSULTATION_ID=RUN26-GENERATED-BEHAVIOR-TEST-001
PROPOSAL=D:\Joe\coordination\team\proposals\RUN26-GENERATED-BEHAVIOR-TEST-001.md
EVIDENCE=D:\Joe\coordination\team\verification\CODEX-RUN26-CALCULATOR-MUTATION-20260929.md
RUN26_UAT=D:\Joe\coordination\team\verification\CODEX-RUN26-TIP-CALCULATOR-REAL-UI-20260929.md
MUSE_HEAD=985b8b57
TRACKED_TREE=CLEAN (no uncommitted tracked changes at inspection; git status shows ?? untracked only)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/; nothing deleted)
UPDATED=2026-09-29 (this cycle; independent source inspection + tsx probes on Muse HEAD)
SHARED_FILE_WRITE=ACCESS_DENIED (standing sandbox state per prior cycles; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES

## POSITION (Muse's own, from independent source inspection this cycle)

RECOMMENDATION=APPROVE_WITH_CHANGES

### 0. What I verified myself

- Root-cause boundary CONFIRMED on Muse HEAD 985b8b57:
  react-app-templates.ts:3769 `if (!fields.length && !shipped && !wanted)
  return scaffold;` inside fileAppSmokeTest (:3741). The branch is
  engine-independent: my tsx probe returned the identical 791-byte
  scaffold-only suite for both the no-arg shape and
  `{fields: [], seedCount: 0, engine: 'calculator'}` — one test name
  ("generated React app scaffold is complete and testable"), zero
  behavior assertions, no component-logic import. This matches the
  RUN26 generated test (scaffold/files/scripts/root/createRoot only)
  exactly.
- All executable-behavior blocks in the generator are gated on
  `engine === 'records'`: wireBlock (:3802), executedBlock (:3816),
  shellBlock (:3843). Consequence: EVERY non-records engine
  (calculator, shop, ledger, finance, weather, chat, social,
  productivity, map, custom) with no schema fields/seeds emits the
  scaffold-only suite. The gap is broader than calculator; calculator
  is just the first observed instance.
- No structured acceptance/test-example channel reaches the
  generator. AppBuildOptions (:~60-114) carries raw `sourceRequest`
  plus derived primitives (seedRows, wantedSeedCount, brand, storeKey,
  ...). Every request-derived expectation in the template comes from
  free-text readers (countHeAskedFor, thePagesHeNamed,
  heAskedForATable, currencyHeNamed). So the proposal's investigation
  question is answered: the planning/acceptance contract CANNOT
  currently carry a request-grounded calculation example to a
  generated executable test. A new typed channel or a new reader is
  required; it does not exist today.
- Reader-precision precedent is GOOD: my probe of countHeAskedFor on
  the exact RUN26 prompt returned undefined (no misfire) for all five
  probed entities (item/tip/calculation/row/supply) despite the
  100/15/115 numbers in the sentence. A new example-reader is feasible
  but must meet this same bar with negative controls.
- Stock calculator keeps its logic module-private:
  fileCalculatorAppJsx (:2980) defines `calculate`/`formatNumber` as
  unexported consts inside the emitted JSX. A `node --test` suite
  cannot import and execute them without a template change. Worse,
  RUN26's tip calculator was model-authored (Tip Calculator retry),
  so no stable import surface exists at all for that artifact.
- Side observation (not a challenge to the root cause):
  blueprintFor(RUN26_PROMPT) on Muse HEAD returns engine=records
  with 5 generic fallback fields, NOT calculator. The classifier alone
  does not reproduce RUN26's pipeline route; the calculator engine
  choice came from downstream pipeline/model planning. The
  generator-side boundary above is confirmed necessary; the pipeline
  route that yields calculator-with-no-schema is a second fact worth
  one focused trace during implementation, not a reason to doubt the
  scaffold-branch finding.

### 1. Root cause: AGREE, with the widened scope above

- Codex's "fileAppSmokeTest returns scaffold-only when no schema
  fields/seeds" is correct and I reproduce it from source plus
  execution. The generated-suite-green-for-wrong-85 behavior follows
  necessarily: the suite never imports the behavior.
- Add to the record: the records-engine hardening
  (68d50c98/39e6edec: wanted-count assertion, first-visit execution,
  wiring pins) deliberately scoped itself to records and left every
  other engine on the scaffold branch. This proposal is the correct
  next general step, not a contradiction of that work.

### 2. Proposed general contract: AGREE with three changes

- AGREE: when he explicitly asks for a test of requested behavior,
  generated npm test must execute an observable assertion against the
  generated behavior, or the build must report that the requested test
  could not be created/verified and stop honestly. A green scaffold
  suite must never masquerade as behavior proof. This continues the
  "CONTENT IS NOT DELIVERY" principle already in the file header.
- CHANGE 1 — smallest safe first slice is engine-level, not
  request-parsing: (a) stock template engines export their pure logic
  to an importable module (same pattern as store.js/content.js);
  (b) the generated suite imports and EXECUTES engine behavior
  assertions; (c) model-authored/custom components with no derivable
  assertion get explicit unsupported status, not vacuous green. This
  slice needs no new request parsing, applies to more than one engine
  (calculator + finance totals at minimum), and directly answers the
  mutation evidence.
- CHANGE 2 — request-derived examples (100/15 -> 115) go through a
  small TYPED optional channel (e.g. behaviorExamples on the schema
  expectation), not a second free-text reader as the primary path. A
  free-text arithmetic-example reader is higher-risk than
  countHeAskedFor (numbers appear in unrelated roles: quantities,
  years, percents, IDs) and needs its own adversarial suite before
  acceptance. If the typed channel has no producer in planning yet,
  say so explicitly and ship CHANGE 1 + honest unsupported status
  first; do not block the scaffold-masquerade fix on planner work.
- CHANGE 3 — keep the acceptance-judge timeout OUT of scope. RUN26's
  0/1 phases (model judge could not rule, rerun failed) is the
  provider/acceptance defect already tracked via RUN25-CANCELLABLE
  (my APPROVE_WITH_CHANGES there stands). The generated-test fix must
  be verifiable independently of the judge: RED-under-mutation plus
  same-request rerun must pass/fail on their own evidence.

### 3. Can a behavior test be safely derived from existing request/acceptance data?

- From EXISTING data (raw sourceRequest + blueprint fields): only via
  a new structured example-reader with strict precision controls, or
  via engine-level executable contracts that need no request parsing.
  I recommend the engine-level contract first (CHANGE 1), the typed
  examples channel second (CHANGE 2), and a free-text example-reader
  only with adversarial controls (numbers-in-other-roles negatives,
  cross-domain positives, no 100/15 hardcoding anywhere in the
  template).
- Explicitly REJECT hardcoding 100/15 or tip arithmetic into the
  generic template, and reject model-authored test files as the
  behavior proof (the generator must emit the assertions; model text
  is the artifact under test, not the oracle).

### 4. Ownership and overlap

- Muse ACCEPTS the PROPOSED implementation candidacy for the bounded
  generator slice (react-app-templates.ts + generated-suite tests),
  conditional on a formal decision with explicit owner/reviewer like
  C10: NO_IMPLEMENTATION_AUTHORIZED by this review alone.
- Overlap: NONE with NVIDIA's active dirty files (IntentParser,
  context-engine, long-term-memory, PlanningEngine, plan-tools,
  ProjectPipelineTool, registry + untracked
  specification/SpecificationVerificationTool/eval drafts). NVIDIA's
  proposed provider/acceptance review role is correct for the judge
  side. Codex as independent reviewer fits the mutation evidence.
- Constraint: Muse's CLI-BATCH1 independent-reviewer duty stands;
  generator work must not touch CLI routing/build-intent files while
  that batch is NVIDIA-owned. The RUN26 slice as scoped does not.
- Do NOT begin implementation until the decision names one owner;
  Muse will not create a competing generator edit from this review.

### 5. Risks and non-goals (agree + two additions)

- Agree with the proposal's risks (ToolService/workspace policy,
  no fabricated model-authored cases, free_only, one-attempt
  self-fix, isolation, no merge/production claims before proof).
- ADD: generated suites run via node --test in the workspace; keep
  emitted assertions dependency-free and side-effect-free (the
  records first-visit block's in-memory storage isolation is the
  pattern to reuse, not real localStorage/network).
- ADD: the honest-unsupported status must be machine-readable
  (named test + exit contract), not a console line, or the pipeline
  cannot distinguish "behavior proven" from "behavior untestable".

### 6. Tests and UAT I require before ACCEPT

- Focused RED/GREEN: generated suite RED under wrong-formula
  mutation (the exact bill-tip-minus mutant), RED when the engine
  logic module is removed, GREEN on the correct artifact.
- Different-domain control: second engine (finance or records
  regression) proving the contract is not a calculator special-case.
- Unsupported-case fail-closed control: model-authored custom app
  with no derivable example yields explicit unsupported status, never
  vacuous green.
- Generated npm test executed for real (not source-token assertion
  alone); tsc/build; architecture + package-scripts gates; no
  weakened gates.
- Same-request Real Joe UI rerun: 100/15 shows 115 in the preview
  AND the generated suite turns RED under the wrong-formula mutant.
  Then one unseen request for generalization. No product PASS and no
  integration claim until then.

## Evidence paths and commands (this cycle, Muse HEAD 985b8b57)

- Source: api/src/modules/tools/definitions/react-app-templates.ts
  :3741-3769 (scaffold branch), :3802/:3816/:3843 (records-only
  gates), :2980-2998 (private calculate/formatNumber), :4730-4735
  (caller passes fields/seedCount/wantedSeedCount/engine),
  :60-114 (AppBuildOptions: sourceRequest in, no examples channel).
- Precedent: api/src/modules/tools/definitions/ReactProjectTool.ts
  :85-93 wantedSeedCountFor (request-derived expectation with
  fail-open guard); api/src/__tests__/
  generated-smoke-test-is-grounded.test.ts,
  generated-suite-proves-first-visit.test.ts (established RED/GREEN
  pattern for this generator).
- Probes (throwaway, outside the repo; rerunnable on request):
  runtime-temp joe-probe/run26-probe.mts (scaffold-branch output
  identity for no-arg + calculator-empty shapes; blueprintFor side
  observation) and joe-probe/count-reader-probe.mts
  (countHeAskedFor undefined x5 on RUN26 numbers). tsx with
  JOE_TEST_MODE=true OFFLINE_MODE=true, TEMP redirected to the
  writable runtime-temp root (system TEMP denied to this sandbox
  user). No network, no provider, no secrets, no repo writes.
- Coordination/team reads: proposal + both RUN26 verification notes
  above; ACTIVE-PLAN/RUN26_TEST_NEXT (owner/reviewer before
  overlapping react-app-templates.ts edits — obeyed: review only,
  no source edit); NVIDIA dirty-file list inspected read-only
  (no template overlap).

## Risks if this review is misused

- Treating this APPROVE_WITH_CHANGES as implementation ACCEPT or as
  authorization to edit the generator without a decision. It is
  neither.
- Implementing only the tip-calculator parse and calling the general
  contract done. The mutation control + different-domain control in
  section 6 exist to prevent that.
- Bundling the acceptance-judge timeout fix into the generator slice
  and rating the generator by judge verdicts. Keep the two verdicts
  separate.
