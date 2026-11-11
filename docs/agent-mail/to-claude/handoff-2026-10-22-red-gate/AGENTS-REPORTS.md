# Sub-agent reports — groups C, D1, D2, E (2026-10-22)

Four sub-agents each took one group of red suites (task files: `group-*.md`, shared brief: `agent-brief.md`).
Each worked in its own git worktree based on **`4324f0ea`** (the first fix commit on
`claude/nice-albattani-007dyv`), committed locally, and pushed nothing.

**Their final reports never reached the coordinator through the hand-back tool** (refused every time:
"Only the auto-mode classifier can allow SubagentHandback: the session is not in auto mode"). The text below
is taken from their last messages and their commit messages. **I did not re-run their mutation proofs.
Review every commit before merging it.**

Per group, in `agent-patches/<group>/`:
- `REPORT.md` — the agent's last long report, **verbatim** (its absolute paths point into this cloud container,
  which will be reclaimed; everything they point to that matters is copied here).
- `MUTATIONS-raw.txt` (C, D1, D2) — the raw output of each deliberate break, as `mutate.py` printed it. Counted with
  `grep`: C 17, D1 19, D2 27 mutations — **63 × `jest exit 1`, 0 × `jest exit 0`, 63 × `sha256 identical`**.
  E's raw mutation lines are inside its `REPORT.md` and commit messages (no separate log was kept).

How to apply — **`--keep-cr` is required** (E's `0002` touches CRLF files; without it `git am` strips the CRs):

```
git am --keep-cr agent-patches/C-schema/0*.patch agent-patches/D1-builder-qa/0*.patch \
                 agent-patches/D2-delivery-edit/0*.patch agent-patches/E-wiring-runtime/0*.patch
git apply agent-patches/E-wiring-runtime/COMPANION-intelligence-economy.patch
```

Verified: on a fresh worktree at `e4be7fc1` that exact command gives `am_exit=0`, 24 commits, and tree
`be48b04b03bfd4010ccffea097949370673adf17` — **identical** to the tree the combined gate measured (HANDOFF §5b);
the companion's `git diff` is identical to the measured working diff. (Patches made with `git format-patch 4324f0ea..HEAD`.)
The `UNCOMMITTED-*.diff` files are exactly `git diff` of the agent's working tree (checked with `cmp`):
green, but **not mutation-proven** — they are not commits for that reason.

Decision letters (from `agent-brief.md`): **R** = the code regressed, fix the code · **P** = the code changed
deliberately and the guard pinned a spelling, re-point the guard at the invariant · **X** = the test and a later
deliberate change contradict each other — left red for a human decision · **ENV** = the environment.

---

## Group C — schema / columns (10 suites, 16 red tests)

Commits (`agent-patches/C-schema/`): `9214b9cb` `8a8c7cac` `9ba4d057` `57f2f3df`. Only
`api/src/core/design/app-blueprints.ts` changed in production.

| suite · test | culprit | dec. | root cause | commit |
|---|---|---|---|---|
| a-column-called-fih · a list of values is still refused | c219da21 | R | the newer introducer reader runs before the container reader and never had the "a bare list holds values" rule | 9214b9cb |
| the-schema-reader · a shopping list holds things | c219da21 | R | same | 9214b9cb |
| the-schema-reader · a list after a field noun… | 76f66a5d | R | `RECORD_CONTAINER` lost its capture group, `holder[1]` undefined, the list rule was dead code; both readers now call one function `aBareListHoldsValues` | 9214b9cb |
| a-bracket · a single value in brackets is a note | 75e32c75 | R | a status default «قيد الانتظار/قيد الإصلاح/تم الإصلاح» replaced his one bracketed value «متوفر» | 8a8c7cac |
| a-verb-phrase · 2 NEGATIVE tests | 81e8913c | R | the build-clause gate saw a clause start only after `.؟!` or newline, not after «،» | 9ba4d057 |
| a-rename · keeps key and type | c219da21 | P | canonical keys amount/date replaced money1/date1 | 57f2f3df |
| schema-from-blueprint · Prompt 01 | c219da21 | P | c219da21 updated two sibling checks and missed this third | 57f2f3df |
| ai-schema · 2 tests | 3917fe1d, c219da21, 76f66a5d | P | pinned source lines refactored | 57f2f3df |

Proof: 16 deliberate breaks, each red for the intended reason (e.g. M6 `Received: ["قيد الانتظار", "قيد الإصلاح", "تم الإصلاح"]`,
M1c `Expected: "generic" Received: "booking"`, M8 `- "amount:number", + "text4:number"`), each restore `sha256 identical`.
Declared error: its first attempt removed the build gate from `detectAppKind` and broke 76f66a5d's deliberate
camel-farm test; reverted, fixed the «،» boundary inside 76f66a5d's design instead.

Raw: before `Test Suites: 10 failed, 10 total` · `Tests: 16 failed, 124 passed, 140 total`.
After: 7 suites pass, 3 fail (6 tests, all X below) — no group-only run line (stop order). Wider run of 97
neighbouring suites: `Test Suites: 15 failed, 82 passed, 97 total` · `Tests: 44 failed, 1678 passed, 1722 total`;
the failures outside the baseline fail the same way with `app-blueprints.ts` restored to HEAD. `tsc` exit 0.

**X — left red:**
1. **a-capability-is-not-a-column (1)** — the test says an English capability with no introducer is still read as a column;
   75e32c75 added a fixed vocabulary that cuts such phrases. That vocabulary also eats a real column:
   "A shipments table with name, origin, export date and weight" → `[name, origin]`. Commit `2cd74180` on
   `integration-20260928` only flips the expected value — not applied.
2. **a-page-he-named-is-a-criterion-not-a-column (2)** — verbless examples (`جدول فواتير فيه …`); 76f66a5d says no build
   clause → `detectAppKind` null. **But `looksLikeBuild` returns true for the same sentences**: the router starts a build
   in which the judge sees no columns. Two readers disagreeing — the routing class of `8c33038b`.
3. **media-review-contract (3)** — f8cf0852 expects the media archetype; 76f66a5d made "add title, tags, and notes, filter …"
   a declared field list → 'generic'. Three defects either way: title is the misread phrase "where users", the filter lands
   on `image` not `tags`, "notes" is not a textarea.

Note: the Arabic status defaults are repair-shop states («قيد الإصلاح / تم الإصلاح») and apply to **every** Arabic status column.

---

## Group D1 — builder / QA guards (11 suites)

Commits (`agent-patches/D1-builder-qa/`): `c8bc1b44` fix(app-css) **R**, then 8 test commits **P**:
`400df9eb` `1ddffe9e` `02719b7f` `c7fdac39` `dedff1c5` `8951892a` `1012587d` `e54a2ce1` (each message carries its
mutation). Final run, all 11 suites: `Test Suites: 2 failed, 9 passed, 11 total` · `Tests: 2 failed, 206 passed, 208 total`. `tsc` exit 0.

**X — left red:**
1. **a-cosmetic-layer-that-starved-the-planner (1)** — 154e231d stops all model authoring for the rest of a build once the
   model failed, **even when the brain is local Ollama**; one Ollama timeout can bring back the owner's empty shelf.
   Exempt the local brain (breaks `react-project.test.ts:485`) or accept the rule and re-pin.
2. **a-grey-box-where-the-product-should-be (1)** — f8cf0852 replaced the pinned form preview with an upload prompt;
   the records grid still draws its cards. Point the test at the grid's call, or revert that preview change.

---

## Group D2 — delivery / QA / edit guards (11 suites, 20 red tests)

Commits (`agent-patches/D2-delivery-edit/`), oldest first: `5076e8ae` `e351b6c9` `cc3be446` `8c62b64d` `a0fff0b0`
`4d857e95` `dafe9e5f` `a5559a85` `92d87f55`. Code fixes (**R**): `cc3be446` acceptance.ts — a page's widgets were read as
table columns; `92d87f55` ProjectEditTool.ts — «خلي سعر X = Y» was no longer a row edit. The rest are **P**.
Final run on the committed state: `Test Suites: 2 failed, 9 passed, 11 total` · `Tests: 4 failed, 189 passed, 193 total`. `tsc` exit 0.

- **X — phone pass (1)**: «⛔ POSITIVE — only controls the desktop walk never saw» vs 7b3111ab, which deliberately records
  every ANCHOR in the phone pass even when the desktop walk saw its label (live P19: the FAQ link was lost from phone
  evidence). Contradicts the test's «only». Left red.
- **Not finished — every-loop-is-connected (3)**: `UNCOMMITTED-not-mutation-proven.diff` — the brand-rename path ran
  only when nothing had been touched; that guard was dropped, so «Rename the product Gift set on the site to Royal Set»
  renamed the row **and the whole site**. The diff makes the row editor's own edit (`namedRowEdited`) decide. Untested.

---

## Group E — wiring / runtime (14 suites, 37 red tests)

Commits (`agent-patches/E-wiring-runtime/`):
- `326fc053` **R** (culprit a8ebf2e0) — the fast task analysis passed `internalCall: true`, a key the router never reads;
  it now passes `purpose: 'internal'`. Mutation (dead key back): `✕ ⛔ NEGATIVE — no production file passes a key the router does not read`, restore `sha256 identical`.
  **Needs `COMPANION-intelligence-economy.patch`**: `intelligence-economy.test.ts:65` pins `'internalCall: true'` → 22/23 without it, 23/23 with it.
- `2935065b` **P+R** (aa64954a / 76f66a5d) — 76f66a5d put the dependency-free records launch above the only
  `retireRecordedServer` call; retirement now runs before every launch. Red before on real processes
  (`Expected value: "retired previous server pid=19996 port=1"`), 8/8 after. Behaviour change: a preflight failure now also retires the recorded server.

Raw: before `Test Suites: 14 failed, 14 total` · `Tests: 37 failed, 346 passed, 383 total`.
With the uncommitted updates: `Test Suites: 3 failed, 11 passed, 14 total` · `Tests: 5 failed, 382 passed, 387 total`.

**Uncommitted, green, NOT mutation-proven** (`UNCOMMITTED-not-mutation-proven.diff`, 11 suites): wiring-policy (14 tests),
the-run-opens-the-system, terminal-wiring, attachments, run-start-browser-fallback, command-composer-browser-session (3),
project-preview, react-project (2, born red: pass `'win32','x64'` explicitly), deadline, what-orion-got-wrong,
what-you-built-and-what-you-did-not (2, with new behavioural tests). Its per-test table (culprit, decision, root cause
for all 36 tests) is in `agent-patches/E-wiring-runtime/REPORT.md`. `mutate.py` cannot target `web/` files
(it looks for an `api/` parent): CommandComposer.tsx and vite.config.ts guards need a variant.

**Still red:**
- **X1 TOKEN_KEY** (wiring-policy) — the test wants `'joe:auth:' +` (one key per app; the template's own comment still says so);
  0e2ff096 set `'joe:auth'` deliberately (a pathname-scoped token signs the SPA out between root and admin route) and its
  own tests pin it. Previews under Joe's origin at `/project-preview/<session>/` now share one localStorage key.
  Possible resolution: a key scoped by an app id fixed at generation time.
- **X2 adoption with an explicit cwd (2)** (the-run-opens-the-system) — the tests want an explicit cwd to start fresh;
  3917fe1d deliberately lets an explicit matching cwd adopt the recorded server, and its own test forbids `!input?.cwd`.
  Risk: on win32 `canAdoptRecordedLive` checks only pid-alive + recorded cwd (no /proc) — a recycled pid answering on the old port could be adopted.
- **wiring-policy › bug report edits the app** — Expected `"project_edit"`, Received `"project_pipeline"` (left to the coordinator; routing class).
- **ENV — npm-quarantine-integration** (born red, added in faecb501 of PR #88): needs npm ≥ 11 for `npm approve-scripts`.
  npm 10.9.4 here → `Unknown command: "approve-scripts"`, `approvalExit: 1, failedAt: "approval"`. With npm 11.21.1 first
  on PATH it passes (`✓ runs the held install script… (940 ms)`), no network needed. Decide: npm 11 on gate machines,
  or an explicit precondition in the test.

**Defect found, not fixed:** since 0f866ad2 `PhaseExecutorTool` runs a task twice when ≥2 `parallel: true` tasks share a
tool and have no dependencies (`detectParallelGroups` returns both groups with the same ids). Measured with a mocked
executeTool: results `["echo one (parallel)","echo two (parallel)","echo one (parallel)","echo two (parallel)"]`,
`completedTasks 4` of `totalTasks 2`.

---

## Every X in one place — decisions for the owner's approver (Claude, per CLAUDE.md §3.5)

| suite | tests | the two sides |
|---|---|---|
| a-capability-is-not-a-column | 1 | owner's test vs 75e32c75 fixed vocabulary (which also eats real columns) |
| a-page-he-named-is-a-criterion-not-a-column | 2 | owner's verbless examples vs 76f66a5d build-clause rule; `looksLikeBuild` disagrees with `detectAppKind` |
| media-review-contract | 3 | f8cf0852 media archetype vs 76f66a5d explicit field list |
| a-cosmetic-layer-that-starved-the-planner | 1 | owner's test vs 154e231d (stop authoring after one failure, even local Ollama) |
| a-grey-box-where-the-product-should-be | 1 | owner's test vs f8cf0852 upload prompt |
| phone pass (D2) | 1 | «only unseen controls» vs 7b3111ab (keep every anchor, live P19) |
| wiring-policy TOKEN_KEY | 1 | per-app key vs 0e2ff096 shared `'joe:auth'` |
| the-run-opens-the-system adoption | 2 | explicit cwd starts fresh vs 3917fe1d adopt matching cwd |
