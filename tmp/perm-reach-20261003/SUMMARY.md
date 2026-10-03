# Permission/firewall posture probe — SUMMARY (Muse c215, 2026-10-03)

MUSE_HEAD=08f9424e (tracked clean at probe time; zero Joe source delta)
SCOPE=Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (source-level wiring, planner/tool behavior)
METHOD=disposable jest probe (source preserved in probe-source.txt), resolve-only; 2 runs byte-identical
EVIDENCE_SHA256=7CDBA8519DBFA043D7D36CAC82C08F109D5609658D703805C8EAB19B508E6BD3 (permissions.json)
RUNTIME=2x jest PASS (~16s cold / fast warm), workspace-local cache (system Temp EPERM under sandbox)

## Question (open item from c213)

The 5 planner-invisible candidates are executor-reachable via exact name
(PARTIALLY_WIRED, c213). What permission/firewall posture do they carry —
declared or defaulted, read or write class — and can permissions ever block
their dispatch?

## Proven (Muse HEAD, exact bytes)

Per name: registered + execute=function + permissions + sideEffects +
declared-vs-defaulted + attribution-gate inputs + write-class. Controls:
read_file (read), write_file (write), bogus_tool_xyz_7788 (negative —
registered=false, permissions=null, gates false; the seam discriminates).

- cloud_cost_estimator: DEFAULTED read, sideEffects [], writeClass=false
- self_confidence_evaluator: DEFAULTED read, sideEffects [], writeClass=false
- ask_user: DEFAULTED read, sideEffects [], writeClass=TRUE (name matches the
  UNSAFE heuristic verbatim from write-tools-contract.test.ts:61, which names
  ask_user explicitly) — a read-defaulted tool in write-class audit scope.
- rss_fetch: DECLARED read/internet, sideEffects [], writeClass=TRUE (rss match)
- task_lifecycle: DECLARED write, sideEffects [], writeClass=TRUE (perm match)
- contractDefaults.permissions count = 21, matching the pinned bound
  (tool-contract.test.ts:101 `<=21`) and the c079 audit (21 tools).
- All 7 real tools: needsWorkspace=true, needsUser=true (non-empty perms).

## Dispatch-path finding (source-traced)

Permission VALUES never gate dispatch. The single production consumer is
ToolService.ts:724-727, which reads only `.length`:

  needsWorkspace = perms.length > 0 || effects.length > 0
  needsUser      = perms.length > 0 || effects.length > 0

Non-bypass path then requires workspaceId + userId + session-ownership
attribution (ToolService.ts:744-768); with ENABLE_AUTH_BYPASS or system
context (normal Joe runtime) the gate is skipped entirely. Registry
enforceContract (registry.ts:384-387) guarantees non-empty permissions via
name-hint defaulting, so every registered tool takes the attribution branch —
no tool can be permission-blocked, only attribution-blocked.

Consequences for the 5:
- PERMISSION_REACHABLE=YES for all 5 (nothing in the permission layer can
  refuse them; only missing workspace/user attribution could, and the runtime
  always supplies it — ToolService.ts:337-341 auto-assign per BATCH2-VERIFY).
- The ask_user DEFAULTED-read + write-class combination is an audit flag, not
  a dispatch defect: audit heuristics (write-tools-contract UNSAFE,
  verify_full_system silentWriters) treat it as write-scope while its declared
  contract says read. Exposure decisions stay with the audit owner lane.

## Classification

All 5 remain PARTIALLY_WIRED (c213 dispatch + c215 permission layers green;
planner-invisible via static catalogue + retrieval + MEANS + aliases).
Execution CORRECTNESS still NOT proven — no tool executed.

## Audit questions touched

- Q6 pass execution/firewall/permission routing: +5 proven unblockable at the
  permission layer on Muse HEAD (resolve-only + source trace).
- Q7 compatible input/output contracts: input `required` keys already recorded
  c213; output contracts untouched this cycle.
- Global counts: UNKNOWN except scoped probes (163 Muse-line registry c209;
  21 defaulted-permission tools re-confirmed c215).

## Reproduce

1. Copy probe-source.txt to api/src/__tests__/zz-repro-probe.test.ts (untracked; delete after).
2. cd api; set TEMP/TMP to a workspace tmp dir (sandbox blocks system Temp).
3. npx jest src/__tests__/zz-repro-probe.test.ts --cacheDirectory=<workspace-tmp>\jest-cache --runInBand --forceExit
4. Expect [PERM-REACH] line + tmp/perm-reach-20261003/permissions.json with the SHA above.
