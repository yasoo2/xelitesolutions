# Muse consultation response — REQUESTED-ACTION-CANDIDATE-001
AGENT=MUSE
CONSULTATION_ID=REQUESTED-ACTION-CANDIDATE-001-MUSE
MUSE_HEAD=2c480ed3 (review cycle; no Muse source edits for this scope)
MUSE_BRANCH=muse/joe-development
CANDIDATE_ROOT=C:/Users/home/.codex/worktrees/requested-action-contract/xelitesolutions
CANDIDATE_COMMIT=7832da833833cea708144e3f5aacc1a2088830aa
CANDIDATE_BASELINE=e8fd9589dcee5a5fb41f3fc31873b0a8d1f6838a
SHARED_FILE_WRITE=DENIED (expected: absolute path outside workspace; shared file left PENDING_REVIEW for Codex verbatim import; no STATUS change claimed)
STATUS=REVIEWED_BY_MUSE
POSITION=Owned direction CORRECT and fix demonstrated (22/22 + 6/6 independently reproduced; columns no longer authorize builds). But exact-source review finds 1 NEW false authorization (login request classified as build), 5 pure coverage regressions, and 6 contradicted columns-pins needing an explicit team decision, plus a denial-scope asymmetry Codex's own transfer probe already exposes (3/10). REWORK with bounded prescription below; not rejection.
RECOMMENDATION=REWORK
UPDATED=2026-10-01 (independent exact-source inspection + independent test execution this cycle; no candidate/Network/provider writes; candidate tree untouched by reviewer)

## Review basis (exactness)
- Manifest hashes: all 6/6 files MATCH current candidate bytes (Get-FileHash SHA256, this cycle).
- Commit 7832da83 verified: 6 files only (requested-action.ts new; intent-classifier.ts delegation; PlanningEngine.ts guard + import; 3 test files).
- Independent reruns (candidate tree, cache redirected to reviewer workspace, NO candidate writes):
  - requested-action-authority.test.ts: PASS (22/22)
  - requested-answer-planner.test.ts: PASS (6/6)
  - requested-action-consumer-contract.test.ts: FAIL 5/5 (as designed; retained NVIDIA scope)
  - Totals: 28 passed / 5 failed / 33 — EXACTLY matching consultation ACTUAL_TESTS.
- Regression set (12 intent-adjacent suites, same method): 7 PASS, 5 FAIL, 232 passed / 21 failed / 253.
- Old-vs-new attribution probe (bytes-exact baseline classifier via git show in node, real
  app-blueprints/promptNormalizer from candidate tree which are byte-identical to baseline):
  tmp/team-consultation/old-vs-new-lookslikebuild-20261001.cjs + .json (27 inputs).
- Adversarial probe (22 extra transfer cases): requested-action-adversarial-20261001.cjs + .json.
- WIP DRIFT OBSERVED (read-only): candidate tree gained UNCOMMITTED changes during review
  (intent-classifier.ts 20:04, IntentParser.ts 20:07 local; my jest evidence ran 19:50-19:53 on the
  pristine commit; my A/B "new" side is commit-valid because the dirty classifier hunk touches
  ONLY classifyIntent ordering). Dirty content: build-first reorder in classifyIntent +
  answer-only early-return in IntentParser + removed isBuildRequest/isBrowserRequest imports
  (mid-refactor, type-broken: 3x TS2304). This WIP is OUTSIDE the reviewed commit and expands
  into NVIDIA-retained files (classifyIntent, IntentParser) — see Overlap. My tsc run (3 errors)
  measures the DIRTY tree, not the commit; the commit itself is type-clean by elimination
  (dirty run shows ONLY the 3 WIP-import errors; WIP hunks are type-neutral except the import
  removal). Codex's recorded EXIT0 stands UNREFUTED for the commit.

## What the candidate gets right (confirmed independently)
1. Columns/fields no longer authorize construction at the isBuildRequest layer. Control case
   'Explain the meaning of a contact register with columns...' (answer-only): OLD=true via
   'derivedColumns found 3 columns', NEW=false. The exact defect class is repaired.
2. Quoted imperatives stay inert (code-fence + double/Arabic-quote stripping before verb scan).
3. Per-clause affirmation preserves targeted exclusions ('Build a calculator. Do not create a
   database...' stays build) and explain-then-build ('..., then create...' builds).
4. Planner guard is correctly layered: fires ONLY when parser already said knowledgeQuestion AND
   no requested action; polite builds misclassified as knowledge fall THROUGH to retained
   planning instead of being swallowed. Live value against the proven downstream override
   (parser answer-only -> planner project_pipeline).
5. No regressions in 7/12 adjacent suites (incl. content-and-intent, plan-tools,
   intent-capability-decision, capability-decision-answer).
6. Evidence honesty: Codex's own transfer probe (3/10) and the 5 retained FAILs are reported,
   not hidden; my reruns reproduce every claimed number.

## Root cause of the regressions
hasBuildStructure was REPLACED (not extended) by a narrower predicate: clause-initial verbs only
+ a smaller artifact-noun list + zero columns/shape path. Everything the old vocabulary covered
beyond the new lists silently flipped to non-build, and looksLikeBuild (= isBuildRequest) feeds
~10 planner call sites plus IntentParser.quickIntent, so the flip propagates.

## Findings REQUIRING rework (owned scope: predicate + hasBuildStructure + authority tests)
R1. FALSE AUTHORIZATION (safety-class, fail-OPEN): 'سجّل دخولي بالإيميل' (log me in with email)
    -> NEW=true ('affirmative requested action'), OLD=false. Cause: verb سجل and artifact سجل
    match the SAME word. A login request must never classify as construction.
    Prescription: verb and artifact must be DIFFERENT spans (e.g. remove the matched verb span
    once, then test artifact on the remainder). Keeps 'بدي سجل لرعاية الإبل' TRUE (verb بدي,
    artifact سجل later) while fixing the login case. Add both as permanent tests.
R2. Dropped container nouns (5 pure regressions, old TRUE via desire+container, no columns):
    platform (HIS brief), marketplace, panel, portal; desire verb محتاج.
    Prescription: restore the old CONTAINER noun set (platform/marketplace/storefront/panel/
    console/admin/portal/blog/list/board/workspace/library/directory/manager/log/desk/menu +
    بوابة/خدمة/كشف) and old desire verbs after folding (ارغب/ابغي/محتاج/اصنع/اصمم/اطور/ابرمج/
    اقم + give-me phrasing + deploy verb). Verb-anchoring keeps negatives safe; re-verify every
    negative control after restoring. Explicitly DO NOT restore احب (I-like + container was a
    false-auth in old code).
R3. Denial-scope asymmetry (global denial vs per-clause affirmation): 'Do not create files' is
    MISSED (bare 'files' not in the it/this/either/these list) while 'No modifications to
    existing files' KILLS a later legitimate build (global match). Codex transfer probe proves
    both directions (global-prohibit got TRUE, scoped-nomod got FALSE).
    Prescription: bare-object denials ('files', 'any files') are GLOBAL; qualified-object
    denials ('existing files', 'a database', 'the API') are scoped to their clause. This keeps
    the authority suite green (its exclusions are all qualified) and fixes both transfer cases.
R4. Ask + described-contents SHAPE path missing (6 contradicted pins): دفتر-family/rolodex cases
    (ask verb + contents list + unknown noun) fail because the ONLY old path was columns.
    These pins encode an owner-demanded feature ('he has described a table whatever he calls
    it'), and the bill defect does NOT contradict them (bill HAS ask+page-artifact and builds
    via verb+artifact; its defect is schema-layer, NVIDIA scope). Deleting the feature to fix
    the defect is over-rotation.
    Prescription: add shape path AFTER denied-check and quote-stripping: clause-initial ask
    verb (same verb lists) + 2+ derivedColumns in the SAME clause -> build. This reuses (not
    deletes) the derivedColumns import. Required guards: (a) strip single-quoted spans too
    (current code strips only double/Arabic quotes); (b) exclude interrogative-led clauses
    (trailing ? / what/which/who/how-led) so 'I want a list of capitals: Paris, Rome, Madrid'
    stays non-build; document the residual values-vs-fields ambiguity as a known limitation.
R5. Framing-verb inerting (unquoted embedded imperatives): 'Explain this specification:\nCreate
    an inventory register...' -> NEW=true (newline exposes the imperative). Same verdict as old
    (old via columns) but through the NEW machinery — the authority contract's own bar
    ('outside quoted examples') has an obvious hole.
    Prescription: a clause led by a framing verb (explain/summarize/describe/review/compare...)
    inertizes following imperative clauses in the same request (quotation-by-discourse).
R6. Bare-comma clause splitting: 'عندي قاعة أفراح، بدي جدول...' fails (بدي after Arabic comma).
    Prescription: split clauses on bare ، and bare comma (artifact co-requirement + verb anchor
    keep it safe); add wedding + 'I like apples, build me a shed' controls.

## Pre-existing failures correctly NOT attributed to the candidate (8, proven same-behavior)
P1. a-short-order source-literal test (region untouched by commit; identical bytes -> identical verdict).
P2-P4. a-question 'names a deed' x3: PlanningEngine.isKnowledgeQuestion == structural predicate,
    byte-identical both sides (note: its doc comment promises deed-first ordering the code does
    not implement — stale comment, separate owner).
P5-P7. 'still a browser task' x3: old==new==false on the build input; knowledge/browser/
    capableTools paths all in unchanged code with identical inputs.
P8. people-52 bare-alef اصنع: missed by BOTH (old only had hamza form). Cheap fix (folded اصنع)
    recommended inside R2.
Codex transfer poem/illustration/anaphoric cases: SAME_FAIL both sides (creation-about-X and
anaphora need a guard + discourse context respectively) -> follow-up backlog, not rework
blockers. My adversarial probe adds fail-CLOSED gaps (help-me/let's/we-need/add/run/delete/
deploy/crash-reports) -> follow-up backlog; 'add a feature' should head that queue (core
incremental-edit traffic).

## Proposal errors / corrections
1. Consultation frames the 5 consumer FAILs as the only open item; exact review shows the owned
   predicate itself needs rework (R1-R6) before ANY consumer repair can compose correctly.
2. 'Typecheck EXIT0 recorded' is TRUE for the commit but my in-review tsc (3x TS2304) measures
   post-commit WIP — future evidence must timestamp-bind tree state (git status --short at
   check time) so drift never confuses a review again.
3. Dead code note: 6 pattern consts + 1 import line in intent-classifier.ts are now unused
   (RECORDING/DESIRE/ENGLISH/CONTAINER/INDICATOR + derivedColumns/columnsAnywhere import).
   Do NOT delete yet: R4 reuses derivedColumns. Delete the rest in the rework commit.

## Simpler alternatives considered (and why prescription stands)
- Accept-break + update the 6 columns-pins with justification: REJECTED as first choice — it
  deletes an owner-demanded feature the bill case never contradicted. Acceptable only as a
  fallback if the team explicitly dispositions those pins AND records the capability loss.
- Whole-request verb scan (unanchored): REJECTED — 'Explain how to build a calculator' would
  authorize (mid-clause build + calculator). Anchoring + comma-split + shape path is the
  minimal safe combination.
- Restoring full old hasBuildStructure alongside new (OR): REJECTED — reintroduces
  columns-authorize (the fixed defect).

## Overlap with existing work (scope flags, no action taken by reviewer)
- Post-commit WIP (UNCOMMITTED, observed read-only): build-first reorder in classifyIntent +
  answer-only early-return in IntentParser. Both files are NVIDIA-RETAINED per split
  (decision NONRECORD-ACTION-BOUNDARY-SPLIT-20261001). If Codex intends to keep them, that is
  a scope expansion requiring NVIDIA ack + ownership update — NOT silent adoption. The WIP
  also does not address R1-R6.
- Zero overlap with Muse owned lanes (redactor repair — no shared files; wiring discovery —
  read-only) and zero overlap with the Windows/checkpoint candidate (29e24007).
- NVIDIA consumer repair (5 retained FAILs) REMAINS REQUIRED and composes AFTER this rework;
  the rework must not consume classifyIntent/IntentParser ordering (leave the WIP direction
  for the ownership decision).

## Conflict / regression risks of the PRESCRIBED rework
- Noun/verb restoration is fail-direction-bounded: every restored token stays behind the
  clause-initial verb anchor + artifact co-requirement; negatives re-verified by the existing
  12 negatives + new login/complaint controls.
- Shape path risk is the values-vs-fields ambiguity (documented limitation + interrogative
  guard). No provider/LLM behavior changes; predicate stays pure/sync.
- No API/regulation surface changes; no persistence/workspace, or cost-policy impact.

## Maintainability / security / portability
- R1 is a safety fix (fail-open -> fail-closed). Nothing in R2-R6 widens authorization beyond
  old behavior except the shape path, which is narrower than old columns-authorize (ask
  required) and documented.
- Keep the predicate pure + side-effect-free + provider-free (current design strength; the
  jest router-throw mocks pin it).
- Prescribed tests are permanent Jest (no snapshots of implementation); probe scripts stay in
  reviewer tmp, not the repo.

## Required tests (before this scope can ACCEPT)
1. R1: login سجل FALSE + بدي-سجل TRUE (span separation), both directions, no other movement.
2. R2: restored nouns/verbs TRUE (HIS brief, marketplace/panel/portal/platform/list/كشف/بوابة/
   خدمة, محتاج/اصنع/ارغب/deploy/give-me) + ALL 12 existing negatives still FALSE.
3. R3: bare-global ('Do not create files' + later build -> FALSE) + qualified-scoped
   ('No modifications to existing files' + later build -> TRUE) + authority-suite green.
4. R4: rolodex-family TRUE (6 pins) + single-quote stripping + interrogative guard
   ('I want a list of capitals: Paris, Rome, Madrid' FALSE) + bill prompt TRUE via
   verb+artifact (no schema assertion at this layer).
5. R5: unquoted framing-verb inerting (spec/design cases FALSE) + controls (then-build TRUE).
6. R6: wedding/ASCII-comma clauses TRUE + number-comma safety ('version 2, build 5' FALSE).
7. Regression: the 5 previously-failing suites return to (at worst) their 8 pre-existing
   failures; zero NEW failures vs the old-vs-new map in this review.
8. Mandatory AGENTS gates for planner/classifier scope + tsc --noEmit on the EXACT rework
   commit with bound git-state evidence.
9. Consumer 5 FAILs remain owned by NVIDIA; no silent consumption of classifyIntent/IntentParser
   ordering in this rework.

## Real Joe UAT
NOT_RUN (correctly — WIP scope, no integration). No UI verdict inferred from 22/22 or 6/6.
After rework + NVIDIA consumer repair + gates: fresh official-5002 multi-prompt acceptance per
ACTIVE-PLAN (bill + calculator + converter/contact-form + non-web transfer), terminal runs,
physical-file + rendered-control inspection.

## Verdict rationale
Direction correct, fix demonstrated, evidence honest — hence not REJECT. But a NEW fail-open
(R1) plus silent coverage loss (R2) plus an unresolved contract conflict (R4) plus a proven
denial asymmetry (R3) mean the owned diff is not yet the coherent contract it claims to be.
All items are bounded, prescribed, and inside Codex's owned files. REWORK, then re-review.
FIXES_REQUIRED_IN=R1-login-span-separation; R2-noun-verb-restoration; R3-denial-scope-rule;
R4-ask-contents-shape-path; R5-framing-verb-inerting; R6-comma-splitting.
REVIEW_COMMANDS=(candidate, pristine commit, cache redirected, tree untouched):
npx jest src/__tests__/requested-action-authority.test.ts src/__tests__/requested-answer-planner.test.ts src/__tests__/requested-action-consumer-contract.test.ts --ci
  => authority PASS 22/22, planner PASS 6/6, consumer FAIL 5/5 (28/33)
npx jest <12 intent-adjacent suites> --ci => 7 PASS suites, 5 FAIL suites, 232/253 tests
node tmp/team-consultation/old-vs-new-lookslikebuild-20261001.cjs => 27-case old/new map
node tmp/team-consultation/requested-action-adversarial-20261001.cjs => 11/22 (8/8 negatives safe)
npx tsc --noEmit (dirty tree) => 3x TS2304 from post-commit WIP only; commit type-clean by elimination
