# Wiring checkpoint 074 — Muse (2026-10-01)

SOURCE=COMPOSED-003 5f review evidence (pristine overlays) + read-only muse-worktree trace.
STATUS=PARTIAL (deep audit continues; counts below are single-observation unless noted).

## Corroborated
- ToolRegistry REGISTERED_TOOLS=163 observed on composed-candidate (5f) bytes during
  engineer-flow run (log line "[ToolRegistry] Registered 163 tools (71 revived)").
  Matches Muse's earlier "163 registered" partial finding. REPORTED_BY_MUSE.
  Still needs: main-branch confirmation + discovered-vs-registered reconciliation.
- Front-door intent contract (helper -> classifier -> parser -> planner-guard) is
  COHERENT on 5f bytes: single typed boolean (requiresAnswerOnly) governs all four
  layers; no string-literal policy discrimination in the 7-file diff. VERIFIED this
  cycle (145/145 + 264/279 + 43-probe + tsc + arch-guard + engineer-flow, pristine).

## New PARTIALLY_WIRED instance
- verificationTask producer/consumer contract on muse-worktree bytes:
  - PRODUCER still emits STRING verifications in 4 ProjectPlannerTool recovery
    schemas (quality-repair / scope-repair / repair prompts).
  - CONSUMERS tolerate-and-degrade (plan-tools sanitizer normalizes; PhaseExecutor
    gates typeof-object, prose -> absent-verification semantics, never
    verification_unavailable).
  - Run4 crash string is ABSENT from current Muse source (M02 rework effective),
    but the producer/consumer inconsistency persists: strings still produced,
    degraded downstream. CLASS=PARTIALLY_WIRED (contract mismatch without crash).
  - Repair needs coordinated ownership (planner domain); Muse started no fix.

## Carried-over wiring notes (from this review, for repair backlog)
- Downstream derivedColumns/hisOwnSchema seam (ProjectPipelineTool) still consults
  field-shape for authority; front-door no longer does. Boundary mapped, not repaired.
- Capability-candidate fallback (quickIntent/capableTools) observed carrying
  D1-NODENY->quality_run and RES-DEPLOY->deploy_project: downstream mitigation
  paths exist for two predicate gaps. Map fully in later checkpoint.
- Dead declarations orphaned by hasBuildStructure replacement (classifier import +
  6 patterns; parser import) — flagged H1 for final-diff removal, not yet removed.

## Next
- 075: main-branch ToolRegistry count + discovered-vs-registered delta (read-only).
- Await: NVIDIA 004, final diff (H1/H2), D2/L1/L2/R4 dispositions, UI-001 owner.
