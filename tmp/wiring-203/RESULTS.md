# WIRING-203 results — generalized gate/registry/catalogue check (Muse cycle 203, 2026-10-03)

Scope: Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (source-level wiring,
planner/tool behavior) + verification-contract lane of CRITICAL-REAL-JOE-UI-001.
Method: exact-byte jest probe on Muse HEAD bytes. No tool executed, no network,
no writes outside jest temp. Probe file preserved at
tmp/wiring-203/zz-muse-wiring203.probe.test.ts (copy; original removed from
api/src/__tests__ after the runs to keep the tracked tree clean).

## Provenance

MUSE_HEAD=9a44366daa3d3021bfad49b9b3786d820039682a (tracked clean; zero source delta)
registry.ts SHA256=912CE54942A3CED650FDAC2F440F7CDD33F317EEE704E226DA52B95EACC1EAEC
plan-tools.ts SHA256=5EF3E10899F290D42BD96DCF3675F4EB9B73EA679BD1E28F97F14359490785CC
verification-ledger.ts SHA256=0AD84299D3FF696AA95527211E59F276012A122EA9C0BCAAD043C09D539DA672
Runner: node node_modules/jest/bin/jest.js zz-muse-wiring203 --runInBand,
cache+TMP redirected into muse-worktree tmp (sandbox cannot write user npm/home temp).
Two runs, byte-identical [W203-*] lines (run1 15.9s, run2 ~16s).

## Results: 5/6 GREEN, 1 RED = exactly one known-gap finding

- W203-P0 census GREEN: registeredCount=163, catalogueCount=40 (matches c196 census).
- W203-P1a gate vocabulary GREEN: all 13 unconditional checkers accepted; project_run
  accepted only with allowLiveRunCheck; shell_execute accepts `npm test` shape and
  rejects `rm -rf /`; read_file accepted only with allowExistenceObservation +
  single relative path, rejects traversal and flag-absent calls.
- W203-P1b R1 RED (finding): 15/16 gate-accepted checkers registered.
  missing=["visual_qa"] — gate accepts (ledger:738) but registry lacks it.
  This generalizes the visual_qa precedent: the FULL 16-name gate vocabulary was
  measured and visual_qa is the ONLY gap on Muse HEAD bytes.
- W203-P2 R2 GREEN: all 40/40 catalogue tools registered, missing=[].
- W203-P3a MEANS targets GREEN: all 27/27 targets registered (incl. docker_manager,
  kubernetes_ops, terraform_manager, github_actions, ci_generate_pipeline);
  zero dead MEANS entries on Muse HEAD.
- W203-P3b R3 precedence GREEN (all 9 predictions confirmed):
  shell_execute→exact; 'Git CLI'→git_ops/meaning; Jira/board→not_software;
  gibberish→unknown; 'docker'→docker_manager/meaning;
  'please run quality run now'→quality_run/nearest;
  'generate image'→unknown and 'qa'→unknown (fail-closed: Muse HEAD has no
  image/qa MEANS keys and generate_image is unregistered, so no snap to an
  unrelated tool).

## Full actual lines (run 2, identical to run 1)

[W203-P0-ACTUAL] {"registeredCount":163,"catalogueCount":40}
[W203-P1b-ACTUAL] 15x {gateAccepts:true,registered:true}; visual_qa {gateAccepts:true,registered:false}
[W203-P2-ACTUAL] {"missing":[]}
[W203-P3a-MISSING] []
[W203-P3b-ACTUAL] [{"input":"shell_execute","tool":"shell_execute","how":"exact"},{"input":"Git CLI","tool":"git_ops","how":"meaning"},{"input":"Jira","tool":null,"why":"not_software"},{"input":"Set up project management board","tool":null,"why":"not_software"},{"input":"generate image","tool":null,"why":"unknown"},{"input":"qa","tool":null,"why":"unknown"},{"input":"docker","tool":"docker_manager","how":"meaning"},{"input":"please run quality run now","tool":"quality_run","how":"nearest"},{"input":"flibbertygibbet zzqq","tool":null,"why":"unknown"}]

## Interpretation

- R1 (gate-accepted ⇒ registered) is violated by exactly 1/16 on Muse HEAD.
  Repair = registration of visual_qa, which is already inside NVIDIA's in-flight
  BATCH011 (dirty registration reviewed in c202). No competing Muse patch.
- R2 (catalogue ⇒ registered) holds 40/40. R3 (precedence + fail-closed) holds.
- No permanent test committed: P1b is RED on current bytes, and the repair plus
  its pins belong to the owner's self-contained commit (BATCH2 F2/F3). Muse
  re-runs this probe on that commit when it lands.
- Counts stay tree-scoped: 163 registered / 40 catalogue on Muse HEAD @9a44366d.
  No universal registry proof; global wiring counters remain UNKNOWN.

## Runtimes (this cycle, fresh)

:5000 UP (same owner process, uptime ~3875s, version no-commit-file, API-only).
:5002 DOWN, :5101 DOWN → official Real Joe UI UAT BLOCKED (unchanged).
No new UI run: the command's repair→regression→gates sequence is still in-flight
with the owner, and :5000 cannot satisfy the "actual Joe UI" clause.
