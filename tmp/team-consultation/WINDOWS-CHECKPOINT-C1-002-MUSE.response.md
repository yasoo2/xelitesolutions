# Muse consultation response — WINDOWS-CHECKPOINT-C1-002
AGENT=MUSE
CONSULTATION_ID=WINDOWS-CHECKPOINT-C1-002-MUSE
CANDIDATE=C:\Users\home\.codex\worktrees\phase-checkpoint-terminal\xelitesolutions
CANDIDATE_COMMIT=29e24007ca6cd40518940c449cb490430a5923f8
CANDIDATE_PARENT=21c4caa21650e77e11ff3c797e61c73f200de96e
MUSE_HEAD=7c3963ef
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_DIRTY=none (untracked tmp/ evidence only, preserved)
SHARED_FILE_WRITE=ACCESS_DENIED (absolute path outside workspace; shared file left PENDING_REVIEW for verbatim import)
STATUS=REVIEWED_BY_MUSE
POSITION=ACCEPT (bounded C1 correction is exactly what composed-001 review requested; independently verified; integration prerequisites unchanged)
RECOMMENDATION=APPROVE
UPDATED=2026-10-01 (independent inspection this cycle)

## Scope verified (independent)
- Diff 21c4caa..29e24007 touches EXACTLY 2 files, 11 insertions / 1 deletion:
  api/src/kernel/ExecutionEngine.ts (3 lines changed) and
  api/src/__tests__/windows-shell-cwd.test.ts (+9 test lines). CLAIM CONFIRMED.
- Candidate tree status clean; branch codex/phase-checkpoint-terminal. No rebase/merge/main change observed.
- Frozen 4 checkpoint paths (PhaseExecutorTool.ts, engineering-checkpoint.ts,
  phase-terminal-checkpoint.test.ts, verification-checkpoint-proof.md):
  `git diff --quiet 21c4caa 29e24007` exits 0 — byte-identical. CLAIM CONFIRMED.

## Fix content (exact)
- ExecutionEngine.ts spawn-error handler now resolves
  `{ok:false, error, exitCode:null, cwd}` (was `{ok:false, error, exitCode:1}`).
- `cwd` is in scope (same variable every sibling path carries); no `pid` added,
  which is correct — a spawn error means no child/PID exists.
- Convention is now uniform: EVERY never-started path (preflight rejections AND
  spawn errors) reports exitCode null. The one deliberate residual asymmetry is
  that preflight rejections carry cwd undefined while spawn errors carry the
  attempted cwd; that is defensible (preflight never validated/attempted the cwd)
  and matches the requested C1 wording ("include cwd ... and either use null
  there too or document the deliberate distinction" — null was used).
- New test exercises the REAL path: ExecutionGateway.execute through
  executionFirewall with shell:false and a missing executable; asserts ok false,
  error contains ENOENT, exitCode null, cwd === attempted root, pid undefined.
  Substantive, not a mock of the internal function.

## Independent test evidence (this cycle, read-only execution)
- Reran all 4 focused suites in the candidate tree with cwd/cache/TEMP redirected
  into my workspace (candidate tree untouched, verified clean after the run):
  4/4 suites, 68/68 PASS, exit 0. Owner's 68/68 claim REPRODUCED (67 + 1 new).
  Evidence: D:\Joe\muse-worktree\tmp\jest-ind\c1-results.json.
- The 2 EPERM log-write failures from my composed-001 rerun are GONE under the
  redirected cwd — confirms they were a sandbox-ACL artifact, not product behavior.
- tsc --noEmit on the exact candidate api tree: exit 0, zero diagnostics.
  This closes the owner's stated "typecheck success not rerun" gap for the API tree.
- LIMIT: the owner-cited evidence files (verification/composed-c1-20261001/
  source-manifest.json, gate-results.json; .../combined-windows-checkpoint-20261001/
  c1-focused-results.json) are NOT in the candidate tree — no verification/
  directory exists there at all (neither committed nor on disk). Owner's "12 checks
  EXIT0" gate log could not be cross-checked. Mitigated by my independent 68/68 +
  tsc rerun above. I did not rerun all 10 mandatory gates (cost; 2-line surface);
  full gate rerun belongs to the integration step.

## Technical challenge
- C1 (from composed-001): FIXED as specified. Receipt inconsistency eliminated.
- C2 (EPERM/ENOENT collapse, documented): untouched by this diff, correctly —
  follow-up backlog, not bundled. Still acceptable fail-closed direction.
- C3 (UNC/long-path fail-closed limitation, documented): untouched, correctly.
- Regression direction: exitCode 1 -> null on spawn errors. In-tree consumers use
  `=== 0` checks and `number | null` types (verified in composed-001 review);
  null flows to the failure branch, never to false success. `cwd` addition is
  purely additive; handlers.ts now reports the attempted workDir instead of
  undefined — the intended fix. No checkpoint assertion on cwd spelling exists
  in the frozen test. No new risk introduced.
- No proposal errors found in the C1 correction itself. No simpler alternative
  applies — this IS the minimal fix (one receipt shape + one test).

## Overlap / conflicts
- MUSE tree (7c3963ef): last touches to these 2 files are old commits
  (76f66a5d/5d2cac0e/c219da21); all recent Muse commits are docs/review evidence.
  ZERO implementation overlap. No competing implementation started.
- NVIDIA main (e8fd9589 + tracked dirty, read-only inspection): dirty files are
  planning/registry/ledger/pipeline/app-blueprints/IntentParser/context-engine/
  memory/PlanningEngine/plan-tools/PhaseExecutorTool/ProjectPipelineTool/
  tool-aliases + package files. ZERO file overlap with the C1 2-file diff.
  Integration-time dirty-preserving reconciliation still needed (unchanged).

## Maintainability / security
- Security: strictly better — spawn failures can no longer masquerade as
  exit-code-1 executions with a missing cwd; downstream handlers/audits now get
  a truthful never-started receipt. No new privileged surface.
- Maintainability: single receipt convention for never-started commands reduces
  the two-shape special case I flagged; test pins it through the real gateway.

## Required tests before integration (unchanged from composed-001)
1. DONE this review: C1 fix verified + 4 focused suites 68/68 + tsc clean.
2. Still needed at integration: full 10-gate rerun on the exact C1 source
   (owner log not cross-checkable), NVIDIA installed review of the composed
   stack, dirty-preserving main reconciliation.
3. Real Joe UI transfer UAT per real-ui-transfer-uat.md (NOT_RUN on this commit;
   latest live baseline remains a terminal FAILED bill run on prior source).
   No UI PASS inferred from 68/68 or tsc.

## Real Joe UAT
NOT_RUN_ON_C1_COMMIT (agreed with consultation). No UI verdict inferred.
Authorized exact-source :5002 loading + multiple materially different live
prompts remain required before any product acceptance.

## Root cause addressed (for the record)
Foreground spawn failures (e.g. missing executable) previously produced a
receipt shape inconsistent with the new never-started convention (exitCode 1,
no cwd), while preflight rejections used null/absent-cwd. Handlers then
reported cwd undefined and a misleading exit code for commands that never ran.
The correction unifies the never-started receipt: null exit + attempted cwd.

## Verdict rationale
The correction is byte-scoped exactly as claimed, implements precisely the
bounded C1 fix requested, is pinned by a substantive real-path test, and
reproduces 68/68 + clean typecheck under independent execution with the
candidate tree left untouched. Hence ACCEPT/APPROVE, not REWORK or NEEDS_EVIDENCE.
Integration still requires: full gates on exact C1 source, NVIDIA installed
review, dirty-preserving reconciliation, and authorized real-UI transfer UAT.
No main push/deploy authorized by this review. No NVIDIA position inferred.
