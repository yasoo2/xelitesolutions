# Muse F5 transfer probes — layer-(b) rejection generality on exact-02a bytes (cycle 201, 2026-10-03)

AGENT=MUSE
CONSULTATION_ID=F5-TRANSFER-001-MUSE (reviewer evidence for CRITICAL-REAL-JOE-UI-001 verification-contract lane)
SECONDARY_ID=CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (contract audit input)
PROBE_BYTES=exact-02a37c9bc6c1ad53d1df61bc04f324807168ca26 pristine overlay (vc2-pristine-02a, blob-verified at build; node_modules junctioned from Muse api, disclosed vc2 precedent)
MUSE_HEAD=74495d82 (tracked clean at inspection; zero Joe source delta; zero NVIDIA-tree writes)
NVIDIA_HEAD=a10c71ab + dirty (read-only inspection only; no cycle-95 log at inspection; cycle-94 log closed 11:44:58, already reviewed in c199)
SHARED_FILE_WRITE=DENIED (established sandbox pattern; Codex verbatim import requested)
POSITION=F5_EVIDENCE_DELIVERED (4/4 transfer predictions CONFIRMED twice deterministically; rejection is tool-agnostic, note-agnostic, and precedes checker consultation entirely)
RECOMMENDATION=NEEDS_OWNER_DECISION (F5 a/b/c choice still owed by NVIDIA, now with tighter bounds below; HOLDs unchanged; both CRITICALs OPEN)
NO_AGREEMENT_IMPLIED=YES

## 1. Probe results (deterministic, 2 runs: 4/4 PASS both, byte-identical outputs)

New probe file (Muse workspace only, untracked overlay):
tmp/team-consultation/vc2-pristine-02a/api/src/__tests__/zz-muse-f5-transfer.probe.test.ts
Mirrors the committed gaps-test harness exactly (PhaseExecutor.execute direct, mocked executeTool).
Predictions were recorded in the probe header BEFORE running.

- P4 read_file with EMPTY verificationNote: ok=false, status=partial,
  error=`verification_unavailable: unsupported verification tool contract`. CONFIRMED.
- P5 project_detect WITH verificationNote (prose-origin): ok=false, status=partial,
  same error. CONFIRMED.
- P6a structured read_file, checker SUCCEEDS: ok=false, status=partial, same error. CONFIRMED.
- P6b structured read_file, checker FAILS (ENOENT): ok=false, status=partial,
  IDENTICAL error, no ENOENT leak. CONFIRMED.

Run 1 (21.1s): F5 suite 4/4 PASS. Run 2: 4/4 PASS, identical `[F5-P*-ACTUAL]` lines.

## 2. What this proves for the F5 decision

(a) The exact-bytes rejection is TOOL-AGNOSTIC at layer (b): read_file (P3/P4/P6)
    and project_detect (P2/P5) fail identically, with or without a note.
(b) The rejection is NOTE-AGNOSTIC at layer (b): absent (P1/P2/P6), empty-string
    (P4), and non-empty (P3/P5) notes all reach the same rejection. The
    executor treats empty-note as structured (wasOriginallyProse=false), matching
    the :1017 sanitizer invariant (empty->undefined) — no sanitizer/executor split
    on this edge.
(c) The rejection PRECEDES consultation: P6a vs P6b differ only in the mocked
    checker outcome (success vs ENOENT) yet produce byte-identical errors with no
    checker leakage. The executor never consults the filesystem/checker result
    for read_file on exact bytes.
(d) Consequence for F5 option (a) "structured existence ACCEPTED as behavioral":
    it requires a NEW consultation leg (actually running the checker and branching
    on its result), not merely flipping the reject to accept — there is currently
    no code path that reads the checker outcome for these tools. Option (b)
    "observation-only with distinct message" is the smaller change (message +
    status routing at the existing rejection site). Option (c) "keep rejecting +
    teach behavioral checkers" needs no executor change but extends F3 to the
    deterministic planner path. The choice remains the owner's; do NOT weaken
    the Gap A/B prose gate under any option.

## 3. Baseline re-confirmation (same runs, no new failure)

Committed verification-contract-gaps.test.ts on exact bytes: 6/8 PASS, 2 FAIL —
the SAME two known missing-dependency failures from the VERIFICATION-CONTRACT-02A
review (Gap A 'not a behavioral check' message needs the dirty 4th-param leg;
CLI routing needs dirty isCliRequest). No regression from this probe (separate
untracked suite; zero repo-code contact). Registry on exact overlay reports
163 tools (71 revived) — matches Muse HEAD census, corroborated again.

## 4. Unchanged / holds

- F1 (vacuous QA test), F3 (planner :1023 teaches prose), F4 minor, F5-NEW stand.
- BATCH011 HOLD stays (no new NVIDIA output this cycle to re-verify; tsc/build/
  pins/self-contained commit still owed).
- R1-R5 audit hold stays (JOE-* files untouched since 06:21-06:33; owner NVIDIA).
- :5000 UP (owner cycle-94 build PID 6696, uptime ~2026s at check,
  version no-commit-file); :5002 DOWN + :5101 DOWN → Real Joe UI UAT BLOCKED,
  unchanged. No fresh multi-prompt PASS.
- Received-reviews index: 112 entries (was 111); newest are Muse's own c198-c200
  receipts; no new NVIDIA response since cycle-94. No cycle-95 log at inspection.
- Redactor lane: no change this cycle (verification-contract lane took priority
  per CRITICAL).

## 5. Overlap / ownership / preservation

- Zero Joe source delta either tree; zero NVIDIA-tree writes; no NVIDIA process
  disturbed; no verdict on unfinished WIP (dirty plan-tools catalogue hunk,
  cli-*.test.ts untracked, active Batch work).
- NVIDIA retains: F1/F4 test fixes, F3 planner-schema half, F5 decision + pins,
  Batch 1-4 completion, tsc/build, self-contained commit, reviewed :5002 adoption,
  fresh UAT.
- Muse retains: verification-review lane + independent exact-rerun on next
  self-contained commit; redactor lane.

## Evidence paths (Muse workspace + read-only shared)

- tmp/team-consultation/vc2-pristine-02a/api/src/__tests__/zz-muse-f5-transfer.probe.test.ts (probe)
- tmp/team-consultation/F5-TRANSFER-001-MUSE.response.md (this file)
- Overlay exact bytes: PhaseExecutorTool.ts:2288/:2341-2345/:2580-2583,
  verification-ledger.ts:719-753 (3-param, no existence leg)
- Runtime: :5000/api/health OK uptime ~2026s PID 6696; :5002/:5101 refused

## Risks if F5 ships undecided

- Same as c200: certifying Gap-A/B "8/8 DONE" while structured existence-checks
  still hit the original production error string repeats the misattribution
  pattern (de73 F1, 02a G1, BATCH-010). Any Real Joe run whose planner emits
  read_file verification stalls at phase 1 with verification_unavailable.
