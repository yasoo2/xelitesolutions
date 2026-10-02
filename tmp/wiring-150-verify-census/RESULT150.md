# WIRING-150 -- Verification-allowlist census + Level-6 evidence cross-review (Muse independent)

MUSE_HEAD=692ca9633348ab7d5b0c2b6ea217c18929b8d0e9 (tracked CLEAN at probe time; all 150 outputs new under tmp/wiring-150-verify-census/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
COMMITTED_MAIN=e8fd9589dcee5a5fb41f3fc31873b0a8d1f6838a (via read-only `git show HEAD:...`)
DATE_UTC=2026-10-02T17:2xZ (this cycle)
METHOD=source read at exact revisions + read-only NVIDIA diff + preserved run RESULTs. Zero dispatch, zero chats, zero source edits.

## TRIGGER
Shared outputs JOE-WIRING-AUDIT-SUMMARY.md + JOE-CAPABILITY-WIRING-MATRIX.md (NVIDIA, 10/2 ~19:5x local)
claim EXECUTABLE_NOT_VERIFIABLE=~20 (summary) vs ~100 (matrix), "Only ~60 tools in allowlist",
Level-6 Real-UI check x8, FULLY_WIRED=8 with two "(untested)", and "No code defects in canonical path".
Wiring-149 reconciled 163-vs-164; this battery adjudicates the verification + Level-6 claims from source.

## CENSUS 1: isVerificationTool allowlist (exact names at three revisions)

Unconditional 13-set is BYTE-IDENTICAL in all three lines:
quality_run, auto_tester, code_reviewer, browser_console_scan, browser_ui_audit,
browser_contrast_audit, browser_check_links, browser_performance, dependency_audit,
secrets_scan_repo, browser_run, browser_responsive_check, visual_qa
- Muse HEAD: verification-ledger.ts:735-739
- Committed main e8fd9589: same lines via `git show` (verified identical)
- NVIDIA dirty: same set (diff context lines unchanged)

Conditional branches per line:
| branch | committed main | NVIDIA dirty | Muse HEAD |
|---|---|---|---|
| signature | (tool,args,explicitlyMarked) | + allowExistenceObservation | + allowExistenceObservation + allowLiveRunCheck |
| shell_execute test-runners only | YES | YES (unchanged) | YES (unchanged) |
| read_file existence observation | NO | YES (added, +26/-1 diff) | YES |
| project_run live check | NO | NO | YES (allowLiveRunCheck) |
| TOTAL acceptable names | 14 | 15 | 16 |

Derived EXECUTABLE_NOT_VERIFIABLE (registered minus acceptable names):
- Committed main: 163 - 14 = 149
- NVIDIA dirty: 164 - 15 = 149
- Muse HEAD: 163 - 16 = 147

## CENSUS 2: corroborated headline counts (this cycle, Muse HEAD)
- PLANNER_TOOL_CATALOGUE entries = 40 (`tool: '` lines, plan-tools.ts:77-126; the raw `tool:` grep hits 41 incl. the type annotation line 77)
- RAW def files = 93 (muse-worktree definitions/*.ts)
- NVIDIA dirty ledger diff = EXACTLY the Muse-direction read_file existence-observation branch (+26/-1); no 13-set change, no shell_execute change. Convergence, not divergence. project_run live-check remains Muse-only.

## CENSUS 3: Level-6 evidence audit (matrix "Real Joe Proven Capabilities" table)
Cited runs re-read from preserved Muse RESULTs:
- run3: PARTIAL. PROMPT3.txt = linecount CLI (Node.js CLI tool). Matrix row says "weather dashboard" -- MISLABELED.
- run4a: FAIL (built React app for the CLI prompt; honest stop, finalVerified=false).
- run4b: PARTIAL (deliverable fully correct, 8/8 independent checks incl. npm test exit 0; PARTIAL on command PASS criterion).
- run22: PARTIAL (fresh app + 9/9 deliverable checks, Browser QA 92/100, honest incomplete-verification report).
- engineer-flow: fixture PASS -- controlled mock planner, NOT Real Joe UI (AGENTS.md limitation).
No cited run is a Real-Joe PASS. No run evidence is cited at all for API/Backend, Web Page (beyond run22 PARTIAL), Browser, File Ops, or AI Generation Level-6 checks.

## VERDICTS ON SHARED-OUTPUT CLAIMS (Muse independent position)
1. EXECUTABLE_NOT_VERIFIABLE ~20 (summary) vs ~100 (matrix) -- BOTH FALSIFIED + INTERNALLY CONTRADICTORY. Source census gives 149/149/147. The matrix's "~60 tools in allowlist" is false (14-16 names). One number must be picked and pinned to tree+dirty. (OBS-150-1 P2)
2. Matrix verification-table row "auto_tester | testType in [...]" -- INACCURATE. Source accepts auto_tester unconditionally (ledger :735-739 all three lines). Minor; correct the row. (folded into OBS-150-1)
3. Level-6 Real-UI check x8 -- UNSUPPORTED by cited evidence. Downgrade: CLI/Scaffold already PARTIAL (correct); React PARTIAL (run22/run4b class); API/Web/Browser/FileOps/AI-Gen to UNVERIFIED/REPORTED_BY_NVIDIA until a cited PASS run exists. (OBS-150-2 P2, extends OBS-149-3)
4. run3 "weather dashboard" row label -- WRONG. run3 = linecount CLI. Correct or re-cite. (folded into OBS-150-2)
5. FULLY_WIRED (untested) for GitHub/Database with REAL_JOE_PROVEN=NO -- CONTRADICTS the audit's own FULLY_WIRED definition (evidence of connection through intended production path). Reclassify to UNKNOWN_REQUIRES_INVESTIGATION or PARTIALLY_WIRED pending Level-4 proof. (OBS-150-3 P3)
6. "No code defects found in canonical path" -- UNPROVEN AS STATED (PARTIAL). Gap-A mechanism (object-gate only, PhaseExecutorTool.ts:2302 at Muse HEAD) is present by design with honest voice ("tasks done, not verified", AgentLoopService.ts:295-299); NVIDIA's required negative integration tests (UI-001 follow-ups 1-2) remain unimplemented. The 1cf1102f contract-death fix stands (run4b/run22: zero contract deaths).
7. CONFIRMED this cycle: catalogue 40, def files 93 (committed/Muse), 13-set identical across lines, NVIDIA dirty converges on read_file observation branch.

## DISCLOSURES / LIMITS
- Census is static-source + preserved-evidence only (Level 1-2); no new runtime dispatch, no new UAT (provider-blocked, see feas-bo).
- NVIDIA tree touched READ-ONLY (git show/diff + file reads; outputs only in Muse workspace). NVIDIA HEAD e8fd9589, ~46 dirty/untracked paths, planner/executor/pipeline/EVAL-006 scope, untouched.
- No source changed this cycle (docs/evidence only); tracked api/ + web/ delta = 0 lines.
- Verdicts 1-5 are review findings for NVIDIA/Codex disposition, not implementation; Muse starts no competing patch (NVIDIA owns ledger/planner scope, actively dirty).
