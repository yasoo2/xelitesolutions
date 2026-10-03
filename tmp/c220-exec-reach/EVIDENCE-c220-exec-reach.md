# C220 executor-reachability evidence — 5 planner-invisible tools (Muse bytes)

AGENT=MUSE
CYCLE=220
DATE=2026-10-03
MUSE_HEAD=95c2dc555546213e1de8abc6f8fdf1b9595936b3 (tracked clean; zero Joe source delta; evidence-only)
NVIDIA_HEAD=a10c71ab14411e682be7a7e4e5ffd07467d960ac (read-only; 54 dirty/untracked entries observed, untouched)
CRITICAL=CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (Muse division: source-level wiring, planner/tool behavior)
RESULT_JSON=tmp/c220-exec-reach/run-result-clean.json
RESULT_SHA256=D98A87AD7396CBE98EC8F787D3DF7FDD251924B1E87CC58B2802622D8B5B5B1D (2 runs byte-identical)
RUNTIME=:5002 DOWN, :5101 DOWN, :5000 API-only OK — no Real Joe UI claim; this is LEVEL-3 dispatch evidence, not UAT.

## What was proven (all on exact Muse HEAD bytes)

1. REGISTRY: 163 tools registered; import success = zero duplicate names (registry throws on dup).
2. DISPATCH RESOLUTION: all 5 names resolve via ToolService's exact lookup predicate
   (`tools.find(t => t.name === X)`, ToolService.ts L675). No alias remaps them
   (TOOL_ALIASES targets: search_text/search_files/read_file/write_file/delete_file/
   file_edit/inspect_directory/terminal_manager/shell_execute/search_api/http_fetch).
3. FIREWALL GATE (executed): `validateExecution` THROWS outside orchestrator context
   ("Execution bypass detected ... All execution must go through AgentOrchestrator.coordinate()")
   and ALLOWS inside `runInContext`. EXECUTOR_REACHABLE therefore requires orchestrator
   context; direct calls cannot dispatch. `isSystemContext()` outside = false.
4. AUTH GATE inputs (runtime-measured): ALL FIVE carry non-empty runtime permissions,
   so with bypass OFF every one requires workspaceId+userId in context (needsWorkspace=
   needsUser=true, ToolService.ts L726-727) or session-identity resolution. Risk classes
   source-traced (ToolService.ts L142-202): task_lifecycle=low (explicit L200); other
   four=default medium (L202). requiresAll=false for all five, so the approval gate
   passes under default autoSafe=true (L777-780).
5. VALIDATION PROBES (executed, side-effect-free): cloud_cost_estimator and
   self_confidence_evaluator return implementation-authored validation errors on
   empty/missing args (4/4), proving the implementation behind the registry entry is
   live code. Validation precedes the LLM branch in source (EliteTools.ts L190-201,
   L276-286), so no model/network call was made.
6. NOT EXECUTED (by design): ask_user, rss_fetch, task_lifecycle have NO input
   validation before broadcast/network effects (TaskInteractionTools.ts L255-268,
   ContentTools.ts L101-119, TaskLifecycleTool.ts L26-44). No broadcast or fetch was
   triggered by this probe.
7. CATALOGUE RECALL (executed, deterministic retrieval): on targeted goals ALL FIVE
   surface in the planner catalogue (limit 30): cloud_cost_estimator rank 1/16,
   self_confidence_evaluator rank 1/30, ask_user rank 1/19, rss_fetch rank 1/20,
   task_lifecycle rank 4/30. None are in CORE_TOOLS (9 tools). CONCLUSION: the
   45-goal-corpus "never surfaced" result is a RETRIEVAL-RECALL gap (goal wording
   overlap), NOT structural exclusion. All five are SELECTABLE-in-principle.

## Per-tool wiring rows (matrix input)

| tool | class | registry | runtime perms (declared) | risk | input req | exec fn | catalogue |
|---|---|---|---|---|---|---|---|
| cloud_cost_estimator | CostEstimatorTool (EliteTools.ts L171) | YES L281 | [read] DEFAULTED (declared []) | medium (default) | resources | YES | rank1 targeted |
| self_confidence_evaluator | SelfConfidenceTool (EliteTools.ts L261) | YES L284 | [read] DEFAULTED (declared []) | medium (default) | content | YES | rank1 targeted |
| ask_user | AskUserTool (TaskInteractionTools.ts L238) | YES L336 | [read] DEFAULTED (declared []) | medium (default) | question | YES | rank1 targeted |
| rss_fetch | RssFetchTool (ContentTools.ts L91) | YES L149 | [read,internet] DECLARED | medium (default) | url | YES | rank1 targeted |
| task_lifecycle | TaskLifecycleTool (TaskLifecycleTool.ts L6) | YES L215 | [write] DECLARED | low (explicit) | action | YES | rank4 targeted |

PRIMARY_STATE (proposed, reviewer to confirm): PARTIALLY_WIRED for all five —
registered + dispatchable + permission-routable, but planner-recall-limited
(zero-score on goals whose wording does not overlap name/tags/description).

## Discrepancy note (honest)

Cycle-215 reported an "ask_user write-class FLAG". On CURRENT Muse bytes ask_user
defaults to [read] (PERMISSION_HINTS order: internet-hint, write-hint, read fallback;
"ask_user" matches none of the first two). The write-class observation may belong to
different bytes or a different defaulting path; it is NOT reproduced on 95c2dc55.
No correction of the other claim is asserted — bytes differ.

## Highest proven level per tool (audit scale)

- cloud_cost_estimator: LEVEL 4 (focused runtime execution of validation path; full
  LLM-backed execution NOT run — no provider calls made by this probe).
- self_confidence_evaluator: LEVEL 4 (same scope as above).
- ask_user / rss_fetch / task_lifecycle: LEVEL 3 (dispatch/reachability proven;
  execution deliberately not attempted — unvalidated broadcast/network effects).

REAL_JOE_PROVEN=NO for all five (runtime :5002 unavailable; no UI run attempted).
