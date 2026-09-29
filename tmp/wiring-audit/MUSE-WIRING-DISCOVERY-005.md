# MUSE Wiring Discovery 005 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 5)
HEAD=705f9f52 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-29
METHOD=re-runnable probes: target.mts (extended) + sweep1.mts + merge.mts (all exit 0) + targeted source reads
EVIDENCE=tmp/wiring-audit/target.json + sweep1.json + merge.json (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-004.md (8/8 selectable, 8 LEVEL-4 cases, 75-tag scaffolding)

## New findings (all Muse-branch @ 705f9f52, independently executed)

### F14. json_query is keyword-rank-1: catalogue-absent stories now 15/15 strong

Targeted probe (2 self-grounded + 1 blind goal, limits 30 and 163):

- SELF_NAME rank 1 (13.7), SELF_DESC rank 1 (21.4), HAND rank 3 (11.9).
- Verdict SELECTABLE_BY_KEYWORD. Side signal: the blind goal
  ("what value sits at user.address.city...") ranks ci_generate_pipeline
  (15) and github_actions (12.2) ABOVE json_query (11.9) — router noise
  from "value/sits"? worth one line in a future router review, not a gap
  (rank 3 still selects).

The catalogue-absent-15 group is now FULLY storied: 7 deterministic-refs
+ 7 keyword-selectable + execute_python (dual: comment ref + rank 1) +
json_query (dual: executor-known + rank 1). WIRING-P3-001 selection work
is CLOSED; what remains is the 15 dormant static-candidate behavioral
review (name-similarity leads, still unverified).

### F15. Declaration census: 21+2 boot defaults named, 0 unknown, 25 no-required

Static census over all 163 (post-enforceContract, i.e. as the runtime
sees them), sweep1.json:

- 163/163 with execute(); 0 missing descriptions (the router's
  description filter never blinds a tool).
- 89/163 declare empty sideEffects (read/pure surface, author-declared).
- 21 permission-defaulted (exact list in sweep1.json, e.g.
  web_page_builder->write, template_manager->write, json_query->read,
  cloud_cost_estimator->read, central_answer->read); 2 rateLimit-defaulted
  (central_answer, web_page_builder); 0 unknown permissions.
- 11 empty-required + 14 null-required = 25 tools with NO declared
  required inputs. The list includes delete_file, deploy_pages,
  project_run, project_stop, project_repair, project_undo,
  security_scanner, engineering_discovery — a naive bulk live sweep
  with {} would be unsafe. Batch-2+ live calls REQUIRE per-tool
  execute() review first (the rule batch 1 followed).

Mechanism note: PERMISSION_HINTS guesses from the NAME
(browser|search|fetch->internet; write|edit|delete|deploy...->write;
else read). The guess list is now exact and reviewable; guess QUALITY
(e.g. form_inbox->read, monitoring->read) is asserted nowhere — a
P2 source-declaration batch (WIRING-P2-003) already proposes making
all 21+2 explicit at their definition sites.

### F16. Empty-input honesty batch 1: 8/9 honest, 1 unvalidated success

Live {} calls via runInContext->executeTool (all 9 execute() bodies read
first; memorize_codebase excluded — unconditional vectorDb.clear):

| tool | {} result |
|---|---|
| cloud_cost_estimator | ok:false 'needs a resources list' |
| docker_swarm_ops | ok:false 'needs an action: deploy_stack...' |
| llm_cache | ok:false 'Unknown action: undefined' |
| rss_fetch | ok:false via wrapper 'Tool reported failure without an error message' (empty-URL cause swallowed — minor evidence-quality wrinkle) |
| task_lifecycle | ok:TRUE {success} — see below |
| template_manager | ok:false "Template 'undefined' not found" |
| video_action | ok:false 'Unknown action' |
| execute_python | ok:false 'No Python code provided.' |
| json_query | ok:false 'json required' |

task_lifecycle declares required:['action'] but execute() defaults
action='update' and returns ok:true regardless — the schema requirement
is DECORATIVE. In-probe the broadcast() no-op'd (liveWssRef null, logged
9x); in production this emits a UI task_update event. Narrow gap, honest
reporting: schema-vs-execute consistency (new WIRING-P2-004 with the
sweep-continuation rule). Rerun-stable: identical 8/9 split on repeat.

### F17. Grouping merge v1: 75 tags -> 19 purpose trunks (PROPOSED)

merge.mts applies an explicit tag->trunk table (in the script, reviewable)
with coverage assertions (75/75 tags, 163/163 members, exit 0):

browser_ui=33 code_understanding=16 files=10 vcs_repo=11 build_generate=13
runtime_services=5 shell_terminal=4 testing_qa=6 network_api=12
database_data=6 infra_ops=6 observability=5 security=3 language_runtimes=4
media_images=2 planning_orchestration=10 memory_knowledge=7 interaction=8
documentation=2

HIGH_LEVEL_CAPABILITIES moves UNKNOWN -> PROPOSED_19 (merge.json). This
is a CANDIDATE taxonomy, not proven capabilities: each trunk still needs
its own path/contract/selection story before any count is claimed. The
merge table is the review surface — challenge the trunk boundaries, not
the arithmetic (asserted).

### F18. Method note: the batch-1 live-sweep safety rule (binding for batch 2+)

No live tool call in this audit without (a) reading its execute() body,
or (b) a fixture that bounds its effects. {}-input is NOT inherently
safe: 25 tools declare no required inputs and validation is per-tool
(no central schema gate in ToolService). memorize_codebase stays
execution-embargoed permanently (global clear). Next batches: review the
25 no-required executes individually, starting with delete_file,
deploy_pages, project_run/stop, then re-run the honest-input sweep.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot in all 3 probes)
TARGETED_SELECTION=9/9 SELECTABLE_BY_KEYWORD (best ranks 1; json_query HAND rank 3)
CATALOGUE_ABSENT_STORIES=15/15 strong (selection CLOSED)
DECLARATION_CENSUS=163 rows (21 perm-defaulted, 2 ratelimit-defaulted, 0 unknown, 89 empty-sideEffects, 25 no-required, 0 no-description)
EMPTY_INPUT_HONESTY_BATCH1=8/9 honest ok:false + 1 unvalidated ok:true (task_lifecycle) + 1 swallowed-cause nit (rss_fetch wrapper)
GROUPING_MERGE_V1=19 trunks / 163 members (PROPOSED, coverage-asserted)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2 (unchanged)
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery + bounded safe probes by design)

## Repair backlog changes (PROPOSED, unactioned)

- WIRING-P3-001 selection work CLOSED (json_query rank 1). Remaining:
  15 dormant static-candidate behavioral review.
- WIRING-P2-003 evidence pointer: exact 21+2 lists now in sweep1.json.
- NEW WIRING-P2-004 (schema/execute consistency + sweep continuation):
  task_lifecycle required-vs-default gap; batch-2+ rule (review-then-call
  for the 25 no-required names). Owner UNASSIGNED (shared surface).

## Corrections to prior checkpoints

- Checkpoint 4 "catalogue-absent-15 storied 14/15; json_query weakest":
  SUPERSEDED -> 15/15 storied; json_query dual-story (rank 1).
- Checkpoint 4 "HIGH_LEVEL still UNKNOWN": ADVANCED -> PROPOSED_19
  (merge.json v1; per-trunk stories pending, not claimed).
- Checkpoint 4 "best rank 1 for 5, rank 2 for 3": CLARIFIED — the rank-2
  cases were blind-goal columns; every tool's best-over-3-goals is rank 1.

## Limits / UNKNOWNs

- Bulk per-tool firewall/approval sweep: batch 1 (9 empty-input) done;
  25 no-required tools need individual review before live calls.
- Approval-gate (high/critical risk) behavior unprobed — needs explicit
  safety design, not casual {} calls.
- Verification-compat sweep pending (LEVEL 5-6).
- Per-trunk path/contract stories pending (19 trunks proposed, 0 storied).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:TMP='<writable>'; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\target.mts
  ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\sweep1.mts
  ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\merge.mts
Expected: all exit 0 modulo PowerShell stderr noise (JSON writes are the
verdict); target.json 9/9 SELECTABLE; sweep1.json census 163 + live 8/9
honest; merge.json 19 trunks / 163 members with coverage assertions.
NOTE: system TEMP may be sandbox-denied; use a worktree-local dir.
