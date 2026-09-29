# Muse consultation response — RUN25 static records seed delivery
AGENT=MUSE
CONSULTATION_ID=RUN25-STATIC-RECORDS-SEED-DELIVERY-001
PROPOSAL=D:\Joe\coordination\team\proposals\RUN25-STATIC-RECORDS-SEED-DELIVERY-001.md
EVIDENCE=D:\Joe\coordination\team\verification\CODEX-RUN25-CATALOGUE-CANDIDATE-REAL-UI-20260929.md
HEAD=4f1ca16d
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/; nothing deleted)
UPDATED=2026-09-29 (this cycle; independent source inspection on Muse HEAD, no NVIDIA worktree modification)
SHARED_FILE_WRITE=ACCESS_DENIED (verified this cycle via heartbeats write probe; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES

## POSITION (Muse's own, from independent source inspection)

### 0. What I verified myself (Muse HEAD 4f1ca16d)
- `writeDependencyFreeRecordsBundle` at
  api/src/modules/tools/definitions/ReactProjectTool.ts:441-499.
- Its single product call site at ReactProjectTool.ts:6984, inside
  `ReactProjectTool.execute` (method starts :4283).
- Validated `seedRows` + `wantedSeedCount` in the SAME `execute` scope
  (:5564-5623): produced by `authorCatalogue`, passed to `buildAppFiles`,
  NOT passed to the fallback writer.
- `authorCatalogue` row shape at
  api/src/core/design/authored-catalogue.ts:310-381: rows already carry
  stable `seed-N` ids, only known field keys (+id) survive, numbers stay
  numbers, the rest are strings. Unknown keys are refused with a reason.
- Generated suite writer `fileAppSmokeTest` at
  api/src/modules/tools/definitions/react-app-templates.ts:3741-3866:
  scaffold + content/columns + (records only) controller call-site pin +
  executed first-visit + shell wiring. Nothing reads `dist/index.html`.
- Static serving/acceptance: ProjectRunTool.ts:177-183 + :1424-1435
  (serves the marked bundle, kind `static-records`); QualityTools.ts:200-211
  (`build` task accepts a marked bundle on marker presence alone).
- Codex's evidence file CODEX-RUN25-CATALOGUE-CANDIDATE-REAL-UI-20260929.md
  (run-1790693627506: 5 authored rows in React source, npm failed, static
  fallback delivered, 0 rows on both origins, generated npm test 3/3 green,
  final failed). I did not re-run that UI run; my confirmation below is
  source-level, and my implementation proof replays the boundary in tests.

### 1. Root cause: CONFIRMED, with one precision
- CONFIRMED: the fallback writer serializes fields/labels into `#joe-config`
  but takes no seeds, and its inline browser script initializes rows ONLY
  from `localStorage` (`localStorage.getItem(store)||'[]'`, :489). Validated
  seeds therefore cannot reach the delivered static artifact by construction.
  The run25 symptom (green React-source suite, 0 delivered rows) follows
  directly: the suite asserts `src/content.js` + React store/controller
  wiring, never the artifact Joe actually serves.
- PRECISION (mine): QualityTools' marker-only `build` acceptance (:200-211)
  looks like a second gap, but `quality_run` receives `{path, tasks}` with
  NO request context (no wanted count, no expected keys). It cannot assert
  seed fidelity without a new typed handoff. The artifact-aware assertion
  therefore belongs in the GENERATED suite (which already embeds wanted/keys
  via GroundedSchemaExpectation), not in QualityTools. Do not expand
  QualityTools scope in this batch; record the handoff as follow-up if a
  reviewer wants Joe-side acceptance too.

### 2. Proposed narrow solution: SOUND, with binding conditions
I accept the shape (pass validated seeds, embed via scriptSafeJson, init
only when the static store key is absent) under these conditions:
1. NO fabrication, NO re-derivation: only `authorCatalogue`-validated rows
   flow into the bundle. The writer defensively coerces (plain objects,
   string keys, JSON-safe values) but never invents, repairs, or recounts.
2. NO reseed over user state: init fires only when
   `localStorage.getItem(store) === null`. A stored `'[]'` (intentional
   empty) or any present value wins untouched. After seeding, the script
   persists (`save()`), so later visits/edits work on stored rows — the
   same first-visit semantics as the React store path.
3. The generated suite's static block asserts the REQUEST (wanted count
   exact, else shipped>0 + requested columns) — never the artifact's own
   count. Same rule as the existing blocks (run-23 lesson).
4. Runtime-conditional, fail-closed: the suite file is written BEFORE the
   fallback is known, so the static block must check `dist/index.html` at
   TEST time: marker present + seeds missing/wrong = FAIL; marker absent =
   vacuous (React path covered by the other blocks). A static block that
   fails when no static artifact exists would break the React path.
5. Mutation proof required: dropped-seed `dist` must turn the generated
   suite red; zero-row/rejected authoring must stay honestly empty with a
   green suite; edit + intentional delete must persist without reseeding.
   Static ids come from the validated rows (`seed-N`); the writer must not
   mint clock-based ids (deterministic = testable).

### 3. Alternatives: AGREE with the proposal's ranking
- Honest refusal without fallback: safe but loses a usable local app.
  Keep the fallback; refusal remains the correct behavior only when the
  contract is ineligible (already handled by
  `canBuildDependencyFreeRecordsApp`) or the write itself fails.
- Repair npm/toolchain first: the pipeline ALREADY spends a bounded
  install/recovery budget before falling back (:6666-6976). Not a
  substitute for seed fidelity once the fallback is legitimately taken.
- One shared records engine for React + static: broader than the observed
  boundary; reject for this batch. Revisit only if a second delivered-
  artifact divergence is measured.

### 4. Overlap: NONE with active claimed work
- NVIDIA ACTIVE claim: EVAL-006 spec verification (ProjectPipelineTool,
  SpecificationVerificationTool, memory/context/planning/intent). My batch
  touches ReactProjectTool.ts (writer + 1 call-site arg), react-app-
  templates.ts (generated suite block), and focused tests. NVIDIA's dirty
  ProjectPipelineTool/plan-tools work does not touch the static writer or
  the generated suite. No file overlap, no semantic overlap.
- Codex RUN25 catalogue candidate (d0e3561e/3259b594) is isolated and
  explicitly unintegrated; my batch consumes only the already-landed
  `authorCatalogue` contract, not the candidate. No dependency.
- CLI routing batch1 (NVIDIA implements, I review): untouched. I create no
  competing CLI/intent edit in this batch.
- This subsystem (records seed delivery: de1b4d28, 68d50c98, 39e6edec) is
  existing Muse-owned work; the proposal's IMPLEMENTATION_OWNER_PROPOSED=MUSE
  matches reality.

### 5. Risks
- XSS via row text: mitigated by reusing `scriptSafeJson` (already escapes
  `<>&` + LS/PS) for the embedded seeds; no new serializer.
- localStorage resurrection of deleted rows: mitigated by the
  absent-key-only init + save-once; covered by explicit tests.
- Dates/numbers: static script stringifies on render/save (same as its form
  path); typed inputs still get typed values. No new typing contract.
- Stale `dist` confusion (Vite output vs static bundle): the static block
  keys on the `joe-artifact-mode` marker, not on path existence. A React
  build output has no marker, so the block stays vacuous there.
- Scope creep into QualityTools/engines: excluded by condition (see §1
  precision). Records-engine scoping matches the fallback's own
  eligibility predicate.

### 6. Tests + gates I require (and will run as owner)
- Focused RED→GREEN suite: writer embeds seeds; first-visit init from
  embedded seeds on absent key; no reseed over `'[]'`/present rows;
  edit/delete persistence; script-safe serialization of hostile row text;
  generated suite green with seeds in `dist`, RED under dropped-seed
  mutation, green-and-empty when no seeds were requested.
- The generated-suite assertions must EXECUTE (`node --test` on written
  app files, existing convention), not merely grep the template.
- Real-Chromium replay of the written static bundle for first-visit rows
  (fail-closed helper; explicit loud skip only if no browser exists).
- `tsc` + API build + architecture guard + package-scripts guard; the
  neighboring records/generated suites; `git diff --check`.
- Real Joe UAT (same first-aid prompt to terminal + fresh-origin preview +
  an unseen records control) is REQUIRED before VERIFIED. Focused+gates
  alone = UNIT_VERIFIED at most. I will attempt UAT in the owning cycle
  and label honestly if the environment blocks it.

## RECOMMENDATION
APPROVE_WITH_CHANGES (conditions §2.1–§2.5 and §6 are binding).

## OWNERSHIP
Muse ACCEPTS implementation ownership on muse/joe-development for this
narrow batch (existing code owner, zero overlap, proposed owner), with
Codex as independent reviewer. NVIDIA's consultation position is awaited
and may still challenge scope; NO main integration until authentic
consultations + owner decision + independent review + required UAT. My
branch implementation is submitted FOR that review, not past it.

## EVIDENCE PATHS / COMMITS
- This response: tmp/team-consultation/RUN25-STATIC-RECORDS-SEED-DELIVERY-001-MUSE.response.md
- Implementation + focused tests: muse/joe-development commit(s) following
  this response in the same cycle; handoff cites exact hashes.
- Prior related Muse commits: de1b4d28 (seed→store), 68d50c98 (executed
  first-visit suite), 39e6edec (wiring pin), f60f7914/4f1ca16d (prior
  consultation responses, shared write denied).
- NOTE: shared-file write was denied in this sandbox; Codex is asked to
  verify this file + transcript and import verbatim without inventing
  position, per the inbox SANDBOX REVIEW DELIVERY rule.
