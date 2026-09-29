# JOE ACTUAL ARCHITECTURE (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-ACTUAL-ARCHITECTURE.md)

AS-IS at muse/joe-development @ 705f9f52, from Muse checkpoints 1-5.
NVIDIA-scope rows are marked PENDING (registries/canonical-ingress/services/
workers/persistence/deployment + main-vs-Muse diff). No aspirational content.

## Runtime layers (observed)

- UI (web/): CONNECTED to API (:5000/:5002 dev). Guest flow works (Real Joe UAT evidence). Provider selector reads local circuit state (prior-cycle work).
- API ingress (api/src/api/routes, 32 routes): PARTIAL — canonical run ingress works (runs/start -> run evidence); 2 direct tool POST routes bypass ToolService policy (TOOL-HTTP-OWNER-GATE-001, P0 backlog).
- Run/session (run evidence store): CONNECTED — runId-bound receipts, checkpoints; test-isolation candidates pending (RUN-EVIDENCE-*, reviewed, unintegrated).
- Planning (PlanningEngine 244KB + plan-tools 110KB + ProjectPlannerTool 128KB + app-blueprints): PARTIAL — keyword router (132/163 after 32 exclusions) + deterministic bypasses (hisOwnSchema, classifyBuildScope) + model planner; CLI-routing misroute open (NVIDIA-owned batch1, worker blocked). Muse: read-only.
- Orchestration (AgentLoopService + PhaseExecutorTool 149KB, 8 executeTool call sites combined): CONNECTED with known contract gaps (prose verificationTask, premature voice — reviewed, partially repaired on Muse branch, unintegrated).
- Tool discovery (registry 163 + aliases 28 + rewrites 32 cases + PRIORITY 57 + CORE_TOOLS): PARTIAL — 5 orphans, 2 dead mappings, 1 broken rewrite (live-proven), 2 inline shadows (recall_memory divergence live-proven), catalogue-absent-15 storied 15/15 (this audit). Declaration census: enforceContract boot-defaults 21 permissions + 2 rate limits (exact lists in sweep1.json), 0 unknown; 25 tools declare no required inputs.
- Execution (ToolService.executeTool): CONNECTED canonical front door; PARTIAL policy (memory inline bypass; direct-HTTP duplicate). LEVEL-4 spot-proven (checkpoint 4): firewall runInContext is the legitimate entry (direct calls throw by design); search_text/grep/json_query execute; containment refuses out-of-workspace reads honestly; unknown_tool errors suggest closest names.
- Browser (modules/browser 18 files + BrowserRunTool + QA stack): CONNECTED — real Chromium evidence (Muse M01/M08 + QA provenance, unintegrated); action-effect receipts work.
- Terminal (shell_execute + npm_manager + BinaryService): CONNECTED (assumed; per-tool sweep pending).
- Files/projects (write/read/edit + containment): CONNECTED — containPath at ToolService layer (:438-498); ai_write_file runtime-bound contract.
- Verification (core/quality 33 files + ledger + acceptance + audits): PARTIAL — ledger works (engineer-flow green); prose/behavioral contract gaps open; 3 QA drafts orphaned.
- Self-fix (SelfFixService + handlers + diagnostic reasoning on main): PARTIAL — TS-handler family broad (Muse + NVIDIA rule sets coexist on main); general diagnostic reasoning claimed by NVIDIA handoff WITHOUT supporting diff (INVALID_HANDOFF per TEAM-STATE — do NOT rely on it).
- Memory (MemoryTools + vectorDb + LongTermMemory): PARTIAL — dual implementation (registry + inline) + global clear() scope issue (P2 backlog).
- Checkpoint/resume: CONNECTED for PhaseExecutor (EVAL-008 evidence on main).
- Providers (mesh + circuits + priority picker): PARTIAL — continuity/circuit/lease work extensive across agents; lease-fence + DuckAI-cancel candidates reviewed, unintegrated; provider-policy consultations pending.
- Persistence (JSON storage default; mongo optional): PENDING (NVIDIA scope).
- Workers/jobs/queues: PENDING — no top-level workers/ dir; worker-like code unsurveyed.
- Deployment boundaries: PENDING (NVIDIA scope). Portability posture: file/quality/provider code must avoid localhost-only assumptions per standing rules; no new audit performed here.

## Execution paths

1. CANONICAL: UI -> API runs/start -> planner/router -> PhaseExecutor -> ToolService (rewrite->registry->alias) -> firewall -> tool -> evidence -> ledger -> UI. CONNECTED.
2. FALLBACK (suspect): direct HTTP tool routes (runAsSystem). PARTIAL/policy-gap. P0.
3. FALLBACK (by design?): deterministic planner bypasses. PARTIAL. Needs NVIDIA classification.
4. DUPLICATE (accidental): ToolService inline memory execs. PARTIAL. P2.
5. LEGACY: UNKNOWN — none proven; do not label without dynamic/config survey.

## Data flow (observed)

Run evidence (JSON store) is the spine: tool_started inputs, phase results, verification receipts, checkpoints. Browser/terminal/file evidence flows through it. Gaps: QA finding provenance (Muse fix reviewed, unintegrated); downgrade-note compact-receipt propagation (reviewed, partial).

## What is NOT in this map yet

Services/workers/persistence/deployment detail, per-trunk path stories (19 trunks PROPOSED in merge.json v1, 0 storied), bulk per-tool firewall matrix (8 spot + 9 empty-input batch-1 done; 25 no-required under review-then-call rule), approval-gate behavior, contract audit per boundary (9 boundaries listed in CRITICAL command, 3 mismatches confirmed + 1 schema/execute nit task_lifecycle), LEVEL 5-6 proofs, main-vs-Muse diff reconciliation, NVIDIA cross-review. All queued, none claimed.
