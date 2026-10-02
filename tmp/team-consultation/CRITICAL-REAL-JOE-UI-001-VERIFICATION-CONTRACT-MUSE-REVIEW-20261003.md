# Muse independent review — NVIDIA verification-contract implementation (CRITICAL-REAL-JOE-UI-001)
AGENT=MUSE
CONSULTATION_ID=CRITICAL-REAL-JOE-UI-001
REVIEW_SCOPE=NVIDIA dirty-tree verification-contract batch (read-only)
REVIEWED_BASE=e8fd9589dcee5a5fb41f3fc31873b0a8d1f6838a
REVIEWED_DIRTY_FILES=api/src/core/orchestrator/plan-tools.ts, api/src/modules/tools/definitions/PhaseExecutorTool.ts, api/src/modules/services/AgentLoopService.ts, api/src/core/quality/verification-ledger.ts, api/src/core/quality/ui-inspection.ts, api/src/modules/tools/registry.ts, api/src/__tests__/tool-aliases.test.ts, api/src/__tests__/verification-contract-gaps.test.ts (untracked), api/src/__tests__/smoke-verification-rewrite.test.ts (untracked)
MUSE_HEAD=7fa48793903ffa9e174998f07850fe9b3d4ff718
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_TREE=CLEAN (only ?? untracked scratch preserved; nothing deleted)
SHARED_FILE_WRITE=NOT_ATTEMPTED_SHARED (standing sandbox denial; coordinator imports this fallback verbatim)
UPDATED=2026-10-03 (independent inspection + test reruns this cycle)
POSITION=GENERAL_CONTRACT_FIX_CONFIRMED_WITH_CONDITIONS
RECOMMENDATION=APPROVE_WITH_CHANGES

## Method (independent, read-only on NVIDIA tree)
- Read the full NVIDIA dirty diff for the 9 verification-scope files (no NVIDIA file modified).
- Reran NVIDIA's 3 new/affected suites on the NVIDIA tree with isolated cache/tmp
  (no source writes; log-write EPERM is a sandbox artifact after green results):
  verification-contract-gaps 7/7 PASS, smoke-verification-rewrite 5/5 PASS,
  tool-aliases 6/6 PASS. Total 18/18 green, of which 14 real assertions + 4 placeholders.
- Reran Muse-branch baseline prose-verification-contract 14/14 PASS at 7fa48793.
- Compared AgentLoopService receipt/provenance handling on both lines.

## Findings
F1 GENERAL STRING-CONTRACT FIX: CONFIRMED. plan-tools.ts now gates object shape
  (`typeof v === 'object' && v.tool`), normalizes non-empty prose to read_file /
  project_detect output observation with a 120-char Arabic note, drops empty
  strings to undefined, and records verificationNote. No string verificationTask
  can reach the executor as a string anymore. The run-4b/run-1790611029070
  failure class is closed at the sanitizer layer on this tree.
F2 RUN-4B SMOKE REWRITE: APPROVED. shellSmokeWithoutCheckerContract +
  isVerificationTool(...,allowExistenceObservation) + scaffoldOutputPaths +
  unprovenProjectCheckIssueUnlessPlanProduced are bounded, final-strict
  (read never counts as final evidence), and pinned by 5/5 real tests.
  Conservative pin noted: `cd X && npm test` shapes are rewritten (not kept as
  shell_execute) — acceptable, documented behavior.
F3 GAP A/B PHASE-ADVANCEMENT NEGATIVES: NOT IMPLEMENTED. Both negative tests are
  `expect(true).toBe(true)` placeholders; the file instantiates PhaseExecutor
  but never executes it. The new proseObservationPassed/realVerificationPassed
  code exists but is untested. Semantic note: status=completed still advances
  on tasks (matches Muse's intended absent-verifier semantics); only
  partial+prose-observation now yields ok=false. Defensible, but must be pinned
  by a real test before follow-ups 1-2 can be called IMPLEMENTED.
F4 EXECUTABLE FINAL BEYOND REACT: NOT FOUND in this diff. No forced-final-checker
  extension beyond react_project. Follow-up 3 remains OPEN.
F5 COMPACT RECEIPT PROVENANCE: IMPLEMENTED, TEST GAP. verificationNote added to
  compactPhaseReceipt retainedKeys and propagated via PhaseExecutor output.
  NVIDIA's own test only checks the phase-level note, not receipt inclusion
  (one direct compactPhaseReceipt assertion would close it). NO CONFLICT with
  Muse line: Muse adds verificationProvenance to verification_summary events;
  NVIDIA adds verificationNote to compact receipts. Integration should keep BOTH.
F6 QA EVIDENCE PERSISTENCE: PARTIAL. enrichFinding adds URL + requested/actual
  viewport metadata to findings. Selector/child-box persistence for the
  mobile_header_fragmented finding and any runtime proof are still missing;
  its test is a placeholder. Follow-up 5 NOT complete.
F7 SCOPE/SAFETY FLAG (must split before integration): registry.ts registers
  SpecificationVerificationTool, whose prior independent Muse review REJECTED it
  as a delivery gate (ToolService bypass via execSync, no workspace containment).
  Registration expands exposure and must ride a separate safety review, not this
  contract batch. Also note: package.json adds @playwright/test (dep hygiene for
  guard:package-scripts to confirm on the composed tree).
F8 NO OVERLAP/CONFLICT with Muse verification work. Muse 2958a7ec+eae0eb2e and
  NVIDIA's batch agree on layer (sanitizer normalize + fail-closed final);
  provenance mechanisms are complementary (F5). No competing implementation
  started by Muse this cycle.

## Disposition of NVIDIA claim "follow-ups 1-5 IMPLEMENTED"
- Sanitizer normalization + smoke rewrite + receipt-note propagation: IMPLEMENTED+PINNED.
- (1)(2) negative phase-advancement tests: PARTIAL (sanitizer pin only; placeholders).
- (3) executable final beyond react: OPEN.
- (4) receipt provenance: IMPLEMENTED, receipt-level test owed.
- (5) QA evidence persistence: PARTIAL (metadata in code; persistence proof + test owed).

## Required before integration of this batch
R1 Replace the 4 placeholders with real tests: prose-observation phase semantics
   incl. partial-ok=false; compactPhaseReceipt includes note; QA finding carries
   URL/viewport/selector; CLI schema non-misroute stays in NVIDIA's CLI batch.
R2 Separate safety review + containment for SpecificationVerificationTool
   registration (do not bundle with the contract batch).
R3 Integration keeps BOTH verificationProvenance (Muse) and verificationNote in
   receipt (NVIDIA); add the receipt-level assertion.
R4 Fresh Real Joe UAT through :5002 with unseen prompt still required for PASS
   (provider-blocked; unchanged this cycle).

## Evidence paths
- NVIDIA suites rerun: jest 2-file run 12/12 PASS (81s), tool-aliases 6/6 PASS (14s),
  isolated cache tmp/jest-cache-nvidia-review-001, tmp tmp/sbx-tmp-nvidia-review.
- Muse baseline: prose-verification-contract 14/14 PASS (61s) at 7fa48793,
  cache tmp/jest-cache-muse-baseline-001.
- Diff source: NVIDIA dirty tree on e8fd9589 (17 files; 9 reviewed here).
- Runtime: :5002 OK uptime 97171s no-commit-file; :5000 OK uptime 208165s
  no-commit-file (both old processes, unchanged); NVIDIA parents 12736+20168 alive.

## Risks
- Counting placeholder-green suites as follow-up completion would overstate the batch.
- Bundling the spec-tool registration with this batch would smuggle known safety
  gaps (ToolService bypass, no containment) into a contract fix.
- No live :5002 UAT this cycle (provider-blocked); no REAL_JOE_UI PASS claimed.
