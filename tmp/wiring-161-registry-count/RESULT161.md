# Wiring-161: registry-count cross-review -- Muse (2026-10-02T20:29Z, HEAD 8b0bb356)

## CLAIM UNDER REVIEW
JOE-WIRING-AUDIT-SUMMARY.md (updated 10/2 23:01 local): "Source Branch: main (e8fd9589)" with
Registered 164 tools (Base 93 + Revived 71).

## VERDICT: PROVENANCE ERROR -- committed main registers 163, not 164
The 164th tool exists ONLY in NVIDIA's uncommitted working tree.

## EVIDENCE (all read-only except workspace-local compare scratch, since removed)
1. Muse HEAD registry (api/src/modules/tools/registry.ts @8b0bb356), hand-counted from source:
   - revivedTools array: 71 entries (70 safeNew + TodoWriteTool object; safeNew(' count = 70).
   - baseTools explicit entries: 90 (32 browser/user + 5 repo_* + 1 ArchitectTool + 2 generators
     + 8 Elite + 5 discovery/API + 24 createTool pipeline/builders + 8 fallback + 5 npm/status/terminal/read/ask).
   - ...MemoryTools spread: 2 (recall_memory, memorize_codebase -- MemoryTool.ts:19-60).
   - Base total = 92. Registry total = 92 + 71 = 163, barring runtime safeNew failures (dedup throws, so no silent loss).
2. Committed main e8fd9589 registry vs Muse HEAD registry: 0 CODE lines differ (30 differing lines are
   all comment/log unicode mojibake from the pipe; safeNew count identical at 70/70). Committed main = 163.
3. SpecificationVerificationTool: ABSENT from committed-main registry AND committed-main definitions tree;
   ABSENT from Muse tree; PRESENT in NVIDIA worktree as an UNTRACKED definition file (9/30) + 2-line
   dirty registry delta (import + createTool). NVIDIA working tree = 164. No other registry delta.
4. The 164th tool is itself under independent REWORK (TEAM-STATE: Muse + NVIDIA reviews both NEEDS_REWORK /
   REJECT_AS_DELIVERY_SUCCESS_GATE on the spec-verifier). Counting it in a "Source: main e8fd9589" row
   misattributes uncommitted, unaccepted work to a clean commit.

## REQUIRED CORRECTION (summary owner)
Either cite the true source ("NVIDIA dirty worktree, date/time") for 164, or correct the e8fd9589 row to
163 (Base 92 + Revived 71). Downstream ratios that use 164 as denominator (planner-visible 24.4%,
executable-to-verifiable 36.6%) shift by <1pt and should be recomputed from the corrected base.

## SCOPE NOTES
- Static registration count only. Runtime safeNew failures could LOWER the live number; the startup log line
  ("Registered N tools (M revived)") on a reviewed build remains the binding runtime count -- not observed this cycle.
- No source changed by this finding (docs/evidence only). No NVIDIA/Codex file modified. NVIDIA work untouched.
- Wiring counters for LIVE-REPORT: DISCOVERED_TOOLS=UNKNOWN, REGISTERED_TOOLS=163 (committed main + Muse HEAD;
  164 = NVIDIA dirty only), EXECUTABLE_TOOLS=UNKNOWN, FULLY_WIRED=UNKNOWN, PARTIALLY_WIRED=UNKNOWN,
  ORPHANED=UNKNOWN, DUPLICATE=0 (registry throws; static), UNKNOWN=163-surface-unreconciled, REPAIRED=0 this cycle,
  VERIFIED=0 new, REAL_JOE_PROVEN=0 this cycle.
