# MUSE Wiring Discovery 003 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 3)
HEAD=8ce2616c + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-29
METHOD=re-runnable probe: tmp/wiring-audit/reach.mts (exit 0) + targeted source reads
EVIDENCE=tmp/wiring-audit/reachability.json (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-002.md (5 orphans, 12+16 rewrites, dormant-21)

## New findings (all Muse-branch @ 8ce2616c, independently executed)

### F6. All 16 multi-name rewrite conditions are now classified per case

ToolService.ts `if (name === ... || ...)` conditions, each read, each source
and target checked against the live 163-name registry:

- PURE_RENAME (9): L429 shell_execute, L432 project_detect fallback,
  L499 dependency_audit, L502 quality_run, L505 project_detect,
  L508 website_full_pipeline, L526 search_text, L529 browser_run.
  All sources unregistered, all targets registered. No shadowing.
- RENAME_SHAPING (6): L406 npm_manager (+command), L438 write_file
  (+containPath; ai_write_file is identity), L477 file_edit (+containPath),
  L488 read_file (+containPath), L519 inspect_directory (+depth),
  L532/L536 git_ops (+operation). All targets registered.
- SHAPING_ONLY (1): L74 rate-limit bucket key. No rename. The visual_qa
  key is dead weight (unregistered name), harmless.
- CONDITIONAL (2, single-name): L390 scaffold_full_stack->react_project
  (only frontendish && !backendish inputs); L547
  github_repo_manager->git_ops (only action=push). Registry entries are
  used for non-matching inputs: partial, input-dependent shadow.
- INLINE_EXEC (2): recall_memory (L571), memorize_codebase (L583) — see F8.

Full-shadow count across all 20 cases: ZERO. The rewrite layer does not
kill any live registry entry except via the two conditional paths and the
two inline handlers.

### F7. The 12 single-name renames are clean except the known broken one

All 12 sources unregistered; 11/12 targets registered. The exception is
image_generate->generate_image (target unregistered) — reconfirms
checkpoint 2, still waits on the free-first creative contract.

Behavior lead CLOSED: browse/open_browser/web_browse add no default
actions, but BrowserRunTool.ts:331 fails honest
(`actions_or_instruction_required`) when both actions and instructionText
are absent. No silent no-op, no false success.

### F8. NEW: two registered memory tools are shadowed by inline handlers

recall_memory and memorize_codebase ARE registered (via ...MemoryTools
spread, registry.ts:262) with working execute() — but ToolService.ts:571
and :583 intercept the names and return BEFORE the registry lookup
(:675) and BEFORE the firewall/approval check (:722+).

Consequences (read-only finding, no exploit attempted):
- Two live implementations per name that can DIVERGE. They already
  differ: the registry execute() validates query/directory inputs; the
  inline handlers do not.
- memorize_codebase declares permissions ['read','write'] +
  sideEffects ['write'], but the canonical ToolService path never
  enforces them. Latent today (single-user bypass is on by design),
  load-bearing the day Joe serves a second user.
- PRIMARY_STATE=DUPLICATE (two implementations, one winner per path)
  with a firewall-bypass contract gap on the canonical path.

### F9. Per-name reachability stories for the 15 catalogue-absent tools

All 15 registered, all 15 with execute(). NONE is ROUTER_EXCLUDED
(correction: checkpoint 2 said project_planner was excluded — wrong;
ROUTER_EXCLUDED is 32 names in toolCatalog.ts:317 and project_planner
is not among them).

- DETERMINISTIC_REFS (8): ask_user (PlanningEngine clarify fallback
  :727-734 + ANSWER_ONLY member), ambiguity_resolver,
  multi_agent_debate, self_confidence_evaluator (ANSWER_ONLY plan
  validation :270-273), execute_python (PlanningEngine comment-level
  ref — weakest), project_planner (ProjectPipeline :3 +
  ProjectPlanner :2 refs — own deterministic entry), kubernetes_ops
  (plan-tools infra-kind map :158), json_query (PhaseExecutor
  path-mapper exclusion :256 — known-to-executor, not a call).
- KEYWORD_ONLY_UNOBSERVED (7): cloud_cost_estimator, docker_swarm_ops,
  llm_cache, rss_fetch, task_lifecycle, template_manager, video_action.
  No deterministic refs found; reachable via keyword/scored selection
  but not selected by the 20-goal corpus. Niche-by-purpose is plausible
  for each; none is proven dead. Targeted-goal probes are checkpoint-4
  work.

Side observation: ROUTER_EXCLUDED contains the file/shell workhorses
(shell_execute, write_file, read_file, file_edit, delete_file,
inspect_directory) — keyword routing never selects them; they arrive
via deterministic/planner paths. Any "planner-visible" count must union
both paths, not quote one.

Side observation 2: PhaseExecutorTool.ts:254 names bulk_file_generator
(the orphan) in its path-mapper exclusion list — the executor knows the
tool's contract but the registry cannot construct it. If a plan ever
names it, the failure is unknown_tool at :700, not a contract error.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (0 dupes, 163/163 with execute())
REWRITE_CASES=20 classified (16 multi-name + 2 conditional + 2 inline)
FULL_SHADOWS=0 | CONDITIONAL_SHADOWS=2 | INLINE_SHADOWS=2 (registered defs)
SINGLE_RENAMES=12 (11 clean, 1 broken: image_generate)
CATALOGUE_ABSENT_STORIES=15/15 (8 deterministic-refs, 7 keyword-only-unobserved)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged)
HIGH_LEVEL_CAPABILITIES=UNKNOWN (grouping pass still pending)
FULLY_WIRED/PARTIALLY_WIRED/LEGACY totals=UNKNOWN beyond items above
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery by design)

## Repair backlog candidates (PROPOSED, unactioned — appended)

- P2: memory-tool dual implementation — delete the inline handlers OR
  the registry defs so one path owns each name; enforce declared
  permissions on the surviving canonical path. Owner TBD (touches
  ToolService — coordinate; no competing edit by Muse).
- P3: 7 keyword-only-unobserved tools — targeted-goal selection probes,
  then niche-by-design classification or keyword-map repair.
- P3: scaffold_full_stack / github_repo_manager conditional shadows —
  document input-dependent routing in the tool contracts; gate must
  assert per-input winners.

## Corrections to prior checkpoints

- Checkpoint 2 "project_planner is ROUTER_EXCLUDED by design": WRONG.
  project_planner is reachable via its deterministic pipeline refs and
  is simply not in ROUTER_EXCLUDED. Verdict corrected to
  DETERMINISTIC_REFS; no exclusion claim remains.
- Checkpoint 2 "rewrites=12": SUPERSEDED. The 12 were single-name
  unconditional renames only. The complete rename/shaping surface is
  12 singles + 16 multi-name + 2 conditional + 2 inline = 32 cases,
  all now classified.

## Limits / UNKNOWNs

- execute_python's PlanningEngine ref is comment-level; its real
  selection story needs a targeted probe (checkpoint 4).
- No firewall/approval/pass-rate execution sweep yet (LEVEL 4 spot
  proofs for 3-5 capabilities are checkpoint-4 work).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:TMP='<writable>'; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\reach.mts
Expected: exit 0, registered=163, fullShadow=[], conditional=2,
identityShaped=[ai_write_file,file_edit,read_file],
inline=[recall_memory,memorize_codebase]:SHADOWED_REGISTRY_DEF.
NOTE: system TEMP may be sandbox-denied; use a worktree-local dir.
(PowerShell may report exit 1 from stderr routing noise — the probe's
own JSON + reachability.json write are the verdict.)
