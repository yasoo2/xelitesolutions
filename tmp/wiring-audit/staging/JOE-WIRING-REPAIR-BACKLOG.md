# JOE WIRING REPAIR BACKLOG (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-WIRING-REPAIR-BACKLOG.md)

AUDIT-FIRST: no batch below is approved for implementation by this draft.
Each needs an implementation owner + independent reviewer + tests + Real Joe
UAT per the CRITICAL command. Batches touching NVIDIA ACTIVE-claimed files
(PlanningEngine/IntentParser/ProjectPipeline/memory/context) MUST NOT be
started by Muse without an ownership decision.

---

BATCH_ID=WIRING-P0-001
CAPABILITIES=direct HTTP tool execution policy (duplicate execution path)
ROOT_CAUSE=authenticated direct POST routes use runAsSystem, skipping ToolService user/session/approval branching (TOOL-HTTP-OWNER-GATE-001; synthetic RED reproducible)
FILES=API route files + ToolService/firewall (exact list in proposal)
IMPLEMENTATION_OWNER=UNASSIGNED (Muse reviewed; cannot self-assign shared surface)
REVIEW_OWNER=UNASSIGNED
TESTS=two-identity RED->GREEN + approval RED->GREEN + focused security + AGENTS gates
REAL_JOE_UAT=local UI tool behavior verification after fix
ROLLBACK=revert route/firewall diff
DEPENDENCIES=none

---

BATCH_ID=WIRING-P1-001
CAPABILITIES=5 orphaned tool implementations (bulk_file_generator, codebase_navigator, generate_image, visual_qa, grep_search)
ROOT_CAUSE=defined/imported but never constructed (grep_search: never imported); no owner ever decided wire-vs-retire
FILES=registry.ts + 5 definition sites + ROUTER_EXCLUDED/PRIORITY lists
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=per-tool registration + selection + safe-execution + containment tests; bulk_file_generator needs path-containment hardening test first
REAL_JOE_UAT=one safe tool per orphan through real Joe UI (generate_image only under free-first creative contract)
ROLLBACK=unregister / revert
DEPENDENCIES=WIRING-P2-002 (single-winner gate should land first or with this)

---

BATCH_ID=WIRING-P1-002
CAPABILITIES=3 untracked QA drafts + nvidia provider draft (integrate-or-classify)
ROOT_CAUSE=prior-cycle Muse work never integrated; zero importers
FILES=api/src/core/quality/{image-semantic-qa,live-data-qa,shop-qa}.ts + api/src/core/llm/providers/nvidia.ts
IMPLEMENTATION_OWNER=UNASSIGNED (Muse-authored; provider draft overlaps Codex experiments + NVIDIA interests)
REVIEW_OWNER=UNASSIGNED
TESTS=focused per-module tests + wiring proof (registry/selection/execution)
REAL_JOE_UAT=only if a draft becomes user-reachable behavior
ROLLBACK=keep untracked (status quo)
DEPENDENCIES=ownership decision for provider draft

---

BATCH_ID=WIRING-P2-001
CAPABILITIES=memory-tool dual implementation (recall_memory, memorize_codebase)
ROOT_CAUSE=registry defs added without removing ToolService inline handlers (or vice versa); inline path bypasses firewall/permissions; implementations already diverge on validation
FILES=ToolService.ts (:571-608) + MemoryTool.ts + memory-related tests
IMPLEMENTATION_OWNER=UNASSIGNED (ToolService is shared — coordinate)
REVIEW_OWNER=UNASSIGNED
TESTS=single-implementation proof (one path owns each name) + permission-enforcement test + focused memory tests + AGENTS gates. EXECUTION EMBARGO: never live-verify memorize_codebase via global vectorDb.clear(); use routing/contract tests + a scoped-memory fixture.
REAL_JOE_UAT=memory recall/index through real Joe UI
ROLLBACK=revert to dual implementation
DEPENDENCIES=none; note vectorDb.clear() global-scope review (security) rides with this batch

---

BATCH_ID=WIRING-P2-002
CAPABILITIES=rename/alias single-winner gate (web_search corpse, visual_qa key, image_generate broken rewrite)
ROOT_CAUSE=three overlapping name layers (rewrite -> registry -> alias) with no assertion of exactly-one-winner per name
FILES=ToolService.ts (remove web_search alias OR reroute rewrite; drop visual_qa key with its orphan decision) + new contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=new gate: every resolvable name has exactly one winner; web_search/image_generate RED->GREEN; alias suite recheck; AGENTS gates. Preserve the closest-name suggestions in unknown_tool errors (good UX, proven live in exec.json).
REAL_JOE_UAT=search-via-Joe-UI sanity (browse + API search both work)
ROLLBACK=revert mapping change
DEPENDENCIES=image_generate target decision (free-first creative contract)

---

BATCH_ID=WIRING-P2-003
CAPABILITIES=21 boot-defaulted permission/rate-limit declarations (source fix)
ROOT_CAUSE=tools declare empty permissions / zero rateLimit; enforceContract mutes at boot instead of source fix
FILES=21 definition sites (exact 21+2 lists in sweep1.json contractDefaults)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=declaration-presence gate (no boot-defaulting) + focused tests + AGENTS gates
REAL_JOE_UAT=none required (no behavior change intended; defaults become explicit)
ROLLBACK=revert declarations
DEPENDENCIES=none

---

BATCH_ID=WIRING-P1-003
CAPABILITIES=deploy_pages token scope + input gating (fixture-only)
ROOT_CAUSE=cwd defaults to workspace root with no validation gate; resolveRepoAndToken falls back to getAllWorkspacesForLookup() (DeployPagesTool.ts:60-70) — any connected workspace; success path builds + pushes gh-pages (checkpoint 6 static; EMBARGOED live)
FILES=DeployPagesTool.ts (scope tokens to session/user context; add explicit repo confirmation) + fixture probe design
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=token-scope test (foreign workspace token NOT usable); fixture-only probe with fake token store (never live gh-pages); AGENTS gates
REAL_JOE_UAT=none until scoped; then deploy-via-UI to a throwaway repo only
ROLLBACK=revert scope change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-004
CAPABILITIES=schema/execute consistency (task_lifecycle required-vs-default gap) + empty-input honesty sweep continuation (25/25 reviewed, 19 probed live in sweep2.json)
ROOT_CAUSE=task_lifecycle declares required:['action'] but execute() defaults action='update' and returns ok:true on {} (sweep1.json, rerun-stable); no central schema gate — validation is per-tool; 25 no-required tools PARTITIONED 18 SAFE + 1 BOUND + 4 EMBARGO + 2 FIXTURE (006). Absence-as-success shape: project_stop/orders_read/form_inbox/browser_consent return ok:true for absence (honest messages; ok-only verifiers would misread). project_undo default-latest-restore code-indicated (ProjectUndoTool.ts:98-100), fixture-unconfirmed.
FILES=TaskLifecycleTool.ts (enforce required OR drop it from schema) + absence-as-success verifier note for LEVEL 5-6 sweep + project_undo snapshot fixture
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=schema/execute consistency gate for task_lifecycle ({} -> honest error OR schema without required); verifier MUST read message/flags, not ok alone, for the 4 absence tools; project_undo fixture (snapshots present) to confirm/deny default-restore; AGENTS gates if ToolService touched (it is not — tool-local fix + verifier note)
REAL_JOE_UAT=none (contract nits; UI behavior unchanged either way)
ROLLBACK=revert schema/execute one-liner
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-005
CAPABILITIES=ok:false-without-error wrapper (cause-swallowing)
ROOT_CAUSE=tools returning {ok:false} with no `error` field get generic 'Tool reported failure without an error message'; real cause sits in output (e.g. output.stderr) and never surfaces (2 instances: batch-1 rss_fetch, batch-2 repo_diff_summary in sweep1/2.json)
FILES=ToolService/firewall wrapper (surface output.stderr/cause) + the 2 tool sites (return error with ok:false)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=contract test: no ok:false result without a specific error (or wrapper carries output cause); RED->GREEN on both instances; AGENTS gates
REAL_JOE_UAT=none (error-text quality; behavior unchanged)
ROLLBACK=revert wrapper/tool one-liners
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-006
CAPABILITIES=uncontained execution roots + dead autoFix input (dead_code_detector, dependency_audit)
ROOT_CAUSE=both default to getWorkspaceRoot() (Joe's own repo) ignoring session context (DeadCodeTool.ts:46-52, QualityTools.ts:89-96); then run npx knip / npm audit (network + long runtime). autoFix:boolean declared on dead_code_detector but never read — planner-facing dead input (checkpoint 6 static; fixture-only, never {})
FILES=DeadCodeTool.ts + QualityTools.ts (contain default root to session context or document internal-only; drop-or-implement autoFix)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=root-containment test (default root == session workspace, never Joe repo); dead-input gate (every declared input is read); fixture probes with explicit paths; AGENTS gates
REAL_JOE_UAT=none (scope correction; behavior on explicit paths unchanged)
ROLLBACK=revert root/input change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P3-001
CAPABILITIES=15 dormant/absent-static-candidate names (behavioral review). Selection stories FULLY CLOSED: 9/9 targeted rank-1 (target.json) + catalogue-absent 15/15 storied strong — no keyword-map repair needed.
ROOT_CAUSE=unknown whether name similarity/dormancy equals missing capability
FILES=none yet (review first)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=targeted-goal selection probes (DONE 9/9); per-name equivalence verdicts for the 15 dormant candidates before any code change
REAL_JOE_UAT=only for names promoted to real gaps
ROLLBACK=N/A (review batch)
DEPENDENCIES=none

---

BATCH_ID=WIRING-P3-002
CAPABILITIES=conditional shadows (scaffold_full_stack, github_repo_manager) + deterministic bypass documentation
ROOT_CAUSE=input-dependent routing invisible in tool contracts; multiple execution architectures undocumented
FILES=tool contracts/docs; ProjectPipeline/PlanningEngine docs are NVIDIA-owned (read-only for Muse)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=per-input-winner contract tests (frontendish/backendish matrix; action=push matrix)
REAL_JOE_UAT=none (documentation + contract tests)
ROLLBACK=revert doc/contract change
DEPENDENCIES=NVIDIA cross-review for bypass classification (CANONICAL vs FALLBACK vs LEGACY)

---

BATCH_ID=WIRING-P4-001
CAPABILITIES=giant-file responsibility audit (ReactProjectTool 550KB, react-app-templates 354KB, PlanningEngine 244KB, app-blueprints 238KB, ApiProjectTool 201KB, ...)
ROOT_CAUSE=capability concentration in god files; hidden/duplicated paths likely but unproven
FILES=TBD by audit
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=none until a concrete split is proposed (no split-by-line-count)
REAL_JOE_UAT=none
ROLLBACK=N/A
DEPENDENCIES=full matrix (know what the files contain before touching them)
