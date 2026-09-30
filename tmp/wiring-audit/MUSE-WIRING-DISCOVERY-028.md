# MUSE Wiring Discovery 028 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 28)
HEAD=79fd0953 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=LEVEL-5 live-gate batch for the 5 deferred task-level checkers
(quality_run, auto_tester, dependency_audit, secrets_scan_repo,
code_reviewer) via the canonical path (registry entry, 163 verified;
phase_executor dispatched through ToolService.executeTool inside
firewall runInContext; workspaceService.setActiveRoot to a probe-owned
fixture dir; session ctx audit-verify28/audit-user) + static allowlist
partition + pure-function verdict table over trunk-grounded shapes.
Full probe ran 2x filed runs A/B with 10/10 legs verdict-identical
(status + ok + error-prefix + receipt.result + metrics
passed/failed + check result + reuse flag, verdictDiffs=0; static
partition + verdict table also byte-stable). One pilot run preceded
the filed pair and is reported honestly below (2 invalid legs:
non-triggering secrets fixture, over-threshold review seed). No live
process survived; no stray files (session roots absent, fixtures +
checkpoints inside fx-verify28 only). No source edits; architecture +
package-scripts guards re-verified green.
EVIDENCE=tmp/wiring-audit/verify_sweep28.mts + verify_sweep28_run{A,B}.json
+ verify28_run{A,B}.log + compare_verify28.mts (this worktree; A/B filed)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-027.md (P1-012 survey 5/5)

## Scope (L5 closure batch, not a trunk)

The 5 registered task-level checkers checkpoint 12 deferred:
quality_run, auto_tester, dependency_audit, secrets_scan_repo,
code_reviewer. (visual_qa is allowlisted-but-OPTED: partitioned
statically, NEVER executed — orphan, WIRING-P1-001.) With this batch
the full registered checker allowlist is LEVEL-5 covered: 7 browser
+ read_file gate (012) + these 5 (028).

## New findings (all Muse-branch @ 79fd0953)

### F210. All 5 deferred checkers gate correctly through phase_executor (LIVE 2x, L5 CLOSURE)

10/10 legs 2x verdict-identical:

q-pass (quality_run, exit-0 npm test) -> completed + passed receipt.
q-fail (exit-1 npm test) -> partial + failed receipt, honest error.
a-pass (auto_tester syntax, valid.js) -> completed + passed receipt.
a-fail (broken.js) -> partial + failed receipt with SyntaxError text.
d-nolock (dependency_audit, lockfile-less) -> partial + failed receipt
  (ENOLOCK mislabel rides along, P2-010 — fail-closed direction kept).
s-seeded (secrets_scan_repo, 2 findings) -> partial + failed receipt.
s-clean (empty dir) -> completed + passed receipt.
r-quick (code_reviewer quick, score 87) -> completed + passed receipt.
r-gate (same + minimumScore 90) -> partial + failed receipt, honest
  "score 87/100 below required 90/100" error.
q-reuse (quality gate + carried ledger) -> completed, reused=0 (F212).

Static: 5/5 taskLevel=true; read_file/write_file taskLevel=false
controls hold; 12/12 verdict shapes match (trunk-grounded).

This closes the checkpoint-12 open item: every REGISTERED checker
now has a live phase-gate proof in both directions (pass and fail),
not just a static mapping.

### F211. Evidence-hollow receipts EXTENDED to all 5 checkers (LIVE 2x)

Every receipt in all 10 legs carries evidenceLocation='' (2x
stable). The 5 checkers emit no evidence pointer the ledger can
record — same class as the 7 hollow shapes checkpoint 12 filed
(browser_run pageUrl-only, read_file gate no-url, quality_run
no-url, auto_tester no-url, dependency_audit no-url,
secrets_scan_repo no-url, code_reviewer no-url). In fact 3 of those
7 were PREDICTED from source in 012 and are now LIVE-confirmed
here (quality/auto/dep/secrets/review all '' at runtime); the
browser_run + read_file instances were already live in 012.

Consequence: no downstream consumer can locate checker evidence
from the receipt alone; findings live only inside the tool output
blob. Filed as WIRING-P2-047 (evidence pointers for gate
checkers). Not a verdict defect — all 10 verdicts are correct.

### F212. Task-level gate receipt does NOT reuse across runs (LIVE 2x, behavior)

q-reuse (identical gate checkId + carried q-pass ledger + unchanged
files) -> reused=0, executions=2, reusedInLogs=false, decision
"selected: declared verification paths were missing or ambiguous,
so narrowed reuse is disabled" (2x identical).

Third no-reuse data point: browser receipts never reuse by design
(012), read_file-gate reuse is dead via scopeRoot (012/MISMATCH
#10), and now quality-gate reuse is disabled for lack of declared
paths. The reuse path is effectively dead for gates without
declared verification paths. Recorded as behavior, NOT claimed as
a defect: re-execution is the safe direction, and reuse semantics
need an owner decision before any change. Filed as WIRING-P2-048
(decide + pin intended reuse semantics for task-level checkers;
either declare paths or document execute-always).

### F213. Pilot method notes (RETAINED)

P1. The pilot s-seeded leg PASSED because its fixture used naive
fake values matching no detector pattern. Secrets fixtures must
use detector-triggering shapes (generic_secret_assignment /
openai_key, trunk_security-exact synthetic values). Filed runs
find exactly 2 findings (no node_modules plant vs trunk's 4) —
deterministic A/B.
P2. Reviewer quick score is content-sensitive: near-identical seed
scored 87 here vs trunk's 57. Gate legs must pin exact seed bytes
(done) and record the observed score (done: 87).
P3. The pilot's exit-1 was a `| tail` pipe artifact; direct
execution exits 0 both filed runs. Compare with TEMP pointed at a
writable dir (sandbox default TEMP denies tsx mkdir).

## Limits / non-claims

- Gate legs pin the checker/gate contract, NOT model-present
  checker behavior (no provider in sandbox; code_reviewer
  non-quick stays embargoed).
- q-reuse covers quality_run only; per-checker reuse variance
  (auto/dep/secrets/review) unprobed — same disabled-reuse code
  path, but not separately executed.
- No Real Joe UAT in this checkpoint (pipeline probes by design).

## Updated counts (Muse branch)

- LEVEL-5 live-gate proofs: 12 registered allowlist members fully
  covered (7 browser + read_file gate + 5 code/test/security).
  visual_qa remains the sole allowlisted-but-unregistered member
  (WIRING-P1-001).
- Evidence-hollow receipt shapes: 7 predicted/source shapes, now
  5 live-confirmed at runtime + 2 already live (012). No new
  hollow SHAPE — extension of F70, filed P2-047.
- NEW WIRING-P2-047 (gate-checker evidence pointers) + WIRING-P2-048
  (task-level reuse semantics decision).
- REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)
