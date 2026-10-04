# Checkpoint/Resume family — wiring slice on exact f40 (read-only)

SLICE_ID=CYCLE-CHECKPOINT-WIRING-F40-001
AGENT=MUSE
DATE=2026-10-04
SOURCE_REV=f40f6100e8083bfefeef54eb7812c3690b068048 (NVIDIA main committed bytes via git show/grep; live dirty lane untouched, no writes outside muse-worktree)
METHOD=Committed-byte source trace only (LEVEL 2-3: registration + dispatch/reachability). No runtime execution, no Real Joe UAT.

## Family inventory (exact f40)

CORE:
- api/src/core/resume/checkpoint.ts (page build checkpoints, .checkpoints/*.json)
- api/src/core/resume/engineering-checkpoint.ts (general checkpoints, .engineering-checkpoints/*.json)
- api/src/core/resume/continuation-command.ts (one-word continue/resume triggers)
TOOL:
- api/src/modules/tools/definitions/ProjectStateManagerTool.ts (name project_state_manager)
PRODUCTION CONSUMERS:
- api/src/modules/tools/definitions/PhaseExecutorTool.ts (engineering checkpoints)
- api/src/modules/tools/definitions/WebPageBuilderTool.ts (page checkpoints)
- api/src/api/routes/run.ts + api/src/modules/services/AgentLoopService.ts + api/src/orchestration/AgentOrchestrator.ts (continuation ingress)
- NO production consumer of project_state_manager (see K1)

## K1 — project_state_manager: registered + executable, planner-bypassed, non-durable, duplicative [PARTIALLY_WIRED]

- REGISTERED=YES: registry.ts:42 import, :193 safeNew('project_state_manager').
- EXECUTABLE=YES (by construction): implements ToolDefinition with execute(); permissions=[] (defaults via registry read/write-default policy); sideEffects=['write']; rateLimit 30. Reachable through generic ToolService name dispatch + direct executeTool.
- PLANNER_STATIC_CATALOGUE=NO: absent from PLANNER_TOOL_CATALOGUE (plan-tools.ts, static 40-entry list verified complete: scaffold_project..mobile_builder, no state/checkpoint entry).
- PLANNER_RETRIEVAL=POSSIBLE: capableTools ranks the full registry minus NEUTRAL (capability-match.ts:122); NEUTRAL={central_answer,echo,ask_user,multi_agent_debate,self_confidence_evaluator,ambiguity_resolver,request_analyzer} (:39-40) does NOT include it. Name terms project/state/manager + tags state/progress/checkpoint + description terms make English state/checkpoint goals retrievable. Arabic bridge (BRIDGE table) has no checkpoint/state row, so Arabic resume goals likely miss it (same class as the known 8-Arabic-miss gap noted in-file).
- PRODUCTION_CALLERS=NONE: repo-wide f40 grep hits only registry + definition + .agent/workflows/god_mode_perpetual.md (doc suggestion) + memory indexes + a committed .err log line. No PhaseExecutor/planner/route use.
- DURABILITY=OVERCLAIMED: store is `private static states/checkpoints` Maps with in-code comment "In-memory state storage (in production, use database)". "Enable resumption after interruptions" is FALSE across process restarts; also process-global keyed by bare projectId string with no user/workspace isolation (multi-user contamination risk if planner-selected).
- DUPLICATE_OVERLAP: capability overlaps durable engineering-checkpoint (K2) and page-checkpoint (K4) systems with zero shared code.
- PRIMARY_STATE=PARTIALLY_WIRED (OVERLAP=DUPLICATE). Repair-or-retire decision owed; do NOT silently register/expose further.

## K2 — engineering checkpoints: fully wired PhaseExecutor infrastructure [FULLY_WIRED]

- PhaseExecutorTool.ts:25 imports 7 fns; production call sites: checkpointTool :1655 (every tool execution), loadAllRunCheckpoints(artifactDir, executionContext.runId) :2126 (resumption skip with 'reused' verdicts :2176/:2200), checkpointPhase :2246.
- Keyed runId+phaseIndex+toolName (md5), v:1 schema+key validation, 24h TTL_MS enforced inside loadEngineeringCheckpoint (expired file unlinked, status 'expired'), bulk loader reuses single-load so TTL applies to resume scans too (:134-150).
- Writes are atomic tmp+rename; corrupt existing checkpoint refuses overwrite (fail-closed preservation).
- MINOR (non-blocking): clearAllRunCheckpoints / clearEngineeringCheckpoint / loadEngineeringCheckpoint / saveEngineeringCheckpoint are imported at :25 but have NO call sites in PhaseExecutorTool (grep-verified). Cleanup therefore relies on TTL-at-read; stale files linger until a same-artifactDir load scans them. Dead-import cleanup or explicit clear-on-success wiring is P4 hygiene.
- No planner/tool exposure by design (infrastructure, not a tool). No defect blocking canonical execution.

## K3 — continuation ingress: re-execution wired, checkpoint-reuse NOT wired [PARTIALLY_WIRED]

- Trigger: isContinuationCommand one-word multilingual match (continuation-command.ts CONTINUATION_COMMANDS + NFC/diacritic/hamza normalization). Evidence-gated: findInterruptedContinuation requires interrupted status or failed+run_cancelled event (runCanContinue) — honest, no blind resume.
- run.ts:184-213 restores executionText + resumedRunId + containment-checked resumeProjectRoot (existsSync + isDirectory + isWithinRoot against active roots — good).
- WIRED: resumeProjectRoot threads run.ts:354 -> AgentLoopService.execute options (:357) -> orchestrator context (:668) -> AgentOrchestrator :609/:656 (nodeInput.path). Resumed run reuses the origin project root.
- NOT WIRED: resumeOriginRunId is provenance-ONLY (continuation_started evidence event, AgentLoopService.ts:582-594). It is NOT passed to the orchestrator context, and PhaseExecutor loads checkpoints by the NEW executionContext.runId (:2126). Origin-run checkpoints are therefore never reused by a continuation; "continue" = fresh re-execution of the restored goal on the same root, redoing completed tool work (model calls + side effects repeated).
- PRIMARY_STATE=PARTIALLY_WIRED. Either thread originRunId into the checkpoint load (P1/P2 backlog) or document re-execution semantics and stop implying checkpoint reuse. No test/prod confusion introduced by this finding itself.

## K4 — page build checkpoints: fully wired tool-local resume [FULLY_WIRED]

- WebPageBuilderTool.ts:13 imports checkpointKey/loadCheckpoint/saveCheckpointSection/clearCheckpoint; load-before-build :694-698 (only structurally valid checkpoints resume; failed/empty are explicit non-resumable states); save-per-section :888; clear-on-success :928; partial-failure messaging :931.
- Key = session+request+kind; 6h TTL + corrupt-preserved semantics covered by build-checkpoint.test.ts + checkpoint-consumer.test.ts (source-observed, not rerun this slice).
- Positive control for the family: narrow, honest, tested resume.

## Slice counts (this family only, source-evidenced)

TOOLS_EXAMINED=1 (project_state_manager: registered, executable, planner-static-invisible, retrieval-possible, zero production callers)
CORE_MODULES=3 (checkpoint, engineering-checkpoint, continuation-command — all production-consumed)
CHAINS_FULLY_WIRED=2 (K2 PhaseExecutor checkpoints, K4 page checkpoints)
CHAINS_PARTIALLY_WIRED=2 (K1 state-manager tool, K3 continuation checkpoint-reuse)
ORPHANED=0 (every core module has a production caller; the tool has registry+dispatch but no caller — counted under K1 partial, not orphan)
DUPLICATE=1 overlap pair (K1 vs K2/K4)
REAL_JOE_PROVEN=0 (source-level slice; runtime/UAT explicitly not attempted)

## Repair backlog proposals (for JOE-WIRING-REPAIR-BACKLOG; no implementation this slice)

- P2/K1: Decide project_state_manager fate: (a) back it with a durable isolated store and contract tests, (b) mark INTERNAL_ONLY/TEST_ONLY, or (c) deprecate + remove doc suggestion. If kept planner-reachable, fix cross-tenant static store first. Owner unassigned; NVIDIA registry owner / Muse review pattern applies.
- P1-P2/K3: Thread resumeOriginRunId into PhaseExecutor checkpoint load with origin/new runId reconciliation + negative tests (origin checkpoints reused; unrelated-run checkpoints never leak across users), or downgrade docs/evidence language to re-execution. Touches NVIDIA-owned PhaseExecutor lane — coordinated ownership required.
- P4/K2-minor: Remove dead checkpoint imports in PhaseExecutorTool or wire explicit clear-on-success; add Arabic bridge row for checkpoint/resume vocabulary if K1 stays retrievable.

## What was NOT claimed

No runtime execution, no focused-test rerun, no Real Joe UAT, no all-tools count, no integration authorization, no F1/CLI implementation. All file:line pins are f40 committed bytes; live dirty lane (17 tracked, NVIDIA-owned) untouched and unjudged.
