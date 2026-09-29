# JOE WIRING AUDIT SUMMARY (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-WIRING-AUDIT-SUMMARY.md)

BRANCH=muse/joe-development @ 8ce2616c. Evidence: tmp/wiring-audit/*.json + *.mts
(checkpoints 1-3). NVIDIA cross-review PENDING (worker BLOCKED). No repairs done.

RAW_TOOL_DEFINITIONS=93 files / 182 name literals (14 literals are non-tool noise: app/author/description/desktop/entities/express/fullstack/mobile/next/q/tablet/title/viewport/visibility)
REGISTERED_TOOLS=163 (0 dupes, 163/163 with execute(); boot log "Registered 163 tools (71 revived)")
EXECUTABLE_TOOLS=163 via registry + 40 unregistered-but-executable rewrite-source names + 0 hidden-exec beyond registry (memory inline pair ARE registered) — see note
HIGH_LEVEL_CAPABILITIES=UNKNOWN
WHY=grouping pass pending; tool counts are not capability counts
NEXT_DISCOVERY_STEP=checkpoint-4 grouping: cluster 163 + orphans + services into capabilities with per-capability rows
SERVICES=15 (modules/services readdir; per-service wiring unsurveyed)
WORKERS=UNKNOWN
WHY=no top-level workers/ dir; worker-like code (browser/wsHub, background jobs, queues) not yet inventoried
NEXT_DISCOVERY_STEP=NVIDIA-scope service/worker inventory + Muse browser-worker pass

FULLY_WIRED=UNKNOWN (bulk)
PARTIALLY_WIRED=UNKNOWN (bulk; confirmed-partial items: 21 boot-defaulted permission/rate declarations, dormant-21 group, catalogue-15 group, alias layer 27/28 live, rewrite layer, 2 inline-shadowed memory tools, direct-HTTP duplicate path)
ORPHANED=5 confirmed (bulk_file_generator, codebase_navigator, generate_image, visual_qa, grep_search impl) + 4 preliminary (3 QA drafts + nvidia provider, untracked)
DUPLICATE=2 (recall_memory, memorize_codebase: registry def + inline handler each)
LEGACY_OR_DEAD=UNKNOWN (none proven; static absence alone is not the bar)
INTERNAL_ONLY=UNKNOWN (ROUTER_EXCLUDED=32 is exclusion-from-keyword-router, not proof of internal-by-design; per-name intent unsurveyed)
TEST_ONLY=UNKNOWN (api root selftest-*/verify_* harnesses are candidates, unverified)
UNKNOWN=high-level grouping + services/workers + per-tool firewall sweep + LEVEL 4-6 proofs

IMPLEMENTED_NOT_REGISTERED=5 tool names (+4 untracked drafts preliminary)
REGISTERED_NOT_PLANNER_VISIBLE=UNKNOWN (planner visibility = keyword-router 132/163 UNION deterministic paths UNION priority/model surface; union uncomputed)
PLANNER_VISIBLE_NOT_EXECUTABLE=0 proven beyond image_generate rewrite (broken target) — per-name execution sweep pending
EXECUTABLE_NOT_VERIFIABLE=UNKNOWN (verification-compat sweep pending)
CONTRACT_MISMATCHES=3 confirmed: (1) web_search double mapping (rewrite vs alias, one corpse); (2) memory inline-vs-registry divergence + unenforced permissions; (3) verificationTask string/object planner-executor mismatch (cited from CRITICAL-REAL-JOE-UI-001 evidence, not re-audited here)
ALTERNATE_EXECUTION_PATHS=4 known: (a) ToolService canonical; (b) direct HTTP routes (runAsSystem, TOOL-HTTP-OWNER-GATE-001); (c) deterministic planner bypasses (ProjectPipeline hisOwnSchema, PlanningEngine classifyBuildScope/deterministicPhasesFor — NVIDIA-owned files, read-only cited); (d) ToolService inline execs (memory pair). Classification CANONICAL vs FALLBACK vs LEGACY per path: PENDING.

EXECUTABLE_NOTE=The 40 rewrite-source names execute by rename (not registration). "Executable tools" as a single number is therefore misleading; the honest statement is: 163 registered executables + 40 rename-covered aliases + 2 conditional shadows + 1 broken rewrite. Do NOT sum these into a headline without the partition.
