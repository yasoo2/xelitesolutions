# Handoff — the red gate on `main` @ `917c70e` (2026-10-22)

From: cloud session `session_01CSeapUrWatvdumdAwyPuqV` ("Diagnose the 70 red Jest suites on main").
To: the desktop session «نظام جو تزامن GitHub» (`session_0185MjM1eRPDykwW7tP8jTaJ`), which continues.
The owner asked this cloud session to hand over everything and stop.

Branch with all reviewed work: **`claude/nice-albattani-007dyv`** (based on `origin/main` = `917c70e`).
Everything below is measured; every number has its command next to it.

---

## 1. What was measured on `main` (before any change)

`bash scripts/gate.sh` on `917c70e`, cloud container (Linux, Node 22.22.0, 4 cores, `NODE_OPTIONS=--use-openssl-ca`):

```
Test Suites: 70 failed, 427 passed, 497 total
Tests:       160 failed, 6398 passed, 6558 total
GATE_TSC_EXIT:0  GATE_WEB_TSC_EXIT:0  GATE_API_BUILD_EXIT:0  GATE_WEB_BUILD_EXIT:0
GATE_JEST_EXIT:1  GATE:FAIL   (real 5m20s)
```

## 2. Classification — 69 real failures, 1 environmental (corrected)

> **⛔ My error, declared.** My first classification said «all 70 real, none environmental». It was wrong for
> **`npm-quarantine-integration`**: that suite needs **npm ≥ 11** (`npm approve-scripts`); this container has npm
> 10.9.4. Agent E found it; I re-measured it myself, same file, same commit (`e4be7fc1`), only `PATH` changed:
> ```
> npm 10.9.4 (default PATH)
>     ✕ runs the held install script through scoped approval plus rebuild in a fresh project (400 ms)
>     -   "approvalExit": 0,
>     +   "approvalExit": 1,
>     +   "failedAt": "approval",
> Tests:       1 failed, 1 total
> npm 11.21.1 first on PATH (cd api && PATH=<npm11>/node_modules/.bin:$PATH NODE_OPTIONS=--use-openssl-ca npx jest --runTestsByPath src/__tests__/npm-quarantine-integration.test.ts)
>     ✓ runs the held install script through scoped approval plus rebuild in a fresh project (878 ms)
> Tests:       1 passed, 1 total
> ```
> **Why I missed it — the class (law 7):** I classified by the *shape of the first error line* (`expect(...)` ⇒ "real")
> instead of by *what produced the value*. Here the asserted value is the exit code of an npm command that does not
> exist in npm 10. Same family as CLAUDE.md §3 category 1 — evidence that matches a form instead of checking the claim.
>
> **What the environment lacks, and the gate:** npm ≥ 11. The product code is coherent — `repairQuarantinedEsbuildInstall`
> (`ReactProjectTool.ts:1425`) is the repair for npm 11's held install scripts, which npm 10 never holds — but the test
> calls it directly on any npm. **Recommendation: do not exclude it silently.** Either give the gate machine npm ≥ 11, or
> have the test (or `gate.sh`) state the precondition by name and print it (e.g. `GATE_PRECONDITION npm>=11: missing (10.9.4)`),
> so "not measured" can never read as "passed". Not changed here — the owner asked this session to hand over and stop.

- Every one of the 70 suites also fails **alone, in band, unloaded**
  (`npx jest --runTestsByPath <file> --runInBand`, two at a time): 70/70 exit 1, 160 failing tests in total.
- First line of every failure block: **154 × `expect(...)`, 6 × `TypeError`** (a test dereferencing a `null`
  the code returned). **Zero** "Exceeded timeout", zero Chromium launch error, zero Mongo connection error,
  zero EADDRINUSE as a failure cause.
- The "environment-looking" counts in the jest log are text inside `Received string` dumps of source files
  (failing `toMatch`/`toContain` on source print the whole file):
  `chromium/playwright` 181 of 182 hits are inside FAIL failure blocks, `Exceeded timeout` 20/20,
  `ECONNREFUSED` 2/2, `EADDRINUSE` 1/1. The 160 `mongodb` hits are the setup line
  `[Config] env=test · storage=JSON · mongo=DEFAULT → mongodb://localhost:27017/joe` printed once per file.
- Environment facts, for the record (no failing suite needs them): Chromium installed at
  `/opt/pw-browsers` is revision **1194**; `playwright@1.58.2` expects **1208**
  (`findChromiumExecutable()` falls back to scanning `PLAYWRIGHT_BROWSERS_PATH`). No `mongod`.
  `setup.ts` forces `PERSISTENCE_MODE=JSON`, `MOCK_DB=true`. Neither browser nor database is needed by any failing
  suite; the one environment need is npm ≥ 11 (box above).
- Two suites were nondeterministic (`local-backend-evidence` 10↔11, `verification-ledger` 20↔21). Root cause
  found and fixed (see §4, commit `4324f0ea`): containment lowercased a path then `lstat`-ed it — on Linux any
  `mkdtemp` suffix with a capital letter broke it, at random.
- Platform-specific: 2 tests in `browser-explicit-url-routing` spelled a Windows path (`'C:\\…\\dist'`) for a
  value the code computes with `path.join` → red on Linux from the commit that added them (fixed, `1ca3d4e6`).
- Clock-specific: 3 capability-decision tests fixed `evidenceCheckedAt: 2026-09-22` against a 7-day window
  → red since 2026-09-29 with no code change (fixed, `e4be7fc1`).

Full per-suite raw first error lines: `classification-raw.md`.

## 3. Bisect — which commit turned each test red

`tools/multibisect.py add39dc8 917c70e` over the first-parent chain (191 commits; `add39dc8` = last recorded
`GATE:PASS`, 2026-08-28, where 60 of the 70 suites existed and all 60 passed). Grid of 12, then binary refine.
Per-test result: `bisect-report.json`; readable: `culprits-by-suite.md`. Totals:

```
30 76f66a5d  PR #90 change-aware verification (157-file squash; its own PR body says the full suite was never completed)
21 130dbca7  verification ledger "reuse regardless of fingerprint"
14 fa810595  "adaptive reasoning-first intent classification" (a second intent reader)
12 c219da21  Harden Joe language understanding and browser QA
11 46712be6  ledger: lowercased containment
 8 0e2ff096  Strengthen Joe browser QA and repair loop
 7 3917fe1d  Strengthen Joe full-stack workflow execution and QA
 4 each      862ba27b, 32db3692, 81e8913c
 3 each      97fa9f0d, a9b88495 (+3 born red), 75e32c75, 38d84ffc, 1f94c928
 2 each      902b9686, 3d0b0be6, 0f866ad2, 7b3111ab, 601644e1, f8cf0852, c51f14e6 (born red)
 1 each      9c91d6a7, 82179eeb (merge of PR #88), 30f07853, 3e3ea28f, 49af37f2, aa64954a,
             5d2cac0e (born red), 154e231d, a8ebf2e0, 27ef9406 (= the random flake, not a culprit)
```

The process root cause (law 7, the class above the class): **nothing enforces the gate on `main`.**
GitHub Actions is off; ~190 commits landed between `add39dc8` and `917c70e` and several messages claim
"all tests pass" after running a handful. Every red here entered that way.

## 4. Fixed and committed on `claude/nice-albattani-007dyv` (reviewed, each proven by breaking it)

| commit | suites (tests) | decision |
|---|---|---|
| `4324f0ea` | verification-ledger (20–21), local-backend-evidence (10–11), one-reader-for-one-security-question (1), change-aware-phase-verification (2) | **R** — reuse only on equal fingerprint; containment through `isWithinRoot`; no `NODE_ENV=test` identity; `.engineering-checkpoints` ignored. `test:joe:engineer-flow` still PASSES with the strict ledger. |
| `8c33038b` | a-question-is-not-an-order (3), a-substitution-is-declared-not-silent (1), people-ask-they-do-not-command (1), three-features (1), explicit-file-contract (1), build-without-a-brain «بنِ» (2), wiring-policy "bug report edits the app" (1), routing-immunity (1→2), a-pattern-written-with-the-article (2) | **R** — one reader per routing question: call sites back on `buildIntent.ts` (the guarded reader), `intent-classifier.ts` deleted; run/stop/publish guards moved to `lifecycle-order.ts` and the capability scorer asks it. New guard `run-stop-publish-have-one-reader.test.ts`. |
| `c159efb8` | error-recovery (2), no-brain-no-recovery (1), build-without-a-brain quota (2) | **R+P** — FAILURE_RECOVERY_RULES shared by both planner prompts; deleted «why» comments restored; dead-brain guard bounded (the old one was vacuous — measured). |
| `ad915a38` | project-pipeline (2), a-short-order-is-still-an-order (1), repair-remaining (1) | **P** — guards follow deliberate refactors (`usable` wrapper; `projectEditPlan` builder). |
| `1ca3d4e6` | import-project (1), browser-explicit-url-routing (2) | **R** — negated open clauses («ولا تفتح Pull Request») no longer read as open intent; **P** — paths computed with `path.join`. |
| `c7733f4b` | a-noun-is-not-a-command (3) | **R** — web signals before the capability candidate in `quickIntent`. |
| `e4be7fc1` | capability-decision-profiles (2), capability-decision-tool (1) | **P** — clock is an input; in-window and past-window both asserted. |

Every commit message carries its raw mutation evidence (each mutation restored byte-identical).

`bash scripts/gate.sh` on this branch at `e4be7fc1` (same container; 498 files = 497 + the new guard):

```
Test Suites: 48 failed, 450 passed, 498 total
Tests:       91 failed, 6480 passed, 6571 total
GATE_TSC_EXIT:0  GATE_WEB_TSC_EXIT:0  GATE_API_BUILD_EXIT:0  GATE_WEB_BUILD_EXIT:0
GATE_JEST_EXIT:1  GATE:FAIL   (real 4m44.870s)
```

## 5. NOT finished — what remains, with diagnosis

### 5a. Mine, diagnosed, not committed
- **the-planner-asks-the-tools** — 2 tests (culprit `a9b88495`): «طوّر نفس المشروع الحالي دون إنشاء مشروع جديد… وأضف اختيار العملة»
  with a selected workspace → `decide_capability_route` (the capability **router** in `generatePlan`, ~line 1706,
  runs before the surgical-edit route and only yields to an open *page*). A yield on "names the current project"
  fixes both tests but was **measured too broad** and reverted: with a project selected,
  «افحص أمان المشروع الحالي فحصاً أمنياً» and «اضغط ملفات المشروع الحالي في أرشيف zip» went to `project_edit`
  (they must keep `security_scanner` / `archive_files`). Recommended: yield only when a project is in front AND
  the request forbids a new project or carries an edit/extend verb; add those two requests as NEGATIVE guards.
- **a-container-he-named-is-not-a-website** — 3 tests (`76f66a5d`): the clarifying question prints
  «undefined» where the container word should be — not yet investigated.

### 5b. Delegated to four sub-agents (unreviewed by me) — see `AGENTS-REPORTS.md`
Groups (task files here): **C** schema/columns (10 suites), **D1** builder/QA guards (11), **D2**
delivery/QA/edit guards (11), **E** wiring/runtime (14, incl. `wiring-policy` with 15 tests). Their status,
branches and commits are in `AGENTS-REPORTS.md`. **Review every agent commit before merging** — I asked for
mutation proof on each but did not re-run it (I did count their raw logs: 63 mutations, 63 × `jest exit 1`,
63 × `sha256 identical`).

**Combined measurement** — `bash scripts/gate.sh` in a scratch worktree = this branch (`e4be7fc1`) + all 24
committed agent patches (C 4, D1 9, D2 9, E 2, applied with `git am`) + `COMPANION-intelligence-economy.patch`;
**without** the two `UNCOMMITTED-*.diff`:

```
Test Suites: 21 failed, 477 passed, 498 total
Tests:       51 failed, 6533 passed, 6584 total
GATE_TSC_EXIT:0  GATE_WEB_TSC_EXIT:0  GATE_API_BUILD_EXIT:0  GATE_WEB_BUILD_EXIT:0
GATE_JEST_EXIT:1  GATE:FAIL   (real 5m0.628s)
```

The 21 red suites, each with its owner (8 + 3 + 9 + 1 = 21):

| why still red | suites |
|---|---|
| **X — a test contradicts a later deliberate change; needs a decision** (8) | a-capability-is-not-a-column · a-page-he-named-is-a-criterion-not-a-column · media-review-contract · a-cosmetic-layer-that-starved-the-planner · a-grey-box-where-the-product-should-be · the-menu-that-only-exists-on-a-phone · the-run-opens-the-system · wiring-policy |
| **diagnosed, not finished** (3) | the-planner-asks-the-tools (§5a) · a-container-he-named-is-not-a-website (§5a) · every-loop-is-connected (D2's uncommitted diff) |
| **green only with E's `UNCOMMITTED-not-mutation-proven.diff`** (9) | attachments · command-composer-browser-session · deadline · project-preview · react-project · run-start-browser-fallback · terminal-wiring · what-orion-got-wrong · what-you-built-and-what-you-did-not |
| **ENV — npm ≥ 11** (1) | npm-quarantine-integration |

Every failing test of this run with its first raw error line: `combined-run-fails.txt` (51 tests in 21 suites —
the same counts as the gate's lines; parsed from the 9.6 MB jest log with `tools/parse_fails.py`).

## 6. Open product findings (not test problems)
1. **Capability catalogue evidence is a time bomb** (`core/capabilities/decision-profiles.ts`): fixed
   `evidenceCheckedAt: 2026-09-22` + 7-day window + no refresh path → since 2026-09-29 Joe can claim **no**
   built-in route as proven. Needs real re-verification (a probe), not a newer date.
2. **Arabic first-person how-to reads as an order**: `isKnowledgeQuestion('كيف أنشر المشروع؟')` → false,
   because folding turns «أنشر» into the imperative «انشر». Not guarded by any test today.
3. **`mutate.py` (my tool) once rewrote CRLF files to LF** while reporting "identical" — fixed (byte-exact,
   mixed-ending aware). `AgentOrchestrator.ts` is mixed-ending; `acceptance.ts`, `ProjectRunTool.ts` and ~15
   others are CRLF. Check `git diff --numstat` == `git diff --ignore-cr-at-eol --numstat` before committing.
4. The other Claude session's channel sweep (PR #82, 2026-10-22 15:20) asked for exactly this gate output.
5. **Parallel tasks that share a tool run twice** since 0f866ad2 (`PhaseExecutorTool`; agent E, measured with a mocked
   executor: `completedTasks 4` of `totalTasks 2`). Not fixed, not guarded.
6. **Arabic status defaults are repair-shop states** («قيد الإصلاح / تم الإصلاح») and apply to every Arabic status
   column (agent C).

## 6b. What I recommend next, in order
1. Merge this branch's 7 commits (reviewed, mutation-proven) into your tree.
2. Review and `git am` the agent patches group by group; run each group's suites, then the gate.
3. Mutation-prove E's uncommitted test updates (needs a `web/`-capable `mutate.py`), then commit them.
4. Decide the 8 X conflicts (table in `AGENTS-REPORTS.md`), the npm ≥ 11 precondition, and §5a.
5. Then — the class above all of it — make the gate run on every push to `main` (§3), or it will be red again.

## 7. Coordination — so nothing breaks
- This branch is based on **`origin/main` `917c70e`**. Your D:\ tree is **6 commits ahead** (`f40f6100`) with
  ~172 untracked files under `api/src` and ~14 under `web/src`, synced to `sync/d-local`. Merge this branch
  into your tree **deliberately** (not by snapshot), then run `bash scripts/gate.sh` there: your tree has ~599
  test files, this measurement covered 497.
- Nothing here was pushed to `main` (CLAUDE.md). The owner's PowerShell update line pulls `main`, so none of
  this reaches Joe on his machine until it is merged.

## 8. Tools (in `tools/`, adapt the `SP`/`WT` paths at the top)
- `multibisect.py GOOD BAD` — per-test bisect over the first-parent chain; caches per commit.
- `probe.sh <commit> <list> <out>` — runs a list of suites at a commit in a scratch worktree (batches of 12).
- `mutate.py <label> <file> <old.txt> <new.txt> [...] <jest args>` — break, run, restore, verify sha256 of bytes.
- `parse_fails.py <jest.log>` — per-suite failure blocks with the first raw error line.
