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
ROOT_CAUSE=defined/imported but never constructed (grep_search: never imported); no owner ever decided wire-vs-retire. EXTENDED 013/F81: visual_qa sits in the isVerificationTool allowlist (verification-ledger.ts:735-739) though unregistered — the wire-vs-retire decision must include allowlist cleanup, and the P2-002 single-winner gate should cover the checker allowlist, not just resolve names.
FILES=registry.ts + 5 definition sites + ROUTER_EXCLUDED/PRIORITY lists + verification-ledger.ts allowlist
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=per-tool registration + selection + safe-execution + containment tests; bulk_file_generator needs path-containment hardening test first; allowlist/registry consistency gate (every allowlisted checker resolves OR is explicitly gate-opt-in-only)
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

BATCH_ID=WIRING-P1-004
CAPABILITIES=browser_page_fix session-ownership bypass (drives shared panel-browser)
ROOT_CAUSE=PageFixTool.execute ignores its session input and drives getBrowserSession(PANEL_BROWSER_SID) unconditionally (PageFixTool.ts:133), then goto + live style injection on the shared session — the exact cross-session page mutation browserSid's no-shared-fallback rule prevents (BrowserSmartTools.ts:16-20). Code-indicated in checkpoint 10 (positive deliberately unprobed: shared session + forced https + file write). UiFixTool only WATCHES the panel session (audit display) and is not implicated.
FILES=PageFixTool.ts (bind to addressed session like browserSid; fall back honestly when none) + session-ownership contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=two-session test: page_fix on session A never navigates/mutates session B's page; unaddressed session -> honest error (still deny-safe); AGENTS gates
REAL_JOE_UAT=page-fix-via-UI on a throwaway local page only after the fix
ROLLBACK=revert session binding change
DEPENDENCIES=WIRING-P2-013 (contained-URL vocabulary for safe testing)

---

BATCH_ID=WIRING-P1-005
CAPABILITIES=repo_run_command shell-escape of the prefix allowlist (chained/redirected commands execute)
ROOT_CAUSE=RepoRunCommandTool enforces a string-prefix allowlist + blockedFragments (RepoSelfCodingTools.ts:66-87) but executes via executionEngine.run STRING path -> runCommandInternal, which whitespace-splits and spawns with shell:true (ExecutionEngine.ts:987-1000; cmd.exe line on Windows). Proven live 2x (016/F101): 'git log --oneline -n 1 && echo VCSSAFE16' executed the chained echo (marker in stdout); 'git status --short > wiring-vcs-shellmark.txt' WROTE the repo-root file (contained fixture, removed after). blockedFragments omits && || & > >> < | %VAR% powershell cmd and the Windows LOLBIN vocabulary; firewall rates the tool medium (auto-approved under default autoSafe), so only critical-pattern substrings stop pre-tool. Caller-controlled input (planner/model-composed command, possibly carrying user-request text) reaches a full shell.
FILES=RepoSelfCodingTools.ts (argv execution via runArgv + strict argument validation, OR shell-metacharacter rejection before dispatch) + ToolService.ts classifyToolRisk (re-tier repo_run_command to high for any non-exact command) + blockedFragment review
IMPLEMENTATION_OWNER=UNASSIGNED (ToolService/ExecutionEngine are shared — coordinate; security review REQUIRED)
REVIEW_OWNER=UNASSIGNED
TESTS=chain negative ('&& echo' never executes — RED->GREEN via no-marker assertion); redirect negative (no file created outside explicit contract); prefix-allowlist contract test (every admitted command runs with ZERO shell interpretation); metacharacter suite (&& || & > >> < | % % ` $); AGENTS gates
REAL_JOE_UAT=none until fixed; then repo-QA-via-UI on a throwaway checkout only
ROLLBACK=revert execution-path change
DEPENDENCIES=MISMATCH #12 (same tools; fix exitCode together so negatives are distinguishable from always-false)

---

BATCH_ID=WIRING-P1-006
CAPABILITIES=github_actions workflowType path traversal + silent template substitution + uncontained projectPath writes
ROOT_CAUSE=saveWorkflow joins projectPath/.github/workflows/<workflowType>.yml with NO containment and execute() takes NO context param (GitHubActionsTool.ts:235-248); generateWorkflow silently falls back to node-ci for unknown types (:105). Proven live 2x (016/F103): workflowType '../../traversal16' wrote FXACTIONS/traversal16.yml OUTSIDE .github/workflows (contained to fixture); 'bogus-type-16' returned ok:true with node-ci CONTENT under the bogus name (12th P2-004 instance); OS-temp projectPath written outside the session (5th no-context instance + P2-006 extension).
FILES=GitHubActionsTool.ts (accept context + resolveToolPath/contain projectPath + whitelist workflowType or reject separators + honest error on unknown type) + traversal/containment contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=traversal negative ('../' type -> honest error, nothing written outside workflows dir — RED->GREEN); unknown-type negative (honest error, no silent node-ci — RED->GREEN); outside-projectPath negative (rejected — RED->GREEN); seeded positive still byte-exact; AGENTS gates
REAL_JOE_UAT=none until fixed; then workflow-generation-via-UI on a throwaway project only
ROLLBACK=revert validation change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P1-007
CAPABILITIES=permissive 4-root write containment for planner-reachable generator roots (scaffold baseDir, api/react input.root, auth output root)
ROOT_CAUSE=resolveToolPath allows workspace/projectRoot/builds/external roots for ALL callers (tools/utils.ts:101-104), and api/react tools bypass it entirely (raw input.root). Proven live 2x (017): scaffold_project baseDir '../../..' wrote a.js to the REPO ROOT with ok:true (F112, probe-removed); traversal structure keys escape the base into the session root with a lying receipt (F111); api_project input.root=fixture scaffolded fully outside the session (F117; react twin code-cited); auth_builder honors in-project absolutes (F114). ai_write_file spends a model call before any path validation (F119: traversal reaches the model).
FILES=SystemTools.ts ScaffoldProjectTool (session-bind baseDir: reject or re-anchor above-workspace bases; per-key base containment; receipt must report resolved paths) + ApiProjectTool.ts:2723 + ReactProjectTool.ts:4651/5037 (session-bind input.root/scaffoldDir or contain via resolveToolPath) + AuthBuilderTool output root (session-bind; keep the true-outsider throw) + AIGeneratorTool (validate path shape BEFORE the model call) + resolveToolPath rule review (re-audit the projectRoot allow-rule for WRITERS; reads may keep it) + containment contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=base-traversal negative (above-workspace baseDir -> honest error, nothing written outside session — 017/F112 leg as RED->GREEN contract); traversal-key negative (keys stay in base or are honestly reported — 017/F111 leg as RED->GREEN contract); input.root negative (outside-session root rejected or re-anchored — 017/F117 leg as RED->GREEN contract); ai path-shape negative (traversal -> path error WITHOUT model spend — 017/F119 leg as RED->GREEN contract); positives still green; AGENTS gates
REAL_JOE_UAT=none until fixed; then scaffold-via-UI on a throwaway session with planted traversal inputs (verify refusal + no stray files)
ROLLBACK=revert validation change
DEPENDENCIES=none (P2-006 extensions ride here for the planner-reachable writers)

---

BATCH_ID=WIRING-P1-008
CAPABILITIES=project_stop kill verification (stopped:true must imply dead) + deploy pidfile stop path
ROOT_CAUSE=killTree awaits the taskkill gateway call but never checks the result (ProjectRunTool.ts:1767), and stopServer returns true + deletes the RUNNING record even when the kill throws (:1861-1872 fall-through). Proven live 2x (018/F124): stopped:true on the SUCCESS log branch with HTTP-200-after + record deleted (retry impossible). Isolation: gateway returns {success:true,data:{ok:false,exitCode:1}} (taskkill failed silently under stdio:ignore); direct-taskkill control fails access-denied in this sandbox -- observed receipt partly sandbox-shaped, code defects environment-independent. Companion: deploy start_server writes .joe_server.pid never read anywhere (F125 orphan-by-design).
FILES=ProjectRunTool.ts killTree/stopServer (check result; verify death via port-closed/pid-gone before stopped:true; keep record on failure; binary-independent kill path) + DeployProjectTool pidfile (stop path or honest unsupported-stop) + stop contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=stop-after-run RED->GREEN (HTTP-200-before/refused-after + record-kept-on-failure + retry-works); kill-failure-injection (forced taskkill failure -> honest stop_failed, record kept); deploy pidfile stop-or-honest; AGENTS gates
REAL_JOE_UAT=run-then-stop through real Joe UI with independent port checks (unsandboxed host for the taskkill half + sandbox for the defense-in-depth half)
ROLLBACK=revert stop diff
DEPENDENCIES=none

---

BATCH_ID=WIRING-P1-009
CAPABILITIES=deploy expose_port shell-interpolation guard (+ trunk interpolation audit)
ROOT_CAUSE=`lt --port ${port}` with shell:true (DeployProjectTool.ts:192-204) where port = input.port || 3000 with NO numeric validation in execute(); ToolService performs NO inputSchema validation (zero references), so type:number is decorative. Static + gateway-shape verified (018/F126); live-unprobed (public-tunnel embargo). Gated today by high-risk approval (expose_port -> high), but approval authorizes tunneling, not shell.
FILES=DeployProjectTool.ts (numeric port guard; quote/validate all interpolations; `which lt` portability + no silent global install) + audit every interpolation into shell:true in runtime_services + ToolService inputSchema enforcement as the systemic fix (separate decision) + contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=non-numeric-port RED->GREEN (rejected before spawn, no-process-start assertion); expose_port positives only with loopback-safe doubles (no public tunnel in tests); AGENTS gates
REAL_JOE_UAT=none for the tunnel itself (must not open public URLs in UAT); negative-shape verification via local harness only
ROLLBACK=revert guard
DEPENDENCIES=none
---

BATCH_ID=WIRING-P2-001
CAPABILITIES=memory-tool dual implementation (recall_memory, memorize_codebase)
ROOT_CAUSE=registry defs added without removing ToolService inline handlers (or vice versa); inline path bypasses firewall/permissions; implementations already diverge on validation
FILES=ToolService.ts (:571-608) + MemoryTool.ts + memory-related tests
IMPLEMENTATION_OWNER=UNASSIGNED (ToolService is shared — coordinate)
REVIEW_OWNER=UNASSIGNED
TESTS=single-implementation proof (one path owns each name) + permission-enforcement test + focused memory tests + AGENTS gates. EXECUTION EMBARGO: never live-verify memorize_codebase via global vectorDb.clear(); use routing/contract tests + the isolated-cwd scoped-memory fixture designed in 008 (vectorDb singleton resolves under process.cwd()/data/memory — fixture chdir()s to temp BEFORE import; that cwd-relative default is itself a portability smell riding with this batch).
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
ROOT_CAUSE=tools declare empty permissions / zero rateLimit; enforceContract mutes at boot instead of source fix. EXTENDED 015/F100 (member identification): 6 of the 21 are code_understanding members — the 5 trunk Elite tools (ambiguity_resolver, business_logic_parser, compliance_validator, dependency_graph, self_confidence_evaluator) + request_analyzer, all declaring permissions [] in source but reading ['read'] from the registry.
FILES=21 definition sites (exact 21+2 lists in sweep1.json contractDefaults; 6 code-trunk members named in 015/F100)
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
CAPABILITIES=schema/execute consistency (task_lifecycle required-vs-default gap) + empty-input honesty sweep continuation (25/25 reviewed, 19 probed live in sweep2.json; risk-tier 19 in sweep3.json; files-trunk 16 live in trunk_files.json; testing_qa 19 live in trunk_testing.json; security-trunk 13 live in trunk_security.json; code-trunk 36 live in trunk_code.json)
ROOT_CAUSE=task_lifecycle declares required:['action'] but execute() defaults action='update' and returns ok:true on {} (sweep1.json, rerun-stable); no central schema gate — validation is per-tool; 25 no-required tools PARTITIONED 18 SAFE + 1 BOUND + 4 EMBARGO (static fixture designs in 008) + 2 FIXTURE (probed contained in 008). Absence-as-success shape: project_stop/orders_read/form_inbox/browser_consent return ok:true for absence (honest messages; ok-only verifiers would misread) + read_file {} returns ok:true EMPTY directory auto-list (sweep3.json, rerun-stable — 5th instance) + project_edit no-project returns ok:true 'No active project' message (trunk_files.json, live — 6th instance) + test_generator .ts-under-node-runner returns ok:true + generated:false/skipped:true (trunk_testing.json, live 2x — 7th instance, 013/F80) + secrets_scan_repo nonexistent-path returns ok:true findings:[] scannedFiles:0, byte-identical to clean (trunk_security.json, live 2x — 8th instance, 014/F85) + analyze_project missing-path returns ok:true + {status:'error'} (trunk_code.json, live 2x — 9th instance, 015/F94; both AnalysisTools siblings return honest ok:false) + pattern_recognize no-language returns ok:true + patterns:[] (trunk_code.json, live 2x — 10th instance, 015/F96) + auto_refactor sort-only returns ok:true + changes:[] with zero effect (trunk_code.json, live 2x — 11th instance, no-op success, 015/F97) + github_actions bogus-type returns ok:true with node-ci CONTENT under the bogus name (trunk_vcs.json, live 2x — 12th instance, silent substitution, 016/F103) + import_project no-URL returns ok:true + guidance message with zero effect (trunk_vcs.json, live 2x — 13th instance, guidance-pass, 016/F104) + auth_builder out-of-enum 'saml' returns ok:true "generated" with a 2-file stub missing its type branch (trunk_build.json, live 2x — 14th instance, degraded stub, 017/F113) + scaffold_full_stack name-defaults to my-app + accepts 'cobol' type with identical output (trunk_build.json, live 2x — 15th instance, silent defaults, 017/F115) + scaffold_project traversal-key ok:true with escaped file + base-naming receipt (trunk_build.json, live 2x — 16th instance, receipt/base mismatch, 017/F111) + scaffold_project {} returns ok:true + created:[] with zero effect (trunk_build.json, live 2x — 17th instance, no-op ok, 017) + deploy_project start_server returns ok:true/running + localhost URL for a dead port with no health check (trunk_runtime.json, live 2x - 18th instance, hollow running, 018/F125). Decorative-required instances: task_lifecycle (above) + secrets_scan_repo required:['path'] never enforced — missing path maps to default-workspace scan (pure mapping proof, 014/F86; session escape) + pattern_recognize required:['code','language'] with language never enforced (live 2x, 015/F96). project_undo default-latest-restore code-indicated (ProjectUndoTool.ts:98-100), fixture-unconfirmed.
FILES=TaskLifecycleTool.ts (enforce required OR drop it from schema) + SecretsScanRepoTool (QualityTools.ts:284-285: enforce required path; honest nonexistent-path error like SecurityScannerTool.ts:100-104) + AnalyzeProjectTool (AnalysisTools.ts:61-63: surface Analyst status:error as ok:false like siblings) + PatternRecognitionTool (AdvancedTools.ts:43-55: enforce language OR drop from required) + AutoRefactorTool (AdvancedTools.ts:279-285: report/apply pure sorts OR return honest no-op) + GitHubActionsTool (GitHubActionsTool.ts:97-106: honest error on unknown type OR emit the fallback name truthfully — rides WIRING-P1-006) + absence-as-success verifier note — EVIDENCED 012/F69: verdict mapping is ok/error-only and content-blind for all 43 swept tools (passed = check executed, never = requested behavior observed; hollow-pass shapes: 6 absence-instances + extract-swallow + empty-search-answer, all mapping in the safe direction) + EXTENDED 013/F75: quality_run all-skipped maps to failed, not incomplete (verdict is skip-blind too — a gate with nothing to check is indistinguishable from a gate that failed) + EXTENDED 014/F85: secrets missing-path-as-clean (8th absence instance) + 014/F86 decorative-required with session escape + EXTENDED 015/F94/F96/F97: 9th/10th/11th absence/no-op instances + 3rd decorative-required + project_undo snapshot fixture
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=schema/execute consistency gate for task_lifecycle ({} -> honest error OR schema without required); secrets required-path negative (missing path -> honest error, RED->GREEN via mapping-level test — never scan a default workspace live) + nonexistent-path negative (clean-shaped ok:true must become honest error, RED->GREEN); verifier MUST read message/flags, not ok alone, for the absence tools; project_undo fixture (snapshots present) to confirm/deny default-restore; AGENTS gates if ToolService touched (it is not — tool-local fix + verifier note)
REAL_JOE_UAT=none (contract nits; UI behavior unchanged either way)
ROLLBACK=revert schema/execute one-liner
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-005
CAPABILITIES=ok:false-without-error wrapper (cause-swallowing) + nested-error cause-substitution
ROOT_CAUSE=tools returning {ok:false} with no `error` field get generic 'Tool reported failure without an error message'; real cause sits in output (e.g. output.stderr) and never surfaces (2 instances: batch-1 rss_fetch, batch-2 repo_diff_summary in sweep1/2.json). EXTENDED 013/F76 (3rd instance, cause-SUBSTITUTION not absence): same nested npm exit-1 surfaced run-varying text across 2 runs — run 1 auto.unit.fail error was npm self-update NOTICE stdout noise (exit cause nowhere in the message), run 2 same leg was generic 'command_failed'; run 2 quality.test.fail per-task error was '' (empty string). Origin is below the tools (nested shell_execute/handleShellCommand error mapping). EXTENDED 014/F83 (4th instance, cause-substitution + CONTENT variance): same audit.empty-dir leg run 1 report = pure npm self-update NOTICE (cause nowhere), run 2 report = ancestor audit JSON (multer/high) — verdict-stable ok:false, report content entirely different. MECHANISM-RESOLVED 016/F102 (diff instance + runcmd sibling): repo_diff_summary is ALWAYS ok:false without error because ExecutionEngine.run() drops exitCode (MISMATCH #12) — the generic wrapper message is a symptom of the engine contract, not a git failure; same always-false afflicts repo_run_command (with 'command_failed'). Repair: run() exposes exitCode like runArgv, or both tools use result.ok (needs engine-owner review; shared component).
FILES=ToolService/firewall wrapper (surface output.stderr/cause) + the 2 tool sites (return error with ok:false) + shell_execute/handleShellCommand error mapping (prefer exit cause over stdout noise; never empty error on exit-nonzero) + auto_tester/quality_run passthrough + DependencyAuditTool report sourcing (pin audit target so the report describes the requested path — see P2-006 ext)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=contract test: no ok:false result without a specific error (or wrapper carries output cause); RED->GREEN on both instances; nested-npm-failure error-text stability test (same failing fixture 2x -> same cause-bearing message, RED->GREEN); empty-error negative (no '' error on real failure); audit-target stability test (same packageless fixture 2x -> same cause-bearing report about THAT path, RED->GREEN — currently notice-noise vs ancestor JSON); AGENTS gates
REAL_JOE_UAT=none (error-text quality; behavior unchanged)
ROLLBACK=revert wrapper/tool one-liners
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-006
CAPABILITIES=uncontained execution roots + dead autoFix input (dead_code_detector, dependency_audit) + uncontained reads (codebase_outline)
ROOT_CAUSE=both default to getWorkspaceRoot() (Joe's own repo) ignoring session context (DeadCodeTool.ts:46-52, QualityTools.ts:89-96); then run npx knip / npm audit (network + long runtime). autoFix:boolean declared on dead_code_detector but never read — planner-facing dead input (checkpoint 6 static; fixture-only, never {}). EXTENDED 014/F83 (npm UPWARD escape): even an EXPLICIT contained path escapes when the dir lacks package.json — npm prefix resolution walks up and audits the ancestor package (live 2x: empty session fixture audited Joe's own root over the network, multer/high report). Explicit-path usage is therefore uncontained too, not only the default root. EXTENDED 015/F93 (no-context resolver): codebase_outline takes NO context param and resolves relatives against process.cwd() (api/) + reads absolute paths unrestricted (live 2x: relative read api/package.json, absolute read OS-temp file). EXTENDED 015/F100 (4th no-context instance, static): DeadCodeTool.execute() takes no context and resolves via no-arg getActiveRoot(). EXTENDED 016/F104 (absolute-outside accepted): import_project session-anchors relatives but opens absolute OS-temp paths with full audit + registration (live 2x). EXTENDED 016/F103 (5th no-context instance): github_actions takes NO context and writes projectPath raw, incl. OS-temp outsiders (live 2x; repair rides WIRING-P1-006). EXTENDED 016/F107 (raw explicit cwd; default-cwd attribution CORRECTED 017/F121 to UNPROVEN — depth-3 ambiguity, ambient mechanism predicts session root, marker re-probe outstanding): git_ops explicit OS-temp cwd honored raw (live 2x). EXTENDED 017/F111+F112 (scaffold base-escape + repo-root write): traversal keys escape the base into the session root with ok:true + lying receipt; baseDir '../../..' wrote a.js at the REPO ROOT (live 2x, probe-removed) — repair rides WIRING-P1-007. EXTENDED 017/F114 (auth root split): relatives forced to session-agnostic data/builds/workspace-default; in-project absolutes honored; true outsiders refused (live 2x). EXTENDED 017/F117 (raw input.root): api_project root honored outside the session (live 2x; react twin code-cited) — repair rides WIRING-P1-007. EXTENDED 017/F119 (model-before-containment): ai_write_file traversal reaches the model (live 2x). EXTENDED 017/F115 (code-cited defaults): mobile_builder init outputDir defaults to process.cwd(); scaffold_full_stack Builder defaults baseDir to repo data/projects + overwrite:true default.
FILES=DeadCodeTool.ts + QualityTools.ts DependencyAuditTool (contain default root to session context or document internal-only; drop-or-implement autoFix; dep_audit: pre-check package.json/lockfile presence in-tool + pin --prefix so npm cannot walk up; honest packageless-path error) + CodebaseOutlineTool.ts (accept context + resolveToolPath + outside-workspace rejection; 015/F93 legs as RED->GREEN contracts) + DeadCodeTool context threading (015/F100) + ImportProjectTool.ts (contain absolute paths to workspace; 016/F104 leg as RED->GREEN contract) + GitTools.ts (session-bind default cwd + reject outside cwd; 016/F107 legs as RED->GREEN contracts)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=root-containment test (default root == session workspace, never Joe repo); dead-input gate (every declared input is read); upward-escape negative (explicit packageless dir -> honest error, never ancestor audit — 014/F83 leg as RED->GREEN contract); outline negatives (relative resolves inside session; absolute-outside rejected — 015/F93 legs as RED->GREEN contracts); fixture probes with explicit paths; AGENTS gates
REAL_JOE_UAT=none (scope correction; behavior on explicit paths unchanged)
ROLLBACK=revert root/input change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-007
CAPABILITIES=approval-risk destructive-input scan coverage (shadowed branches)
ROOT_CAUSE=classifyToolRisk line-200 name-regex low-return + the 4 early-branch tool returns (deploy_project/git_ops/browser_run/shell_execute) all precede the line-201 whole-input destructive scan — so echo/central_answer/task_lifecycle + deploy_project.buildCommand are never content-scanned. Proven live: echo {destructive text} executed ok:true (sweep3.json). Code-indicated: deploy_project {build_static + hostile buildCommand} classifies MEDIUM and executes via ExecutionGateway (DeployProjectTool.ts:96-104). NEVER live-probe with a destructive command.
FILES=ToolService.ts classifyToolRisk (reorder/extend scan) + DeployProjectTool.ts (scan-or-constrain buildCommand) + scan-coverage contract test
IMPLEMENTATION_OWNER=UNASSIGNED (ToolService is shared — coordinate)
REVIEW_OWNER=UNASSIGNED
TESTS=scan-coverage gate: destructive strings in ANY tool input classify critical (or the tool documents why its field is inert, e.g. echo text); deploy buildCommand hostile-content RED->GREEN via fixture (blocked pre-execution, never executed); full tier-matrix regression (19 sweep3 probes as contracts); AGENTS gates
REAL_JOE_UAT=none (policy tightening; honest blocks only)
ROLLBACK=revert classifier order change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-008
CAPABILITIES=browser session-injection verdict honesty (browser_run {} -> forbidden)
ROOT_CAUSE=Universal Browser Session Injection (ToolService.ts:562-568) copies the chat sessionId into effectiveInput.sessionId, bypassing execute()'s sessionId_required guard (BrowserRunTool.ts:248); authz then fails on an id the caller never named, with a cross-user message ("belongs to another user") for a nonexistent browser session (sweep3.json, rerun-stable; second live shape run_empty in trunk_browser_live1.json, 010/F54, 3/3 rerun-stable). Deny direction is safe; evidence is wrong.
FILES=ToolService.ts (injection block) + BrowserRunTool.ts (distinguish unnamed vs foreign session) + verdict contract test
IMPLEMENTATION_OWNER=UNASSIGNED (ToolService/browser shared — coordinate)
REVIEW_OWNER=UNASSIGNED
TESTS=verdict test: browser_run {} (no browserSessionId anywhere) -> honest "no browser session addressed" (still deny); foreign-session case keeps forbidden; AGENTS gates
REAL_JOE_UAT=none (error-path honesty)
ROLLBACK=revert verdict change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-009
CAPABILITIES=archive_files zip backend portability + swallowed failure cause
ROOT_CAUSE=zip create shells `zip -r ... 2>/dev/null || true` (ArchiveFilesTool.ts:92): no `zip` binary on Windows, `|| true` swallows the failure, then statSync on the never-created archive throws ENOENT surfaced as 'Archive operation failed: ENOENT ... stat b.zip' — 'tool missing' misreported as 'archive missing'. Proven live: zip create 0/2, tar.gz create+list ok:true on the same fixture (trunk_files.json + arch2.json). Secondary: tar.gz list shows absolute-source path stored in archive (extraction-path review). 3rd instance: deploy_project package on Windows returns raw stat ENOENT with no zip created (trunk_runtime.json, live 2x, 018/F127).
FILES=ArchiveFilesTool.ts (zip backend: bundled dep / documented prereq / tar fallback; remove `|| true`; honest binary-missing error; review absolute-source storage) + backend contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=zip-create on Windows RED->GREEN (or honest binary-missing verdict + documented fallback); tar.gz regression; no `|| true` cause-swallow; extraction-path containment test; AGENTS gates
REAL_JOE_UAT=none (tool-local backend; planner-visible behavior unchanged on tar)
ROLLBACK=revert backend change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-010
CAPABILITIES=dependency_audit misleading error text (setup failure labeled as vulnerabilities)
ROOT_CAUSE=any non-ok npm audit result returns error 'Audit found security vulnerabilities.' (QualityTools.ts:102) even when the cause is environmental (proven: ENOLOCK missing-lockfile in contained fixture, trunk_files.json). output.report DOES carry the real stderr, so cause is recoverable — but ok/error-only consumers (planner/verifier) misread a setup failure as a security finding. EXTENDED 014/F83 (empty-dir variant, trunk_security.json live 2x): same mislabel on a packageless path; report run-varying (notice-noise vs ancestor JSON) — sometimes the report does not even contain the cause.
FILES=QualityTools.ts DependencyAuditTool (classify cause: vulnerabilities vs setup/environment failure; error text must reflect the class) + error-text contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=ENOLOCK/setup RED->GREEN (honest setup-failure error); empty-dir variant RED->GREEN (honest packageless error + cause-bearing report — shares the P2-006 upward-escape fix); true-vulnerability case keeps current text; AGENTS gates
REAL_JOE_UAT=none (error-text honesty)
ROLLBACK=revert one-liner
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-011
CAPABILITIES=sideEffects declaration honesty for mutating tools (browser trunk: 25/33 empty incl. click/fill/navigate)
ROOT_CAUSE=tools that mutate page state declare sideEffects:[] (trunk_browser1.json; proven pattern: browser_click/browser_fill_form family). Planner-facing signal debt — a planner trusting sideEffects would treat mutating tools as pure. Distinct from P2-003 (boot-defaulted permissions): this trunk has ZERO boot-defaulted names; the declarations are explicit-but-empty.
FILES=25 browser definition sites (exact list in trunk_browser1.json emptySideEffects) + sideEffects-honesty contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=per-tool sideEffects review (mutating tools declare honestly or document why a field is inert); contract test pinning the reviewed declarations; AGENTS gates
REAL_JOE_UAT=none (declaration honesty; behavior unchanged)
ROLLBACK=revert declaration change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-012
CAPABILITIES=browser_run action-result surfacing (extract_text results discarded) + receipt evidence pointer
ROOT_CAUSE=browser_run output carries only sessionId/pageUrl/title/screenshotHref/summary/missingSecrets with a generic summary; executed action results (e.g. extract_text) never surface (run_extract_raw in trunk_browser_live2.json, rerun-stable; MISMATCH #8). Sibling browser_action returns {success,result} correctly. Planner/verifier cannot consume run extractions. EXTENDED 012/F70: output uses pageUrl, but verificationMetricsFrom reads output.url — so browser_run ledger receipts carry evidenceLocation='' and point nowhere (all 6 (a)-checker siblings emit url and are evidence-pointed; V4 proves the mechanism live for console_scan).
FILES=BrowserRunTool.ts (surface per-action results in output, e.g. actionResults[]; emit `url` alongside pageUrl for receipt evidence; keep keys backward-compatible) + output contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=extract-result contract test: run [goto loopback, extract_text] output contains the page marker (RED->GREEN); receipt-evidence test: browser_run checker receipt carries evidenceLocation=url (RED->GREEN); navigation-only regression (pageUrl/title/summary intact); AGENTS gates
REAL_JOE_UAT=extract-via-UI sanity after fix (read a value from a page through real Joe)
ROLLBACK=revert output change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-013
CAPABILITIES=contained-URL vocabulary for browser tools (normalizeUrl/data-URL gap)
ROOT_CAUSE=openPage->normalizeUrl (BrowserSmartTools.ts:30-35) mangles non-http URLs: about:blank -> https://about:blank (honest open_failed, proven live1); data:/file: equally unusable — so 22/25 context-derived tools cannot be pointed at contained URLs. browser_run.goto rejects data-URLs ('invalid URL', proven live2) while browser_action.goto accepts them (undocumented sibling split). PageFixTool forces https:// (PageFixTool.ts:124).
FILES=BrowserSmartTools.ts normalizeUrl (allowlist data:/about:blank/file-under-workspace OR explicit contained-mode) + BrowserRunTool.ts goto vocabulary (document-or-align with action) + PageFixTool.ts URL handling + vocabulary contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=vocabulary matrix test (http/data/about-blank/file × action/run/smart-launch) RED->GREEN per decided contract; no behavior change for real https URLs; AGENTS gates
REAL_JOE_UAT=none (contract expansion; contained cases only)
ROLLBACK=revert normalizer change
DEPENDENCIES=none (unblocks audit batch-3 for the 22 (a)-tools either way via loopback pattern)

---

BATCH_ID=WIRING-P2-014
CAPABILITIES=standalone QA pair fidelity (visual_compare heuristic + screenshot containment) + vision dir review (011 extension)
ROOT_CAUSE=(a) visual_compare measures BYTE SIZE (|lenA-lenB|/max, ScreenshotTool.ts:244-249), proven live (+64B -> 0.62% diff, still match) — the 'visual differences' description overclaims; a same-size different-pixel pair would 'match' (code-indicated, unstaged). (b) screenshot `filename` joins unsanitized under process.cwd()/screenshots (ScreenshotTool.ts:75-85; traversal-shaped input never sent — review item, not a proven exploit). (c) browser_vision (third standalone-launch member, 011/F64) writes fixed-name PNGs under the same cwd-relative screenshots dir (no traversal vector — fixed filename; shared portability note).
FILES=ScreenshotTool.ts (relabel byte-compare OR implement pixel diff; sanitize filename to basename + contain under workspace-aware dir) + BrowserVisionTool.ts (same dir decision) + fidelity/containment tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=same-size-different-pixel negative (RED->GREEN per decided contract); filename-traversal negative (../ stays inside screenshots dir); PNG-output regression (F49 case as contract); AGENTS gates
REAL_JOE_UAT=none (tool-local fidelity)
ROLLBACK=revert label/sanitize change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-015
CAPABILITIES=model-fallback contract for browser model-touching tools (summarize/translate/smart_agent + search variance) + EliteTools JSON-extract variant
ROOT_CAUSE=routeToModel no-provider path RESOLVES failure prose (intelligent-router.ts:2201/2778/2789/2794, all `return`) instead of throwing — so tool try/catch + empty/short-text fallbacks (summarize :885-888, translate :1203-1205, smart_agent :1714) never fire on this path. Honesty currently depends entirely on ToolService's central apology text scan (ToolService.ts:940-944 + honestResult.ts isApologyOnly: prefix + no artifact keys) — proven live: trio ok:false WITH full output (sumLen 252 + shot; target + 7 blocks; scores 75/54/70 + 8 findings). Consequences: (a) smart_agent's computed lenses are discarded though real (none are ARTIFACT_KEYS); (b) a future failure shape the scan misses would flow as false-success data; (c) search uses a DIFFERENT routeToModel call shape ({messages} object, no context, :2032) and reads .content off the resolved string -> '' so it escapes the flip with ok:true + empty answer (coherent today since results are the deliverable, but the two shapes are uncontracted). EXTENDED 013/F74 (MISMATCH #11, EliteTools variant): all 8 EliteTools use match-or-'{}' (EliteTools.ts:66,99,129,165,199,225,255,284); chaos_test_plan proven live 2x returning ok:true + {} offline (mechanism proven by chaos_call_probe: callLLM resolves Arabic failure prose, regex drops it). The scan backstop NEVER sees the dropped prose — so fixing resolve-vs-throw alone is insufficient; the tools must ALSO fail on empty-extract. chaos_test_plan additionally lacks a missing-architecture input guard. EXTENDED 015/F92: 5 more EliteTools live-proven 2x (6/8 total); EliteTools.ts ALREADY imports isProviderFailure but never calls it — the repair seam is identified, wire the existing import before extraction. EXTENDED 015/F95 (MISMATCH #9 4th tool instance): analyze_codebase offline honesty comes from the backstop flip, own graceful catch dead on the resolve path — tool-side resolve-prose detection belongs in this batch.
FILES=intelligent-router.ts (resolve-vs-throw contract: throw typed no-provider OR document resolve-prose + provide isProviderFailure()) + 3 tool sites (detect prefix / use helper instead of empty-check) + honestResult.ts (keep as backstop; consider partial-output preservation rule) + search call-shape alignment + 8 EliteTools sites (fail on empty JSON extract + isProviderFailure check on the raw response BEFORE extraction + chaos input guard) + AnalyzeCodebaseTool resolve-path honesty (015/F95) + contract tests
IMPLEMENTATION_OWNER=UNASSIGNED (router + ToolService shared — coordinate; NVIDIA owns provider-adjacent planning? verify before assigning)
REVIEW_OWNER=UNASSIGNED
TESTS=resolve-vs-throw contract test (no-provider call shape asserted); trio RED->GREEN (honest failure WITH partials preserved or documentedly dropped); search empty-answer regression (results intact, ok:true stands); scan-miss negative (novel failure prose cannot pass as data); EliteTools empty-extract RED->GREEN (chaos offline leg as contract: ok:false + cause-bearing error; 7 siblings same shape); chaos missing-input negative; AGENTS gates
REAL_JOE_UAT=none (offline-honesty mechanics; behavior on live providers unchanged)
ROLLBACK=revert contract change (scan backstop stays regardless)
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-016
CAPABILITIES=responsive per-viewport hasViewportMeta reporting
ROOT_CAUSE=BrowserResponsiveCheckTool evaluates hasViewportMeta per viewport and scores on it, but drops the flag when mapping per-viewport output objects (BrowserSmartTools.ts:1297 keeps only name/w/h/overflowX/tiny/smallFonts/wide/screenshot) — detection surfaces only via aggregate score/issues. Proven live: score 60 + viewport issue fired, flag absent from output (011/F63).
FILES=BrowserSmartTools.ts responsive mapper (:1297, add the flag) + output contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=per-viewport flag test (meta-less fixture -> mobile.hasViewportMeta===false RED->GREEN); score regression (60-case as contract); AGENTS gates
REAL_JOE_UAT=none (reporting completeness)
ROLLBACK=revert mapper one-liner
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-017
CAPABILITIES=browser_compare baseline session scoping
ROOT_CAUSE=baselines kept in (global).joeCompareBaselines keyed by bare URL (BrowserSmartTools.ts:726), shared across users/sessions in one process and refreshed on every diff call. No failure observed (live3: baseline leg then diff-then-refresh behaved; re-capture pct exactly 0), but a second user's first call on the same URL diffs against the first user's baseline instead of capturing its own (011/F66).
FILES=BrowserSmartTools.ts compare baseline store (scope key by session/user or document refresh semantics) + scoping test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=two-session test (same URL baselines independent RED->GREEN per decided contract); single-session refresh regression (live3 3-leg flow as contract); AGENTS gates
REAL_JOE_UAT=none (state-scoping correctness)
ROLLBACK=revert store-key change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-018
CAPABILITIES=verification scopeRoot resolution for path-arg checkers (read_file existence gates never reuse; 5 more checkers code-indicated)
ROOT_CAUSE=phase-gate scopeRoot prefers verificationArgs.cwd/projectPath/path over the workspace root (PhaseExecutorTool.ts:2372-2378; same preference at task level :1570-1578), so a read_file gate with a workspace-relative path resolves scopeRoot against process.cwd() (the api/ server dir) — outside the workspace. fingerprintVerification takes the uncontained branch (nonce fingerprint, cacheable:false, 'trusted workspace containment is unavailable'). Proven live: V1 receipt scopeRoot `...\api\proof.txt` fp 89c4e353, V6 same checkId/args/files fp 50d47d6a + invalidated (012/F67, MISMATCH #10). Resume/reuse dead for this checker shape; receipt provenance misleading; no file bytes fingerprinted. Fail-safe direction (never wrongly reuses). EXTENDED 013/F77 + 014/F87 (code-indicated, same arg positions): quality_run (path) + auto_tester (projectPath) + dependency_audit (path) + secrets_scan_repo (path) — 4 more checkers take a preferred path arg. EXTENDED 015/F98 (code-indicated): code_reviewer (projectPath) — 5th checker, same projectPath shape as auto_tester.
FILES=PhaseExecutorTool.ts gate + task-level scopeRoot resolution (resolve the checker's path arg inside the trusted workspace root, or fall back to the workspace root; receipt scopeRoot must never point at process.cwd()) + scope-resolution contract test
IMPLEMENTATION_OWNER=UNASSIGNED (PhaseExecutor shared — coordinate; NVIDIA owns adjacent planning work)
REVIEW_OWNER=UNASSIGNED
TESTS=scope-containment test: read_file gate on workspace-relative path -> receipt scopeRoot inside workspace (RED->GREEN); reuse test: carried ledger + unchanged files -> verification reused (RED->GREEN, V6 shape as contract); per-checker legs for quality_run/auto_tester/dep_audit/secrets/code_reviewer (same contract per arg position); nonce-path regression (genuinely uncontained scope still fails safe to run-always); AGENTS gates
REAL_JOE_UAT=none (ledger mechanics; pass/fail behavior unchanged, only reuse + provenance)
ROLLBACK=revert scope-resolution change (back to always-run safe default)
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-019
CAPABILITIES=non-URL checker receipt evidence (quality_run/auto_tester/dependency_audit/secrets_scan_repo/code_reviewer receipts point nowhere)
ROOT_CAUSE=receipt evidenceLocation is read ONLY from output.evidenceLocation/reportPath/url (PhaseExecutorTool.ts:2068), but quality_run emits {results,status,error} and auto_tester emits {passed,errors,summary} — neither key present (static both sides, 013/F77). 3rd/4th evidence-hollow receipt shapes after browser_run (P2-012) and read_file gate. Unlike URL checkers, a test run has no page to point at — the batch must DECIDE what evidence means here (run/output digest? report artifact path? explicit hollow-by-design) rather than blindly add a url field. MISMATCH #10 scope fix (P2-018) covers these checkers' reuse once decided. EXTENDED 014/F87: dependency_audit ({report}) + secrets_scan_repo ({findings,scannedFiles}) are the 5th/6th hollow shapes — same decision needed (audit report digest? finding count/scope? explicit hollow-by-design). EXTENDED 015/F98: code_reviewer ({overallScore,...,qualityGate}) is the 7th hollow shape — same decision (review digest? finding lines? explicit hollow-by-design).
FILES=QualityTools.ts (QualityRunTool + DependencyAuditTool + SecretsScanRepoTool) + AutoTesterTool.ts + CodeReviewerTool.ts output shapes (emit evidence key OR document hollow) + receipt-evidence contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=receipt-evidence test per decided contract (RED->GREEN) for all 5 non-URL checkers; L5 live gate legs for all 5 (pass through real phase_executor with carried ledger — also proves/denies the #10 nonce extension live); AGENTS gates
REAL_JOE_UAT=none (receipt mechanics; pass/fail behavior unchanged)
ROLLBACK=revert output change
DEPENDENCIES=P2-018 (shared scopeRoot fix lands with or before this)

---

BATCH_ID=WIRING-P2-020
CAPABILITIES=testing_qa sideEffects declaration honesty (2/6 dishonest) + code_trunk 3rd family member
ROOT_CAUSE=auto_tester declares sideEffects:[] (AutoTesterTool.ts:58) but executes arbitrary declared npm scripts via nested shell_execute and can start project servers (liveTestPort -> project_run, :382-393); test_generator declares NO sideEffects field yet writes a test file (AdvancedTools.ts:459, byte-proven live). Same defect class as P2-011 (browser trunk 25/33 empty), now proven in a second trunk — a planner trusting sideEffects mispredicts both (013/F78). EXTENDED 015/F97: auto_refactor declares sideEffects:[] but provably rewrites files (byte-diff live 2x) — first FILE-WRITING member of the family, third trunk.
FILES=AutoTesterTool.ts + TestGeneratorTool (AdvancedTools.ts) + AutoRefactorTool (AdvancedTools.ts:240 — declare write sideEffects) declarations + sideEffects-honesty contract test (shared with P2-011's gate)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=declaration review (mutating tools declare honestly); contract test pinning the reviewed declarations (extend P2-011's gate to this trunk rather than a second gate); AGENTS gates
REAL_JOE_UAT=none (declaration honesty; behavior unchanged)
ROLLBACK=revert declaration change
DEPENDENCIES=none (coordinate gate shape with P2-011 owner)

---

BATCH_ID=WIRING-P2-021
CAPABILITIES=security_scanner file-target handling + discovery/explicit vocabulary split
ROOT_CAUSE=(a) file-as-projectPath always misses: discoverSourceFiles returns [basename] for a file target (SecurityScannerTool.ts:202) but the executor resolves it against the FILE path (:124-127), so .../vuln.js/vuln.js never exists -> missingFiles -> ok:false (live 2x, 014/F84). A planner passing a file target always fails. (b) Undocumented coverage split: discovery scans only sourceExtensions (.env and friends excluded — live: exactly [clean.js, vuln.js]) while explicit `files` accepts any readable file (live: .env -> 1 critical) (014/F90).
FILES=SecurityScannerTool.ts (resolve basenames against dirname when projectPath is a file, OR reject file-targets honestly upfront; align-or-document discovery vs explicit vocabulary — either extend sourceExtensions deliberately or document the split in the tool description) + vocabulary/file-target contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=file-target contract test (existing file as projectPath -> scans that file OR honest file-target-unsupported error, RED->GREEN per decided contract — 014/F84 leg as fixture); vocabulary matrix test (discovery set vs explicit set per decided contract, .env case as fixture, RED->GREEN); seeded-scan regression (014 5-vuln/risk-83 case as contract); AGENTS gates
REAL_JOE_UAT=none (tool-local contract; planner-visible behavior improves only for file targets)
ROLLBACK=revert resolver/vocabulary change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-022
CAPABILITIES=dev_server_start missing-path exception shape (unguarded config write)
ROOT_CAUSE=fallback branch writes vite.config.js into a never-created directory with no guard (WebDevelopmentTools.ts:527-534); the ENOENT throw escapes as internal_exception with a stack for a bad input. Proven live 2x (018/F128). Same leg re-proves the sandbox-force landing (data/builds) from F114/P1-007.
FILES=WebDevelopmentTools.ts DevServerTool (guard the config write path; honest bad-input error, no stack) + shape test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=missing-cwd RED->GREEN (honest ok:false, no internal_exception, nothing written); AGENTS gates
REAL_JOE_UAT=none (tool-local shape)
ROLLBACK=revert guard
DEPENDENCIES=none (P1-007 owns the sandbox-force rule itself)

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
