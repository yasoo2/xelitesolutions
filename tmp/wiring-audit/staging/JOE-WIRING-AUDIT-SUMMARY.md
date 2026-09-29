# JOE WIRING AUDIT SUMMARY (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-WIRING-AUDIT-SUMMARY.md)

BRANCH=muse/joe-development @ adf02775. Evidence: tmp/wiring-audit/*.json + *.mts
(checkpoints 1-7). NVIDIA cross-review PENDING (worker BLOCKED). No repairs done.

RAW_TOOL_DEFINITIONS=93 files / 182 name literals (14 literals are non-tool noise: app/author/description/desktop/entities/express/fullstack/mobile/next/q/tablet/title/viewport/visibility)
REGISTERED_TOOLS=163 (0 dupes, 163/163 with execute(); boot log "Registered 163 tools (71 revived)")
EXECUTABLE_TOOLS=163 via registry + 40 unregistered-but-executable rewrite-source names + 0 hidden-exec beyond registry (memory inline pair ARE registered) — see note
HIGH_LEVEL_CAPABILITIES=PROPOSED_19 (merge.json v1 — CANDIDATE taxonomy, not proven capabilities)
WHY=purpose-merge of 75 tag-clusters with asserted coverage (75/75 tags, 163/163 members); per-trunk path/contract stories pending before any count is claimed
TRUNKS=browser_ui=33 code_understanding=16 files=10 vcs_repo=11 build_generate=13 runtime_services=5 shell_terminal=4 testing_qa=6 network_api=12 database_data=6 infra_ops=6 observability=5 security=3 language_runtimes=4 media_images=2 planning_orchestration=10 memory_knowledge=7 interaction=8 documentation=2
NEXT_DISCOVERY_STEP=per-trunk path/contract/selection stories; challenge trunk boundaries in review (mapping table in merge.mts)
SERVICES=15 (modules/services readdir; per-service wiring unsurveyed)
WORKERS=UNKNOWN
WHY=no top-level workers/ dir; worker-like code (browser/wsHub, background jobs, queues) not yet inventoried
NEXT_DISCOVERY_STEP=NVIDIA-scope service/worker inventory + Muse browser-worker pass

FULLY_WIRED=UNKNOWN (bulk; no tool reaches FULLY until verification-compat is surveyed)
PARTIALLY_WIRED=UNKNOWN (bulk; confirmed-partial items: 21+2 boot-defaulted declarations [exact lists in sweep1.json], dormant-21 group, catalogue-15 group [15/15 storied strong], alias layer 27/28 live, rewrite layer, 2 inline-shadowed memory tools [recall_memory divergence proven live], direct-HTTP duplicate path, LEVEL-4 spot tools + 28 empty-input batch-1+2 [8+8 honest, 1 unvalidated-success task_lifecycle, 1 approval pre-emption, 1 swallowed-cause, 4 absence-as-success, 1 honest offline fail], dead autoFix input, 2 uncontained default roots, deploy_pages token fallback, risk-tier layer [census 9/151/3/0 + 19 live points: alias-tiering follows target, destructive-scan shadow order, browser injection verdict, read_file empty-dir ok:true])
ORPHANED=5 confirmed (bulk_file_generator, codebase_navigator, generate_image, visual_qa, grep_search impl) + 4 preliminary (3 QA drafts + nvidia provider, untracked)
DUPLICATE=2 (recall_memory, memorize_codebase: registry def + inline handler each)
LEGACY_OR_DEAD=UNKNOWN (none proven; static absence alone is not the bar)
INTERNAL_ONLY=UNKNOWN (ROUTER_EXCLUDED=32 is exclusion-from-keyword-router, not proof of internal-by-design; per-name intent unsurveyed)
TEST_ONLY=UNKNOWN (api root selftest-*/verify_* harnesses are candidates, unverified)
UNKNOWN=per-trunk stories (19 proposed) + services/workers + bulk per-tool firewall sweep (8 spot + 28 empty-input batch-1+2 done; 25/25 no-required reviewed: 18 SAFE + 1 BOUND + 4 EMBARGO + 2 FIXTURE; 6 embargo/fixture unprobed by rule) + risk table SURVEYED (static full + 19 live tier points, sweep3.json) + LEVEL 5-6 proofs

IMPLEMENTED_NOT_REGISTERED=5 tool names (+4 untracked drafts preliminary)
TARGETED_SELECTION=9/9 SELECTABLE_BY_KEYWORD (best rank 1 each on 2 self-grounded + 1 blind goal; target.json)
DECLARATION_CENSUS=163 rows (sweep1.json): 163/163 execute, 0 no-description, 89 empty-sideEffects, 21 perm-defaulted + 2 ratelimit-defaulted + 0 unknown, 25 no-required-inputs (incl. delete_file, deploy_pages, project_run/stop — review-then-call rule)
EMPTY_INPUT_HONESTY_BATCH1=8/9 honest ok:false + task_lifecycle ok:true on {} despite required:['action'] (schema decorative; WIRING-P2-004) + rss_fetch swallowed-cause wrapper nit
EMPTY_INPUT_HONESTY_BATCH2=19/19 returned rerun-stable (sweep2.json): 8 honest ok:false + 7 ok:true reads/absences + delete_file approval_required (firewall pre-emption; risk-tiered, write+execute peers NOT gated) + repo_diff_summary swallowed-cause (2nd wrapper instance; WIRING-P2-005) + security_scanner honest guard rejection (static pre-read refuted) + analyze_codebase honest offline fail (no hang/cost)
NO_REQUIRED_PARTITION=25/25 execute() bodies read (006): 18 SAFE + 1 BOUND + 4 EMBARGO (memorize vectorDb.clear both paths; deploy_pages cross-workspace token fallback WIRING-P1-003; project_run server-start; browser_launch external default) + 2 FIXTURE (dead_code_detector npx knip + dead autoFix input; dependency_audit npm audit; both uncontained Joe-repo roots — WIRING-P2-006)
LEVEL4_SPOT_PROOFS=8 case-groups green-or-honest via canonical path (exec.json): json_query value=42; search_text total=1 in-workspace; grep total=1 (rewrite end-to-end); recall_memory inline-vs-registry divergence; fs_glob + image_generate honest unknown_tool; containment path_outside_workspace honest
REGISTERED_NOT_PLANNER_VISIBLE=UNKNOWN (planner visibility = keyword-router 132/163 UNION deterministic paths UNION priority/model surface; union uncomputed; catalogue-absent-15 now 15/15 storied)
PLANNER_VISIBLE_NOT_EXECUTABLE=0 proven beyond image_generate rewrite (broken target) — per-name execution sweep pending
EXECUTABLE_NOT_VERIFIABLE=UNKNOWN (verification-compat sweep pending)
RISK_TABLE_CENSUS=low=9 (analyze_codebase, central_answer, echo, inspect_directory, inspect_symbol, project_detect, read_file, repo_read_file, task_lifecycle), medium=151 (incl. input-tiered deploy_project/git_ops/browser_run at {}), high=3 on {} (delete_file, deploy_pages, shell_execute), critical=0 on {} (sweep3.json transcription of ToolService.ts:142-203)
RISK_TIER_LIVE=19/19 rerun-stable (sweep3.json): 8 approval_required blocks (1 critical: shell rm -rf; 7 high incl. deploy_pages, remove_file-alias, expose_port, shell{}, git push, browser delete-text) + 5 honest ok:false + 6 ok:true; gate semantics: high/critical need AUTO_APPROVE_ALL (default off, pre-empts before execute), low/medium pass under default autoSafe
CONTRACT_MISMATCHES=7 confirmed: (1) web_search double mapping (rewrite vs alias, one corpse); (2) memory inline-vs-registry divergence + unenforced permissions; (3) verificationTask string/object planner-executor mismatch (cited from CRITICAL-REAL-JOE-UI-001 evidence, not re-audited here); (4) dead_code_detector autoFix declared-but-never-read (planner-facing dead input); (5) ok:false-without-error wrapper substitutes generic message, real cause stuck in output (2 instances: rss_fetch, repo_diff_summary); (6) risk-scan shadow order: line-200 low-return + early-branch returns precede the line-201 destructive-input scan, so echo/central_answer/task_lifecycle + deploy_project.buildCommand are never content-scanned (echo destructive-text executed live; buildCommand gap code-indicated, never live-probed); (7) browser session-injection verdict: browser_run {} returns cross-user forbidden on an injected chat id (ToolService.ts:562-568) instead of sessionId_required
ALTERNATE_EXECUTION_PATHS=4 known: (a) ToolService canonical; (b) direct HTTP routes (runAsSystem, TOOL-HTTP-OWNER-GATE-001); (c) deterministic planner bypasses (ProjectPipeline hisOwnSchema, PlanningEngine classifyBuildScope/deterministicPhasesFor — NVIDIA-owned files, read-only cited); (d) ToolService inline execs (memory pair). Classification CANONICAL vs FALLBACK vs LEGACY per path: PENDING.

EXECUTABLE_NOTE=The 40 rewrite-source names execute by rename (not registration). "Executable tools" as a single number is therefore misleading; the honest statement is: 163 registered executables + 40 rename-covered aliases + 2 conditional shadows + 1 broken rewrite. Do NOT sum these into a headline without the partition.
