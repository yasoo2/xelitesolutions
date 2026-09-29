# JOE WIRING AUDIT SUMMARY (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-WIRING-AUDIT-SUMMARY.md)

BRANCH=muse/joe-development @ 389acc31. Evidence: tmp/wiring-audit/*.json + *.mts
(checkpoints 1-4). NVIDIA cross-review PENDING (worker BLOCKED). No repairs done.

RAW_TOOL_DEFINITIONS=93 files / 182 name literals (14 literals are non-tool noise: app/author/description/desktop/entities/express/fullstack/mobile/next/q/tablet/title/viewport/visibility)
REGISTERED_TOOLS=163 (0 dupes, 163/163 with execute(); boot log "Registered 163 tools (71 revived)")
EXECUTABLE_TOOLS=163 via registry + 40 unregistered-but-executable rewrite-source names + 0 hidden-exec beyond registry (memory inline pair ARE registered) — see note
HIGH_LEVEL_CAPABILITIES=UNKNOWN
WHY=primary-tag draft gives 75 clusters / 47 singletons / 0 untagged (target.json) — too fine-grained to be capabilities; merge pass pending; tool counts are not capability counts
NEXT_DISCOVERY_STEP=checkpoint-5 grouping merge: fold 75 tag-clusters into purpose trunks (browser/analysis/fs/repo/testing/api/network/security/shell/database/infrastructure/github credible) with per-capability rows
SERVICES=15 (modules/services readdir; per-service wiring unsurveyed)
WORKERS=UNKNOWN
WHY=no top-level workers/ dir; worker-like code (browser/wsHub, background jobs, queues) not yet inventoried
NEXT_DISCOVERY_STEP=NVIDIA-scope service/worker inventory + Muse browser-worker pass

FULLY_WIRED=UNKNOWN (bulk; no tool reaches FULLY until verification-compat is surveyed)
PARTIALLY_WIRED=UNKNOWN (bulk; confirmed-partial items: 21 boot-defaulted permission/rate declarations, dormant-21 group, catalogue-15 group [14/15 storied strong], alias layer 27/28 live, rewrite layer, 2 inline-shadowed memory tools [recall_memory divergence proven live], direct-HTTP duplicate path, 3 LEVEL-4 tools [search_text, json_query, grep-name])
ORPHANED=5 confirmed (bulk_file_generator, codebase_navigator, generate_image, visual_qa, grep_search impl) + 4 preliminary (3 QA drafts + nvidia provider, untracked)
DUPLICATE=2 (recall_memory, memorize_codebase: registry def + inline handler each)
LEGACY_OR_DEAD=UNKNOWN (none proven; static absence alone is not the bar)
INTERNAL_ONLY=UNKNOWN (ROUTER_EXCLUDED=32 is exclusion-from-keyword-router, not proof of internal-by-design; per-name intent unsurveyed)
TEST_ONLY=UNKNOWN (api root selftest-*/verify_* harnesses are candidates, unverified)
UNKNOWN=high-level grouping merge + services/workers + bulk per-tool firewall sweep (8 spot cases done) + LEVEL 5-6 proofs

IMPLEMENTED_NOT_REGISTERED=5 tool names (+4 untracked drafts preliminary)
TARGETED_SELECTION=8/8 SELECTABLE_BY_KEYWORD (ranks 1-2 on 2 self-grounded + 1 blind goal each; target.json)
LEVEL4_SPOT_PROOFS=8 case-groups green-or-honest via canonical path (exec.json): json_query value=42; search_text total=1 in-workspace; grep total=1 (rewrite end-to-end); recall_memory inline-vs-registry divergence; fs_glob + image_generate honest unknown_tool; containment path_outside_workspace honest
REGISTERED_NOT_PLANNER_VISIBLE=UNKNOWN (planner visibility = keyword-router 132/163 UNION deterministic paths UNION priority/model surface; union uncomputed; catalogue-absent-15 now 14/15 storied)
PLANNER_VISIBLE_NOT_EXECUTABLE=0 proven beyond image_generate rewrite (broken target) — per-name execution sweep pending
EXECUTABLE_NOT_VERIFIABLE=UNKNOWN (verification-compat sweep pending)
CONTRACT_MISMATCHES=3 confirmed: (1) web_search double mapping (rewrite vs alias, one corpse); (2) memory inline-vs-registry divergence + unenforced permissions; (3) verificationTask string/object planner-executor mismatch (cited from CRITICAL-REAL-JOE-UI-001 evidence, not re-audited here)
ALTERNATE_EXECUTION_PATHS=4 known: (a) ToolService canonical; (b) direct HTTP routes (runAsSystem, TOOL-HTTP-OWNER-GATE-001); (c) deterministic planner bypasses (ProjectPipeline hisOwnSchema, PlanningEngine classifyBuildScope/deterministicPhasesFor — NVIDIA-owned files, read-only cited); (d) ToolService inline execs (memory pair). Classification CANONICAL vs FALLBACK vs LEGACY per path: PENDING.

EXECUTABLE_NOTE=The 40 rewrite-source names execute by rename (not registration). "Executable tools" as a single number is therefore misleading; the honest statement is: 163 registered executables + 40 rename-covered aliases + 2 conditional shadows + 1 broken rewrite. Do NOT sum these into a headline without the partition.
