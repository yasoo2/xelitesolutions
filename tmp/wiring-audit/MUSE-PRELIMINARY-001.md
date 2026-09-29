# MUSE wiring-audit preliminary slice 001 (DRAFT — NOT the matrix)

Command: CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (arrived 2026-09-29 ~22:11
local, mid-turn; Muse at safe checkpoint c2ba89c4).
Scope here: Muse-side bounded discovery only. Full matrix / architecture map /
orphan register / repair backlog are next-cycle work under the audit claim.
Codex is TEMPORARILY_UNAVAILABLE; all Codex evidence below is cited, not
modified. NVIDIA worker is BLOCKED (parent exited by three-failure guard);
cross-review is therefore PENDING until NVIDIA resumes.

## Method (this slice only)

- Static inspection of D:\Joe\muse-worktree @ c2ba89c4 (muse/joe-development).
- No runtime dispatch proofs yet; every count below is LEVEL 1 (source
  existence) unless stated. Do NOT treat these as wiring verdicts.

## Repository roots observed

Top level: api/ web/ services/ infra/ scripts/ docs/ tests/ extension/
workers absent as a top-level dir (no `workers/` at root).
api/ holds: src/ scripts/ assets/ uploads/ screenshots/ logs/ + ~20
selftest-*.ts harnesses and verify_*.ts scripts at api root (candidate
TEST_ONLY classification, unverified).

## Preliminary static counts (Muse branch, UNVERIFIED wiring)

- RAW_TOOL_DEFINITION_FILES (api/src/modules/tools/definitions/*.ts,
  excluding *.test.ts): 93 files.
- registry.ts imports statically from './definitions/*' (confirmed lines
  1-80+: named imports + `* as EliteTools`); dynamic/factory registration
  NOT yet surveyed. REGISTERED_TOOLS count: UNKNOWN (needs registry-body
  + factory + alias reconciliation, including the 246-spelling Codex
  classification cited in TEAM-STATE — to be independently verified, not
  assumed).
- Largest sources (KB): ReactProjectTool 550, react-app-templates 354,
  PlanningEngine 244, app-blueprints 238, ApiProjectTool 201,
  ProjectPipelineTool 190, WebPageBuilderTool 185, ProjectEditTool 176,
  intelligent-router 159, BrowserSmartTools 151, PhaseExecutorTool 149,
  wiring-policy.test.ts 146, ProjectPlannerTool 128, app-audit 125,
  behaviour-audit 119. Giant-file concentration in project generation,
  planning, routing, browser QA — prime UNKNOWN_REQUIRES_INVESTIGATION
  surface for hidden/duplicated capability paths.

## Already-known Muse-side orphan candidates (preserved, this turn)

- api/src/core/quality/shop-qa.ts, live-data-qa.ts, image-semantic-qa.ts:
  complete modules, zero importers in api/src (searched 2026-09-29).
  Preliminary: ORPHANED (implementation exists, no runtime path found).
  Dynamic/config usage check still open.
- api/src/core/llm/providers/nvidia.ts: complete provider, zero
  importers; no registry/adapter reference found. Preliminary: ORPHANED.
  NOTE: provider-area overlap with Codex isolated experiments + NVIDIA
  interests — no wiring change without ownership decision.
- These four predate this turn (mtime 15:40 local) and were left
  untouched per the audit's AUDIT-FIRST rule.

## Cited (not verified) prior evidence to reproduce next

- Codex 246-spelling classification (164 registered + 65 compat + 16
  dormant + 1 broken image_generate alias) — team state; needs
  independent Muse reproduction on the Muse branch.
- Codex TOOL-HTTP-OWNER synthetic RED (direct POST routes bypass
  ToolService user/session/approval) — Muse already responded
  (94fd393d); runtime reproduction is audit LEVEL 4 work.
- Codex wiring-policy 17/176 broad-suite failures; first failure shown
  stale-pattern by synthetic probe — needs per-failure classification.
- NVIDIA untracked SpecificationVerificationTool.ts (main worktree):
  ToolService/workspace bypass; boot-gate evidence cited in TEAM-STATE.
  READ-ONLY from Muse; NVIDIA owns.

## Limits of this slice

- No planner-visibility, executor-dispatch, firewall, contract, or
  Real-Joe reachability proofs yet (LEVELs 2-6 all open).
- Counts above are file/static-grep level; registry-body reconciliation
  is the next discovery step.
- No deletes, no rewiring, no main/NVIDIA/Codex worktree modifications.

## Next discovery steps (proposed, Muse scope)

1. Reconcile registry body: registered names vs definition files vs
   EliteTools/* factories vs aliases (static, Muse branch).
2. Trace planner exposure: PlanningEngine/ProjectPipelineTool selection
   lists vs registry (mind NVIDIA ACTIVE claim on those files —
   read-only inspection + review, no edits).
3. Capability-graph pass for browser/runtime + verification families
   (Muse strength, low overlap): USER->API->RUN->PLANNER->TOOL->
   EXECUTION->EVIDENCE->VERIFICATION with per-node evidence.
4. Runtime LEVEL 4 spot-proofs for 3-5 high-value capabilities via
   ToolService with safe inputs (no destructive tools).
5. Draft matrix rows for the covered families; queue NVIDIA cross-review.
