# WIRING-159 -- Code-analysis wiring census, live-verified (Muse independent)

MUSE_HEAD=cb91bf99 (tracked CLEAN at probe time; all 159 outputs new under tmp/wiring-159-analysis-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T20:04Z (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha D9BFACE7...); definition/registry/dispatch/ledger/planner/executor files READ as text. ZERO DISPATCH: executeTool never called, no analysis run, no files written, no commands run, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). One disclosed correction: first bundle run EXIT 1 on missing JWT_SECRET (config gate, no result); reran with synthetic secret -> 2/2 EXIT 0 byte-identical. Bundle deleted after runs, entry + logs + results preserved.

## TRIGGER
Shared repair backlog BATCH-P1-002 claims analyze_project, analyze_codebase,
codebase_outline and dead_code_detector are revived-but-invisible with only
project_detect planner-visible. The shared summary bins "analysis" under
INTERNAL_ONLY (~50) and marks Code Analysis Level-3 as "no path from planner".
Wiring-159 live-adjudicates the analysis chain on Muse HEAD and confirms what
the NVIDIA tree carries (read-only source check + uncommitted-diff attribution).

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163; chain 5/5 registered (analyze_project, analyze_codebase, project_detect, codebase_outline, dead_code_detector); adjacent engineering_discovery registered; all 6 hasExecute=true
- 5/5 chain names in their 3 definition files are registered live -> IMPLEMENTED_NOT_REGISTERED=0 HOLDS for this family
- TOOL_ALIASES chain hits: 0 (no chain aliases in the alias TABLE; ToolService hard-code fallbacks exist separately -- see below)
- PLANNER_TOOL_CATALOGUE chain hits: 1/5 (only project_detect) -> BATCH-P1-002 premise CORROBORATED live
- isVerificationTool unconditional-true: 0/6 (all false)
- resolvePlannedTool live, 8 phrases: 3 exact-green (analyze_project, project_detect, dead_code_detector); 4 UNKNOWN ('analyze the project structure and architecture', 'give me a deep architectural summary of this codebase', 'detect Node and Python projects under this folder', 'outline the classes and functions in server.js'); 1 MISROUTE ('find unused files and dependencies with knip'->npm_manager via meaning, on the word 'dependencies')
- NOTE: even the CATALOGUED tool's natural phrase ('detect Node and Python projects...') resolves UNKNOWN -- catalogue entry alone does not route; plan-tools.ts carries ZERO MEANS keys for any chain tool (2 chain refs total: catalogue purpose line + comment). Catalogue-without-MEANS is exactly-name-only.
- gateShapes, 7/7 false: detect-valid, detect-empty, analyze-project, analyze-codebase, outline-valid, deadcode-scan, deadcode-outside
- Registry log live: "Registered 163 tools (71 revived)" (unchanged)
- registryAnalysisRefs: 7 occurrences on 5 lines (3 named class imports + 2 safeNew; trio registers via named imports -- all 5 proven registered live)
- mockSupported=false for all 5 chain tools + adjacent (analysis unavailable in mock/offline mode)

## SOURCE READS (Muse HEAD; all 3 def files byte-identical on BOTH lines)
- AnalysisTools.ts (259 lines, sha 901AD6CC): trio CONTAINED via shared resolver (sharedResolveToolPath 4, safePath 4, context?.workspaceId 3) with a documented pre-fix exfil note (/root/.ssh marker 1: unchecked path + model routing = read-then-post). analyze_codebase routes structure+key-files to routeToModel (3 refs) WITH caller context (modelConfig honored); redirects remote URLs to browser_run (3 refs); LLM failure degrades to structure-only ok:true (honest 'LLM Failed' section, 'Analysis failed' fallback marker 1). analyze_codebase declares ['read','internet'] (1) -- the only internet-claiming chain tool, and it genuinely calls a model (unlike the 158 optimizer).
- DeadCodeTool.ts (136 lines, sha 0600AC3D): REAL executor -- `npx knip --reporter json` via executionEngine (2 refs, npx 1, knip 7), mode-scoped --include filters, honest unreadable-output handling (scanned:false 1 -- ok:false with install guidance, never false-clean; scanned:true 1 with scope-qualified 'clean' voice). BUT: execute(input) takes NO context; workDir = path.resolve(getActiveRoot(), projectPathInput) with getActiveRoot() NO-ARG (1) and NO containment check -- an absolute projectPath resolves outside the workspace and gets `npx knip` executed there. And inputSchema advertises autoFix (1 occurrence, schema line ONLY -- execute() never reads it): dead input contract.
- CodebaseOutlineTool.ts (94 lines, sha E6C56FDD): fast regex outline (classes/functions/interfaces/imports/totalLines), required filePath, auditFields (1). BUT: NO containment -- resolveToolPath 0, root is process.cwd() (1), absolute filePath passes through untouched. Exfil scope is regex-bounded (names + import heads, not file bodies), but any readable file on disk is outlineable regardless of workspace.
- ToolService.ts chain refs (4): project_detect/analyze_codebase in the low-risk regex (line 198) + Arabic progress voice for analyze_codebase + TWO hard-code fallbacks: manual_test/verify_build -> project_detect ('Safe fallback that returns project info', line 433) and detect_project/scan_project -> project_detect (line 506). The second is a synonym; the FIRST is a semantic downgrade: a *verify-the-build* request silently becomes *list-project-roots* -- an observation, never a check. No gate can catch it because the alias resolves before dispatch.
- PhaseExecutorTool.ts chain refs (Muse, 2): project_detect in RUNTIME_LOGICAL_SOURCE_TOOLS (exempt from artifact mapping -- correct, it is discovery) + trio in inheritRuntimeProjectArguments (correct, they inherit the runtime root). dead_code_detector/codebase_outline deliberately unnamed: projectPath is not an artifact-source key (passes through), filePath IS (gets runtime-mapped). Gate-false 7/7 is CORRECT-BY-DESIGN: observers are not checkers; knip scans must not become pass/fail verifiers; project_detect's verification-adjacent role is the sanitizer's fallback OBSERVATION, not a gate check.
- plan-tools.ts chain refs (Muse, 2): catalogue purpose 'verify what was actually created on disk' for project_detect + comment. No MEANS keys, no validator, no other chain tool.

## NVIDIA COMPARISON (read-only; HEAD e8fd9589 + 16 tracked-dirty)
- 3 def files byte-identical (AnalysisTools 901AD6CC, DeadCodeTool 0600AC3D, CodebaseOutlineTool E6C56FDD -- match probe shas exactly).
- ToolService fallbacks identical in substance (manual_test/verify_build line 432, detect_project/scan_project line 505 -- 1-line shift from Muse 433/506).
- NVIDIA plan-tools has 5 chain lines vs Muse 2: the extra 3 are a browser-contract->project_detect sanitizer branch ('Inspect phase output on disk', lines 960-1003), ABSENT on Muse.
- NVIDIA executor has 4 chain lines vs Muse 2: the extra 2 are a prose-normalization comment (2286) + 'Prose-origin verification observed' log (2423), ABSENT on Muse.
- ATTRIBUTION via read-only `git diff` on the NVIDIA tree: all three extras (+browser fallback line, +prose comment, +prose log) are UNCOMMITTED NVIDIA WIP hunks, not main commits. Muse starts no competing edit; NVIDIA owns that scope (dirty, worker live).

## CLASSIFICATION (Muse independent position)
- project_detect: PARTIALLY_WIRED (registered + executable + catalogued + executor-integrated + contained + gate-correct, BUT 0 MEANS keys -> natural phrases UNKNOWN incl. its own; carries the manual_test/verify_build downgrade alias).
- analyze_project: PARTIALLY_WIRED (registered + executable + exact-dispatchable + contained + executor arg-inheritance, BUT 0 planner vocabulary).
- analyze_codebase: PARTIALLY_WIRED (registered + executable + exact-dispatchable + contained + genuine model route + ToolService voice, BUT 0 planner vocabulary).
- codebase_outline: PARTIALLY_WIRED (registered + executable + exact-dispatchable, BUT 0 planner vocabulary + NO path containment).
- dead_code_detector: PARTIALLY_WIRED (registered + executable + exact-dispatchable + honest scan-failure semantics, BUT 0 planner vocabulary + no containment + no context threading + dead autoFix schema field).
- engineering_discovery (adjacent): registration + executability recorded only; full classification needs its own chain audit.
- Shared-summary note: Code Analysis is NOT "no Level-3 path" -- exact-name dispatch is green 3/3 live; the gap is MEANING-routing (0 MEANS keys). And "analysis" is not blanket INTERNAL_ONLY: project_detect is catalogued. Per-tool verdicts above supersede the family binning.

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-159-1 (P2): manual_test/verify_build -> project_detect silent downgrade. A verification request must never silently become a project listing. Owner must either (a) implement real manual_test/verify_build check semantics, or (b) remove the alias so the names fail loudly as unknown_tool, or (c) keep the fallback ONLY with a loud evidence trail (log + receipt note stating the substitution). Evidence: ToolService.ts:432-434 both lines, probe svcChainRefs, gate-false correctness (the gate never sees the original name). UI-001 lens: this is the same honesty class as run4b -- a verification-shaped request that cannot verify.
- OBS-159-2 (P3): dead_code_detector containment + autoFix honesty. Thread context through execute() so resolveToolPath/containment receives caller workspaceId (AGENTS.md rule: never no-arg getActiveRoot() when a caller context exists to thread); add a containment refusal for absolute/outside projectPath (read+execute tool running npx must not scan outside the workspace); either implement autoFix or remove it from inputSchema + pin the decision. Evidence: markers (getActiveRoot() 1, resolveToolPath-equivalent 0, autoFix 1 schema-only), full-file read both lines identical.
- OBS-159-3 (P4): codebase_outline containment + project_detect MEANS coverage. (a) Contain filePath via the shared resolver (same cure as AnalysisTools trio; exfil is regex-bounded but the read is unbounded). (b) Add MEANS keys for project_detect ('detect projects', 'project roots', 'node/python projects') so its catalogue entry is reachable by natural phrases -- pin with the probe's UNKNOWN phrase as a regression ('detect Node and Python projects under this folder' must resolve project_detect). Depends on BATCH-P0-001; no behavior risk. Evidence: live 4/8 UNKNOWN incl. the catalogued tool's own phrase, 2 plan refs.
- BATCH note: analysis chain now has live Level-2/3 evidence (5 registered, 1 catalogued, 0 aliases, 0 unconditional + 7 gate-shape pins, 8/8 resolutions incl. 3 exact + 4 unknown + 1 misroute, 6/6 hasExecute, containment proven by source read on both lines); Level-6 remains UNVERIFIED -- consistent with OBS-150-2.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-bx lineage). No jest rerun this cycle (bundle pattern used; no wedge hidden).
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + gate-shape pins + source reads); no analysis tool executed, no files written, no UAT (provider-blocked, see feas-bx).
- First bundle run EXIT 1 (missing JWT_SECRET config gate, no result produced); reran with synthetic test-only secret -> 2/2 EXIT 0 byte-identical (D9BFACE7...). Registry/tools/catalogue/resolver/ledger behavior identical (same live requires, same 163/71 log line); no result invented from the failed attempt.
- run1/run2 .log files differ only in volatile importMs; RESULT JSON pair is byte-identical (D9BFACE7...).
- NVIDIA tree touched READ-ONLY (hashes + greps + git diff, 0 writes). Worker liveness checked separately for feas-bx; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
