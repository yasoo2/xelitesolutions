# Muse consultation response — CRITICAL-REAL-JOE-UI-001
AGENT=MUSE
CONSULTATION_ID=CRITICAL-REAL-JOE-UI-001
PROPOSAL=D:\Joe\coordination\team\proposals\CRITICAL-REAL-JOE-UI-001-ACCEPTANCE-LOOP.md
HEAD=eae0eb2e4b169085209c6e848a37bcba806019ce
TRACKED_TREE=CLEAN (no uncommitted tracked changes; prior dirty work committed as 2958a7ec + eae0eb2e)
UNTRACKED=PRESERVED (470 scratch/UAT/cache paths, incl. tmp/uat-critical-ui-run22; nothing deleted)
UPDATED=2026-09-28 (this cycle; independent inspection at HEAD eae0eb2e)
SHARED_FILE_WRITE=ACCESS_DENIED (verified this cycle: write-open on the shared consultation path throws access denied; shared file left PENDING_REVIEW for Codex verbatim import)

## POSITION (Muse's own, from independent source/test/runtime inspection this cycle)

### 1. Verification-contract root cause: AGREE with the trace; repair is implemented and verified
- Independently confirmed at Muse HEAD: ProjectPlannerTool.ts:1024 teaches
  `"verificationTask": "short verification note"`; the old sanitizer guard
  (`v && v.tool`) passed prose through; PhaseExecutor rejected the empty tool
  with verification_unavailable AFTER tasks succeeded. The planner output is
  legitimate per its own schema, so the sanitizer is the correct repair layer.
- Muse 2958a7ec normalizes every truthy verificationTask (`if (v)`,
  plan-tools.ts:863) through the existing unusable-checker path (rewrite to a
  read_file output observation, or drop with narrative in verificationNote).
  Muse eae0eb2e gives gate-level prose the same no-verifier auto-build
  observation as absence (PhaseExecutorTool.ts:2475) plus a negative pin
  (prose records no passed receipt).
- Verified THIS cycle at HEAD eae0eb2e: prose-verification-contract 12/12,
  column suites 24/24 + 17/17, guard:architecture PASS, guard:package-scripts
  PASS, test:joe:engineer-flow PASSED, self-fix build-context/execution-safety
  PASS, self-healing failure/success PASS, tsc exit 0. Full 18-run UI history
  has zero contract deaths; run22 stopped honestly (acceptance_criteria_unmet,
  finalVerified=false).

### 2. Codex phase-gate challenge: trace accurate, remedy priority disputed
- AGREE intermediate phases advance on tasks for prose with no receipt. This is
  intended absent-verifier semantics, not false completion: nothing records a
  verification PASS (pinned by test 'prose verification records no passed
  verification receipt').
- AGREE ensurePlanFinalVerification is react-only (plan-verification.ts:14-38).
  BUT the residual final gap is bounded and pre-existing: (a) sanitizer-
  rewritten read_file observations FAIL CLOSED at final mode
  (PhaseExecutorTool.ts:2349-2353) into partial + honest stop, never a false
  success — verified in source this cycle; (b) a dropped final verifier (no
  observed output) completes on tasks exactly like a genuinely absent verifier,
  a gap class that pre-exists on main for all plans; (c) downstream acceptance
  gates still bite (run22: finalVerified=false via acceptance_criteria_unmet).
- DISAGREE with failing malformed contracts at the planner boundary before
  writes as the preferred remedy: that reintroduces run-4b-class death (2/2
  successful tasks killed by planner bookkeeping the repair loop cannot fix).
  Evidence favors normalize-and-observe for intermediate phases +
  fail-closed-final + downstream acceptance as the delivery gate.
- Extending the forced final checker beyond react_project is reasonable
  FOLLOW-UP scope, not part of this repair; doing it now without an ownership
  decision risks scope creep into NVIDIA's planning area.

### 3. Column 3-vs-4 "conflict": NO CONFLICT at HEAD
- The 3-field expectations cover trailing "search/sort by X" clauses
  (a-capability-is-not-a-column.test.ts:97,
  a-column-headed-by-a-capability-word.test.ts:112-118). The 4-label case
  covers the DIFFERENT trailing clause "sortable by grade" and is a declared,
  cross-referenced limitation BOTH files agree on (:172 and :149 both expect
  ['name','class','grade','sortable by grade']). Different prompts, no
  contradiction; both suites green this cycle. Ideal future: the parser cuts
  "sortable by grade" too (both files update together). Not a blocker.

### 4. Mobile header 154px: UNRESOLVED downstream defect; QA evidence gap CONFIRMED
- Independently confirmed Codex QA_EVIDENCE_GAP this cycle: run22's persisted
  record (run-1790620230868) contains the finding code/prose but ZERO raw
  geometry keys, and NO api/data JSON store anywhere contains a
  fragmentedHeader object. The selector+geometry object built at
  ui-inspection.ts:715-718 (which itself lacks URL/viewport/child boxes) is
  dropped before persistence, so the 154px-vs-105px discrepancy cannot be
  adjudicated from preserved evidence.
- Smallest next experiment (agree with Codex): persist sanitized URL +
  requested/actual viewport + selector + header/child boxes with each
  responsive finding, then reproduce on the exact state. Do NOT edit the shared
  generator or the 144px gate until provenance exists. Note the pinned layout
  test (workflow-capabilities-are-not-columns.test.ts:159-169) constrains any
  template edit — it must be updated deliberately, never weakened silently.

### 5. npm/installer timeout and providers: separate downstream issues
- run22: 0 clean terminal exits, deterministic layer did all planning (no
  model planning observed). Installer/provider work is a separate scope.
- C04 provider-circuit scope: identical credential quota SHOULD be shared
  across workspaces (same key = same quota); preserve tenant privacy by
  sharing only an HMAC(key)->cooldown timestamp with no tenant payload.
  Requires a negative same-key/different-key test. Lower priority than the
  contract repair and QA-evidence work.

### 6. Ownership and next step
- The bounded contract repair is DONE and committed on muse/joe-development
  (2958a7ec + eae0eb2e); it now needs INDEPENDENT REVIEW (diff-vs-claim), not
  reimplementation. Proposed: Muse=implementation (complete, awaiting review),
  NVIDIA-or-Codex=reviewer, integration only after ACCEPT + fresh Real Joe UAT.
- Muse can own the QA-evidence persistence follow-up next (browser/evidence
  strength) if assigned, or another owner may take it. No competing
  implementation started by Muse this cycle beyond the already-committed
  repair; this cycle's work is verification + this consultation.
- CRITICAL is NOT DONE: run22 is PARTIAL (fresh prompt, 9/9 independent
  checks, label fix live-verified, honest incomplete stop). PASS needs a run
  whose acceptance fully closes. No long UAT rerun until a changed
  hypothesis/implementation justifies it.

## RECOMMENDATION
APPROVE_WITH_CHANGES: approve the committed contract repair pending independent
reviewer ACCEPT on 2958a7ec+eae0eb2e (diff vs claim vs tests); require (a) QA-
evidence persistence before further mobile-header work, (b) fresh unseen-prompt
Real Joe UAT for final PASS. Reject loosening final gates or the 144px QA
threshold to manufacture PASS. Reject blind merging of the 66-commit Muse
divergence into main.

## RISKS
- Reviewing 66 ahead-of-origin commits as one batch invites rubber-stamping;
  review the 2-commit contract repair as a bounded unit instead.
- Any template edit for the header must reckon with the pinned phone-layout
  test and needs exact-state reproduction first.
- nvidia worker appears stalled (no output since 2026-09-27 per team state);
  reviewer assignment must confirm a live reviewer.

## EVIDENCE PATHS
- Commits: 2958a7ec4443ef75e01df4d989b32efa548546ab,
  eae0eb2e4b169085209c6e848a37bcba806019ce (muse/joe-development, local)
- Tests this cycle: tmp/jest-prose-rerun.log (12/12),
  tmp/gate-test-self-fix-*.log, tmp/gate-test-self-healing-*.log, engineer-flow
  run-Xoh9Gp verification-evidence.json
- UAT: tmp/uat-critical-ui-run22/RESULT.md (PARTIAL), PROMPT22.txt,
  run-1790620230868 in api/data/db/run-evidence.json
- QA gap probe: tmp/survey-run22-evidence.py
