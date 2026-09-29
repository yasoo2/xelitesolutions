# JOE CAPABILITY WIRING MATRIX (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-CAPABILITY-WIRING-MATRIX.md)

SCOPE=Muse-branch discovery checkpoints 1-10 only (muse/joe-development @ 0a0af4b7).
Rows below are EVIDENCED tool-level entries. HIGH_LEVEL_CAPABILITIES grouping
(merge v1: 19 trunks PROPOSED, 1 STORIED: files 10/10 in checkpoint 8;
browser_ui 33 batch-2 PARTIAL: 11/33 with LEVEL-4 points, 22 (a)-tools
pending via the loopback-fixture pattern — checkpoint 10),
services/workers/internal-infra rows, and NVIDIA-owned
registry/ingress/persistence areas are UNKNOWN/PENDING and must NOT be
treated as covered.
Evidence files: D:\Joe\muse-worktree\tmp\wiring-audit\{discovery,exposure,
classification,reachability,target,exec,sweep1,sweep2,merge,sweep3,trunk_files,
arch2,trunk_browser1,trunk_browser_live1,trunk_browser_live2}.json +
{discover,exposure,classify,reach,target,exec,
sweep1,sweep2,merge,sweep3,trunk_files,arch2,trunk_browser1,
trunk_browser_live1,trunk_browser_live2}.mts +
MUSE-WIRING-DISCOVERY-00{1,2,3,4,5,6,7}.md + MUSE-WIRING-DISCOVERY-008.md +
MUSE-WIRING-DISCOVERY-009.md + MUSE-WIRING-DISCOVERY-010.md. All probes
re-runnable; exec/sweep/trunk probes perform bounded safe runs only
(fixtures created + removed by the probe; 4 EMBARGO names never executed
except browser_launch contained-http partial lift in 010 — static fixture
designs in 008; 2 FIXTURE names probed with contained explicit inputs only;
sweep3 risk probes control-gated, see 007; delete_file verdict-only with
target-survival check, see 008; trunk_browser1 is read-only: zero tool
executions, see 009; live1/live2 launch ephemeral headless only with
sandbox dirs + active approval gate + loopback/data-URL-only traffic,
see 010).

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
EXECUTOR_REACHABLE=YES (contained-http case only; embargo partially lifted in 010)
EXECUTOR_EVIDENCE=LIVE (trunk_browser_live2.json, 2/2 reruns): BROWSER_HOME_URL=http://127.0.0.1:<eph>/ -> ok:true, sessionUrl+sessionTitle LoopSeven verified on live session, session closed. about:blank IMPOSSIBLE: normalizeUrl mangles to https://about:blank -> honest open_failed (live1). Default {} still opens BROWSER_HOME_URL||google.com (external by design; unprobed live by rule)
INPUT_CONTRACT_VALID=PARTIAL (explicit contained http URL works; no data:/about:/file: vocabulary — WIRING-P2-013)
CANONICAL_PATH_CONNECTED=YES (contained-http leg via executeTool+firewall)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (contained launch proven; external default + no-url behavior unchanged)
RECOMMENDED_ACTION=WIRING-P2-013 for contained-URL vocabulary; default-start-page UX needs cross-review before any change

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

---

CAPABILITY_ID=GROUP-approval-risk-tiers
NAME=approval risk tiers (classifyToolRisk, ToolService.ts:142-203 + gate :772-784)
CATEGORY=group/firewall-policy
SOURCE_FILES=api/src/modules/tools/definitions/* (all 163 registered) + api/src/modules/services/ToolService.ts
IMPLEMENTATION=4-tier classifier: input-tiered tools (deploy_project/shell_execute/git_ops/browser_run) + name-regex tiers + whole-input destructive scan + medium default; high/critical pre-empt execute unless AUTO_APPROVE_ALL
REGISTERED=N/A (policy layer, not a tool)
REGISTRY_EVIDENCE=census over live 163 (sweep3.json): low=9, medium=151, high=3 on {} (delete_file, deploy_pages, shell_execute), critical=0 on {}
PLANNER_VISIBLE=N/A
SELECTABLE=N/A
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE 19/19 rerun-stable (sweep3.json): 8 approval_required blocks (1 critical) + 5 honest ok:false + 6 ok:true; alias tiering follows target (remove_file->delete_file high); gate order: workspace/user gates default-pass, approval gate operative
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=the gate IS the permission layer for these probes; risk echoed in output={risk}
INPUT_CONTRACT_VALID=PARTIAL (scan shadow F31; see TOOL-echo-input-scan-shadow row)
OUTPUT_CONTRACT_VALID=YES (approval_required + {risk} shape stable)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (verifier handling of approval_required unsurveyed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (tiers enforced live; scan-order + verdict gaps filed)
RECOMMENDED_ACTION=WIRING-P2-007 (scan shadow) + WIRING-P2-008 (browser verdict); adopt 19 sweep3 probes as tier regression contracts

---

CAPABILITY_ID=TOOL-echo-input-scan-shadow
NAME=echo destructive-input scan shadow (classifyToolRisk order)
CATEGORY=tool/policy-gap
SOURCE_FILES=api/src/modules/services/ToolService.ts (:200-201) + api/src/modules/tools/definitions/DeployProjectTool.ts (buildCommand path)
IMPLEMENTATION=line-200 name-regex low-return + 4 early-branch tool returns precede the line-201 whole-input destructive scan; echo/central_answer/task_lifecycle + deploy_project.buildCommand never content-scanned
REGISTERED=YES (echo in live 163)
REGISTRY_EVIDENCE=echo registered; finding is classifier-order, not registration
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (sweep3.json): echo {text:'note: rm -rf never run'} -> ok:true executed, rerun-stable. deploy buildCommand hostile-content gap CODE-INDICATED only (DeployProjectTool.ts:96-104 executes buildCommand at MEDIUM with no content scan) — never live-probed by rule
INPUT_CONTRACT_VALID=NO (destructive content not classified for these names/fields)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (tiering works; scan coverage has shadowed branches)
SECURITY_RISK=medium (block direction is what matters: destructive shell/git/browser/delete paths ARE gated; gap is unscanned free-text fields on medium/low names + buildCommand execution)
RECOMMENDED_ACTION=WIRING-P2-007: reorder/extend scan; fixture-only hostile-buildCommand RED->GREEN (blocked pre-execution, never executed)

---

CAPABILITY_ID=TOOL-browser_run-injection-verdict
NAME=browser_run session-injection verdict (ToolService.ts:562-568)
CATEGORY=tool/browser-evidence
SOURCE_FILES=api/src/modules/services/ToolService.ts + api/src/modules/tools/definitions/BrowserRunTool.ts
IMPLEMENTATION=Universal Browser Session Injection copies chat sessionId into effectiveInput.sessionId, bypassing execute()'s sessionId_required guard (:248); authz fails on an unnamed id with a cross-user message
REGISTERED=YES
REGISTRY_EVIDENCE=browser_run in live 163
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (sweep3.json + trunk_browser_live1.json run_empty, 3/3 rerun-stable): browser_run {} -> ok:false forbidden + Arabic "belongs to another user" (expected sessionId_required per execute body; injection verified at ToolService.ts:565-567). Second live shape of the same injection confirmed in 010/F54
INPUT_CONTRACT_VALID=PARTIAL (deny-safe direction; wrong evidence)
OUTPUT_CONTRACT_VALID=PARTIAL (verdict misattributes: no browser session was addressed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (safe deny; dishonest verdict)
RECOMMENDED_ACTION=WIRING-P2-008: distinguish "no browser session addressed" from cross-user forbidden; keep deny-safe

---

CAPABILITY_ID=TOOL-write_file
NAME=write_file (WriteFileTool, SystemTools.ts:854)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=overwrite/append with destination contract (prepareArtifactContent) + safePath containment decided BEFORE mkdir; required:['content'], path via filename|path
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=CORE_TOOLS pinned + SELECTABLE_BY_KEYWORD best-rank-1 (trunk_files.json); ROUTER_EXCLUDED membership is fast-path-only, not catalogue (F34)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (tied ai_write_file 9.5); priority-listed
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): contained overwrite ok:true totalLines=2, content byte-verified via read_file
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium (name-regex) -> passes default autoSafe (sweep3 census)
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({success,path,operation,appended,alreadySatisfied,totalLines})
EVIDENCE_PRODUCED=YES (structured output + audit filename)
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; verification-compat unproven)
RECOMMENDED_ACTION=none (trunk reference implementation)

---

CAPABILITY_ID=TOOL-read_file
NAME=read_file (TaskInteractionTools.ts:166)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/TaskInteractionTools.ts
IMPLEMENTATION=paginated safe read + Smart Directory Peek on empty path; required:['path']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=CORE_TOOLS pinned + best-rank-1 (tied repo_read_file); ROUTER_EXCLUDED is fast-path-only (F34)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1; priority-listed
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): 4/4 contained reads ok:true with exact expected content incl. post-edit verification; risk low
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low -> passes default autoSafe
INPUT_CONTRACT_VALID=YES ({} edge: empty dir-list ok:true, F33, verifier note)
OUTPUT_CONTRACT_VALID=YES ({content,totalLines,truncated})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; {} peek joins P2-004 absence note)
RECOMMENDED_ACTION=none beyond P2-004 verifier note

---

CAPABILITY_ID=TOOL-file_edit
NAME=file_edit (FileEditTool, SystemTools.ts:674)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=single exact-match replace with CRLF/LF normalization, find-aliases (search/old_string), empty-find corruption guard, near-miss repair hints; required all three
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=CORE_TOOLS pinned + best-rank-2 (behind file_edit_advanced); ROUTER_EXCLUDED fast-path-only (F34)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 2; priority-listed
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): contained round-trip ok:true, replacement byte-verified via read_file
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium (name-regex) -> passes default autoSafe
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({success})
EVIDENCE_PRODUCED=YES (+ diff broadcast for UI)
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-file_edit_advanced
NAME=file_edit_advanced (AdvancedFileEditTool, UtilityTools.ts:333)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/UtilityTools.ts
IMPLEMENTATION=multi-replacement with ALL-OR-NOTHING atomicity (failedEdits>0 -> no persist); required:['filePath','edits']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=best-rank-1 (score 19.8, top of edit family); NOT router-excluded; not priority-listed (rank suffices)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): 2-edit success ok:true failedCount=0 + partial-fail ok:false with file byte-identical after (atomicity PROVEN live, F35)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium -> passes default autoSafe
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({success,failedCount})
EVIDENCE_PRODUCED=YES (applied/failed counts in logs)
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; atomicity is the family reference)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-inspect_directory
NAME=inspect_directory (DirectoryInspectionTool, UtilityTools.ts:38)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/UtilityTools.ts
IMPLEMENTATION=recursive structured tree (depth param); required:['path']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=CORE_TOOLS pinned + best-rank-1; ROUTER_EXCLUDED fast-path-only (F34)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1; not priority-listed
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): contained depth-1 ok:true, tree names+sizes exact
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low -> passes default autoSafe
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({tree[]})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
OVERLAP=ls (flat entries) — complementary shapes, not duplicates
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-ls
NAME=ls (LsTool, SystemTools.ts:981)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=flat sorted entries with directory suffix, hidden filtering; NO required inputs (default path '.')
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=best-rank-2 on self-name (short name scores weakly; SELF_DESC carries it); NOT router-excluded; priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded best rank 2 (SELECTABLE_BY_KEYWORD)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): contained ok:true entries exact; also batch-2 {} ok:true (sweep2.json)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=permissions read-only; risk default medium -> passes default autoSafe
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({path,entries[]})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
OVERLAP=inspect_directory (tree) — complementary, not duplicate
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-search_files
NAME=search_files (FileSearchTool, UtilityTools.ts:89)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/UtilityTools.ts
IMPLEMENTATION=filename glob (cwd-bounded, node_modules/.git/dist ignored, 100-cap); required:['pattern']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=best-rank-1; NOT router-excluded; not priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): contained *.txt glob ok:true, both fixture files returned absolute
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=permissions read-only; risk default medium -> passes
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({files[]})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
OVERLAP=search_text (content) — filename vs content split is INTENTIONAL and documented at UtilityTools.ts:128-138; grep-family aliases now route to search_text, not here
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-project_edit
NAME=project_edit (ProjectEditTool, ProjectEditTool.ts:587)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ProjectEditTool.ts
IMPLEMENTATION=surgical SEARCH/REPLACE on scaffolded projects (syntax gate, build verify, auto-revert, undo); required:['request']; dir defaults to session active project
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=best-rank-1; ROUTER_EXCLUDED fast-path-only (has deterministic path; F34)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1; not priority-listed
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): no-project request -> ok:true + honest 'No active project' message (absence-as-success, F36); edit path itself unprobed (needs scaffolded project)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium (name-regex) -> reaches execute (proven: message came from execute body, not firewall)
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=PARTIAL (ok:true for absence — verifier must read message)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (no-project path evidenced; scaffolded-edit path + build-verify unprobed)
RECOMMENDED_ACTION=WIRING-P2-004 verifier note (6th absence instance); deep edit-path story needs a scaffolded-project fixture (future)

---

CAPABILITY_ID=TOOL-archive_files
NAME=archive_files (ArchiveFilesTool.ts:12)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ArchiveFilesTool.ts
IMPLEMENTATION=create/extract/list over zip|tar.gz|tar via shell (zip/tar/unzip binaries); required:['action','archivePath']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=best-rank-1 (score 15.3); NOT router-excluded; priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (arch2.json + trunk_files.json): tar.gz create+list ok:true on contained fixture; zip create 0/2 — `zip` binary absent on Windows, `|| true` swallows the failure, statSync throws misleading ENOENT (F37)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium -> reaches execute (failures come from execute body)
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=PARTIAL (tar.gz honest; zip failure misreports cause)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (tar backends work; zip backend broken on Windows + cause-swallow)
SECURITY_RISK=low-medium: tar.gz list shows absolute-source path stored in archive ('Joe/muse-worktree/.../a.txt') — extraction-path review required
PORTABILITY_RISK=HIGH for zip path (external Unix binary + /dev/null redirect on Windows)
RECOMMENDED_ACTION=WIRING-P2-009: zip backend (bundle/dep/fallback + remove `|| true` + honest binary-missing error); review absolute-source storage; extract path still unprobed

---

CAPABILITY_ID=TOOL-delete_file
NAME=delete_file (DeleteFileTool, SystemTools.ts:808)
CATEGORY=tool/files-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=contained unlink/rm with not_found/is_directory honesty branches; required:[] (path validated in body)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=CORE_TOOLS pinned + best-rank-1; ROUTER_EXCLUDED fast-path-only (F34)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1; not priority-listed
EXECUTOR_REACHABLE=YES (to firewall)
EXECUTOR_EVIDENCE=LIVE (trunk_files.json): explicit contained path -> approval_required risk=high pre-execution, target file verified SURVIVING after (F38); execute-body branches (not_found/is_directory/delete) unprobed — firewall pre-empts first under default policy
PERMISSION_REACHABLE=GATED (by design)
PERMISSION_EVIDENCE=risk high (name-regex) -> approval_required without AUTO_APPROVE_ALL (sweep3 + trunk rerun-stable)
INPUT_CONTRACT_VALID=YES (code-read; live body unreached)
OUTPUT_CONTRACT_VALID=UNKNOWN (live body unreached)
EVIDENCE_PRODUCED=YES (gate verdict is explicit)
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (gate proven; execute-body honesty branches need an approval-harness probe, future)
RECOMMENDED_ACTION=none (gate is correct); future: approved-context fixture for body branches (safe temp target only)

---

CAPABILITY_ID=TRUNK-browser_ui-batch1
NAME=browser_ui trunk batch-1: 33 members (declarations + selection + session survey; live pending)
CATEGORY=trunk/browser-ui (group row, checkpoint 9)
SOURCE_FILES=25 in api/src/modules/tools/definitions/BrowserSmartTools.ts; BrowserActionTool.ts; BrowserVisionTool.ts (2); PageFixTool.ts; ScreenshotTool.ts (2); UiFixTool.ts; UserBrowserTool.ts; BrowserRunTool.ts
IMPLEMENTATION=operate/inspect/repair pages in a real browser (merge.json trunk why)
REGISTERED=YES (33/33)
REGISTRY_EVIDENCE=in live 163 (trunk_browser1.json; probe aborts unless 163)
PLANNER_VISIBLE=YES (33/33)
PLANNER_EVIDENCE=33/33 SELECTABLE_BY_KEYWORD (32 rank-1; screenshot rank-2 behind user_browser on self-name goal — user_browser description names 'screenshot' as an action; both selectable, F42)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded top-30 ranks in trunk_browser1.json; 0 router-excluded; 3 priority-listed (browser_action, browser_run, browser_vision); 0 core-pinned
EXECUTOR_REACHABLE=UNKNOWN (live pending)
EXECUTOR_EVIDENCE=zero executions in batch-1 (read-only by design); session-binding mechanism surveyed per tool instead (F43): context-derived 25 (browserSid: explicit browserSessionId else browser:sessionId else throw browser_session_required, BrowserSmartTools.ts:21-27) / input-required 2 (browser_action, browser_run) / optional+fallback 2 (browser_page_fix, browser_ui_fix) / standalone chromium.launch 2 (screenshot, visual_compare) / separate real-browser channel 1 (user_browser)
PERMISSION_REACHABLE=UNKNOWN (live pending)
PERMISSION_EVIDENCE=declarations only: internet-only 23, internet+write 4, internet+execute 2, read 2, write+execute 1, internet+read+write 1; zero boot-defaulted in trunk (F46)
INPUT_CONTRACT_VALID=PARTIAL (declarations read; bodies unprobed)
OUTPUT_CONTRACT_VALID=UNKNOWN
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=UNKNOWN (live pending)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=UNKNOWN_REQUIRES_INVESTIGATION (batch-1 is LEVEL 2-3 only)
BLOCKER=LEVEL-4 live batch needs: session-fixture design for 25 context tools; contained-URL design for standalone pair; user_browser helper contract; isolated-process harness for browser_launch EMBARGO
OVERLAP=Muse M01/M08 browser action-verification work (unintegrated)
LEGACY_RISK=UNKNOWN
SECURITY_RISK=25/33 declare empty sideEffects incl. state-changing click/fill (F45, planner-signal debt -> WIRING-P2-011); browser_launch defaults to BROWSER_HOME_URL || google.com (F48, embargo rationale confirmed)
PORTABILITY_RISK=UNKNOWN
RECOMMENDED_ACTION=WIRING-P2-011 for sideEffects honesty; then LEVEL-4 live batch per mechanism (never live-call write+execute ui_fix or launch without fixture designs)

---

CAPABILITY_ID=TOOL-browser_ui_fix
NAME=browser_ui_fix (UiFixTool.ts)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/UiFixTool.ts
IMPLEMENTATION=audits a built interface in a real browser + REPAIRs a11y/usability defects in source; NO required inputs; permissions write+execute
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=self-grounded rank (trunk_browser1.json); not router-excluded; not priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
EXECUTOR_REACHABLE=PARTIAL (pre-browser leg live; repair body unprobed — write+execute+build)
EXECUTOR_EVIDENCE=LIVE (trunk_browser_live1.json ui_fix_empty): {} -> ok:false no_project via canonical path, no browser launched, no writes (F44 now live-proven, 010/F59). Repair/rebuild/audit-again body (UiFixTool.ts:72-106) deliberately unprobed
PERMISSION_REACHABLE=UNKNOWN
PERMISSION_EVIDENCE=write+execute declared (risk tier from sweep3 census, not re-probed here)
INPUT_CONTRACT_VALID=YES (code-read: no required, body validates dir)
OUTPUT_CONTRACT_VALID=UNKNOWN (live unprobed)
EVIDENCE_PRODUCED=UNKNOWN
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=UNKNOWN
REAL_JOE_PROVEN=NO
PRIMARY_STATE=UNKNOWN_REQUIRES_INVESTIGATION (needs throwaway-fixture live probe: no_project control first, then scaffolded-project repair)
RECOMMENDED_ACTION=future LEVEL-4 probe with fixture project only; joins P2-004 read-before-call rule

---

---

CAPABILITY_ID=TOOL-screenshot
NAME=screenshot (ScreenshotTool.ts)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ScreenshotTool.ts
IMPLEMENTATION=standalone chromium.launch (headless) + goto + PNG to process.cwd()/screenshots; required:['url']; permissions read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=self-grounded rank-2 behind user_browser on self-name goal (both selectable, 009/F42); not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_browser_live1.json): data-URL -> ok:true, 10237-byte PNG verified on disk at reported path, removed by probe (cleaned:true); {} -> honest 'needs a url'. No approval gate; ephemeral headless (hasUserDataDir:false)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read-only tool; canonical executeTool+firewall passed
INPUT_CONTRACT_VALID=YES (url required + enforced in body :66-67)
OUTPUT_CONTRACT_VALID=YES (success/path/publicUrl/width/height; path verified real)
EVIDENCE_PRODUCED=YES (PNG file + broadcast event)
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; verification-compat unsurveyed)
BLOCKER=none for execution
OVERLAP=screenshot action inside user_browser (separate channel) + browser_fullpage_shot (unsurveyed)
LEGACY_RISK=low
SECURITY_RISK=filename joins unsanitized under process.cwd()/screenshots (code-indicated :75-85, never probed with traversal input) — WIRING-P2-014 review item
PORTABILITY_RISK=low (cwd-relative screenshots dir; headless-shell missing in sandbox is env)
RECOMMENDED_ACTION=WIRING-P2-014 containment review; else no change

---

CAPABILITY_ID=TOOL-visual_compare
NAME=visual_compare (VisualComparisonTool, ScreenshotTool.ts:190-268)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ScreenshotTool.ts
IMPLEMENTATION=byte-size heuristic: |lenA-lenB|/max <= threshold (pure local fs, no browser); required:['baseline','current']; permissions read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded (trunk_browser1.json)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_browser_live1.json): self -> match:true diff 0; +64B grown -> match:true diff 0.62% (heuristic PROVEN live); missing files -> honest not-found
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=PARTIAL (match/diffPercentage honest for what it measures, but it measures BYTE SIZE, not pixels — description 'Compare two screenshots and report visual differences' overclaims)
EVIDENCE_PRODUCED=YES (match + diff%)
VERIFICATION_COMPATIBLE=PARTIAL (a same-size different-pixel pair would 'match' — code-indicated, unstaged)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (executes honestly; fidelity gap vs description)
RECOMMENDED_ACTION=WIRING-P2-014: rename/relabeled contract (byte-compare) or pixel diff; add same-size-negative test

---

CAPABILITY_ID=TOOL-browser_action
NAME=browser_action (BrowserActionTool.ts)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserActionTool.ts
IMPLEMENTATION=atomic session actions (goto/click/fill/scroll/evaluate/extract_text/...); required:['sessionId','action']; permissions internet+execute; local-URL port guard (:53-70)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; PRIORITY_TOOL_NAMES-listed
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD rank-1 (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_browser_live1.json, canonical, no approval gate): goto data-URL ok:true; extract_text returns page marker; evaluate '40+2' -> 42. Session closed after
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=internet+execute passed gate for data-URL inputs (input-dependent tiering; contrast sweep3 delete-text HIGH)
INPUT_CONTRACT_VALID=YES (goto accepts data-URLs via normalizeUrlForGoto passthrough — payload must avoid label substrings, url.ts:93-99)
OUTPUT_CONTRACT_VALID=YES ({success,result}; extract text reaches caller)
EVIDENCE_PRODUCED=YES (result strings)
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
OVERLAP=browser_run (sibling; DIVERGES on data-URL goto + extract surfacing — see TOOL-browser_run-behavior)
RECOMMENDED_ACTION=none (reference behavior for the run/action divergence)

---

CAPABILITY_ID=TOOL-browser_run-behavior
NAME=browser_run behavior (BrowserRunTool.ts; ownership verdict is TOOL-browser_run-injection-verdict)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserRunTool.ts
IMPLEMENTATION=multi-action executor + instructionText->plan path; required:['sessionId']; ownership via canAccessBrowserSession (legacy sid==browser:uid path used by probe, no bypass)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; PRIORITY_TOOL_NAMES-listed
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD rank-1 (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=PARTIAL
EXECUTOR_EVIDENCE=LIVE (live1+live2, canonical, no approval gate): goto http-loopback ok:true (pageUrl+title proven, 2/2 reruns); goto data-URL -> navigation_failed 'invalid URL' on FRESH session (about:blank) — DIVERGES from browser_action (F51). instructionText->model path unprobed (needs provider)
PERMISSION_REACHABLE=YES (legacy-ownership positive; foreign -> forbidden honest; {} -> forbidden via injection, see injection-verdict row)
INPUT_CONTRACT_VALID=PARTIAL (http(s) yes; data-URL no — undocumented vocabulary split vs sibling)
OUTPUT_CONTRACT_VALID=NO (extract_text executes but its result is DISCARDED: output keys sessionId/pageUrl/title/screenshotHref/summary/missingSecrets only, generic summary, marker absent anywhere — run_extract_raw. MISMATCH #8)
EVIDENCE_PRODUCED=PARTIAL (navigation proof + screenshot artifact; NO action results)
VERIFICATION_COMPATIBLE=NO for extract legs (result unreachable)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (navigates; loses action results; narrower URL vocabulary than sibling)
RECOMMENDED_ACTION=WIRING-P2-012 (surface per-action results) + vocabulary note under P2-013

---

CAPABILITY_ID=TOOL-browser_consent
NAME=browser_consent (BrowserSmartTools.ts:1866-1889)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts + api/src/modules/browser/manager.ts (:306-325)
IMPLEMENTATION=consent ask/record for persistent-profile mode; required:[]; no browser launch on either leg
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live1, canonical): {} with session context -> ok:true consent:false needsConsent:true, no browser; sessionless context -> fail-closed internal_exception browser_session_required (error carries stack string — observability note). grant:true leg NOT probed (writes consent file; design-reviewed only)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message+consent+needsConsent)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; grant leg design-only)
BLOCKER=none (F48 resolved: ephemeral mode needs no gate by design; enforcement is PlanningEngine persistent-mode check)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_find_text
NAME=browser_find_text (BrowserSmartTools.ts:1306+)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=goto url + count/snippets/highlight matches; required:['url','query']; enforces no_url/no_query in body (:1326-1327, cannot operate on current page without URL)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=PARTIAL (negative leg live; positive needs loopback pattern)
EXECUTOR_EVIDENCE=LIVE (live1, canonical): {http://127.0.0.1:9/} -> fast honest find_text_failed (Chrome ERR_UNSAFE_PORT on :9 — fixture note, F56). Zero external traffic. Positive unprobed (representative of 22 (a)-tools awaiting loopback pattern)
PERMISSION_REACHABLE=YES (negative leg passed gate)
INPUT_CONTRACT_VALID=PARTIAL (requires URL; data:/about: URLs mangled by normalizeUrl — P2-013)
OUTPUT_CONTRACT_VALID=UNKNOWN (positive unprobed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (honest failures; success path unprobed)
RECOMMENDED_ACTION=loopback-fixture positive in next live batch (pattern ready)

---

CAPABILITY_ID=TOOL-browser_page_fix
NAME=browser_page_fix (PageFixTool.ts)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/PageFixTool.ts
IMPLEMENTATION=measure UI defects + build CSS patch + apply live + save file; required:['url']; permissions internet+write; DRIVES SHARED panel-browser session unconditionally (:133) ignoring its session input
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=PARTIAL (pre-browser leg live; body deliberately unprobed)
EXECUTOR_EVIDENCE=LIVE (live1, canonical): {} -> no_url, no browser launched. Positive NOT probed: forces https:// (:124), drives shared PANEL_BROWSER_SID (cross-session mutation — WIRING-P1-004), writes CSS under process.cwd()/data/artifacts (:262-266)
PERMISSION_REACHABLE=UNKNOWN (body unreached)
INPUT_CONTRACT_VALID=PARTIAL (no contained-URL vocabulary)
OUTPUT_CONTRACT_VALID=UNKNOWN
CANONICAL_PATH_CONNECTED=PARTIAL
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (reachable; session-ownership bypass defect)
SECURITY_RISK=drives a session the caller did not address (shared panel) — session-ownership bypass in a write tool
RECOMMENDED_ACTION=WIRING-P1-004 (bind to addressed session like browserSid) + P2-013 vocabulary

---

CAPABILITY_ID=TOOL-user_browser
NAME=user_browser (UserBrowserTool.ts; separate extension channel)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/UserBrowserTool.ts + api/src/modules/extension/gateway.ts
IMPLEMENTATION=drives the USER's real browser via Joe extension (open/read/screenshot/click/type/status); required:['action']; server holds no cookies
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1; outranks screenshot on self-name goal — curiosity, not defect)
SELECTABLE=YES
EXECUTOR_REACHABLE=PARTIAL (fail-closed legs live; helper-present path unprobed — no extension in sandbox)
EXECUTOR_EVIDENCE=LIVE (live1, canonical): status -> ok:true connected:false; open(data-URL) -> honest extension_not_connected. No browser touched, no helper traffic
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=PARTIAL (fail-closed shapes honest; connected shapes unsurveyed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (fail-closed proven; live channel unprobed)
RECOMMENDED_ACTION=helper-present probe only with a real test extension + consent; never against the owner's daily browser

---

END-OF-MUSE-DRAFT-ROWS=51 (42 individual + 7 group + 2 external-cited)
COVERAGE-DISCLAIMER=This draft covers ONLY what Muse checkpoints 1-10 evidenced. Full matrix requires: per-trunk path stories (19 trunks PROPOSED in merge.json, 1 STORIED: files 10/10; browser_ui 33 batch-2 PARTIAL: 11/33 LEVEL-4, 22 (a)-tools pending), services/workers/persistence/deployment rows (NVIDIA scope), bulk per-tool firewall sweep (8 spot + 28 empty-input batch-1+2 + 19 risk-tier live + 16 trunk-files + 3 arch-backend + 26 browser live1/live2 done; 25/25 no-required reviewed: 18 SAFE + 1 BOUND + 4 EMBARGO with static fixture designs + 2 FIXTURE probed contained; browser_launch embargo partially lifted for contained-http; risk table SURVEYED), contract audit per boundary (8 mismatches), LEVEL 5-6 proofs, and NVIDIA cross-review (currently BLOCKED).
