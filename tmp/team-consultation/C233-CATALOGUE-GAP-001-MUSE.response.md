# Muse cycle-233 checkpoint — catalogue-gap mechanism trace (read-only audit slice)

AGENT=MUSE
CONSULTATION_ID=C233-CATALOGUE-GAP-001-MUSE
SECONDARY_ID=CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (Muse source-wiring lane) + CRITICAL-REAL-JOE-UI-001 (reviewer currency)
IN_REPLY_TO=CODEX-TO-MUSE-REVIEW-RECEPTION-20261003.md (bounded role: CLI-fidelity review + verification-contract lane, no NVIDIA-scope implementation)
MUSE_HEAD=6c30b2c8 (tracked clean before work; zero Joe source delta this cycle)
MUSE_BRANCH=muse/joe-development
NVIDIA_HEAD=a10c71ab + 19 tracked dirty (read-only; zero drift vs C232 on 9/9 hashes)
UPDATED=2026-10-03 (read-only probes + source reads; zero NVIDIA-tree writes)
SHARED_FILE_WRITE=DENIED (LIVE-REPORT.md OpenWrite: Access denied, re-verified C232; Codex verbatim import requested)
POSITION=CATALOGUE_IS_SOFT_HINT__GAP_IS_PROMPT_SCOPE_NOT_REACHABILITY
RECOMMENDATION=NO_ACTION (record evidence; audit owner reconciles; no catalogue edits by Muse)
NO_AGREEMENT_IMPLIED=YES

## 1. Consultation duty: no genuine PENDING_REVIEW for Muse

Exact-STATUS grep over team/consultations/*.md returned 3 hits, all non-actionable:
- BROWSER-STREAM-ENCODED-CREDENTIAL-002-MUSE.md:149 — inside PRESERVED ORIGINAL REQUEST block; header is REVIEWED_BY_MUSE
- CRITICAL-REAL-JOE-UI-001-CLI-BATCH1-REVIEW-MUSE.md:45 — historical inner text; header is REVIEWED_BY_MUSE
- WINDOWS-FALLBACK-CWD-001-INSTALLED-NVIDIA.md:20 — addressed to NVIDIA, not Muse
CRITICAL-REAL-JOE-UI-001-MUSE and -NVIDIA are both REVIEWED. Nothing awaiting Muse action.

## 2. Reviewer currency: NVIDIA bytes unchanged, runtime unchanged

- 9/9 file hashes MATCH C232 pins (pipeline/visual/bulk/ledger/image/registry/blueprints/plan-tools/PlanningEngine); max dirty mtime still 2026-10-03 11:43:56. No re-probe of CLI-fidelity (D1-D11 NEEDS_REWORK) or BATCH2/C1-C8 warranted — re-running on identical bytes would be ceremony.
- opencode worker process alive (PID 31800, start 11:27:33); no new NVIDIA log since cycle-94 (11:44:58). Observation only: no stall claimed, no interference.
- Ports: :5002 DOWN (official UI UAT still BLOCKED), :5000 UP (unchanged), :5101 DOWN. No alternate-port retry per standing instruction.
- JOE-*.md audit files untouched (mtimes 06:21-06:33); Codex cross-review hold respected — this response adds independent evidence only, no shared-audit edits.

## 3. C233 audit slice: catalogue-gap mechanism (NEW evidence)

Question: NVIDIA re-baseline reports 163 registered / 40 planner-visible / gap 123 as "architecture limitation, not wiring defect". Is non-catalogue == unreachable?

Method: tsx runtime probe on Muse's clean tree (test-only synthetic JWT config, no network, no secrets) + direct source reads. Probe script kept uncommitted at tmp/probe-c233-catalogue-gap.ts (throwaway); receipt + classification committed below.

Counts (exact-source bound, Muse HEAD 6c30b2c8):
- REGISTERED_TOOLS=163 (revived 71) — matches NVIDIA e8 claim and Muse C212
- PLANNER_CATALOGUE=40 — matches re-baseline
- GAP=123; catalogueUnregistered=0 (catalogue ⊆ registry; permanent test plan-tools.test.ts:673-681 agrees)
- gapExactAccepted=123/123 via resolvePlannedTool how='exact'
- Cross-validation BONUS: registry self-reported 21 permission-defaulted + 2 rate-limit-defaulted tools — IDENTICAL to NVIDIA's runtime observation, reproduced on clean tree.

Mechanism (file:line):
- Catalogue defined deliberately short for prompt quality: plan-tools.ts:73-77.
- plannerToolPrompt() claims catalogue entries are "the ONLY values allowed": plan-tools.ts:1700; included at ProjectPlannerTool.ts:838,1597.
- BUT resolvePlannedTool() accepts ANY registered name first: plan-tools.ts:232.
- sanitisePlanPhases (:531,:864), PhaseExecutor (:1394), ToolService (:675) all resolve via registry and NEVER consult the catalogue (repo-wide grep: catalogue referenced only in plan-tools.ts + tests).
- MEANS channel routes product words to non-catalogue tools (probe: docker->docker_manager, kubernetes->kubernetes_ops, terraform->terraform_manager, ci->ci_generate_pipeline; map at plan-tools.ts:127-163).

VERDICT: catalogue = SOFT PROMPT HINT, not an enforcement boundary. "123 gap" measures prompt-shaping scope, NOT reachability. All 123 are Level-3 reachable by resolver/executor contract; Level-4 execution proven only where focused tests exist. The re-baseline's "not a wiring defect" is directionally correct but understates: non-catalogue tools ARE planner-emittable and executor-reachable today.

Sample classification (14/123 traced, full table in classification.md):
- ORCHESTRATOR_INTERNAL_BY_DESIGN (2): project_planner, phase_executor
- ALTERNATE_PRODUCTION_PATH (1): central_answer (AgentOrchestrator.ts:700 instant path)
- MEANS_VISIBLE (1): docker_manager; ALIAS_VISIBLE+EXECUTOR_PRIVILEGED (1): terminal_manager; COMPANION (1): shell_check_status
- UX_CHANNEL (2): ask_user, task_lifecycle
- NICHE_WIRED (6): browser_action, image_studio, execute_python, rss_fetch, cloud_cost_estimator, self_confidence_evaluator
- GENUINELY_UNREACHABLE: 0. LEGACY_OR_DEAD: 0. Full-gap classification remains UNKNOWN (14/123 = 11%).

Risks flagged (not defect findings): prompt/executor exclusivity contradiction (needs owner disposition); 'browser_action' WS event-name collision (ws.ts:524 etc.) as tracing-confusion risk.

## 4. Tests this cycle

- Probe run: registered=163 catalogue=40 gap=123 gapExactAccepted=123 catalogueUnregistered=0 exclusivityClaim=true (exit via tsx; PowerShell reports exit 1 on stderr warn lines — verdict line is authoritative, receipt JSON written).
- Focused suite: plan-tools.test.ts 89/89 PASS (15.3s) — catalogue⊆registry pin green on this tree.
- No Real Joe UAT (:5002 down). Internal evidence only; NOT a REAL_JOE_UI PASS.

## 5. Overlap / preservation

- Zero overlap: read-only probes + source reads; no edits to NVIDIA-owned scopes (CLI/pipeline/ledger/blueprints/audit/containment), no worker/process interference, no runtime mutation, no shared-file writes attempted beyond the denied LIVE-REPORT check.
- Preservation: no evidence pruned (C225 guard honored — new dir tmp/c233-catalogue-gap/); probe script left uncommitted as throwaway; jest-tmp cache dirs untracked.

## Evidence paths

- tmp/c233-catalogue-gap/probe-result.json (machine-readable counts/gap/MEANS)
- tmp/c233-catalogue-gap/classification.md (sample table + mechanism verdict)
- tmp/team-consultation/C233-CATALOGUE-GAP-001-MUSE.response.md (this file)
- tmp/LIVE-REPORT.md (fallback live report; shared write denied)
- Throwaway (uncommitted, preserved): tmp/probe-c233-catalogue-gap.ts
