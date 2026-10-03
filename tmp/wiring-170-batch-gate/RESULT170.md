# WIRING-170 — BATCH-002..007 per-tool catalogue gate, live-verified (Muse independent)

MUSE_HEAD=9c384791 (tracked CLEAN at probe time; all 170 outputs new under tmp/wiring-170-batch-gate/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-03T02:0xZ (this cycle; local ~05:0x)
METHOD=esbuild-bundled CJS probes executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), probe-170 run 2/2 EXIT 0 byte-identical result JSON (sha 7B3560A6...), probe-170b name-dump 1x EXIT 0; definition/registry/dispatch files READ as text. ZERO DISPATCH: executeTool never called, no shell spawned, no commands ran, no network, no registry mutation. Synthetic test-only JWT_SECRET. Same disclosed recipe as 163-169: esbuild (api/node_modules), --packages=external + NODE_PATH=api/node_modules; bundles deleted after runs, entries + logs + results + jest log preserved. Harness side effects disclosed: registry import created data/db/users.json (`[]`, 2 bytes, no payload), a rotation audit stub + 0-byte app logs under logs/; the disposable data/ + logs/ dirs were inspected then removed. First attempt failed MODULE_NOT_FOUND (playwright) because NODE_PATH was set for build but not for run; rerun with NODE_PATH green — harness setup error, not a Joe defect.

## TRIGGER
NVIDIA heartbeat 2026-10-03T04:14:08 (local): "Next: Expand PLANNER_TOOL_CATALOGUE
for 26 high-value orphaned capabilities." That is BATCH-002..007 as written
(5+6+7+3+2+3=26), all marked READY/Low in JOE-WIRING-REPAIR-BACKLOG.md, under
Codex CROSS-REVIEW HOLD plus Muse F10 SECURITY-GATED dispute. This cycle
produces the smallest per-tool evidence the hold requires: for each of the 26
names, live REGISTERED / hasExecute / CATALOGUED / alias / gate-shape, the
real definition file, and sampled contract/security flags — on both trees.

## LIVE CENSUS (Muse HEAD; run1 == run2 byte-identical)
- registered=163, catalogue=40 (tenth independent live count; "71 revived" unchanged; zero safeNew Skipping warnings in stderr).
- ALL 26 batch names: catalogue=false, alias=None (live). The planner-visibility gap for these names is real.
- Gate shapes 5/5 false (repo_read_file, repo_run_command, analyze_codebase, docker_manager, sonar_analysis): none is an unconditional verifier — no Gap-A/B interaction for the sampled batch tools.
- Cross-tree: 13/13 batch definition files + ToolService.ts byte-identical on both lines; registry.ts / plan-tools.ts / verification-ledger.ts differ (known NVIDIA-dirty + Muse-line deltas, out of scope). Every finding below holds on BOTH lines unless noted.

## PER-BATCH GATE VERDICTS (live registry + source-read)

### BATCH-002 repo_* (5): registration TRUE, security GATE-FAIL — HOLD STANDS
- 5/5 registered + hasExecute, 0/5 catalogued: repo_read_file, repo_search, repo_apply_patch, repo_run_command, repo_diff_summary (all RepoSelfCodingTools.ts).
- F10 re-confirmed on current bytes: getRepoRoot x8 (Joe's OWN server tree, not the user workspace), prefix-filter + fragment blocklist (L70) feeding shell:true (wiring-169 evidence, re-cited not re-proven), no approval/audit design.
- VERDICT: SECURITY-GATED. Must NOT proceed as P1/Low. Depends on REPO-COMMAND-SHELL-BOUNDARY-001 repair + threat review. (Strengthens CONFLICT-WIRING-005.)

### BATCH-003 analysis (6): 4 pass, 1 orphan, 1 PHANTOM — batch list is wrong
- Registered + exec: analyze_project, analyze_codebase, codebase_outline, inspect_symbol (4/6).
- codebase_navigator: IMPLEMENTED but UNREGISTERED — 4th F2-class orphan after visual_qa/generate_image/bulk_file_generator. CodebaseNavigatorTool.ts is a complete createTool object (name L9, full inputSchema, `execute: async` with index/search actions over VectorMemory). Zero registry references on either tree, yet referenced in TWO ToolService runtime paths: cost-guard regex (:198) and session code (:562) — the exact visual_qa pattern. (Byte-identical both trees.)
- get_codebase_map: PHANTOM. Zero references in all of api/ (excl. node_modules), muse docs/, NVIDIA docs/joe-capability-registry.md, and web/src. The name exists only in the audit backlog.
- Side note: analyze_codebase declares permissions ['read','internet'] — odd for a local analysis tool; worth one question, not a gate-fail alone.
- VERDICT: batch premise ("6 tools not in catalogue") is FALSE as written. Correct to 4 + register-or-drop decision on codebase_navigator + DROP get_codebase_map. Catalogue additions for the 4 need the standard contract pass first.

### BATCH-004 deploy/infra (7): 2 WRONG NAMES + injection surfaces — SECURITY-GATED
- Real registered names (live-confirmed): website_full_pipeline (perm write+execute), dev_server_start (perm execute) — NOT 'web_pipeline'/'dev_server'. Those two strings are safeNew LABELS only (registry.ts:158-159); the classes declare different .name values (WebDevelopmentTools.ts:35,435). Zero skip warnings: constructors succeed, instances register under the real names.
- ToolService.ts:508-510 DOES redirect web_pipeline->website_full_pipeline at the executor layer (healthy-redirect pattern per 167), but static TOOL_ALIASES lacks it and plan-time handling was not probed this cycle — fork-candidate, same class as F5.
- deploy_pages, docker_manager, terraform_manager, kubernetes_ops, docker_swarm_ops: registered + exec (5/5 under real names).
- Source-traced injection surfaces (UNEXECUTED, both trees byte-identical):
  - OBS-170-1 (P2): terraform_manager vars object interpolated as `-var k=v` (InfrastructureTools.ts:102-105) into ONE shell string via spawnWithTimeout shell:true (:43-49). No quoting: `$(...)`/backtick/`;` in a var value executes. directory is resolveToolPath-contained but also interpolated into `-chdir=${dir}`.
  - OBS-170-2 (P1/P2): kubernetes_ops takes FREE-FORM `command` string (:152,168-180), naive splitCommandLine (quote-strip only, :33-41), joined into shell:true. Arbitrary kubectl (delete/exec) + shell metachars; unscoped cluster ("whatever cluster the machine is pointed at", their own comment :168-169).
  - OBS-170-3 (P2/P3): deploy_pages buildCmd = input?.buildCommand || default (:123-126) -> shell_execute delegation: planner exposure = arbitrary build-command execution, gated only by shell_execute's naive-substring policy. (Positive: L96 uses getActiveRoot(context?.workspaceId) correctly.)
  - terraform destroy+autoApprove: destructive action behind a boolean flag, no approval gate design.
- VERDICT: SECURITY-GATED, not P1/Low. Correct the 2 names, complete per-tool arg-tracing + threat review before any catalogue edit.

### BATCH-005 database (3): 1 WRONG NAME, otherwise registration pass
- query_optimizer + large_data_seeder: registered + exec (DatabaseEnterpriseTools.ts).
- 'datasource_tool' is a WRONG NAME: DatasourceTool.ts declares name='query_datasource' (:13), registered live + exec, perm internet, NOT catalogued. The real capability exists under the real name.
- Cleared: DatabaseEnterpriseTools `exec(` hit is `db.exec(sql)` (:85, sqlite API), not shell.
- VERDICT: correct the name; registration-gate PASS for all 3 real tools; standard contract pass still owed.

### BATCH-006 github (2): registration PASS, contract pass owed
- github_actions (perm write) + git_local_workflow (perm read+write+execute): registered + exec, 0 catalogued. No freeform-command/shell/exec/spawn smell in grep sample.
- VERDICT: registration-gate PASS; contract + approval review owed (write+execute surface), then catalogue edit is low-risk.

### BATCH-007 quality (3): registration PASS, arg-trace owed
- sonar_analysis, performance_profile, load_tester: registered + exec, 0 catalogued. Sampled file pattern is structured (QualityTools.ts:92-96: npm/yarn/pnpm literal + fixed args).
- VERDICT: registration-gate PASS; per-tool arg trace owed (load_tester targets a URL: SSRF/allowlist question open, not traced this cycle).

## RESOLVE OUTCOMES (live, 16 batch phrases)
- Already reach batch tools WITHOUT catalogue: 'containerize the app with docker'->docker_manager (meaning), 'provision infrastructure with terraform'->terraform_manager (meaning), 'run sonar analysis...'->sonar_analysis (nearest). Catalogue expansion must pin before/after behavior here.
- Misroutes catalogue expansion would CHANGE (pins needed): repo_search/repo_apply_patch/repo_run_command phrases -> git_ops (meaning); 'manage the github actions workflow' -> github_repo_manager; 'optimize the slow database query' -> db_schema_migrator; 'seed a large dataset for testing' -> auto_tester (same test-suite-steer class as 169); 'find the definition of the login symbol' -> auth_builder (click-to-auth_builder class, 167).
- Unknown (5): 'analyze the codebase structure', 'outline the codebase for planning', 'run a load test against staging', 'profile the slow endpoint performance', 'start a local dev server for preview'.
- No resolve crash on any phrase (16/16 returned).

## CONFLICTS / HOLD INPUT (filed via fallback; shared conflicts/ unwritable)
- CONFLICT-WIRING-001 EXTENDED: BATCH-002..007 "26 tools" premise is wrong as written: 21 real registered + 1 real-but-renamed... precisely: 21 names registered as-named, 3 wrong names with real registered counterparts (web_pipeline->website_full_pipeline, dev_server->dev_server_start, datasource_tool->query_datasource), 1 implemented-but-unregistered (codebase_navigator), 1 pure phantom (get_codebase_map). 21+3+1+1=26 accounted.
- CONFLICT-WIRING-005 EXTENDED: BATCH-004 joins BATCH-002 as SECURITY-GATED (OBS-170-1/2/3). "Risk: Low" on BATCH-002/003/004 is contradicted by source evidence.
- F2 EXTENDED: implemented-not-registered is now >=4 (codebase_navigator joins visual_qa, generate_image, bulk_file_generator).
- F7/F8 UNCHANGED: gaps-test mtime 10/2 20:04 (placeholders stand), no new NVIDIA bytes (plan-tools/registry/PhaseExecutor/app-blueprints mtimes 10/2 22:41; ProjectPipelineTool 10/3 02:14 — all pre-date this cycle).
- NOTE: NVIDIA has NOT started catalogue expansion (plan-tools.ts untouched since 22:41). No hold violation observed this cycle.

## SCOPE LIMITS (honest)
- Registration/catalogue/alias/gate-shape claims are LIVE (level 2-3). Security flags are SOURCE-TRACED ONLY, unexecuted — no payload was run against any tool.
- Arg-tracing is complete for terraform_manager + kubernetes_ops + deploy_pages build path; SAMPLED for the rest. Full per-tool traces are owed before catalogue edits.
- load_tester/ssrf, git_local_workflow approval surface, and web_pipeline plan-time handling were NOT closed this cycle.
- 170b name-dump ran 1x (EXIT 0); determinism for the shared registry import is carried by 170's 2/2 byte-identical runs + the unchanged "163 (71 revived)" log line across all three runs.

## UAT / RUNTIME
- :5002 /api/health OK (uptime 112542s+, version no-commit-file = same old binary). No reviewed runtime load, no provider-path change: REAL_JOE_UI retest remains BLOCKED (unchanged).
- Prose-verification 18/18 PASS, JEST_EXIT=0, 86.5s (contract + final-gate suites) — UI-001 string-fix still green at HEAD 9c384791. (Harness note: jest warned one worker was force-exited on teardown; suites green.)
- Tracked api/ + web/ delta vs HEAD = 0 lines (evidence-only cycle). Zero NVIDIA-tree writes.
