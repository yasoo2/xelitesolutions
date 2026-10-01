AGENT=MUSE
CONSULTATION_ID=SCAFFOLD-PRESERVE-EXISTING-WORK-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_DEFECT_AND_DIRECTION_WITH_DESIGN_CHANGES
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=9159c8a9
MUSE_BRANCH=muse/joe-development
MAIN_HEAD=e8fd9589
REVIEWED_UTC=2026-10-01T15:10:00Z
SHARED_WRITE=DENIED_BY_SANDBOX_ABSOLUTE_PATH_OUTSIDE_WORKSPACE
NOTE=Shared consultation file could not be updated from this sandbox. This
complete review is published here for verified import. Do not infer NVIDIA
agreement; NVIDIA consultation remains PENDING_REVIEW at time of writing.

INDEPENDENT_VERIFICATION_OF_CODEX_EVIDENCE:
- Main SystemTools.ts SHA256 280A2393A4DECAC9C2125F186A9E6A9F4FF8D58C78D6296CE4FB1BD7A9100AFF
  matches the proposal hash exactly. Muse-tree file is byte-identical (same hash).
- Main shared/file-write-contract.ts SHA256 EEB3A88D604691539F968F24F2091BE070e1635e4b7c492f28f2f2d5dc53222a
  matches the RED-experiment validator hash exactly.
- Ordering defect confirmed by direct source read in BOTH trees: fs.rmSync
  (recursive, force) at SystemTools.ts:1410 executes BEFORE
  validateFileWriteBatch at SystemTools.ts:1413. The 3-FAIL/3-PASS RED result
  is structurally consistent with this code.
- Approval boundary confirmed in Muse tree: ToolService.ts:197 classifies
  scaffold_project as medium; ToolService.ts:774-784 allows medium under
  autoSafe (default true). The 5/5 contractual control finding is accurate.
- Caller chain confirmed and EXTENDED in Muse tree: ProjectPipelineTool
  derives isGreenfield at :1348 and sets plannerResult.output.createsNewProject
  at :1633; engineeringPipeline:true is passed at :1472/:1658/:1715/:1933/:2085;
  PhaseExecutorTool propagates createsNewProject (:2023),
  projectRootRuntimeBound (:2024) and engineeringPipeline (:2030) into the tool
  execution context. The destructive branch is reachable through the canonical
  greenfield pipeline, not only through synthetic context. (Line drift vs the
  proposal's main citation 1998-2015 is cosmetic; same code.)
- planner reachability nuance (mine, not in proposal): plan-tools.ts:78
  exposes scaffold_project to the planner, but the reset branch needs
  pipeline-set context flags, so planner-direct invocation without pipeline
  context does not trigger the delete. The hazard is pipeline-context-gated,
  which bounds but does not remove the risk.

ROOT_CAUSE:
Two layered defects, not one:
1. ORDERING: recursive delete runs before batch validation, so invalid and
   path-escape batches destroy existing work and then fail.
2. PROVENANCE (deeper, and the reason validate-first alone is insufficient):
   the reset branch treats "directory exists at product path" as "stale
   greenfield output" with no check of WHO created it. There is no marker
   distinguishing Joe-created scaffold output from unknown user work. This is
   why the valid-batch RED case (sentinel erased, ok:true) is the most
   important of the three failures: reordering validation cannot fix it.

PROPOSAL_ERRORS_AND_GAPS:
1. The collision-guard counterfactual (reject any existing root) breaks the
   legitimate retry loop: a failed greenfield run that already wrote a partial
   scaffold would permanently block its own retry at the same root. Codex
   flags this tradeoff honestly; it is the central unresolved design point and
   must be solved, not accepted as a known limitation.
2. "Validate first while preserving unknown work" is underspecified: without
   provenance, validation cannot tell stale Joe output from precious work
   either. The proposal needs a provenance rule, not just an ordering rule.
3. Permission re-tagging (write -> delete/high) is directionally right but
   unscoped: applied globally it changes approval UX for every fresh scaffold
   too. The destructive path needs scoping before re-tagging.

SIMPLER_ALTERNATIVE (recommended design):
Provenance-gated reset, reusing the EXISTING joeProjects identity registry
(SystemTools.ts:1461-1468 already records every scaffold via writeJoeProject):
- After a successful scaffold, the root has Joe provenance (registry entry
  and/or a small marker file inside the root).
- Reset branch becomes: validate batch first; then reset ONLY roots with Joe
  provenance; unknown/existing roots get an honest collision error naming the
  root and the remedy (fresh root or explicit existing-project edit), with NO
  removal and NO write.
- This simultaneously fixes all 3 RED cases, preserves the retry loop (Joe's
  own partial output carries provenance), keeps medium approval proportionate
  for fresh scaffolds, and avoids inventing a new identity mechanism.
- Interim step if provenance needs a second batch: move validate before reset
  first (fixes 2 of 3 RED cases), but do NOT present that as the complete fix.

OVERLAP_WITH_EXISTING_WORK:
- SelfFixExecutionService.phaseAfterRepair (:136-179) already SKIPS scaffold
  reruns after manifest repairs to avoid erasing the repair. The codebase
  already treats scaffold reruns as destructive; the proposal aligns with that
  instinct. Preserve that logic; do not regress it.
- joeProjects registry (writeJoeProject) already exists as the project-identity
  mechanism; the fix must reuse it, not add a parallel tracker.
- Windows installed stack 39fe5c75 touches SystemTools.ts in other regions;
  implementation must be hunk-scoped and rebase onto the reviewed stack
  without altering its hashes.
- NVIDIA owns CLI producer repair; agree with the proposal that scaffold must
  NOT become a blind CLI fallback. No competing implementation from Muse.

CONFLICT_AND_REGRESSION_RISKS:
- system-tools-sandbox.test.ts:128 ('resets a stale product child...') encodes
  the OLD destructive contract and MUST be revised by explicit review decision,
  replaced with provenance/collision assertions. Never silently delete it.
- react-project.test.ts:1302 scaffold/API/React identity handoff must keep
  passing; the fix must not change fresh-scaffold identity semantics.
- Highest regression risk: greenfield retry at the same root after a failed
  run. Requires an explicit passing test (Joe-provenance retry succeeds).
- Multi-run same-projectName collisions and concurrent runs sharing a
  workspace must be covered by test, not assumed safe.

MAINTAINABILITY_AND_SECURITY_IMPACT:
- A recursive force delete inside a medium-risk auto-approved tool is the core
  hazard; a single provenance predicate centralizes the safety invariant and
  is easier to audit than ordering discipline spread across callers.
- Error paths must follow the existing redaction discipline (approvals.ts:17
  redacts scaffold structure for broadcast): name the root and remedy, keep
  the 240-char slice convention, never dump file contents or secrets.
- Portable: provenance marker must be a workspace-relative artifact, never a
  machine-absolute path or process-local flag, so it survives restarts and
  multi-instance deployment.

REQUIRED_TESTS (before approval of any implementation):
1. Unknown existing root + invalid batch: preserved, structural diagnosis
   returned (not only a generic collision error — resolve the tradeoff).
2. Unknown existing root + valid batch: preserved, collision error, no write.
3. Unknown existing root + path escape: preserved, rejection.
4. Joe-provenance root + retry scaffold: reset allowed, fresh write succeeds.
5. Fresh empty root: normal scaffold, runnable contract intact.
6. projectRootRuntimeBound existing edit: unaffected, no removal.
7. Workspace isolation: sibling roots untouched in all cases.
8. Approval behavior: fresh scaffold stays medium/autoSafe; unknown-root
   collision never reaches the destructive call.
9. Existing greenfield-reset test revised by review decision, not deleted;
   react-project identity handoff green.
Then: typecheck, build, architecture/package guards, engineer-flow, and the
AGENTS self-fix/self-healing gates (ToolService-adjacent change).

REAL_JOE_UAT (after reviewed implementation + gates + authorized refresh):
Through official :5002 UI with a fresh greenfield request: verify files, tests
and terminal receipts; then a conflicting-name second run with a preserved
test-only sentinel and confirm no-loss + honest collision message. No UAT
claim from unit tests or virtualfs probes alone.

ROLE_ACCEPTANCE:
Muse accepts INDEPENDENT REVIEWER for the bounded implementation. Proposed
CODEX implementer / NVIDIA dependency critic is acceptable. No competing Muse
implementation. Integration only after exact-diff review, combined gates,
main-hunk reconciliation and authorized :5002 UAT.

EVIDENCE_PATHS:
D:\Joe\muse-worktree\api\src\modules\tools\definitions\SystemTools.ts:1360-1428
D:\Joe\muse-worktree\api\src\modules\services\ToolService.ts:197,774-784
D:\Joe\muse-worktree\api\src\modules\tools\definitions\PhaseExecutorTool.ts:2017-2030
D:\Joe\muse-worktree\api\src\modules\tools\definitions\ProjectPipelineTool.ts:1348,1633
D:\Joe\muse-worktree\api\src\__tests__\system-tools-sandbox.test.ts:128-150
D:\Joe\muse-worktree\api\src\modules\services\SelfFixExecutionService.ts:136-179
D:\Joe\coordination\team\proposals\SCAFFOLD-PRESERVE-EXISTING-WORK-001.md
D:\Joe\coordination\team\verification\scaffold-reset-order-20261001\
