# WIRING-171 — 170 scope limits closed, live-verified (Muse independent)

MUSE_HEAD=1c8ab853 (tracked CLEAN at probe time; all 171 outputs new under tmp/wiring-171-scope-close/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-03T02:3xZ (this cycle; local ~05:3x)
METHOD=esbuild-bundled CJS probe executed with plain node (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool live), probe-171 run 2/2 EXIT 0 byte-identical result JSON (sha 84CE1A27...); definition/redirect/matcher files READ as text. ZERO DISPATCH: executeTool never called, no shell spawned, no commands ran, no network, no registry mutation. Synthetic test-only JWT_SECRET. Same disclosed recipe as 163-170: esbuild (api/node_modules), --packages=external + NODE_PATH=api/node_modules set for build AND run; bundle deleted after runs, entry + logs + results + jest log preserved. Harness side effects disclosed: registry import created data/db/users.json (`[]`, 2 bytes), data/memory/, a rotation audit stub + app log under logs/ — all inside the probe cwd, inspected then removed. Harness lessons (not Joe defects): `node <relative-script>` fails with EISDIR lstat 'D:' because the sandbox hands PowerShell a `\\?\`-prefixed cwd — absolute script path + Set-Location to a DOS path fixes it; npx is broken here (RFC 8089) so jest ran via absolute jest-cli path; jest default cache hits EPERM on system Temp so --cacheDirectory + TMP/TEMP pointed at tmp/jest-cache-171 + tmp/jest-tmp-171 (kept, untracked).

## TRIGGER
Wiring-170 RESULT left three explicit scope limits: (a) web_pipeline plan-time
handling (F5-class fork candidate), (b) load_tester SSRF/allowlist arg trace,
(c) git_local_workflow approval surface. This cycle closes all three with live
registry/plan-time evidence + completed source traces, on both trees.

## LIVE CENSUS (Muse HEAD; run1 == run2 byte-identical)
- registered=163, catalogue=40 (eleventh independent live count; "71 revived" unchanged; zero safeNew Skipping warnings in stderr).
- Cross-tree: ToolService.ts + WebDevelopmentTools.ts + QualityTools.ts + GitLocalWorkflowTool.ts + DatabaseEnterpriseTools.ts byte-identical on both lines; registry.ts / plan-tools.ts / verification-ledger.ts differ (known NVIDIA-dirty + Muse-line deltas, out of scope). Every finding below holds on BOTH lines unless noted.

## 1. F5 FORK CONFIRMED LIVE (OBS-171-1): web_pipeline plan-blind, executor-accepting
- Live: resolvePlannedTool('web_pipeline') = {tool:null, why:'unknown'}; same for 'scaffold_website' and 'dev_server'. Phrases 'run the full web pipeline' and 'scaffold a website for my bakery' also resolve unknown.
- Source: ToolService.ts:508-510 redirects web_pipeline/scaffold_website -> website_full_pipeline at the EXECUTOR layer, before registry lookup (:691+). Neither name is registered nor in static TOOL_ALIASES (only occurrence in ToolService is :508).
- Direction of risk is the dangerous one: execution is BROADER than planning. A plan carrying the audit's wrong name fails plan-time resolution, yet the same name would run the giant write+execute website_full_pipeline (perm write+execute, rate 10/min, audit name, required name) if it reaches the executor un-resolved.
- VERDICT: F5 plan/executor fork CONFIRMED (was fork-candidate). BATCH-004 name correction is load-bearing, not cosmetic: 'web_pipeline' must be replaced by 'website_full_pipeline' in the backlog before any catalogue edit, and the executor-only redirect needs a plan-time twin or an explicit deprecation decision.

## 2. dev_server = PURE DEAD LABEL (OBS-171-2)
- Live: unregistered, no alias, plan-time unknown. Source: ZERO mentions in all of ToolService.ts (dev_server_any_mention=0) — no executor redirect, unlike web_pipeline. Only a safeNew label in registry.ts (regrefs=1).
- A plan naming 'dev_server' dies at the executor with unknown_tool (near-suggestion rescue toward dev_server_start NOT probed live — would need dispatch; left open, not claimed).
- VERDICT: backlog must say 'dev_server_start' (registered + exec, perm execute, rate 15/min, audit cwd, required cwd). The 'dev_server' string reaches nothing on either layer.

## 3. PLAN-TIME MISROUTES (live resolvePlannedTool)
- 'build and deploy my website end to end' -> deploy_project (meaning). The natural full-pipeline phrase does NOT reach website_full_pipeline. Catalogue expansion of website_full_pipeline must pin before/after here.
- 'create a local branch and commit the docs note' -> doc_generator (meaning). The bounded git_local_workflow is UNREACHABLE by its own natural phrase: the MEANS table steals it. Note: git_local_workflow declares capabilityMatchAny branch/commit/docs words, but resolvePlannedTool never consults capabilityMatchAny — two matchers disagree on who owns this request. doc_generator behavior NOT traced this cycle (open).
- 'scaffold a website for my bakery' -> unknown even though scaffold_full_stack IS catalogued: catalogued ≠ phrase-reachable. (Positive control: scaffold_full_stack is the only probed name with catalogue=true.)
- 'start a local dev server for preview' -> unknown (repeats 170). 'run a load test against staging' -> unknown (repeats 170).
- No resolve crash on any phrase (6/6 + 9 bare names returned).

## 4. load_tester ARG TRACE COMPLETE: SSRF + LOAD CANNON (OBS-171-3, P2)
Source: QualityTools.ts:416-474 (byte-identical both trees). UNEXECUTED trace:
- Guards present: http(s)-only gate (:441 rejects the old fetch(undefined) tight loop), vus capped at 50 (:444), duration clamped 1..300s (:445). Live perms: execute+internet, rate 60/min, required url.
- Missing: NO target allowlist/blocklist — any http(s) URL qualifies, including loopback, intranet, and cloud metadata endpoints (169.254.169.254). NO inter-request delay: each worker is a tight `while (now<end) await fetch(url)` loop (:452-461) — up to 50 workers × 300s of unbounded RPS against an arbitrary URL.
- Blast radius, honestly bounded: the response body is DISCARDED (only request/error counts return), so data exfil is limited to a reachability/timing oracle; but resource exhaustion against the target (and Joe's own event loop for 300s) is real. auditFields=[] despite execute+internet.
- VERDICT: BATCH-007 load_tester joins the SECURITY-GATED set (was: registration PASS + arg-trace owed; trace now done → gated). Catalogue exposure needs a target-allowlist + delay/ceiling design first. sonar_analysis + performance_profile keep their 170 verdict (registration PASS, arg-trace still owed for full batch closure).

## 5. git_local_workflow APPROVAL SURFACE: CLOSED, PASS
Source: GitLocalWorkflowTool.ts (172 lines, byte-identical both trees). Full read:
- argv-only git via executionEngine.runArgv (no shell anywhere); branch allowlist (:27-33); docs path pinned to docs/*.md + isWithinRoot containment (:42-48, :116-117); imported-project precondition (:18-25); clean-tree precondition (:106-109); staged-diff equality check (:138-141); fixed commit message; clean-after-commit check (:146-147); NO push/pull/PR by design (:151, :164). Live: rate 6/min, audit ['request'], required request.
- No human-approval gate exists — and none is owed: the tool's own bounds (one docs .md + local commit inside the imported-project dir) are the approval surface, and they are complete and enforced.
- VERDICT: BATCH-006 git_local_workflow is registration-PASS + contract-PASS. github_actions keeps its 170 verdict (registration PASS, contract + approval review owed).

## 6. SMALL FLAGS (P3, source-read + live perms)
- query_datasource: perm internet + sideEffects=[] (live) — internet capability with zero declared side effects, same class as 169 auto_tester. DatasourceTool.ts byte-identical both trees. Contract-declaration fix, not a behavior block.
- load_tester auditFields=[] (live) despite execute+internet — audit gap to bundle with the OBS-171-3 repair.

## 7. GATE SHAPES (live isVerificationTool, 6/6)
load_tester / git_local_workflow / website_full_pipeline / dev_server_start /
web_pipeline-label / dev_server-label: ALL false. None is an unconditional
verifier — no Gap-A/B interaction for any traced tool or label.

## CONFLICTS / HOLD INPUT (filed via fallback; shared conflicts/ unwritable)
- F5 CONFIRMED: executor-only redirect (web_pipeline->website_full_pipeline) with plan-time unknown. Extends the plan/executor-fork dispute against BATCH-004 as written.
- BATCH-004 name correction is load-bearing: web_pipeline (plan-dead, executor-alive) and dev_server (dead on both layers) must be replaced by website_full_pipeline + dev_server_start before any catalogue edit.
- BATCH-007 SPLIT: load_tester SECURITY-GATED (OBS-171-3); sonar_analysis/performance_profile unchanged (registration PASS, arg-trace owed).
- BATCH-006 git_local_workflow FULL PASS (registration + contract). github_actions unchanged.
- New meaning-match evidence: doc_generator steals the git-workflow natural phrase; deploy_project takes the website-pipeline phrase. Catalogue expansion must pin before/after resolve behavior for every added tool (extends 170 resolve-outcome pins).
- F7/F8 UNCHANGED: no new NVIDIA bytes (plan-tools/registry/PhaseExecutor/app-blueprints/ledger mtimes 10/2 22:41; ProjectPipelineTool 10/3 02:14 — all pre-date this cycle). NVIDIA has NOT started catalogue expansion (plan-tools untouched). No hold violation observed.

## SCOPE LIMITS (honest)
- Registration/catalogue/alias/plan-resolve/gate claims are LIVE (level 2-3). Security flags are SOURCE-TRACED ONLY, unexecuted — no payload was run against any tool.
- The executor redirect was read, not executed (zero dispatch): website_full_pipeline was never run.
- unknown_tool near-suggestion rescue for dev_server/web_pipeline was NOT probed (needs dispatch).
- doc_generator, deploy_project, sonar_analysis, performance_profile, github_actions behaviors were NOT traced this cycle.
- query_datasource inputSchema beyond required/source not reviewed.

## UAT / RUNTIME
- :5002 /api/health OK (uptime 114656s+, version no-commit-file = same old binary). No reviewed runtime load, no provider-path change: REAL_JOE_UI retest remains BLOCKED (unchanged).
- Prose-verification 18/18 PASS, 2 suites, 63.8s, zero failure lines — UI-001 string-fix still green at HEAD 1c8ab853. (Harness notes: npx broken RFC 8089 → absolute jest-cli path; sandbox \\?\ cwd breaks node resolution → Set-Location DOS path; system Temp EPERM → workspace --cacheDirectory + TMP/TEMP.)
- Tracked api/ + web/ delta vs HEAD = 0 lines (evidence-only cycle). Zero NVIDIA-tree writes.
