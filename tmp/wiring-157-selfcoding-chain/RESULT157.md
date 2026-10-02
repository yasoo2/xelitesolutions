# WIRING-157 -- Self-coding/repo wiring census, live-verified (Muse independent)

MUSE_HEAD=c8635ba2 (tracked CLEAN, 0-line api/web delta; all 157 outputs new under tmp/wiring-157-selfcoding-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T19:40Z (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha 4DD059F6...); definition/registry/dispatch/ledger/planner/executor files READ as text. ZERO DISPATCH: executeTool never called, no repo reads/writes, no command runs, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). Probe correction disclosed below; bundle deleted after runs, entry + logs + results preserved.

## TRIGGER
Shared JOE-WIRING-AUDIT-SUMMARY claims ORPHANED=1 (Self-Coding, 5 repo_* tools)
via ORPHAN-001, and IMPLEMENTED_NOT_REGISTERED=0. Wiring-157 live-adjudicates
both claims on Muse HEAD and confirms the NVIDIA tree carries the identical
self-coding chain (read-only source check).

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163; repo-regex hits = 6 (5 repo_* + github_repo_manager, different family); all 6 hasExecute=true
- 5/5 repo_* names in RepoSelfCodingTools.ts are registered live -> IMPLEMENTED_NOT_REGISTERED=0 HOLDS for this family
- TOOL_ALIASES repo hits: 0 (no repo aliases)
- PLANNER_TOOL_CATALOGUE repo hits: 0/5 (only github_repo_manager catalogued)
- isVerificationTool unconditional-true: 0/5 (all false)
- resolvePlannedTool live, 8 phrases: 2 exact green (repo_read_file, repo_apply_patch); 3 route to git_ops via meaning ('read the AuthService file from the repo', 'search the repository for TODO comments', 'run the test suite in the repo'); 1 routes to auth_builder via meaning ('apply a patch to the login module'); 2 UNKNOWN ('summarize the diff of my changes', 'improve Joe itself')
- gateShapes (pure ledger calls), 7/7 false: read-valid, read-empty, search-valid, patch-dryrun, run-allowed (npm test), run-smoke (node index.js < sample.txt), diff-empty
- Registry log live: "Registered 163 tools (71 revived)"; 21 permission defaults + 2 rate defaults corroborated again (no repo tool among them -- all declare permissions)
- registryRepoSelfCodingRefs: 1 (import-path line; registration is via 5 named class imports + revived spread -- all 5 proven registered live)
- mockSupported=false for all 5 repo_* (self-coding unavailable in mock/offline planning)

## SOURCE READS (both lines; RepoSelfCodingTools.ts byte-identical 0D7BD1A0)
- RepoSelfCodingTools.ts (280 lines): 5 tools, all with execute. Own-repo semantics: getRepoRoot()=process.cwd() (api-aware), assertSafeRelativePath (5 refs: relative-only, secrets-file block, containment), isAllowedCommand whitelist (npm test/build/lint/typecheck, tsc --noemit, git diff/status/log; rm/sudo/curl/pipes blocked), dryRun defaults TRUE for patches (input?.dryRun !== false), per-file try/catch in search, repo_diff_summary runs git status+diff via executionEngine.
- plan-tools.ts repo surface: 2 refs, BOTH github-family (catalogue entry + meaning-map 'github'->github_repo_manager). ZERO repo_* planner vocabulary.
- ToolService.ts repo refs: EMPTY -- no shadow/interception (clean, unlike the memory chain in wiring-156).
- PhaseExecutorTool.ts: 3/5 in RUNTIME_LOGICAL_SOURCE_TOOLS (read/search/patch at :264-268 with own-repo-root comments). The 2 absent (repo_run_command, repo_diff_summary) need NO exemption: RUNTIME_ARTIFACT_SOURCE_KEYS={path,filename,filePath,sourceFile,targetPath,schemaPath,databasePath} contains neither 'cwd' (only pathish arg of run_command, passes through to getRepoRoot) nor any diff arg. The 3/5 exemption is PRECISELY correct -- verified, not a defect.
- Gate-false 7/7 is CORRECT-BY-DESIGN: repo_* operate on JOE'S OWN repo root, never the user project. Accepting repo_run_command 'npm test' as project verification would test the wrong repo. No UI-001-class gap here (contrast: shell_execute smoke needed the sanitizer rewrite because it runs in the project context).
- NVIDIA compare (read-only): RepoSelfCodingTools.ts byte-identical (0D7BD1A0); executor exemption same 3/5 (:262-266); registry refs 1=1. The chain is identical on BOTH lines.

## CLASSIFICATION (Muse independent position)
- repo_read_file / repo_search / repo_apply_patch / repo_run_command / repo_diff_summary: PARTIALLY_WIRED (registered + executable + executor-aware + exact-dispatchable + ToolService-clean, BUT 0/5 planner-visible and genuine self-coding intent 'improve Joe itself' is UNKNOWN)
- Shared ORPHAN-001 label ("orphaned") is CHALLENGED: "no legitimate runtime path" does not hold -- exact-name dispatch plus the executor exemption IS a runtime path. At most planner-gated, possibly by design (see OBS-157-1).
- Planner routing of ambiguous phrases to git_ops/auth_builder is CORRECT for user-project interpretation (user means THEIR project; repo_* would touch Joe's own repo). The phrases do not discriminate; only 'improve Joe itself' (unambiguous, UNKNOWN) is a clean self-coding datum.
- github_repo_manager: separate GitHub-remote family, catalogued + executable; not part of the self-coding chain.

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-157-1 (P3): repo_* planner-intent gap OR deliberate self-modification guard -- owner must declare. Evidence: 0/5 catalogued, 0 aliases, 'improve Joe itself'->unknown, exact names dispatch, mockSupported=false (consistent with guard). If guard-by-design: classify INTERNAL_ONLY_BY_DESIGN + document the policy + pin exact-name dispatch behaviour. If gap: add MEANS/catalogue entries + negative pins. Self-modification policy is owner-level; Muse does not patch either way.
- OBS-157-2 (P4): reclassify ORPHAN-001. Live evidence on BOTH lines (registered 5/5, executable 5/5, executor-aware 3/3 where needed, exact-dispatch 2/2, ToolService-clean) contradicts "orphaned". Recommend PARTIALLY_WIRED, or INTERNAL_ONLY_BY_DESIGN after the OBS-157-1 disposition. Narrow metadata correction, no behavior risk.
- BATCH note: self-coding chain now has live Level-2/3 evidence (5 registered, 0 catalogued, 0 unconditional + 7 gate-shape pins, 8/8 resolutions incl. 2 exact + 4 family-routed + 2 unknown, 5/5 hasExecute, exemption precision proven by source read on both lines); Level-6 remains UNVERIFIED -- consistent with OBS-150-2.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-bv lineage). No jest rerun this cycle (bundle pattern used; no wedge hidden).
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + gate-shape pins + source reads); no repo tool executed, no files touched, no commands run, no UAT (provider-blocked, see feas-bv).
- Probe correction disclosed: first bundle-run pair EXIT 1 with EISDIR lstat 'D:' -- the bundle script path was relative; re-ran with the ABSOLUTE bundle path (same fix class as the 156 esbuild-shim disclosure) -> 2/2 EXIT 0 byte-identical (4DD059F6...). The failed-run logs were overwritten by the green pair; no result invented from the failed attempt.
- run1/run2 .log files differ only in volatile importMs; RESULT JSON pair is byte-identical (4DD059F6...).
- NVIDIA tree touched READ-ONLY (hashes + greps, 0 writes). HEAD e8fd9589, 47 changed paths, worker parent + opencode child live; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
