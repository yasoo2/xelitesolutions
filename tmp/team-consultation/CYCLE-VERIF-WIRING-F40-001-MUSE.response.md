# Muse wiring-audit slice — verification family on exact f40 (read-only)

AGENT=MUSE
SLICE_ID=CYCLE-VERIF-WIRING-F40-001
STATUS=EVIDENCE_READY
DATE=2026-10-04
SOURCE_REV=f40f6100e8083bfefeef54eb7812c3690b068048 (NVIDIA main, committed bytes via git show/grep; live dirty lane untouched)
MUSE_HEAD=139aa8745e5d587fbba16e83cd553197e1fb4711

## Scope (bounded, non-overlapping)

Verification-family wiring on committed f40 only: tool definitions,
registry, planner sanitizer, PhaseExecutor consumer, ledger accept-set.
Supports CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (contract audit:
planner -> PhaseExecutor -> verification) and CRITICAL-REAL-JOE-UI-001
(verification_unavailable root-cause class). No source edits, no runtime
control, no overlap with NVIDIA CLI/schema lane or Codex integration lane.

## Method

Read-only `git show f40f6100:<path>` + `git grep` from D:\Joe\xelitesolutions.
No worktree writes; no dependency on dirty bytes.

## Inventory (f40 committed)

- Tool definitions matching verif/valid/audit/inspect/test/qa/check: 3 files
  ApiTesterTool.ts, AutoTesterTool.ts, VisualQATool.ts
- Quality modules api/src/core/quality/: 31 files incl.
  verification-ledger.ts, plan-verification.ts
- Registry api/src/modules/tools/registry.ts (f40):
  api_tester registered (safeNew), auto_tester registered (createTool),
  VisualQATool IMPORTED ONLY (line `import { VisualQATool }...`), no
  registration entry. (`visual_compare` -> VisualComparisonTool is a
  different tool.)

## Contract chain traced (f40)

PRODUCER (planner path): ProjectPlannerTool.ts calls sanitisePlanPhases
at 5 sites (:328,:381,:470,:513,:643).
SANITIZER (plan-tools.ts): non-empty string verificationTask ->
`{tool:'read_file'|'project_detect',...}` + verificationNote=original prose;
empty string -> undefined.
CONSUMER (PhaseExecutorTool.ts): prose-origin runs read_file/project_detect
as observation-only, records ok:true observation, sets status='partial'
(honest non-completion, not crash, not false pass).
GATE (verification-ledger.ts isVerificationTool): accept-set = quality_run,
auto_tester, code_reviewer, browser_console_scan, browser_ui_audit,
browser_contrast_audit, browser_check_links, browser_performance,
dependency_audit, secrets_scan_repo, browser_run, browser_responsive_check,
visual_qa + shell_execute (single expansion-free) + read_file (only when
allowExistenceObservation). Unknown/unlisted -> exactly
'verification_unavailable: unsupported verification tool contract'.

## Findings

- V1 IMPLEMENTED_NOT_REGISTERED (f40): VisualQATool imported, never
  instantiated/registered. (Dirty BATCH011 registers visual_qa; committed
  f40 does not. No action proposed here; NVIDIA dirty lane owns it.)
- V2 CONTRACT_MISMATCH (f40): isVerificationTool accept-set CONTAINS
  visual_qa but registry LACKS it: 12/13 accept-set names registered.
  A plan emitting {tool:'visual_qa'} as verificationTask passes the gate
  then fails at executeTool (unknown_tool). Planner catalogue
  (PLANNER_TOOL_CATALOGUE) does NOT list visual_qa, so the live trigger
  requires model-emitted or pipeline-emitted naming outside the catalogue;
  narrow but real VERIFICATION_COMPATIBLE-vs-EXECUTOR_REACHABLE gap.
  Recommended disposition: reconcile at integration (register with
  containment per BATCH2 conditions, or remove from accept-set); do NOT
  silently alias to visual_compare (different contract).
- V3 RESOLVED-SHAPE (f40 planner path): the run4 string-verificationTask
  crash shape no longer crashes here: sanitizer normalizes, executor
  downgrades to honest 'partial'. The remaining live risk is an
  object-form verificationTask naming an unregistered/unlisted tool (V2
  class), not the string form.
- V4 LATENT (pipeline path): ProjectPipelineTool.ts touches verificationTask
  only for path rewrite (:537,:627-628,:857,:865,:1556); it does NOT call
  sanitisePlanPhases. It also does not CREATE a string verificationTask, so
  no live defect proven — defensive note for future pipeline producers:
  any pipeline-emitted verificationTask bypasses string normalization.

## Counts for the wiring matrix (this slice only, f40)

VERIF_TOOL_DEFS=3
VERIF_TOOL_REGISTERED=2
VERIF_ACCEPT_SET_NAMED=13
VERIF_ACCEPT_REGISTERED=12
VERIF_QUALITY_MODULES=31
IMPLEMENTED_NOT_REGISTERED=1 (visual_qa, f40; dirty differs)
CONTRACT_MISMATCHES=1 (V2)
UNKNOWN=planner-model emission frequency of visual_qa (not measured; no
provider calls made)

## What was NOT claimed

No runtime execution, no Real Joe UAT, no all-tools count, no integration
authorization. Dirty-lane state deliberately not used. Findings await
second-agent review per audit cross-review rule.
