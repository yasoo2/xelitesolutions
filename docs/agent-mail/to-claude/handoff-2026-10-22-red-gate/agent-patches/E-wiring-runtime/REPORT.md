<!-- Verbatim final report of the group E sub-agent (2026-10-22T18:13:13.920Z). Not re-verified by the coordinator. -->

## Group E report: stopped on the coordinator's WRAP UP order

**Worktree:** /home/user/xelitesolutions/.claude/worktrees/agent-a951111086853d836
**Branch:** `worktree-agent-a951111086853d836`. I fast-forwarded it from 917c70ec to the brief's base `4324f0ea`.

**Commits (2):**
- `326fc053` fix(router): use the key the router reads for the local-first task analysis
- `2935065b` fix(project_run): retire the session's previous server before every launch

**Not pushed.** Files were added by name only; the node_modules symlinks were not added.

**Line endings:** checked on every committed file. For each one, `git diff --numstat` equals `git diff --ignore-cr-at-eol --numstat`. The figures were 9/5 for ProjectRunTool.ts, 117/5 for a-server-that-outlives-its-round.test.ts (all CRLF, written as CRLF) and 6/1 for intelligent-router.ts.

**tsc:** `TSC_EXIT=0`.

### Left uncommitted, as you ordered
The test-only updates (decision P) are in the working tree for 11 suites and are **green**. **I did not run mutation proofs on any of them.** They are also saved as a full diff at:
/tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad/groupE-uncommitted-P-tests.patch

Note that `mutate.py` cannot target `web/` files (it looks for an `api/` parent). The CommandComposer.tsx and vite.config.ts guards need a variant of the tool.

### Raw jest lines
- **Baseline at 4324f0ea:** `Test Suites: 14 failed, 14 total` · `Tests: 37 failed, 346 passed, 383 total`
- **Final, all 14 suites (committed fixes plus the uncommitted test updates):** `Test Suites: 3 failed, 11 passed, 14 total` · `Tests: 5 failed, 382 passed, 387 total`
- **The 5 still failing:** 3 conflicts (X), the SKIP routing test, and the npm environment test (see below).
- **4 new tests:** two behavioural retirement tests (committed), one behavioural ghost-tool test on both paths, and one behavioural failed-task test on both paths (both uncommitted).

### Per-test table
| # | Suite › test | Culprit | Decision | Root cause | State |
|---|---|---|---|---|---|
| 1 | wiring › event with no address inherits its run | 76f66a5d | P | runId became `canonicalRunId` (`goal.runId‖traceId‖id`); userId and sessionId owner unchanged | uncommitted, green |
| 2 | wiring › app templates…scaffolder reaches them | 38d84ffc (+46e6d5d1) | P | AdminPanel now gated `!appBp && admin` (App.jsx imports it under the same flag); brochure also skipped for `externalIntegration` | uncommitted |
| 3 | wiring › feed branch written to disk | 0e2ff096 | P | `fileAuthJs(roleSpecs)`, `fileEntitiesJs(model, requestForReading)`; now asserted on the feed branch only | uncommitted |
| 4 | wiring › feed not told of an orders table | 3917fe1d | P | `&& !workflowApi` added | uncommitted |
| 5 | wiring › console error names its resource | 862ba27b | P | location read once (`consoleLocationUrl`); now also asserts `+ where` reaches `consoleErrors.push` | uncommitted |
| 6 | wiring › fatal answer persisted before release | 49af37f2 | P | `persistChatStores` became synchronous `flushChatStores`, still before `releaseHandle` | uncommitted |
| 7 | wiring › chat history served in offline mode | 32db3692 | P | one decision `usesLocalChatStore()` covers OFFLINE_MODE and JSON; the early `{events:[]}` return is gone | uncommitted |
| 8 | wiring › stop clears the session | c219da21 | P | the POST to `runs/stop` moved into the `requestStop` helper; `if (rid ‖ sid)` still calls it | uncommitted |
| 9 | wiring › executor checks the tool again | 76f66a5d + 0f866ad2 | P | `continue` became `return` inside `executeSingleTask` (shared by both paths); a ghost verification tool is now refused through `isVerificationTool` instead of being swapped for project_detect. **Measured on both paths:** the ghost is skipped, never executed, never counted | uncommitted, plus a new behavioural test |
| 10, 34 | wiring + what-orion › discovery runs first | 3d0b0be6 | P | `let discoveryPath = projectPath ‖ persistedUserRoot` | uncommitted |
| 11 | wiring › schema from the same blueprint | 3917fe1d / 76f66a5d | P | `selectedColumns` plus the requested status column; `fileDbJs(..., !workflowApplication)`; interface half now asserted | uncommitted |
| 12 | wiring › parent table reaches db, routes, UI | 3917fe1d | P | `fileServerJs(..., privateWorkflow, workflowApplication)` | uncommitted |
| 13 | wiring › one system never borrows another's session | 0e2ff096 | **X** | see conflicts below | unchanged, red |
| 14, 15 | wiring › accounts screen written / shell imports and renders it | 0e2ff096 | P | roles added to the arguments; now tested on `buildAppFiles` output with and without a server | uncommitted |
| 16 | wiring › interface packaged into the server | 76f66a5d | P | `apiEntry` is this session's own API, or a linked API dir proven inside the workspace by realpath | uncommitted |
| SKIP | wiring › bug report edits the app | (coordinator) | — | Expected `"project_edit"`, received `"project_pipeline"` | untouched |
| 17 | run-opens › unconfirmed server gives an explicit failure | 75e32c75 | P | the static-bundle fallback pushed the failure past the fixed 2600-char window; window is now the whole block, and the fallback's success requires an HTTP answer | uncommitted |
| 18, 20 | run-opens › probes remembered address / explicit cwd starts fresh | 3917fe1d | **X** | see conflicts below | unchanged, red |
| 19 | run-opens › adoption needs a real HTTP answer | c219da21 | P | `fetch` became `http.get`, same `<500` threshold; timeout and error still mean "no" | uncommitted |
| 21 | terminal-wiring › live stream not flushed twice | 3917fe1d | P | branch inverted: lines already streamed are recorded as spoken; the flush lives only in the `else` | uncommitted |
| 22 | attachments › echo and stored message carry chips | 862ba27b | P | stored content is now `submittedText` | uncommitted |
| 23 | run-start › session resolved before trace | 862ba27b | P | `startTrace(runSessionId, executionText)` | uncommitted |
| 24–26 | composer browser session (3 tests) | c219da21 | P | the composer now creates the session itself (`runSessionId`) before the browser session is derived | uncommitted |
| 27 | project-preview › proxy to the API | a9b88495 | P | target is `JOE_API_TARGET ‖ 'http://127.0.0.1:5000'` (default unchanged; UI stays on port 5002) | uncommitted |
| 28 | a-server-outlives › retirement before launch | aa64954a (P) + **76f66a5d (R)** | P+R | the dependency-free records launch, added in 76f66a5d, ran before the only retirement call | **committed 2935065b** |
| 29 | a-flag › no file passes a key the router ignores | a8ebf2e0 | **R** | `internalCall: true` is read by nothing; the router reads `purpose` | **committed 326fc053** |
| 30, 31 | react-project › Rollup probe / probe timeout | 5d2cac0e / 76f66a5d (born red) | ENV | see environment findings | uncommitted, green |
| 32 | npm-quarantine | 82179eeb (born red; added in faecb501 of PR #88) | ENV | see environment findings | unchanged, red |
| 33 | deadline › every node branch under a deadline | 862ba27b | P | the fifth branch now fails closed (`unplanned_execution_node`); the four executing branches are named. Branch adae4a63 made the same 5→4 count change | uncommitted |
| 35 | what-you-built › failed task reports its error | 0f866ad2 | P | `task: formatTaskDesc(taskDesc)`; error still comes first. Behavioural test added on both paths | uncommitted |
| 36 | what-you-built › every message relayed | 3e3ea28f | P | message passes `guardUnverifiedBuilderClaims` and `redactDeliveryCredentials`; relay now measured through `buildDeliveryReport` | uncommitted |

### Proof for the two commits
**R-router (fixed mutate.py, putting the dead key back):**
```
=== MUTATION R-router-dead-key (api/src/core/llm/intelligent-router.ts) — jest exit 1
   ✕ advanced analysis respects local-first mode instead of bypassing the router
   Expected substring: "purpose: 'internal',"
   ✕ ⛔ NEGATIVE — no production file passes a key the router does not read
   Tests:       2 failed, 26 skipped, 28 total
=== RESTORED R-router-dead-key: sha256 identical
```
The first ✕ needs the out-of-group patch below, which I applied temporarily and then reverted with `git checkout`.

- **Side effect out of my group:** `intelligence-economy.test.ts:65` pins the dead spelling (`toContain('internalCall: true')`). With 326fc053 it shows **22/23**.
- **The fix for it** is a one-assertion patch that checks `purpose: 'internal'` on the local-first call. Measured: 23/23 with it. Patch: /tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad/groupE-intelligence-economy.patch
- **My error, declared:** my first code comment repeated the literal `internalCall: true`, which made that out-of-group test pass by accident. I removed it before committing.

**R-retirement:** red before the fix, on unchanged production code and real processes:
```
✕ a retirement exists...  "launch": "startStaticBuildPreview(dependencyFreeBundle, port)", - "retiredFirst": true + "retiredFirst": false
✕ a dependency-free records bundle does not start beside the previous preview
  Expected value: "retired previous server pid=19996 port=1"
  Received array: ["project_run: ignored stale or unowned live record (http://127.0.0.1:1/)", "project_run: serving dependency-free records bundle (…/next-app/dist)", "✅ The dependency-free local records app is live — preview: http://127.0.0.1:32887/"]
✓ …and neither does a managed server (770 ms)
```
- **After the fix:** 8/8 in the file. project-run.test.ts and a-preview-that-outlives-every-round.test.ts are green.
- **Behaviour change:** a preflight failure (bad launcher, missing dependency, syntax error) now also retires the session's recorded server. `stopServer` already did this for servers held in memory.

### X conflicts (left red, your decision)
**X1, test #13 (TOKEN_KEY):**
- **The test:** `expect(T()).toMatch(/const TOKEN_KEY = 'joe:auth:' \+/)`. The template's own comment still says: "The token is kept per app, so two Joe-built systems on the same machine do not borrow each other's session."
- **The culprit (0e2ff096):** "// localStorage already belongs to one origin. A pathname-scoped token signs the same SPA out when it moves between its root and admin route." It set `const TOKEN_KEY = 'joe:auth';`. Its own tests pin that value: api-project.test.ts (`"const TOKEN_KEY = 'joe:auth';"`), `tokenStorageKey: workflowApplication ? 'joe:auth'`, and app-audit `tokenStorageKey: c.tokenStorageKey || 'joe:auth'`.
- **What I found (not measured live):** previews served under Joe's own origin at `/project-preview/<session>/` share one localStorage. Two systems in the preview panel now share the key, where the old pathname scope kept them apart.
- **Possible resolution:** a key scoped by an app id fixed at generation time would satisfy both sides.

**X2, tests #18 and #20 (adoption with an explicit cwd):**
- **The tests** pin `if (!input?.cwd && !input?.command && liveUrl && canAdoptRecordedLive(live, cwd) && await answersHttp(liveUrl))` and the title "an explicit cwd or command still starts fresh — adoption is the default only".
- **The culprit (3917fe1d):** "// An explicit cwd is often the pipeline's strongest handoff evidence. It must not disable adoption when the recorded server belongs to that exact cwd; doing so starts a second server and can collide with an older listener on the other loopback address family." Its own test, project-run.test.ts "an explicit matching cwd keeps the verified server handoff adoptable", asserts `expect(adoption).not.toContain('!input?.cwd')`.
- **Risk to weigh:** on win32, `canAdoptRecordedLive` checks only that the pid is alive and the recorded cwd matches; there is no /proc cwd check. A recycled pid with something answering on the old port could therefore be adopted for an explicit cwd. That is the risk the older guard fenced off.

### Environment findings (born-red tests)
**#30–31 (react-project):**
- **Assumption:** the tests call `findBrokenNativeBuildTool(tmp, exec)`, so the default `platform = process.platform` applies, which is `linux` here. The function returns null before probing.
- **Proof:** a temporary probe (deleted after use) reported `process.platform` as `win32` on this Linux x64 host. The unchanged calls returned `BROKEN rollup` with `EXECUTED [esbuild --version, rollup --version]` and `TIMEOUT indeterminate`; the dependency tree also passed its Windows checks (`TREE true`).
- **Change (uncommitted, green):** pass `'win32', 'x64'` explicitly, as the sibling Linux test already does with `'linux'`.

**#32 (npm-quarantine):**
- **Cause:** it needs npm ≥ 11 for `npm approve-scripts`. This machine has npm 10.9.4: `Unknown command: "approve-scripts"`, exit 1, which is the `approvalExit: 1, failedAt: "approval"` failure.
- **Proof:** with npm 11.21.1 first on PATH (installed in the scratchpad), the test passes: `✓ runs the held install script… (940 ms)`. It does not need the network (the dependency is a local `file:` package).
- **Left red, test unchanged.** It needs a decision: npm 11 on the gate machines, or an explicit precondition in the test.

### Defect found in passing (not fixed, outside my tests)
PhaseExecutorTool (0f866ad2) runs a task twice when two or more tasks marked `parallel: true` share a tool and have no dependencies.
- **Cause:** `detectParallelGroups` returns both the "no deps" group and the "same tool" group with the same step ids, and `buildExecutionGroups` adds both.
- **Measured with a mocked executeTool:** two parallel `echo` tasks gave results `["echo one (parallel)","echo two (parallel)","echo one (parallel)","echo two (parallel)"]`, `completedTasks 4` of `totalTasks 2`, and executeTool was called 4 times.

### What the next session should do
1. Run `mutate.py` on each uncommitted P update; a web-capable variant is needed for #8 and #24–27.
2. Commit those updates.
3. Apply the intelligence-economy patch together with 326fc053.
4. Decide X1, X2 and the npm-11 requirement.

**My error, declared:** my first negative check in #15 matched the bare word "Accounts", which the sign-in help sentence legitimately contains. I narrowed it to the import line and the `<Accounts` element.
