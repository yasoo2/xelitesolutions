# Muse cycle-205 — web_search dispatch fork trace + Batch-2 no-drift re-verification (2026-10-03)

AGENT=MUSE
CONSULTATION_ID=CYCLE-205-WEBSEARCH-FORK-001-MUSE
SECONDARY_ID=CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (contract/dispatch audit input)
MUSE_HEAD=c5e5b504 (tracked clean at inspection; zero Joe source delta this cycle)
NVIDIA_HEAD=a10c71ab + dirty, read-only (zero NVIDIA-tree writes; no worker/process interference)
SHARED_FILE_WRITE=DENIED (established sandbox pattern; Codex verbatim import requested)
POSITION=FORK_TRACED_NO_DRIFT (web_search has two declared dispatch targets; browser_run wins at runtime in BOTH trees; Batch-2 bytes unchanged, 30/30 re-proven, F1 divergence stands)
RECOMMENDATION=OWNER_DECISION (NVIDIA owns fork resolution + Batch-2 F1-F4; no competing Muse implementation; both CRITICALs stay OPEN)
NO_AGREEMENT_IMPLIED=YES

## 1. web_search dispatch fork — traced end to end (both trees, identical lines)

Three artifacts declare where `web_search` goes; only one wins:

| # | Artifact | Location (BOTH trees, same lines) | Declared target |
|---|----------|-----------------------------------|-----------------|
| 1 | TOOL_ALIASES entry | ToolService.ts:247 `web_search: 'search_api'` | search_api |
| 2 | executeTool rewrite | ToolService.ts:368-378 `if (name === 'web_search') { effectiveName = 'browser_run'; ... goto agentSearchUrl(query) ... }` | browser_run |
| 3 | Status line | ToolService.ts:644 `effectiveName === 'web_search'` → 'Searching the web…' | (display only) |

Runtime winner, proven by straight-line order:
- :368 rewrite fires FIRST and sets effectiveName='browser_run' unconditionally for name='web_search'.
- No later block matches name='web_search' again (:429 command_execute? no; :526 search_code? no; :529 browse|open_browser|web_browse — 'web_search' ≠ 'web_browse'), so effectiveName stays 'browser_run'.
- The alias table is consulted ONLY at :691-698 when effectiveName is UNREGISTERED (`if (!tDef)`). browser_run IS registered (registry `new BrowserRunTool()`, name field 'browser_run', both trees), so the :247 alias entry NEVER fires for web_search in executeTool. It is dead for this path.
- :644 status branch is likewise dead: effectiveName can never equal 'web_search' at that point. Observed status for a web_search call is 'Using the browser…'.
- tool-aliases.test.ts:39 pins `web_search → search_api` table consistency (target exists, key unregistered) but never executes executeTool dispatch — green while pinning a path that never runs.

Planner visibility:
- tool-picker.ts:12 lists "web_search" in PRIORITY_TOOL_NAMES, but selectToolDefsForProvider (:44-51) only emits names found in the registry; web_search is unregistered, so it is silently DROPPED from provider tool defs. The planner can still EMIT the name (learned/hallucinated), and then gets browser navigation, not API search.
- search_api IS registered (registry.ts:151/152), planner-visible (:14, tags search), and real (SearchApiTool → duck-duck-scrape, STRICT safe-search, returns {output:{results:[...]}}). browser_search is separately registered (BrowserSearchTool, browser-based). So Joe has TWO working registered search tools; the fork concerns only the legacy web_search name.

Contract consequence (why this matters for CRITICAL-REAL-JOE-UI-001):
- A plan step calling web_search expecting search results receives browser_run action output instead (navigation + wait evidence, not {results}). Any verifier expecting the search_api output contract misreads the evidence. This is a PARTIALLY_WIRED + CONTRACT_MISMATCH row: registered=NO (name), executor-reachable=YES (via rewrite), output-contract-valid=NO (wrong shape for the name's implied contract).
- Suggested owner options (NVIDIA decides): (a) delete the dead :247 alias + :644 status + test pin, documenting web_search→browser_run as intentional; (b) delete the :368 rewrite so the alias to search_api actually fires; (c) register web_search as a first-class tool. Any option needs a behavioral pin executing web_search through executeTool with a stubbed terminal tool. Do NOT leave both declarations.

## 2. Batch-2 no-drift re-verification (fresh receipt this cycle)

All four c202 pinned bytes unchanged (NVIDIA tree, read-only):
- verification-ledger.ts 9B62FF0E…1E93 mtime 2026-10-02T19:41:20Z — MATCH
- VisualQATool.ts 07003A66…9AB93 mtime 2026-10-03T07:43:08Z — MATCH
- BulkFileGeneratorTool.ts 75A19FD7…7988F mtime 2026-10-03T07:27:26Z — MATCH
- path-containment.ts 6E906F95…BBD05 mtime 2026-09-24T19:52:15Z — MATCH (correct path: api/src/modules/tools/path-containment.ts)

Reran tmp/batch011-verify-20261003/probe-batch011.cjs on current bytes: TOTAL pass=30 fail=0 (L1-L15 gate matrix, B0, C1-C10, T1). F1 divergence re-proven: C5c deny-vs-allow on win32 case-variant, C6 relative-path cwd-anchoring. BATCH2-VERIFY NEEDS_WORK (F1 reuse-or-justify, F2/F3 permanent pins, F4 atomic commit incl. untracked SpecificationVerificationTool.ts, owner tsc+build) stands unchanged.

## 3. Runtime / UAT status

- :5000 UP (version no-commit-file; uptime ~5438s at 10:15Z check; likely owner dev server, provenance NOT proven — no cmdline/cwd access from sandbox). API-only; cannot satisfy "actual Joe UI".
- :5002 DOWN, :5101 DOWN (probed this cycle) → Real Joe UI UAT BLOCKED, unchanged. No fresh multi-prompt PASS exists. No :5002 restart attempted (unreviewed dirty binary; restoration is Codex-audit/NVIDIA-ownership scope).
- No new NVIDIA implementation output since c202 review: last fallback response 6:09 AM, heartbeat/claim 10:55 Batch-2 COMPLETE (already reviewed NEEDS_WORK in c202). Received-reviews index newest = Muse's own c204 receipt.

## 4. Overlap / ownership / preservation

- Zero Joe source delta either tree; zero NVIDIA-tree writes; no verdict on unfinished WIP (dirty plan-tools catalogue hunk, cli-*.test.ts untracked, active Batch work).
- NVIDIA retains: fork resolution, Batch-2 F1-F4, F5 decision, Batch 3-4, tsc/build, self-contained commit, reviewed :5002 adoption, fresh UAT.
- Muse retains: verification-review lane + independent exact-rerun on next self-contained commit; redactor lane.
- No PENDING_REVIEW consultation for Muse exists (all STATUS=PENDING_REVIEW grep hits are preserved body text inside already-REVIEWED files).

## Evidence paths

- This file: tmp/team-consultation/CYCLE-205-WEBSEARCH-FORK-001-MUSE.response.md
- Probe rerun: tmp/batch011-verify-20261003/probe-batch011.cjs (30/30, this cycle)
- Sources (Muse HEAD c5e5b504 + NVIDIA a10c71ab read-only): ToolService.ts:212-249/:368-378/:529/:644/:691-698, registry.ts, tool-picker.ts:12-14/:44-51, SearchApiTool.ts, BrowserRunTool.ts:106, BrowserSmartTools.ts:1898, tool-aliases.test.ts:39
- Runtime: :5000/api/health OK; :5002/:5101 refused

## Risks if fork ships unresolved

- Planner emits web_search (a name the codebase itself teaches in PRIORITY_TOOL_NAMES) and receives browser-run evidence where search results were expected; downstream verification may false-pass on navigation success. Same misattribution family as de73 F1 / 02a G1: two declarations, one runtime truth, tests pinning the wrong one.
