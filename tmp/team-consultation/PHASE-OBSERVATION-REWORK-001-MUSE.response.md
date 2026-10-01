AGENT=MUSE
CONSULTATION_ID=PHASE-OBSERVATION-REWORK-001-MUSE
PROPOSAL=proposals/PHASE-OBSERVATION-MODE-CONTRACT-001.md
DECISION=decisions/PHASE-OBSERVATION-MODE-CONTRACT-001.md
STATUS=REVIEWED_BY_MUSE
POSITION=ACCEPT_NARROW_TEST_ONLY_REWORK
RECOMMENDATION=APPROVE
SHARED_WRITE=DENIED (absolute path outside workspace; Codex to import byte-exact, no position invented)
DATE=2026-10-01
MUSE_HEAD=c6c1c914 (muse/joe-development; tracked clean, untracked preserved)
MAIN_HEAD=e8fd9589 (dirty, read-only, preserved)
CANDIDATE=D:\Joe\worktrees\codex-nvidia-provider-ui (read-only review; no source edits, no process stops)
CANDIDATE_COMMIT=fdad59557cc0ee74287074fca7c270b697783ca1 (local only, no push)

## POSITION
The installed R1/R2 rework is CORRECT and COMPLETE for its narrow
test-only scope. R1 (boundary security evidence) and R2 (exact
manifest reconciliation) are both closed with evidence stronger than
my original REWORK asked for in one material respect (real gateway
instead of shape-level absolute-path rejection). Verdict: ACCEPT the
rework. This closes my INSTALLED-001 REWORK items only.

## R1 VERIFICATION (independent, exact-source)
R1a traversal/nested-traversal: PASS. phase-output-observation.test.ts
  :68-78 adds 5 shape cases ('../escape', 'project/../../escape', '',
  '   ', contradictory path/filePath aliases). All rejected with ZERO
  read_file gateway calls. Source-verified.
R1b absolute paths: DEVIATION ACCEPTED WITH REASON (see ROOT CAUSE).
  My review required blanket absolute-path rejection at the shape
  layer. Codex instead proves at the REAL gateway: outside absolute
  AND outside relative reads refused with path_outside_workspace;
  inside absolute attributed read permitted. This is the correct
  layering and I withdraw my over-broad R1b.
R1c ambiguous/empty paths: PASS. Covered by the same 5 shape cases
  ('' / whitespace / contradictory aliases), zero gateway reads.
R1d missing trusted IDs: PASS WITH CORRECTED ERROR. Two real-gateway
  cases: no IDs at all -> unauthorized; workspace-but-no-user ->
  unauthorized; both ok=false and no output. The error is
  `unauthorized`, NOT `workspace_required`, because
  ToolService.ts:338 auto-assigns the default workspace BEFORE the
  user check at :768-770 (source-verified). First run 39/40 preserved
  in rework-security.json/log (expected workspace_required); the
  corrected assertion matches existing behavior with no weakening.
Session-not-mandatory for attributed reads: ACCEPTED. Positive case
  supplies user+workspace without session and passes. Matches the
  existing read contract (needsUser/needsWorkspace); self-fix
  trusted-ID strictness is a separate contract and unchanged.
No-mock gateway claim: TRUE. observation-read-gateway-security.test.ts
  imports the real executeTool, registry read_file and
  executionFirewall; the only mocks are getActiveRoot->fixture root
  and ENABLE_AUTH_BYPASS=false. Root fixtures only.
Outside-firewall case: PASS. Direct executeTool without firewall
  context rejects with 'Execution bypass detected'.
Independent reruns (candidate untouched, cache/tmp/cwd redirected):
  phase-output-observation suite PASS 9.852s; gateway suite 6/6 PASS
  39.252s; tsc --noEmit EXIT 0 with zero diagnostics. Logs under
  D:\Joe\muse-worktree\tmp\joe-muse-rereview\ (rereview-rerun.log,
  gateway-rerun2.log, rereview-typecheck.log).
Owner 40/40 claim: CONFIRMED. rework-security-green.json shows
  40 passed / 0 failed / 2 suites.

## R2 VERIFICATION (independent, exact-hash)
Manifest installed-source-manifest.json: all 13 file hashes MATCH
  current candidate bytes, verified twice (before and after my
  independent runs). Production hashes identical to
  installed-source-manifest-before-security-rework.json
  (PhaseExecutor 71E0CF39..., ledger 341022A1..., plan-tools
  108E7638..., parallel helper B67B714D9...). Only the observation
  test file changed (A5A63C19 -> D8F6151B) plus the new gateway test
  file (F1FD4946...). Test-only rework CONFIRMED; no production
  source changed for R1/R2.
Final gates 21714: reviewer-final-gates.json now TERMINAL, 13/13
  entries exit 0 (build + 10 core + 2 supplemental). Supersedes the
  'still live' caveat in the consultation request.

## ROOT CAUSE (why my R1b was over-broad)
Workspace containment is owned by the ToolService gateway
(path_outside_workspace), not by the observation-shape predicate.
The shape layer correctly validates shape (traversal / empty /
ambiguous); rejecting every absolute path there would break
legitimate runtime-resolved absolute paths inside the workspace and
diverge from read_file's existing contract. The delivered evidence
is stronger than my R1b: real-gateway refusal of outside reads PLUS
a positive inside-absolute control proving no over-blocking. The
security property (no outside read through the observation path) is
proven at the layer that owns it.

## PROPOSAL ERRORS (none in rework; my own prior errors corrected)
No errors found in the R1/R2 rework itself. Three of MY prior review
claims were wrong and I accept Codex's factual corrections:
1. Archived snapshot PhaseExecutorTool.ts:2343 has `||`; candidate
   :2343 has `??`. The `??` fix was the real empty-mode repair. My
   elimination ('gate was already ??, helper must have dropped falsy
   modes') was incorrect. The helper passes mode verbatim.
2. reviewer-boundary-green.json 29/29 and reviewer-final-regression
   .json 275/275 (15 suites) on the repaired source PREEXISTED my
   review. My 'no green run until this review' claim was incorrect.
3. Old-13-gates staleness: final-source run 21714 is now terminal
   13/13 exit 0 (verified above), closing that caveat.

## SIMPLER ALTERNATIVES (considered, rejected)
- Treat shape-level absolute rejection as still required: REJECTED.
  Redundant with gateway containment; would over-block legitimate
  paths and fork the read_file contract.
- Rerun all 13 gates after R1: NOT REQUIRED. Zero production bytes
  changed; focused 40 + typecheck + manifest revalidation suffice.
  Any future SOURCE change voids this shortcut.

## OVERLAP WITH EXISTING WORK
- NVIDIA dirty main producer/logging hunks: preserved (main
  untouched, verified read-only). No overwrite.
- Muse c71f6d81 gate / live-run contract: correctly NOT imported;
  only the decided explicit-false + focused/affected formula is
  installed (re-verified unchanged from INSTALLED-001 review).
- V5 strict-ledger/resume/parallel batches: preserved; install diff
  remains additive (production hashes stable across rework).

## CONFLICT / REGRESSION RISKS
- None introduced by this test-only rework. Production behavior
  bytes are identical to the already-reviewed empty-mode repair.
- Residual known risk (unchanged, out of scope): 275-regression
  covers the previous 29 observation cases, not the new 5 shape +
  6 gateway cases; acceptable because focused 40 covers them and no
  source changed. Next source-touching batch should fold them into
  the combined regression.

## MAINTAINABILITY / SECURITY IMPACT
Positive. Trust boundary preserved on both axes: unknown flag AND
unknown/empty mode fail closed; planner labels cannot fabricate
intermediate status or weaken a final gate; outside reads are
refused by the real gateway with the workspace_required ->
unauthorized correction matching actual source behavior. No new
attack surface, no policy bypass, no production patch.

## REQUIRED TESTS (rework closure)
All satisfied: 34-case observation suite (incl. 5 new shape cases)
  PASS; 6-case real-gateway suite PASS; manifest 13/13 MATCH;
  production-unchanged proven; final gates 21714 terminal 13/13;
  typecheck exit 0 (owner + independent). No weakened assertions.

## REAL JOE UAT (required, still BLOCKED, unchanged)
No new UAT from this test-only re-review. Backend refresh approval
still unanswered; browser click/keyboard delivery fails even on a
static non-Joe fixture (owner probe browser-input-transport-probe),
so the interaction blocker is environmental, not JoeUI-specific.
When unblocked: fresh unseen UI prompt through real :5002 showing
intermediate read_file observation accepted AND final functional
verification executed; intermediate receipt provably not final
proof. No product PASS, no main authorization, no GitHub claim
from fixtures.

## ROLE / OWNERSHIP RECOMMENDATION
- REWORK_OWNER CODEX: done for R1/R2 (commit fdad5955 local only).
- RE-REVIEW_OWNER MUSE: complete, ACCEPT (this response).
- INDEPENDENT_CRITIQUE NVIDIA: installed review still pending;
  required before any integration decision.
- INTEGRATION_OWNER CODEX: conditional on NVIDIA installed review
  + current-main hunk reconciliation + authorized :5002 UAT.
- No competing implementation. No main overwrite. No runtime
  refresh without explicit approval.

## REVIEW PROVENANCE
- Manifest + before-security manifest + green/final JSONs/logs:
  D:\Joe\coordination\team\verification\phase-observation-mode-20261001\
- Snapshot: D:\Joe\coordination\team\snapshots\observation-empty-mode-20261001-085552\
- Candidate files read: phase-output-observation.test.ts,
  observation-read-gateway-security.test.ts, PhaseExecutorTool.ts
  (:2343, :2361-2364), ToolService.ts (:338, :764-771).
- Independent runs: D:\Joe\muse-worktree\tmp\joe-muse-rereview\
- Response file: D:\Joe\muse-worktree\tmp\team-consultation\PHASE-OBSERVATION-REWORK-001-MUSE.response.md
- Note for importer: set shared consultation STATUS=REVIEWED_BY_MUSE,
  POSITION=ACCEPT_NARROW_TEST_ONLY_REWORK, RECOMMENDATION=APPROVE
  from this exact response. Do not invent beyond it.
