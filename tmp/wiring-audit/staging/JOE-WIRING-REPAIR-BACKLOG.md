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
CAPABILITIES=schema/execute consistency (task_lifecycle required-vs-default gap) + empty-input honesty sweep continuation (25/25 reviewed, 19 probed live in sweep2.json; risk-tier 19 in sweep3.json; files-trunk 16 live in trunk_files.json)
ROOT_CAUSE=task_lifecycle declares required:['action'] but execute() defaults action='update' and returns ok:true on {} (sweep1.json, rerun-stable); no central schema gate — validation is per-tool; 25 no-required tools PARTITIONED 18 SAFE + 1 BOUND + 4 EMBARGO (static fixture designs in 008) + 2 FIXTURE (probed contained in 008). Absence-as-success shape: project_stop/orders_read/form_inbox/browser_consent return ok:true for absence (honest messages; ok-only verifiers would misread) + read_file {} returns ok:true EMPTY directory auto-list (sweep3.json, rerun-stable — 5th instance) + project_edit no-project returns ok:true 'No active project' message (trunk_files.json, live — 6th instance). project_undo default-latest-restore code-indicated (ProjectUndoTool.ts:98-100), fixture-unconfirmed.
FILES=TaskLifecycleTool.ts (enforce required OR drop it from schema) + absence-as-success verifier note — EVIDENCED 012/F69: verdict mapping is ok/error-only and content-blind for all 43 swept tools (passed = check executed, never = requested behavior observed; hollow-pass shapes: 6 absence-instances + extract-swallow + empty-search-answer, all mapping in the safe direction) + project_undo snapshot fixture
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=schema/execute consistency gate for task_lifecycle ({} -> honest error OR schema without required); verifier MUST read message/flags, not ok alone, for the 5 absence tools; project_undo fixture (snapshots present) to confirm/deny default-restore; AGENTS gates if ToolService touched (it is not — tool-local fix + verifier note)
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
ROOT_CAUSE=zip create shells `zip -r ... 2>/dev/null || true` (ArchiveFilesTool.ts:92): no `zip` binary on Windows, `|| true` swallows the failure, then statSync on the never-created archive throws ENOENT surfaced as 'Archive operation failed: ENOENT ... stat b.zip' — 'tool missing' misreported as 'archive missing'. Proven live: zip create 0/2, tar.gz create+list ok:true on the same fixture (trunk_files.json + arch2.json). Secondary: tar.gz list shows absolute-source path stored in archive (extraction-path review).
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
ROOT_CAUSE=any non-ok npm audit result returns error 'Audit found security vulnerabilities.' (QualityTools.ts:102) even when the cause is environmental (proven: ENOLOCK missing-lockfile in contained fixture, trunk_files.json). output.report DOES carry the real stderr, so cause is recoverable — but ok/error-only consumers (planner/verifier) misread a setup failure as a security finding.
FILES=QualityTools.ts DependencyAuditTool (classify cause: vulnerabilities vs setup/environment failure; error text must reflect the class) + error-text contract test
IMPLEMENTATION_OWNER=UNASSIGNED
REVIEW_OWNER=UNASSIGNED
TESTS=ENOLOCK/setup RED->GREEN (honest setup-failure error); true-vulnerability case keeps current text; AGENTS gates
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
CAPABILITIES=model-fallback contract for browser model-touching tools (summarize/translate/smart_agent + search variance)
ROOT_CAUSE=routeToModel no-provider path RESOLVES failure prose (intelligent-router.ts:2201/2778/2789/2794, all `return`) instead of throwing — so tool try/catch + empty/short-text fallbacks (summarize :885-888, translate :1203-1205, smart_agent :1714) never fire on this path. Honesty currently depends entirely on ToolService's central apology text scan (ToolService.ts:940-944 + honestResult.ts isApologyOnly: prefix + no artifact keys) — proven live: trio ok:false WITH full output (sumLen 252 + shot; target + 7 blocks; scores 75/54/70 + 8 findings). Consequences: (a) smart_agent's computed lenses are discarded though real (none are ARTIFACT_KEYS); (b) a future failure shape the scan misses would flow as false-success data; (c) search uses a DIFFERENT routeToModel call shape ({messages} object, no context, :2032) and reads .content off the resolved string -> '' so it escapes the flip with ok:true + empty answer (coherent today since results are the deliverable, but the two shapes are uncontracted).
FILES=intelligent-router.ts (resolve-vs-throw contract: throw typed no-provider OR document resolve-prose + provide isProviderFailure()) + 3 tool sites (detect prefix / use helper instead of empty-check) + honestResult.ts (keep as backstop; consider partial-output preservation rule) + search call-shape alignment + contract tests
IMPLEMENTATION_OWNER=UNASSIGNED (router + ToolService shared — coordinate; NVIDIA owns provider-adjacent planning? verify before assigning)
REVIEW_OWNER=UNASSIGNED
TESTS=resolve-vs-throw contract test (no-provider call shape asserted); trio RED->GREEN (honest failure WITH partials preserved or documentedly dropped); search empty-answer regression (results intact, ok:true stands); scan-miss negative (novel failure prose cannot pass as data); AGENTS gates
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
CAPABILITIES=verification scopeRoot resolution for path-arg checkers (read_file existence gates never reuse)
ROOT_CAUSE=phase-gate scopeRoot prefers verificationArgs.cwd/projectPath/path over the workspace root (PhaseExecutorTool.ts:2372-2378; same preference at task level :1570-1578), so a read_file gate with a workspace-relative path resolves scopeRoot against process.cwd() (the api/ server dir) — outside the workspace. fingerprintVerification takes the uncontained branch (nonce fingerprint, cacheable:false, 'trusted workspace containment is unavailable'). Proven live: V1 receipt scopeRoot `...\api\proof.txt` fp 89c4e353, V6 same checkId/args/files fp 50d47d6a + invalidated (012/F67, MISMATCH #10). Resume/reuse dead for this checker shape; receipt provenance misleading; no file bytes fingerprinted. Fail-safe direction (never wrongly reuses).
FILES=PhaseExecutorTool.ts gate + task-level scopeRoot resolution (resolve the checker's path arg inside the trusted workspace root, or fall back to the workspace root; receipt scopeRoot must never point at process.cwd()) + scope-resolution contract test
IMPLEMENTATION_OWNER=UNASSIGNED (PhaseExecutor shared — coordinate; NVIDIA owns adjacent planning work)
REVIEW_OWNER=UNASSIGNED
TESTS=scope-containment test: read_file gate on workspace-relative path -> receipt scopeRoot inside workspace (RED->GREEN); reuse test: carried ledger + unchanged files -> verification reused (RED->GREEN, V6 shape as contract); nonce-path regression (genuinely uncontained scope still fails safe to run-always); AGENTS gates
REAL_JOE_UAT=none (ledger mechanics; pass/fail behavior unchanged, only reuse + provenance)
ROLLBACK=revert scope-resolution change (back to always-run safe default)
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
