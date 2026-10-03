# Dispatch-reachability probe — SUMMARY (Muse c213, 2026-10-03)

MUSE_HEAD=e0ecca07 (tracked clean at probe time; zero Joe source delta)
SCOPE=Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (source-level wiring, planner/tool behavior)
METHOD=disposable jest probe (source preserved in probe-source.txt), resolve-only; 2 runs byte-identical
EVIDENCE_SHA256=E5F88A082B64D3A8FA728803633AE3EFBE296732A3169301C56964650C572610 (reachability.json)
RUNTIME=2x jest PASS (run1 ~63s cold, run2 ~5s warm), workspace-local cache (system Temp EPERM under sandbox)

## Question (open item from c212)

The 5 planner-invisible candidates are registered + absent from the static 40 +
never retrieved in 45 goals. Are they ORPHANED, or executor-reachable when named
exactly (PARTIALLY_WIRED)?

## Proven (Muse HEAD, exact bytes)

Per name: registered + execute=function + resolvePlannedTool(name) + alias/MEANS
posture + input contract. Positive control read_file, negative control
bogus_tool_xyz_7788 (registered=false, resolution null/unknown — the seam
discriminates).

- cloud_cost_estimator: registered, execute=function, resolution EXACT, perms read, requires {resources}
- self_confidence_evaluator: registered, execute=function, resolution EXACT, perms read, requires {content}
- ask_user: registered, execute=function, resolution EXACT, perms read, requires {question}
- rss_fetch: registered, execute=function, resolution EXACT, perms read/internet, requires {url}
- task_lifecycle: registered, execute=function, resolution EXACT, perms WRITE, requires {action}
- No TOOL_ALIASES key or value touches any of the 5 (no alias-mediated exposure or shadowing).
- MEANS (plan-tools.ts:127) contains zero references to any of the 5 (static grep; no meaning-mediated routing).

## Full exact-name chain (source-traced, resolve-only)

1. sanitisePlanPhases keeps exact-named tasks: plan-tools.ts:531-532
   (`resolvePlannedTool(asked)` → `r.tool` truthy → kept with adapted args).
2. PhaseExecutor resolves verbatim: PhaseExecutorTool.ts:1394-1402
   (`resolvePlannedTool(askedFor)` → exact → `toolName = resolved.tool`;
   null → honest skip, not failure).
3. executeTool routes alias → registry → firewall → implementation
   (ToolService.ts:251+; registry lookup of exact name succeeds per probe).

## Classification

All 5 = PARTIALLY_WIRED (executor-reachable via exact plan name; planner-invisible
via static catalogue + retrieval + MEANS + aliases). NOT orphaned. Notable:
task_lifecycle is a WRITE-permissioned mutation tool reachable only by exact name.
Execution CORRECTNESS is NOT proven — no tool was executed (ask_user blocks on a
user, rss_fetch hits network, task_lifecycle mutates; a side-effect-safe harness
is separate owned work). No repair proposed as a patch this cycle; exposure
decisions stay with the audit owner lane.

## Audit questions touched

- Q5 executor-reachable: +5 proven dispatch-routable (resolve-only) on Muse HEAD.
- Q12 orphaned: 0 newly proven; the 5 ruled OUT as orphaned.
- Q4 planner-visible: unchanged (still invisible through all 4 discovery surfaces).

## Reproduce

1. Copy probe-source.txt to api/src/__tests__/zz-repro.probe.test.ts (untracked; delete after).
2. cd api; set TEMP/TMP to a workspace tmp dir (sandbox blocks system Temp).
3. npx jest src/__tests__/zz-repro.probe.test.ts --cacheDirectory=<workspace-tmp>\jest-cache --runInBand
4. Expect [DISPATCH-REACH] line + tmp/dispatch-reach-20261003/reachability.json with the SHA above.
