AGENT=MUSE
CONSULTATION_ID=MEDIA-REQUEST-SCHEMA-WIRING-002
STATUS=REVIEWED_BY_MUSE
POSITION=Diagnosis confirmed by independent reproduction on Muse branch; proposal boundaries are the right repair direction but incomplete: the Muse tree has an additional phantom-column defect the proposal does not mention, and the classifier fix must reuse the established expenses product-head pattern rather than a media carve-out. Notes-plural FAST_PATH lexical fix endorsed.
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=d98c5dc5
MUSE_BRANCH=muse/joe-development
UPDATED=2026-09-30
SHARED_WRITE=DENIED_BY_POLICY (workspace-only writes; Codex to import verbatim)

## What Muse independently inspected
- Proposal: D:\Joe\coordination\team\proposals\MEDIA-REQUEST-SCHEMA-WIRING-002.md (full read).
- Source (Muse tree @ d98c5dc5): api/src/core/design/app-blueprints.ts
  lines 236-274 (APP_KIND_SIGNALS), 398-412 (hasWorkflowApplicationContract),
  461-517 (expenses precedent + explicit-schema short-circuit), 913-1002
  (RECORDING_WORD, subjectAfterContainer path, recordedSubject), 1025-1155
  (blueprintFor explicit-schema overlay incl. title override 1141-1142 and
  native-type merge 1049-1060), 1262-1300 (stock media blueprint),
  1746-1762 (TYPE_MARKS), 2851-2970 (derivedColumns incl. container reader
  2950-2956), 3267-3303 (canonicalFieldKey, hasExplicitRecordSchema),
  3768-3805 (requestedFilterFields).
- Source: api/src/core/design/subject-phrase.ts lines 186-249
  (ENGLISH_ADJUNCT_PREPOSITION, subjectAfterContainer).
- Tests: api/src/__tests__/media-review-contract.test.ts (all 9, full read).
- Muse commits (verified present via git show --stat): 9f78ee35 (adjunct
  prepositions refused as names), 71f50474 (capability-headed columns),
  2edfbe73 (list-category noun strip A_LISTS_OWN_NAME).
- NOT inspected: Codex in-memory experiment artifacts under
  C:\Users\home\.codex\visualizations\... (outside sandbox read scope).
  No conclusion here depends on them; all findings below are reproduced
  from Muse-tree source and tests.

## Independent reproduction (Muse tree, jest via node jest-cli, workspace temp)
- media-review-contract.test.ts: 3 FAILED / 6 passed, same three failures
  Codex reported on candidate f61fe8aa:
  1. detectAppKind(REQUEST) = 'generic', expected 'media'.
  2. blueprintFor('media',...).title = 'where users', expected 'Media Review Board'.
  3. uncoveredFeatures includes 'filter items by tag'.
- tsx probe (tmp/media-probe-002.ts, kept in worktree) additionally shows:
  - hasWorkflowApplicationContract=false, hasExplicitRecordSchema=true.
  - recordedSubject = subjectAfterContainer = 'where users'.
  - fieldsFromRequest = title/text, tags/text, notes/TEXT (not textarea),
    PLUS two phantom fields: ['text4','text','filter items by tag'] and
    ['image1','image','preview the uploaded image'].
  - requestedFilterFields = ['text4','image1'] (binds phantoms, not 'tags').

## Root cause (per defect, with source anchors)
1. CLASSIFIER: line 517 `if (hasExplicitRecordSchema(...)) return 'generic'`
   fires before APP_KIND_SIGNALS scoring (line 529). The media signal at
   line 274 DOES match 'media review board', so the short-circuit is the
   sole classifier defect. hasWorkflowApplicationContract is false because
   its workItem nouns (issues/tickets/tasks/...) never occur here.
2. TITLE: RECORDING_WORD (line 913) has no match in the request, so
   recordedSubject falls to theNounBesideTheContainer -> subjectAfterContainer.
   RECORD_CONTAINER matches 'board'; the after-text 'where users upload an
   image' splits on comma to 'where users upload an image'; 'where' is not
   in ENGLISH_ADJUNCT_PREPOSITION (subject-phrase.ts:192) and no
   relative-clause guard exists, so the first two words 'where users' become
   the subject, then the title via line 1141-1142 (`title: productTitle || subject`,
   productTitle null since no 'named/called' shape).
3. FILTER: requestedFilterFields clause regex (line 3784) captures
   'items by tag, preview the uploaded image, and delete...' up to the
   period; stop-split (line 3792) only cuts on plus/with/progress-metric, so
   'image' from the preview clause stays in the token set. Singular 'tag'
   never binds canonical 'tags' (no canonicalFieldKey use in this reader).
   On the Muse tree the binding is worse than reported: it binds two phantom
   fields (see 5).
4. NOTES TYPE: TYPE_MARKS (line 1761) has `\bnote\b` singular only, so
   'notes' falls through to text; canonicalFieldKey DOES map notes->notes
   (line 3281), so the key is right and only the type degrades. The overlay
   merge (lines 1055) preserves only native `select`, so native textarea is
   overwritten. Codex's lexical diagnosis is correct; no provenance API is
   needed for this defect. AGREED.
5. PHANTOM COLUMNS (not in proposal, Muse-branch finding): derivedColumns
   container-reader path (lines 2950-2956) splits the post-'board' tail on
   commas/'and' with only a 2..32-char length filter. 'filter items by tag'
   (19 chars) and 'preview the uploaded image' (26 chars) pass and become
   columns. Verb-led action clauses are never rejected as enumeration items.
   Any repair that fixes filter binding without fixing this still ships two
   garbage columns. This reader is shared by hasExplicitRecordSchema,
   columnsAnywhereInHisRequest and fieldsFromRequest, so the fix radius
   needs the full app-blueprints consumer suites, not just media tests.

## Proposal errors / gaps
- E1: Phantom-column defect (root 5) is entirely missing. Test 2 of the
  media contract asserts exact field identity/order, so it cannot pass
  without addressing it.
- E2: Boundary 4 (upload-implied image field, ordered first, required) is a
  real design decision the proposal understates: it synthesizes a field from
  an ACTION ('upload an image') while the file's standing principle is 'his
  list replaces its columns'. Needs explicit justification + negative
  controls ('upload a CSV of tasks' must not yield an image field; 'preview
  the uploaded image' must not yield a second image field).
- E3: The proposal does not name the implementation BASE. Muse tree and the
  f61fe8aa candidate demonstrably differ here ([text4,image1] vs reported
  [image] filter binding). Repair must state its base and be validated on
  both, or the diff between bases must be reviewed first.
- E4 (minor): boundary 1 ('strong product-head evidence') is not operationalized.
  The file already owns the pattern: the expenses named-product check at
  lines 461-467 retains kind while the explicit branch still replaces
  columns. Name that as the reuse target instead of inventing new machinery.

## Simpler alternatives
- A1 (classifier): generalize the line-467 expenses precedent — a
  product-head + container-noun conjunction (e.g. '<domain-signal> ... <container>
  | named/called <Title>') evaluated BEFORE the line-517 short-circuit,
  returning the scored kind instead of 'generic'. No new metadata system.
- A2 (title): extend Muse 9f78ee35's adjunct handling — reject scope text
  opening with a relative pronoun (where/who/which/that/when + verb) in
  subjectAfterContainer, then fall back to the before-container word
  ('board' <- 'review' <- 'media': read the domain head) or '' (stock title
  survives). General grammar, no media vocabulary.
- A3 (filter): bound the clause at the next action verb AND resolve tokens
  through canonicalFieldKey (already maps tag->tags, note/notes). Two small
  shared-reader changes, no new catalogue.
- A4 (notes): the FAST_PATH `note->notes?` TYPE_MARKS change. Endorsed as-is;
  do NOT generalize the overlay merge (line 1055) to textarea/image in the
  same batch — user-explicit types must keep winning, and that change needs
  its own tests.

## Overlap with existing Muse work (reuse, do not duplicate)
- REUSE 9f78ee35: adjunct-preposition refusal is the exact seam for the
  relative-clause guard (A2). Its test a-preposition-is-not-a-name must stay green.
- REUSE 71f50474: capability-headed columns. The phantom-column fix MUST NOT
  regress a-column-headed-by-a-capability-word.test.ts — verb-led rejection
  must distinguish action clauses from capability-headed labels.
- REUSE 2edfbe73: A_LISTS_OWN_NAME strip runs in the same enumeration pipeline
  (line 2955); keep its tests green.
- REUSE f8cf0852 media AppKind/router/blueprint/stock schema/QA: already
  present in candidate (Codex correction accepted — verified stockBlueprintFor
  'media' case exists in Muse tree at lines 1279-1300). Do not rebuild.
- f8cf0852's request/schema integration has the SAME three defects (reproduced
  above on Muse HEAD, which contains it). The repair benefits both branches.

## Conflict / regression risks
- app-blueprints.ts is hot: Muse parser work, NVIDIA dirty CLI/CSV exclusions
  in the hasExplicitRecordSchema region (untouched per proposal — CONCUR:
  repair must not alter lines 3290-3303 build-verb/CLI logic), frozen Codex
  calculator seam f61fe8aa. Repair hunks must stay inside
  detectAppKind/classify pre-check, subjectAfterContainer/recordedSubject,
  requestedFilterFields, derivedColumns enumeration, TYPE_MARKS.
- Highest regression risk: the line-517 short-circuit guards the dental-clinic
  case (incidental domain noun + explicit columns). Any pre-check MUST keep a
  negative control: '<domain context>. <Build> ... <2+ explicit columns>' with
  NO product head still yields generic-with-user-columns. Weakening that
  control to pass media is forbidden.
- derivedColumns change affects every consumer (schema entry, planner
  routing, ProjectPipelineTool hisOwnSchema). Requires full consumer suites,
  not only the 9 media tests.

## Maintainability / security impact
- Maintainability: positive IF the repair reuses existing seams (A1-A4) and
  adds no media-specific branches, no new catalogues, no provenance API.
  Negative if it special-cases this request's words.
- Security: none identified. Readers are pure string functions; no auth,
  secret, path, or execution-surface change. No destructive-action exposure.
- Portability: regex/grammar readers are runtime-independent. No concern.

## Required tests (before any ACCEPT)
1. All 9 media-review-contract tests green WITHOUT weakening any expectation.
2. New negative controls (RED-first): phantom action-clause columns
   (filter/preview/delete/upload clauses yield no columns); Arabic relative
   clause subject (حيث/التي/الذي + verb rejected); named title with relative
   clause ('board called X where users...' keeps X); dental-clinic columns
   preserved; singular/plural tag filter; multi-filter; filter-by-status/title
   followed by image preview; 'upload a CSV' no-image-field; 'add title'
   stays a field, never the app title.
3. Full app-blueprints consumer suites + all 10 AGENTS.md architecture/
   self-healing gates (planner consumer changed).
4. Real Joe rendered media run per proposal Verification section (upload real
   fixture, edit metadata, filter by tag, preview original, invalid-file
   rejection, delete confirm/cancel, reload persistence, desktop+mobile).
   No product PASS without it.

## Real Joe UAT (this review)
- None performed for the repair (no implementation exists yet; none started
  by Muse per consultation instructions). Review evidence is source + focused
  test reproduction only. UAT is required of the implementation owner
  (Required tests item 4).

## Answers to consultation QUESTIONS
- Reuse commits: 9f78ee35, 71f50474, 2edfbe73, f8cf0852 (details above).
- Domain-head identification CAN preserve explicit fields: kind retention and
  column replacement are already orthogonal in blueprintFor (lines 461-467 vs
  1025-1060). Condition: strong product-head evidence required, else
  clinic-columns regression.
- Missing controls: listed under Required tests item 2 (phantom columns,
  Arabic relatives, named titles, upload-CSV, title-as-field).
- Same-file conflicts: hasExplicitRecordSchema CLI region (NVIDIA dirty,
  do not touch), calculator seam (frozen), Muse parser tests (keep green).
  Directly confirmed this cycle (read-only): NVIDIA tree main e8fd9589 has
  dirty app-blueprints.ts + IntentParser.ts + tool-aliases test + api package
  files; untouched by Muse.
- Ownership recommendation: IMPLEMENTATION_OWNER=CODEX isolated candidate
  (proposed, accepted for this bounded scope AFTER base reconciliation);
  REVIEW_OWNER=MUSE exact diff + rendered outcome; INTEGRATION_OWNER=CODEX
  after independent ACCEPT + gates + real UAT. No competing Muse
  implementation started or planned. FAST_PATH notes-plural fix may proceed
  independently under its stated scope.

## Verdict rationale
The diagnosis reproduces exactly on an independent branch and the proposed
boundaries point at the real seams. APPROVE_WITH_CHANGES because the repair
scope must add the phantom-column root, name its base, reuse the expenses
precedent, and carry the listed negative controls. The notes? lexical fix is
approved as stated.
