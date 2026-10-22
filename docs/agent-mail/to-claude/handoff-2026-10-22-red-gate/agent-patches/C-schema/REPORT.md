<!-- Verbatim final report of the group C sub-agent (2026-10-22T18:14:45.369Z). Not re-verified by the coordinator. -->

## Group C report: 10 of 16 red tests fixed, 6 stopped as conflicts (X)

Of the 16 red tests, 10 are now green (7 of the 10 suites pass fully). The other 6 are in 3 suites, and I stopped on each one as a conflict (X) because a later commit deliberately changed the behaviour the test protects. All fixed work is committed. Nothing unverified is committed or left in the working tree.

### 1. Worktree, branch, commits
- Worktree: `/home/user/xelitesolutions/.claude/worktrees/agent-aefb01b141d00c946`
- Branch: `worktree-agent-aefb01b141d00c946`. I fast-forwarded it from 917c70ec to the base 4324f0ea before starting.
- Commits:
  - `9214b9cb` fix(schema): a bare «list» holds values in both column readers
  - `8a8c7cac` fix(schema): one value in brackets is his note; a default never replaces it
  - `9ba4d057` fix(classifier): «،» ends the context clause before an Arabic build verb
  - `57f2f3df` test: repoint three guards whose pinned spelling was refactored (invariant intact)
- The only production file changed is `api/src/core/design/app-blueprints.ts`.
- Test files changed:
  - `a-bracket-is-his-answers`, `a-verb-phrase-read-as-a-column` and `the-schema-reader-was-blind-in-english`: negative cases added.
  - `a-rename-is-neither-an-add-nor-a-remove`, `schema-from-blueprint` and `ai-schema`: repointed (P).
- Line endings: `git diff 4324f0ea --numstat` equals `--ignore-cr-at-eol --numstat`, and every touched file has 0 CRs.
- Files were added by name. The `api/node_modules` symlink is still untracked.
- Each commit message also carries the root cause and the raw mutation lines.

### 2. Per-test table
| Suite › test | Culprit | Decision | Root cause | Status |
|---|---|---|---|---|
| a-column-called-fih › a list of values is still refused | c219da21 | R | c219da21 moved the introducer reader ahead of the container reader. The introducer reader never had the "a bare list holds values" rule. | fixed `9214b9cb` |
| the-schema-reader › a shopping list holds things | c219da21 | R | Same cause as above. | fixed `9214b9cb` |
| the-schema-reader › a list after a field noun holds that field's values | 76f66a5d | R | `RECORD_CONTAINER` lost its capture group, so `holder[1]` is undefined and the list rule was dead code. Both readers now share one function, `aBareListHoldsValues`. A negative case was added: a bare «قائمة» with definite Arabic names is still read as columns. | fixed `9214b9cb` |
| a-bracket › a single value in brackets is a note | 75e32c75 | R | Every state-named label now gets default options. «الحالة (متوفر)» received «قيد الانتظار · قيد الإصلاح · تم الإصلاح», which cannot even hold «متوفر». Now a label followed by one bracketed value skips the state default. Two tests added: the column still exists as text, and a bare «الحالة» still gets ≥2 options. | fixed `8a8c7cac` |
| a-verb-phrase › TWO columns still outrank the noun / the archetype a column list SHOULD override | 81e8913c | R | The classifier goes through `hasExplicitRecordSchema`'s build-clause gate. That gate only recognised a clause start after [.؟!\n], so «عندي عيادة أسنان، أريد جدولاً…» went unread and «عيادة» won (booking). Fix: «،» also starts a clause for the Arabic build words. English is unchanged. A negative test was added: the same sentence without the verb is not promoted. | fixed `9ba4d057` |
| a-rename › the column keeps its key and its type | c219da21 | P | `canonicalFieldKey` turned money1/date1 into amount/date. The rename still keeps every key and type. The test now reads keys from the build and also asserts types. | fixed `57f2f3df` |
| schema-from-blueprint › Prompt 01 … columns | c219da21 | P | c219da21 deliberately reads Prompt 01's own form fields (description, category, amount, date). It updated the two sibling checks in api-project.test.ts and missed this one. The test now asserts stored keys == rendered blueprint keys == his four fields. | fixed `57f2f3df` |
| ai-schema › awaits the design / SAME design | 3917fe1d, c219da21 | P | Source pins of refactored lines. A third pin was hidden behind the first failure (76f66a5d renamed prevEntry to apiEntry). All three pins now point at the new code. | fixed `57f2f3df` |
| a-capability › a bare English capability with no introducer IS still read as a column | 75e32c75 | **X** | See section 4. | not fixed |
| a-page-he-named › a real column list is untouched / a page AND columns… | 81e8913c, made deliberate by 76f66a5d | **X** | See section 4. | not fixed |
| media-review-contract › 3 tests | 76f66a5d | **X** | See section 4. | not fixed |

**An error of mine, corrected before committing:** I first fixed the a-verb-phrase and a-page tests by removing the build gate from `detectAppKind`. The wider run then turned red on a test 76f66a5d added on purpose: `the-request-shapes-the-data › does not promote the same field-shaped description without a build clause`, which expects `detectAppKind('عندي مزرعة إبل فيها بيانات الناقة: …')` to be null. So the gate is intentional. I reverted my change and replaced it with the «،» clause-boundary fix, which works inside 76f66a5d's own design.

### 3. Mutation evidence
All mutations ran with the fixed `mutate.py`, or my copy of it that also prints diff lines. Every run ended with `sha256 identical`. Raw outputs are in `/tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad/groupC/mut/` (M*.out; M1/M2 are from the reverted approach and can be ignored).

| Mutation | What was broken | Failing test | Raw result |
|---|---|---|---|
| M3 | Introducer path without the list rule | `✕ a list of values is still refused`, `✕ a shopping list holds things, not columns` | `Received: [{"key": "text1", "label": "milk", …` |
| M4 | Container reader asks `holder[1]` again | `✕ a list after a field noun holds that field's values` | `Received: [{"key": "text1", "label": "coffee", …` |
| M5 | List rule applied to Arabic names too | `✕ a bare «قائمة» of definite names is still his columns` | `- Expected - 5 / + Received + 1` |
| M6 | Bracket skip removed | `✕ a single value in brackets is a note` | `Received: ["قيد الانتظار", "قيد الإصلاح", "تم الإصلاح"]` |
| M6 | (same) | `✕ …the note keeps the column, as his free text` | `Expected: "text" Received: "select"` |
| M7 | Skip widened to every state column | `✕ NEGATIVE — a state he left open still gets its default lifecycle` | `Expected: "select" Received: "text"` |
| M7 | (same) | `✕ directory-request-contract › turns the named status into a real filter contract` | `Expected: "flag1" Received: "text3"` |
| M1c | «،» removed from the Arabic clause start | both a-verb-phrase NEGATIVE tests | `Expected: "generic" Received: "booking"` |
| M2c | Any «،» counts as a request | `✕ NEGATIVE — the «،» opens his request only through his verb` | `Expected: not "generic"` |
| M8 | Rename gives the column a new key | `✕ the column keeps its key and its type` | `-   "amount:number", +   "text4:number"` |
| M8b | Rename changes the type | (same test) | `-   "amount:number", +   "amount:text"` |
| M9 | API drops a rendered column | `✕ Prompt 01 …` | `- Expected - 1 / -   "description",` |
| M10 | Blueprint stops reading his form | `✕ Prompt 01 …` | `- Expected - 2 / + Received + 2` |
| M11 | Designer notes silenced | `✕ the api builder awaits the design` | `Expected pattern: /const designed = workflowApplication…/` |
| M12 | Non-promoted primary dropped from the handoff | `✕ …SAME design` | `Expected pattern: /const handedModel = …/` |
| M13 | Interface ignores the API model | `✕ …SAME design` | `Expected pattern: /Array\.isArray\(apiEntry\?\.model\)…/` |

Two extra negatives guard the build-gate half:
- With the planner's build gate removed (M2), `✕ a noun phrase is a specification, not a request` gives `Expected: false Received: true`.
- 76f66a5d's camel-farm test also stays green.

### 4. Conflicts (X), left red for your decision

**a-capability-is-not-a-column › boundary of the English cut**
- Test says: "a bare English capability with no introducer IS still read as a column … Closing it needs a signal this function does not have." It expects `'… with name, class and grade, sortable by grade'` to give `[…, 'sortable by grade']`.
- 75e32c75 says: `/** A behaviour beside fields is an app requirement, not another column. */ CAPABILITY_CLAUSE … sort(?:ing)? …` and "Stop at the first action phrase so 'search' and 'status filtering' do not become text inputs". This is a deliberate vocabulary that cuts bare English capabilities, so the declared limit is no longer true.
- Measured:
  - "sortable" is cut only because of a prefix match (no word end).
  - `', sort by grade'` is cut by the vocabulary itself.
  - `', ranked by grade'` is still read as a column.
  - `'A shipments table with name, origin, export date and weight'` gives `['name','origin']`. A real column ("export date") is cut, and "weight" is lost behind it.
- Commit 2cd74180 on integration-20260928 simply flips the expectation to match the new parser. I did not apply it.

**a-page-he-named › two tests** (verbless specimens «جدول فواتير فيه اسم العميل والمبلغ والتاريخ»)
- Test says: "a real column list is untouched — this is a boundary, not a ban on «فيه»". It expects 3 column criteria and 2 column criteria.
- 76f66a5d says: "Read a clause boundary, while still refusing a mere description that never asks Joe to create anything". Its test expects the camel description with no build verb to give `detectAppKind → null`. The planner test also says "a noun phrase is a specification, not a request".
- Measured:
  - With «بدي» in front, the page boundary holds: 3 criteria (`column:text1, column:amount, column:date`) and 2 criteria. So only the verbless specimen is refused.
  - `PlanningEngine.looksLikeBuild` returns **true** for both verbless specimens, the camel description, and `'A clients table with name, phone and address'`, while `detectAppKind` returns null for all of them. The router starts a build that the classifier and judge see no table in, so the judge derives no column criteria. That is two readers of "is this a build?" disagreeing, and routing is your cluster.

**media-review-contract › 3 tests**
- Test says (f8cf0852): a media review board must be `detectAppKind → 'media'` and use the media archetype: title 'Media Review Board', fields image/title/tags/notes(textarea), filter by tags, keep original images.
- 76f66a5d says: "The first capability is a boundary, not evidence that the preceding field names were imaginary". It also made 'board' a record container, and record-upload-schema.test.ts pins the near-identical media sentence as having explicit fields.
- Under the long-standing rules "AN EXPLICIT LIST BEATS EVERY ARCHETYPE" and "a list he wrote outranks a noun", the request now gives `generic` plus his explicit columns.
- Defects in that explicit path, regardless of which way you decide:
  - The title is the subject misread from the relative clause: "where users".
  - The filter is on `image`: the clause leaks into "preview the uploaded image", and 'tag' does not match 'tags'.
  - 'notes' (plural) does not get the textarea type.
- Possible resolutions:
  - Generalise c219da21's expenses "domain declaration" rule to other archetypes and fix the three defects.
  - Use the archetype when his fields exactly equal its fields.
  - Accept 'generic' and rewrite the test around the explicit path.

### 5. Results
- Group before: `Test Suites: 10 failed, 10 total` / `Tests: 16 failed, 124 passed, 140 total`.
- After: I did not do a separate group-only run, because of the stop order. The wide run covered all 10 group suites plus 87 neighbouring suites on the exact committed code. Raw per-suite lines for the group:
  - PASS: a-verb-phrase-read-as-a-column, schema-from-blueprint, a-bracket-is-his-answers, a-rename-is-neither-an-add-nor-a-remove, a-column-called-fih, ai-schema, the-schema-reader-was-blind-in-english.
  - FAIL: media-review-contract (3), a-page-he-named-is-a-criterion-not-a-column (2), a-capability-is-not-a-column (1).
- Wide run totals: `Test Suites: 15 failed, 82 passed, 97 total` / `Tests: 44 failed, 1678 passed, 1722 total`.
- Baseline for comparison (89 related suites at 4324f0ea): `Test Suites: 18 failed, 71 passed, 89 total` / `Tests: 44 failed, 1417 passed, 1461 total`.
- No new failures from my changes. 8 tests that were outside that baseline (in a-noun-is-not-a-command, import-project and react-project: routing and Vite tests) fail the same way with `app-blueprints.ts` restored to HEAD.
- `npx tsc --noEmit` exit: **0** (`TSC_EXIT 0`).

### Other findings (not fixed)
- The Arabic default options for state columns are repair-shop states («قيد الإصلاح / تم الإصلاح») and are applied to every Arabic state column. The English defaults are generic (Pending / In progress / Completed).
- My mutated files were all LF-only, so the old text-mode `mutate.py` bug did not affect these restores.
