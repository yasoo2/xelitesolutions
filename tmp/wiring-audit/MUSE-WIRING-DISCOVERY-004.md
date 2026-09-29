# MUSE Wiring Discovery 004 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 4)
HEAD=389acc31 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-29
METHOD=re-runnable probes: tmp/wiring-audit/target.mts + exec.mts (exit 0) + source reads
EVIDENCE=tmp/wiring-audit/target.json + exec.json (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-003.md (32 rewrite cases, 15 stories, 2 inline shadows)

## New findings (all Muse-branch @ 389acc31, independently executed)

### F10. All 8 targeted tools are KEYWORD_SELECTABLE (ranks 1-2, incl. blind goals)

The 7 "keyword-only-unobserved" tools from checkpoint 3 (cloud_cost_estimator,
docker_swarm_ops, llm_cache, rss_fetch, task_lifecycle, template_manager,
video_action) plus execute_python were each tested with 3 goals: 2
self-grounded (built ONLY from the tool's own name/tags/description) + 1
hand-written blind natural goal. selectToolsFor at limit 30 AND limit 163:

- 8/8 SELECTABLE_BY_KEYWORD. Best rank 1 for 5 tools, rank 2 for 3
  (cloud_cost_estimator HAND: deploy_pages #1 21.1 vs estimator #2 13.2;
  llm_cache HAND: browser_design_tokens #1 8.0 vs llm_cache #2 7.6;
  template_manager HAND: scaffold_project #1 9.3 vs manager #2 6.6).
- Even the weakest (llm_cache HAND, margin 0.4) still selects. No
  NO_DESCRIPTION case: all 8 carry descriptions, so none is invisible to
  the router's description filter (toolCatalog.ts:188).

Conclusion: the 20-goal corpus absence was CORPUS COVERAGE, not a routing
gap. No keyword-map repair is needed for these 8. The catalogue-absent-15
group is now storied 14/15 strong: 7 deterministic-refs + 7
keyword-selectable + execute_python both; json_query remains weakest
(executor-known only, keyword rank unprobed — checkpoint-5 micro-task).
WIRING-P3-001 shrinks to the 15 dormant static-candidate behavioral review
(name-similarity leads, still unverified).

### F11. LEVEL-4 spot proofs: 8 canonical-path executions, all honest

Through executionFirewall.runInContext (the SAME legitimate context entry
every orchestrated run uses — not a bypass) -> ToolService.executeTool,
JOE_TEST_MODE + OFFLINE_MODE, fixtures created and removed by the probe:

| case | result |
|---|---|
| json_query canonical {a:{b:42}} path a.b | ok:true, value=42 (GREEN) |
| search_text in-workspace (token fixture) | ok:true, total=1 (GREEN) |
| grep in-workspace (rewrite path) | ok:true, total=1 (GREEN, rewrite executes end-to-end) |
| search_text out-of-workspace | ok:false path_outside_workspace (containment HONEST) |
| grep out-of-workspace | ok:false path_outside_workspace (routing fired: `start search_text (orig=grep)`, then containment stopped the read) |
| recall_memory canonical, empty input | ok:true 'No relevant memory found.' (INLINE handler, no validation) |
| recall_memory registry-direct, empty input | ok:false 'recall_memory needs a query' (registry validates) |
| fs_glob (dormant, unregistered) | ok:false unknown_tool "fs_glob" (HONEST negative) |
| image_generate (broken rewrite) | rewrite FIRES (`start generate_image (orig=image_generate)`) then unknown_tool "generate_image" + did-you-mean suggestions (broken target PROVEN live) |

Findings:
- Inline-wins + divergence for recall_memory is now BEHAVIORAL, not just
  source-order: same empty input, opposite verdicts by path.
- Workspace containment is load-bearing and honest: session-audit-sess
  resolves to data/projects/session-audit-sess (WorkspaceService), and
  out-of-root reads refuse with a clean error instead of leaking.
- memorize_codebase DELIBERATELY NOT executed: both implementations call
  vectorDb.clear() (global, not workspace-scoped). Destructive testing is
  out of audit scope. Its routing is proven by source order (ToolService
  :583 before registry :675) + the recall_memory live analog.
- Unknown-tool errors now include closest-name suggestions — good UX,
  worth keeping in any rewrite-layer repair.

### F12. First-pass grouping: 75 primary tags, 47 singletons — not a capability count

Clustering 163 registered tools by tags[0]: 75 distinct tags, 0 untagged,
browser=33, analysis=10, fs=8, then a long tail (47 tags with exactly 1
tool: cost, media, templates, system, payments, ...). Full table in
target.json groupingDraft.

Conclusion: the tag vocabulary is too fine-grained to BE the capability
taxonomy (a 1-tool "capability" is just a tool with a hat). HIGH_LEVEL_
CAPABILITIES stays UNKNOWN, now with a BOUNDED method: merge pass over the
75 clusters (browser/analysis/fs/repo/testing/api/network/security/shell/
database/infrastructure/github are credible trunks; singletons merge by
purpose) is checkpoint-5 work. The draft is scaffolding, not a verdict.

### F13. Method note: the legitimate LEVEL-4 entry point

Direct executeTool without ambient context THROWS by design
("Execution bypass detected... must go through AgentOrchestrator.
coordinate()"). executionFirewall.runInContext(traceId, fn, owner) is the
documented test-safe entry and is what this probe uses. Any future
firewall/approval sweep or LEVEL-4 campaign must use it; ad-hoc direct
calls prove only the firewall works, not the tool.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot in both probes)
TARGETED_SELECTION=8/8 SELECTABLE_BY_KEYWORD (best ranks 1-2; 2 self-grounded + 1 blind goal each)
LEVEL4_SPOT_PROOFS=8 case-groups GREEN-or-honest (json_query, search_text x2 paths, grep x2 paths, recall_memory pair, fs_glob, image_generate)
INLINE_WINS=1 proven live (recall_memory) + 1 by source-order+analog (memorize_codebase, unexecuted: destructive)
CONTAINMENT=proven honest (path_outside_workspace) + session-root mapping recorded
GROUPING_DRAFT=75 primary tags / 47 singletons / 0 untagged (scaffolding; HIGH_LEVEL still UNKNOWN)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2 (unchanged)
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery + bounded safe probes by design)

## Repair backlog changes (PROPOSED, unactioned)

- WIRING-P3-001 NARROWED: keyword-7 targeted probes DONE (all selectable,
  no repair). Remaining: 15 dormant static-candidate behavioral review.
- No new batches. memorize_codebase execution embargo noted under
  WIRING-P2-001 (repair must be verified by routing/contract tests + a
  scoped-memory fixture, never by live global-clear execution).
- WIRING-P2-002 note: unknown_tool suggestions are good UX — preserve in
  the single-winner gate work.

## Corrections to prior checkpoints

- Checkpoint 3 "7 KEYWORD_ONLY_UNOBSERVED": SUPERSEDED → 7
  KEYWORD_SELECTABLE (target.json ranks). execute_python: comment-level
  deterministic ref + keyword-selectable rank 1 — dual story.
- Checkpoint 3 matrix row GROUP-catalogue-absent-15 + GROUP-registered-163
  recommended actions: PARTIALLY DONE (this checkpoint); bulk firewall
  sweep + grouping merge still open.

## Limits / UNKNOWNs

- Bulk per-tool firewall/approval sweep still pending (8 spot cases only).
- Verification-compat sweep pending (spot tools reach LEVEL 4, not 5-6).
- Grouping merge pass pending (checkpoint 5).
- No Real Joe UAT in this checkpoint.
- memorize_codebase unexecuted (destructive); its registry-vs-inline
  output divergence is source-observed, not live-proven.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:TMP='<writable>'; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\target.mts
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\exec.mts
Expected: both exit 0; target.json 8/8 SELECTABLE_BY_KEYWORD, 75 tags,
0 untagged; exec.json 8 case-groups as in F11 table,
fixtures.removed=true, no residue (session fx dir removed; data/ ignored).
NOTE: system TEMP may be sandbox-denied; use a worktree-local dir.
(PowerShell may report exit 1 from stderr routing noise on the second
probe — the probe's own JSON write is the verdict.)
