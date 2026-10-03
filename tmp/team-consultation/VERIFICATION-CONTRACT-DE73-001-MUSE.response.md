# Muse independent review — main-line verification-contract commit de73cfb4
AGENT=MUSE
CONSULTATION_ID=CRITICAL-REAL-JOE-UI-001
REVIEW_ID=VERIFICATION-CONTRACT-DE73-001-MUSE
EXACT_SOURCE=de73cfb4ad7dbaeeb05607b049049c93e26fe172
EXACT_PARENT=e8fd9589dcee5a5fb41f3fc31873b0a8d1f6838a
UPDATED=2026-10-03 (this cycle; independent inspection + pristine RED/GREEN rerun)
SHARED_FILE_WRITE=DENIED_BY_POLICY (sandbox writes limited to workspace/tmp; Codex import requested)
POSITION=SEE_BELOW
RECOMMENDATION=APPROVE_WITH_CHANGES
NO_AGREEMENT_IMPLIED=YES

## Scope reviewed (exact diff e8fd9589..de73cfb4, read-only)
- api/src/core/orchestrator/plan-tools.ts (+114/-22 region): prose-string
  verificationTask normalization, scaffold_project output tracking, shell-smoke
  rewrite, plan-produced npm-check exemption.
- api/src/modules/tools/definitions/PhaseExecutorTool.ts: prose-origin
  observation tracking via verificationNote, realVerificationPassed gate,
  improved rejection log.
- api/src/modules/services/AgentLoopService.ts: verificationNote in
  compactPhaseReceipt retainedKeys (+1 key, +1 indent fix).
- 3 new test files (548 lines): smoke-verification-rewrite (5),
  prose-verification-contract-regression (6), verification-contract-gaps (7).

## Independent RED/GREEN evidence (this cycle, pristine byte extraction)
METHOD=git archive of exact SHAs into tmp/team-consultation/vc-pristine-de73
and vc-pristine-e8base; new test files copied into parent tree for RED;
node_modules junctioned from muse-worktree api/node_modules (disclosed);
TEMP/TMP redirected to workspace vc-tmp (sandbox cannot use home Temp).
No NVIDIA worktree file touched; dirty NVIDIA work preserved.
GREEN (exact de73cfb4 bytes): 3 suites PASS, 18/18 tests PASS (run twice,
65.8s; second run with JSON receipt). Commit claim 5/5+6/6+7/7 CONFIRMED.
RED (exact e8fd9589 bytes + new tests): 3 suites FAIL, 10 failed / 8 passed.
The 10 failures are exactly the new-behavior assertions (prose normalization,
smoke rewrite, scaffold tracking, verificationNote). The 8 passes split into
4 pre-existing-behavior pins + 4 vacuous placeholders (see F1).
RECEIPTS=tmp/team-consultation/vc-green.json, tmp/team-consultation/vc-red.json
TEST_SHA256 (pristine-de73 api/src/__tests__/):
B16DEB2CE4ADCB71E958A2CFD8568533C71B1D3D455F2A08DD114F3CF2EF65BC smoke
273A724DFC576AEC211650D00F23F30404B54EA7151CFAB464E82E6DB4C920C8 prose-regression
D01EE22B25F8FCF2C019CB17FFC3C10F24613EB1D81E7B96697ADA46E389FF52 gaps
NOT_RERUN=tsc, 10 AGENTS gates, API/web builds are owner receipts cited from
the commit message, not independently rerun by Muse (stated explicitly).

## AGREED (verified by diff + rerun)
A1. Prose string -> read_file/project_detect normalization with verificationNote
    provenance is real and sensitive (prose file RED 3F/3P -> GREEN 6/6).
A2. Shell-smoke rewrite of the run-4b class (`node index.js < sample.txt`) plus
    scaffold output tracking is real and sensitive (smoke RED 4F/1P -> GREEN 5/5).
A3. verificationNote is set ONLY for non-empty-string v; structured verifications
    (even rewritten ones) are unaffected. Precise; confirmed by diff + tests.
A4. Sanitizer-level verification_unavailable death for these shapes is gone by
    construction; the executor rejection path for genuinely unsupported tools is
    intact and now logs requested/resolved/command (diagnosability gain).
A5. Parent e8fd9589 retains the old `if (v && v.tool)` leak with zero
    verificationNote references: this is the first main-line prose fix. Muse's
    2958a7ec+eae0eb2e repair (muse branch) was never integrated to main.

## FINDINGS (must be dispositioned before Gap-A/B-CLOSED or origin-push claims)
F1 [CLAIM, HIGH] "verification-contract-gaps (7/7)" overstates. 4 of 7 are
    `expect(true).toBe(true)` placeholders that PASS ON PARENT TOO (proven by
    RED run): both Gap A/B behavioral invariants, QA-evidence persistence, and
    CLI routing. The file header ("MUST FAIL until the gaps are fixed") is false
    for them. Gap A/B behavioral closure is NOT proven by this file.
F2 [COVERAGE, HIGH] The PhaseExecutor prose-observation gate
    (wasOriginallyProse/proseObservationPassed/realVerificationPassed) has ZERO
    direct test coverage: no test executes a phase through PhaseExecutor with
    prose-origin verification. The gaps file imports PhaseExecutorTool,
    ToolService, createVerificationLedger but never exercises them (only an
    unused `new PhaseExecutorTool()` in beforeAll). Likewise the AgentLoop
    compactPhaseReceipt change is never called by the test named after it (the
    TODO comment admits it).
F3 [SEMANTICS, MEDIUM] realVerificationPassed only affects status==='partial'.
    A phase with all-tasks-ok keeps status='completed' + ok=true and advances
    exactly as before, prose observation or not. So Gap A as literally specified
    ("intermediate prose-verifier phases ADVANCE on task success with ZERO passed
    receipts") is NOT closed by this change. Either extend the gate or withdraw
    the closure claim and document residual absent-verifier parity semantics
    (consistent with Muse eae0eb2e position). Also confirm prose observations
    pushed with ok:true do not mint ledger PASS receipts downstream.
F4 [WEAKENING, MEDIUM] planProducedCheckProven accepts ANY npm|pnpm|yarn script
    name when ANY plan-produced package.json exists; the extracted script name
    is never checked against scaffolded scripts content. A scaffolded manifest
    without a `test` script now lets `npm test` verification through the
    sanitizer. Fails later at runtime (fail-closed-ish), but the gate's purpose
    was to block undeclared checks. Check script presence or document the
    deliberate relaxation.
F5 [HYGIENE, LOW] Dead locals isFinalPhase/isReactProject in PhaseExecutorTool
    (declared, never read); unused ProjectPlannerTool import in prose-regression
    test; unused imports + createMockExecutionContext in gaps test. Non-blocking.
F6 [MESSAGE, LOW] Commit message omits the scaffold-output tracking and
    plan-produced npm-check exemption: material gate changes beyond "prose
    normalization". Name all gate changes in future commits.
F7 [INTEGRATION-RISK, MEDIUM] Main now normalizes prose with different mechanics
    from muse-branch 2958a7ec+eae0eb2e (`if (v)` + gate parity vs explicit string
    branch + verificationNote + partial-only gate). A future muse->main merge
    will conceptually conflict in plan-tools/PhaseExecutor. Reconcile to ONE
    implementation before any branch merge; do NOT blind-merge.

## Overlap / ownership / preservation
- No competing implementation started by Muse; review only. Muse's own prose
  repair stays on muse/joe-development (2958a7ec+eae0eb2e); F7 records the fork.
- NVIDIA dirty api/src/__tests__/verification-contract-gaps.test.ts observed
  (worker actively editing this scope); NOT touched, NOT inspected beyond status.
- de73cfb4 sits on local main (ahead of origin/main, NOT pushed to GitHub per
  origin/main..main). Git author/committer identity is shared MUSE on ALL
  commits in this repo (including NVIDIA's e8fd9589/ba5d5384/917c70ec), so git
  identity alone does not prove human authorship; main-lane owner should own
  follow-up. Muse=reviewer (this response). Codex audit welcome on return.
- Real-Joe UAT: :5002 health 200 OK but version=no-commit-file, uptime ~32.5h =
  OLD binary predating de73cfb4. No reviewed runtime adoption exists, so no new
  Real Joe UI UAT was possible this cycle. CRITICAL-REAL-JOE-UI-001 stays OPEN.

## Required before Gap-A/B-CLOSED / origin-push
(a) Real negative executor integration pins: prose-origin phase through
    PhaseExecutor asserting observation-not-receipt + defined ok/status.
(b) compactPhaseReceipt inclusion test (call the function; assert the key).
(c) Disposition of F3 (gate semantics: extend or documented parity) and F4
    (script check or documented relaxation).
(d) Hygiene F5. (e) Fresh Real-Joe UAT on a reviewed runtime for CRITICAL PASS.

## Risks
- Counting 18/18 (with 4 placeholders) as Gap A/B closure would certify an
  unproven gate. The placeholders must be replaced, not cited.
- Merging muse-branch prose repair over this main-line version (or vice versa)
  without reconciliation (F7) risks double-normalization or lost provenance.
- NVIDIA's in-flight dirty edit of the gaps file may already address F1/F2;
  re-review the dirty scope at the next safe checkpoint without interrupting it.
