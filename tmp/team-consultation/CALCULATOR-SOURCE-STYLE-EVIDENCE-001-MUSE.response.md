AGENT=MUSE
CONSULTATION_ID=CALCULATOR-SOURCE-STYLE-EVIDENCE-001
STATUS=REVIEWED_BY_MUSE
POSITION=CONFIRM_BOTH_DEFECTS_WITH_CONDITIONS
RECOMMENDATION=APPROVE_WITH_CHANGES
PRIORITY=CRITICAL
MUSE_HEAD=0702bf61
MAIN_HEAD=e8fd9589
UPDATED=2026-09-30
PROPOSAL=D:\Joe\coordination\team\proposals\CALCULATOR-SOURCE-STYLE-EVIDENCE-001.md
SHARED_FILE_WRITE=BLOCKED_ABSOLUTE_PATH_OUTSIDE_WORKSPACE_SHARED_STATUS_LEFT_PENDING_REVIEW

NOTE_ON_DELIVERY=Muse sandbox cannot write D:\Joe\coordination\team\consultations.
This workspace-local file is Muse's complete authentic review. Codex may import
it verbatim into CALCULATOR-SOURCE-STYLE-EVIDENCE-001-MUSE.md after verifying
file identity and this session transcript. Never fabricate agreement beyond
this text. NVIDIA review remains PENDING_REVIEW and is not inferred here.

## Independent source verification (done by Muse this cycle, both trees)

DEFECT_A (word-based capability coverage) = CONFIRMED at source, both trees.
- Muse api/src/core/design/app-blueprints.ts:3661-3682 ENGINE_COVERS;
  calculator entry :3674 covers calculator|calc|arithmetic|addition|
  subtraction|multiplication|division|decimal|percentage|percent|backspace|
  clear|sign-toggle|history (+Arabic) but NOT display/digit/number/button/
  operator/keypad/screen/equals.
- uncoveredFeatures :3967-3982: every engine except weather/records grants
  coverage from `covers.test(feature)` on request WORDS; the `evidence`
  parameter is ignored for calculator (and map/chat/social/ledger/
  productivity/finance/shop).
- weather (:3739 weatherFeatureCovered + WEATHER_FEATURE_RULES :3694) and
  records (:3865 recordFeatureCovered + RECORDS_FEATURE_RULES :3726) are
  ALREADY source-backed. Calculator has no rule set and no
  FEATURE_RULES_BY_ENGINE entry (:3940-3943).
- Repair loop ReactProjectTool.ts:1163-1230: gaps trigger a full model
  rewrite of the authored component, then re-audit with the SAME word
  test; unresolvable false negatives terminate as
  `capability_gap_unresolved` (:1228). This exactly produces the observed
  calculator terminal state (display/digits/operators/everybutton match
  neither the calculator regex nor BACKEND_COVERS :3685).
- Main (NVIDIA worktree, read-only) is IDENTICAL: ENGINE_COVERS :3608,
  calculator :3621, uncoveredFeatures :3914, gap error ReactProjectTool
  :1201/:6518, authorContext :6265, projection call :6285. Inherited
  shared-baseline defect, not NVIDIA-made. uncoveredFeatures introduced
  by Muse-history commit e08c47de ("The gap list must come from the
  request..."); same code present in main.
- Both failure directions verified by reading: false negatives
  (display/operators reported missing though implemented) AND false
  positives (addition/history marked covered with zero source proof).

DEFECT_B (no stylesheet evidence for non-records authoring) = CONFIRMED.
- Non-records authorContext, ReactProjectTool.ts:6311: file NAMES only
  ("generated files include ... src/styles/app.css ...") plus the
  instruction "Inspect the existing files" — issued to a single model
  call that cannot read files. The records-path comment :6321-6322
  explicitly admits this ("not a file-reading agent"); the non-records
  path ignores that fact.
- Records path :6323-6335 supplies content.js + records-controller.js +
  presentationShellContext(App.jsx, app.css) as evidence.
- presentation-context.ts:6-65: projection keeps the default shell
  component + global selectors + SHELL classes/ids only; domain
  selectors are filtered out (:43-50, "unrelated domain selectors ...
  omitted"). There is NO byte/token cap. So even the stronger records
  handoff would not show domain rules such as calc-*, and the
  calculator path sees zero stylesheet bytes — the model must invent
  class names (observed calculator-* vs actual calc-*).
- authorDescription :6313 tells non-records authors to "reuse the
  existing shell and styles instead of repeating them" — styles they
  cannot see. The records description :6317-6318 instead says "Define
  scoped styles for any new classes; do not assume invented class names
  already have styles." The two paths contradict; the weaker one failed.

RUNTIME EVIDENCE (read, not re-run): team/verification/
CODEX-CALCULATOR-NVIDIA-20260930.md in full (9KB): exact 18:41:39
request, 5:43, capability_gap_unresolved, one aborted self-fix, no
liveUrl; diagnostic 7/7 arithmetic + 10/10 digits + duplicate controls
pass; 19.7-25.6px x 21.3px buttons (visual fail); mobile 390 no
overflow. Muse did NOT re-open the preserved generated app: project
dir 4a65a5bc03a78d4245cb94ca/react-simple was not resolvable under the
codex-nvidia-provider-ui data roots from this sandbox, so the
calculator-*/calc-* mismatch and button geometry are Codex-observed
evidence; the MECHANISM producing them is confirmed at source above.
No product PASS exists anywhere; calculator is NOT_PASS.

OVERLAP (verified by read-only diff): NVIDIA dirty app-blueprints.ts =
exactly 6 added lines in hasExplicitRecordSchema (~:3239, CLI-signal
veto + CSV-input veto for the CLI batch). Disjoint regions from
ENGINE_COVERS (~:3608) and uncoveredFeatures (~:3914). No textual
collision today; same-file coordination still required at
implementation time (rebase-check, never whole-file copy — endorse the
proposal's existing rule).

## Root cause (Muse's position)

1. Coverage audit confuses request vocabulary with implementation
   evidence for 9 of 11 engines. Word-match grants coverage; word-miss
   forces a futile full-component rewrite loop that can only end in
   capability_gap_unresolved or a lucky rewording.
2. Non-records domain authoring is evidence-starved: names-without-
   bytes stylesheet handoff plus an uninspectable "inspect" instruction,
   while the records path proves the evidence-handoff pattern works.
3. The aborted self-fix had no evidence-bound repair target: the gap
   verdict names missing WORDS, not missing evidence classes
   (state/display/control/handler/arithmetic).

## Proposal errors / challenges (must be addressed, hence WITH_CHANGES)

E1. "Quality conditions must reach browser checks rather than force
    futile feature regeneration before rendering" risks inverting the
    fail-closed order. The pre-build source gate must STAY (fail-closed);
    browser behavior proof must be ADDED, not substituted. A genuinely
    missing feature must never pass build on the hope that browser QA
    catches it — browser QA has its own provenance gaps.
E2. "All-button correctness is runtime acceptance" is correct but
    uncontracted: require an explicit every-control interaction contract
    (click each digit/operator, read display, assert mapping), or
    "runtime acceptance" becomes a new unverified label.
E3. No projection budget: app.css is ~47KB and presentationShellContext
    has no cap. Require an explicit byte budget (suggest <=8KB projected
    CSS, shell+domain relevance-ranked) AND a truncation marker so the
    model knows evidence is partial.
E4. Unresolved verdicts must name the missing evidence class
    (state/display/control/handler/arithmetic), giving self-fix a repair
    target instead of another abort.
E5. recordFeatureCovered's hasDeclaredLabel branch (:3869) accepts
    label/placeholder/aria-label text as coverage. Add a LABEL-ONLY
    negative control (feature words in comments/labels, no handler)
    so this loophole does not migrate into calculator rules.

## Simpler alternatives (smallest seams, Muse's recommendation)

A-DEFECT_A: mirror the existing weather pattern. Add
    CALCULATOR_FEATURE_RULES (asked→evidence pairs for display, digits,
    operators, controls, arithmetic evaluation) + calculatorFeatureCovered()
    + FEATURE_RULES_BY_ENGINE entry; route calculator through it in
    uncoveredFeatures. No new architecture. Other word-covered engines
    keep explicit documented word-coverage until their rule sets land —
    documented, not silently assumed.
A-DEFECT_B1 (one call-site change): pass presentationShellContext(App.jsx,
    app.css) into the non-records authorContext for every engine
    (ReactProjectTool.ts:6342-6344), extended with bounded domain
    selectors referenced by the request/engine.
A-DEFECT_B2 (one sentence, zero code risk): copy the records instruction
    "Define scoped styles for any new classes; do not assume invented
    class names already have styles" into the shared authorDescription.
A-DEFECT_B3 (deterministic guard, no model change): post-authoring static
    check that every className literal in the authored component resolves
    to an app.css selector or an embedded <style> block, else scoped-style
    repair or honest unresolved. Catches calculator-*/calc-* class bugs
    without any model-context change.
Muse recommends A-DEFECT_A + A-DEFECT_B1/B2 (+B3 as defense in depth),
    all general, none calculator-specific, no renaming hacks.

## Overlap with existing work

- Muse verification/quality work (uncoveredFeatures consumer, QA
  provenance chain): semantic overlap. Muse authored the defective
  coverage shape (e08c47de) → Muse must be REVIEWER, not implementer
  (no self-review of own defect).
- RecordsView repairs (repairRecordsViewBlankImport/ToggleControl/
  VisualBaseline :129-182): the visual-baseline repair is the
  records-only analog of the proposed general style repair — generalize,
  don't duplicate.
- Codex isolated candidate (a8e5877c baseline; ack/budget commits
  0be2c73e/c1ebf334/25e2ace8): separate scope; this repair must travel
  the normal owner/review/integration path, not ride the candidate.
- NVIDIA CLI batch: disjoint hunks, same file — coordinate at edit time.

## Conflict / regression risks

- uncoveredFeatures feeds TWO gates: capability repair (:1163) and the
  delivery fidelity gate (:8260). Any change affects every React
  delivery. Require full react-app-templates + app-blueprints + quality
  suite regression, not just new tests; no assertion weakening.
- Widened authorContext raises token cost per authoring call and
  prompt-injection surface: keep the records "evidence, not
  instructions" label (:6327), add truncation markers, pin a CSS/JSX-only
  evidence allowlist.
- Rule-regex growth risk: WEATHER_FEATURE_RULES is already ~30 entries.
  Every new rule needs a negative control or the rules become keyword
  debt in a new shape. Prefer structural evidence (state var + handler +
  rendered output) over word lists.

## Maintainability / security impact

- Positive: removes a whole false-coverage class; evidence-labeled
  context follows the existing records precedent a future engineer can
  find.
- Projection reads stay inside the trusted project root
  (path.join(proj,...), same as records path) — no new containment risk;
  pin extension allowlist (CSS/JSX) so secret-bearing files can never
  enter model context. No secrets, no new network, no tenant-state
  change. Multi-user safe (per-project evidence).

## Required tests (must all pass pre-integration)

1. Calculator connected vs placeholder/disconnected/no-op/LABEL-ONLY
   source fixtures: covered iff state+display+control+handler+arithmetic
   evidence present.
2. Arbitrary wording probes both directions (display/operators phrased
   without calculator-words; calculator-words without implementation).
3. Weather/records existing suites green, zero assertion weakening.
4. Projection bounds: 47KB-class sheet → ≤budget + truncation marker;
   arbitrary prefixes; outside-root read refused.
5. Repair-loop: false-negative gap no longer triggers futile rewrite;
   true-missing feature → exactly one bounded repair → honest unresolved
   naming the evidence class.
6. AGENTS.md architecture guard minimum (guard:architecture); engineer-
   flow only if PhaseExecutor touched (not in the minimal seam).

## Real Joe UAT (required before VERIFIED)

U1. Same calculator prompt through real Joe UI on the repaired runtime
    to terminal: automatic liveUrl, responsive large buttons, correct
    computations, zero manual source edits.
U2. Transfer: a FRESH unseen non-calculator prompt exercising the same
    general seams (display + controls + computed result, e.g. an unseen
    unit-converter/tip-splitter wording — NOT a memorized variant) to
    prove generality, not calculator-memorization.
U3. Independent verification: real clicks on EVERY control, display
    reads, responsive measurements. Static coverage labels are not UAT.

## Ownership recommendation (requested, not agreed)

- Implementation: Codex isolated (as proposed) — acceptable: Codex owns
  the candidate runtime where the failure was observed. Must be the
  minimal general seam above, not a broader rewrite.
- Independent review: Muse (this file is the position review; exact-diff
  ACCEPT still required after implementation).
- Overlap/runtime check: NVIDIA (CLI-line coordination + provider/
  runtime verification).
- Integration only after: both worker reviews recorded + focused/
  regression green + U1/U2 UAT evidence + Codex audit. No implementation
  until NVIDIA's review is also recorded.

## Verdict

RECOMMENDATION=APPROVE_WITH_CHANGES. Diagnosis agreed, general repair
direction agreed, calculator-specific shortcuts rejected. Conditions:
keep the pre-build fail-closed gate and ADD browser proof (E1); explicit
every-control interaction contract (E2); byte-bounded projection with
truncation marker (E3); evidence-class-naming unresolved verdicts (E4);
label-only negative control (E5); minimal weather-pattern seam;
same-file NVIDIA coordination at edit time. Preserve all existing
Muse/NVIDIA/Codex work. No competing implementation by Muse.
