# WIRING-160 -- Deploy/infra wiring census, live-verified (Muse independent)

MUSE_HEAD=61ab327f (tracked CLEAN at probe time; all 160 outputs new under tmp/wiring-160-deploy-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T20:21Z (this cycle)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), run 2/2 EXIT 0 byte-identical result JSON (sha A05901BF...); definition/registry/dispatch/ledger/planner/executor files READ as text. ZERO DISPATCH: executeTool never called, no deploy/docker/terraform/kubectl/pages ran, no files written, no network, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials). One disclosed recipe correction: first bundle attempt failed at BUILD time on a native .node file (cpu-features, no result produced); rebuilt with --packages=external + NODE_PATH at runtime (same live TS sources, same 163/71 registry log line) -> 2/2 EXIT 0 byte-identical. Bundle deleted after runs, entry + logs + results preserved.

## TRIGGER
Shared repair backlog BATCH-004 claims deploy_pages, docker_manager,
terraform_manager, kubernetes_ops, docker_swarm_ops, web_pipeline and
dev_server are registered-but-invisible with only deploy_project
planner-visible. Wiring-160 live-adjudicates the deploy chain on Muse HEAD
and confirms what the NVIDIA tree carries (read-only source check +
hash/diff attribution).

## LIVE CENSUS (Muse HEAD; bundle-run1.result.json == bundle-run2.result.json byte-identical)
- registered=163; chain 6/7 registered (deploy_project, deploy_pages, docker_manager, terraform_manager, kubernetes_ops, docker_swarm_ops); web_pipeline NOT registered. Adjacent website_full_pipeline + dev_server_start registered; scaffold_website NOT registered; all 8 hasExecute=true
- safeNew label finding: the registry label is LOG-ONLY (registry.ts:126-134 returns the factory instance; registration keys off instance t.name). safeNew('web_pipeline', () => new WebPipelineTool()) registers website_full_pipeline; safeNew('dev_server', () => new DevServerTool()) registers dev_server_start. The names 'web_pipeline' and 'dev_server' exist NOWHERE as registrations -- BATCH-004 lists two stale-label phantoms.
- TOOL_ALIASES chain hits: 0 (no chain aliases in the alias TABLE; ToolService hard-code redirects exist separately -- see below)
- PLANNER_TOOL_CATALOGUE chain hits: 1/7 (only deploy_project) -> BATCH-004 premise CORROBORATED live (modulo the two phantom names)
- isVerificationTool unconditional-true: 0/8 (all false)
- resolvePlannedTool live, 10 phrases: 3 meaning-green ('deploy this project to production'->deploy_project, 'containerize the app with docker'->docker_manager, 'provision infrastructure with terraform'->terraform_manager); 3 MISROUTES ('deploy the stack to the swarm'->deploy_project, 'scale the kubernetes deployment'->deploy_project, 'publish the site to GitHub pages'->github_repo_manager); 2 UNKNOWN ('run the full website pipeline', exact 'web_pipeline'); 2 exact-green (docker_manager, deploy_project)
- MEANS (plan-tools.ts:155-157 + catalogue line 115): deployment/deploy/hosting/vercel/netlify/heroku->deploy_project; docker->docker_manager; kubernetes->kubernetes_ops; terraform->terraform_manager. Grep-pinned ABSENT: no swarm/pages/pipeline/website/dev_server keys -- this explains the swarm/k8s over-capture by deploy_project ('deployment' key), the pages misroute to github_repo_manager, and the pipeline UNKNOWN.
- gateShapes, 8/8 false: deploy-valid, deploy-empty, pages-valid, docker-build, terraform-plan, k8s-get, swarm-list, pipeline-run
- Registry log live: "Registered 163 tools (71 revived)" (unchanged)
- registryDeployRefs: 12 occurrences (5 named imports + safeNew/createTool lines)
- mockSupported=false for all 6 chain + 2 adjacent (deploy unavailable in mock/offline mode)

## SOURCE READS (Muse HEAD; 4/5 def files byte-identical on BOTH lines)
- InfrastructureTools.ts (243 lines, sha AD5905D4): trio CONTAINED via local resolver (resolveToolPath 3, path_outside_workspace 1, realpath-based inside-check); shell via ExecutionGateway (3) with timeouts; -input=false (2) prevents terraform hangs; -auto-approve gated on explicit input (2); honest empty-input guards ('terraform_manager needs an action', 'kubectl ... needs a kubectl command' -- documented undefined-call fixes). BUT: getWorkspaceRoot() 5x is NO-ARG via a local helper (workspaceService.getActiveRoot() no-arg, process.cwd() fallback) and execute(input) takes NO context -- caller workspaceId cannot be threaded (same class as OBS-159-2). kubectl runs against the ambient cluster config (no kubeconfig scoping).
- DeployPagesTool.ts (245 lines, sha 25629E35): getActiveRoot(context?.workspaceId) CORRECT (1); token via user/session secrets + env (GITHUB_TOKEN 3); needsConnect/needsRepo honesty (1 each); backend honesty gate (unsupported 1 -- refuses backends plainly, suggests project_run); gh-pages 10; --force push (1) from an ISOLATED temp repo (user tree untouched); privateEndpointWarning (2) + stageForPages (2) asset localization; .nojekyll (2). mockSupported=false.
- DeployProjectTool.ts (286 lines, sha 3E2775F1, MUSE ONLY -- see NVIDIA section): contained (resolveToolPath 2 with context/input/__workspaceId threading); WIRING-P1-009 resolvePort fail-closed (3, Invalid port 2, comment 1); expose_port via localtunnel (4, global-install + detached); start_server detached + localhost URL (hard-coded localhost in output URL -- portability note); .joe_server.pid (1). mockSupported=false.
- DockerManagerTool.ts (73 lines, sha 2E3F87AD): executionEngine.run(command) with NO cwd (2 refs; runs in the API process cwd); resolveToolPath 0; workspaceId appears ONLY in the input TYPE (1, never read); options string interpolated raw into shell (`docker ps -a ${options}`, `docker build ${options} -t ${target} .`); Unknown action guard (1); rateLimitPerMinute 15; auditFields action+target. mockSupported=false.
- WebDevelopmentTools.ts (701 lines, sha 2692B584): website_full_pipeline requires name (fail-closed 'nothing was built', 1); web_pipeline 0 occurrences in the file; scaffold_website 0; dev_server_start 5.
- ToolService.ts chain refs (3): deploy_project hook (line 147, same both lines) + web_pipeline/scaffold_website -> website_full_pipeline hard redirect (lines 508-510, same both lines). A planner emitting web_pipeline resolves UNKNOWN at the planner layer but would redirect at dispatch -- two-layer inconsistency.
- PhaseExecutorTool.ts chain refs (Muse, 7): deploy_project late-bound projectPath inheritance (LATE_BOUND_PLAN_FIELDS + runtime-root resolution + artifact-mapping exemption) + requestedPublicExposure tracking. Deploy participates in verification SUPPORT (produces runnable artifacts) but is not itself a check.
- plan-tools.ts chain refs (Muse, 5): LATE_BOUND deploy_project field + catalogue purpose 'build, start, or package the project locally for verification...' + MEANS lines above. No deploy_pages/docker/infra catalogue entries, no validators.
- Gate-false 8/8 is CORRECT-BY-DESIGN: deploy/mutate tools must not self-certify as verifiers. A completed deploy must never auto-pass verification; the gate must still run real checks. No new verification-death shape in this chain (UI-001 lens: clean).

## NVIDIA COMPARISON (read-only; HEAD e8fd9589 + 16 tracked-dirty)
- 4/5 def files byte-identical (InfrastructureTools AD5905D4, DeployPagesTool 25629E35, DockerManagerTool 2E3F87AD, WebDevelopmentTools 2692B584 -- match probe shas exactly).
- DeployProjectTool DIFFERS at committed level: Muse 285 lines (3E2775F1) vs NVIDIA 258 lines (6B675163). Muse carries the WIRING-P1-009 resolvePort guard (commit 990cf029 on muse/joe-development); NVIDIA/main has `input.port || 3000` unvalidated in both call sites, reaching `lt --port ${port}` under shell:true. The NVIDIA file is TRACKED-CLEAN (not among the 16 dirty) -> committed main-vs-Muse divergence, not active WIP. Muse repair handoff MUSE-990cf029 exists since 9/30, still unintegrated; main still exposed. No competing edit by Muse this cycle (docs/evidence only).
- NVIDIA plan-tools deploy refs identical 5 lines (45/115/155/156/157) -> same catalogue + MEANS -> the 3 misroutes + pipeline UNKNOWN reproduce by source identity.
- NVIDIA ToolService: deploy_project hook line 147 (same), web_pipeline redirect line 508 (same).
- NVIDIA executor deploy_project refs 7 lines (363/371/372/376/394/487/1500) vs Muse 7 refs (same count; late-bound inheritance + exposure tracking on both).
- NVIDIA registry: same safeNew('web_pipeline') stale label + same imports -> the phantom-name finding holds on both lines.
- Misroute/missing-MEANS scope touches plan-tools.ts (NVIDIA dirty, worker live) -> Muse starts no patch; NVIDIA owns that scope.

## CLASSIFICATION (Muse independent position)
- deploy_project: PARTIALLY_WIRED (registered + executable + catalogued + MEANS-green + executor-integrated + contained + port-guarded on Muse, BUT swarm/k8s phrases over-captured by its MEANS; main lacks the port guard).
- deploy_pages: PARTIALLY_WIRED (registered + executable + contained + secrets-honest + backend-honest, BUT 0 catalogue/MEANS -> natural phrase misroutes to github_repo_manager).
- docker_manager: PARTIALLY_WIRED (registered + executable + MEANS-green, BUT no cwd/containment, workspaceId unread, raw options interpolation).
- terraform_manager: PARTIALLY_WIRED (registered + executable + MEANS-green + contained paths + autoApprove-gated, BUT no-arg workspace root + no context threading).
- kubernetes_ops: PARTIALLY_WIRED (registered + executable + has a 'kubernetes' MEANS key, BUT natural 'scale the kubernetes deployment' over-captured by deploy_project 'deployment' key; no context threading; ambient-cluster scope).
- docker_swarm_ops: PARTIALLY_WIRED (registered + executable + contained composeFile, BUT 0 MEANS -> swarm phrase misroutes to deploy_project; no context threading).
- web_pipeline: PHANTOM_NAME (no registration anywhere; ToolService redirect to website_full_pipeline exists; planner resolution UNKNOWN; BATCH-004 lists a name that was never registered).
- website_full_pipeline (adjacent): PARTIALLY_WIRED (registered + executable + fail-closed name guard, BUT 0 catalogue/MEANS -> natural phrase UNKNOWN; reachable only by exact name or the web_pipeline/scaffold_website hard redirect).
- dev_server_start (adjacent): registration + executability recorded only; full classification needs its own chain audit. BATCH-004's `dev_server` is the stale safeNew label, not a registration.
- scaffold_website: NOT_REGISTERED (name exists only in the ToolService redirect; no definition, no registration).
- Shared-backlog note: BATCH-004's premise (1 catalogued) is corroborated, BUT two of its seven names are phantoms -- the backlog needs name correction (website_full_pipeline, dev_server_start) before any owner catalogues non-existent names.

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-160-1 (P2): stale safeNew labels + phantom backlog names. Rename the 'web_pipeline'/'dev_server' labels to the instance names (or add real alias registrations + planner routing for the old names); correct BATCH-004 to website_full_pipeline/dev_server_start. Evidence: safeNew body (label log-only), live chainRegistered missing web_pipeline, exact 'web_pipeline' UNKNOWN, WebDevelopmentTools web_pipeline 0, registry.ts:158-159 both lines.
- OBS-160-2 (P2): deploy MEANS over-capture + gaps. 'deployment' swallows k8s/swarm phrases; add 'swarm'->docker_swarm_ops, 'pages'/'github pages'->deploy_pages, 'pipeline'->website_full_pipeline MEANS; add specificity so 'scale the kubernetes deployment' reaches kubernetes_ops. Pin all 4 probe phrases as regressions. Owner must reconcile with NVIDIA's dirty plan-tools.ts (worker live). Evidence: live 3 misroutes + 1 unknown, MEANS grep (swarm/pages/pipeline absent both lines).
- OBS-160-3 (P3): docker_manager containment + options handling. Run with explicit workspace cwd, thread workspaceId, bound `options` to a flag allowlist (or drop it); pin. Evidence: resolveToolPath 0, workspaceId type-only, executionEngine.run(command) no-cwd, options interpolation, full-file read both lines identical.
- OBS-160-4 (P3): InfrastructureTools context threading + kubectl scope. Thread context through execute() (same cure as OBS-159-2; AGENTS.md rule: never no-arg getActiveRoot() when a caller context exists to thread); scope kubectl via explicit kubeconfig or document ambient-cluster risk; pin. Evidence: getWorkspaceRoot() 5 no-arg, execute(input) no-context, full-file read both lines identical.
- P1-009 integration note (no new OBS): Muse 990cf029 port guard is live on muse/joe-development with handoff MUSE-990cf029 (9/30) still unintegrated; main carries unvalidated `input.port || 3000` into `lt --port` under shell:true. Integration owner should prioritize this slice; no re-implementation needed.
- BATCH note: deploy chain now has live Level-2/3 evidence (6 registered + 2 adjacent, 1 catalogued, 0 table aliases, 0 unconditional + 8 gate-shape pins, 10/10 resolutions incl. 3 meaning + 2 exact + 3 misroutes + 2 unknown, 8/8 hasExecute, containment proven by source read on both lines); Level-6 remains UNVERIFIED -- consistent with OBS-150-2.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-by lineage). No jest rerun this cycle (bundle pattern used; no wedge hidden).
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + live resolution + gate-shape pins + source reads); no deploy tool executed, no UAT (provider-blocked, see feas-by).
- First bundle attempt failed at BUILD time (native .node cpu-features, no result produced); rebuilt with --packages=external + NODE_PATH -> 2/2 EXIT 0 byte-identical (A05901BF...). Registry/tools/catalogue/resolver/ledger behavior identical (same live requires, same 163/71 log line); no result invented from the failed attempt.
- run1/run2 .log files differ only in volatile importMs; RESULT JSON pair is byte-identical (A05901BF...).
- NVIDIA tree touched READ-ONLY (hashes + greps + byte-diff, 0 writes). Worker liveness checked separately for feas-by; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
