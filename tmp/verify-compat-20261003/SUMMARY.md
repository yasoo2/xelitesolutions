# Verification-compatibility probe — SUMMARY (Muse c217, 2026-10-03)

MUSE_HEAD=7f51785b (tracked clean at probe time; zero Joe source delta)
SCOPE=Muse lane of CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (verification-contract facet)
METHOD=node static probe (probe-verify-compat.cjs), resolve-only; 2 runs exit 0, byte-identical
EVIDENCE_SHA256=6FAEEC3464433FE8FCBE61300110DF8B048BE3D260DEC5C2FA962EC6B33A67B7 (verify-compat.json)
RUNTIME=plain node, no jest/tsx needed; reads exact HEAD bytes of 4 verifier files + c216 contracts.json

## Question (open item from c216)

The 5 planner-invisible candidates are dispatcher-reachable (c213),
permission-unblockable (c215) and contract self-consistent (c216). Can the
verification layer consume them — as verifiers, or as evidence producers?

## Proven (Muse HEAD, exact bytes)

Consumer contracts extracted and byte-asserted from verification-ledger.ts:
- Gate set (isVerificationTool static literal): 13 tools —
  auto_tester, browser_check_links, browser_console_scan, browser_contrast_audit,
  browser_performance, browser_responsive_check, browser_run, browser_ui_audit,
  code_reviewer, dependency_audit, quality_run, secrets_scan_repo, visual_qa.
- Result mapper (verificationResultFromToolResult) reads the ToolService envelope:
  ok (strict ===true), status/output.status (pass vocab: completed|passed|
  success|succeeded|ok; fail vocab: failed|error|partial|incomplete|blocked|
  fatal_error), error/stderr, verificationFailed, cancelled, timedOut.
  All 7 mapper literals byte-asserted present.

Per-tool rows (5 candidates + read_file/write_file + bogus):
- All 5: asVerifier=NO (absent from 13-gate set), referencedByVerifierFiles=[]
  (zero hits in ledger/PhaseExecutor/plan-tools/AutoTester), declared output
  props ∩ mapper fields = {} (outputs are {response}/{items}/{success}/none).
- evidenceVerdict=UNKNOWN_REQUIRES_EXECUTION for all 5: the envelope fields the
  mapper reads are added by ToolService at runtime, so static output props alone
  cannot prove mapper compatibility. Honest UNKNOWN, not a fail.
- Controls discriminate: read_file/write_file refs=2 files each (existence/
  observation paths), gate=NO statically (their verifier roles are conditional
  opt-ins: allowExistenceObservation / live-run — documented limitation, the
  probe measures static gate membership only); bogus reg=false gate=NO refs=0.
- Positive controls: quality_run/auto_tester/visual_qa asserted present in the
  extracted gate set (YES verdict reachable; seam is not stuck at NO).

## Classification

All 5 remain PARTIALLY_WIRED. VERIFICATION_COMPATIBLE: as-verifier=NO (proven);
as-evidence=UNKNOWN (execution required). Combined c213+c215+c216+c217 rows:
reachable, unblocked, self-consistent, context-blind (c216 arity flag stands),
not verifiers, evidence-shape unproven. No exposure decision implied.

## Audit questions touched

- Q7 contracts: consumer side now pinned (13-gate set + mapper vocab/envelope).
- Q9 verifiable: 5x as-verifier NO proven; 5x as-evidence UNKNOWN with exact
  reason (runtime envelope). Next step for a YES would be fixture-contained
  execution through ToolService + mapper — NOT done this cycle (execution lane
  decision, not taken unilaterally).
- Global counts: UNKNOWN except scoped probes.

## Reproduce

node tmp/verify-compat-20261003/probe-verify-compat.cjs (twice; compare SHA256).
Inputs: tmp/contract-introspect-20261003/contracts.json + 4 HEAD source files
(hashes recorded in verify-compat.json sourceProvenance). No writes outside
tmp/verify-compat-20261003/verify-compat.json. No tools executed.
