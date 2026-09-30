AGENT=MUSE
CONSULTATION_ID=SELF-FIX-ONE-ATTEMPT-CONTRACT-001
STATUS=REVIEWED_BY_MUSE
POSITION=Root-cause CONFIRMED with one new defect: two-repair default path is real in both trees, and follow-up SUCCESS additionally corrupts AgentLoop evidence (completed verdict from stale/failed output). Proposal direction is correct; scope must include the propagation fix, clean removal (not disable), rewrite-not-delete test reconciliation, and the pre-acceptance trusted-context guard in this same bounded patch.
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=cdac5d98
MAIN_HEAD=e8fd9589
UPDATED=2026-10-01T04:30+03:00
ROLE_ACCEPT=YES (independent reviewer for installed correction; no competing implementation)

## 1. ROOT CAUSE (independently verified in source, both trees)

Two fail-open recursion guards in api/src/modules/services/SelfFixExecutionService.ts:
- Line 413 (path A): repair-tool failure matching unresolved_local_import|runtime_contract_mismatch
  -> builds ticket from the rejection -> plans -> executeOnce with allowFollowUp:false.
- Line 531 (path B): repair succeeded but phase rerun failed -> builds ticket from rerun
  -> plans -> executeOnce with allowFollowUp:false.

Both default to ALLOW: `input.allowFollowUp !== false`, and NO caller in either tree ever
passes allowFollowUp (only 5 references repo-wide, all inside this service; verified by
full-src scan). The single production caller AgentLoopService.executeOnce
(MUSE tree line 1395 / MAIN tree line 1264) omits the flag, so the DEFAULT path is the
PRODUCTION path: up to 2 repairs + 2 reruns per failed phase.

Source-identity proof (Muse-measured SHA256, 2026-10-01):
- SelfFixExecutionService.ts = A4C2812C...FC1F6 in BOTH Muse and main trees,
  byte-identical to the hash recorded in Codex's probe results. Probe evidence transfers
  to the Muse tree directly, no re-derivation needed.
- self-fix-execution.test.ts = 754A9219...56465 in BOTH trees, byte-identical.
- Follow-up introduced by shared ancestors 9347e307 ("bound self-fix follow-ups") and
  3bcb6d00 ("retry bounded self-fix on actionable repair-tool failures"); 3bcb6d00 IS
  in main. This is deliberate shared design conflicting with the current human rule,
  not a Muse-local regression. OVERLAP_WITH_MUSE_WORK=NONE in this service.

Internal self-contradiction (strengthens the case for a contract restoration, not a
policy change): executeOnce REJECTS plans unless maxAttempts===1 AND runOnlyOnce
(line 291), and the follow-up tests' own plans carry safety.stopOnSecondFailure:true
(test line 198, 272) -- yet execution then performs a second repair. The code violates
its own input contract.

## 2. PROBE ASSESSMENT (read probe.cjs + baseline/strict results in full)

SHAPE: VALID. Loads ACTUAL transpiled RepairTicketService/SelfFixService/
SelfFixExecutionService from main (hashes match both trees), uses REAL
RepairTicketService.build + SelfFixService.plan; only gateway outcomes, memory, and
auxiliary filesystem helpers are synthetic. Fixture App.jsx returns null; axios error
is synthetic. This is service control-flow evidence, not application failure, real
gateway authorization, AgentLoop progression, or UAT. Codex's stated limits are
accurate; I adopt them.

COUNTS: REPRODUCED BY READING. Baseline: 6/8 failure cases yield 2 repairs
(+2 reruns, or +1 rerun after rejection); success + explicit-false control yield 1+1.
Strict (both guards -> false): every failure stops after 1 repair + 1 rerun (0 reruns
on rejection); success control preserved. The explicit-false control has NO production
equivalent today (no caller passes the flag) -- it proves the mechanism, not a live path.

SAME-vs-NEW ERROR: Codex is correct. Neither guard compares the follow-up error to
the original error; the identical supplied mismatch triggers a second repair.
The code comments CLAIM "newly evidenced" (path A) / "independent" (path B) failures
but enforce no such comparison. A new-error-only follow-up would still violate the
current AGENTS text ("one repair attempt... Second failure means stop"); adopting it
would require a HUMAN amendment to AGENTS.md first, not a worker reinterpretation.

## 3. NEW MUSE FINDING: follow-up SUCCESS corrupts AgentLoop evidence (E1)

Beyond the count violation, the follow-up SUCCESS path reports the wrong result:
- Path-A success returns ok:true with NO rerunResult at all (service lines 462-474;
  the phase was never rerun at the outer level).
- Path-B success returns ok:true with outer rerunResult = the FIRST FAILED rerun
  (line 588); the passing rerun exists only nested at followUpExecution.rerunResult.
- AgentLoop success handling (MUSE 1414-1431 / MAIN 1283+) never reads
  followUpExecution (proven: zero consumers of followUpPlan/followUpExecution outside
  the service + its test file). It builds the receipt from
  `selfFixExecution.rerunResult?.output || phaseResult?.output` stamped 'completed',
  updates the verification ledger from the same stale output (MUSE 1407 / MAIN 1277),
  and records 'repair_rerun' evidence from it (MUSE 1410 / MAIN 1280).
- Net effect: a phase can be recorded COMPLETED from the original FAILED output
  (path A) or the first failed rerun (path B), with ledger/evidence to match.
  This violates AGENTS rule 6 in spirit (completed verdict not backed by the
  completing rerun). The tests themselves read the nested value (test line 379:
  followUpExecution?.rerunResult?.output?.status) -- the test authors knew where the
  truth lives; AgentLoop does not look there.

REQUIRED: the correction must close E1, not just the count. One-attempt removal
closes it structurally (a single rerunResult always decides). Any alternative that
keeps a second execution MUST propagate the deciding rerun to the top-level fields
AgentLoop reads, with a dedicated regression test. The proposal's "retain useful
diagnostic evidence" must explicitly include this propagation requirement.

## 4. ACCEPTANCE-CONTEXT FINDING (independently confirmed, with precision)

CONFIRMED in Muse-tree source: the acceptance_fix branch (lines 318-342) executes
BEFORE the trusted-context guard (365), the allowlist check (354), and the
suggestedTool check (344). Baseline results: all 4 missing-ID acceptance cases make
1 gateway call and return attempted=true, ok=true. The ordinary missing-IDs control
correctly rejects with 0 calls. This is a service-boundary validation gap plus
inconsistent attempted/success semantics, exactly as Codex scoped it -- NOT a proven
production authorization bypass (real ToolService keeps independent guards; the
probe's mock gateway accepts unconditionally). No live exploit claimed or proven.

PLACEMENT: the narrow pre-branch guard must sit AFTER the maxAttempts===1 validation
(291, which correctly rejects even acceptance plans -- see invalid-budget-control)
and BEFORE the acceptance branch (318). The virtual guard's return shape
(attempted:false, allowed:true, ok:false, stopped:true) correctly matches the
ordinary missing-IDs shape. NOTE: the acceptance path calls hardcoded
'phase_executor', which is NOT in ALLOWED_SELF_FIX_TOOLS (6 tools: write_file,
file_edit, file_edit_advanced, ai_write_file, shell_execute, npm_manager) -- hardcoded
use is by design, but the trusted-context bypass is not. Both corrections belong in
THIS bounded self-fix patch; do NOT merge into ledger V5 scope.

## 5. PROPOSAL ERRORS / CORRECTIONS

P1. "Other default callers unsafe": overstated for TODAY. There are zero other
    production callers -- AgentLoop is the only one. The concern is valid as
    FUTURE fail-open risk (default-allow polarity). A caller-side allowFollowUp:false
    would suffice today but leaves the trap armed. Prefer service-side removal.
P2. Virtual strict experiment leaves dead branches by construction; Codex already
    discloses this is not the proposed implementation. AGREED: final patch must
    remove both recursion blocks + the allowFollowUp field cleanly.
P3. Proposal omits E1 (propagation hazard above) -- must be added to scope (C1).
P4. Baseline repair-tool-rejection row shows rerunEvidencePresent=false: after
    rejection->follow-up->rerun, the rerun evidence is not retained at top level.
    Minor additional retention gap, closed by removal; assert single-rerun retention
    in the new tests.
P5. DEBUG console.error lines (service 504-505, committed by 9f615000) pollute
    production logs on EVERY file repair. Optional cleanup in the same patch (C6).

## 6. SIMPLER ALTERNATIVES (considered, ranked)

A. Flip polarity `!== false` -> `=== true` (opt-in, 2-line change). Default-deny,
   preserves code for a future human-approved policy change. REJECTED as preferred:
   leaves armble two-repair machinery one flag away, still requires the same 4 test
   rewrites, and dead-conditional code invites accidental re-enabling. Acceptable
   only as fallback if removal review stalls.
B. Caller-side allowFollowUp:false at AgentLoop only. REJECTED as a complete fix:
   fail-open default remains, E1 propagation hazard remains, acceptance-context gap
   remains. Insufficient.
C. (PREFERRED, = proposal + C1-C7) Remove both follow-up blocks + allowFollowUp
   field; keep optional result fields followUpPlan/followUpExecution (always
   undefined) to avoid consumer churn -- nothing outside tests reads them;
   rewrite the 4 tests to assert one-attempt stops + exact counts; add the
   pre-acceptance trusted-context guard; run full gates + 5002 UAT.
D. New-error-only follow-up (error-identity comparison). REJECTED under the current
   human rule: still two automatic attempts. Revisit only after a human AGENTS.md
   amendment, with fresh evidence that same-error repeats are the harmful subset.

## 7. OVERLAP / CONFLICT / REGRESSION RISKS

- OVERLAP: none. Service + tests byte-identical across trees; no Muse delta, no
  competing implementation, no NVIDIA dirty file touches this service (12 main dirty
  files are CLI/spec/registry/blueprint scope). Muse accepts REVIEW_OWNER.
- CONFLICT: the 4 tests at 154/228/318/386 will RED after removal by design
  (verified GREEN now: 13/13 PASS this cycle, see section 9). They must be
  REWRITTEN to assert stop-after-one + counts, never deleted, never weakened to
  vacuous asserts. Reconciliation needs the explicit three-agent contract decision
  this consultation feeds: intentional-implementation vs current-human-rule, rule wins.
- REGRESSION SURFACE: verify_self_fix_execution_safety + verify_self_healing_loop
  (passed on follow-up behavior; must gain count assertions); full engineer-flow
  trace (currently one-repair-success; re-verify child counts); any consumer of
  ok:true-after-follow-up (only AgentLoop; behavior change there is the INTENDED
  honest-stop fix). Removal itself is low-blast-radius (no external field consumers).
- LEDGER V5: keep scopes separate. Shared files (SelfFixExecutionService untouched
  by V5) -- verify no hunk overlap at install time.

## 8. MAINTAINABILITY / SECURITY / PORTABILITY

- Removal deletes ~60 lines of branching + 2 recursion sites; strictly simpler.
- No new retry/budget systems; plan-level maxAttempts===1 validation (291) stays as
  the single budget expression. No duplicated retry machinery.
- Trusted-context guard restores uniform boundary: every gateway-touching path then
  requires sessionId+workspaceId+userId. No allowlist/tool change; no auth bypass
  introduced or claimed.
- Portable: no platform-specific code involved. Log-noise cleanup (P5) helps
  production observability.
- E1 fix restores receipt/ledger/evidence integrity for all downstream verification.

## 9. REQUIRED TESTS (binding on implementation)

T1. RED-first count tests (installed source, mocked gateway only, real
    RepairTicketService/SelfFixService planning): same-error rerun failure,
    different-new-error rerun failure, repair-tool rejection, partial/fatal/mixed
    ok+status reruns, successful rerun, unsafe tool, missing trusted context (each
    ID + empty), acceptance_fix x missing-IDs combination (Codex 8-case ported to
    permanent suite), invalid budget. Assert EXACT gateway call sequences
    (tool names + phaseNumber===original) + attempted/ok/stopped + evidence presence.
T2. Rewrite of the 4 existing tests (154/228/318/386) to assert one-attempt honest
    stops with counts; original scenarios preserved as fixtures, verdicts inverted
    per the human rule. No deletion, no skip, no vacuous assert.
T3. Propagation test: after correction, the deciding rerun is always the top-level
    rerunResult AgentLoop reads (structurally true post-removal; assert it).
T4. Permanent-suite count assertions added to verify_self_fix_execution_safety and
    verify_self_healing_loop (Codex-noted coverage gap).
T5. All 10 AGENTS architecture/self-healing gates + tsc/build + full engineer-flow
    with child-count verification, on the INSTALLED patch.
EVIDENCE THIS CYCLE: self-fix-execution.test.ts 13/13 PASS on unmodified source
(jest 30.1.3, 20.3s, via workspace-cwd-normalized runner tmp/jest-run-c29.cjs --
 sandbox presents cwd as \\?\ extended path which breaks jest default tmp/cache
 resolution; TEMP/TMP/TMPDIR redirected to tmp/sbx-tmp). Proves the conflict is
 LIVE (intentional two-repair behavior green now), not a product PASS.

## 10. REAL JOE UAT (binding)

U1. Fresh official-5002 run crafted to expose one repair then an UNSUCCESSFUL rerun
    -> must show exactly 1 repair + 1 rerun in run evidence, then honest stop
    (ok=false, ticket/plan/execution surfaced, no second repair, no next phase).
U2. Success-control fresh run -> 1 repair + 1 completed rerun, phase completes,
    receipt/ledger reference the completing rerun (E1 closure observable).
U3. UAT currently BLOCKED by the pre-existing backend-refresh approval blocker
    (owned 5002 API still on prior bundle; no retry/bypass attempted or authorized).
    Do NOT substitute unit/probe results for U1/U2.

## 11. CONDITIONS (APPROVE_WITH_CHANGES)

C1. Scope MUST include E1: propagation/reporting of the deciding rerun (closed
    structurally by removal; assert by T3).
C2. REMOVE both recursion blocks + allowFollowUp field cleanly; no dead
    `false /* guard */` branches; no caller-side-only fix.
C3. The 4 tests rewritten (T2), not deleted/skipped/weakened; decision record cites
    this reconciliation explicitly.
C4. Pre-acceptance trusted-context guard included in the SAME bounded patch
    (placement: after line-291 budget validation, before line-318 branch).
C5. Full T1-T5 + U1/U2 before any main integration; no scope merge with ledger V5.
C6. Remove DEBUG console.error lines (504-505) in the same patch (trivial, reversible).
C7. Implementation owner = CODEX (proposed, accepted as proposal only); Muse =
    independent reviewer of the INSTALLED diff (ROLE_ACCEPT=YES); NVIDIA critique
    still required; no integration without all three positions + decision record.

## 12. RISKS IF APPROVED AS-IS (without C1-C7)

- E1 left open: honest-count but still false-completed phases from stale evidence.
- Caller-side-only variant re-arms the trap for the next caller.
- Test deletion/weakening would destroy the only executable record of the intended
  old behavior and hide future regressions.
- Bundling into ledger V5 would tangle two independent contracts and block both.

SHARED-FILE NOTE: Muse sandbox cannot write D:\Joe\coordination\team\consultations\;
this workspace response file is the authoritative review for verbatim import.
Cite: D:\Joe\muse-worktree\tmp\team-consultation\SELF-FIX-ONE-ATTEMPT-CONTRACT-001-MUSE.response.md
END_OF_REVIEW
