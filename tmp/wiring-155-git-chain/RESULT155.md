# WIRING-155 -- Git/version-control wiring census, live-verified (Muse independent)

MUSE_HEAD=4fa3a445 (tracked CLEAN, 0-line api/web delta; all 155 outputs new under tmp/wiring-155-git-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T19:08Z (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha 6FA731D4...); definition/registry/dispatch/ledger files READ as text. ZERO DISPATCH: executeTool never called, no git spawned, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). tsx/jest paths environmentally blocked today (see ENV FINDING); bundle path uses no temp, no workers.

## TRIGGER
"git/memory matching" is an explicit open scope in shared TEAM-STATE, and no
prior wiring increment had live-proven the git registration -> planner ->
verification -> dispatch chain. Wiring-155 closes the git half on Muse HEAD
(memory half deferred to a later increment) and confirms the NVIDIA tree
carries the identical git chain (read-only source check).

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163; git-regex hits = 5 (git_local_workflow, git_ops, github_actions, github_pr, github_repo_manager); all 5 hasExecute=true
- TOOL_ALIASES git hits: 0 (no git aliases; commit/push/commit-phrase routing lives in the hard-redirect layer, below)
- PLANNER_TOOL_CATALOGUE git hits: 3/5 (git_ops, github_pr, github_repo_manager); NOT catalogued: git_local_workflow, github_actions
- isVerificationTool unconditional-true: 0/5 (all false; git writes are never verification tools, by design)
- resolvePlannedTool live, 8 phrases: 4 exact green (git_ops, github_pr, git_local_workflow, github_repo_manager); 'push to github'->github_repo_manager via meaning; 'create a pull request'->github_pr via meaning; 'check github actions status'->github_repo_manager via meaning (CORRECT: status needs the API tool, see generator note); 'commit my changes'->UNKNOWN (tool null) -- planner-vocab gap, see OBS-155-1
- gateShapes (pure ledger calls): git_ops-commit=false, git_ops-status=false, github_pr-create=false, git_local_workflow-empty=false (consistent with unconditional-false; no git verification contract exists)
- Registry log live: "Registered 163 tools (71 revived)"; 21 permission defaults corroborated again (no git tool among them -- all 5 declare permissions)
- registryClass: all 5 classes direct-new x1 (the `new X()` inside safeNew/fallback). Probe safeNew regex undercounts (artifact: `safeNew('x', () => new X())` spans a paren); source-read truth: git_ops + 3 github_* via safeNew (registry.ts:176-183), git_local_workflow via fallback direct-new (registry.ts:323)

## SOURCE READS (both lines; 5/5 git def files byte-identical; ToolService.ts byte-identical F8608F51)
- GitTools.ts (git_ops): dispatches via executionEngine.runArgv('git', ...) -- the sanctioned single authority; the lone 'child_process' marker is a comment stating it imports NO child_process. ToolService risk-tier block at :170-172 (push/commit = high).
- GitLocalWorkflowTool.ts: bounded local workflow (branch + docs note + staged-diff verify + local commit, never pushes); dispatches via executionEngine.runArgv; programmatic callers in PlanningEngine.ts:1245,1251 + AgentOrchestrator.ts:35 (import flow) -- planner-invisible BY DESIGN, exact-resolvable as fallback.
- GitHubRepoManagerTool.ts / GitHubPRTool.ts: https.request to api.github.com (8 refs / 1 ref); the API-backed GitHub surface.
- GitHubActionsTool.ts: workflow-FILE GENERATOR (writes .github/workflows/*.yml via fs; 4 templates); explicitly REFUSES list_runs with a redirect to github_repo_manager (:54-63). Zero network markers is CORRECT for this contract.
- DeployPagesTool.ts: adjacent scope, NOT git-census (name 'deploy_pages'; earlier grep hit was its api.github.com hostname line only). Registered via createTool (registry.ts:298).
- plan-tools.ts git surface: MEANS keys git/github/'version control'/'source control'/gitlab/bitbucket/'git init'/'git commit'/repository/repo -> git_ops; 'pull request'/pr -> github_pr; 'github actions' -> github_actions; catalogue trio as above. NO commit-my-changes-style phrase keys, NO git_local_workflow refs (0 lines), NO push-phrase keys ('push to github' resolves via 'github' key).
- ToolService.ts executor hard-redirects (:532-549): git_commit/commit -> git_ops (operation=commit); git_push/push -> git_ops (operation=push); github_create_repo -> github_repo_manager; github_repo_manager+action=push -> git_ops (operation=push). Planner routes push-intent to repo_manager, executor rewrites push-action to git_ops: deliberate local-push design, no defect claimed.
- NVIDIA compare (read-only): 5/5 git defs byte-identical; ToolService.ts byte-identical (F8608F51); svc narrow git-ref count 8=8; plan-tools git-matching lines 26 vs 25 with the ONLY delta one Muse comment line about `node index.js < sample.txt` (NVIDIA dirty scope; observed neutrally, not judged). Git vocabulary identical in both trees.

## CLASSIFICATION (Muse independent position)
- git_ops: FULLY_WIRED (registered + catalogued + meaning-resolved + executor redirects + ExecutionEngine dispatch + risk tier)
- github_pr / github_repo_manager: FULLY_WIRED (registered + catalogued + meaning-resolved + https dispatch)
- github_actions: FULLY_WIRED for its GENERATOR contract (registered + MEANS key + fs dispatch + honest list_runs refusal); planner-invisible for status queries BY DESIGN (status correctly routes to repo_manager)
- git_local_workflow: REGISTERED + PROGRAMMATIC (import-flow callers, exact-resolvable; planner-invisible by design, not an orphan)
- 'commit my changes' phrase: PARTIALLY_WIRED (planner-unknown, executor-known) -- see OBS-155-1

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-155-1 (P3): planner/executor commit-vocabulary asymmetry, live-proven. resolvePlannedTool('commit my changes') = unknown, yet ToolService dispatches bare 'commit'/'git_commit' -> git_ops. The most common git intent is unplannable but executable; push is plannable via the 'github' key while commit has no equivalent phrase path. Recommend the planner owner (NVIDIA scope) add commit-phrase MEANS keys ('commit my changes', 'commit', 'save a commit' or equivalent) + a resolve-then-dispatch agreement test. Narrow, no behavior risk to other names.
- OBS-155-2 (P4, process): tsx/jest test-running environmentally blocked in this sandbox today; esbuild-bundle + plain-node probe used instead (2/2 EXIT 0, byte-identical, no temp, no workers). Recommend future audit probes use the bundle pattern when the sandbox temp surface is denied; keep one receipt of the wedge (this RESULT + tsx/jest EPERM logs).
- BATCH note: git chain now has live Level-2/3 evidence (5 registered, 3 catalogued, 0 unconditional + 4 gate-shape pins, 8/8 resolutions incl. 1 unknown + 1 correct-cross-route, 5/5 hasExecute); Level-6 remains UNVERIFIED -- consistent with OBS-150-2. Memory chain is the natural wiring-156.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-bt lineage). No jest rerun possible today (env wedge, not a source regression); no wedge hidden.
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + gate-shape pins + source reads); no git was spawned, no UAT (provider-blocked, see feas-bt).
- Probe corrections disclosed: (1) registryClass safeNew regex undercounts (paren-spanning call); binding registration forms are the source-read lines cited above. (2) GitTools 'child_process' marker is a no-import comment, not a dispatch. (3) DeployPages excluded from git surface (name-based census; hostname-only match).
- run1/run2 .log files differ only in volatile importMs; RESULT JSON pair is byte-identical (6FA731D4...).
- NVIDIA tree touched READ-ONLY (hashes + greps, 0 writes). HEAD e8fd9589, 47 changed paths, worker parent live; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.

## ENV FINDING (toolchain, this sandbox, today)
- System TEMP (C:\Users\home\AppData\Local\Temp) is EPERM for realpath even (receipts: tsx-eperm-receipt.log, jest-eperm-receipt.log, both fast-fail EXIT 1).
- TEMP redirected into the workspace: tsx spins forever (1 probe killed after ~30 min/1400 CPU-s, 0 bytes out; trivial hello.mts also hung >90s, killed by bound) and jest stalls pre-output (2 attempts x 5 min, 0 log bytes, 0 cache files; killed by bound). Stuck processes were Muse's own and were terminated; no worker processes touched.
- TEMP=C:\tmp\w155: mkdir denied (C:\tmp not writable to this user); TEMP=runtime-temp (LocalLow sandbox root, writable): jest still stalls pre-output. jest --version and --showConfig (no test run) are instant -- the stall is specific to the test-run path.
- WORKAROUND (used): esbuild bundle (exit 0, no warnings) + plain node, no temp, no workers: instant, 2/2 EXIT 0 byte-identical. All temp jest test files and the 5.7MB bundle were deleted after the runs; entry + logs + results preserved.
