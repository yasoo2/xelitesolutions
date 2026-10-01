# WIRING CHECKPOINT 080 — MUSE (2026-10-02)
MODE=TWO_AGENT_CONTINUITY (audit continues; no broad restructure, no deletions)
MUSE_HEAD=a31af2c0 (this checkpoint; commit pending)

## Fresh evidence this cycle (source-traced, Muse worktree, read-only)
Owed from 079-R1: per-tool mutation check for the 5 write-defaulted tools.
Files: api/src/modules/tools/definitions/{Template,ProjectState,Alert,Cache,
WebPageBuilder}*.ts.

1. template_manager (TemplateManagerTool.ts:40-46): permissions=[], 
   sideEffects=[]. execute() returns static in-memory template objects
   (list/getTemplate); NO fs, NO map mutation, NO external call.
   VERDICT: TRUE READ-ONLY. Name-heuristic write label is an OVER-GRANT
   (mislabeled, functionally harmless — attribution required either way).

2. project_state_manager (ProjectStateManagerTool.ts:60-70): permissions=[]
   BUT sideEffects=['write'] DECLARED. init/update/checkpoint mutate static
   in-memory Maps (states.set/checkpoints.set).
   VERDICT: TRUE MUTATION (process-local). Write label CORRECT via declared
   effect, not via name default.

3. alert_manager (AlertManagerTool.ts:65-72,91-214): permissions=[] BUT
   sideEffects=['write'] DECLARED. create/update/resolve mutate static
   alerts Map; list is read-only.
   VERDICT: TRUE MUTATION (process-local). Write label CORRECT via declared
   effect.

4. cache_manager (CacheManagerTool.ts:47-54,63-161): permissions=[],
   sideEffects=[]. set/delete/clear mutate static cache Map (with TTL).
   VERDICT: TRUE MUTATION (process-local), UNDECLARED. Name-heuristic
   write label is CORRECT BY LUCK. Should declare sideEffects=['write'].

5. web_page_builder (WebPageBuilderTool.ts:196-202 + write sites at
   :63-65, :322-324, :1578-1579, :1612, :1642, :2463-2464, :2737):
   permissions=[], sideEffects=[]. Writes real files (index.html,
   styles.css, script.js, checkpoints, audit screenshots) — all contained
   under ARTIFACT_DIR=artifactRootDir() via path.join (no arbitrary user
   paths observed at write sites).
   VERDICT: TRUE FILESYSTEM MUTATION, UNDECLARED. Name-heuristic write
   label is CORRECT BY LUCK. Should declare sideEffects + write perms.

## Correction to 079
079 said "All DEFAULTED, none declared" for the 21. Refined: among the 5
write-labeled, TWO (alert_manager, project_state_manager) already declare
sideEffects=['write'] — for them the name-default only added the
permission LABEL; attribution was already required pre-default via
effects>0 (ToolService.ts:722-769 needsWorkspace/needsUser branch).
THREE (template/cache/web_page) are fully empty (perms+effects) and the
default closed a real attribution hole for them. The 16 read-defaulted
were not re-examined this cycle; 079's claim stands for those pending
the same per-tool check.

## Scorecard: name heuristic on the 5 write-labeled
CORRECT-WRITE=4 (alert, project_state, cache, web_page_builder)
OVER-GRANT=1 (template_manager: read-only labeled write)
UNDER-GRANT=0 in this batch. UNDER-grant risk for the 16 read-defaulted
(state-changing tool mislabeled read) remains OPEN — next audit step.

## Matrix implication
- template_manager: PERMISSION_REACHABLE=DEFAULTED(write, OVER-GRANT);
  PRIMARY_STATE candidate PARTIALLY_WIRED (contract mislabel, not a
  reachability break). No repair proposed yet (audit mode).
- cache_manager, web_page_builder: PERMISSION_REACHABLE=DEFAULTED(write,
  CORRECT-BY-LUCK); missing declarations are a P4 maintainability item
  for the repair backlog (declare sideEffects), NOT a wiring break.
- alert_manager, project_state_manager: PERMISSION_REACHABLE=
  MIXED(declared-effect + defaulted-label); correctly attributed.
- No evidence this cycle changes ORPHANED/DUPLICATE counts.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (5f-lineage) / 164 (main-lineage; +SpecificationVerificationTool)
EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN PARTIALLY_WIRED=UNKNOWN
ORPHANED=2 confirmed (codebase_navigator, generate_image) + bulk_file_generator corroborated unregistered-by-design-pending-review
DUPLICATE=0 by construction UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Per-tool mutation check for the 16 read-defaulted (hunt UNDER-grants),
then one bypass-off dispatch probe. No repair batch proposed yet.
