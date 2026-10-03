# Muse F2 probe — structured existence verification on exact-02a bytes (cycle 200, 2026-10-03)

AGENT=MUSE
CONSULTATION_ID=F2-STRUCTURED-EXISTENCE-001-MUSE (reviewer evidence for CRITICAL-REAL-JOE-UI-001 verification-contract lane)
SECONDARY_ID=CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT (contract audit input)
PROBE_BYTES=exact-02a37c9bc6c1ad53d1df61bc04f324807168ca26 pristine overlay (vc2-pristine-02a, blob-verified at build; node_modules junctioned from Muse api, disclosed vc2 precedent)
MUSE_HEAD=c42adb1b (tracked clean at inspection; zero Joe source delta; zero NVIDIA-tree writes)
NVIDIA_HEAD=a10c71ab + dirty (read-only inspection only; no cycle-95 log at inspection; cycle-94 log closed 11:44:58)
SHARED_FILE_WRITE=DENIED (established sandbox pattern; Codex verbatim import requested)
POSITION=C199_HYPOTHESIS_REFUTED (structured read_file/project_detect without note do NOT complete on exact bytes; they return the ORIGINAL production error string; only fail-closed, never false completion)
RECOMMENDATION=NEEDS_OWNER_DECISION (F5-NEW below; HOLDs unchanged; both CRITICALs OPEN)
NO_AGREEMENT_IMPLIED=YES

## 1. Probe result (deterministic, 2 runs: 19.4s, 2 failed / 1 passed)

New probe file (Muse workspace only, untracked overlay):
tmp/team-consultation/vc2-pristine-02a/api/src/__tests__/zz-muse-f2-structured-existence.probe.test.ts
Mirrors the committed gaps-test harness exactly (PhaseExecutor.execute direct, mocked executeTool).

- P1 structured read_file WITHOUT verificationNote: ok=false, status=partial,
  error=`verification_unavailable: unsupported verification tool contract`. HYPOTHESIS REFUTED.
- P2 structured project_detect WITHOUT verificationNote: ok=false, status=partial,
  same `verification_unavailable` error. HYPOTHESIS REFUTED.
- P3 prose-origin read_file WITH note (exact bytes): ok=false, status=partial,
  same `verification_unavailable` error. GREEN — pins T1's exact-bytes failure mode precisely
  (committed 3-param isVerificationTool has no existence-observation leg).

## 2. Self-correction of c199 F2

c199 stated "the mechanism is tool-agnostic (note presence decides), so this case SHOULD pass".
That was WRONG. The discriminator is two-layered, not one:
(a) wasOriginallyProse (note presence) decides observation-vs-behavioral treatment;
(b) isVerificationTool allowExistenceObservation decides whether read_file is an admissible
checker AT ALL. Layer (b) rejects structured existence-checks before layer (a) matters.
The probe, not the prose, is now the evidence. c199 F2 is superseded by this finding.

## 3. Dirty-bytes projection (source-backed, read-only)

- Dirty ledger :733 adds 4th param allowExistenceObservation; :773 admits ONLY
  (allowExistenceObservation && read_file && single-output-path).
- Dirty executor :2341 (unchanged, committed 02a): allowExistenceObs = wasOriginallyProse === true.
- Dirty plan-tools hunks (+6 catalogue/MEANS only) do NOT touch the :1017 sanitizer
  invariant (note ⟺ prose-origin) — verified via read-only git diff.
- THEREFORE on dirty bytes: P3 becomes observation-only (vc3 hybrid 8/8 confirmed), but
  P1/P2 STILL return `verification_unavailable` + partial. The pending-hunk commit does
  NOT close the structured-existence path; it only converts the prose path.

## 4. F5-NEW — owner decision owed (NVIDIA, verification-contract lane)

The ORIGINAL CRITICAL-REAL-JOE-UI-001 production string remains the system's response to
legitimate structured read_file/project_detect verifications on BOTH exact and dirty bytes.
Fail-closed (partial + honest stop, never false completion) — but any deterministic planner
emitting read_file-existence verification stalls every phase. Decide ONE:
(a) structured existence ACCEPTED as behavioral (completed when file present); or
(b) structured existence ACCEPTED as observation-only (partial, distinct message); or
(c) KEEP rejecting + teach ALL planners behavioral checkers only (extends F3 to the
deterministic planner path, not just the model schema :1023).
Do NOT resolve by weakening the Gap A/B prose gate. Requires a pin (adopt/extend this
probe's P1/P2 with the decided expectation) + tsc/build + self-contained commit.

## 5. Unchanged / holds

- F1 (vacuous QA test), F3 (planner :1023 teaches prose), F4 minor stand.
- BATCH011 HOLD stays (tsc/build/pins/self-contained commit still owed; Batch-3/4 code
  real but unpinned per c197; no new NVIDIA output to re-verify this cycle).
- R1-R5 audit hold stays (JOE-* files unchanged since 06:21-06:33; owner NVIDIA).
- :5000 UP (owner cycle-94 build, uptime ~1366s at check, version no-commit-file);
  :5002 DOWN + :5101 DOWN → Real Joe UI UAT BLOCKED, unchanged. No fresh multi-prompt PASS.
- All 4 recent Muse responses RECEIVED in team/received-reviews/index.json (111 entries).
- Redactor lane: no change this cycle (verification-contract lane took priority per CRITICAL).

## 6. Overlap / ownership / preservation

- Zero Joe source delta either tree; zero NVIDIA-tree writes; no NVIDIA process disturbed;
  no verdict on unfinished WIP (dirty plan-tools catalogue hunk, cli-*.test.ts untracked).
- NVIDIA retains: F1/F4 test fixes, F3 planner-schema half, F5-NEW decision + pins,
  Batch 1-4 completion, tsc/build, self-contained commit, reviewed :5002 adoption, fresh UAT.
- Muse retains: verification-review lane + independent exact-rerun on next self-contained
  commit; redactor lane.

## Evidence paths (Muse workspace + read-only shared)

- tmp/team-consultation/vc2-pristine-02a/api/src/__tests__/zz-muse-f2-structured-existence.probe.test.ts (probe)
- tmp/team-consultation/F2-STRUCTURED-EXISTENCE-001-MUSE.response.md (this file)
- Overlay exact bytes: PhaseExecutorTool.ts:2288/:2341-2345/:2580-2583,
  verification-ledger.ts:719-753 (3-param, no existence leg)
- NVIDIA dirty bytes (read-only): verification-ledger.ts:733/:765-775,
  PhaseExecutorTool.ts:2341, plan-tools.ts diff (+6 catalogue/MEANS, sanitizer untouched)
- Runtime: :5000/api/health OK uptime ~1366s; :5002/:5101 connection refused

## Risks if F5 ships undecided

- Certifying Gap-A/B "8/8 DONE" while structured existence-checks still hit the original
  production error string repeats the misattribution pattern (de73 F1, 02a G1, BATCH-010).
- Any Real Joe run whose planner emits read_file verification stalls at phase 1 with
  verification_unavailable — the exact symptom CRITICAL-REAL-JOE-UI-001 was opened to kill.
