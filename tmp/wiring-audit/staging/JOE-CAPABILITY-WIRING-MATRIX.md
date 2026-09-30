# JOE CAPABILITY WIRING MATRIX (Muse draft 2026-09-29 — staging for D:\Joe\coordination\team\JOE-CAPABILITY-WIRING-MATRIX.md)

SCOPE=Muse-branch discovery checkpoints 1-19 only (muse/joe-development @ 19692487).
Rows below are EVIDENCED tool-level entries. HIGH_LEVEL_CAPABILITIES grouping
(merge v1: 19 trunks PROPOSED, 9 STORIED: files 10/10 in checkpoint 8;
browser_ui 33/33 LEVEL-4 complete — checkpoint 11; both trunks
verification-swept LEVEL-5 — checkpoint 12, see §VERIFY12; testing_qa
6/6 LEVEL-4 + static verification-compat — checkpoint 13, see §VERIFY13;
security 3/3 LEVEL-4 + static verification-compat — checkpoint 14,
see §VERIFY14; code_understanding 16/16 LEVEL-4 + static
verification-compat — checkpoint 15, see §VERIFY15; vcs_repo 11/11
LEVEL-4 + static verification-compat — checkpoint 16, see §VERIFY16;
build_generate 13/13 LEVEL-4 + static verification-compat —
checkpoint 17, see §VERIFY17); runtime_services 5/5 LEVEL-4 + static verification-compat + checker-set correction [checkpoint 18, see VERIFY18]; shell_terminal 4/4 LEVEL-4 + static verification-compat [checkpoint 19, see VERIFY19]),
services/workers/internal-infra rows, and NVIDIA-owned
registry/ingress/persistence areas are UNKNOWN/PENDING and must NOT be
treated as covered.
Evidence files: D:\Joe\muse-worktree\tmp\wiring-audit\{discovery,exposure,
classification,reachability,target,exec,sweep1,sweep2,merge,sweep3,trunk_files,
arch2,trunk_browser1,trunk_browser_live1,trunk_browser_live2,
trunk_browser_live3,verify_sweep12,trunk_testing,trunk_security,trunk_code,trunk_vcs,trunk_build,trunk_runtime,trunk_shell,shell_cwd}.json +
{discover,exposure,classify,reach,target,exec,
sweep1,sweep2,merge,sweep3,trunk_files,arch2,trunk_browser1,
trunk_browser_live1,trunk_browser_live2,trunk_browser_live3,
verify_sweep12,trunk_testing,chaos_call_probe,trunk_security,trunk_code,trunk_vcs,trunk_build,prog_batch3,trunk_runtime,pages_approved,stop_mech,trunk_shell,shell_cwd}.mts +
MUSE-WIRING-DISCOVERY-00{1,2,3,4,5,6,7}.md + MUSE-WIRING-DISCOVERY-008.md +
MUSE-WIRING-DISCOVERY-009.md + MUSE-WIRING-DISCOVERY-010.md +
MUSE-WIRING-DISCOVERY-011.md + MUSE-WIRING-DISCOVERY-012.md +
MUSE-WIRING-DISCOVERY-013.md + MUSE-WIRING-DISCOVERY-014.md +
MUSE-WIRING-DISCOVERY-015.md + MUSE-WIRING-DISCOVERY-016.md +
MUSE-WIRING-DISCOVERY-017.md +
MUSE-WIRING-DISCOVERY-018.md. All probes
re-runnable; exec/sweep/trunk probes perform bounded safe runs only
(fixtures created + removed by the probe; 4 EMBARGO names never executed
except browser_launch contained-http partial lift in 010 — static fixture
designs in 008; 2 FIXTURE names probed with contained explicit inputs only;
sweep3 risk probes control-gated, see 007; delete_file verdict-only with
target-survival check, see 008; trunk_browser1 is read-only: zero tool
executions, see 009; live1/live2 launch ephemeral headless only with
sandbox dirs + active approval gate + loopback/data-URL-only traffic,
see 010; verify_sweep12 dispatches real phases through ToolService +
firewall with a probe-owned workspace, see 012).

FORMAT per row follows CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT.

§VERIFY12 — VERIFICATION-COMPAT (checkpoint 12, files 10/10 + browser_ui 33/33).
Consumer: PhaseExecutor task-level (:1557-1650) + phase gate (:2302-2449);
verdict fn verificationResultFromToolResult; allowlist isVerificationTool;
receipts in verificationLedger. Applies to every TOOL row of the two
storied trunks; per-row EVIDENCE_PRODUCED/VERIFICATION_COMPATIBLE below
should be read together with this section until per-row backfill.
CHECKER_PARTITION=task-level checkers among the 43: browser_console_scan,
browser_ui_audit, browser_contrast_audit, browser_check_links,
browser_performance, browser_run, browser_responsive_check (7); read_file
gate-opt-in only; other 35 never receipted (static 43/43 + V5 live).
VERDICT_MAP=ok/error-only for all 43 (no output.status/verificationFailed/
cancelled/timedOut emitted — grep-verified 13 files); static 21/21 shapes
match; passed = check executed, content-blind (absence x6, extract-swallow,
empty-answer all map safe-direction). Evidence: verify_sweep12.json.
RECEIPT_EVIDENCE=6 (a)-checkers emit output.url -> evidenceLocation=url
(V4 live for console_scan); browser_run pageUrl-only -> '' (extends #8,
P2-012); read_file gate no-url -> '' (V1/V2 live).
REUSE=browser checks always run (no trusted revision, V4 live, by design);
read_file gates always invalidated (nonce scopeRoot, V1/V6 live, MISMATCH
#10 -> P2-018). Non-checker tasks bypass the ledger (V5: 0 receipts).
GATE_NEGATIVES=V2 missing-path -> partial + failed receipt; V3 non-checker
gate -> verification_unavailable pre-execution, 0 browser sessions, partial.
METHOD=direct executor invocation is firewall-rejected fail-closed (F72);
LEVEL-5 must dispatch via ToolService inside runInContext.
AMBIENT_WORKSPACE (checkpoint 17, F121): ToolService resolves
sessionId->workspaceId via resolveSessionIdentity
(ToolService.ts:744-762) and wraps execution in
runWithWorkspace (:863-865), so no-arg getActiveRoot()
inside tools lands in the SESSION root. This mechanism
explains all no-arg session landings in this audit.
CORRECTION: 016/F107 (git default-cwd "NOT the session")
is UNPROVEN — session/default roots are both 3 below the
repo root, so ../../../ status output cannot distinguish
them; decisive marker re-probe outstanding.

§VERIFY13 — VERIFICATION-COMPAT STATIC (checkpoint 13, testing_qa 6/6).
Same consumer/allowlist/verdict-fn as §VERIFY12; L5 live gate proof
PENDING for this trunk (scopeRoot-nonce extension code-indicated only).
CHECKER_PARTITION=task-level checkers among the 6: auto_tester,
quality_run (2); gate opt-ins change nothing; other 4 never
receipted (static 6/6). VERDICT_MAP=quality_run emits
output.status (completed/failed/incomplete — first storied tool
to do so): completed->passed, failed->failed, all-skipped->
failed (skip-blind, F75); all other trunk shapes ok/error-only;
11-shape pure-function table (passed = check executed except
F74's tool-level false success, which is a non-checker).
RECEIPT_EVIDENCE=both trunk checkers emit no url/reportPath/
evidenceLocation (quality_run {results,status,error};
auto_tester {passed,errors,summary}) -> evidence-hollow
receipts (3rd/4th hollow shapes, P2-019). REUSE=MISMATCH #10
scope preference covers both (task-level prefers
cwd/projectPath/path; quality_run takes path, auto_tester
takes projectPath — code-indicated). ALLOWLIST_DRIFT=
visual_qa is ORPHANED yet allowlisted (F81, P1-001 ext).
Evidence: trunk_testing.json + chaos_call_probe.log.

§VERIFY14 — VERIFICATION-COMPAT STATIC (checkpoint 14, security 3/3).
Same consumer/allowlist/verdict-fn as §VERIFY12; L5 live gate proof
PENDING for this trunk (scopeRoot-nonce extension code-indicated only).
CHECKER_PARTITION=task-level checkers among the 3: dependency_audit,
secrets_scan_repo (2); gate opt-ins change nothing; security_scanner
never receipted (static 3/3). Checker set now closed except
code_reviewer (13/14 allowlisted shapes partitioned). VERDICT_MAP=
7-shape pure-function table, all safe-direction for checkers
(pass=pass, setup-failure=failed, clean=passed, findings=failed);
security_scanner findings-present maps passed (presence-as-success,
F88 — safe ONLY because non-checker; documented constraint).
RECEIPT_EVIDENCE=both trunk checkers emit no url/reportPath/
evidenceLocation (dep_audit {report}; secrets {findings,
scannedFiles}) -> evidence-hollow receipts (5th/6th hollow
shapes; P2-019 broadens to ALL non-URL checkers). REUSE=
MISMATCH #10 scope preference covers both (both take `path`;
task-level :1570-1578 + gate :2372-2378 — code-indicated;
P2-018 now covers 4 checkers). Evidence: trunk_security.json.

§VERIFY15 — VERIFICATION-COMPAT STATIC (checkpoint 15, code_understanding 16/16).
Same consumer/allowlist/verdict-fn as §VERIFY12; L5 live gate proof
PENDING for this trunk (scopeRoot-nonce extension code-indicated only).
CHECKER_PARTITION=task-level checkers among the 16: code_reviewer
ONLY (1); gate opt-ins change nothing; other 15 never receipted
(static 16/16). Checker set 14/14 CLOSED (013/F77 + 014/F87 notes
resolved). VERDICT_MAP=11-shape pure-function table: reviewer
quick-ok->passed, missing/quality-gate->failed; Elite
'{}'->passed + pattern-empty->passed + refactor-silent->passed +
analyze-error->passed are NON-CHECKER constraints (F88 class —
safe today, must gate any allowlist change). RECEIPT_EVIDENCE=
code_reviewer emits no url/reportPath/evidenceLocation
({overallScore,...,qualityGate}) -> evidence-hollow receipt
(7th hollow shape, P2-019). REUSE=MISMATCH #10 scope preference
covers code_reviewer (takes `projectPath`; task-level :1570-1578
+ gate :2372-2378 — code-indicated, same shape as auto_tester;
P2-018 now covers 5 checkers). Evidence: trunk_code.json.

§VERIFY16 — VERIFICATION-COMPAT STATIC (checkpoint 16, vcs_repo 11/11).
Same consumer/allowlist/verdict-fn as §VERIFY12; no checker on this
trunk so no L5 live gate proof is owed for it (5-checker backlog
unchanged). CHECKER_PARTITION=task-level checkers among the 11:
NONE (0); gate opt-ins change nothing (static 11/11). Checker set
stays 14/14 CLOSED. VERDICT_MAP=12-shape pure-function table, all
ok:true shapes map passed incl. import-no-url-guidance and
patch-dryrun-preview (NON-CHECKER constraints, F88 class — safe
today, must gate any allowlist change); runcmd-failed maps failed.
RECEIPT_EVIDENCE=N/A (no trunk checker). REUSE=N/A. NOTE: live
runcmd/diff legs are ALWAYS ok:false via MISMATCH #12 (exitCode
dropped), so their live verdict is failed-with-output — noisy
fail-closed, opposite direction from the hollow passes. Evidence:
trunk_vcs.json.

§VERIFY17 — VERIFICATION-COMPAT STATIC (checkpoint 17, build_generate 13/13).
Same consumer/allowlist/verdict-fn as §VERIFY12; no checker on this
trunk so no L5 live gate proof is owed for it (5-checker backlog
unchanged). CHECKER_PARTITION=task-level checkers among the 13:
NONE (0); gate opt-ins change nothing (static 13/13). Checker set
stays 14/14 CLOSED. VERDICT_MAP=13-shape pure-function table, all
ok:true shapes map passed/incomplete as non-checker constraints
(F88 class — safe today, must gate any allowlist change):
scaffold-created passed, scaffold-partial failed, template-ready
passed, template-missing failed, auth-refused failed,
mobile-unknown-action failed, mobile-build-commands passed,
progressive-batch incomplete (ok:true + status generating),
pipeline-empty failed, ai-needs-both failed, page-no-request
failed, enterprise-verified passed, enterprise-failed failed.
RECEIPT_EVIDENCE=N/A (no trunk checker). REUSE=N/A. NOTE: live
api/react legs are ok:true WITH honest unproven flags
(proven:false/accepted:false — the honest direction, F118);
live progressive batch-3 is ok:true with provider-failure
prose PERSISTED AS SOURCE (false-artifact direction, F116,
MISMATCH #9 5th instance). Evidence: trunk_build.json.

VERIFY18 -- VERIFICATION-COMPAT STATIC (checkpoint 18, runtime_services 5/5).
Same consumer/allowlist/verdict-fn as VERIFY12. CHECKER_PARTITION:
task-level checkers among the 5: NONE (0); existence-gate opt-ins
change nothing (static 5/5); live-gate opt-in admits project_run
ONLY (ledger :740-747, documented rationale). Checker set is
CORRECTED to 14 task-level + project_run live-gate-only (prior
"14/14 CLOSED" refined, not refuted). VERDICT_MAP=12-shape
pure-function table: needs-connect/missing/unknown-action/needs-cwd/
no-project map failed (safe); deployed/live/stop-idle/stop-done map
passed; built/running/exposed map incomplete (non-checker
constraints); started-unready (ok:true + serverReady:false) maps
PASSED = MISMATCH #13 (consumer blind to the explicit flag).
RECEIPT_EVIDENCE=project_run live URL receipt L5-PROVEN by
run.detected/run.override (real HTTP 200 + token + ready:true,
auto + forced ports); lifecycle bounded by F124 (stop defect).
REUSE=N/A. Evidence: trunk_runtime.json + pages_approved logs.

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
CATEGORY=tool/security-trunk
SOURCE_FILES=api/src/modules/tools/definitions/QualityTools.ts
IMPLEMENTATION=runs `npm audit --json` (5-min budget) in explicit path or getWorkspaceRoot() when no path given — session context IGNORED (:89-96); registry network call; pm auto-detect (yarn/pnpm lockfiles)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; required:null; permissions ['execute','internet']; sideEffects ['execute'] honest
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 (8.6); not router-excluded; not priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (trunk_security.json)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_security.json, canonical, 2 fast-fail legs 2x verdict-identical): enolock ok:false + report carries ENOLOCK cause; empty-dir ok:false + report run-varying (notice-noise vs ANCESTOR audit JSON — npm walks up to Joe's own root package.json, F83). {} never executed (P2-006 default-root); positive leg embargoed (network).
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium (execute+internet) -> passes default autoSafe; no gate fired
INPUT_CONTRACT_VALID=PARTIAL (explicit path accepted, but packageless dir escapes upward to ancestor package — F83/P2-006 ext; default root is Joe itself)
OUTPUT_CONTRACT_VALID=NO (any non-ok result mislabeled 'Audit found security vulnerabilities.' even for ENOLOCK/setup — P2-010; report sometimes pure noise — P2-005 4th instance)
EVIDENCE_PRODUCED=YES (report carries cause except noise-variant)
VERIFICATION_COMPATIBLE=PARTIAL (task-level checker, static §VERIFY14; pass/fail map correctly; receipts evidence-hollow — no url keys, P2-019; scopeRoot reuse gap code-indicated, P2-018; L5 live gate proof pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (checker evidence + scopeRoot reuse gap code-indicated; upward-escape containment gap live-proven)
SECURITY_RISK=medium: explicit packageless path audits ancestor (Joe's own repo) over network; default root is Joe's repo
RECOMMENDED_ACTION=WIRING-P2-006 extension (pre-check package.json/lockfile + pin --prefix) + WIRING-P2-010 + WIRING-P2-019 + P2-005 instance

---

CAPABILITY_ID=TOOL-security_scanner
NAME=security_scanner (SecurityScannerTool.ts:16+)
CATEGORY=tool/security-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SecurityScannerTool.ts
IMPLEMENTATION=one-of contract (requiredAny files/projectPath/target/path); session-bound via ctx.workspaceId (:84-98); regex scan (SQLi/XSS/secrets/random/eval/http/validation); riskScore min(100,weighted); discovery max100 files/6 depth, .env excluded
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; required:[] + requiredAny extension; permissions ['read']; sideEffects [] honest (read-only, fixtures untouched 2x)
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 (13.1); not router-excluded; not priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (trunk_security.json)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_security.json, canonical, 7 legs 2x verdict-identical): seeded 5 vulns/risk 83/summary exact; discover exactly [clean.js,vuln.js]; explicit .env 1 critical; missing/empty honest; outside-path containment-proven; file-target always-misses (F84). sweep2 {} honest rejection stands as the empty-input leg (session-state-dependent, 014 correction).
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=session containment enforced live (outside-nonexistent -> must-stay-within-workspace); risk low/medium -> no gate fired
INPUT_CONTRACT_VALID=PARTIAL (one-of enforced; file-as-projectPath always misses — F84/P2-021; discovery/ext vocabulary split — F90)
OUTPUT_CONTRACT_VALID=YES (vulnerabilities/riskScore/summary exact on seeded fixture; findings do NOT affect ok — presence-as-success shape, F88)
EVIDENCE_PRODUCED=YES (structured vulns + logs)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY14; findings-present maps passed content-blind; must not join allowlist without mapping inversion — documented constraint)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (file-target + vocabulary gaps; else fully evidenced)
RECOMMENDED_ACTION=WIRING-P2-021 (file-target handling + align-or-document vocabulary); keep as requiredAny positive control

---

CAPABILITY_ID=TOOL-secrets_scan_repo
NAME=secrets_scan_repo (QualityTools.ts:247-350)
CATEGORY=tool/security-trunk
SOURCE_FILES=api/src/modules/tools/definitions/QualityTools.ts
IMPLEMENTATION=regex walk (openai/github/aws/private-key/generic-assignment) over text files; skips node_modules/.git/dist/build/coverage/.next/.turbo/.cache + files >1MB; maxFindings default 200; ok = findings==0; resolveToolPath WITHOUT workspaceId (projectRoot-bounded, not session-bounded)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; required:['path']; permissions ['read']; sideEffects [] honest (read-only, fixtures untouched 2x)
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 (19.5); not router-excluded; not priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (trunk_security.json)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_security.json, canonical, 4 legs 2x verdict-identical): seeded exactly 4 findings (openai_key 1 + generic 3)/scannedFiles 3/node_modules plant absent; clean ok:true; missing-path ok:true CLEAN-SHAPED (F85 absence-as-success); cap honored (maxFindings:1 -> 1). {} never executed (maps to default workspace — F86).
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium (read) -> passes default autoSafe; no gate fired; NOTE projectRoot-bounded, not session-bounded (no workspaceId passed)
INPUT_CONTRACT_VALID=NO (required:['path'] decorative — missing path maps to default-root scan, F86/P2-004; nonexistent path scans clean, F85)
OUTPUT_CONTRACT_VALID=PARTIAL ({findings,scannedFiles} exact on seeded fixture; missing-path shape indistinguishable from clean)
EVIDENCE_PRODUCED=YES (typed findings with file+line)
VERIFICATION_COMPATIBLE=PARTIAL (task-level checker, static §VERIFY14; clean->passed/findings->failed map correctly; receipts evidence-hollow — no url keys, P2-019; scopeRoot reuse gap code-indicated, P2-018; L5 live gate proof pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (checker evidence + scopeRoot reuse gap code-indicated; input-contract gaps live-proven)
SECURITY_RISK=low-medium: missing path silently scans default workspace (session escape); nonexistent path reports clean
RECOMMENDED_ACTION=WIRING-P2-004 extensions (enforce required path; honest nonexistent-path error) + WIRING-P2-019

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
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live1 negative + live3 positive, canonical): {http://127.0.0.1:9/} -> fast honest find_text_failed (Chrome ERR_UNSAFE_PORT on :9 — fixture note, F56); {loopback /audit, query AuditEight} -> ok:true count=1/snippets=1/highlighted=1 + shot; {url} without query -> no_query (body-enforced :1326-1327, 011/F65). Zero external traffic
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=PARTIAL (requires URL; data:/about: URLs mangled by normalizeUrl — P2-013)
OUTPUT_CONTRACT_VALID=YES (count/snippets/highlighted/url/shot; all verified)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none (P2-013 vocabulary note rides with the family)

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

CAPABILITY_ID=TRUNK-browser_ui-batch3
NAME=browser_ui trunk batch-3: remaining 22 (a) tools + vision + find_text close (LEVEL-4 complete 33/33)
CATEGORY=trunk/browser-ui (group row, checkpoint 11)
SOURCE_FILES=22 executes in api/src/modules/tools/definitions/BrowserSmartTools.ts (read-before-call, all) + BrowserVisionTool.ts + honesty chain ToolService.ts:940-944 / honestResult.ts / intelligent-router.ts:2201/2778/2789/2794
IMPLEMENTATION=per-tool contained legs via one loopback fixture server (/audit flawed page + /cmp-a/b + /fx-search/results + png/404 routes), one owned session, ephemeral headless, approval gate active
REGISTERED=YES (23/23 in live 163)
REGISTRY_EVIDENCE=probe aborts unless 163 (trunk_browser_live3.mts)
PLANNER_VISIBLE=YES (33/33 from batch-1, unchanged)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES (30/30 legs exit 0, 0 timeouts, 0 gates, 0 direct legs; 28/28 verdict-identical runs 1+2 with exact scores identical; run 3 added findtext x2 green)
EXECUTOR_EVIDENCE=trunk_browser_live3.json: 19 green-positive (a) + 3 model-trio ok:false-via-honesty-flip + vision green + search green + negatives (no_target/no_query/no_url/ui_audit-{} honest); 19 artifact files created + ALL verified-then-removed by probe. Session-partition correction: (d) standalone-launch = 3 (screenshot, visual_compare, browser_vision) — (a)25/(b)2/(c)2/(d)3/(e)1 now sums to 33 (011/F64)
PERMISSION_REACHABLE=YES (all legs passed the active gate; input-dependent tiering unchanged)
INPUT_CONTRACT_VALID=YES (per-tool required enforced in bodies; url vocabulary still http-only for (a) — P2-013)
OUTPUT_CONTRACT_VALID=MIXED (19 YES + trio flipped-honest + responsive per-viewport flag dropped P2-016 + compare global-baseline note P2-017 + router resolve-vs-throw MISMATCH #9)
EVIDENCE_PRODUCED=YES (JSON verdicts + disk-verified PNG/PDF/CSV/HTML, all cleaned)
VERIFICATION_COMPATIBLE=UNKNOWN (LEVEL 5-6 pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=TRUNK-COMPLETE-AT-LEVEL-4 (per-tool states in rows below; verification-compat + model-present paths + helper/positive-deliberates remain)
RECOMMENDED_ACTION=WIRING-P2-015 (model-fallback contract) + P2-016 + P2-017 + P2-014 extension (vision dir); then LEVEL 5-6 sweep on this trunk

---

CAPABILITY_ID=TOOL-browser_seo_audit
NAME=browser_seo_audit (BrowserSEOAuditTool, BrowserSmartTools.ts:332-379)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + DOM evaluate (title/desc/canonical/og/h1/lang/img-alt/https) + 100-crit*25-warn*10-info*4 score; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 seo, canonical, 2/2): score 48, 7 issues, lang+canonical+https flags fire (exact score predicted from code: 4 warn + 3 info)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/score/issues/title/url)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_a11y_deep
NAME=browser_a11y_deep (BrowserA11yDeepTool, BrowserSmartTools.ts:584-641)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + DOM evaluate (landmarks/skip-link/dup-ids/bad-links/tabindex/aria-hidden/heading-order/focusables) + score; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 a11y, canonical, 2/2): score 58, focusables 10, all 5 seeded defects detected (dup/tabindex/aria/skip-order/nav)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/score/issues/focusables/url)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_contrast_audit
NAME=browser_contrast_audit (BrowserContrastAuditTool, BrowserSmartTools.ts:518-579)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + computed-style contrast evaluate (WCAG AA 4.5:1/3:1, 400-el cap) + screenshot; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 contrast, canonical, 2/2): 24 checked, exactly 1 fail = seeded LowContrastSeed span (#777 on white), score 94 + shot
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/score/checked/fails/url/screenshot)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_console_scan
NAME=browser_console_scan (BrowserConsoleScanTool, BrowserSmartTools.ts:384-429)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=listeners (console/pageerror/requestfailed/response) + goto + 1.8s dwell + screenshot; listeners removed in finally; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 console, canonical, 2/2): errorCount 3 with SeedConsoleErrorEight captured + img-missing in netFails (count-split unrecorded — minor evidence-shape note)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/errorCount/pageErrors/consoleErrors/netFails/warnings/url/screenshot)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_check_links
NAME=browser_check_links (BrowserCheckLinksTool, BrowserSmartTools.ts:234-273)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + collect a[href] + node fetch HEAD(->GET on 405/501) per unique link, 8s abort, limit clamp 1-60; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 links, canonical, 2/2): total 4, broken 1 = /gone only (skip + empty-hash resolve 200); all fetches loopback-contained
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/total/brokenCount/broken/url)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
SECURITY_RISK=none observed (fetches only page-listed links; SSRF posture unsurveyed — not claimed)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_performance
NAME=browser_performance (BrowserPerformanceTool, BrowserSmartTools.ts:278-327)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=direct goto (no openPage poison-recovery) + navigation/resource timing evaluate; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 perf, canonical, 2/2): wallMs + resourceCount numeric on loopback fixture
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/wallMs + perf fields/url)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_readability
NAME=browser_readability (BrowserReadabilityTool, BrowserSmartTools.ts:469-513)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + density-scored candidate extract (article/main/content/body) + word/reading-time; ok = words>0; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 readability, canonical, 2/2): 41 words + title on article fixture
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/title/author/words/readingMinutes/text/url)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_extract_meta
NAME=browser_extract_meta (BrowserExtractMetaTool, BrowserSmartTools.ts:646-692)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + evaluate (named/og/twitter meta + canonical + favicon + lang + JSON-LD + h1-h3 outline); required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 meta, canonical, 2/2): title + lang '' (missing correctly reported) + jsonld 1 + og 1 + outline 3
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message + all meta fields + url)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_extract_data
NAME=browser_extract_data (BrowserExtractDataTool, BrowserSmartTools.ts:167-229)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + evaluate (explicit selector | largest table | largest list) + CSV to ARTIFACT_DIR (BOM); ok = rows>0; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 extract, canonical, 2/2): kind=table count=2 firstName=alpha; CSV verified on disk (28B, contains alpha) then removed by probe
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/kind/count/rows[200]/csv/url)
EVIDENCE_PRODUCED=YES (JSON rows + CSV file)
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; writes contained to ARTIFACT_DIR)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_design_tokens
NAME=browser_design_tokens (BrowserDesignTokensTool, BrowserSmartTools.ts:1394-1463)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + computed-style tally (bg/text/accent/buttons/fonts/sizes/radii, 4000-el cap) + screenshot; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 tokens, canonical, 2/2): 2 backgrounds / 2 fonts / 5 sizes + shot on styled fixture
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message + token lists + url/screenshot)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_responsive_check
NAME=browser_responsive_check (BrowserResponsiveCheckTool, BrowserSmartTools.ts:1216-1301)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + 3 viewports (390/820/1440) x (overflow/tiny-target/small-font/viewport-meta metrics + shot) + score; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 responsive, canonical, 2/2): score 60, 3/3 viewports + shots, viewport issue fired on the meta-less fixture
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=PARTIAL (hasViewportMeta evaluated + scored but DROPPED from per-viewport output objects (:1297) — detection surfaces only via score/issues; 011/F63)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (executes + scores honestly; evaluated flag unreported)
RECOMMENDED_ACTION=WIRING-P2-016 (report the flag per viewport or document score-only surfacing)

---

CAPABILITY_ID=TOOL-browser_ui_audit
NAME=browser_ui_audit (BrowserUIAuditTool, BrowserSmartTools.ts:901-1053)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + evaluate (lang/viewport/charset/title/imgs/h1/inputs/buttons/targets) + console listeners + overlay boxes + shot + score; no-url falls back to joeProjects fresh-audit reuse or builtPreviewUrl (schema still requires url); required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 uiaudit x2, canonical, 2/2): {url} -> score 10, 8 issues, viewport+console flags, reused:false; {} -> honest no_url naming the session (fail-closed, pre-browser). joeProjects-reuse path unprobed (needs fabricated global state)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES (schema-vs-fallback documented in-file :921-961)
OUTPUT_CONTRACT_VALID=YES (message/score/issues/counts/url/screenshot)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; reuse-path unprobed)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_summarize
NAME=browser_summarize (BrowserSummarizeTool, BrowserSmartTools.ts:836-896)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + extract (title/desc/headings/7k text) + shot + routeToModel positional+context (:883) with empty-fallback (:885-888); required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 summarize, canonical, 2/2): ok:false with router no-provider prose as error + FULL output (sumLen 252 + shot) — ToolService apology flip (011/F62). Router RESOLVES failure prose (never throws here), so the tool's empty-fallback is dead on this path
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (honest failure; flip is the documented backstop)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; model-present path unprobed — no provider in sandbox)
RECOMMENDED_ACTION=WIRING-P2-015 (resolve-vs-throw contract; rides with trio)

---

CAPABILITY_ID=TOOL-browser_translate
NAME=browser_translate (BrowserTranslateTool, BrowserSmartTools.ts:1152-1211)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + extract (title/120 blocks/8k text) + shot + routeToModel positional+context (:1201) with empty-fallback (:1203-1205); target label map ar/en/fr/es/de/tr; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 translate target=fr, canonical, 2/2): ok:false via apology flip + target French + 7 blocks (same chain as summarize, 011/F62)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (honest failure)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; model-present path unprobed)
RECOMMENDED_ACTION=WIRING-P2-015 (rides with trio)

---

CAPABILITY_ID=TOOL-browser_smart_agent
NAME=browser_smart_agent (BrowserSmartAgentTool, BrowserSmartTools.ts:1600-1739)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + single-pass gather (content/UI/SEO/design/perf) + fullpage shot + 3-lens scoring + routeToModel brief with fallback (:1713-1714); required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 smartagent, canonical, 2/2): ok:false via apology flip + scores 75/54/70 + 8 findings computed-then-discarded (none are ARTIFACT_KEYS, so the flip keeps them from the planner — 011/F62)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (honest failure; partial-loss noted)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; model-present path unprobed)
RECOMMENDED_ACTION=WIRING-P2-015 (partial-output preservation rides here)

---

CAPABILITY_ID=TOOL-browser_compare
NAME=browser_compare (BrowserCompareTool, BrowserSmartTools.ts:697-831)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=before/after capture (sig + PNG) or single-URL baseline in (global).joeCompareBaselines (:726) + structural set-diff + canvas pixel-diff composite + shot; no required inputs but no-url-no-before-after rejected (:721-723)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 compare x3, canonical, 2/2): pair -> 3 changes + CmpBeta + pct 0.4 + composite; baseline leg1 baseline:true; leg2 pct 0 changes 0 (deterministic re-capture diffs exactly zero)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/changes/pctChanged/url/composite)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
BLOCKER=baselines are process-global keyed by bare URL (cross-user/session leak: a second user's first call diffs against the first user's baseline) — WIRING-P2-017
RECOMMENDED_ACTION=WIRING-P2-017 (session-scope or document refresh semantics)

---

CAPABILITY_ID=TOOL-browser_fill_form
NAME=browser_fill_form (BrowserFillFormTool, BrowserSmartTools.ts:1058-1147)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage (url optional) + per-field DOM match (name/id/placeholder/aria/label-for) + input/change events + optional submit (button click or form.requestSubmit) + shot; required:['fields'] (NOT url)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 fill x2, canonical, 2/2): {cityname, nosuchfield} -> filled [cityname] + missed [nosuchfield], submitted:false; submit leg -> submitted:true + loopback navigation (/audit?cityname=...)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES (fields map enforced no_fields; url optional by design)
OUTPUT_CONTRACT_VALID=YES (message/filled/missed/submitted/url/screenshot)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; mutates page — sideEffects:[] debt rides P2-011)
RECOMMENDED_ACTION=none (P2-011 declaration note stands)

---

CAPABILITY_ID=TOOL-browser_click
NAME=browser_click (BrowserClickTool, BrowserSmartTools.ts:1468-1552)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + locate (selector else visible-text exact/contains) + cursor overlay + real page.click + navigation/content-change report + shot; required:['url'] + text-or-selector (no_target)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 click x2, canonical, 2/2): FlipMarker button -> clicked + tag button + urlChanged:false + contentChanged:true; no-text -> no_target
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/clicked/tag/urlChanged/contentChanged/beforeUrl/afterUrl/navigated/screenshot)
EVIDENCE_PRODUCED=YES (real effect observed, not bare ok)
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; mutates page — sideEffects:[] debt rides P2-011)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_fullpage_shot
NAME=browser_fullpage_shot (BrowserFullPageShotTool, BrowserSmartTools.ts:1557-1595)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + scroll-to-bottom lazy trigger + fullPage JPEG + meta (title/imgs/links/sections); permissions internet+write; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 fullpage, canonical, 2/2): height + title + shot on fixture
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/height/meta/url/screenshot)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_save_pdf
NAME=browser_save_pdf (BrowserSavePdfTool, BrowserSmartTools.ts:434-464)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + page.pdf (A4, headless-only) to ARTIFACT_DIR; permissions internet+write; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 savepdf, canonical, 2/2): PDF verified on disk (76KB, %PDF magic) then removed by probe
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/pdf/url)
EVIDENCE_PRODUCED=YES (PDF file)
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; writes contained to ARTIFACT_DIR)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_autofix
NAME=browser_autofix (BrowserAutofixTool, BrowserSmartTools.ts:1744-1859)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage + before-shot + 8 deterministic live-DOM fixes (lang/viewport/charset/alt/aria-label/h1-demote/meta-desc/empty-links) + after-shot + corrected HTML to ARTIFACT_DIR; permissions internet+write; required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 autofix, canonical, 2/2): 8 fixes on the flawed fixture (lang/viewport among them); corrected HTML verified on disk (contains lang="en") then removed
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES (message/fixes/count/fixedFile/beforeScreenshot/afterScreenshot/url)
EVIDENCE_PRODUCED=YES (fix list + before/after shots + HTML file)
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; live-DOM mutation is the documented purpose)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-browser_vision
NAME=browser_vision (BrowserVisionTool.ts; THIRD standalone-launch member, 011/F64)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserVisionTool.ts
IMPLEMENTATION=chromium.launch() directly (ignores context entirely — no browserSid, no session) + raw-URL goto (NO normalizeUrl: data-URLs would work, unlike (a)) + PNG to process.cwd()/screenshots (fixed screenshot_<ts>.png name); required:['url']; PRIORITY-listed
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 vision, canonical, 2/2): PNG verified on disk (31KB) then removed; standalone launch honors BROWSER_EXECUTABLE_PATH. Corrects 009/F43: (d)=3, partition now sums 25+2+2+3+1=33
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES (url required + enforced :38-39 — audit-fixed pre-launch validation)
OUTPUT_CONTRACT_VALID=YES (screenshotPath/message/logs; path verified real)
EVIDENCE_PRODUCED=YES (PNG file)
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
PORTABILITY_RISK=cwd-relative screenshots dir (no traversal vector — fixed filename; joins P2-014 review)
RECOMMENDED_ACTION=WIRING-P2-014 extension (cwd dir review, shared with screenshot)

---

CAPABILITY_ID=TOOL-browser_search
NAME=browser_search (BrowserSearchTool, BrowserSmartTools.ts:1897-2055)
CATEGORY=tool/browser-ui-trunk
SOURCE_FILES=api/src/modules/tools/definitions/BrowserSmartTools.ts
IMPLEMENTATION=openPage(engine default google.com; consent-dismiss + bing/duckduckgo fallback hop) + live cursor + letter-by-letter typing (85ms) + Enter + results parse (g-blocks else li/article) + shot + routeToModel({messages}) best-effort answer (:2032, DIFFERENT call shape — no context); required:['query']; engine overridable
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD (batch-1)
SELECTABLE=YES
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (live3 search, canonical, 2/2, contained engine=loopback /fx-search): typedLive:true + submitted:true + resultsUrl contained + 2/2 SeedResult parsed + answerLen 0 (model best-effort empty, ok still true — escapes the apology flip because no apology text lands in output; coherent since results are the deliverable, 011/F62)
PERMISSION_REACHABLE=YES
INPUT_CONTRACT_VALID=YES (query enforced no_query; engine URL honored)
OUTPUT_CONTRACT_VALID=YES (message/query/url/submitted/typedLive/results/answer/screenshot)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=UNKNOWN
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; real-engine path deliberately unprobed — external traffic by design; model-present answer unprobed)
RECOMMENDED_ACTION=none (routeToModel {messages}-shape vs positional-shape variance noted for P2-015)

---

CAPABILITY_ID=TOOL-auto_tester
NAME=auto_tester (AutoTesterTool, AutoTesterTool.ts:18)
CATEGORY=tool/testing-qa-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AutoTesterTool.ts
IMPLEMENTATION=acceptance observer: syntax (JSON in-process, JS via nested node --check, JSX/TS via esbuild) + build/unit/integration via declared npm scripts through nested shell_execute (+ live project_run when a local test endpoint is detected); vacuous/zero-test exit-0 refused; required:['testType','projectPath']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 (trunk_testing.json); not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_testing.json, canonical, 9 legs 2x identical): syntax valid/broken-json/broken-js/unsupported/no-files all honest; bad-type honest; unit pass/fail/no-pkg honest incl. nested npm runs
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium (execute) -> passes default autoSafe; no gate fired
INPUT_CONTRACT_VALID=YES (testType enum + projectPath enforced with specific errors)
OUTPUT_CONTRACT_VALID=YES ({passed,errors,summary}; nested-failure message text run-varying, F76)
EVIDENCE_PRODUCED=YES (structured output + logs)
VERIFICATION_COMPATIBLE=PARTIAL (task-level checker, static §VERIFY13; verdicts passed/failed map correctly; receipts evidence-hollow — no url keys, P2-019; L5 live gate proof pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (checker evidence + scopeRoot reuse gap code-indicated; sideEffects [] dishonest — runs scripts/servers, P2-020)
RECOMMENDED_ACTION=WIRING-P2-019 + WIRING-P2-020 + P2-005 error-text instance

---

CAPABILITY_ID=TOOL-quality_run
NAME=quality_run (QualityRunTool, QualityTools.ts:106)
CATEGORY=tool/testing-qa-trunk
SOURCE_FILES=api/src/modules/tools/definitions/QualityTools.ts
IMPLEMENTATION=lint/typecheck/test/build over declared package scripts (+ npx tsc fallback, static-records artifact accept); per-task {ok,skipped} results; output.status completed/failed/incomplete; required:['path']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_testing.json, canonical, 3 legs 2x identical): test pass ok:true/completed; all-skipped ok:false/incomplete; fail ok:false/failed
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk medium (execute) -> passes default autoSafe; no gate fired
INPUT_CONTRACT_VALID=YES (path required)
OUTPUT_CONTRACT_VALID=PARTIAL ({results,status,error}; per-task error '' on npm exit-1, F75; top message run-varying, F76)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=PARTIAL (task-level checker, static §VERIFY13; all-skipped maps failed not incomplete — skip-blind, F75/P2-004; receipts evidence-hollow, P2-019; L5 live gate proof pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (checker evidence + scopeRoot reuse gap code-indicated)
RECOMMENDED_ACTION=WIRING-P2-019 + P2-004/P2-005 extensions

---

CAPABILITY_ID=TOOL-chaos_test_plan
NAME=chaos_test_plan (ChaosTestingTool, EliteTools.ts:105)
CATEGORY=tool/testing-qa-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EliteTools.ts
IMPLEMENTATION=model JSON plan via getLLM/callLLM + regex-extract-or-{} (EliteTools.ts:129); required:['architecture'] (NOT enforced — prompt interpolates unchecked); permissions [] boot-defaulted to read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_testing.json chaos.offline 2x identical): no-provider -> ok:true + {} FALSE SUCCESS (F74, MISMATCH #11); mechanism proven by chaos_call_probe (callLLM resolves failure prose, regex drops it)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low (defaulted read) -> passes default autoSafe
INPUT_CONTRACT_VALID=NO (missing architecture unguarded)
OUTPUT_CONTRACT_VALID=NO (model-shaped; {} on failure with ok:true)
EVIDENCE_PRODUCED=PARTIAL ({} carries nothing on the failure path)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY13; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (false-success defect; 7 code-identical EliteTools siblings)
RECOMMENDED_ACTION=WIRING-P2-015 extension (fail on empty-extract + input guard)

---

CAPABILITY_ID=TOOL-load_tester
NAME=load_tester (LoadTesterTool, QualityTools.ts:416)
CATEGORY=tool/testing-qa-trunk
SOURCE_FILES=api/src/modules/tools/definitions/QualityTools.ts
IMPLEMENTATION=Node concurrent fetcher (lite k6): vus capped 50, duration 1-300s; empty-url guard (QualityTools.ts:441-443); required:['url']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_testing.json, canonical, 2 legs 2x identical): {} honest error; loopback 1VU/1s ok:true, 78/98 hits, 0 errors (F82)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=execute+internet, medium -> passes default autoSafe; no gate fired (loopback)
INPUT_CONTRACT_VALID=YES (http(s) url enforced)
OUTPUT_CONTRACT_VALID=YES ({summary} with VUs/duration/requests/RPS/errors)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY13)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; external-target path deliberately unprobed)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-sonar_analysis
NAME=sonar_analysis (SonarAnalysisTool, QualityTools.ts:32)
CATEGORY=tool/testing-qa-trunk
SOURCE_FILES=api/src/modules/tools/definitions/QualityTools.ts
IMPLEMENTATION=npx sonar-scanner wrapper, 300s timeout, not-found classified; empty-projectKey pre-shell guard; required:['projectKey']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=PARTIAL (negative leg only)
EXECUTOR_EVIDENCE=LIVE (trunk_testing.json sonar.no-key 2x identical): {} honest pre-shell error; positive leg EMBARGOED (npx network + 300s scanner, F82)
PERMISSION_REACHABLE=YES (negative leg passed default autoSafe)
INPUT_CONTRACT_VALID=YES (projectKey enforced pre-shell)
OUTPUT_CONTRACT_VALID=UNKNOWN (positive shape {summary} code-indicated only)
EVIDENCE_PRODUCED=PARTIAL (negative-leg error only)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY13)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (positive path unproven by embargo)
RECOMMENDED_ACTION=none until a contained scanner fixture exists; then prove or document mock-only

---

CAPABILITY_ID=TOOL-test_generator
NAME=test_generator (TestGeneratorTool, AdvancedTools.ts:382)
CATEGORY=tool/testing-qa-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AdvancedTools.ts
IMPLEMENTATION=static export-target test writer: runner detect (vitest/jest/node) from nearest package.json, node/CommonJS-vs-ESM + TS-skip shapes, writes __tests__/<file>.test.* ; required:['filePath']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_testing.json, canonical, 3 legs 2x identical): .js wrote real file (testCount 2, coverage 100, byte-verified+cleaned); .ts node-runner ok:true+skipped (F80); missing file honest error
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read+write, medium -> passes default autoSafe; no gate fired
INPUT_CONTRACT_VALID=YES (filePath enforced + containment-resolved)
OUTPUT_CONTRACT_VALID=PARTIAL (write shape honest; ts-skip ok:true+generated:false joins P2-004 absence family)
EVIDENCE_PRODUCED=YES (test file + structured output)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY13)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (sideEffects undeclared though it writes files, P2-020)
RECOMMENDED_ACTION=WIRING-P2-020 + P2-004 ts-skip note

---

CAPABILITY_ID=TOOL-ambiguity_resolver
NAME=ambiguity_resolver (AmbiguityResolverTool, EliteTools.ts:205)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EliteTools.ts
IMPLEMENTATION=model JSON via getLLM/callLLM + regex-extract-or-{} (EliteTools.ts:225); required:['text'] (NOT enforced — prompt interpolates unchecked); permissions [] boot-defaulted to read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json elite.ambiguity 2x identical): valid input offline -> ok:true + {} FALSE SUCCESS (F92, MISMATCH #11 2nd live tool)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low (defaulted read) -> passes default autoSafe
INPUT_CONTRACT_VALID=NO (missing text unguarded)
OUTPUT_CONTRACT_VALID=NO (model-shaped; {} on failure with ok:true)
EVIDENCE_PRODUCED=PARTIAL ({} carries nothing on the failure path)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (false-success defect; EliteTools family)
RECOMMENDED_ACTION=WIRING-P2-015 extension (fail on empty-extract + input guard; isProviderFailure seam)

---

CAPABILITY_ID=TOOL-analyze_codebase
NAME=analyze_codebase (AnalyzeCodebaseTool, AnalysisTools.ts:70)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AnalysisTools.ts
IMPLEMENTATION=local structure walk (depth<=3, 60 files, key-file slurp) + routeToModel architect summary; safePath contained; https? branch redirects to browser_run (no network); graceful-fallback catch ok:true (AnalysisTools.ts:161-164); permissions ['read','internet']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 2 legs 2x identical): remote-URL ok:true redirect (no network); offline -> ok:false WITH failure-prose summary via ToolService backstop flip of an ok:true tool result — own fallback catch DEAD on the resolve path (F95, MISMATCH #9 4th instance)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low (default tier) -> passes default autoSafe
INPUT_CONTRACT_VALID=YES (missing path honest ok:false 'Path not found')
OUTPUT_CONTRACT_VALID=PARTIAL ({summary}; ok:true failure-prose pre-flip)
EVIDENCE_PRODUCED=YES (summary + analyze.root/llm_error logs)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (resolve-path honesty depends on backstop scan)
RECOMMENDED_ACTION=MISMATCH #9 tool-side repair (fail honestly when routeToModel resolves failure prose)

---

CAPABILITY_ID=TOOL-analyze_project
NAME=analyze_project (AnalyzeProjectTool, AnalysisTools.ts:45)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AnalysisTools.ts
IMPLEMENTATION=local Analyst.analyze(root) (fs+path only, model-free); safePath contained; required:[] (path optional)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 2 legs 2x identical): seeded dir ok:true Analyst shape ({status,type,techStack,structure}); missing path -> ok:true + {status:'error'} (F94, P2-004 9th instance — both siblings return honest ok:false)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low -> passes default autoSafe
INPUT_CONTRACT_VALID=YES (path optional by schema)
OUTPUT_CONTRACT_VALID=NO (error-status wrapped ok:true)
EVIDENCE_PRODUCED=YES (Analyst shape + success log)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (missing-path error-as-success)
RECOMMENDED_ACTION=WIRING-P2-004 extension (surface status:error as ok:false like siblings)

---

CAPABILITY_ID=TOOL-auto_refactor
NAME=auto_refactor (AutoRefactorTool, AdvancedTools.ts:240)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AdvancedTools.ts
IMPLEMENTATION=deterministic regex refactors (optimize-imports dedup+sort, simplify if/else+console-strip, extractFunctions STUB always-noop); resolveToolPath contained; writes file when changed; required:['filePath']; permissions ['read','write'] but sideEffects [] (dishonest)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 3 legs 2x identical): scratch ok:true 2 changes + byte-diff (dedup+sort+console-strip, 92->56B); sort-only -> ok:true + changes:[] + diff:0, file byte-identical (computed sort DISCARDED by changed-gate — no-op success, F97); missing file honest error
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier passes default autoSafe on session fixtures; no gate fired
INPUT_CONTRACT_VALID=YES (filePath enforced, missing honest)
OUTPUT_CONTRACT_VALID=PARTIAL ({changes,lengths,diff} honest for writes; silent-drop unreported)
EVIDENCE_PRODUCED=YES (change list + byte verifiable)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (undeclared write side effect; sort-drop no-op success)
RECOMMENDED_ACTION=WIRING-P2-011/P2-020 family (declare write sideEffects) + P2-004 (report/apply sorts)

---

CAPABILITY_ID=TOOL-business_logic_parser
NAME=business_logic_parser (BusinessLogicTool, EliteTools.ts:75)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EliteTools.ts
IMPLEMENTATION=model JSON rules via getLLM/callLLM + regex-extract-or-{} (EliteTools.ts:99); required:['requirements'] (NOT enforced); permissions [] boot-defaulted to read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json elite.biz-logic 2x identical): valid input offline -> ok:true + {} FALSE SUCCESS (F92, MISMATCH #11 3rd live tool)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low (defaulted read) -> passes default autoSafe
INPUT_CONTRACT_VALID=NO (missing requirements unguarded)
OUTPUT_CONTRACT_VALID=NO (model-shaped; {} on failure with ok:true)
EVIDENCE_PRODUCED=PARTIAL ({} carries nothing on the failure path)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (false-success defect; EliteTools family)
RECOMMENDED_ACTION=WIRING-P2-015 extension (fail on empty-extract + input guard; isProviderFailure seam)

---

CAPABILITY_ID=TOOL-code_reviewer
NAME=code_reviewer (CodeReviewerTool, CodeReviewerTool.ts:12)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/CodeReviewerTool.ts
IMPLEMENTATION=deterministic static pass (secrets critical, merge markers critical, eval/new-Function warning, empty-catch warning, TODO info, JS/TS + Python rules, bracket balance; score = 100-30C-10W-3I) + optional LLM pass for non-quick reviewType (merged, LLM findings unverified); files capped at 5 (filesRequested vs filesReviewed both emitted); minimumScore/failOnCritical quality gate; activeRoot containment; required:['files']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 6 quick legs 2x identical): seeded review EXACT score 57 + exact rows (critical L2, warning L4, info L6); missing/empty/bad-score/gate-fail all honest with exact messages; session-outside file rejected -> missingFiles -> ok:false (F99)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier -> passes default autoSafe; no gate fired
INPUT_CONTRACT_VALID=YES (files/minimumScore/projectPath all enforced; outside-workspace rejected)
OUTPUT_CONTRACT_VALID=YES ({overallScore,files,reviewed,missing,issues,suggestions,summary,qualityGate}; no evidence pointer — hollow receipt, F98)
EVIDENCE_PRODUCED=YES (issues + logs; receipt hollow — no url/reportPath/evidenceLocation)
VERIFICATION_COMPATIBLE=PARTIAL (sole task-level checker of the trunk; closes 14/14 — static §VERIFY15; receipt hollow P2-019; scopeRoot preference code-indicated P2-018; L5 live gate proof pending)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (checker evidence + scopeRoot reuse gap code-indicated; non-quick reviewType unprobed)
RECOMMENDED_ACTION=WIRING-P2-019 + P2-018 (receipt evidence pointer + scope fix)

---

CAPABILITY_ID=TOOL-codebase_outline
NAME=codebase_outline (CodebaseOutlineTool, CodebaseOutlineTool.ts:7)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/CodebaseOutlineTool.ts
IMPLEMENTATION=fast regex outline (class/function/interface/import + totalLines); resolves relatives against process.cwd() with NO containment and takes NO context param (CodebaseOutlineTool.ts:34-41); required:['filePath'] enforced
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 4 legs 2x identical): seeded outline EXACT (L2/L5/L6 + import row); relative 'package.json' -> ok:true reading api/package.json (131 split-lines; session has none — cwd-root PROVEN); absolute OS-temp path outside session -> ok:true exact read (UNCONTAINED PROVEN); missing file honest error (F93)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier -> passes default autoSafe
INPUT_CONTRACT_VALID=YES (filePath enforced, missing honest)
OUTPUT_CONTRACT_VALID=YES (exact outline shape)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (uncontained reads: cwd-rooted relatives + unrestricted absolutes)
RECOMMENDED_ACTION=WIRING-P2-006 extension (accept context + resolveToolPath + outside rejection)

---

CAPABILITY_ID=TOOL-compliance_validator
NAME=compliance_validator (ComplianceValidatorTool, EliteTools.ts:135)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EliteTools.ts
IMPLEMENTATION=model JSON report via getLLM/callLLM + regex-extract-or-{} (EliteTools.ts:165); content pre-guard honest (missing content fast-errors); required:['content','standard']; permissions [] boot-defaulted to read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 2 legs 2x identical): valid input offline -> ok:true + {} FALSE SUCCESS (F92, MISMATCH #11 4th live tool); {} honest pre-LLM error
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low (defaulted read) -> passes default autoSafe
INPUT_CONTRACT_VALID=PARTIAL (content guarded; standard unguarded)
OUTPUT_CONTRACT_VALID=NO (model-shaped; {} on failure with ok:true)
EVIDENCE_PRODUCED=PARTIAL ({} carries nothing on the failure path)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (false-success defect; EliteTools family)
RECOMMENDED_ACTION=WIRING-P2-015 extension (fail on empty-extract; isProviderFailure seam)

---

CAPABILITY_ID=TOOL-dead_code_detector
NAME=dead_code_detector (DeadCodeTool, DeadCodeTool.ts)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/DeadCodeTool.ts
IMPLEMENTATION=npx knip --reporter json via executionEngine (modes: scan/types/dependencies/files/exports); NO required array in schema; autoFix declared-but-never-read (MISMATCH #4); execute() takes NO context, resolves via no-arg getActiveRoot() (DeadCodeTool.ts:11-19); permissions ['read','execute'], sideEffects ['execute']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=PARTIAL (negative leg only)
EXECUTOR_EVIDENCE=LIVE (trunk_code.json dead.missing 2x identical): missing projectPath honest pre-knip error (no npx spawned); positive leg EMBARGOED (008 fixture design stands — npx knip over a project)
PERMISSION_REACHABLE=YES (negative leg passed default autoSafe)
INPUT_CONTRACT_VALID=PARTIAL (no required array; autoFix dead input)
OUTPUT_CONTRACT_VALID=UNKNOWN (positive shape code-indicated only)
EVIDENCE_PRODUCED=PARTIAL (negative-leg error only)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES (negative path)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (no-context root + dead input; positive unprobed)
RECOMMENDED_ACTION=WIRING-P2-006 extension (context + contained root) + MISMATCH #4 (drop or wire autoFix)

---

CAPABILITY_ID=TOOL-dependency_graph
NAME=dependency_graph (DependencyGraphTool, EliteTools.ts:30)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EliteTools.ts
IMPLEMENTATION=model JSON graph via getLLM/callLLM + regex-extract-or-{} (EliteTools.ts:66); input.path DEFAULTS to '.' (unguided); required:['path'] (NOT enforced); permissions ['read'] declared
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json elite.dep-graph 2x identical): valid input offline -> ok:true + {} FALSE SUCCESS (F92, MISMATCH #11 5th live tool)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low -> passes default autoSafe
INPUT_CONTRACT_VALID=NO (missing path unguarded, defaults '.')
OUTPUT_CONTRACT_VALID=NO (model-shaped; {} on failure with ok:true)
EVIDENCE_PRODUCED=PARTIAL ({} carries nothing on the failure path)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (false-success defect; EliteTools family)
RECOMMENDED_ACTION=WIRING-P2-015 extension (fail on empty-extract + input guard; isProviderFailure seam)

---

CAPABILITY_ID=TOOL-engineering_discovery
NAME=engineering_discovery (EngineeringDiscoveryTool, EngineeringDiscoveryTool.ts:85)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EngineeringDiscoveryTool.ts
IMPLEMENTATION=read-only workspace evidence (projects, manifests, Git facts, entrypoints, local checks) + deterministic intent regexes (Arabic/English, boundary-asserted); contained via resolveToolPath + isWithinRoot; required:[] (all optional)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 2 legs 2x identical): seeded request ok:true greenfield evidence ({evidence:{version,mode,workspaceRoot,...}}); outside path honest path_outside_workspace (F99)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier -> passes default autoSafe; fixtures byte-identical (read-only honored)
INPUT_CONTRACT_VALID=YES (all-optional schema; outside rejected)
OUTPUT_CONTRACT_VALID=YES ({evidence} shape)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; intent-regex precision out of scope for wiring)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-inspect_symbol
NAME=inspect_symbol (UtilityTools.ts:220)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/UtilityTools.ts
IMPLEMENTATION=regex + brace-count symbol extraction (class/function/const/let/var + 20-line fallback); resolveToolPath contained; required:['filePath','symbolName']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 2 legs 2x identical): seeded symbol EXACT 3-line extraction; missing symbol honest error; missing file honest error (F99)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier -> passes default autoSafe
INPUT_CONTRACT_VALID=YES (both fields effectively enforced via honest errors)
OUTPUT_CONTRACT_VALID=YES ({code} exact)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level; heuristic-extraction precision out of scope for wiring)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-pattern_recognize
NAME=pattern_recognize (PatternRecognitionTool, AdvancedTools.ts:10)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AdvancedTools.ts
IMPLEMENTATION=model-free static regex patterns (TS 5 families, JS 3) + anti-patterns + complexity/maintainability metrics; required:['code','language'] but ONLY code enforced; filePath schema property accepted but never read (AdvancedTools.ts:43-91)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 4 legs 2x identical): seeded code exact (Singleton x2 lines 2-3 + Factory); no-language -> ok:true + patterns:[] (decorative-required, F96/P2-004 10th); bogus-filePath vs no-filePath BYTE-IDENTICAL outputs (dead input, F96/MISMATCH #4 2nd instance)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier -> passes default autoSafe
INPUT_CONTRACT_VALID=NO (language decorative; filePath dead)
OUTPUT_CONTRACT_VALID=PARTIAL (exact when inputs complete; empty-patterns success otherwise)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (decorative-required + dead input)
RECOMMENDED_ACTION=WIRING-P2-004 extension (enforce language or drop from required) + MISMATCH #4 (drop or wire filePath)

---

CAPABILITY_ID=TOOL-project_detect
NAME=project_detect (ProjectDetectTool, AnalysisTools.ts:168)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AnalysisTools.ts
IMPLEMENTATION=model-free marker scan (package.json / pyproject+requirements+Pipfile+setup.py / go.mod), maxDepth clamped 1-10, node_modules/dist/build/coverage/.git/.next/.turbo/.cache + dot-dirs skipped; safePath contained; required:[] (path/maxDepth optional)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 2 legs 2x identical): seeded fixture EXACTLY 1/1/1 projects with node_modules plant absent from all lists; missing path honest 'Path not found' (F99)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier -> passes default autoSafe
INPUT_CONTRACT_VALID=YES (optionals with sane defaults + clamp; missing honest)
OUTPUT_CONTRACT_VALID=YES ({root,nodeProjects,pythonProjects,goProjects,hint} exact)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (at tool level)
RECOMMENDED_ACTION=none

---

CAPABILITY_ID=TOOL-request_analyzer
NAME=request_analyzer (RequestAnalyzerTool, RequestAnalyzerTool.ts:8)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/RequestAnalyzerTool.ts
IMPLEMENTATION=LLM architect analysis (projectType/complexity/modules/files/techStack/requirements) via callLLM; userRequest pre-guard honest; required:['userRequest']; permissions [] boot-defaulted to read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=PARTIAL (negative leg only)
EXECUTOR_EVIDENCE=LIVE (trunk_code.json request.empty 2x identical): {} honest pre-LLM error; valid-input leg NOT run (model-present behavior unprobed by checkpoint rule — would exercise callLLM resolve path)
PERMISSION_REACHABLE=YES (negative leg passed default autoSafe)
INPUT_CONTRACT_VALID=YES (userRequest enforced pre-LLM)
OUTPUT_CONTRACT_VALID=UNKNOWN (model-shaped; offline/online shape unprobed)
EVIDENCE_PRODUCED=PARTIAL (negative-leg error only)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15)
CANONICAL_PATH_CONNECTED=YES (negative path)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=UNKNOWN_REQUIRES_INVESTIGATION (valid-input model path deliberately unprobed; audit further or gate on provider-shape tests)
RECOMMENDED_ACTION=probe valid-input offline shape in a later checkpoint (same rule as Elite legs) before wiring verdict

---

CAPABILITY_ID=TOOL-self_confidence_evaluator
NAME=self_confidence_evaluator (SelfConfidenceTool, EliteTools.ts:261)
CATEGORY=tool/code-understanding-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EliteTools.ts
IMPLEMENTATION=model JSON score via getLLM/callLLM + regex-extract-or-{} (EliteTools.ts:284); content pre-guard honest (missing content fast-errors); required:['content']; permissions [] boot-defaulted to read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_code.json, canonical, 2 legs 2x identical): valid input offline -> ok:true + {} FALSE SUCCESS (F92, MISMATCH #11 6th live tool); {} honest pre-LLM error
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=risk low (defaulted read) -> passes default autoSafe
INPUT_CONTRACT_VALID=PARTIAL (content guarded)
OUTPUT_CONTRACT_VALID=NO (model-shaped; {} on failure with ok:true)
EVIDENCE_PRODUCED=PARTIAL ({} carries nothing on the failure path)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY15; would map passed content-blind)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (false-success defect; EliteTools family)
RECOMMENDED_ACTION=WIRING-P2-015 extension (fail on empty-extract; isProviderFailure seam)

---

CAPABILITY_ID=TOOL-git_local_workflow
NAME=git_local_workflow (GitLocalWorkflowTool, GitLocalWorkflowTool.ts:67)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/GitLocalWorkflowTool.ts
IMPLEMENTATION=bounded local workflow on the session's imported project (global.joeProjects[sessionId].dir): branch from request (safeBranch), one docs note under docs/ (contained), git diff --check + staged checks, local commit, never pushes; capabilityMatchAny gate; required:['request']; permissions read/write/execute
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 3 legs 2x identical): empty-request honest; no-import honest pre-binding; positive -> ok:true with probe-side git proof (branch EXACTLY joe/fx-audit-16, tree clean, note exists, commit message exact) + pushed:false both runs; pre/post binding contrast proves sessionId reaches tool context (F108)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write+execute tier, no gate fired on these legs
INPUT_CONTRACT_VALID=YES (request enforced; branch/doc-path validators)
OUTPUT_CONTRACT_VALID=YES ({directory,branch,documentationPath,verificationCommand,commitSha,pushed,...})
EVIDENCE_PRODUCED=YES (branch + sha + logs)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (within probed scope; network-free by design)
RECOMMENDED_ACTION=none (clean story; git identity for commits inherits environment)

---

CAPABILITY_ID=TOOL-git_ops
NAME=git_ops (GitOpsTool, GitTools.ts:38)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/GitTools.ts
IMPLEMENTATION=arbitrary git operation via argv (runGitWithEnv -> runArgv, no shell re-parse); askpass token flow for push/fetch/pull/clone; smart recovery (upstream set, non-fast-forward rebase, remote set-url, auth translation); cwd raw or no-arg getActiveRoot(); required:['operation']; permissions execute/internet/read/write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-4 (behind github_pr/github_repo_manager/git_local_workflow on self-name goal); priority-listed; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 4 (only non-rank-1 trunk member)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 7 legs 2x identical): seeded status exact; invalid-op + missing-cwd + clone-noargs honest (clone fails pre-network); outside-cwd honored raw (UNCONTAINED PROVEN); default-cwd attribution CORRECTED 017/F121 to UNPROVEN (depth-3 ambiguity: ../../../ cannot distinguish session from default root; ambient mechanism predicts session root; marker re-probe outstanding); push -> approval_required/high pre-execution, zero side effects (F106)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=medium at status (autoSafe pass); high at push/commit (AUTO_APPROVE_ALL gate, proven pre-execution)
INPUT_CONTRACT_VALID=YES (operation regex-validated; args sanitized)
OUTPUT_CONTRACT_VALID=YES ({output} stdout-or-stderr)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (explicit-cwd uncontained; default-cwd attribution UNPROVEN per 017/F121 correction)
RECOMMENDED_ACTION=WIRING-P2-006 extension (reject outside cwd; decisive default-cwd marker re-probe outstanding)

---

CAPABILITY_ID=TOOL-github_actions
NAME=github_actions (GitHubActionsTool, GitHubActionsTool.ts:9)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/GitHubActionsTool.ts
IMPLEMENTATION=local workflow-file generator (4 templates; unknown type SILENTLY falls back to node-ci); saveWorkflow joins projectPath/.github/workflows/<type>.yml with NO containment and execute takes NO context; list_runs honestly refused; required:['workflowType','projectPath']; permissions write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 5 legs 2x identical): list-runs + missing-type honest; seeded node-ci byte-exact; bogus-type -> ok:true with node-ci CONTENT under the bogus name (SILENT SUBSTITUTION PROVEN); '../../traversal16' -> file lands OUTSIDE .github/workflows (TRAVERSAL PROVEN, contained to fixture); OS-temp projectPath written (UNCONTAINED PROVEN) (F103)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier, no gate fired
INPUT_CONTRACT_VALID=NO (workflowType unvalidated; projectPath uncontained)
OUTPUT_CONTRACT_VALID=PARTIAL (reports requested type even when substituted)
EVIDENCE_PRODUCED=YES (workflowPath + logs)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (traversal + substitution + containment defects)
RECOMMENDED_ACTION=WIRING-P1-006 (context + resolve + type whitelist)

---

CAPABILITY_ID=TOOL-github_pr
NAME=github_pr (GitHubPRTool, GitHubPRTool.ts:8)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/GitHubPRTool.ts
IMPLEMENTATION=GitHub PR API via https (create/list implemented; NO merge case though the schema enum promises it); token from input/env/user-secret, honest no-token error; required:['action','owner','repo']; permissions execute; sideEffects write (skew noted)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 2 legs 2x identical, zero network): no-token honest pre-network; action=merge + dummy token -> 'Unknown action: merge' (DEAD ENUM PROVEN pre-network, F105)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=execute tier, no gate fired on these legs
INPUT_CONTRACT_VALID=NO (enum promises merge, switch rejects it)
OUTPUT_CONTRACT_VALID=UNKNOWN (network paths unprobed by design)
EVIDENCE_PRODUCED=YES (honest errors + logs on probed legs)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (dead merge contract; API paths unprobed)
RECOMMENDED_ACTION=MISMATCH #4 3rd instance (implement merge or drop from enum; rides P2-002)

---

CAPABILITY_ID=TOOL-github_repo_manager
NAME=github_repo_manager (GitHubRepoManagerTool, GitHubRepoManagerTool.ts:75)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/GitHubRepoManagerTool.ts
IMPLEMENTATION=GitHub repo API (create/list/delete/analyze; push is NOT a tool case — ToolService rewrites push -> git_ops by design :547-550); token from input/env/user-secret; public-analyze without token; localized auth errors; required per action; permissions execute; sideEffects write (skew noted)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES (via ToolService redirect for push)
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 2 legs 2x identical, zero network): analyze-without-repo honest auth gate (tool's own message — redirect does NOT apply); push + dummy token -> 'start git_ops (orig=github_repo_manager)' + approval_required/high (REDIRECT PROVEN end-to-end, F105)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=push inherits git_ops+push high gate pre-execution
INPUT_CONTRACT_VALID=YES (with redirect: push never reaches the switch)
OUTPUT_CONTRACT_VALID=UNKNOWN (network paths unprobed by design)
EVIDENCE_PRODUCED=YES (honest errors + logs on probed legs)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (routing redirect must be cited; API paths unprobed)
RECOMMENDED_ACTION=REDIRECT note (not a defect): registry-vs-execution routing must cite the push->git_ops rewrite

---

CAPABILITY_ID=TOOL-import_project
NAME=import_project (ImportProjectTool, ImportProjectTool.ts:219)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ImportProjectTool.ts
IMPLEMENTATION=clone a GitHub URL (depth-1) OR open a local folder (resolveToolPath-anchored relatives; absolutes accepted raw), deterministic audit (package roots, key files, hygiene findings, safe-test-gated verification that never installs), register session active project + persist; required:['request']; permissions execute/write/internet
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split: exclusion is fast-path/rerank-pool only, same as files-trunk tools)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 4 legs 2x identical, zero network): no-URL -> ok:true guidance (no-op pass); missing relative -> honest no_such_path (relatives session-anchored); absolute OS-temp dir -> ok:true + full audit + registration (OUTSIDE ACCEPTED PROVEN); local fixture -> skipped_dependencies_missing with zero execution (safe-test allowlist works) (F104)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=no gate fired on these legs
INPUT_CONTRACT_VALID=PARTIAL (relatives contained; absolutes not)
OUTPUT_CONTRACT_VALID=YES ({message,dir,analysis,repositoryAudit})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16; no-url guidance maps passed = F88 constraint)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (absolute-path containment gap; clone path unprobed)
RECOMMENDED_ACTION=WIRING-P2-006 extension (contain absolutes to workspace)

---

CAPABILITY_ID=TOOL-repo_apply_patch
NAME=repo_apply_patch (RepoApplyPatchTool, RepoSelfCodingTools.ts:169)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/RepoSelfCodingTools.ts
IMPLEMENTATION=find/replace patch on Joe-repo-relative paths (assertSafeRelativePath: no absolutes, no escapes, .env blocked; dryRun DEFAULTS TRUE); rooted at getRepoRoot() (Joe checkout, not session); required:['path','find','replace']; permissions read/write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 4 legs 2x identical): dryrun preview byte-exact + file byte-PRESERVED; find-missing + .env honest; dryRun:false byte-APPLIED (F110; probe scratch created + removed)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=no gate fired
INPUT_CONTRACT_VALID=YES (path/find enforced; .env blocked)
OUTPUT_CONTRACT_VALID=YES ({path,dryRun,changed,preview})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16; dryrun-preview maps passed = F88 constraint)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (within probed scope; self-coding root is by design)
RECOMMENDED_ACTION=none (clean story)

---

CAPABILITY_ID=TOOL-repo_diff_summary
NAME=repo_diff_summary (RepoDiffSummaryTool, RepoSelfCodingTools.ts:252)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/RepoSelfCodingTools.ts
IMPLEMENTATION=git status + diff --stat of the Joe checkout via runSafeCommand; ok = both codes == 0 — ALWAYS FALSE because run() drops exitCode (MISMATCH #12); no error field on the false path; permissions read/execute
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 1 leg 2x identical): status/diffStat CORRECT content yet ok:false with NO error -> ToolService generic wrap (ALWAYS-FALSE PROVEN; P2-005 mechanism resolved, F102)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=no gate fired
INPUT_CONTRACT_VALID=YES (no inputs)
OUTPUT_CONTRACT_VALID=NO (ok is wrong on success; error missing)
EVIDENCE_PRODUCED=PARTIAL (status content correct; ok/error wrong)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16; live verdict failed-with-output = noisy fail-closed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (always-false ok defect)
RECOMMENDED_ACTION=MISMATCH #12 (run() exposes exitCode like runArgv, or tools use result.ok)

---

CAPABILITY_ID=TOOL-repo_read_file
NAME=repo_read_file (RepoReadFileTool, RepoSelfCodingTools.ts:98)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/RepoSelfCodingTools.ts
IMPLEMENTATION=UTF-8 read of Joe-repo-relative paths (assertSafeRelativePath: no absolutes, no escapes, .env blocked); rooted at getRepoRoot() (Joe checkout, not session); required:['path']; permissions read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 5 legs 2x identical): AGENTS.md bytes exact; missing/absolute/.env/escape all honest with exact codes (F110; note the .env error NAME says write even on reads)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier (risk low) -> passes default autoSafe
INPUT_CONTRACT_VALID=YES (all guards enforced)
OUTPUT_CONTRACT_VALID=YES ({path,content,bytes})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (within probed scope; self-coding root is by design)
RECOMMENDED_ACTION=none (clean story; .env error-name nit optional)

---

CAPABILITY_ID=TOOL-repo_run_command
NAME=repo_run_command (RepoRunCommandTool, RepoSelfCodingTools.ts:213)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/RepoSelfCodingTools.ts
IMPLEMENTATION=prefix-allowlisted QA commands (npm test/build/lint/typecheck, tsc, git diff/status/log) + blockedFragments; executed via executionEngine.run STRING path -> cmd.exe shell (metacharacters LIVE); ok = code == 0 — ALWAYS FALSE because run() drops exitCode (MISMATCH #12); required:['command']; permissions execute
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 5 legs 2x identical): git-status stdout correct yet ok:false (ALWAYS-FALSE PROVEN); 'rm -rf' -> firewall critical pre-tool (F106); '&& echo VCSSAFE16' CHAIN EXECUTED (marker in stdout); '> wiring-vcs-shellmark.txt' REDIRECT WROTE the repo-root file (SHELL PROVEN, fixture removed); cwd-escape honest (F101/F102)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=medium (auto-approved) unless destructive scan hits critical
INPUT_CONTRACT_VALID=NO (prefix gate admits shell metacharacters)
OUTPUT_CONTRACT_VALID=NO (ok always false; exitCode key present-but-undefined)
EVIDENCE_PRODUCED=PARTIAL (stdout/stderr correct; ok/exitCode wrong)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16; live verdict failed-with-output = noisy fail-closed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (shell-escape P1 + always-false-ok defects)
RECOMMENDED_ACTION=WIRING-P1-005 (argv-or-reject + risk re-tier) + MISMATCH #12 (exitCode)

---

CAPABILITY_ID=TOOL-repo_search
NAME=repo_search (RepoSearchTool, RepoSelfCodingTools.ts:126)
CATEGORY=tool/vcs-repo-trunk
SOURCE_FILES=api/src/modules/tools/definitions/RepoSelfCodingTools.ts
IMPLEMENTATION=substring search over Joe-repo files (safe ignores, 800-file walk cap, 100-match cap, 240-char previews); base = repo-relative safe path or repo root; rooted at getRepoRoot() (Joe checkout, not session); required:['query']; permissions read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_vcs.json, canonical, 3 legs 2x identical): seeded query count EXACTLY 1 (RepoSelfCodingTools.ts:214); empty-query honest; missing-base honest ENOENT naming the repo-rooted path (F110)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read tier -> passes default autoSafe
INPUT_CONTRACT_VALID=YES (query enforced; base contained)
OUTPUT_CONTRACT_VALID=YES ({query,matches,count})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY16)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (within probed scope; self-coding root is by design)
RECOMMENDED_ACTION=none (clean story)

---

CAPABILITY_ID=TOOL-ai_write_file
NAME=ai_write_file (AIGeneratorTool, AIGeneratorTool.ts:632)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AIGeneratorTool.ts
IMPLEMENTATION=model-authored single-file writer (repo context pack, runtime/import/artifact contracts, esbuild syntax gate); path+description both required with honest no-model-called error; traversal reaches the MODEL (normalization is a no-op without projectRoot context; containment only downstream at write); required:['path','description']; permissions write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split: exclusion is fast-path/rerank-pool only)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 4 legs 2x identical): {} + path-only -> honest no-model-called (model never touched); full offline -> honest no-provider error; '../../evil' traversal -> MODEL error not path error (model attempted; write-time containment never reached) (F119)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier, medium (auto-approved); model legs fail on provider, not gate
INPUT_CONTRACT_VALID=PARTIAL (presence enforced; SHAPE not validated pre-model)
OUTPUT_CONTRACT_VALID=YES ({path,bytes,summary} on success; honest errors)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; needs-both maps failed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (model-before-containment ordering)
RECOMMENDED_ACTION=WIRING-P2-006 extension (validate path shape before the model call) + live write-time containment probe (needs model-present/mocked generation)

---

CAPABILITY_ID=TOOL-api_project
NAME=api_project (ApiProjectTool, ApiProjectTool.ts:2417)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ApiProjectTool.ts
IMPLEMENTATION=Express + zero-dep DB scaffolder with live boot proof (skipInstall disables npm+boot); brand/resource/column readers + catalogue seeds; project root = input.root RAW or session root (NO resolve/contain); skip path carries honest proven:false/installed:false/authProven:false; required:['request']; permissions execute/write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 3 legs 2x identical): {} -> no_request honest; skipInstall positive -> full 7-file scaffold in SESSION root, ok:true with proven:false (honest unproven); root=OUTSIDE fixture -> full scaffold OUTSIDE the session (UNCONTAINED INPUT.ROOT PROVEN, fixture removed) (F117/F118)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=execute+write, medium (auto-approved); no approval hit on scaffold legs
INPUT_CONTRACT_VALID=PARTIAL (request enforced; root uncontained)
OUTPUT_CONTRACT_VALID=YES (message/path/dir/resource/flags; fixture credentials scrubbed in evidence)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; ok-with-unproven-flags = F88 constraint)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (uncontained input.root; full install+boot legs embargoed)
RECOMMENDED_ACTION=WIRING-P1-007 (session-bind input.root; re-audit projectRoot allow-rule)

---

CAPABILITY_ID=TOOL-auth_builder
NAME=auth_builder (AuthBuilderTool, AuthBuilderTool.ts:17)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/AuthBuilderTool.ts
IMPLEMENTATION=template auth-module generator (jwt/oauth/session/full branches + optional RBAC + config/index); outputDir required with honest error (post-audit fix); schema type enum NEVER validated (out-of-enum silently degrades); relatives resolve to data/builds/workspace-default (sandbox-forced, session-agnostic), in-project absolutes honored, true outsiders refused; required:['type','outputDir']; permissions write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 5 legs 2x identical): {} -> honest outputDir error; 'saml' -> ok:true "generated" with 2-file stub (SILENT DEGRADED SUCCESS, P2-004 14th); in-project absolute -> 4 files written (ACCEPTED); system-temp absolute -> honest refusal, nothing written (THROW PATH PROVEN); jwt positive -> 3 files in builds dir (F113/F114)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier, medium (auto-approved)
INPUT_CONTRACT_VALID=NO (enum decorative; root session-agnostic)
OUTPUT_CONTRACT_VALID=PARTIAL ({files,instructions} correct; success overstated for unknown types)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; refused maps failed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (silent enum acceptance + session-agnostic root)
RECOMMENDED_ACTION=WIRING-P2-004 extension (validate type enum) + WIRING-P2-006 extension (session-bind output root)

---

CAPABILITY_ID=TOOL-enterprise_platform_foundation
NAME=enterprise_platform_foundation (EnterprisePlatformFoundationTool, EnterprisePlatformFoundationTool.ts:25)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/EnterprisePlatformFoundationTool.ts
IMPLEMENTATION=deterministic enterprise-foundation writer (34 template files: arch/contracts/services/CI/infra) + bounded local python verification (compileall + unittest + JSON schema via runPython helper); root = context.workspaceRoot or EXPLORER root (session-agnostic default); required:['request']; permissions read/write/execute
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 2 legs 2x identical): {} -> honest request-required; workspaceRoot-pinned positive -> 34 files + python verified:true acceptanceRan:true in the FIXTURE (context root honored end-to-end) (F123)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read/write/execute, medium (auto-approved); python verify runs in-process bounded
INPUT_CONTRACT_VALID=YES (request enforced)
OUTPUT_CONTRACT_VALID=YES ({projectPath,writtenFiles,verified,verification,acceptanceRan,verificationFailed,deliveryScope})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; verified/failed map passed/failed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (within probed scope; default explorer-root landing is code-cited, live-unprobed by design)
RECOMMENDED_ACTION=none (clean story; default-root landing noted as live-unprobed)

---

CAPABILITY_ID=TOOL-mobile_builder
NAME=mobile_builder (MobileBuilderTool, MobileBuilderTool.ts:17)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/MobileBuilderTool.ts
IMPLEMENTATION=Expo template writer (init/add-screen/add-navigation/add-state write files; build/run return command STRINGS only, never exec); init outputDir defaults to process.cwd() (NEVER probed live — code-cited hazard); NO context param; required:['action']; permissions write/execute (execute overstates: no exec path found)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 5 legs 2x identical): {} + bogus action -> honest Unknown action; contained init -> package.json/App.tsx/screens (verified + removed); build/run -> commands-only outputs, zero side effects (F123)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write+execute, medium (auto-approved)
INPUT_CONTRACT_VALID=PARTIAL (action dispatch honest; outputDir default unsafe)
OUTPUT_CONTRACT_VALID=YES ({success,projectPath/files/commands})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; unknown-action maps failed, build-commands maps passed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (default-cwd hazard unprobed-by-design; permission overstates)
RECOMMENDED_ACTION=WIRING-P2-006 extension (require outputDir or session-bind the default) + demand-side review of the execute permission

---

CAPABILITY_ID=TOOL-orion_business_foundation
NAME=orion_business_foundation (OrionBusinessFoundationTool, OrionBusinessFoundationTool.ts:24)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/OrionBusinessFoundationTool.ts
IMPLEMENTATION=deterministic ORION phase-one writer (21 template files: tenant core/governance/contracts/UI/infra) + bounded local python acceptance (unittest + event-schema via runPython helper); root = context.workspaceRoot or EXPLORER root (session-agnostic default); required:['request']; permissions read/write/execute
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 2 legs 2x identical): {} -> honest request-required; workspaceRoot-pinned positive -> 21 files + python verified:true acceptanceRan:true in the FIXTURE (context root honored end-to-end) (F123)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read/write/execute, medium (auto-approved); python verify runs in-process bounded
INPUT_CONTRACT_VALID=YES (request enforced)
OUTPUT_CONTRACT_VALID=YES ({projectPath,writtenFiles,verified,verification,deliveryScope})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; verified/failed map passed/failed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (within probed scope; default explorer-root landing is code-cited, live-unprobed by design)
RECOMMENDED_ACTION=none (clean story; default-root landing noted as live-unprobed)

---

CAPABILITY_ID=TOOL-progressive_generator
NAME=progressive_generator (ProgressiveGeneratorTool, ProgressiveGeneratorTool.ts:36)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ProgressiveGeneratorTool.ts
IMPLEMENTATION=in-memory-manifest batched generator (init/status pure; generateBatch writes static files + PROMPT: files via callLLM); PROMPT: failure path writes the RESOLVED FAILURE PROSE as source with ok:true (try/catch dead because routeToModel resolves instead of throwing — MISMATCH #9); batch baseDir raw or cwd+name; required:['action']; permissions read/write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json + prog_batch3 logs, canonical, 8+4 legs 2x identical): empties/init-gating/batch-lookup all honest; batches 1-2 static green (4+3 files); batch-3 (5 PROMPT: files) -> ok:true with provider-failure prose PERSISTED AS Component1.tsx, byte-identical both runs (FALSE ARTIFACT PROVEN, #9 5th instance) (F116)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=read/write, medium (auto-approved)
INPUT_CONTRACT_VALID=YES (action/config/batch/project lookups all honest)
OUTPUT_CONTRACT_VALID=NO (ok:true while content is failure prose)
EVIDENCE_PRODUCED=PARTIAL (progress/message correct; file content false)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; progressive-batch maps incomplete)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (persistent false-artifact defect)
RECOMMENDED_ACTION=MISMATCH #9 5th instance (detect provider-failure prose via isProviderFailure before writing; fail the batch honestly) + P2-006 note (baseDir raw)

---

CAPABILITY_ID=TOOL-react_project
NAME=react_project (ReactProjectTool, ReactProjectTool.ts:4271)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ReactProjectTool.ts
IMPLEMENTATION=Vite+React scaffolder with install+build proof (skipInstall disables); root = input.root RAW or session root (NO resolve/contain — twin of api_project, live-unprobed to bound cost); explicit scaffoldDir/resumeExisting handoff; skip path carries honest acceptance.accepted:false; required:['request']; permissions execute/write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 2 legs 2x identical): {} -> no_request honest; skipInstall positive -> full 21-file scaffold in SESSION root, ok:true with acceptance.accepted:false + unprovable-criterion note (honest unproven, F118)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=execute+write, medium (auto-approved)
INPUT_CONTRACT_VALID=PARTIAL (request enforced; root/scaffoldDir uncontained per code)
OUTPUT_CONTRACT_VALID=YES (message/acceptance/path/delivery/verificationFailed; honest flags)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; ok-with-accepted:false = F88 constraint)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (uncontained input.root code-cited; full install+build legs embargoed)
RECOMMENDED_ACTION=WIRING-P1-007 (session-bind input.root/scaffoldDir — shared with api_project)

---

CAPABILITY_ID=TOOL-scaffold_full_stack
NAME=scaffold_full_stack (ScaffoldFullStackTool, WebDevelopmentTools.ts:626)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/WebDevelopmentTools.ts + api/src/system/Builder.ts
IMPLEMENTATION=3-tier template scaffolder via Builder.scaffold (file writes only, no exec); NO context param (6th no-context instance); name silently defaults to my-app; type enum never validated; Builder DELETES colliding targets by default (overwrite !== false -> rm -rf) and defaults baseDir to repo data/projects; required:['name']; permissions write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split); priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 3 legs 2x identical, all contained): saas positive green; {baseDir}-only built 'my-app' (SILENT NAME DEFAULT); 'cobol' type produced identical output modulo path (ENUM DECORATIVE) (F115)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier, medium (auto-approved)
INPUT_CONTRACT_VALID=NO (required name defaulted; enum unvalidated)
OUTPUT_CONTRACT_VALID=YES ({path,features,aestheticMode,language,port,overwrite})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (silent defaults + default-destructive overwrite + session-agnostic default base)
RECOMMENDED_ACTION=WIRING-P2-004 extension (enforce name/type) + WIRING-P2-006 extension (flip overwrite default to false; session-bind default base) + thread context

---

CAPABILITY_ID=TOOL-scaffold_project
NAME=scaffold_project (ScaffoldProjectTool, SystemTools.ts:1361)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=structure-object file writer (per-key safePath + react-normalize + greenfield-reset + joeProjects registration); per-key check enforces only the 4-root rule, NOT base containment; baseDir '../../..' reaches the REPO ROOT; required:['structure']; permissions write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split); priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 4 legs 2x identical): positive green (files+dir verified); '../../evil' key -> ok:true with BOTH keys "created", file in SESSION ROOT while projectDir names scaf2 (BASE ESCAPE + RECEIPT LIE); baseDir '../../..' -> a.js WRITTEN AT REPO ROOT ok:true (probe-removed); {} -> ok:true no-op (F111/F112)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier, medium (auto-approved)
INPUT_CONTRACT_VALID=NO (base + keys escape the declared scope)
OUTPUT_CONTRACT_VALID=NO (created[]/projectDir misreport the escape)
EVIDENCE_PRODUCED=PARTIAL (positive receipts correct; escape receipts false)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; created maps passed, partial maps failed; empty no-op = F88 constraint)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (base-escape + repo-root write defects)
RECOMMENDED_ACTION=WIRING-P1-007 (session-bind baseDir + per-key base containment; receipt must report resolved paths)

---

CAPABILITY_ID=TOOL-template_manager
NAME=template_manager (TemplateManagerTool, TemplateManagerTool.ts:8)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/TemplateManagerTool.ts
IMPLEMENTATION=pure template renderer (list + 5 template types, projectName-substituted file maps; no writes, no model); source declares permissions []/sideEffects [] but registers ['write']/[] (registry defaulting); required:['templateType']; registered permissions write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; not router-excluded
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 4 legs 2x identical): list green; react-app byte-rendered with substituted name; bogus + {} -> honest 'not found' errors (F123)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier (registry-defaulted), medium (auto-approved)
INPUT_CONTRACT_VALID=YES (unknown types honestly rejected)
OUTPUT_CONTRACT_VALID=YES ({name,type,files} / {templates})
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; ready maps passed, missing maps failed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED (clean story; registry/source perm skew is known defaulting)
RECOMMENDED_ACTION=none (clean story)

---

CAPABILITY_ID=TOOL-web_page_builder
NAME=web_page_builder (WebPageBuilderTool, WebPageBuilderTool.ts:179)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/WebPageBuilderTool.ts
IMPLEMENTATION=model-driven standalone-page builder (section writers + audits + preview via ARTIFACT_DIR; heavy routeToModel use); input.filename DEAD (never read — output always joe-<sessionKey>.html); source declares permissions []/sideEffects []/rate 0 (registers write/[]/30 via defaulting); required:['request']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 2 legs 2x identical): {} -> no_request honest; offline positive -> honest no-provider error with ZERO artifact writes (FAIL-CLOSED PROVEN); filename-dead is STATIC (no input.filename read anywhere; model-present build unprobed) (F120)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=write tier (registry-defaulted), medium (auto-approved)
INPUT_CONTRACT_VALID=NO (filename promised but dead)
OUTPUT_CONTRACT_VALID=YES ({message,url,previewUrl,path} on success; honest errors)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; no-request maps failed)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (dead filename input; model-present path unprobed)
RECOMMENDED_ACTION=MISMATCH #4 4th instance (implement filename or drop from schema; rides P2-002) + sideEffects skew note (writes with [])

---

CAPABILITY_ID=TOOL-website_full_pipeline
NAME=website_full_pipeline (WebsiteFullPipelineTool, WebDevelopmentTools.ts:35)
CATEGORY=tool/build-generate-trunk
SOURCE_FILES=api/src/modules/tools/definitions/WebDevelopmentTools.ts
IMPLEMENTATION=nested-execution mega-pipeline (nested scaffold + project_detect + npm install tiers + quality/security/browser phases); MUTATES the workspace root via setActiveRoot(projectPath) (:193); name honestly required ({} refuses before any work); required:['name']; permissions write/execute
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-2 (only non-rank-1 trunk member) BUT router-excluded (flag/catalog split); priority-listed
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 2 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=PARTIAL (empty leg live; named legs embargoed by design)
EXECUTOR_EVIDENCE=LIVE (trunk_build.json, canonical, 1 leg 2x identical): {} -> honest needs-a-name error, nothing built. Named behavior + setActiveRoot mutation UNPROBED (embargo: nested ToolService execution + npm + workspace mutation); type defaults ecommerce unvalidated (code-cited)
PERMISSION_REACHABLE=YES (empty leg passes medium auto-approved)
PERMISSION_EVIDENCE=write+execute, medium at {} (input-tiered higher on real builds per sweep3 pattern)
INPUT_CONTRACT_VALID=PARTIAL (name enforced; type defaulted; pipeline args unprobed)
OUTPUT_CONTRACT_VALID=UNKNOWN (no named leg executed)
EVIDENCE_PRODUCED=PARTIAL (honest refusal only)
VERIFICATION_COMPATIBLE=N/A (never a checker — static §VERIFY17; honest-empty maps failed)
CANONICAL_PATH_CONNECTED=YES (refusal path proven; full path unprobed)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (named pipeline + workspace mutation unprobed)
RECOMMENDED_ACTION=dedicated safety probe (bounded named run + setActiveRoot scoping review) before any pipeline wiring claim

---

CAPABILITY_ID=TOOL-deploy_pages
NAME=deploy_pages (DeployPagesTool, DeployPagesTool.ts:73)
CATEGORY=tool/runtime-services-trunk
SOURCE_FILES=api/src/modules/tools/definitions/DeployPagesTool.ts
IMPLEMENTATION=GitHub-Pages publisher (build + gh-pages push + enable; static-only honesty gate for backends); gates in order: cwd-exists, token (needsConnect), repo (needsRepo), backend-detect; required:[] (all optional); permissions execute+internet, 4/min
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=PARTIAL (gates live; real deploy embargoed by design)
EXECUTOR_EVIDENCE=LIVE (trunk_runtime.json 3 legs + pages_approved 4 legs, all 2x identical): default-deny -> approval_required/high (deploy_* tier); approved harness -> missing-cwd path error, empty/backend/explicit-repo all needsConnect (token gate precedes repo precedes backend-honesty) (F131)
PERMISSION_REACHABLE=YES (high tier; approval-gated by default)
PERMISSION_EVIDENCE=execute+internet, high (ToolService deploy_* rule); approved harness executes gates
INPUT_CONTRACT_VALID=YES (cwd/repo/buildCommand honored at gates; buildCommand path unprobed)
OUTPUT_CONTRACT_VALID=PARTIAL ({needsConnect/needsRepo} honest; {url,deployed} unprobed -- real deploy embargoed)
EVIDENCE_PRODUCED=YES (gate receipts)
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY18; needs-connect maps failed)
CANONICAL_PATH_CONNECTED=YES (gate path proven; publish path unprobed)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (gates proven; real publish + backend-honesty outcome unprobed)
RECOMMENDED_ACTION=none (gates honest); design note: backend-honesty knowledge requires auth (F131)

---

CAPABILITY_ID=TOOL-deploy_project
NAME=deploy_project (DeployProjectTool, DeployProjectTool.ts:10)
CATEGORY=tool/runtime-services-trunk
SOURCE_FILES=api/src/modules/tools/definitions/DeployProjectTool.ts
IMPLEMENTATION=4-action deployer (build_static/start_server/expose_port/package); projectPath contained via resolveToolPath; actions execute raw shell (buildCommand/startCommand by design); start_server detached + pidfile; expose_port via localtunnel; required:['action','projectPath']; priority-listed
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-2 (behind deploy_pages on self-name) BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 2 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=PARTIAL (3/4 actions live; expose_port embargoed by design)
EXECUTOR_EVIDENCE=LIVE (trunk_runtime.json, canonical, 7 legs 2x identical): empty/missing/traversal/bogus-action all honest ok:false (traversal resolves-then-not-found, contained); package -> raw stat ENOENT, no zip on Windows (F127); build_static TRUE positive (marker verified, dist detected); start_server -> ok:true/running + URL for a DEAD port, no health check (F125)
PERMISSION_REACHABLE=YES (medium for build/start/package auto-approved; high for expose_port)
PERMISSION_EVIDENCE=execute+write+internet declared; ToolService input-tiered (expose_port high, rest medium)
INPUT_CONTRACT_VALID=NO (port not validated: `lt --port ${port}` shell shape, F126; action enum enforced only by Unknown-action branch)
OUTPUT_CONTRACT_VALID=PARTIAL (built/packaged honest; running hollow; exposed unprobed)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY18; built/running/exposed map incomplete = non-checker constraints)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (hollow running receipt; injection-shaped port; expose_port unprobed)
RECOMMENDED_ACTION=P1-009 (numeric port guard + shell-interpolation audit) + P2-004 18th (running health check or honest unproven) + P2-009 3rd (package Windows path) + pidfile stop path or honest unsupported-stop

---

CAPABILITY_ID=TOOL-dev_server_start
NAME=dev_server_start (DevServerTool, WebDevelopmentTools.ts:435)
CATEGORY=tool/runtime-services-trunk
SOURCE_FILES=api/src/modules/tools/definitions/WebDevelopmentTools.ts
IMPLEMENTATION=dev-server launcher (monorepo/nested root detection; vite/serve/npx commands; 0.0.0.0 bind; readiness wait up to 30s; returns ok:true + serverReady flag + URLs regardless); required:['cwd'] (missing-cwd honestly refuses -- fixed earlier bug)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1; NOT router-excluded (only non-excluded trunk member)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog)
EXECUTOR_REACHABLE=PARTIAL (refusal legs live; full start embargoed by design)
EXECUTOR_EVIDENCE=LIVE (trunk_runtime.json, canonical, 2 legs 2x identical): {} -> honest needs-cwd; missing-cwd -> UNCAUGHT writeFileSync throw as internal_exception with stack (F128), landing in data/builds (sandbox-force). Full start code-cited: 0.0.0.0 bind, npx --yes download, vite.config.js side-effect write, ok:true/serverReady:false shape (F129)
PERMISSION_REACHABLE=YES (medium auto-approved)
PERMISSION_EVIDENCE=execute tier, medium
INPUT_CONTRACT_VALID=PARTIAL (cwd required+honored; port coerced via Number() -- safe; command override unprobed)
OUTPUT_CONTRACT_VALID=PARTIAL (refusals honest; started-unready shape maps passed = MISMATCH #13)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY18; started-unready maps passed = #13)
CANONICAL_PATH_CONNECTED=YES (refusal path proven; serve path unprobed)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (exception shape; full serve unprobed; bind/download/write review open)
RECOMMENDED_ACTION=P2-022 (guard config write; honest bad-input shape) + MISMATCH #13 (verdict must honor serverReady:false) + bind/download review batch

---

CAPABILITY_ID=TOOL-project_run
NAME=project_run (ProjectRunTool, ProjectRunTool.ts:1233)
CATEGORY=tool/runtime-services-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ProjectRunTool.ts
IMPLEMENTATION=live preview runner (session/packaged/discovery resolution; no-guess guards; argv launcher without second shell; PORT/HOST env; readiness probe; static-bundle fallbacks; recorded-live adoption with PID/cwd gate; RUNNING map one-server-per-key); required:[]; live-gate-only CHECKER (ledger :740-747)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_runtime.json, canonical, 6 legs 2x identical): empty/named-miss/missing-cwd/no-marker all honest no-guess ok:false; detected (node-entry auto, port 4300) + override (node server.js, forced 45982) -> ready:true with HTTP-200 token verified (F132). npx-serve/tsx detect branches + adoption/reconcile paths live-unprobed (embargo/read-only)
PERMISSION_REACHABLE=YES (medium auto-approved)
PERMISSION_EVIDENCE=execute tier, medium
INPUT_CONTRACT_VALID=YES (cwd/command/port/projectQuery honored; port coerced; quoted-query assertion enforced)
OUTPUT_CONTRACT_VALID=YES ({url,previewUrl,port,ready,pid,...} verified live; ready:true only after real HTTP answer)
EVIDENCE_PRODUCED=YES (live URL receipt)
VERIFICATION_COMPATIBLE=YES (live-gate-only checker -- static VERIFY18; receipt L5-PROVEN by run.detected/run.override; lifecycle bounded by F124)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED at run-receipt level (adoption/reconcile/npx branches unprobed; stop path defective -- F124)
RECOMMENDED_ACTION=P1-008 (stop verification -- the run half is proven, the stop half is not) + adoption-path live proof as follow-up

---

CAPABILITY_ID=TOOL-project_stop
NAME=project_stop (ProjectStopTool, ProjectRunTool.ts:1876)
CATEGORY=tool/runtime-services-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ProjectRunTool.ts
IMPLEMENTATION=live-server stopper (runKey = workspaceId||sessionId; RUNNING map lookup; killTree via taskkill /F /T on Windows; record deleted; stopped:true/false); required:[] (no inputs)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 BUT router-excluded (flag/catalog split)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1 (catalog; router-side enforcement unprobed)
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_runtime.json, canonical, 5 legs 2x identical): idle/twice/final -> stopped:false idempotent (honest); after-static/after-override -> stopped:true on the SUCCESS log branch while the servers answer HTTP 200 (F124). Isolation: gateway taskkill returns {success:true,data:{ok:false,exitCode:1}} ignored by killTree; record deleted so retry is impossible. Observed failure partly sandbox-shaped (direct-taskkill control access-denied); code defects env-independent
PERMISSION_REACHABLE=YES (medium auto-approved)
PERMISSION_EVIDENCE=execute tier, medium
INPUT_CONTRACT_VALID=YES (no inputs; key from context)
OUTPUT_CONTRACT_VALID=NO (stopped:true does not imply dead -- unchecked kill + delete-on-failure + no liveness verify)
EVIDENCE_PRODUCED=PARTIAL (receipt claims more than it proves)
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY18; stop shapes map passed on ok:true)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (idle path honest; kill path false-receipt)
RECOMMENDED_ACTION=P1-008 (check kill result + verify death before stopped:true + keep record on failure + binary-independent kill)

---

CAPABILITY_ID=TOOL-shell_execute
NAME=shell_execute (ShellExecuteTool, SystemTools.ts:1481)
CATEGORY=tool/shell-terminal-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=local shell via handleShellCommand (cmd.exe, shell:true) + persistent CWD state file + background detached launches + visible-terminal paint + redactCmd; required:['command']; serverId remote path exists (commandRouter)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_shell.json runA/B 25/25 identical + shell_cwd.json 5/5 2x, canonical): echo ok (token in stdout); bg create/reuse/status/reap full lifecycle; BUT every local execution ran in C:\Windows while the receipt claims the session cwd (pwd.node stdout=C:\Windows vs receipt cwd=session dir; cmd.exe 'UNC paths are not supported. Defaulting to Windows directory' on the \\?\ cwd) (F135). Plain-D:\ cwd spelling is REJECTED as outside-workspace under a \\?\ root (F137) -- no working cwd spelling exists. Firewall preempts nocmd/unknown-binary (high) and sudo-bearing commands incl. `echo sudo` (critical) before tool code runs (F140)
PERMISSION_REACHABLE=YES (execute tier; medium default; high/critical inputs gated)
PERMISSION_EVIDENCE=firewall approval_required legs (nocmd/missingbin high; sudo critical; bare cd high)
INPUT_CONTRACT_VALID=PARTIAL (cwd accepted-but-unhonored under \\?\ root; missing cwd yields spawn-ENOENT blaming cmd.exe, F138)
OUTPUT_CONTRACT_VALID=NO (exitCode normalized to 0/1 at SystemTools.ts -- real codes destroyed, F136; cwd field asserts an unhonored directory, F135)
EVIDENCE_PRODUCED=PARTIAL (stdout/stderr real; exit code + cwd unreliable)
VERIFICATION_COMPATIBLE=PARTIAL (never a checker -- static VERIFY19; success/failed shapes map sanely; dryRun ok:true maps PASSED -- MISMATCH #14, F139)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (executes + gates correctly; cwd + exit-code + dryrun-mapping defects)
RECOMMENDED_ACTION=P1-010 (extended-prefix normalization at path boundary + spawn cwd) + P2-024 (preserve real exit codes) + MISMATCH #14 batch (dryRun-blind verdict)

---

CAPABILITY_ID=TOOL-shell_check_status
NAME=shell_check_status (ShellStatusTool, SystemTools.ts:1719)
CATEGORY=tool/shell-terminal-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=background-process liveness via process.kill(pid,0) over the module-local backgroundProcesses map; deletes entry once dead; required:['id']; declares NO permissions (defaulted to read at boot)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163 (revived by earlier audit fix -- now verified reachable)
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_shell.json 2x): running:true with pid+uptime for live bg; honest 'Process not found' for unknown id; running:false after natural sleeper exit (reap path works, no leak)
PERMISSION_REACHABLE=YES (read default)
PERMISSION_EVIDENCE=permission-defaulted at boot (21-family)
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({running,pid,command,uptime} truthful in all legs)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY19)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED
RECOMMENDED_ACTION=none (companion: P1-010/P2-024 owner should confirm bg pid/cwd attribution stays valid after cwd normalization)

---

CAPABILITY_ID=TOOL-npm_manager
NAME=npm_manager (NpmManagerTool, SystemTools.ts:1189)
CATEGORY=tool/shell-terminal-trunk
SOURCE_FILES=api/src/modules/tools/definitions/SystemTools.ts
IMPLEMENTATION=npm argv runner via handleShellCommand with no-package.json refusal gate, manifest reconcile, e-target recovery, legacy-peer-deps fallback; required:['command']; permissions execute+write+internet
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163 (revived by earlier audit fix -- now verified reachable)
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_shell.json 2x, no registry network): missing_command honest; install into non-package dir refused with npm_install_target_is_not_a_package (npm-climbs guard HOLDS); --version executes real npm -> 11.16.0 on Windows. Registry install legs embargoed (network)
PERMISSION_REACHABLE=YES (medium default)
PERMISSION_EVIDENCE=executed without approval under default autoSafe for probed inputs
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES for probed shapes ({output}/{logs} + refusal shapes)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY19)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED for probed surface (registry-install behavior UNKNOWN by embargo)
RECOMMENDED_ACTION=none now; registry-install + manifest-reconcile paths need a network-allowed follow-up before FULLY_WIRED can cover installs

---

CAPABILITY_ID=TOOL-terminal_manager
NAME=terminal_manager (TerminalManagerTool, TaskInteractionTools.ts:50)
CATEGORY=tool/shell-terminal-trunk
SOURCE_FILES=api/src/modules/tools/definitions/TaskInteractionTools.ts (+ terminalKernel)
IMPLEMENTATION=session-scoped pty manager (id=terminal:<sessionId>; ONE WORLD cwd=session root; owner registration); actions create/read/write/kill/list/resize; required:['action']
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_shell.json 2x): create real pty (pid, NOT fallback) -> list shows it -> write echo -> read history CONTAINS token (write→read EFFECT proven, real PowerShell pty) -> kill -> read-after-kill honest 'Terminal not found'. Terminal CWD is the session root (ONE WORLD holds)
PERMISSION_REACHABLE=YES (medium default)
PERMISSION_EVIDENCE=executed without approval under default autoSafe
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES
EVIDENCE_PRODUCED=YES (history carries real pty output incl. escape frames)
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY19)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED for probed surface (interactive shells beyond echo UNKNOWN)
RECOMMENDED_ACTION=none now; interactive-use + multi-session isolation need a follow-up before broader claims

---

CAPABILITY_ID=TOOL-db_schema_migrator
NAME=db_schema_migrator (DbSchemaMigratorTool, DatabaseEnterpriseTools.ts:106)
CATEGORY=tool/database-data-trunk
SOURCE_FILES=api/src/modules/tools/definitions/DatabaseEnterpriseTools.ts
IMPLEMENTATION=sqlite executor (node:sqlite, explicit schemaPath+databasePath, migrate/push/reset/status) + prisma shell fallback (npx, unprobed); .sql suffix overrides stale prisma default; required:['action']; permissions execute+read
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; priority-listed
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_db.json 2x, sqlite only): migrate applies schema (rowcheck 2 rows after 2 legs); status lists tables; engine:prisma+.sql correctly routes to sqlite; empty/missing/bad-action all honest errors. Works under \\?\ roots (sqlite immune where cmd.exe is not). reset/discovery/no-path-status/prisma legs embargoed (stray-write + network reasons, code-cited)
PERMISSION_REACHABLE=YES (medium default)
PERMISSION_EVIDENCE=executed without approval under default autoSafe for probed inputs
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES for probed shapes (status nests a JSON string inside output.output -- parseable, not hollow)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY20)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED for probed sqlite surface (prisma/discovery/reset UNKNOWN by embargo)
RECOMMENDED_ACTION=none now; prisma + discovery + reset need owned follow-ups before broader claims

---

CAPABILITY_ID=TOOL-json_query
NAME=json_query (JsonQueryTool, ContentTools.ts:122)
CATEGORY=tool/database-data-trunk
SOURCE_FILES=api/src/modules/tools/definitions/ContentTools.ts
IMPLEMENTATION=dot-notation lookup over inline JSON (no filesystem/DB); required:['json','path']; permissions defaulted []->read at boot
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_db.json 2x): deep/array lookups return values; missing json -> 'json required'; BUT missing-path returns ok:true + output:{} (value:undefined vanishes in JSON -- F143, MISMATCH #15); empty path returns the whole doc (observed)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=executed without approval (boot-defaulted read)
INPUT_CONTRACT_VALID=PARTIAL (nodata guarded; missing-path shape lossy)
OUTPUT_CONTRACT_VALID=NO for missing-path (receipt loses the answer; verdict maps PASSED)
EVIDENCE_PRODUCED=PARTIAL (present-value legs yes; missing-path legs carry no answer)
VERIFICATION_COMPATIBLE=NO (missing-value-ok maps passed -- MISMATCH #15)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (F143 receipt loss + verdict mapping)
RECOMMENDED_ACTION=WIRING-P2-025: explicit found flag + check-fails mapping (proposed, unactioned)

---

CAPABILITY_ID=TOOL-large_data_seeder
NAME=large_data_seeder (LargeDataSeederTool, DatabaseEnterpriseTools.ts:224)
CATEGORY=tool/database-data-trunk
SOURCE_FILES=api/src/modules/tools/definitions/DatabaseEnterpriseTools.ts
IMPLEMENTATION=CSV/JSON row generator (cap 1M) via resolveToolPath sandbox:true WITHOUT workspaceId; required:['rows','headers','outputPath']; permissions write
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_db.json 2x + readback): csv/json small writes verified byte-exact; absolute-outside escape REFUSED (no escape file); missing outputPath earns a sentence; BUT outputs land in session-agnostic data/builds/workspace-default, NOT the session dir (F146, P2-006 6th instance); rows:0 generates 1000 rows (falsy-default quirk, F145)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=executed without approval under default autoSafe
INPUT_CONTRACT_VALID=PARTIAL (rows:0 surprise; NaN/negative code-cited)
OUTPUT_CONTRACT_VALID=YES ({fileSize,path} + refusal shapes)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY20)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (session-agnostic landing F146 + rows:0 contract F145)
RECOMMENDED_ACTION=WIRING-P2-027 (rows:0) + P2-006 extension (session context) -- proposed, unactioned

---

CAPABILITY_ID=TOOL-orders_read
NAME=orders_read (OrdersReadTool, OrdersReadTool.ts:47)
CATEGORY=tool/database-data-trunk
SOURCE_FILES=api/src/modules/tools/definitions/OrdersReadTool.ts
IMPLEMENTATION=disk-direct session-API order reader (node:sqlite read-only data.db, else data.json twin; latest-first, cap 200, shows 10); session via (global).joeProjects[sessionKey]; required:[]; permissions read; ROUTER_EXCLUDED=true
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163 (createTool at registry.ts:307)
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1 (exclusion bites at router, not selection -- F148)
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_db.json 2x, fixture dirs + restored global): no-entry/nodb/empty guidance all honest; JSON lists 2 latest-first with token; SQLite lists 1 with (SQLite) source label + token
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=executed without approval under default autoSafe
INPUT_CONTRACT_VALID=YES
OUTPUT_CONTRACT_VALID=YES ({message,orders,total} + guidance shapes)
EVIDENCE_PRODUCED=YES
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY20)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=FULLY_WIRED for probed surface (cross-session isolation unprobed; phone-PII echo by design; session-spoofing overlap with owner-gate noted)
RECOMMENDED_ACTION=none now

---

CAPABILITY_ID=TOOL-query_datasource
NAME=query_datasource (DatasourceTool, DatasourceTool.ts:12)
CATEGORY=tool/database-data-trunk
SOURCE_FILES=api/src/modules/tools/definitions/DatasourceTool.ts
IMPLEMENTATION=unified free-API client, 8 sources (weather/exchange/ip_geo/random_fact/country/github_user/npm_package/dns_lookup), raw fetch per source; required:['source']; permissions internet; rateLimit 20
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163; priority-listed
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=PARTIAL
EXECUTOR_EVIDENCE=LIVE unknown-source leg only (trunk_db.json 2x): honest available-sources error, no fetch; gateway did NOT preempt (tool error, not approval_required). All 8 real sources embargoed (network) -- behavior UNKNOWN
PERMISSION_REACHABLE=UNKNOWN for real sources (declaration alone did not preempt the probed shape)
PERMISSION_EVIDENCE=unknown-source leg reached tool code
INPUT_CONTRACT_VALID=YES for probed shape
OUTPUT_CONTRACT_VALID=UNKNOWN for real sources (ok-shape code-cited in verdict table)
EVIDENCE_PRODUCED=UNKNOWN for real sources
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY20)
CANONICAL_PATH_CONNECTED=PARTIAL (reachable; real-source behavior unproven)
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (real sources embargoed + static fetch defects: plaintext http ip-api + zero timeouts, F149)
RECOMMENDED_ACTION=WIRING-P2-028 (https + fetch bounds) + network-allowed behavior follow-up -- proposed, unactioned

---

CAPABILITY_ID=TOOL-query_optimizer
NAME=query_optimizer (QueryOptimizerTool, DatabaseEnterpriseTools.ts:181)
CATEGORY=tool/database-data-trunk
SOURCE_FILES=api/src/modules/tools/definitions/DatabaseEnterpriseTools.ts
IMPLEMENTATION=SQL heuristic static analysis (WHERE/SELECT*/LIKE/OR/LIMIT rules); description claims EXPLAIN ANALYZE; required:['sql'] declared but unenforced; permissions internet (overstated -- executes pure-local)
REGISTERED=YES
REGISTRY_EVIDENCE=in live 163
PLANNER_VISIBLE=YES
PLANNER_EVIDENCE=SELECTABLE_BY_KEYWORD best-rank-1
SELECTABLE=YES
SELECTION_EVIDENCE=self-grounded rank 1
EXECUTOR_REACHABLE=YES
EXECUTOR_EVIDENCE=LIVE (trunk_db.json 2x): bad query earns 2 warnings; clean query earns []; BUT {} accepted -> nonsense Missing-WHERE suggestion on 'UNDEFINED' (required unenforced, F150); description-vs-behavior gap (F144, output label honest)
PERMISSION_REACHABLE=YES
PERMISSION_EVIDENCE=executed without approval under default autoSafe
INPUT_CONTRACT_VALID=NO (required sql unenforced at tool + gateway)
OUTPUT_CONTRACT_VALID=YES for shape ({analysis,suggestions})
EVIDENCE_PRODUCED=YES (heuristic-grade, honestly labeled in output)
VERIFICATION_COMPATIBLE=N/A (never a checker -- static VERIFY20)
CANONICAL_PATH_CONNECTED=YES
REAL_JOE_PROVEN=NO
PRIMARY_STATE=PARTIALLY_WIRED (F144 description gap + F150 input guard)
RECOMMENDED_ACTION=WIRING-P2-026 (description correction + missing-sql rejection) -- proposed, unactioned

---

END-OF-MUSE-DRAFT-ROWS=137 (127 individual + 8 group + 2 external-cited)
COVERAGE-DISCLAIMER=This draft covers ONLY what Muse checkpoints 1-19 evidenced. Full matrix requires: per-trunk path stories (19 trunks PROPOSED in merge.json, 10 STORIED: files 10/10 + browser_ui 33/33 LEVEL-4 + testing_qa 6/6 LEVEL-4 + security 3/3 LEVEL-4 + code_understanding 16/16 LEVEL-4 + vcs_repo 11/11 LEVEL-4 + build_generate 13/13 LEVEL-4 + runtime_services 5/5 LEVEL-4 + shell_terminal 4/4 LEVEL-4 + database_data 6/6 LEVEL-4), services/workers/persistence/deployment rows (NVIDIA scope), bulk per-tool firewall sweep (8 spot + 28 empty-input batch-1+2 + 19 risk-tier live + 16 trunk-files + 3 arch-backend + 26 browser live1/live2 + 30 browser live3 + 19 trunk-testing + 13 trunk-security + 36 trunk-code + 43 trunk-vcs + 45 trunk-build + 4 prog-batch3 + 23 trunk-runtime + 4 pages-approved + 25 trunk-shell + 5 shell-cwd + 28 trunk-db done; 25/25 no-required reviewed: 18 SAFE + 1 BOUND + 4 EMBARGO with static fixture designs + 2 FIXTURE probed contained; browser_launch embargo partially lifted for contained-http; sonar/dep_audit/dead_code positives embargoed; code_reviewer non-quick + ALL github-network/git-network-push/import-clone/npm-qa legs embargoed; pipeline-named/setActiveRoot + mobile-default-cwd + full-stack-{} + react/api-full + ent/ori-default-root + page-model-present legs embargoed; risk table SURVEYED), contract audit per boundary (14 mismatches + schema/execute family), LEVEL 5-6 proofs (L5 done files+browser_ui + project_run live-gate receipt; testing_qa + security + code_understanding static-only, 5 checkers pending; vcs_repo + build_generate static-only with 0 checkers each), and NVIDIA cross-review (pending — worker on CLI-BATCH1 + audit slice).
