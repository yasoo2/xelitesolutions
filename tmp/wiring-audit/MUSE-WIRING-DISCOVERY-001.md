# MUSE Wiring Discovery 001 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 1)
HEAD=c2ba89c4 (muse/joe-development, tracked clean; discovery probes only, no source edits)
DATE=2026-09-29
METHOD=re-runnable probes: tmp/wiring-audit/discover.mts + exposure.mts
EVIDENCE=tmp/wiring-audit/discovery.json + exposure.json (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.

## Scope of this checkpoint

Muse-assigned areas: capability implementations, browser/runtime, verification,
planner/tool behavior, Muse-developed capabilities, source-level wiring.
 registries/canonical-ingress/dispatch-ownership cross-check belongs to NVIDIA;
this file reports Muse-observed runtime facts for independent review.

## Evidence-backed counts (Muse branch @ c2ba89c4)

| Metric | Value | Method |
|---|---|---|
| RAW definition files | 93 | readdir definitions/ |
| Exported *Tool symbols | 172 | static `export (class\|const\|function) *Tool*` regex (APPROX: may include helpers; per-symbol reconciliation pending) |
| REGISTERED_TOOLS (runtime) | 163 | live `tools` import; log line "Registered 163 tools (71 revived)" |
| Registered with execute() | 163/163 | runtime typeof check |
| Duplicate registered names | 0 | runtime scan |
| Services (modules/services) | 15 | readdir |
| API routes | 32 | readdir api/src/api/routes |
| Browser modules | 18 files | readdir modules/browser |
| Quality/verification modules | 33 files (+3 untracked Muse QA drafts) | readdir core/quality |
| Orchestrator modules | 17 files; PlanningEngine 244KB, plan-tools 110KB | readdir core/orchestrator |
| Test surface | __tests__ 560 + tests/ 212 files | counts (no quality claim) |

## Registry reconciliation (runtime truth)

- IMPLEMENTED_NOT_REGISTERED (confirmed): `bulk_file_generator`
  - Fully declared ToolDefinition with permissions/rate-limit/execute
    (definitions/BulkFileGeneratorTool.ts:5-42), IMPORTED in registry.ts,
    but never added to `revivedTools`/`baseTools`. Also present in
    ROUTER_EXCLUDED, so unreachable on both planner and executor paths.
  - PRIMARY_STATE=ORPHANED. Repair candidate for backlog (P1), NOT fixed here.
- Symbol gap: 172 static symbols vs 163 registered names. NOT claimed as
  9 orphans: multi-export files (EliteTools.*, MemoryTools, object-form
  definitions like TodoWriteTool/ArchitectTool) need per-symbol mapping.
  NEXT_DISCOVERY_STEP: map each exported symbol to its runtime name/absence.
- Alias layer: 28/28 TOOL_ALIASES targets resolve to registered names;
  0 alias sources shadow a registered name. FULLY_WIRED (static+runtime).
- Boot-mended contracts (PARTIALLY_WIRED, runtime-muted not source-fixed):
  21 tools with empty `permissions` defaulted at boot (incl.
  web_page_builder->write, central_answer->read, shell_check_status->read,
  ask_user->read, form_inbox->read, 7 EliteTools); 2 tools with
  rateLimit 0 defaulted (central_answer, web_page_builder).
  Source: registry enforceContract + exposure.json/contractDefaults.

## Planner/provider exposure (runtime truth)

- Keyword router (toolCatalog.selectToolsFor, limit 30):
  ROUTER_EXCLUDED=32 names; 31 resolve, 1 stale (bulk_file_generator,
  unregistered). Planner-visible via this path: 132/163.
- Provider surface (tool-picker.selectToolDefsForProvider, cap 72):
  PRIORITY_TOOL_NAMES=57; only 36 resolve; 21 missing from registry:
  read_file_tree, grep_search, fs_glob, check_syntax, generate_tests,
  generate_docs, db_inspect, command_policy_check, tool_create_shell,
  shell_status, product_search, web_search, github_create_repo,
  image_generate, deep_research, business_logic, chaos_testing,
  cost_estimator, self_confidence, terraform_ops, security_scan_repo.
  NOTE: several are alias-family names (grep_search->search_text,
  web_search->search_api) rescued at EXECUTION time by TOOL_ALIASES, so the
  model never sees their schema but the name still executes. This matches
  Codex's independent main-branch "21 missing names" observation and is
  corroborated here on the Muse branch — design tension, not all 21 are bugs.
  image_generate is the known broken alias (no target); the rest need
  per-name classification (dormant vs alias-covered vs genuinely absent).
- CORE_TOOLS=9, all resolve.
- Deterministic bypasses observed (not modified): ProjectPipelineTool
  hisOwnSchema path, PlanningEngine.classifyBuildScope/deterministicPhasesFor,
  capability-match, tool-rerank (Muse M05). CLI-routing ownership stays NVIDIA
  per CLI-BATCH1 decision; no competing edits made.

## Executor reachability (Muse-observed)

- Single canonical dispatch: ToolService.executeTool (ToolService.ts:251),
  aliasing layer (212-249) -> registry find (675) -> alias fallback (692-696)
  -> unknown_tool with did-you-mean (714-717).
- PhaseExecutorTool + AgentLoopService contain 8 executeTool call sites
  combined (grep count; per-site contract audit pending).
- KNOWN SEPARATE FINDING (not re-audited here): direct HTTP tool routes use
  runAsSystem and skip ToolService user/session/approval branching
  (TOOL-HTTP-OWNER-GATE-001, Muse response committed 94fd393d).

## Verification chain (Muse area, structural)

- core/quality: verification-ledger.ts, plan-verification.ts, acceptance.ts,
  behaviour-audit, terminal-audit, ui-inspection, visual-audit, html-qa,
  self-repair, repair-engine, improve-loop, run-journal, scope-audit,
  named-requirements, workflow-contract, source-contract + app-audit (125KB),
  behaviour-audit (119KB). Largest QA-adjacent: ReactProjectTool 550KB,
  react-app-templates 354KB, ApiProjectTool 201KB, ProjectPipelineTool 190KB,
  WebPageBuilderTool 185KB, ProjectEditTool 176KB, intelligent-router 159KB,
  BrowserSmartTools 151KB, PhaseExecutorTool 149KB, ProjectPlannerTool 128KB.
- 3 untracked Muse QA drafts preserved, NOT classified as dead:
  image-semantic-qa.ts, live-data-qa.ts, shop-qa.ts (prior-cycle work).
- Per-capability REAL_JOE_PROVEN flags: UNKNOWN at this checkpoint except
  where prior Real Joe UAT evidence exists (run22 PARTIAL, run23/24 FAIL —
  see TEAM-STATE; no new UAT run in this discovery checkpoint).

## Muse-developed capabilities (disposition pointers)

M01 browser effect receipts, M02 verification contracts, M03 routing guards,
M04 schema/seed pins, M05 context/tool-rerank, M08 click-effect evidence,
plus seed-delivery (f069fc5d), URL redaction (873010b3), phase voice
(a5052571), QA provenance (299cd90f): all present on this branch, tracked
clean, with focused-test evidence per BACKLOG-RECONCILIATION. Full
per-capability wiring rows (REGISTERED/PLANNER_VISIBLE/EXECUTOR_REACHABLE/
REAL_JOE_PROVEN) are the next checkpoint, not claimed here.

## Repair backlog candidates (PROPOSED, unactioned)

- P1: bulk_file_generator orphan — decide register-with-hardening vs
  INTERNAL_ONLY_BY_DESIGN (it writes arbitrary paths; needs containment
  review before any registration).
- P2: 21 boot-defaulted permission/rate-limit declarations — fix at source
  per tool instead of relying on enforceContract defaults.
- P2: provider-priority 21 — classify each as alias-covered/dormant/absent;
  fix image_generate alias under free-first creative policy (separate
  consultation already answered).
- P3: duplicate/alternate execution paths (direct HTTP routes, deterministic
  bypasses) — document CANONICAL vs FALLBACK vs LEGACY per path.

## Limits / UNKNOWNs

- HIGH_LEVEL_CAPABILITIES count: UNKNOWN (grouping pass pending).
- Per-tool firewall/approval/pass rates: UNKNOWN (execution sweep pending).
- FULLY_WIRED/PARTIALLY_WIRED/LEGACY totals: UNKNOWN beyond items above.
- No Real Joe UAT in this checkpoint (read-only discovery by design).
- Static symbol regex is approximate; runtime registry numbers are exact.
- NVIDIA areas (canonical ingress, services/workers, persistence/deployment
  boundaries, main-vs-Muse diff) intentionally untouched; awaiting NVIDIA
  cross-review, which is currently BLOCKED (worker parent exited 10:32).

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true';
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\discover.mts
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\exposure.mts
Expected: registered=163, priority 36/57, routerExcluded 32 (1 stale),
aliases 28/28 resolving, dupes 0.
