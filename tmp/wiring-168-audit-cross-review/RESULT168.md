# RESULT168 — wiring-audit cross-review evidence (MUSE, 2026-10-03)
HEAD=141c61bebbfd7c7680e0a15ddbde406c37b9a3c0 (tracked clean) | NVIDIA=e8fd9589 dirty (read-only) | e8 bytes via git show/grep

## 1. Registry census (static; assumes all safeNew succeed, no dupes)
Method: probe scripts in this dir (probe-counts.py, probe-new.py, probe-cat2.py, probe-alias.py, probe-flags.py).

| source | safeNew | +TodoWrite | new-X() | createTool | +mem | +arch | STATIC TOTAL |
|---|---|---|---|---|---|---|---|
| Muse HEAD | 70 | 1 | 63 | 26 | 2 | 1 | **163** |
| e8 HEAD (git show) | 70 | 1 | 55+8Elite=63 | 26 | 2 | 1 | **163** |
| NVIDIA dirty | 70 | 1 | 63 | 27 (+SpecificationVerificationTool) | 2 | 1 | **164** |

- Revived static = 71 (70 safeNew + TodoWriteTool); no push/concat. "(90 revived)" matches nothing current.
- Base direct = 92 (Muse/e8), 93 (dirty). "74 base / 90 revived" split is stale (old-binary era).
- MemoryTools = 2 entries both trees. EliteTools exports = 8, all instantiated registry.ts:277-284 both trees.
- Conclusion: summary "164" = dirty-tree static; claimed e8 source = 163. /api/tools returns tools.length (routes/tools.ts:17-18), so the 9/30 runtime "164" belongs to the old binary, not e8 bytes.

## 2. Orphan-but-referenced (F2)
- VisualQATool imported registry.ts:13-14 (Muse) / :14 (e8, git grep single hit = import only); `new VisualQATool(` 0 hits all 3 sources.
- visual_qa refs (identical file set all 3 sources): tools_encyclopedia.md, verification-ledger.ts (:519,:738 ledger-ACCEPTED), ToolService.ts (:74,:562), PhaseExecutorTool.ts (:1737,:2047,:2051), VisualQATool.ts (def; name :13, execute :47).
- generate_image: def name ImageGenerationTool.ts:5, execute :29; 0 instantiations. bulk_file_generator: BulkFileGeneratorTool.ts:6/:42; 0 instantiations.
- => IMPLEMENTED_NOT_REGISTERED >= 3. CAP-006 "all 32 browser tools registered" false.

## 3. Aliases / rewrites (F4/F5/F6)
- Static TOOL_ALIASES = 28 keys (ToolService.ts:217-248) incl web_search->search_api. Matrix table correct.
- Dynamic browser_run rewrites (ToolService.ts): browser_open, browser_get_state (:354), browser_snapshot (:361), web_search (:368 -> browser_run, runs BEFORE alias lookup at :692). browser_ui_audit: 0 occurrences in ToolService both trees.
- scaffold_full_stack->react_project conditional substitution ToolService.ts:390-394 (frontend/backend regex gates). ACTIVE dispatch variant.
- resolvePlannedTool chain confirmed plan-tools.ts:228-261 (exact/alias/normalised/not_software/meaning/nearest).
- Catalogue = 40 both trees (probe-cat2.py full list in log); visual_qa/generate_image/bulk/repo_* NOT in catalogue; doc_generator IS registered (name, not safeNew label).

## 4. Gap-A/B status (F7)
- Flag grep (python, whole api/src): proseObservationPassed/realVerificationPassed = NONE on Muse tree; 3+2 hits ONLY in NVIDIA dirty PhaseExecutorTool.ts; 0 on e8 HEAD (git grep).
- Dirty hunks (git diff, read-only): `let proseObservationPassed=false`, wasOriginallyProse via phase.verificationNote, `realVerificationPassed = !prose && !failed && !unavailable`, verificationNote passthrough.
- gaps-test (NVIDIA dirty): 3x `expect(true).toBe(true); // Placeholder` (Gap-A detect, Gap-B detect, QA persist) + 1 TODO (compactPhaseReceipt); 2 async tests call sanitisePlanPhases only (normalization), never execute/gate a phase. Header "MUST FAIL until fixed" vs 7/7 PASS.

## 5. Real-UI table (F8) — verbatim RESULT headers
- run3 (tmp/uat-critical-ui-run3): "RESULT: PARTIAL", prompt = linecount Node CLI, API :5101.
- run4: "OVERALL RESULT: PARTIAL (run 4a FAIL, run 4b PARTIAL)", :5101.
- run22: "OVERALL RESULT: PARTIAL ... 18th consecutive run", :5101.
- run23: "OVERALL RESULT: PARTIAL ... 19th consecutive run", prompt = community fridge web app, :5101.
- No RESULT file claims SUCCESS or tool counts. REAL_JOE_PROVEN=0 stands.

## 6. BATCH-002 risk (F10)
- RepoSelfCodingTools.ts:9-12 getRepoRoot()=process.cwd()[/..] => Joe's own server tree. .env blocklist :19-23; command prefix-allowlist :66-87 (npm test/build/lint/typecheck/tsc/git diff/status/log); execution via executionEngine.run (shell:true default per BACKLOG 9/30 HIGH_SECURITY finding).
- BACKLOG-RECONCILIATION.md "Focused security finding — 2026-09-30": repo_run_command NEEDS_REVIEW HIGH_SECURITY; proposal REPO-COMMAND-SHELL-BOUNDARY-001 pending. BATCH-002 "Risk: Low" contradicts this record.

## 7. Runtime check (this cycle)
- :5002 /api/health => {"status":"OK","database":"LOCAL","uptime":110194s,"version":"no-commit-file"} — same old binary (started ~10/1 18:37Z). No reviewed runtime loaded; no new UAT attempted (unchanged state; provider+review gates still closed).

## 8. Commands run (all read-only to NVIDIA tree; zero writes outside Muse tmp + sandbox temp)
- git -c safe.directory=... show/grep/diff (read-only), python probes (this dir), Select-String/muse.search reads, one /api/health GET.
- No file in D:\Joe\xelitesolutions modified (verified: no writes issued; dirty set untouched).
- Post-review NVIDIA status NOT re-queried to avoid noise; currency: requested-action.ts hash check skipped this cycle (no CLI-byte claim made beyond "no new position invented").

## Files in this dir
- RESULT168.md (this file), probe-counts.py, probe-cat2.py, probe-alias.py, probe-flags.py, probe-new.py, probe-catalogue.py (superseded parse attempts kept for honesty: 0-entry outputs were regex bugs, corrected by probe-cat2/probe-new).
