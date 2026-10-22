<!-- Verbatim final report of the group D2 sub-agent (2026-10-22T18:12:41.230Z). Not re-verified by the coordinator. -->

I couldn't deliver this through SubagentHandback (it returned "Only the auto-mode classifier can allow SubagentHandback: the session is not in auto mode"), so here is the full report as text.

## D2 report: 16 of 20 tests fixed and committed, 4 still red (3 not finished, 1 conflict for you to decide)

**Worktree:** `/home/user/xelitesolutions/.claude/worktrees/agent-a8deac62932b21ff0`
**Branch:** `worktree-agent-a8deac62932b21ff0`. I fast-forwarded it from 917c70ec to the stated base `4324f0ea` before starting.
**Commits (oldest first):**
- `5076e8ae` records engine split (relations, export)
- `e351b6c9` store item/row
- `cc3be446` acceptance fix
- `8c62b64d` panel
- `a0fff0b0` theme probe
- `4d857e95` phone pass
- `dafe9e5f` terminal
- `a5559a85` scheduling
- `92d87f55` project-edit `=` fix

Nothing is pushed, and `api/node_modules` (a symlink) is not committed.

**Line endings:** `git diff --numstat 4324f0ea HEAD` equals `--ignore-cr-at-eol --numstat` (checked with `cmp`: NUMSTAT_EQUAL).
- `acceptance.ts` is committed with its original mixed endings: 1195 CRLF out of 1418 lines.
- The CRLF damage you found came from the Edit tool, not from `mutate.py`: it rewrote all 206 LF lines to CRLF. I re-applied my change onto the base bytes before committing.
- I re-ran all `acceptance.ts` mutations with the fixed tool.

### Final run on the committed HEAD (all 11 suites)
```
Test Suites: 2 failed, 9 passed, 11 total
Tests:       4 failed, 189 passed, 193 total
```
At the base it was 11 suites failed, 20 tests failed. `npx tsc --noEmit` in `api/` on HEAD: TSC_EXIT=0.

### Per-test table
| suite · test | culprit | decision | root cause | files |
|---|---|---|---|---|
| relations · picker/filter/panel; no-parent app; edit reaches server (3) | 76f66a5d | P | RecordsApp.jsx is now a thin wrapper. The logic moved to `records-controller.js` and the rendering to `RecordsView.jsx`. Every records path in `buildAppFiles` emits all three; static_records refuses relation and API apps. | relations.test.ts |
| an-export · reads visible.length; hands visible to toCsv (2) | 76f66a5d | P | Same split. The NEGATIVE case "no longer reads rows.length" had been passing vacuously on the wrapper. The toCsv case now checks the rows argument of every toCsv call in the button. | an-export-that-exports-nothing.test.ts |
| the-app-is-the-system · «row» vs «item» | 76f66a5d | P | The fallback `\|\| row` became `\|\| null` on purpose: the controller refuses an unconfirmed id. The test now compiles the generated store and runs it (positive + new negative). | the-app-is-the-system.test.ts |
| nothing-is-done · rejected English branch (0 of 3 vs 0 of 6) | 76f66a5d | **R** | `!hasExplicitRecordSchema(t)` let "counter, title, production build" survive as table columns. The remaining guard (`uiOnlyLabel`) kept its own word list, which lacked "production build" and the Arabic article «ال». | acceptance.ts + test |
| panel · wakes BEFORE npm install | 76f66a5d | P | The install was rewritten (ci / install / clean reinstall). The test now checks every `inst = await …` is after the warm-up and before the audit. | panel-shows-the-audit.test.ts |
| panel · «أصلح ما تبقّى» warms too | 30f07853 | P | It now warms `watchSessionId`, the same session the audit borrows. | same |
| panel · nothing AFTER invites to watch | c219da21 | P | 'pressing' was renamed 'discovering'. The test now requires every speaking branch of the handler to be gated on `auditVisible`. | same |
| qa-work-is-reported · theme probe | c219da21 (born red) | P | The pinned `page.click(…2_500)` was replaced inside the same commit. The probe is in try/catch, records the failure and does not rethrow. | qa-work-is-reported.test.ts |
| menu · 390px pass after desktop walk | 76f66a5d | P | `probeOpts()` now takes arguments. | the-menu…test.ts |
| menu · every writer sets `bare` | 7b3111ab | P | The phone context was renamed 'phone:/' → 'جوّال:/' to share the responsive sweep's evidence key; `bare` is still set by all 3 writers. | same |
| menu · only controls the desktop walk never saw | 7b3111ab | **X** | See the conflict below. Test left unchanged and red. | — |
| terminal · server build | 76f66a5d (born red) | P | The pinned line never existed in the source (`git log -S` finds no commit). The code uses `reusableCache \|\| path.join(proj,'.npm-cache')`. | the-terminal…test.ts |
| scheduling · dormant component | 38d84ffc | P | The gate is now `!requestDerivedEngineReady && !unifiedTables`, which skips the provider call in more cases than before. | scheduling-system-contract.test.ts |
| project-text-edit · explicit value verbatim | listed as 38d84ffc; real cause f3cc0023 | **R** | At 38d84ffc the whole suite crashed with a TypeError, then timed out, so it could not see the real cause. f3cc0023 added `isNamedRowTextEditRequest`, whose verb list lacks «خلي». Fix: a field named before `=` counts as an edit. | ProjectEditTool.ts + test |
| every-loop · BOTH site word and name word | 32db3692 | P (not done) | The condition gained `brandRenameIntent && …`. Test not updated yet. | — |
| every-loop · only runs when nothing else handled it | 32db3692 | **R (not done)** | 32db3692 removed `if (!touched.length)` so a brand rename can combine with other edits. Measured side effect: "Rename the product Gift set on the site to Royal Set" renamed the row AND the brand ('Perfume Store' → 'Royal Set'). | uncommitted fix, see below |
| every-loop · tab title too | 32db3692 | P (not done) | index.html is now replaced as a whole file (`html.split(oldBrand).join(val)`) so og:title is renamed too (P17). Remaining risk: a brand that is a substring of markup, e.g. 'root' or 'main'. | — |

### Mutation evidence (production file broken on purpose, restored, every line "sha256 identical")
- **records:**
  - rel1: drop `onSubmit={addParent}` → ✕ Expected substring "onSubmit={addParent}"
  - rel2: `const rel = null` → 2 ✕ "const rel = content.relation"
  - rel3: no apiUpdate on edit → ✕ "apiUpdate(content.api, editing, patch)"
  - rel4 / exp3: wrapper returns null → ✕ Expected "<RecordsView content={content} controller={controller} />"
  - exp1: `disabled={!rows.length}` → 3 ✕
  - exp2: non-parent branch `toCsv(…, rows)` → ✕ Expected /^visible\b/ Received "rows"
- **store:**
  - sys1 / sys3: apiCreate or apiUpdate read only `d.item` → ✕ Expected: 7 Received: undefined
  - sys2: fallback back to `row` → ✕ `- "item": null / + "item": { "id": "local-uid-1", … }`
- **acceptance:**
  - acc1: old word list restored → 3 ✕: `+ "column:text1","column:title","column:text3"` and Expected "0 of 3 requested criteria were proven" Received "⚠️ Delivery blocked: 0 of 6 …"
  - acc2: `every` → `some` → POSITIVE ✕ `- "title","author","rating"`
- **panel:**
  - pan1: warm-up moved after install → ✕ Expected: < 395084 Received: 401289
  - pan2: repair warm-up moved after the audit → ✕ Expected: < 11208 Received: 12508
  - pan3: repair warms PANEL_BROWSER_SID → ✕ /warmBrowserSession\(watchSessionId\)/
  - pan4: 'discovering' branch ungated → ✕ Expected / && auditVisible$/ Received "where === 'discovering'"
- **theme probe:**
  - qa1: catch rethrows instead of recording → ✕ "theme toggle probe:"
  - qa2: awaited click before the try → ✕ not /\bawait\b/
  - qa3: catch records then rethrows → ✕ not /\bthrow\b/
- **phone pass:**
  - menu1: 390 viewport set before the walk → ✕ Expected: > 62923 Received: 62870
  - menu2: phone writer without `bare` → ✕ Expected substring of the `bare` push
- **terminal:**
  - term1: cache fallback to ~/.npm → ✕ npmCache pattern
  - term2: `--offline` always → ✕ offline pattern
- **scheduling:**
  - sched1: gate without `!unifiedTables` → ✕ Expected: > 0 Received: -1
  - sched2: ready flag not set → ✕ flag pattern
- **project-edit:**
  - row1: assignment rule removed → ✕ Expected true Received false, plus ✕ Expected pattern /\{ name: 'الإصدار الفاخر',[^\n]*?price: '99 دولار'/
  - row2: field accepted after `=` → NEGATIVE ✕ Expected false Received true

Full logs are in `/tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad/d2mut/*.log`.

### X conflict — `the-menu-that-only-exists-on-a-phone › ⛔ POSITIVE — only controls the desktop walk never saw`
- **Test intent:** "only controls the desktop walk never saw … Re-pressing forty controls at a second width would spend the whole budget to learn what was already known, and the budget is shared." It pins `const fresh = (phone.controls || []).filter((c: any) => !seenLabels.has(String(c.label || '')));`
- **Culprit 7b3111ab intent** (docs/joe-capability-registry.md): "Preserve every in-page anchor in the dedicated phone pass and skip a later route/viewport sweep only after that exact context completed … retained the FAQ link in phone evidence". Live log P19: "loss of the FAQ anchor from phone evidence".
- **New code:** `c.kind === 'anchor' || !seenLabels.has(...)`. `ProjectEditTool`'s `faqResponsiveLinkReady` needs a phone-context `#faq` anchor.
- **Why I think the test can follow the code:**
  - The filter applies after the probe has already pressed controls (`maxControls: 12`), so it does not change the budget.
  - 7b3111ab also skips the duplicate phone sweep of '/', which saves budget.
- **Suggested resolution, if you agree:** assert (a) controls the desktop walk never saw are recorded, (b) a desktop-seen non-anchor is not recorded again, (c) anchors are recorded, citing P19.

### Unfinished — left uncommitted (only `ProjectEditTool.ts` is modified)
- **Diagnosis:** the every-loop "only runs when nothing else handled it" test protects a row rename from also renaming the brand. 32db3692 dropped `if (!touched.length)` and that hole opened (measured above).
- **Uncommitted fix:** a `namedRowEdited` flag, set only when the row editor writes a named-row edit; the brand path requires `!namedRowEdited`. Combining a brand rename with colour/services edits keeps working.
- **Not verified, not run, no mutations yet.** The three every-loop tests also still need updating:
  - A: condition regex `/if \(!namedRowEdited && brandRenameIntent && siteWord && nameWord && val && val\.length <= 60/`
  - B: assert the flag, plus behavioural cases on a temp project: "Rename the product Gift set on the site to Royal Set" keeps the brand; "غيّر اسم الموقع إلى …" renames the brand and the `<title>`
  - C: `const swapped = html.split(oldBrand).join(val);`
- A copy of the change is at `/tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad/d2-uncommitted-rowowner.patch`. Its line endings are clean (`ProjectEditTool.ts` is LF-only).

### Found but not fixed
- **static_records export:** in `writeDependencyFreeRecordsBundle` (`ReactProjectTool.ts`), the export button has no guard. With zero rows it downloads a header-only CSV and reports "The CSV file is ready to download." That is the same lie the export test guards against, in another output mode (introduced by 76f66a5d). Relations and the API are correctly refused in that mode.
- **Routing (yours):** `hasExplicitRecordSchema` is true for any build request that lists two or more things. As a result `deterministicPhasesFor('Create a page with a counter, title, and production build.')` returns Application/react_project even though `classifyBuildScope` says page. The Gate062 reference prompt still routes to a page.
- **ProjectEditTool filter-persistence path:** it still edits `RecordsApp.jsx`, which is only a wrapper since 76f66a5d. On an app built after that it answers "no longer matches the safe edit contract", even though the controller already persists filters.

### Acceptance-judge regression check
I ran all 29 suites that call `acceptanceFor`/`judgeAcceptance`/`acceptanceBlock`: 26 pass. The 7 failures are in a-page-he-named…, a-page-he-never-chose… and media-review-contract, with failure messages identical to 917c70e.
