# JOE CAPABILITY WIRING MATRIX (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-CAPABILITY-WIRING-MATRIX.md)

SCOPE=Muse-branch discovery checkpoints 1-6 only (muse/joe-development @ b90ba5e7).
Rows below are EVIDENCED tool-level entries. HIGH_LEVEL_CAPABILITIES grouping
(merge v1: 19 trunks PROPOSED, per-trunk stories pending), services/workers/
internal-infra rows, and NVIDIA-owned registry/ingress/persistence areas are
UNKNOWN/PENDING and must NOT be treated as covered.
Evidence files: D:\Joe\muse-worktree\tmp\wiring-audit\{discovery,exposure,
classification,reachability,target,exec,sweep1,sweep2,merge}.json +
{discover,exposure,classify,reach,target,exec,sweep1,sweep2,merge}.mts +
MUSE-WIRING-DISCOVERY-00{1,2,3,4,5,6}.md. All probes re-runnable; exec/sweep
probes perform bounded safe runs only (fixtures created + removed by the
probe; 6 no-required names embargoed/fixture-only by rule, see 006).

FORMAT per row follows CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT.

---

CAPABILITY_ID=TOOL-bulk_file_generator
NAME=bulk_file_generator (BulkFileGeneratorTool)
CATEGORY=tool/file-generation
SOURCE_FILES=api/src/modules/tools/definitions/BulkFileGeneratorTool.ts
IMPLEMENTATION=Full ToolDefinition with permissions/rate-limit/execute (:5-42)
REGISTERED=NO
REGISTRY_EVIDENCE=absent from live 163-name registry; imported in registry.ts but never added to revivedTools/baseTools (discovery.json)
PLANNER_VISIBLE=NO
PLANNER_EVIDENCE=in ROUTER_EXCLUDED (toolCatalog.ts:317-330); absent from PRIORITY_TOOL_NAMES
SELECTABLE=NO
SELECTION_EVIDENCE=no planner/router path can name it (excluded + unregistered)
EXECUTOR_REACHABLE=NO
EXECUTOR_EVIDENCE=ToolService lookup fails -> unknown_tool; no rewrite/alias covers it
PERMISSION_REACHABLE=N/A
PERMISSION_EVIDENCE=unreachable before firewall
INPUT_CONTRACT_VALID=UNKNOWN
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=NO
REAL_JOE_PROVEN=NO
REAL_JOE_EVIDENCE=
PRIMARY_STATE=ORPHANED
BLOCKER=never constructed in registry
OVERLAP=none found
LEGACY_RISK=low (referenced defensively in PhaseExecutorTool.ts:254 path-mapper exclusions)
SECURITY_RISK=writes arbitrary paths per definition — containment review required BEFORE any registration
PORTABILITY_RISK=UNKNOWN
RECOMMENDED_ACTION=P1 backlog: decide register-with-hardening vs INTERNAL_ONLY_BY_DESIGN

---

CAPABILITY_ID=TOOL-codebase_navigator
NAME=codebase_navigator
CATEGORY=tool/code-navigation
SOURCE_FILES=api/src/modules/tools/definitions/* (literal present; file in classification.json)
IMPLEMENTATION=ToolDefinition present in sources
REGISTERED=NO
REGISTRY_EVIDENCE=absent from live 163-name registry (classification.json definedNotRegistered)
PLANNER_VISIBLE=UNKNOWN
PLANNER_EVIDENCE=not surveyed for this name yet
SELECTABLE=UNKNOWN
SELECTION_EVIDENCE=
EXECUTOR_REACHABLE=NO
EXECUTOR_EVIDENCE=no registry entry; no rewrite/alias target observed (ToolService session-injection at :562 references the NAME for shaping only, which never fires for it)
PERMISSION_REACHABLE=N/A
INPUT_CONTRACT_VALID=UNKNOWN
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=NO
REAL_JOE_PROVEN=NO
PRIMARY_STATE=ORPHANED
BLOCKER=imported-never-constructed (per checkpoint-2 import survey)
OVERLAP=possible: search_text / search_files / repo_search (unverified)
LEGACY_RISK=UNKNOWN
SECURITY_RISK=UNKNOWN
PORTABILITY_RISK=UNKNOWN
RECOMMENDED_ACTION=P1 backlog: per-name wire-vs-retire review with behavioral comparison

---

CAPABILITY_ID=TOOL-generate_image
NAME=generate_image
CATEGORY=tool/image-generation
SOURCE_FILES=api/src/modules/tools/definitions/* (literal present; file in classification.json)
IMPLEMENTATION=ToolDefinition present in sources
REGISTERED=NO
REGISTRY_EVIDENCE=absent from live 163-name registry
PLANNER_VISIBLE=NO
PLANNER_EVIDENCE=not in PRIORITY_TOOL_NAMES; image_generate rewrite points AT it but target missing
SELECTABLE=NO
EXECUTOR_REACHABLE=NO
EXECUTOR_EVIDENCE=image_generate rewrite target unregistered (reachability.json singles)
PERMISSION_REACHABLE=N/A
INPUT_CONTRACT_VALID=UNKNOWN
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=NO
REAL_JOE_PROVEN=NO
PRIMARY_STATE=ORPHANED
BLOCKER=imported-never-constructed; paid-capable backend policy undecided
OVERLAP=free-first creative policy pending (JOE-CREATIVE-ENGINE-001 consultation answered by Muse)
LEGACY_RISK=UNKNOWN
SECURITY_RISK=paid-provider cost risk if blindly registered — do NOT bulk-register
PORTABILITY_RISK=UNKNOWN
RECOMMENDED_ACTION=P2 backlog: fix under free-first creative contract only

---

CAPABILITY_ID=TOOL-visual_qa
NAME=visual_qa
CATEGORY=tool/visual-verification
SOURCE_FILES=api/src/modules/tools/definitions/* (literal present)
IMPLEMENTATION=ToolDefinition present in sources
REGISTERED=NO
REGISTRY_EVIDENCE=absent from live 163-name registry
PLANNER_VISIBLE=UNKNOWN
PLANNER_EVIDENCE=
SELECTABLE=UNKNOWN
EXECUTOR_REACHABLE=NO
EXECUTOR_EVIDENCE=no registry entry; ToolService :74 rate-limit key + :562 session injection reference the name but never fire for it
PERMISSION_REACHABLE=N/A
INPUT_CONTRACT_VALID=UNKNOWN
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=NO
REAL_JOE_PROVEN=NO
PRIMARY_STATE=ORPHANED
BLOCKER=imported-never-constructed
OVERLAP=possible: visual-audit / ui-inspection / BrowserSmartTools QA (unverified)
LEGACY_RISK=UNKNOWN
SECURITY_RISK=UNKNOWN
PORTABILITY_RISK=UNKNOWN
RECOMMENDED_ACTION=P1 backlog: wire-vs-retire review against live visual QA stack

---

CAPABILITY_ID=TOOL-grep_search-impl
NAME=grep_search implementation (GrepSearchTool, SystemTools.ts:1022-1043)
CATEGORY=tool/code-search
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=Full workspace-contained grep execution via safePath + executionEngine
REGISTERED=NO
REGISTRY_EVIDENCE=absent from live registry; class referenced NOWHERE else repo-wide (not even imported)
PLANNER_VISIBLE=NO
PLANNER_EVIDENCE=name is PRIORITY-listed but schema never shown (unregistered); hard rewrite ToolService:526 + alias both redirect the NAME to search_text
SELECTABLE=NO
EXECUTOR_REACHABLE=NO
EXECUTOR_EVIDENCE=name always resolves to search_text via rewrite (wins first)
PERMISSION_REACHABLE=N/A
INPUT_CONTRACT_VALID=UNKNOWN
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=NO
REAL_JOE_PROVEN=NO
PRIMARY_STATE=ORPHANED
BLOCKER=never imported; name shadowed by rewrite+alias; deliberate bypass per ToolService:523-525 comment (system grep missing on stock Windows; search_text is JS)
OVERLAP=search_text (live winner)
LEGACY_RISK=medium — bypass looks intentional; removal needs owner decision
SECURITY_RISK=none observed (contained implementation)
PORTABILITY_RISK=its raison d'être (needs grep binary) is the portability gap
RECOMMENDED_ACTION=P1 backlog: wire (contained, tested-by-construction) vs retire in favor of search_text vs keep alias-only. Do NOT decide in audit.

---

CAPABILITY_ID=TOOL-recall_memory
NAME=recall_memory (MemoryTools + ToolService inline :571)
CATEGORY=tool/memory
SOURCE_FILES=api/src/modules/tools/definitions/MemoryTool.ts (:19-58) + api/src/modules/services/ToolService.ts (:571-581)
IMPLEMENTATION=TWO implementations: registry execute() (validates query) + inline handler (no validation)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163 (via ...MemoryTools spread, registry.ts:262); has execute()
PLANNER_VISIBLE=UNKNOWN
SELECTABLE=UNKNOWN
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=via ToolService inline handler (wins before registry :675). LIVE PROOF (exec.json): same empty input -> canonical ok:true 'No relevant memory found.' vs registry-direct ok:false 'needs a query'. Inline-wins + validation divergence are behavioral, not just source-order.
PERMISSION_REACHABLE=NO
PERMISSION_EVIDENCE=inline path returns before firewall/approval (:722+); declared permissions ['read'] never enforced on canonical path
INPUT_CONTRACT_VALID=PARTIAL
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=PARTIAL
REAL_JOE_PROVEN=NO
PRIMARY_STATE=DUPLICATE
BLOCKER=two implementations can diverge (already differ on input validation)
OVERLAP=self-duplicate
LEGACY_RISK=low
SECURITY_RISK=latent: firewall bypass on canonical path; single-user bypass makes it non-urgent today, load-bearing for multi-user
PORTABILITY_RISK=UNKNOWN
RECOMMENDED_ACTION=P2 backlog: single-owner repair (delete inline OR registry defs); enforce declared permissions

---

CAPABILITY_ID=TOOL-memorize_codebase
NAME=memorize_codebase (MemoryTools + ToolService inline :583)
CATEGORY=tool/memory
SOURCE_FILES=api/src/modules/tools/definitions/MemoryTool.ts (:59-112) + api/src/modules/services/ToolService.ts (:583-608)
IMPLEMENTATION=TWO implementations: registry execute() (validates directory, try/catch per file) + inline handler
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; has execute()
PLANNER_VISIBLE=UNKNOWN
SELECTABLE=UNKNOWN
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=via ToolService inline handler (wins before registry/firewall)
PERMISSION_REACHABLE=NO
PERMISSION_EVIDENCE=inline path returns before firewall; declared ['read','write'] + sideEffects ['write'] never enforced on canonical path
INPUT_CONTRACT_VALID=PARTIAL
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=PARTIAL
REAL_JOE_PROVEN=NO
PRIMARY_STATE=DUPLICATE
BLOCKER=same as recall_memory + calls vectorDb.clear() (global, not workspace-scoped) in BOTH implementations
OVERLAP=self-duplicate
LEGACY_RISK=low
SECURITY_RISK=latent-medium: global memory wipe without approval on canonical path
PORTABILITY_RISK=UNKNOWN
RECOMMENDED_ACTION=P2 backlog: single-owner repair + scope review of vectorDb.clear()

---

CAPABILITY_ID=GROUP-dormant-21
NAME=21 PRIORITY-listed names missing from registry (partitioned)
CATEGORY=tool-group/provider-surface
SOURCE_FILES=api/src/core/llm/tool-picker.ts (PRIORITY_TOOL_NAMES) + ToolService rewrites/aliases
IMPLEMENTATION=partition executed on Muse branch (classification.json):
REWRITE_COVERED(2): read_file_tree->inspect_directory, github_create_repo->github_repo_manager.
ALIAS_COVERED-live(1): grep_search->search_text. ALIAS-dead(1): web_search->search_api (rewrite wins; mapping is a corpse).
REWRITE_BROKEN(1): image_generate->generate_image (target unregistered).
ABSENT_NO_CANDIDATE(1): fs_glob. ABSENT_STATIC_CANDIDATES(15): check_syntax, generate_tests, generate_docs, db_inspect, command_policy_check, tool_create_shell, shell_status, product_search, deep_research, business_logic, chaos_testing, cost_estimator, self_confidence, terraform_ops, security_scan_repo (stem leads in classification.json; NOT equivalence verdicts).
REGISTERED=NO (as a group; members unregistered by construction)
PLANNER_VISIBLE=PARTIAL (model never sees their schema; execution-time rescue differs per member)
CANONICAL_PATH_CONNECTED=PARTIAL (2 rewrite + 1 alias members execute; rest fail unknown_tool or alias-rescue). LIVE (exec.json): fs_glob -> honest unknown_tool; image_generate rewrite FIRES then unknown_tool generate_image + closest-name suggestions.
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (group) — 2 members live-proven honest-fail; 15 static-candidate equivalence reviews still open
RECOMMENDED_ACTION=P2: single-winner gate per name (preserve closest-name suggestions); fix image_generate + web_search double-mapping; P3: per-name behavioral equivalence review for the 15

---

CAPABILITY_ID=GROUP-catalogue-absent-15
NAME=15 registered tools never selected by 20-goal deterministic corpus
CATEGORY=tool-group/planner-surface
SOURCE_FILES=api/src/core/orchestrator/toolCatalog.ts (selectToolsFor) + reachability.json
IMPLEMENTATION=7 DETERMINISTIC_REFS (ask_user clarify fallback + ANSWER_ONLY; ambiguity_resolver/multi_agent_debate/self_confidence_evaluator ANSWER_ONLY; project_planner pipeline refs; kubernetes_ops infra map) + 7 KEYWORD_SELECTABLE (cloud_cost_estimator, docker_swarm_ops, llm_cache, rss_fetch, task_lifecycle, template_manager, video_action — targeted best-rank 1 each on 2 self-grounded + 1 blind goal; corpus absence was coverage, not a gap) + 2 DUAL-STORY (execute_python: comment ref + rank 1; json_query: executor-known + rank 1, HAND rank 3 with router noise from ci_generate_pipeline/github_actions above it).
REGISTERED=YES (15/15, all with execute())
PLANNER_VISIBLE=YES (15/15 storied strong; evidence target.json + reachability.json)
CANONICAL_PATH_CONNECTED=PARTIAL (reachability storied; per-tool execution/verification sweep pending)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (group) — storied, none dead; json_query reached LEVEL 4 (exec.json value=42)
RECOMMENDED_ACTION=CLOSED for selection stories. Remaining: execution/verification sweep per tool (bulk work, not this group).

---

CAPABILITY_ID=GROUP-rewrite-layer
NAME=ToolService hard-rename/shaping layer (32 cases)
CATEGORY=infra/execution-routing
SOURCE_FILES=api/src/modules/services/ToolService.ts (:344-608)
IMPLEMENTATION=12 single renames + 16 multi-name conditions (9 PURE_RENAME, 6 RENAME_SHAPING, 1 SHAPING_ONLY) + 2 CONDITIONAL + 2 INLINE_EXEC. Full-shadow=0. Ordering: rewrites -> registry -> TOOL_ALIASES fallback. Evidence: reachability.json.
REGISTERED=N/A
PRIMARY_STATE=PARTIALLY_WIRED (layer works; contains 2 dead mappings + 2 inline bypasses + 2 conditional shadows — see register)
RECOMMENDED_ACTION=P2: single-winner gate assertion per name (one winner, no corpses); document conditional routing in tool contracts

---

CAPABILITY_ID=GROUP-alias-layer
NAME=TOOL_ALIASES fallback (28 entries)
CATEGORY=infra/execution-routing
SOURCE_FILES=api/src/modules/services/ToolService.ts (TOOL_ALIASES) + exposure.json
IMPLEMENTATION=28/28 targets resolve; 0 sources shadow a registered name; BUT web_search entry is DEAD (rewrite wins first). Fires only if (!tDef) (:691-695).
REGISTERED=N/A
PRIMARY_STATE=PARTIALLY_WIRED (functional except 1 dead entry)
RECOMMENDED_ACTION=P2: delete web_search alias OR reroute rewrite; add single-winner gate

---

CAPABILITY_ID=GROUP-registered-163
NAME=163 registered runtime tools (bulk)
CATEGORY=tool-group/registry
SOURCE_FILES=api/src/modules/tools/registry.ts + definitions/*.ts (93 files)
IMPLEMENTATION=163/163 with execute(), 0 duplicate names. 21 boot-defaulted permissions + 2 defaulted rate limits (enforceContract; source declarations missing).
REGISTERED=YES
PLANNER_VISIBLE=PARTIAL (132/163 via keyword router after 32 ROUTER_EXCLUDED; 36/57 PRIORITY resolve; deterministic paths uncounted)
EXECUTOR_REACHABLE=PARTIAL (8 LEVEL-4 spot cases green-or-honest + 9 empty-input batch-1: 8 honest ok:false, 1 unvalidated ok:true task_lifecycle; bulk sweep pending with review-then-call rule for 25 no-required names)
PRIMARY_STATE=UNKNOWN_REQUIRES_INVESTIGATION (bulk — per-tool rows pending; do NOT mark wired from registration alone)
RECOMMENDED_ACTION=checkpoint-5 delivered: 9/9 selection, declaration census (sweep1.json), empty-input batch 1, merge v1 (19 trunks PROPOSED). Next: per-trunk stories + sweep batch 2 (review-then-call) + approval-gate design

---

CAPABILITY_ID=EXT-direct-http-tools
NAME=Direct HTTP tool execution routes (runAsSystem)
CATEGORY=infra/execution-duplicate-path
SOURCE_FILES=cited from TOOL-HTTP-OWNER-GATE-001 (Codex synthetic RED; Muse response 94fd393d + followup in 8ce2616c)
IMPLEMENTATION=Both authenticated direct POST routes use runAsSystem, skipping ToolService user/session/approval branching
REGISTERED=N/A
PRIMARY_STATE=PARTIALLY_WIRED (duplicate execution path with policy gap)
RECOMMENDED_ACTION=P0/P1 backlog: synthetic two-identity RED already reproducible (verification/probe-tool-http-owner.mts per TEAM-STATE); assign one owner/reviewer; repair route/firewall policy. Muse must NOT implement unilaterally (shared ToolService/API surface).

---

CAPABILITY_ID=EXT-qa-drafts-3
NAME=3 untracked Muse QA drafts (image-semantic-qa, live-data-qa, shop-qa) + 1 provider (nvidia.ts)
CATEGORY=capability-draft/unintegrated
SOURCE_FILES=api/src/core/quality/{image-semantic-qa,live-data-qa,shop-qa}.ts + api/src/core/llm/providers/nvidia.ts (UNTRACKED, preserved)
IMPLEMENTATION=complete modules, zero importers in api/src (searched 2026-09-29)
REGISTERED=NO
PRIMARY_STATE=ORPHANED (preliminary; dynamic/config usage check still open)
RECOMMENDED_ACTION=P1 backlog: integrate-or-classify review; provider draft needs ownership decision (Codex isolated experiments + NVIDIA interests overlap — no unilateral wiring)

---

---

CAPABILITY_ID=TOOL-search_text
NAME=search_text (SearchTextTool, UtilityTools.ts:140-211)
CATEGORY=tool/code-search
SOURCE_FILES=api/src/modules/tools/definitions/UtilityTools.ts
IMPLEMENTATION=JS file search (query/pattern + path/glob/regex), workspace-contained via resolveToolPath; CORE_TOOLS member
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; tags [search, grep, read]; permissions [read]
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=CORE_TOOLS (always on the table) + keyword selectable
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (exec.json): in-workspace fixture -> ok:true total=1; out-of-workspace -> honest path_outside_workspace. LEVEL 4 reached.
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=canonical path incl. firewall + containment; no bypass observed
INPUT_CONTRACT_VALID=YES (for exercised shape {query, path, glob, maxResults})
OUTPUT_CONTRACT_VALID=PARTIAL ({matches, total} observed; full schema unsurveyed)
EVIDENCE_PRODUCED=YES (logs carry search_text=<q> scanned=<n> matches=<m>)
VERIFICATION_COMPATIBLE=UNKNOWN (verification-consumption sweep pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (LEVEL 4 proven; verification-compat unsurveyed)
RECOMMENDED_ACTION=none for wiring; cover in bulk verification-compat sweep

---

CAPABILITY_ID=TOOL-json_query
NAME=json_query (JsonQueryTool, ContentTools.ts:122-153)
CATEGORY=tool/data
SOURCE_FILES=api/src/modules/tools/definitions/ContentTools.ts
IMPLEMENTATION=pure dot-notation JSON query ({json, path} -> {value})
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; tags [data, json]; boot-defaulted permission ->read (source declares none)
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=PhaseExecutor path-mapper known (:256); absent from 20-goal corpus (coverage); targeted probe rank 1 (SELF_NAME 13.7, SELF_DESC 21.4, HAND 3 behind ci_generate_pipeline/github_actions noise)
SELECTABLE=YES (deterministic-known + keyword rank 1)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (exec.json): {a:{b:42}} path a.b -> ok:true value=42. LEVEL 4 reached.
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES (for exercised shape)
OUTPUT_CONTRACT_VALID=PARTIAL
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (LEVEL 4 proven; verification-compat open)
RECOMMENDED_ACTION=source-fix its empty permission declaration (WIRING-P2-003); cover in verification sweep

---

CAPABILITY_ID=TOOL-grep-rewrite-name
NAME=grep (unregistered rewrite source -> search_text, ToolService:526)
CATEGORY=tool-name/rewrite-covered
SOURCE_FILES=api/src/modules/services/ToolService.ts (:526 PURE_RENAME, deliberate one-hop per comment)
IMPLEMENTATION=no registry entry; name resolves to search_text before registry lookup
REGISTERED=NO
REGISTRY_EVIDENCE=absent from live 163 by design (covered alias surface, one of 40)
PLANNER_VISIBLE=PARTIAL (model may utter it; rescue at execution, schema never shown)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (exec.json): in-workspace -> ok:true total=1, log `start search_text (orig=grep)`; out-of-workspace -> same honest containment refusal as search_text. Rewrite executes end-to-end.
PERMISSION_REACHABLE=YES (inherits search_text's canonical path)
CANONICAL_PATH_CONNECTED=YES (via rename)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (executes; contract = search_text's; planner schema story is rescue-not-first-class)
RECOMMENDED_ACTION=none for wiring; single-winner gate (WIRING-P2-002) must assert this name's winner

---

CAPABILITY_ID=TOOL-task_lifecycle
NAME=task_lifecycle (TaskLifecycleTool.ts:26-44)
CATEGORY=tool/interaction
SOURCE_FILES=api/src/modules/tools/definitions/TaskLifecycleTool.ts
IMPLEMENTATION=broadcasts task_update UI event; action defaults to 'update'; always returns ok:true {success}
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; tags [system, ui, lifecycle]; permissions ['write'] declared at source (no boot default)
PLANNER_VISIBLE=YES (targeted probe best-rank 1; risk classifier rates it 'low')
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (sweep1.json): {} -> ok:true {success} via canonical path, rerun-stable. broadcast() no-op'd in-probe (liveWssRef null).
INPUT_CONTRACT_VALID=NO — declares required:['action'] but execute() ignores it (decorative schema)
OUTPUT_CONTRACT_VALID=PARTIAL (success:true always; no failure mode exercised)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (executes; schema/execute inconsistent)
RECOMMENDED_ACTION=WIRING-P2-004: enforce required OR drop it from schema (one-liner, tool-local)

---

CAPABILITY_ID=TOOL-delete_file
NAME=delete_file (SystemTools.ts:808-852)
CATEGORY=tool/files
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=contained delete (safePath; recursive:true for dirs; honest not_found/is_directory); {} -> 'needs a path' at execute level
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; required:[] declared; permissions ['write']
PLANNER_VISIBLE=YES (in PRIORITY/toolCatalog lists; targeted survey pending)
SELECTABLE=UNKNOWN (no targeted probe yet)
EXECUTOR_REACHABLE=YES (gated)
EXECUTOR_EVIDENCE=LIVE (sweep2.json): {} -> ok:false approval_required output={risk} via canonical path, rerun-stable. The firewall pre-empts execute(): ToolService.ts:778-784 classifyToolRisk high/critical blocks unless AUTO_APPROVE_ALL/session auto-approve. execute()-level 'needs a path' refusal NOT reached in-probe.
PERMISSION_REACHABLE=YES (reaches the risk gate; gate verdict is the evidence)
INPUT_CONTRACT_VALID=YES (missing path refused at both layers, different messages)
OUTPUT_CONTRACT_VALID=UNKNOWN (no live deletion performed by design)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (reachable + gated; risk-table row unsurveyed; live deletion never fixture-proven)
RECOMMENDED_ACTION=survey classifyToolRisk table (1 live point only); fixture-based delete/no-op test before any behavior claim

---

CAPABILITY_ID=TOOL-deploy_pages
NAME=deploy_pages (DeployPagesTool.ts:73+)
CATEGORY=tool/deploy
SOURCE_FILES=api/src/modules/tools/definitions/DeployPagesTool.ts
IMPLEMENTATION=cwd defaults to workspace root; resolveRepoAndToken falls back session workspace -> user workspaces -> getAllWorkspacesForLookup() (:60-70); success path builds + pushes gh-pages
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; no required inputs; permissions ['execute','internet']
PLANNER_VISIBLE=UNKNOWN
SELECTABLE=UNKNOWN
EXECUTOR_REACHABLE=NOT_PROBED (embargoed: permanent external mutation)
EXECUTOR_EVIDENCE=static only: no input validation gate; cross-workspace token fallback means a {} call in a context with ANY connected workspace could build+push. Fixture-only future probe (fake token store).
PERMISSION_REACHABLE=UNKNOWN
INPUT_CONTRACT_VALID=NO — defaults + fallback chain substitute for validation
OUTPUT_CONTRACT_VALID=UNKNOWN
CANONICAL_PATH_CONNECTED=UNKNOWN (unprobed by rule)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=UNKNOWN_REQUIRES_INVESTIGATION (static risk identified; live path embargoed)
BLOCKER=cross-workspace token fallback scope undecided
SECURITY_RISK=HIGH if fallback reaches foreign workspaces — token-scope review required before any live probe
RECOMMENDED_ACTION=WIRING-P1-003: token-scope review + fixture-only probe design; no live {} call

---

CAPABILITY_ID=TOOL-dead_code_detector
NAME=dead_code_detector (DeadCodeTool.ts:20-135)
CATEGORY=tool/analysis
SOURCE_FILES=api/src/modules/tools/definitions/DeadCodeTool.ts
IMPLEMENTATION=workDir = getWorkspaceRoot() (Joe's own repo) unless explicit projectPath — context IGNORED (:46-52); runs `npx knip --reporter json`; honest parse-failure handling (:95-114); autoFix input DECLARED but never read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; no required inputs; permissions ['read','execute']
EXECUTOR_REACHABLE=NOT_PROBED (fixture-only: npx network fetch possible + long repo-wide runtime + uncontained root)
INPUT_CONTRACT_VALID=NO — autoFix is dead input (planner can pass autoFix:true; nothing autofixes)
OUTPUT_CONTRACT_VALID=UNKNOWN
CANONICAL_PATH_CONNECTED=UNKNOWN (unprobed by rule)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (registered; execution root uncontained; dead input in contract)
SECURITY_RISK=medium: executes in Joe's own repo root regardless of session workspace
RECOMMENDED_ACTION=WIRING-P2-006: contain root to session context (or document internal-only) + drop-or-implement autoFix

---

CAPABILITY_ID=TOOL-dependency_audit
NAME=dependency_audit (QualityTools.ts:73-104)
CATEGORY=tool/security
SOURCE_FILES=api/src/modules/tools/definitions/QualityTools.ts
IMPLEMENTATION=runs `npm audit --json` (5-min budget) in getWorkspaceRoot() when no path given — context IGNORED (:89-96); registry network call
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; no required inputs; permissions ['execute','internet']
EXECUTOR_REACHABLE=NOT_PROBED (fixture-only: uncontained root + external network on {})
INPUT_CONTRACT_VALID=PARTIAL (path optional by design, but default root is Joe itself, not the session project)
OUTPUT_CONTRACT_VALID=UNKNOWN
CANONICAL_PATH_CONNECTED=UNKNOWN (unprobed by rule)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (registered; default execution root uncontained)
SECURITY_RISK=medium: network + execution scoped to Joe's repo, not the caller's workspace
RECOMMENDED_ACTION=WIRING-P2-006: contain default root to session context; fixture probe with explicit path

---

CAPABILITY_ID=TOOL-security_scanner
NAME=security_scanner (SecurityScannerTool.ts:16+)
CATEGORY=tool/security
SOURCE_FILES=api/src/modules/tools/definitions/SecurityScannerTool.ts
IMPLEMENTATION=one-of contract (requiredAny files/projectPath/target/path); guard rejects {} honestly when no files/target resolve
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; required:[] + requiredAny extension
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (sweep2.json): {} -> ok:false 'requires a non-empty files array or an existing project target containing source files', rerun-stable. Static pre-read WRONGLY predicted a cwd scan; live result stands (method note in 006).
INPUT_CONTRACT_VALID=YES (one-of enforced at execute, despite empty `required`)
OUTPUT_CONTRACT_VALID=UNKNOWN (no live scan with files performed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (honest empty-input; scan path itself unprobed)
RECOMMENDED_ACTION=none for wiring; use as the positive control for requiredAny enforcement

---

CAPABILITY_ID=TOOL-repo_diff_summary
NAME=repo_diff_summary (RepoSelfCodingTools.ts:252-280)
CATEGORY=tool/vcs
SOURCE_FILES=api/src/modules/tools/definitions/RepoSelfCodingTools.ts
IMPLEMENTATION=git status --short + git diff --stat on getRepoRoot(); returns ok:false with NO error field when git exits nonzero (:264-279)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; genuinely inputless (properties:{})
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (sweep2.json): {} -> ok:false 'Tool reported failure without an error message', output={status,diffStat,stderr}, rerun-stable. Real cause (git stderr) sits in output, never in `error` — wrapper substitutes generic message. 2nd instance after batch-1 rss_fetch.
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES (inputless by design)
OUTPUT_CONTRACT_VALID=NO — ok:false without error loses the cause at the error-field layer
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (executes; error contract lossy)
NOTE=live trigger here is sandbox-specific (git dubious-ownership exit 128, verified); the WRAPPER BEHAVIOR is the product finding, not the trigger
RECOMMENDED_ACTION=WIRING-P2-005: tools return error with ok:false (or wrapper surfaces output.stderr)

---

CAPABILITY_ID=TOOL-project_run
NAME=project_run (ProjectRunTool.ts:1234+)
CATEGORY=tool/runtime
SOURCE_FILES=api/src/modules/tools/definitions/ProjectRunTool.ts
IMPLEMENTATION=session active-project -> explicit cwd -> workspace root default chain; starts live server, binds port, spawns processes
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; no required inputs; permissions ['execute']
EXECUTOR_REACHABLE=NOT_PROBED (embargoed: {} starts servers from workspace defaults)
EXECUTOR_EVIDENCE=static only (default chain read through :1307+)
INPUT_CONTRACT_VALID=PARTIAL (no validation; defaults ARE the contract)
CANONICAL_PATH_CONNECTED=UNKNOWN (unprobed by rule)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=UNKNOWN_REQUIRES_INVESTIGATION (static risk identified; live path embargoed)
RECOMMENDED_ACTION=fixture-project probe (isolated dir + port) before any {} claim; pairs with project_stop absence-as-success row (covered in 006 text, no separate row)

---

CAPABILITY_ID=TOOL-browser_launch
NAME=browser_launch (BrowserSmartTools.ts:2064-2125)
CATEGORY=tool/browser
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION={} -> opens a REAL browser to BROWSER_HOME_URL or google.com, streams + screenshots (:2080-2092)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; required:[] declared
EXECUTOR_REACHABLE=NOT_PROBED (embargoed: external navigation + browser side effects on {})
EXECUTOR_EVIDENCE=static only
INPUT_CONTRACT_VALID=NO — empty input triggers external navigation by default instead of refusing or asking
CANONICAL_PATH_CONNECTED=UNKNOWN (unprobed by rule)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (registered; default behavior externally effective)
RECOMMENDED_ACTION=fixture probe with explicit local URL only; consider honest no-url behavior as P2 (unfiled — needs cross-review whether default-start-page is intended UX)

---

CAPABILITY_ID=TOOL-analyze_codebase
NAME=analyze_codebase (AnalysisTools.ts:70-166)
CATEGORY=tool/analysis
SOURCE_FILES=api/src/modules/tools/definitions/AnalysisTools.ts
IMPLEMENTATION=contained structure walk (depth<=3, 60 files, key-file slimming) + routeToModel LLM summary (:150-160); LLM failure -> ok:true with structure-only fallback (:161-164)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; no required inputs; permissions ['read','internet']
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (sweep2.json): {} -> ok:false Arabic provider-unavailable message + Ollama/Internet guidance, output={summary}, fast (no 20s timeout consumed), rerun-stable. routeToModel failed honestly under OFFLINE_MODE; no model spend.
INPUT_CONTRACT_VALID=YES (path defaults to contained '.'; URL input redirects to browser_run, unprobed)
OUTPUT_CONTRACT_VALID=PARTIAL (offline-fail path honest; summary path unprobed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (honest offline; online summary path unprobed)
RECOMMENDED_ACTION=none for wiring; online-summary probe needs a real provider (future, bounded)

---

CAPABILITY_ID=TOOL-project_undo
NAME=project_undo (ProjectUndoTool.ts:55+)
CATEGORY=tool/project
SOURCE_FILES=api/src/modules/tools/definitions/ProjectUndoTool.ts
IMPLEMENTATION=list mode honest; otherwise defaults to restoring the LATEST snapshot/surgical batch when no versionId (:98-100 preferSurgical); rebuilds after restore
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; no required inputs; permissions ['write','execute']
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (sweep2.json): {} -> ok:false no_project (empty probe session), rerun-stable. Reached execute (NOT approval-gated, unlike delete_file — risk-tier evidence). Destructive-default restore path NOT taken in-probe: code-indicated only, fixture-unconfirmed.
INPUT_CONTRACT_VALID=PARTIAL (no confirmation for default-latest restore — code-indicated, unproven live)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (empty-session honest; default-restore semantics need fixture)
RECOMMENDED_ACTION=WIRING-P2-004 family: fixture with snapshots to confirm/deny default-restore + rebuild behavior; do NOT live-probe against a real project

---

END-OF-MUSE-DRAFT-ROWS=28 (21 individual + 5 group + 2 external-cited)
COVERAGE-DISCLAIMER=This draft covers ONLY what Muse checkpoints 1-6 evidenced. Full matrix requires: per-trunk path stories (19 trunks PROPOSED in merge.json), services/workers/persistence/deployment rows (NVIDIA scope), bulk per-tool firewall sweep (8 spot + 28 empty-input batch-1+2 done; risk table 1 point; 6 embargo/fixture names unprobed), contract audit per boundary, LEVEL 5-6 proofs, and NVIDIA cross-review (currently BLOCKED).
