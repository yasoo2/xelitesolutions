# MUSE WIRING DISCOVERY 043 — production run-ingress census + first matrix rows

PROBE=tmp/wiring-audit/ingress43.cjs (static text scan, zero Joe imports; v2 fixed
  test-path classifier: `tests/manual/` prefix was missed in v1, caught by
  hand-review of prod hits, re-run clean)
FIXTURES=tmp/wiring-audit/fx-ingress43/ingress43_MUSE.json (1191 files, 294 hits:
  38 prod / 256 test) + ingress43_MAIN.json (1125 files, 295 hits: 36 prod / 259 test)
HEAD_MUSE=cdac5d98 MAIN=e8fd9589 (read-only, dirty preserved, untouched)
ENV=no servers, no network, no provider calls, no source edits anywhere
METHOD=full api/src text scan per tree for new AgentOrchestrator /
  orchestrator.execute( / AgentLoopService refs / generatePlan( /
  executeGoal|runGoal|startRun|createRun(; hand-review of every production hit;
  follow-up caller greps for plan/execute/re-entry methods in both trees.

## F35 Canonical run ingress is SINGULAR (both trees)

api/routes/run.ts:346 `AgentLoopService.execute(executionText, {...})` is the ONLY
production caller of AgentLoopService.execute in either tree (same file:line).
Inside execute: new AgentOrchestrator (MUSE:746 / MAIN:626) -> orchestrator.execute
(MUSE:780 / MAIN:652) with the 12-key canonical context (ckpt42). No
executeGoal/runGoal/startRun/createRun entry symbols exist anywhere in either tree
(0 hits). No second route/controller builds a fresh execute-goal.

## F36 `AgentLoopService.plan()` is an ORPHANED entry (both trees)

MUSE AgentLoopService.ts:1010-1013 ("Unified Autonomous Planning Entry Point")
contains the SECOND production `new AgentOrchestrator` (MUSE:1011 / MAIN:883),
calling orchestrator.plan(goal, ...) — plan-only, no execution.
Caller census (both trees, all .ts): ZERO invocations of `AgentLoopService.plan`
outside its own definition body; zero `orchestrator.plan(`/`orch.plan(` calls
outside that body. Nothing re-exports or dynamically dispatches to it by any name
variant searched. CLASSIFICATION=ORPHANED_ENTRY (implementation exists, no
legitimate runtime path found). Confidence HIGH with challenger recipe: show a
production import/call (file:line) or a runtime trace reaching it. Per audit safety
rules: NO removal recommended here — classify + register only. Candidate row for
JOE-ORPHAN-AND-LEGACY-REGISTER.md.

## F37 Phase-execution re-entry path: ACTIVE by design (both trees)

ProjectPipelineTool calls AgentLoopService.runPlannedPhasesIfPresent 3x in
production (MUSE:1642/1948/2115 / MAIN:1626/1932/2099). It runs _executePhases
(direct phase execution incl. firewall context + self-fix/rerun machinery) for
already-planned deterministic pipelines, BYPASSING PlanningEngine.generatePlan.
CLASSIFICATION=ACTIVE alternate orchestration entry (not legacy, not fallback):
deterministic planner output still flows through the canonical phase/self-fix
machinery, but capability/tool SELECTION for those phases never consults P3/S12.
Any tool-reachability verdict must state which entry it assumes:
  ENTRY-A (run.ts:346 -> execute -> generatePlan -> phases): P3-gated selection.
  ENTRY-B (ProjectPipelineTool -> runPlannedPhasesIfPresent -> phases):
    deterministic tool choice, P3/S12 uninvolved.
Consequence: P3-dormant verdicts do NOT imply ENTRY-B tools are unreachable, and
ENTRY-B reachability does NOT prove P3 wiring. Matrix rows must carry ENTRY scope.

## F38 generatePlan production callers re-confirmed = 2 (both trees)

AgentOrchestrator.ts:352 (initial) + :1174 (recovery), identical lines both trees,
both passing this.context (canonical 12 keys + runId, ckpt42). Every other
generatePlan hit (256 MUSE / 259 MAIN test hits) is __tests__/tests/manual.
No production caller enriches previewUrl/url/workspaceRoot before the P3 call site
(ckpt42 F33 stands; this census found no second goal-construction site that could).

## F39 Approval-resume is a resume, not an ingress (both trees)

api/controllers/sessionController.ts:532
`AgentLoopService.handlePendingToolExecution?.(id, authUserId)` — resumes a
pending tool decision inside an existing run. No fresh goal, no generatePlan.
CLASSIFICATION=CONNECTED resume path, out of ingress scope.

## First wiring-matrix rows (ENTRY-scoped, evidence-linked)

| CAPABILITY | ENTRY | STATE | EVIDENCE |
|---|---|---|---|
| plan-only via AgentLoopService.plan | - | ORPHANED_ENTRY | F36, zero callers both trees |
| fresh-goal run (UI/API -> phases) | A | FULLY_WIRED (path) | F35+F38, single ingress |
| deterministic pipeline phases | B | ACTIVE alternate | F37, 3 callsites both trees |
| P3 URL/path tools (previewUrl/workspaceRoot) | A | PARTIALLY_WIRED | ckpt42 F33: gate refuses, runtime never supplies |
| P3 session tools (sessionId) | A | FULLY_WIRED | ckpt42 F33: key present in canonical ctx |
| S12 selectToolDefsForProvider | A | DORMANT_BY_EVIDENCE | ckpt42 F31, 0 prod callers |
| P3/S12 selection | B | N/A (bypassed by design) | F37 |

Counts: PROD_INGRESS_FRESH_GOAL=1 (run.ts:346, both) | PROD_PLAN_ONLY_CALLERS=0
| PROD_REENTRY_CALLSITES=3 (both) | PROD_GENERATEPLAN_CALLSITES=2 (both)
| EXECUTE_GOAL_SYMBOLS=0 | ORPHANED_ENTRIES_NEW=1 (plan())

## Scope honesty / NOT proven

- Static only. Dynamic dispatch via string-built method names was NOT exhaustively
  excluded for plan() (bounded greps only); runtime loaded-module trace during a
  real run would raise confidence to CERTAIN.
- ENTRY-B phase-tool inventory (WHICH tools deterministic pipelines can name) is
  NOT done — next checkpoint material.
- No removal/registration action taken or recommended. Unknown != dead.
- Cross-review: NVIDIA validation of F35-F39 + matrix-row shape requested at next
  safe checkpoint; no agreement inferred.

NEXT (checkpoint 44): ENTRY-B deterministic tool-name inventory (registry vs
PhaseExecutor vs pipeline-emitted names) + orphan-register draft rows for F36.
