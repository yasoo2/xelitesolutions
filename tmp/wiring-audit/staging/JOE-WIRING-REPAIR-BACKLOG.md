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
IMPLEMENTATION_OWNER=MUSE (port-guard slice only; 2026-09-30)
REVIEW_OWNER=UNASSIGNED (independent review requested: NVIDIA or Codex)
STATUS=PORT_GUARD_IMPLEMENTED (resolvePort fail-closed in start_server + expose_port; schema description tightened; verified 2026-09-30: safe mocked-gateway RED on HEAD ok=true with `lt --port 3000; touch pwned` reaching the shell command; deploy-port-guard 12/12 GREEN; adjacent deploy-pages + deploy-project-workspace 22/22; tsc exit 0; guard:architecture + guard:package-scripts PASS). REMAINING: `which lt` POSIX-only + silent global install; systemic ToolService inputSchema enforcement; package-zipPath sibling (see P2-023).
TESTS=non-numeric-port RED->GREEN (rejected before spawn, no-process-start assertion); expose_port positives only with loopback-safe doubles (no public tunnel in tests); AGENTS gates
REAL_JOE_UAT=none for the tunnel itself (must not open public URLs in UAT); negative-shape verification via local harness only
ROLLBACK=revert guard
DEPENDENCIES=none
---

BATCH_ID=WIRING-P1-010
CAPABILITIES=shell_execute cwd handling + containment comparison under extended (`\\?\`) path roots
ROOT_CAUSE=no extended-prefix normalization at the path boundary: (a) a `\\?\` session root passes containment but cmd.exe cannot start in it, so EVERY local shell_execute runs in C:\Windows while the receipt claims the session cwd (pwd.node stdout=C:\Windows vs receipt cwd=session dir, live 2x+2x, 019/F135); (b) the identical directory spelled as plain D:\... is REJECTED as path_outside_workspace (live 2x, 019/F137) -- path.resolve preserves the prefix and isWithinRoot compares prefix-blind (utils.ts:82-101). No working cwd spelling exists under a `\\?\` root. Observed trigger is environment-shaped (sandbox `\\?\` CWD); defects are environment-independent.
FILES=WorkspaceService.ts (getActiveRoot/externalRoot normalization) + utils.ts (prefix-aware isWithinRoot beside the case-insensitivity logic) + SystemTools.ts shell_execute/handleShellCommand (normalize spawn cwd; never assert an unhonored cwd in the receipt) + contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=`\\?\`-root RED->GREEN (spawn lands in the honored dir; plain spelling accepted; outside still rejected); receipt-cwd honesty assertion; plain-host regression; AGENTS gates
REAL_JOE_UAT=local shell build/test legs on both `\\?\` and plain roots (harmless commands only)
ROLLBACK=revert normalization
DEPENDENCIES=none

---

BATCH_ID=WIRING-P1-011
CAPABILITIES=performance_analyzer uncontained file read (absolute-outside + traversal)
ROOT_CAUSE=file resolution is `path.isAbsolute(file) ? file : path.resolve(projectPath, file)` + bare fs.existsSync/readFileSync with NO resolveToolPath and NO escape check (PerformanceAnalyzerTool.ts:64-68). Proven live 2x (021/F152): absolute path to a worktree-tmp file OUTSIDE the session root -> ok:true + score 97; files:['../nasty.js'] with projectPath <session>/sub -> ok:true + outside-file bottlenecks. The tool declares permissions ['read'], is SELECTABLE rank-1, and the gateway permits the call. Sibling performance_profile REFUSES the same file via resolveToolPath (in-repo containment pattern to reuse).
FILES=PerformanceAnalyzerTool.ts (route resolution through resolveToolPath with session workspace context; reject escapes with a sentence) + focused negative tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=outside-absolute RED->GREEN (refused); traversal RED->GREEN (refused); in-session analysis regression (still scores); AGENTS gates
REAL_JOE_UAT=none (focused security tests + regression suffice)
ROLLBACK=revert containment change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P1-012
CAPABILITIES=ExecutionEngine.run() exit-blindness -> docker_manager false success (+ 4 surveyed sibling consumers)
ROOT_CAUSE=runCommandInternal resolves {ok:code===0,...,exitCode} without throwing (ExecutionEngine.ts:1033-1043); processExecution returns success:true whenever nothing throws (:342-346), IGNORING data.ok/exitCode; run() returns ok:result.success (:545-551), dropping exitCode entirely. docker_manager maps result.ok straight to {ok:true,output:{success:true}} with no stderr/exit inspection (DockerManagerTool.ts:57-62). Proven live 2x (023/F169): `docker ps` with docker ABSENT ('docker is not recognized' in stderr, empty stdout) -> ok:true + success:true, verdict passed (MISMATCH #19, FALSE-ARTIFACT direction). Contrast: runArgv checks result.data?.ok !== false (:568) -- the argv path is honest, the string path is blind. 4 sibling run() consumers surveyed by source only (DeadCodeTool.ts:65, ErrorRecoveryTool.ts:146, RepoSelfCodingTools.ts:90, VideoActionTool.ts:62) -- each needs a live check; consumers that inspect stderr/output content may still behave honestly. Mirror of F136/F102 (exit-collapse) in the false-success direction.
FILES=ExecutionEngine.ts run() (honor data.ok/exitCode like runArgv) OR the 5 consumers (inspect stderr/exit) -- owner decides central-vs-local with reviewer sign-off; shell_execute path checked for the same mapping
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=missing-binary RED->GREEN per consumer (ok:false + 'not recognized' in error); exit-nonzero RED (failing command -> ok:false); positives regression (echo/true still ok:true); AGENTS gates
REAL_JOE_UAT=infra-intent prompt through real Joe asserting honest failure (no success claim on missing binary)
ROLLBACK=revert engine/consumer change
DEPENDENCIES=P1-010 (spawn-cwd fix; UNC cwd pollutes the same stderr today but does not cause the blindness)

---

BATCH_ID=WIRING-P1-013
CAPABILITIES=i18n_translator dead require (registered + selectable, zero executable paths)
ROOT_CAUSE=require('../../llm') (I18nTranslatorTool.ts:38) targets api/src/modules/llm, which does NOT exist (modules/ = browser, extension, integrations, sentinel, services, terminal, tools); callLLM actually lives in api/src/core/llm.ts. The require runs BEFORE the source-file guard, so even input validation is unreachable. Proven live 2x (023/F174): missing-source, invalid-json and empty legs ALL fail with the identical "Cannot find module '../../llm'" + require stack. Broken-require spelling is unique to this tool (source survey, 1 match). Valid path additionally needs a model (embargoed in the audit).
FILES=I18nTranslatorTool.ts (fix require path to core/llm) + focused tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=no-model RED->GREEN (missing-source/invalid-json/empty fail with validation sentences, not module errors); valid-path test with model-or-stub (keys preserved, files written); AGENTS gates
REAL_JOE_UAT=none (focused tests + valid-path stub suffice)
ROLLBACK=revert require change
DEPENDENCIES=none (owner also dispositions two code-cited notes WITHOUT live-exploiting: (a) absolute sourceFile unchecked + ${lang}.json join allows traversal-shaped langs; (b) non-array targetLanguages iterates per-character)

---

BATCH_ID=WIRING-P1-014
CAPABILITIES=go_builder + java_builder scaffold: cwd-anchored unsanitized write (outside session root; traversal reaches recursive mkdir + writeFileSync)
ROOT_CAUSE=scaffoldProject computes path.join(process.cwd(), projectName) (GoBuilderTool.ts:97, JavaBuilderTool.ts:107) with NO resolveToolPath call and NO projectName sanitization, then fs.mkdirSync(recursive)+fs.writeFileSync directly. Proven live 2x (024/F179): nonce scaffolds landed in the process cwd (worktree root in-probe; api/ in production), session root untouched, 6/6 files byte-verified, probe-removed. A traversal-shaped projectName reaches recursive mkdir + file write by construction (code-cited, embargoed live).
FILES=GoBuilderTool.ts + JavaBuilderTool.ts scaffoldProject (anchor under session workspace root via shared path util; reject traversal/absolute projectName with a sentence) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=scaffold RED->GREEN (lands inside session root with byte-verified content); traversal/absolute projectName refused with a sentence (fixture-owned outside dir, restored); no api/ strays asserted; AGENTS gates
REAL_JOE_UAT=none (tool-local containment)
ROLLBACK=revert path change
DEPENDENCIES=WIRING-P2-037 (scaffold anchoring must follow the ONE reconciled containment rule)

---

BATCH_ID=WIRING-P1-015
CAPABILITIES=swagger_docs: uncontained generate/scan/write paths (cwd-relative defaults; absolute input honored raw)
ROOT_CAUSE=generate/addEndpoint/validate call raw fs with input paths and NO resolveToolPath anywhere (SwaggerDocsTool.ts:129-177, :249-267, :280-285); defaults './src' and './docs/swagger.json' resolve against process.cwd() (api/ in production). Proven live 2x (025/F198a): explicit absolute FX path honored (spec+HTML byte-verified, contained by caller luck); outside-write reach is code-certain (no check exists to stop it) -- owner live-checks with a fixture-owned outside dir (same protocol as F179).
FILES=SwaggerDocsTool.ts (session-anchor projectPath/outputPath via shared path util; reject traversal/absolute-outside with a sentence) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=generate RED->GREEN (lands inside session root with byte-verified spec+HTML); traversal/absolute-outside refused with a sentence (fixture-owned outside dir); no api/ strays asserted; AGENTS gates
REAL_JOE_UAT=none (tool-local containment)
ROLLBACK=revert path change
DEPENDENCIES=WIRING-P2-037 (anchoring must follow the ONE reconciled containment rule)

---

BATCH_ID=WIRING-P1-016
CAPABILITIES=fetch-family SSRF read surface (http_fetch/html_extract/rss_fetch: no URL policy)
ROOT_CAUSE=ContentTools.ts:24-38, :53-88, :101-120 pass any non-empty url to fetch/parseURL with NO scheme/host/credential check. Proven live 2x (025/F189): file:///etc/hostname reached fetch ('fetch failed' from undici, zero I/O) -- the tool validated nothing. Internal/link-local/intranet URLs are code-certain reachable (never live-probed, embargoed) and return a 1000-char snippet. In-repo precedents ignored: api_tester ^https?:// guard (ApiTesterTool.ts:44-46, live-proven 025/F191) + api-discovery assertSafePublicUrl (scheme+credential+internal-host+private-IP+DNS-rebinding, network-policy.ts:36-49). http_fetch/html_extract are priority-listed at 60/30 per min, widening exposure.
FILES=ContentTools.ts HttpFetchTool+HtmlExtractTool+RssFetchTool (one shared URL policy: api_tester scheme rule minimum, assertSafePublicUrl class preferred; rss limit sanity) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=file:/internal/private-link-local shapes refused pre-fetch with a sentence (RED->GREEN, loopback legs only AFTER the policy lands, never before); honest sync-reject shapes preserved ('Failed to parse URL', 'fetch failed'); AGENTS gates
REAL_JOE_UAT=none (tool-local policy)
ROLLBACK=revert policy change
DEPENDENCIES=none (policy precedents already in-repo)

---

BATCH_ID=WIRING-P2-024
CAPABILITIES=shell_execute exit-code fidelity
ROOT_CAUSE=exitCode built as r.ok ? 0 : 1 at the tool layer (SystemTools.ts) -- real codes (3/134/137/...) destroyed; verifiers/self-fix cannot distinguish failure modes. Source-proven + live shape-confirmed (exitCode always in {0,1}); clean live isolation impossible while F135 stands (019/F136). Sibling of F102 (repo_run_command exit=undefined) in the opposite direction.
FILES=SystemTools.ts shell_execute (+ audit sibling collapses) + evidence-shape tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=non-zero-exit RED->GREEN (real code preserved end-to-end); no-behavior-change for ok paths; AGENTS gates
REAL_JOE_UAT=none (evidence fidelity; covered by harness)
ROLLBACK=revert shape change
DEPENDENCIES=WIRING-P1-010 (clean isolation needs honored cwd)

---

BATCH_ID=WIRING-P2-025
CAPABILITIES=json_query missing-path receipt honesty + verdict mapping (MISMATCH #15)
ROOT_CAUSE=missing-path lookup returns {ok:true, output:{value:undefined}} and JSON serialization drops the key, so the receipt (output:{}) cannot distinguish missing from null from undefined; verdict maps the shape PASSED. Proven live 2x (020/F143): ({a:1}, 'a.b.c') -> ok:true + {}. A behavior check built on json_query would close PASSED on a missing value (sibling of #14 dryRun-blindness, loss one layer earlier).
FILES=ContentTools.ts JsonQueryTool (explicit found:boolean or equivalent) + verification-ledger verdict mapping (found:false must not close a behavior check) + contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=missing-path RED->GREEN (found:false in receipt; check fails); present-value/null positives preserved; empty-path behavior pinned; AGENTS gates
REAL_JOE_UAT=none (contract harness)
ROLLBACK=revert shape change
DEPENDENCIES=MISMATCH #14 batch (same verdict-mapping area)

---

BATCH_ID=WIRING-P2-026
CAPABILITIES=query_optimizer description honesty + missing-sql input guard
ROOT_CAUSE=(a) description promises 'using EXPLAIN ANALYZE' but the tool runs pure heuristic static analysis (output label is honest; planner-facing description is not) -- proven live 2x (020/F144); (b) required:['sql'] unenforced at tool and gateway: {} yields ok:true + nonsense 'Missing WHERE' suggestion on 'UNDEFINED' (020/F150). Planner/verifier overstate what was measured.
FILES=DatabaseEnterpriseTools.ts QueryOptimizerTool (description correction or real live-EXPLAIN mode; missing-sql rejection) + contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=description-accuracy assertion (or live-EXPLAIN flag contract); missing-sql RED->GREEN (sentence rejection); heuristic positives preserved; AGENTS gates
REAL_JOE_UAT=none (contract harness)
ROLLBACK=revert description/guard change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-027
CAPABILITIES=large_data_seeder rows input contract (explicit 0)
ROOT_CAUSE=`Math.max(1, Math.min(Number(input?.rows) || 1000, 1M))` maps explicit rows:0 to the 1000 default (falsy), so a 'zero rows' request silently writes 1000 rows. Proven live 2x (020/F145): rows:0 -> ok:true + 12788-byte file. NaN -> 1000 by the same mechanism (code-cited).
FILES=DatabaseEnterpriseTools.ts LargeDataSeederTool (distinguish absent/NaN from explicit 0) + contract tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=rows:0 RED->GREEN (reject or honest no-op); absent/NaN default-1000 preserved; negatives pinned; AGENTS gates
REAL_JOE_UAT=none (contract harness)
ROLLBACK=revert contract change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-028
CAPABILITIES=query_datasource fetch transport bounds + scheme
ROOT_CAUSE=(a) ip_geolocation uses plaintext http://ip-api.com while all 7 siblings use https; (b) none of the 8 fetch calls carries a timeout or AbortSignal, so an unresponsive endpoint hangs the tool call unboundedly. Static both sides (020/F149, DatasourceTool.ts); real-source legs embargoed (network). Reliability sibling of the provider-lease theme; no Real Joe incident claimed.
FILES=DatasourceTool.ts (https for ip-api; bounded timeout/abort on all 8 fetches) + transport tests with fake timers/stub fetch
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=stalled-endpoint RED->GREEN (bounded rejection, no hang); scheme assertion (no http:// data fetch); all-source error-shape preserved; AGENTS gates
REAL_JOE_UAT=none (transport harness; no real endpoints in tests)
ROLLBACK=revert transport change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-029
CAPABILITIES=performance_analyzer receipt honesty + input guard (missing/empty/missing-field)
ROOT_CAUSE=(a) missing files are silently `continue`d and files:[] short-circuits to the same shape, so nonexistent-path and empty-array legs return ok:true + score 100 shape-identical to a clean analysis (live 2x, 021/F153, MISMATCH #16: caller cannot distinguish "analyzed and clean" from "never analyzed"; verdict maps to passed); (b) {} throws raw TypeError on files.length with no input guard, gateway required:['files'] unenforced (live 2x, 021/F155, same family as F150).
FILES=PerformanceAnalyzerTool.ts (analyzed/skipped counts in output; reject missing files with a sentence) + verdict-map note for zero-analyzed receipts
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=missing-file leg carries skipped count (not clean-shaped); empty-array rejected or zero-analyzed-marked; {} rejected with a sentence; clean/nasty regression; AGENTS gates
REAL_JOE_UAT=none (receipt contract tests)
ROLLBACK=revert receipt change
DEPENDENCIES=none (sibling of P1-011, same file; may share owner)

---

BATCH_ID=WIRING-P2-030
CAPABILITIES=monitoring unknown-event tracked honesty
ROOT_CAUSE=track switch has no default (MonitoringTool.ts:94-144): unknown events are silently dropped while the receipt claims tracked:true (live 2x, 021/F154, MISMATCH #17; metrics confirm the event was never counted). Verdict maps to passed.
FILES=MonitoringTool.ts (tracked:false + accepted-event list for unknown events, or explicit custom-event support) + focused tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=unknown-event RED->GREEN (tracked:false + accepted list); known-event regression; metrics-count consistency; AGENTS gates
REAL_JOE_UAT=none
ROLLBACK=revert honesty change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-031
CAPABILITIES=observability store scoping (alert/logger/monitoring process-global unpersisted session-blind stores)
ROOT_CAUSE=all three stores are `private static` with NO sessionId/userId field in any method (AlertManagerTool.ts:72-89, LoggerTool.ts:65-71, MonitoringTool.ts:51-62): one session's clear/reset wipes EVERYONE's state, list/query leak across sessions, process restart loses everything. Live behavior (clear->zero, reset->zero) + code-cited; cross-session impact code-cited, NOT live-probed (021/F157). Sub-notes: logger over-declares permissions ['write'] for memory-only writes; alert history unbounded (vs logger 10k / monitor-errors 100); monitoring averageBuildTime divides by successfulRequests.
FILES=AlertManagerTool.ts + LoggerTool.ts + MonitoringTool.ts (session-scope or persist with owner binding; document process-local dev-only semantics meanwhile)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=two-context isolation (clear in A preserves B); restart-persistence or documented-dev-only; cap parity for alert history; AGENTS gates
REAL_JOE_UAT=none (isolation harness; no cross-user probing in prod)
ROLLBACK=revert scoping change
DEPENDENCIES=none (cross-session live probing needs ownership decision first)

---

BATCH_ID=WIRING-P2-032
CAPABILITIES=todo_write receipt shape + input guard (data-drop null output + TypeError)
ROOT_CAUSE=(a) tool returns {ok, data:{acknowledged,count}, logs} but the canonical path reads res.output only (ToolService.ts:879/963, no data passthrough), so EVERY todo_write receipt is ok:true + output null — contradicting its own declared outputSchema {acknowledged,count} and mapping to verdict passed on null evidence (live 2x, 022/F160, MISMATCH #18; count survives only in a log line); (b) missing todos throws raw TypeError on input.todos.length, required:['merge','todos'] unenforced by tool and gateway (live 2x, 022/F161, same family as F150/F155).
FILES=TodoWriteTool.ts (return output:{acknowledged,count}; reject missing todos with a sentence) + `data`-field consumer survey before dropping `data`
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=canonical-path output-shape assertion (acknowledged/count present); missing-todos rejection with a sentence; merge/replace/empty regression; AGENTS gates
REAL_JOE_UAT=none (receipt contract tests)
ROLLBACK=revert receipt change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-033
CAPABILITIES=business_profile slot scope (shared-default write + wipe)
ROOT_CAUSE=setProfile writes BOTH the session slot and the shared 'default' slot; clearProfile deletes BOTH (business-profile.ts:57-79). Proven live 2x via store read (022/F162): after save slots=[own,default] with identical PII; after clear slots=[]. Save-side sharing is documented intent; clear-side wipes every session's profile. Cross-session READ impact code-cited (default fallback :47-53), not live-probed with a second session. Privacy posture auditFields=[] must be preserved.
FILES=business-profile.ts (scope clear to own slot or make default-wipe explicit; document shared-default semantics) + BusinessProfileTool.ts if copy changes
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=second-context test (save in A visible via default in B OR explicitly scoped; clear in A preserves default unless explicit); no-PII-in-audit regression; AGENTS gates
REAL_JOE_UAT=none (isolation harness with synthetic fixtures)
ROLLBACK=revert scope change
DEPENDENCIES=none (cross-session live probing needs ownership decision first)

---

BATCH_ID=WIRING-P2-034
CAPABILITIES=form_inbox language branch (dead isAr)
ROOT_CAUSE=`|| true` at FormInboxTool.ts:26 hardwires isAr: English requests always receive the Arabic message (live 2x, 022/F163). Minor i18n defect, no data impact.
FILES=FormInboxTool.ts (drop `|| true` or wire real request language)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=English request -> English message; Arabic default preserved; session scoping regression (022/F166 legs); AGENTS gates
REAL_JOE_UAT=none
ROLLBACK=revert one-line change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-035
CAPABILITIES=infra trio spawn-failure error channel (terraform/k8s/swarm omit `error`)
ROOT_CAUSE=TerraformManagerTool (:124-131), KubernetesOpsTool (:181-185) and DockerSwarmOpsTool (:237) return {ok:r.code===0, output:{...}, logs} with NO error key on the failure leg; ToolService synthesizes 'Tool reported failure without an error message'. Proven live 2x (023/F170): plan/get/list legs all carry that generic error while the REAL diagnostic (UNC-cwd warning + 'X is not recognized') sits in output only. Impact is debuggability: Joe cannot distinguish binary-missing from bad-args from wrong-cwd and cannot self-repair. spawnWithTimeout itself is honest-direction (reads data.exitCode, InfrastructureTools.ts:55).
FILES=InfrastructureTools.ts (include exitCode + stderr tail in `error` on the 3 failure legs) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=spawn-failure RED->GREEN (error names the cause: binary/exit/stderr tail); guard-legs regression (sentences intact); AGENTS gates
REAL_JOE_UAT=none (error-channel contract tests)
ROLLBACK=revert error-channel change
DEPENDENCIES=none (do NOT change ToolService's generic synthesis without a broader review -- it affects every tool)

---

BATCH_ID=WIRING-P2-036
CAPABILITIES=doc_generator counts + extensionless overwrite (lying receipt + destructive write)
ROOT_CAUSE=(a) functions counted by /###\s+Function/g but headers are emitted as `### ${funcName}` (AdvancedTools.ts:844 vs 823) -- matches only a function literally named Function*; classes counted by /##\s+Class/g which matches the always-emitted `## Classes` header (:856 vs 824) -- exactly 1 regardless of content. Proven live 2x (023/F171): 2 real functions + 1 real class -> {functions:0, classes:1} on js/html/noext/outside legs (the .md BODY is correct -- only the machine-readable counts lie). (b) sourcePath.replace(/\.\w+$/, ...) is a no-op for extensionless names, so outputPath === sourcePath and writeFileSync clobbers the input (:816-817). Proven live 2x (023/F172): sourceOverwritten:true + afterIsDocs:true on a fixture-owned file. Destructive on real extensionless files (README, LICENSE, Makefile).
FILES=AdvancedTools.ts DocumentationGeneratorTool (count emitted headers/matches; refuse-or-suffix when the extension replace is a no-op) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=counts RED->GREEN (2 functions + 1 class -> {2,1}; 0-class file -> classes:0); extensionless RED->GREEN (source bytes survive, docs land beside or refused with a sentence); missing/empty/outside regression; AGENTS gates
REAL_JOE_UAT=none
ROLLBACK=revert count/write change
DEPENDENCIES=WIRING-P2-037 for the outside-write half (containment rule decision)

---

BATCH_ID=WIRING-P2-037
CAPABILITIES=containment-rule split (strict-local vs worktree-wide resolveToolPath)
ROOT_CAUSE=two resolveToolPath implementations with different rules: InfrastructureTools-local (strict -- inside session root only, :16-31) vs shared utils.ts (allows activeRoot OR buildsDir OR projectRoot (the WHOLE worktree) OR externalRoot, utils.ts:101-106). Proven live 2x (023/F173): the SAME outside-session dir -> tf.outside REFUSED (internal_exception path_outside_workspace, thrown outside try at :96) while dg.outside WROTE outer.md ok:true. The worktree-wide allowance is deliberate per code comments (Wakil 6.8), so this is a documented-but-weak boundary + an inconsistency: cross-session project read/write inside the worktree is permitted by the shared util today. Same-path-different-verdict is the crisp defect.
FILES=InfrastructureTools.ts + utils.ts + containment contract tests (ONE documented rule; decide session-scoped vs worktree-scoped with the Codex owner-binding + shared-default work in view)
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=same-path cross-tool RED->GREEN (one outside-session path, every file tool, one verdict); legitimate worktree paths pinned (no false refusal); session isolation pinned per the decided rule; AGENTS gates
REAL_JOE_UAT=none (containment contract tests)
ROLLBACK=revert rule change
DEPENDENCIES=decision input from the tool-owner security scope (35bf42dd line) + shared-default semantics (P2-033)

---

BATCH_ID=WIRING-P2-038
CAPABILITIES=ci_generate_pipeline input contract (empty path writes + kind ignored)
ROOT_CAUSE=(a) required:['path'] unenforced by tool AND gateway; '' resolves to the active root (QualityTools.ts:370 via shared resolveToolPath) and the tool writes .github/workflows/node-ci.yml there. Proven live 2x (023/F175): ci.empty ok:true + session-root workflow created (probe-restored, cleanup ok). (b) `kind` (enum ['node']) is never read by execute() -- schema-only; kind:'python' still writes node CI (live 2x). Same input-guard family as F164/F161 but with a real write effect (stray CI file in whatever the active root is).
FILES=QualityTools.ts CiGeneratePipelineTool (reject empty path with a sentence; enforce kind or drop it from the schema) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=empty-path RED->GREEN (refused, nothing written -- assert session root clean); kind pinned (python rejected-or-honored per decision, node regression); create+skip roundtrip regression (byte-verified content); AGENTS gates
REAL_JOE_UAT=none
ROLLBACK=revert guard change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-039
CAPABILITIES=go_builder + java_builder build/test/dependencies canned success:true (no toolchain invocation, no filesystem effect)
ROOT_CAUSE=buildProject/setupTests/manageDependencies never spawn go/mvn/gradle and never touch the filesystem (GoBuilderTool.ts:481-524, JavaBuilderTool.ts:393-437); they return ok:true + output.success:true with 'Use X to...' messages. Proven live 2x (024/F180): 6/6 canned legs ok:true (gradle/maven switch works, deps echoed-never-installed). Verdict maps them passed, so Joe records builds/tests that never ran.
FILES=GoBuilderTool.ts + JavaBuilderTool.ts (perform the effect OR return a plan-shape WITHOUT success:true, e.g. {planned:true} + failed/unsupported verdict) + shape tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=canned-shape RED->GREEN (no success:true without effect; plan-shape pinned; gradle/maven switch + deps echo preserved); if the effect is implemented: missing-toolchain honest-fail legs; AGENTS gates
REAL_JOE_UAT=none (tool-local honesty)
ROLLBACK=revert shape change
DEPENDENCIES=WIRING-P1-010 (if the effect is implemented, spawn must use the fixed spawn boundary)

---

BATCH_ID=WIRING-P2-040
CAPABILITIES=python_builder contract (pure generator in write clothing; unknown-framework silent fallthrough; raw TypeError on {})
ROOT_CAUSE=(a) execute() only generates file CONTENTS and returns them in output; required projectPath is read solely for the 'cd' nextSteps hint (PythonBuilderTool.ts:63-79) -- yet the tool declares write/write permissions + required projectPath (024/F181, wroteProjectPath:false live 2x). (b) The framework enum is unenforced and generateStructure's switch has no default-reject (:111-130): 'rails' -> ok:true + 3 common files, no error (024/F182 live 2x). (c) {} -> raw "Cannot read properties of undefined (reading 'toUpperCase')" via the README template (:107), same error-hygiene family as F155/F161 (024/F183 live 2x).
FILES=PythonBuilderTool.ts (materialize-or-declare-generator for projectPath/write; reject unknown framework with the enum sentence; sentence-validate required inputs) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=generator-vs-writer RED->GREEN per the chosen semantics (either tree materialized under session root with F179's rule, or write declarations + required projectPath dropped); unknown-framework refused with enum sentence; {} refused with a sentence (no TypeError); flask/db/auth additivity regression; AGENTS gates
REAL_JOE_UAT=none
ROLLBACK=revert contract change
DEPENDENCIES=WIRING-P2-037 if the materialize direction is chosen (session-root anchoring)

---

BATCH_ID=WIRING-P2-041
CAPABILITIES=execute_python hardening (system-temp code staging; 'isolated environment' overclaim; uncontained workingDirectory)
ROOT_CAUSE=(a) Code is staged to os.tmpdir() (PythonExecutionTool.ts:66-67) -- outside the session root in production (in-probe TEMP was fx-redirected); the tool unlinks after itself (:82, :103) but a kill between write and unlink leaves Joe-authored code in shared temp. (b) Description claims an 'isolated environment' (:12) -- false by construction: cwd = input.workingDirectory || process.cwd() (:56), no sandboxing, full stdlib incl. os. (c) workingDirectory passes to the gateway uncontained (no resolveToolPath; live UNPROVEN -- every spawn leg died at python3 ENOENT before cwd mattered). Positive anchor: missing interpreter fails HONESTLY (ok:false + 'spawn python3 ENOENT' + exitCode 1, live 2x, 024/F184) -- no F169-class false success.
FILES=PythonExecutionTool.ts (stage under session/fx temp; contain workingDirectory to session root; correct the description) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=staging-contained RED->GREEN (no os.tmpdir writes); outside workingDirectory refused; description no longer claims isolation; ENOENT honest-fail regression (ok:false + exitCode 1); AGENTS gates
REAL_JOE_UAT=none
ROLLBACK=revert hardening change
DEPENDENCIES=WIRING-P2-037 (workingDirectory containment follows the ONE rule); owner live-checks python-present behavior (exit codes, cwd effects, 120s cap) on a box with python3 or a stubbed gateway leg -- embargoed in the audit

---

BATCH_ID=WIRING-P2-042
CAPABILITIES=verdict status-vocabulary collision (MISMATCH #20: numeric HTTP status misread as workflow status)
ROOT_CAUSE=verificationResultFromToolResult reads output.status through a WORKFLOW vocabulary (verification-ledger.ts:656, :663 -- only completed/passed/succeeded/ok pass; any other truthy value => incomplete). Honest http_fetch/api_tester ok-shapes {status:200} therefore map incomplete (pure-function table proof, 025/F192). Tools are honest; the CONSUMER misclassifies. Same-file siblings (ride the #13 batch, no new numbers, 025/F193): validate_api UNKNOWN-shape {health:'UNKNOWN'} => passed (unvalidated API closes a check); swagger validate-fail {valid:false, no error key} => incomplete (decisive invalid understated).
FILES=verification-ledger.ts verificationResultFromToolResult (type-gate the status vocabulary: numeric != workflow word; prefer output success/valid/health-class booleans) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=200-shape => passed RED->GREEN; genuine incomplete shapes preserved; UNKNOWN/valid:false sibling shapes mapped honestly (fix the class, not one shape); AGENTS gates
REAL_JOE_UAT=none (mapping-level)
ROLLBACK=revert mapping change
DEPENDENCIES=MISMATCH #13 batch (same verdict-mapping area; fix output-semantics blindness as a class)

---

BATCH_ID=WIRING-P2-043
CAPABILITIES=swagger_docs correctness (raw title into generated HTML; addEndpoint missing-method TypeError; unbounded scan)
ROOT_CAUSE=(a) generateSwaggerHTML interpolates title RAW (SwaggerDocsTool.ts:339-362) -- 'fx<b>net' byte-verbatim in swagger-ui.html, live 2x (025/F198b, generated-file XSS hygiene). (b) addEndpoint calls ep.method.toLowerCase() unguarded (:260) -- missing method yields raw TypeError, live 2x (025/F198c, F183-class error hygiene). (c) scanRoutes is unbounded: no depth limit, statSync follows symlinks, scans dist/ .js (only node_modules + dotfiles excluded, :203-244, code-cited). Core generate/validate/serve honest live 2x -- defects are around the core, not the core.
FILES=SwaggerDocsTool.ts (escape title; validate endpoint method/path with sentences; bound scan: depth + no-follow + dist exclusion) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=escaped-title bytes RED->GREEN; missing-method sentence-error RED->GREEN (no 'Cannot read'); bounded-scan negative (symlink loop + dist noise excluded); AGENTS gates
REAL_JOE_UAT=none
ROLLBACK=revert correctness change
DEPENDENCIES=WIRING-P1-015 (same tool; paths first, correctness second)

---

BATCH_ID=WIRING-P2-044
CAPABILITIES=credential-tool hardening (google_account gmail_send header injection + undeclared send; payments unvalidated financial inputs + undeclared finance)
ROOT_CAUSE=(a) gmail_send interpolates RAW to/subject/body into RFC822 headers (GoogleAccountTool.ts:104-106) -- to/subject containing CRLF inject headers (code-certain, never live-probed: sends real email); sideEffects=[] despite send-email. Guard order + max clamp 1..25 + bilingual unconnected message are honest (live 2x / code-read, 025/F195). (b) PaymentsTool never validates amount (NaN/negative/zero reach Math.round -> Stripe) or success/cancel URLs (merchant-redirect surface); sideEffects=[] for a FINANCIAL tool (self-admitted :54). stripe_not_configured gate honest live 2x interlocked (025/F196).
FILES=GoogleAccountTool.ts (single-address to validation + CRLF strip/forbid in to/subject + sideEffects declaration) + PaymentsTool.ts (positive-amount + redirect-URL validation + sideEffects declaration) + tests
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=CRLF/negative-amount/bad-URL sentence negatives RED->GREEN (fixture-level, NEVER live gmail_send/Stripe); not-connected/not-configured anchors preserved; AGENTS gates
REAL_JOE_UAT=none (validation-level; no live credentialed legs)
ROLLBACK=revert validation change
DEPENDENCIES=none

---

BATCH_ID=WIRING-P2-023
CAPABILITIES=deploy package zip-path shell interpolation (sibling of P1-009)
ROOT_CAUSE=`zip -r ${zipPath} . ...` with shell:true (DeployProjectTool.ts package branch); zipPath derives from the workspace-contained projectPath, so traversal is contained but metacharacters in a directory name (e.g. `ws/evil;cmd/`) would break out of the command. Found during the P1-009 slice; not yet RED-proven.
FILES=DeployProjectTool.ts (quote/argv-harden the zip invocation or reject metacharacter names) + contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=metacharacter-dirname RED->GREEN (no breakout; honest error or correct packaging); zip positives with spaces in path; AGENTS gates
REAL_JOE_UAT=none required (local harness)
ROLLBACK=revert quoting change
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
ROOT_CAUSE=task_lifecycle declares required:['action'] but execute() defaults action='update' and returns ok:true on {} (sweep1.json, rerun-stable); no central schema gate — validation is per-tool; 25 no-required tools PARTITIONED 18 SAFE + 1 BOUND + 4 EMBARGO (static fixture designs in 008) + 2 FIXTURE (probed contained in 008). Absence-as-success shape: project_stop/orders_read/form_inbox/browser_consent return ok:true for absence (honest messages; ok-only verifiers would misread) + read_file {} returns ok:true EMPTY directory auto-list (sweep3.json, rerun-stable — 5th instance) + project_edit no-project returns ok:true 'No active project' message (trunk_files.json, live — 6th instance) + test_generator .ts-under-node-runner returns ok:true + generated:false/skipped:true (trunk_testing.json, live 2x — 7th instance, 013/F80) + secrets_scan_repo nonexistent-path returns ok:true findings:[] scannedFiles:0, byte-identical to clean (trunk_security.json, live 2x — 8th instance, 014/F85) + analyze_project missing-path returns ok:true + {status:'error'} (trunk_code.json, live 2x — 9th instance, 015/F94; both AnalysisTools siblings return honest ok:false) + pattern_recognize no-language returns ok:true + patterns:[] (trunk_code.json, live 2x — 10th instance, 015/F96) + auto_refactor sort-only returns ok:true + changes:[] with zero effect (trunk_code.json, live 2x — 11th instance, no-op success, 015/F97) + github_actions bogus-type returns ok:true with node-ci CONTENT under the bogus name (trunk_vcs.json, live 2x — 12th instance, silent substitution, 016/F103) + import_project no-URL returns ok:true + guidance message with zero effect (trunk_vcs.json, live 2x — 13th instance, guidance-pass, 016/F104) + auth_builder out-of-enum 'saml' returns ok:true "generated" with a 2-file stub missing its type branch (trunk_build.json, live 2x — 14th instance, degraded stub, 017/F113) + scaffold_full_stack name-defaults to my-app + accepts 'cobol' type with identical output (trunk_build.json, live 2x — 15th instance, silent defaults, 017/F115) + scaffold_project traversal-key ok:true with escaped file + base-naming receipt (trunk_build.json, live 2x — 16th instance, receipt/base mismatch, 017/F111) + scaffold_project {} returns ok:true + created:[] with zero effect (trunk_build.json, live 2x — 17th instance, no-op ok, 017) + deploy_project start_server returns ok:true/running + localhost URL for a dead port with no health check (trunk_runtime.json, live 2x - 18th instance, hollow running, 018/F125). Decorative-required instances: task_lifecycle (above) + secrets_scan_repo required:['path'] never enforced — missing path maps to default-workspace scan (pure mapping proof, 014/F86; session escape) + pattern_recognize required:['code','language'] with language never enforced (live 2x, 015/F96) + api_tester required method defaulted to GET (missing method reaches scheme check, live 2x, 025/F191) + payments required:['amount','productName'] unenforced ({} byte-identical to valid shape, live 2x interlocked, 025/F196) + google_account required:['action'] unenforced ({} yields connection error, never schema error, live 2x, 025/F195) + rss_fetch required:['url'] unenforced ({} reaches the parser, no guard unlike siblings, live 2x, 025/F190). project_undo default-latest-restore code-indicated (ProjectUndoTool.ts:98-100), fixture-unconfirmed.
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
ROOT_CAUSE=tools returning {ok:false} with no `error` field get generic 'Tool reported failure without an error message'; real cause sits in output (e.g. output.stderr) and never surfaces (2 instances: batch-1 rss_fetch, batch-2 repo_diff_summary in sweep1/2.json). EXTENDED 013/F76 (3rd instance, cause-SUBSTITUTION not absence): same nested npm exit-1 surfaced run-varying text across 2 runs — run 1 auto.unit.fail error was npm self-update NOTICE stdout noise (exit cause nowhere in the message), run 2 same leg was generic 'command_failed'; run 2 quality.test.fail per-task error was '' (empty string). Origin is below the tools (nested shell_execute/handleShellCommand error mapping). EXTENDED 014/F83 (4th instance, cause-substitution + CONTENT variance): same audit.empty-dir leg run 1 report = pure npm self-update NOTICE (cause nowhere), run 2 report = ancestor audit JSON (multer/high) — verdict-stable ok:false, report content entirely different. MECHANISM-RESOLVED 016/F102 (diff instance + runcmd sibling): repo_diff_summary is ALWAYS ok:false without error because ExecutionEngine.run() drops exitCode (MISMATCH #12) — the generic wrapper message is a symptom of the engine contract, not a git failure; same always-false afflicts repo_run_command (with 'command_failed'). Repair: run() exposes exitCode like runArgv, or both tools use result.ok (needs engine-owner review; shared component). EXTENDED 025/F190 (5th instance class, dependency-throw shape): rss_fetch {} and garbage URLs yield the substituted generic message because rss-parser throws AggregateError with EMPTY message (direct no-network proof) and the tool's catch surfaces e.message='' (falsy) — the cause dies inside the dependency's throw shape. Repair: tool surfaces a cause-bearing sentence (String(e) + parser error aggregation) + enforces the url guard.
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
ROOT_CAUSE=both default to getWorkspaceRoot() (Joe's own repo) ignoring session context (DeadCodeTool.ts:46-52, QualityTools.ts:89-96); then run npx knip / npm audit (network + long runtime). autoFix:boolean declared on dead_code_detector but never read — planner-facing dead input (checkpoint 6 static; fixture-only, never {}). EXTENDED 014/F83 (npm UPWARD escape): even an EXPLICIT contained path escapes when the dir lacks package.json — npm prefix resolution walks up and audits the ancestor package (live 2x: empty session fixture audited Joe's own root over the network, multer/high report). Explicit-path usage is therefore uncontained too, not only the default root. EXTENDED 015/F93 (no-context resolver): codebase_outline takes NO context param and resolves relatives against process.cwd() (api/) + reads absolute paths unrestricted (live 2x: relative read api/package.json, absolute read OS-temp file). EXTENDED 015/F100 (4th no-context instance, static): DeadCodeTool.execute() takes no context and resolves via no-arg getActiveRoot(). EXTENDED 016/F104 (absolute-outside accepted): import_project session-anchors relatives but opens absolute OS-temp paths with full audit + registration (live 2x). EXTENDED 016/F103 (5th no-context instance): github_actions takes NO context and writes projectPath raw, incl. OS-temp outsiders (live 2x; repair rides WIRING-P1-006). EXTENDED 016/F107 (raw explicit cwd; default-cwd attribution CORRECTED 017/F121 to UNPROVEN — depth-3 ambiguity, ambient mechanism predicts session root, marker re-probe outstanding): git_ops explicit OS-temp cwd honored raw (live 2x). EXTENDED 017/F111+F112 (scaffold base-escape + repo-root write): traversal keys escape the base into the session root with ok:true + lying receipt; baseDir '../../..' wrote a.js at the REPO ROOT (live 2x, probe-removed) — repair rides WIRING-P1-007. EXTENDED 017/F114 (auth root split): relatives forced to session-agnostic data/builds/workspace-default; in-project absolutes honored; true outsiders refused (live 2x). EXTENDED 017/F117 (raw input.root): api_project root honored outside the session (live 2x; react twin code-cited) — repair rides WIRING-P1-007. EXTENDED 017/F119 (model-before-containment): ai_write_file traversal reaches the model (live 2x). EXTENDED 017/F115 (code-cited defaults): mobile_builder init outputDir defaults to process.cwd(); scaffold_full_stack Builder defaults baseDir to repo data/projects + overwrite:true default. EXTENDED 020/F146 (6th no-context instance, live 2x + readback): large_data_seeder calls resolveToolPath WITHOUT workspaceId, so outputs land in session-agnostic data/builds/workspace-default instead of the session dir (containment holds -- absolute-outside refused; session isolation does not).
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
ROOT_CAUSE=zip create shells `zip -r ... 2>/dev/null || true` (ArchiveFilesTool.ts:92): no `zip` binary on Windows, `|| true` swallows the failure, then statSync on the never-created archive throws ENOENT surfaced as 'Archive operation failed: ENOENT ... stat b.zip' — 'tool missing' misreported as 'archive missing'. Proven live: zip create 0/2, tar.gz create+list ok:true on the same fixture (trunk_files.json + arch2.json). Secondary: tar.gz list shows absolute-source path stored in archive (extraction-path review). 3rd instance: deploy_project package on Windows returns raw stat ENOENT with no zip created (trunk_runtime.json, live 2x, 018/F127). 4th instance: shell_execute missing cwd yields `spawn C:\WINDOWS\system32\cmd.exe ENOENT` (missing directory misreported as missing binary; no pre-spawn cwd check; trunk_shell.json, live 2x, 019/F138).
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
