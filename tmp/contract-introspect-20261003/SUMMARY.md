# Input/output contract introspection — SUMMARY (Muse c216, 2026-10-03)

MUSE_HEAD=aacc29f9 (tracked clean at probe time; zero Joe source delta)
SCOPE=Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (source-level wiring, planner/tool behavior)
METHOD=disposable jest probe (source preserved in probe-source.txt), resolve-only; 3 runs PASS, last 2 byte-identical
EVIDENCE_SHA256=32CFB99125ED4EDC7E5DEAC8416E0135FB84F8FECD4A9C165E95D2DB95E00C0E (contracts.json)
RUNTIME=3x jest PASS (~34s cold / warm), workspace-local TEMP + cache (system Temp EPERM + node cwd quirk under sandbox; explicit --config used)

## Question (open item from c215)

The 5 planner-invisible candidates are executor-reachable via exact name
(PARTIALLY_WIRED, c213) and permission-unblockable (c215). Are their
input/output contracts self-consistent — and can they consume execution
context at all?

## Proven (Muse HEAD, exact bytes)

Per name: registered + execute arity + description presence + version/tags +
input type/properties/required + required-subset-of-properties +
output type/properties. Controls: read_file, write_file (arity-2),
bogus_tool_xyz_7788 (negative — registered=false; the seam discriminates).

- cloud_cost_estimator: in=object {resources*, traffic}, out=object (no declared props), arity=1, mock=true
- self_confidence_evaluator: in=object {content*}, out=object (no declared props), arity=1, mock=true
- ask_user: in=object {question*, options}, out=object {response}, arity=1, mock=false
- rss_fetch: in=object {url*, limit}, out=object {items}, arity=1, mock=false
- task_lifecycle: in=object {action*, mode, taskName, taskStatus, taskSummary}, out=object {success}, arity=1, mock=false
- requiredSubsetOfProperties=true for all 7 real tools (controls included).
- All 7: inputType=object, outputType=object, non-empty description, version 1.0.0.

## Context-blindness finding (new, resolve-only + arity)

All 5 candidates declare execute(input) with arity=1, while the file-system
controls declare execute(input, context) with arity=2. The 5 cannot consume
ToolService context (workspace/user attribution) even when the dispatcher
passes it — the same structural gap BulkFileGeneratorTool had before Batch-1
(now fixed on NVIDIA dirty bytes per BATCH2-VERIFY). Consequence: none of
the 5 can be workspace-contained via context today; exposure decisions must
account for this. Flagged, not patched (exposure decisions stay with the
audit owner lane).

## Classification

All 5 remain PARTIALLY_WIRED (c213 dispatch + c215 permission + c216
contract layers green; planner-invisible via static catalogue + retrieval +
MEANS + aliases). INPUT_CONTRACT_VALID=YES (self-consistent), with the
context-arity caveat above. Execution CORRECTNESS still NOT proven — no
tool executed.

## Audit questions touched

- Q7 compatible input/output contracts: +5 proven self-consistent on Muse
  HEAD (resolve-only); output props recorded (2/5 tools declare none).
- Q6 permission routing: unchanged (c215 stands).
- Global counts: UNKNOWN except scoped probes (163 Muse-line registry c209;
  21 defaulted-permission tools c215; 5 PARTIALLY_WIRED with contract rows).

## Reproduce

1. Copy probe-source.txt to api/src/__tests__/zz-repro-probe.test.ts (untracked; delete after).
2. cd to worktree ROOT (node breaks with cwd=api under this sandbox); set TEMP/TMP to a workspace tmp dir.
3. node api/node_modules/jest-cli/bin/jest.js --config api/jest.config.js --cacheDirectory=<workspace-tmp>\jest-cache --runInBand --forceExit zz-repro-probe
4. Expect [CONTRACT-INTROSPECT] line + tmp/contract-introspect-20261003/contracts.json with the SHA above.
